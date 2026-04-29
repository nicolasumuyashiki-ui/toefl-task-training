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

  var recordingActive = false;
  var recStartedAt = 0;
  var recQNum = 0;
  var indicator = null;

  function ensureIndicator(){
    if (indicator) return indicator;
    var s = document.createElement('style');
    s.textContent = '@keyframes recPulse{0%,100%{opacity:1}50%{opacity:.25}}';
    document.head.appendChild(s);
    indicator = document.createElement('div');
    indicator.id = 'tckRecIndicator';
    indicator.style.cssText = 'position:fixed;top:14px;right:24px;display:none;align-items:center;gap:8px;padding:6px 14px;background:#B85C3C;color:#fff;border-radius:999px;font-size:.85em;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(184,92,60,.3);font-family:inherit';
    indicator.innerHTML = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#fff;animation:recPulse 1s infinite;"></span><span>REC</span>';
    document.body.appendChild(indicator);
    return indicator;
  }
  function showRec(on){ ensureIndicator().style.display = on ? 'inline-flex' : 'none'; }

  function uploadCurrent(qNum){
    if (!recordingActive) return Promise.resolve();
    var dur = Math.round((Date.now() - recStartedAt) / 1000);
    recordingActive = false; showRec(false);
    return TCKRecorder.stop().then(function(blob){
      return TCKRecorder.blobToBase64(blob).then(function(b64){
        return Api.uploadRecording({
          task:           (typeof TCK_TASK !== 'undefined') ? TCK_TASK : 'speaking',
          practiceSet:    (typeof TCK_PRACTICE !== 'undefined') ? TCK_PRACTICE : 0,
          questionIndex:  qNum,
          mime:           TCKRecorder.getMime(),
          ext:            TCKRecorder.getExt(),
          durationSec:    dur,
          attemptNumber:  1
        }, b64);
      });
    }).catch(function(e){
      console.warn('[recorder-hook] upload failed for q' + qNum + ':', e);
    });
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

  // --- Final question / Section Complete: stop, upload, release mic ---
  var origShowComplete = window.showComplete;
  window.showComplete = function(){
    var lastQ = recQNum || (typeof totalQuestions === 'number' ? totalQuestions : 0);
    var p = recordingActive ? uploadCurrent(lastQ) : Promise.resolve();
    p.then(function(){ TCKRecorder.release(); });
    return origShowComplete.apply(this, arguments);
  };

  // --- Defensive: release mic if the user navigates away mid-task ---
  window.addEventListener('beforeunload', function(){ TCKRecorder.release(); });
})();
