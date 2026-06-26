/**
 * speaking-recorder-hook.js — Wraps the existing LR/TI flow (startTask /
 * startCountdown / playQuestion / showComplete) so the user's voice is
 * recorded during each response window and uploaded to Drive afterwards.
 *
 * Non-invasive: we monkey-patch the four globals after the page-level
 * <script> block has defined them. The original behavior is preserved.
 *
 * Required globals on the page:
 *   TCK_TASK       — 'lr' | 'ti'
 *   TCK_PRACTICE   — practice set number
 *   totalQuestions — used to identify the final response
 *   startTask / startCountdown / playQuestion / showComplete — page funcs
 *
 * Required script includes (in this order):
 *   js/recorder.js
 *   js/api.js
 *   js/speaking-recorder-hook.js   ← this file, loaded LAST
 */
(function(){
  if (typeof TCKRecorder === 'undefined' || typeof Api === 'undefined') {
    console.warn('[recorder-hook] dependencies missing — recording disabled');
    return;
  }
  if (typeof window.startCountdown !== 'function' || typeof window.showComplete !== 'function') {
    console.warn('[recorder-hook] page hooks missing — recording disabled');
    return;
  }

  // --- Mic check gate ---
  // First time the user enters a Speaking practice in this session, send
  // them to /speaking/mic-check.html so they grant mic permission and
  // verify the level meter BEFORE the timer-driven flow starts. This
  // avoids the jarring "permission dialog appears mid-task" UX.
  // The gate fires on DOMContentLoaded (or immediately if already loaded)
  // so the page never visibly renders for un-gated visits.
  (function gate(){
    var checked = sessionStorage.getItem('tck_mic_checked');
    if (checked) return; // '1' (granted) or 'skipped' both pass
    var here = location.pathname + location.search + location.hash;
    // Speaking pages live under /speaking/<task>/practice-N.html, so the
    // mic-check page sits at /speaking/mic-check.html — one level up.
    location.replace('../mic-check.html?return=' + encodeURIComponent(here));
  })();

  // If the gate redirected, this code never runs. If the user picked
  // "Skip recording" we still load the hook but no-op the recorder.
  var SKIP_RECORDING = sessionStorage.getItem('tck_mic_checked') === 'skipped';

  /* Per-session record/skip toggle.
     The mic-check gate above only runs once per session (once
     tck_mic_checked is set, the redirect is skipped). On the 2nd / 3rd /
     ... LR or TI practice in the same session the user might want to
     change their mind without going back to mic-check. We inject a small
     floating pill that reads the current preference, toggles it, and
     reloads the page so the recorder picks up the new SKIP_RECORDING
     value cleanly. */
  function injectRecPrefToggle(){
    if (document.getElementById('tckRecPref')) return;
    if (!sessionStorage.getItem('tck_mic_checked')) return;
    var skip = sessionStorage.getItem('tck_mic_checked') === 'skipped';
    var lang = (localStorage.getItem('tck_lang') || 'jp');
    var label = skip
      ? (lang === 'en' ? '🔕 Recording OFF' : '🔕 録音 OFF')
      : (lang === 'en' ? '🎤 Recording ON'  : '🎤 録音 ON');
    var bar = document.createElement('div');
    bar.id = 'tckRecPref';
    bar.title = lang === 'en'
      ? 'Click to toggle recording for this session'
      : 'クリックで録音 ON / OFF を切り替え（ページ再読み込み）';
    bar.setAttribute('style',
      'position:fixed;top:14px;left:14px;z-index:2147483646;' +
      'background:#fff;border:1.5px solid ' + (skip ? '#D6DAD7' : '#007646') + ';' +
      'border-radius:999px;padding:6px 14px;font-size:.78em;font-weight:600;' +
      'color:' + (skip ? '#5A6861' : '#007646') + ';' +
      'box-shadow:0 4px 12px rgba(0,0,0,.08);cursor:pointer;' +
      'font-family:Manrope,"Zen Kaku Gothic New","Noto Sans JP",system-ui,sans-serif;' +
      'user-select:none;display:inline-flex;align-items:center;gap:6px;');
    bar.textContent = label;
    bar.addEventListener('click', function(){
      var cur = sessionStorage.getItem('tck_mic_checked');
      sessionStorage.setItem('tck_mic_checked', cur === 'skipped' ? '1' : 'skipped');
      location.reload();
    });
    (document.body || document.documentElement).appendChild(bar);
  }
  if (document.body) injectRecPrefToggle();
  else document.addEventListener('DOMContentLoaded', injectRecPrefToggle);

  var recordingActive = false;
  var recStartedAt = 0;
  var recQNum = 0;
  var indicator = null;

  // Keep each question's encoded audio in memory for the duration of the
  // practice, keyed by question number: { meta, b64 }. The cross-origin
  // form-POST upload can't truly confirm success (the iframe is opaque and
  // a 30s timeout resolves success:true even if nothing arrived). After the
  // section finishes we ask the server which questions actually landed and
  // re-send any that are missing FROM THIS KEPT AUDIO — so a silent drop
  // self-heals without the learner re-recording. This is what stops the
  // "recordings stopped arriving" class of bug.
  var keptAudio = {};

  function ensureIndicator(){
    if (indicator) return indicator;
    var s = document.createElement('style');
    s.textContent = '@keyframes recPulse{0%,100%{opacity:1}50%{opacity:.25}}';
    document.head.appendChild(s);
    indicator = document.createElement('div');
    indicator.id = 'tckRecIndicator';
    // !important on display + visibility + z-index so page CSS / stacking
    // contexts can't hide the badge.
    indicator.setAttribute('style',
      'position:fixed!important;top:60px!important;right:20px!important;' +
      'display:none;align-items:center;gap:8px;padding:8px 18px;' +
      'background:#B85C3C!important;color:#fff!important;border-radius:999px;' +
      'font-size:.95em;font-weight:700;z-index:2147483647!important;' +
      'box-shadow:0 6px 20px rgba(184,92,60,.45);font-family:inherit;' +
      'visibility:visible!important;opacity:1!important;pointer-events:none');
    indicator.innerHTML = '<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#fff;animation:recPulse 1s infinite;"></span><span>REC</span>';
    (document.body || document.documentElement).appendChild(indicator);
    console.log('[recorder-hook] indicator created and appended');
    return indicator;
  }
  function showRec(on){
    var el = ensureIndicator();
    el.style.setProperty('display', on ? 'inline-flex' : 'none', 'important');
    console.log('[recorder-hook] showRec', on, '— display=', el.style.display);
  }

  // Upload one question's audio, retrying on failure (the large cross-origin
  // POST can be dropped by a flaky connection / privacy tool). The base64 is
  // kept across retries so a transient failure self-heals without re-recording.
  function uploadWithRetry(meta, b64, tries){
    tries = tries || 0;
    return Api.uploadRecording(meta, b64).then(function(res){
      if (res && res.success === false && tries < 3) {
        return new Promise(function(r){ setTimeout(r, 900 * (tries + 1)); })
          .then(function(){ return uploadWithRetry(meta, b64, tries + 1); });
      }
      return res;
    }, function(err){
      if (tries < 3) {
        console.warn('[recorder-hook] upload retry ' + (tries + 1) + ' after error:', err);
        return new Promise(function(r){ setTimeout(r, 900 * (tries + 1)); })
          .then(function(){ return uploadWithRetry(meta, b64, tries + 1); });
      }
      throw err;
    });
  }

  function uploadCurrent(qNum){
    if (!recordingActive) return Promise.resolve();
    var dur = Math.round((Date.now() - recStartedAt) / 1000);
    recordingActive = false; showRec(false);
    console.log('[recorder-hook] uploadCurrent q=' + qNum + ' dur=' + dur + 's — calling stop()');
    return TCKRecorder.stop().then(function(blob){
      console.log('[recorder-hook] q=' + qNum + ' blob size=' + (blob ? blob.size : 'null') + 'B type=' + (blob ? blob.type : 'null'));
      return TCKRecorder.blobToBase64(blob).then(function(b64){
        console.log('[recorder-hook] q=' + qNum + ' base64 length=' + (b64 ? b64.length : 0) + ' chars');
        var meta = {
          task:           (typeof TCK_TASK !== 'undefined') ? TCK_TASK : 'speaking',
          practiceSet:    (typeof TCK_PRACTICE !== 'undefined') ? TCK_PRACTICE : 0,
          questionIndex:  qNum,
          mime:           TCKRecorder.getMime(),
          ext:            TCKRecorder.getExt(),
          durationSec:    dur,
          attemptNumber:  1
        };
        // Keep the audio so reconcileUploads() can re-send if the server
        // didn't actually receive it (only kept if we have real audio).
        if (b64) keptAudio[qNum] = { meta: meta, b64: b64 };
        return uploadWithRetry(meta, b64);
      });
    }).catch(function(e){
      console.warn('[recorder-hook] upload failed for q' + qNum + ' (after retries):', e);
    });
  }

  // Confirm-and-resend: after the section finishes, ask the server which
  // questions for this (task, practice) actually arrived in the RECORDINGS
  // sheet, and re-upload any that are missing from the kept audio. Runs a
  // couple of verify rounds with a short delay so the server has time to
  // record the last upload before we check. Best-effort and non-blocking:
  // if listMyRecordings is unavailable or fails we simply keep the audio
  // (which we already tried to upload) and don't risk losing anything.
  function reconcileUploads(){
    if (SKIP_RECORDING) return Promise.resolve();
    if (typeof Api === 'undefined' || !Api.listMyRecordings) return Promise.resolve();
    var qs = Object.keys(keptAudio);
    if (!qs.length) return Promise.resolve();
    var task = (typeof TCK_TASK !== 'undefined') ? String(TCK_TASK) : '';
    var pset = (typeof TCK_PRACTICE !== 'undefined') ? String(TCK_PRACTICE) : '';

    function verifyAndResend(round){
      return Api.listMyRecordings().then(function(r){
        var arrived = {};
        if (r && r.success && r.recordings) {
          r.recordings.forEach(function(rec){
            if (String(rec.task) === task && String(rec.practiceSet) === pset) {
              arrived[String(rec.questionIndex)] = true;
            }
          });
        } else {
          // Couldn't read the server list — don't guess, just stop (audio
          // is still kept and was already uploaded once).
          return;
        }
        var missing = qs.filter(function(q){ return !arrived[String(q)]; });
        if (!missing.length) {
          console.log('[recorder-hook] reconcile: all ' + qs.length + ' recordings confirmed on server');
          return;
        }
        console.warn('[recorder-hook] reconcile round ' + round + ': re-sending missing Q ' + missing.join(','));
        return Promise.all(missing.map(function(q){
          var item = keptAudio[q];
          return item ? uploadWithRetry(item.meta, item.b64).catch(function(){}) : null;
        })).then(function(){
          if (round < 2) {
            return new Promise(function(res){ setTimeout(res, 2500); })
              .then(function(){ return verifyAndResend(round + 1); });
          }
        });
      }, function(){ /* listMyRecordings rejected — leave kept audio as-is */ });
    }
    // Give the server a moment to persist the final upload before checking.
    return new Promise(function(res){ setTimeout(res, 2500); })
      .then(function(){ return verifyAndResend(0); });
  }

  // --- Pre-init mic on the user-gesture Start button ---
  var origStart = window.startTask;
  if (typeof origStart === 'function' && !SKIP_RECORDING) {
    window.startTask = function(){
      TCKRecorder.init().catch(function(e){
        console.warn('[recorder-hook] mic init failed:', e);
        // Mic was already verified at mic-check.html, so a failure here is
        // unusual. Silently continue without recording.
      });
      return origStart.apply(this, arguments);
    };
  }

  // --- Begin recording at the start of each response countdown ---
  var origCountdown = window.startCountdown;
  window.startCountdown = function(qNum){
    console.log('[recorder-hook] startCountdown wrapper fired q=' + qNum, '| skip=' + SKIP_RECORDING, '| isReady=' + TCKRecorder.isReady());
    if (!SKIP_RECORDING && TCKRecorder.isReady()){
      try {
        TCKRecorder.start();
        recordingActive = true;
        recStartedAt    = Date.now();
        recQNum         = qNum;
        showRec(true);
      } catch(e){
        console.warn('[recorder-hook] rec start failed:', e);
      }
    } else if (!SKIP_RECORDING) {
      console.warn('[recorder-hook] skipping recording for q' + qNum + ' — recorder not ready');
    }
    return origCountdown.apply(this, arguments);
  };

  // --- Stop + upload right before the next question is played ---
  var origPlayQuestion = window.playQuestion;
  if (typeof origPlayQuestion === 'function') {
    window.playQuestion = function(qNum){
      var priorQ = qNum - 1;
      if (recordingActive && priorQ >= 1) uploadCurrent(priorQ);
      return origPlayQuestion.apply(this, arguments);
    };
  }

  // --- Final question / Section Complete: stop, upload, release mic, mark done ---
  var origShowComplete = window.showComplete;
  window.showComplete = function(){
    var lastQ = recQNum || (typeof totalQuestions === 'number' ? totalQuestions : 0);
    var p = recordingActive ? uploadCurrent(lastQ) : Promise.resolve();
    // After the final upload, verify against the server and re-send any
    // dropped questions, THEN release the mic. Non-blocking for the UI
    // (origShowComplete runs immediately below).
    p.then(function(){ return reconcileUploads(); })
     .then(function(){ TCKRecorder.release(); }, function(){ TCKRecorder.release(); });
    // Persist "done" so the menu shows a 提出済み / Submitted badge.
    if (window.TCKProgress && typeof TCK_TASK !== 'undefined' && typeof TCK_PRACTICE !== 'undefined') {
      try { TCKProgress.markDone(TCK_TASK, TCK_PRACTICE); } catch(e){}
    }
    // Also write a lightweight "done" row to the server (ANSWERS sheet) so
    // the 提出済み badge + my-score history follow the account across
    // browsers/devices. The audio itself lives in the RECORDINGS sheet;
    // this row just lets getMyHistory restore the submitted state.
    try {
      if (typeof Api !== 'undefined' && Api.saveAnswers &&
          typeof TCK_TASK !== 'undefined' && typeof TCK_PRACTICE !== 'undefined') {
        Api.saveAnswers(String(TCK_TASK).toUpperCase() + ' P' + TCK_PRACTICE, { recorded: true }, 0, { attemptNumber: 1 });
      }
    } catch(e){}
    return origShowComplete.apply(this, arguments);
  };

  // --- Defensive: release mic if the user navigates away mid-task ---
  window.addEventListener('beforeunload', function(){ TCKRecorder.release(); });
})();
