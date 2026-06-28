/**
 * score-notice.js — one-time, dismissible banner announcing the score-display
 * correction. Loaded by js/auth.js ONLY on the main screens (the four skill
 * menus + my-score), never during a practice or the Practice Test, so it never
 * interrupts an exam. The × button dismisses it and persists the choice in
 * localStorage, so it is shown at most once per learner.
 *
 * To run a NEW announcement later, bump the KEY suffix (…_v2) and update the
 * message — everyone will see the new banner once.
 */
(function () {
  if (typeof document === 'undefined' || typeof location === 'undefined') return;

  // Main screens only: */menu.html and my-score.html.
  var pq = location.pathname + location.search;
  if (!(/\/menu\.html(?:[?#]|$)/.test(pq) || /\/my-score\.html(?:[?#]|$)/.test(pq))) return;

  // Logged-in learners only.
  var u = null;
  try { u = JSON.parse(sessionStorage.getItem('kickstart_user') || 'null'); } catch (e) {}
  if (!u || !u.userId) return;

  var KEY = 'tck_notice_scorefix_v1';
  try { if (localStorage.getItem(KEY) === 'dismissed') return; } catch (e) {}

  function show() {
    if (document.getElementById('tckScoreNotice')) return;
    var bar = document.createElement('div');
    bar.id = 'tckScoreNotice';
    bar.setAttribute('role', 'status');
    bar.style.cssText =
      'position:relative;width:100%;box-sizing:border-box;z-index:60;' +
      'background:#FBF6EC;border-bottom:1px solid #E6D8B8;color:#6B5A2E;' +
      'padding:9px 44px 9px 16px;font-size:13px;line-height:1.6;text-align:center;' +
      'font-family:"Zen Kaku Gothic New","Noto Sans JP",Manrope,system-ui,sans-serif;';
    // .jp / .en are toggled by each page's existing data-lang CSS.
    bar.innerHTML =
      '<span class="jp">スコア表示に一時的な不具合があったため、算出方法を修正しました。現在は最新の正確なスコアを表示しています。ご不便をおかけし申し訳ございません。</span>' +
      '<span class="en">A temporary issue affected score display, so we have corrected the calculation. Your scores now show the latest accurate values. Sorry for any confusion.</span>' +
      '<button type="button" id="tckScoreNoticeX" aria-label="閉じる" ' +
      'style="position:absolute;top:50%;right:12px;transform:translateY(-50%);background:none;border:0;' +
      'font-size:18px;line-height:1;color:#6B5A2E;cursor:pointer;padding:2px 8px">×</button>';
    var host = document.body || document.documentElement;
    host.insertBefore(bar, host.firstChild);
    var x = document.getElementById('tckScoreNoticeX');
    if (x) x.addEventListener('click', function () {
      try { localStorage.setItem(KEY, 'dismissed'); } catch (e) {}
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    });
  }

  if (document.body) show();
  else document.addEventListener('DOMContentLoaded', show);
})();
