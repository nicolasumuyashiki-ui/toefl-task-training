/**
 * admin-answer-overlay.js
 *
 * Loaded automatically by js/auth.js when the URL has ?fromAdmin=1.
 * Job: detect the task type from the URL path, fetch the student's
 * saved `answers` payload via Api.getAttemptAnswers, and overlay it on
 * top of the existing answer-key page.
 *
 * Per-task render handlers live in `RENDERERS` below. Today only Email
 * and Discussion are wired up (the other tasks are auto-graded — admin
 * already sees the score on the karte). Adding a task is just a matter
 * of dropping a new key in RENDERERS.
 */
(function(){
  var qs = new URLSearchParams(location.search);
  if (qs.get('fromAdmin') !== '1') return;

  var userId   = qs.get('userId')   || '';
  var userName = qs.get('userName') || '';
  var setParam = qs.get('set')      || '';
  if (!userId) return;

  // Derive task + practice from the URL path:
  //   /writing/email/practice-3-answers.html  → task=email, practice=3
  var path = location.pathname;
  var taskMatch = path.match(/\/(reading|listening|writing|speaking)\/([a-z]+)\/practice-(\d+)/i);
  if (!taskMatch) return;
  var section = taskMatch[1].toLowerCase();
  var task    = taskMatch[2].toLowerCase();
  var practice = taskMatch[3];

  // Most answer pages only include auth.js — so api.js may be missing.
  // Inject it lazily (path relative to this script's own src so it works
  // from any page depth) before fetching.
  function ensureApiLoaded(cb) {
    if (typeof Api !== 'undefined' && Api.getAttemptAnswers) return cb();
    var here = '';
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      if (/admin-answer-overlay\.js(\?|$|#)/.test(src)) { here = src; break; }
    }
    if (!here) { whenApiReady(cb); return; }
    var apiSrc = here.replace(/admin-answer-overlay\.js(\?[^#]*)?(\#.*)?$/, 'api.js');
    var tag = document.createElement('script');
    tag.src = apiSrc;
    tag.onload = function(){ whenApiReady(cb); };
    tag.onerror = function(){ whenApiReady(cb); };
    document.head.appendChild(tag);
  }
  function whenApiReady(cb, attempts) {
    if (typeof Api !== 'undefined' && Api.getAttemptAnswers) return cb();
    if ((attempts || 0) > 40) return; // ~4s ceiling
    setTimeout(function(){ whenApiReady(cb, (attempts||0) + 1); }, 100);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  /* ============================================================
     Renderers — given the parsed `answers` payload from GAS,
     overlay it onto the page. Each receives an attempt object:
       { timestamp, set, score, status, answers }
     ============================================================ */
  var RENDERERS = {
    email: function(att) {
      var t = (att.answers && att.answers.text) || (typeof att.answers === 'string' ? att.answers : '');
      var w = (att.answers && att.answers.words) || '—';
      var tm = (att.answers && (att.answers.time || att.answers.timeUsed)) || '—';
      var prev = document.getElementById('userPreview');
      if (prev) {
        prev.textContent = t || '(本文なし)';
      }
      var stats = document.getElementById('userStats');
      if (stats) {
        stats.innerHTML = '語数: ' + escapeHtml(w) + ' ／ 使用時間: ' + escapeHtml(tm);
      }
    },
    discussion: function(att) {
      // Discussion answer pages reuse the same userPreview/userStats IDs.
      RENDERERS.email(att);
    }
  };

  // Hide controls that could mutate student state if admin clicks them by
  // accident: "もう一度解く" (resets attempt → re-submission), "メニューに戻る"
  // (goes to the *student's* menu under the admin's session). Match by
  // visible label so we don't depend on a class that might drift across
  // task types.
  function hideStudentControls() {
    var killText = ['もう一度解く', 'Try again', 'メニューに戻る', 'Back to menu'];
    var anchors = document.querySelectorAll('a, button');
    for (var i = 0; i < anchors.length; i++) {
      var t = (anchors[i].textContent || '').trim();
      for (var j = 0; j < killText.length; j++) {
        if (t.indexOf(killText[j]) !== -1) {
          anchors[i].style.display = 'none';
          break;
        }
      }
    }
  }

  function injectBanner(attempts) {
    var banner = document.createElement('div');
    banner.id = 'tckAdminBanner';
    banner.style.cssText = 'position:sticky;top:0;z-index:200;background:linear-gradient(135deg,#0F4E2A,#1A6F3F);color:#fff;padding:12px 20px;font-family:Manrope,sans-serif;font-size:.86em;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;box-shadow:0 4px 14px rgba(0,0,0,.18)';
    var label = '<strong style="font-weight:800;letter-spacing:.04em">ADMIN VIEW</strong> · ' +
      escapeHtml(userName || userId) +
      ' の回答 · ' + task.toUpperCase() + ' P' + practice +
      (attempts.length > 1 ? ' （' + attempts.length + ' 回提出 — 最新を表示中）' : '');
    var sel = '';
    if (attempts.length > 1) {
      sel = '<select id="tckAdminAttemptSel" style="background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);padding:5px 10px;border-radius:6px;font-family:inherit;font-size:.92em">' +
        attempts.map(function(a, i){
          var ts = a.timestamp ? new Date(a.timestamp).toLocaleString('ja-JP', { hour12:false }) : '#' + (i+1);
          return '<option value="' + i + '">' + escapeHtml(ts) + '</option>';
        }).join('') + '</select>';
    }
    banner.innerHTML = '<span>' + label + '</span><span style="display:flex;gap:10px;align-items:center">' + sel + '<button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:5px 12px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:.88em">タブを閉じる</button></span>';
    document.body.insertBefore(banner, document.body.firstChild);

    var selEl = document.getElementById('tckAdminAttemptSel');
    if (selEl) selEl.addEventListener('change', function(){
      var idx = Number(selEl.value);
      var fn = RENDERERS[task];
      if (fn && attempts[idx]) fn(attempts[idx]);
    });
  }

  function showError(msg) {
    var bar = document.createElement('div');
    bar.style.cssText = 'background:#7F1D1D;color:#fff;padding:14px 20px;font-family:Manrope,sans-serif;font-size:.9em;text-align:center';
    bar.textContent = '[Admin] ' + msg;
    document.body.insertBefore(bar, document.body.firstChild);
  }

  ensureApiLoaded(function(){
    Api.getAttemptAnswers(userId, task, practice, setParam).then(function(res){
      if (!res || !res.success) {
        showError('回答の取得に失敗しました（' + ((res && res.error) || 'unknown') + '）');
        return;
      }
      var atts = res.attempts || [];
      if (!atts.length) {
        showError(escapeHtml(userName || userId) + ' の ' + task.toUpperCase() + ' P' + practice + ' の提出は見つかりませんでした。');
        return;
      }
      var renderer = RENDERERS[task];
      if (!renderer) {
        showError('このタスクの回答表示はまだ未対応です（task=' + task + '）。');
        return;
      }
      injectBanner(atts);
      hideStudentControls();
      renderer(atts[0]); // newest
    }).catch(function(err){
      showError('通信エラー：' + (err && err.message || err));
    });
  });
})();
