/**
 * save-guard.js — make a failed save VISIBLE and recoverable.
 *
 * Why: saveAnswers writes to a durable localStorage outbox first, then
 * transmits. In a hostile environment (privacy extension / corporate
 * filter / VPN blocking script.google.com, or a flaky connection) the
 * transmit can fail silently — the learner thinks their work was saved
 * when the server never received it. This module watches the outbox and,
 * if anything is still unconfirmed, shows a non-blocking banner with a
 * one-tap "再送 / Resend" so the learner KNOWS and can act, instead of
 * losing work without any signal. It also warns when the browser is
 * blocking storage outright (private mode with site data disabled), where
 * even the local copy can't survive.
 *
 * Pure UI over the EXISTING outbox API (Api.outboxPending / Api.flushOutbox)
 * — it does not touch the save logic or any history. Loaded site-wide by
 * js/auth.js for logged-in learners.
 */
(function () {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (document.getElementById('tckSaveGuardBar')) return;

  // Logged-in learners only (skip the login screen / logged-out pages).
  var user = null;
  try { user = JSON.parse(sessionStorage.getItem('kickstart_user') || 'null'); } catch (e) {}
  if (!user || !user.userId) return;

  function lang() { try { return localStorage.getItem('tck_lang') || 'jp'; } catch (e) { return 'jp'; } }
  function t(jp, en) { return lang() === 'en' ? en : jp; }

  // --- Hard storage-block detection (private mode w/ site data disabled) ---
  // If localStorage itself throws, the outbox can't persist either, so a save
  // genuinely can't survive a page close. Warn once per session.
  function storageBlocked() {
    try {
      var k = '__tck_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return false;
    } catch (e) { return true; }
  }

  function makeBar(id, bg, border, color) {
    var bar = document.createElement('div');
    bar.id = id;
    bar.setAttribute('role', 'status');
    bar.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:2147483600;' +
      'background:' + bg + ';border-top:2px solid ' + border + ';color:' + color + ';' +
      'padding:11px 16px;display:flex;align-items:center;justify-content:center;gap:14px;' +
      'flex-wrap:wrap;font-family:Manrope,"Zen Kaku Gothic New","Noto Sans JP",system-ui,sans-serif;' +
      'font-size:.86em;font-weight:600;box-shadow:0 -4px 16px rgba(0,0,0,.10)';
    return bar;
  }

  // --- Storage-block warning (shown once) ---
  if (storageBlocked()) {
    function showStorageWarn() {
      if (document.getElementById('tckStorageWarnBar')) return;
      var bar = makeBar('tckStorageWarnBar', '#FFF4D6', '#E3C871', '#6B5A1E');
      bar.innerHTML =
        '<span>⚠ ' + t(
          'このブラウザは保存（履歴データ）をブロックしています。プライベート/シークレットモードを解除するか、別のブラウザでお取り組みください。さもないと記録が残りません。',
          'This browser is blocking storage. Turn off private/incognito mode or use another browser, otherwise your work will not be saved.'
        ) + '</span>' +
        '<button type="button" id="tckStorageWarnClose" style="background:#6B5A1E;color:#fff;border:0;border-radius:999px;padding:6px 14px;font:inherit;font-weight:700;cursor:pointer">' +
          t('閉じる', 'Dismiss') + '</button>';
      (document.body || document.documentElement).appendChild(bar);
      var c = document.getElementById('tckStorageWarnClose');
      if (c) c.addEventListener('click', function () { bar.parentNode && bar.parentNode.removeChild(bar); });
    }
    if (document.body) showStorageWarn();
    else document.addEventListener('DOMContentLoaded', showStorageWarn);
    return; // storage is dead — the outbox banner below can't read pending anyway
  }

  // --- Unsaved-outbox banner ---
  var bar = null, recheckTimer = null;

  function pending() {
    try { return (typeof Api !== 'undefined' && Api.outboxPending) ? Api.outboxPending() : 0; }
    catch (e) { return 0; }
  }

  function hide() {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = null;
  }

  function showSaved() {
    hide();
    var ok = makeBar('tckSaveGuardBar', '#E6F3EC', '#0F7A45', '#0F5A33');
    ok.innerHTML = '<span>✓ ' + t('未保存の記録をサーバーに送信しました。', 'Your pending work has been saved to the server.') + '</span>';
    (document.body || document.documentElement).appendChild(ok);
    bar = ok;
    setTimeout(hide, 4000);
  }

  function render(n) {
    if (n <= 0) { hide(); return; }
    if (bar && bar.id === 'tckSaveGuardBar' && bar.getAttribute('data-state') === 'warn') {
      var cnt = bar.querySelector('[data-count]');
      if (cnt) cnt.textContent = String(n);
      return;
    }
    hide();
    bar = makeBar('tckSaveGuardBar', '#FCEBE4', '#B85C3C', '#8A3E24');
    bar.setAttribute('data-state', 'warn');
    bar.innerHTML =
      '<span>⚠ ' + t('未保存の記録が ', 'You have ') +
        '<b data-count>' + n + '</b>' + t(' 件あります。通信環境をご確認のうえ、再送してください。', ' unsaved item(s). Please check your connection and resend.') +
      '</span>' +
      '<button type="button" id="tckSaveGuardResend" style="background:#B85C3C;color:#fff;border:0;border-radius:999px;padding:6px 16px;font:inherit;font-weight:700;cursor:pointer">' +
        t('再送する', 'Resend') + '</button>';
    (document.body || document.documentElement).appendChild(bar);
    var btn = document.getElementById('tckSaveGuardResend');
    if (btn) btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = t('送信中…', 'Sending…');
      var before = pending();
      var done = function () {
        var after = pending();
        if (after <= 0) showSaved();
        else { render(after); }
      };
      try {
        if (typeof Api !== 'undefined' && Api.flushOutbox) Api.flushOutbox().then(done, done);
        else done();
      } catch (e) { done(); }
      // Re-check after the staggered flush has had time to run.
      setTimeout(function () { var after = pending(); if (after <= 0) showSaved(); else render(after); }, before * 600 + 2500);
    });
  }

  function check() { render(pending()); }

  function start() {
    // Nudge the outbox to flush on load (api.js also auto-flushes), then check.
    try { if (typeof Api !== 'undefined' && Api.flushOutbox) Api.flushOutbox(); } catch (e) {}
    setTimeout(check, 3000);
    // Keep watching during the session so a failure mid-practice surfaces.
    if (!recheckTimer) recheckTimer = setInterval(check, 25000);
    window.addEventListener('online', function () {
      try { if (typeof Api !== 'undefined' && Api.flushOutbox) Api.flushOutbox(); } catch (e) {}
      setTimeout(check, 2500);
    });
  }

  // Wait for Api (api.js may load slightly after this module).
  function waitApi(n) {
    if (typeof Api !== 'undefined' && Api.outboxPending) return start();
    if ((n || 0) > 50) return; // ~10s; if Api never loads, nothing to guard
    setTimeout(function () { waitApi((n || 0) + 1); }, 200);
  }

  if (document.body) waitApi(0);
  else document.addEventListener('DOMContentLoaded', function () { waitApi(0); });
})();
