/**
 * save-guard.js — make the save path VISIBLE: status chip + preflight + warnings.
 *
 * Why: saveAnswers writes to a durable localStorage outbox first, then
 * transmits. In a hostile environment (privacy extension / corporate
 * filter / VPN blocking script.google.com, or a flaky connection) the
 * transmit can fail silently — the learner thinks their work was saved
 * when the server never received it. This module makes that state
 * impossible to miss:
 *
 *   1. ALWAYS-VISIBLE STATUS CHIP (Google-Docs style, bottom-right, every
 *      page): 「✓ 保存OK」 when the outbox is empty, 「⚠ 未送信 N件」 when
 *      anything is unconfirmed — tap to resend on the spot.
 *   2. LOGIN-TIME PREFLIGHT: once per session, a real test request is sent
 *      through BOTH actual save transports (same-origin relay fetch + direct
 *      GAS JSONP — ?action=heartbeat, writes no answer rows). If neither
 *      channel gets a readable response, saving on this connection would be
 *      unverifiable (iframe-POST only) → a yellow banner warns the learner
 *      BEFORE they invest effort, and re-tests when the connection changes.
 *   3. PRACTICE-START WARNING: opening a practice page while unsent results
 *      are queued shows a strong one-time banner — resend first (good
 *      connection) or consciously continue.
 *   4. Storage-block detection (private mode with site data disabled), where
 *      even the local copy can't survive — unchanged from v1.
 *
 * Pure UI over the EXISTING outbox/Api (tck_outbox, Api.flushOutbox,
 * Api.savePathPreflight) — it does not touch the save logic or any history.
 * Loaded site-wide by js/auth.js for logged-in learners.
 */
(function () {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (document.getElementById('tckSaveChip') || document.getElementById('tckSaveGuardBar')) return;

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
    return; // storage is dead — the outbox chip below can't read pending anyway
  }

  /* ============================================================
     Shared plumbing
     ============================================================ */

  // Pending count straight from localStorage — no Api dependency, so the
  // chip renders truthfully even on pages that never load api.js.
  function pending() {
    try { return (JSON.parse(localStorage.getItem('tck_outbox') || '[]') || []).length; }
    catch (e) { return 0; }
  }

  // Lazy-load api.js (same directory + same ?v= as this script) when an
  // action (resend / preflight) needs it. Mirrors the auth.js loader idiom.
  var _apiLoading = null;
  function ensureApi() {
    if (typeof window.Api !== 'undefined' && window.Api && window.Api.flushOutbox) return Promise.resolve(window.Api);
    if (_apiLoading) return _apiLoading;
    _apiLoading = new Promise(function (resolve) {
      var here = '';
      var scripts = document.getElementsByTagName('script');
      for (var i = 0; i < scripts.length; i++) {
        var s = scripts[i].src || '';
        if (/\/save-guard\.js(\?|$)/.test(s)) { here = s; break; }
        if (!here && /\/auth\.js(\?|$)/.test(s)) here = s.replace(/\/auth\.js/, '/save-guard.js');
      }
      if (!here) return resolve(null);
      var tag = document.createElement('script');
      tag.src = here.replace(/\/save-guard\.js(\?[^#]*)?(\#.*)?$/, '/api.js$1');
      tag.onload = function () { resolve(window.Api || null); };
      tag.onerror = function () { resolve(null); };
      document.head.appendChild(tag);
      setTimeout(function () { resolve(window.Api || null); }, 10000);
    });
    return _apiLoading;
  }

  function flush() {
    return ensureApi().then(function (Api) {
      if (Api && Api.flushOutbox) return Api.flushOutbox().then(null, function () {});
    });
  }

  // Practice page (an actual attempt) — not answers/tips/legacy/menu.
  var IS_PRACTICE = /\/(reading|listening|writing|speaking)\/[a-z]+\/practice-\d+(-set-\d+)?\.html$/i
    .test(location.pathname) && location.pathname.indexOf('/legacy/') === -1;

  /* ============================================================
     1. Always-visible save-status chip (every page, bottom-right)
     ============================================================ */
  var chip = null;
  var chipState = '';

  var CHIP_STYLES = {
    ok:       { bg: '#EAF4EE', bd: '#BFDCCB', fg: '#1F6B47', cur: 'default' },
    pathwarn: { bg: '#FFF4D6', bd: '#E3C871', fg: '#6B5A1E', cur: 'pointer' },
    warn:     { bg: '#FCEBE4', bd: '#D98E52', fg: '#8A3E24', cur: 'pointer' },
    sending:  { bg: '#EDF1F7', bd: '#9FB3CE', fg: '#33517A', cur: 'default' },
    sent:     { bg: '#E6F3EC', bd: '#0F7A45', fg: '#0F5A33', cur: 'default' }
  };

  function mountChip() {
    if (chip) return;
    chip = document.createElement('button');
    chip.id = 'tckSaveChip';
    chip.type = 'button';
    chip.setAttribute('role', 'status');
    chip.style.cssText =
      'position:fixed;right:14px;bottom:14px;z-index:2147483550;border-radius:999px;' +
      'padding:7px 13px;border:1.5px solid transparent;display:inline-flex;align-items:center;gap:6px;' +
      'font-family:Manrope,"Zen Kaku Gothic New","Noto Sans JP",system-ui,sans-serif;' +
      'font-size:.76em;font-weight:700;line-height:1;box-shadow:0 2px 10px rgba(0,0,0,.12);' +
      'transition:background .2s,color .2s,border-color .2s;-webkit-tap-highlight-color:transparent';
    chip.addEventListener('click', onChipTap);
    (document.body || document.documentElement).appendChild(chip);
  }

  function setChip(state, label, title) {
    mountChip();
    var s = CHIP_STYLES[state] || CHIP_STYLES.ok;
    chipState = state;
    chip.style.background = s.bg;
    chip.style.borderColor = s.bd;
    chip.style.color = s.fg;
    chip.style.cursor = s.cur;
    chip.textContent = label;
    chip.title = title || label;
    chip.setAttribute('aria-label', title || label);
  }

  function pathWarned() {
    try {
      var c = JSON.parse(sessionStorage.getItem('tck_preflight') || 'null');
      return !!(c && c.ok === false);
    } catch (e) { return false; }
  }

  function renderChip() {
    if (chipState === 'sending' || chipState === 'sent') return; // transient states own the chip
    var n = pending();
    if (n > 0) {
      setChip('warn',
        '⚠ ' + t('未送信 ', 'Unsaved ') + n + t(' 件', ''),
        t('サーバー未送信の成績が ' + n + ' 件あります。タップで再送します。',
          n + ' result(s) not yet saved to the server. Tap to resend.'));
    } else if (pathWarned()) {
      setChip('pathwarn',
        '⚠ ' + t('保存経路', 'Save path'),
        t('この通信環境ではサーバー保存を確認できませんでした。タップで再確認します。',
          'Could not verify the save path on this connection. Tap to re-test.'));
    } else {
      setChip('ok', '✓ ' + t('保存OK', 'Saved'),
        t('未送信の成績はありません。すべてサーバーに保存済みです。',
          'No unsent results — everything is saved to the server.'));
    }
  }

  function onChipTap() {
    if (chipState === 'warn') {
      var before = pending();
      setChip('sending', '⏳ ' + t('送信中…', 'Sending…'));
      var settle = function () {
        var after = pending();
        if (after <= 0) {
          setChip('sent', '✓ ' + t('送信しました', 'Sent'));
          setTimeout(function () { chipState = ''; renderChip(); }, 3500);
        } else {
          chipState = '';
          renderChip();
        }
      };
      flush().then(function () {
        // The staggered flush resolves as it finishes, but give slow items headroom.
        setTimeout(settle, Math.min(before, 5) * 600 + 1500);
      });
    } else if (chipState === 'pathwarn') {
      setChip('sending', '⏳ ' + t('確認中…', 'Testing…'));
      ensureApi().then(function (Api) {
        var done = function () { chipState = ''; renderChip(); };
        if (Api && Api.savePathPreflight) Api.savePathPreflight(true).then(done, done);
        else done();
      });
    }
  }

  /* ============================================================
     2. Login-time save-path preflight (once per session, any page)
     ============================================================ */
  function preflightBanner() {
    if (document.getElementById('tckPreflightBar')) return;
    try { if (sessionStorage.getItem('tck_preflight_dismiss') === '1') return; } catch (e) {}
    var bar = makeBar('tckPreflightBar', '#FFF4D6', '#E3C871', '#6B5A1E');
    bar.innerHTML =
      '<span style="max-width:720px">⚠ ' + t(
        'この通信環境では成績のサーバー保存が確認できませんでした。取り組み自体は可能で、成績はこの端末に保管され接続回復後に自動再送されますが、Wi-Fi など別の回線でのご利用をおすすめします。',
        'We could not verify server saving on this connection. You can still practice — results are stored on this device and re-sent automatically — but we recommend switching to another network (e.g. Wi-Fi).'
      ) + '</span>' +
      '<button type="button" id="tckPreflightRetry" style="background:#6B5A1E;color:#fff;border:0;border-radius:999px;padding:6px 14px;font:inherit;font-weight:700;cursor:pointer">' +
        t('再確認', 'Re-test') + '</button>' +
      '<button type="button" id="tckPreflightClose" style="background:transparent;color:#6B5A1E;border:1.5px solid #C9B36A;border-radius:999px;padding:6px 14px;font:inherit;font-weight:700;cursor:pointer">' +
        t('閉じる', 'Dismiss') + '</button>';
    (document.body || document.documentElement).appendChild(bar);
    var close = document.getElementById('tckPreflightClose');
    if (close) close.addEventListener('click', function () {
      try { sessionStorage.setItem('tck_preflight_dismiss', '1'); } catch (e) {}
      bar.parentNode && bar.parentNode.removeChild(bar);
    });
    var retry = document.getElementById('tckPreflightRetry');
    if (retry) retry.addEventListener('click', function () {
      retry.disabled = true;
      retry.textContent = t('確認中…', 'Testing…');
      ensureApi().then(function (Api) {
        var done = function (res) {
          if (res && res.ok) {
            bar.parentNode && bar.parentNode.removeChild(bar);
            renderChip();
          } else {
            retry.disabled = false;
            retry.textContent = t('再確認', 'Re-test');
          }
        };
        if (Api && Api.savePathPreflight) Api.savePathPreflight(true).then(done, function () { done(null); });
        else done(null);
      });
    });
  }

  function runPreflight() {
    ensureApi().then(function (Api) {
      if (!Api || !Api.savePathPreflight) return;
      Api.savePathPreflight().then(function (res) {
        if (res && res.ok === false) preflightBanner();
        renderChip();
      }, function () {});
    });
  }

  /* ============================================================
     3. Practice-start warning (practice pages, unsent items queued)
     ============================================================ */
  function practiceStartWarn() {
    if (!IS_PRACTICE) return;
    var n = pending();
    if (n <= 0) return;
    var key = 'tck_startwarn_' + location.pathname;
    try { if (sessionStorage.getItem(key) === '1') return; } catch (e) {}
    try { sessionStorage.setItem(key, '1'); } catch (e) {}
    if (document.getElementById('tckStartWarnBar')) return;
    var bar = makeBar('tckStartWarnBar', '#FCEBE4', '#B85C3C', '#8A3E24');
    bar.innerHTML =
      '<span style="max-width:720px">⚠ ' + t(
        'サーバー未送信の成績が <b>' + n + '</b> 件あります。前回の結果がまだ保存されていません。通信環境の良い場所で「再送する」を押してから開始することをおすすめします。',
        'You have <b>' + n + '</b> result(s) not yet saved to the server. We recommend tapping “Resend” on a good connection before starting.'
      ) + '</span>' +
      '<button type="button" id="tckStartWarnResend" style="background:#B85C3C;color:#fff;border:0;border-radius:999px;padding:6px 16px;font:inherit;font-weight:700;cursor:pointer">' +
        t('再送する', 'Resend') + '</button>' +
      '<button type="button" id="tckStartWarnClose" style="background:transparent;color:#8A3E24;border:1.5px solid #D9A08A;border-radius:999px;padding:6px 14px;font:inherit;font-weight:700;cursor:pointer">' +
        t('このまま続行', 'Continue anyway') + '</button>';
    (document.body || document.documentElement).appendChild(bar);
    var closeBtn = document.getElementById('tckStartWarnClose');
    if (closeBtn) closeBtn.addEventListener('click', function () { bar.parentNode && bar.parentNode.removeChild(bar); });
    var resend = document.getElementById('tckStartWarnResend');
    if (resend) resend.addEventListener('click', function () {
      resend.disabled = true;
      resend.textContent = t('送信中…', 'Sending…');
      var before = pending();
      flush().then(function () {
        setTimeout(function () {
          var after = pending();
          if (after <= 0) {
            bar.style.background = '#E6F3EC';
            bar.style.borderTopColor = '#0F7A45';
            bar.style.color = '#0F5A33';
            bar.innerHTML = '<span>✓ ' + t('未送信の成績をすべてサーバーに送信しました。安心してお取り組みください。', 'All pending results were saved to the server. You are good to go.') + '</span>';
            setTimeout(function () { bar.parentNode && bar.parentNode.removeChild(bar); }, 4000);
          } else {
            resend.disabled = false;
            resend.textContent = t('再送する', 'Resend');
            var span = bar.querySelector('b');
            if (span) span.textContent = String(after);
          }
          renderChip();
        }, Math.min(before, 5) * 600 + 1500);
      });
    });
  }

  /* ============================================================
     Boot
     ============================================================ */
  function start() {
    renderChip();
    practiceStartWarn();
    // Nudge pending items out (api.js also auto-flushes on its own load).
    if (pending() > 0) flush().then(function () { setTimeout(renderChip, 4000); });
    // Real-transport preflight, once per session — slight delay so login /
    // menu hydration wins the network first.
    setTimeout(runPreflight, 2500);
    // Keep the chip honest during the session (a mid-practice failed save
    // shows up within seconds).
    setInterval(renderChip, 8000);
    window.addEventListener('online', function () {
      if (pending() > 0) flush();
      // A connection change invalidates a failed preflight — re-test.
      if (pathWarned()) {
        ensureApi().then(function (Api) {
          if (Api && Api.savePathPreflight) Api.savePathPreflight(true).then(function () {
            var b = document.getElementById('tckPreflightBar');
            if (b && !pathWarned()) b.parentNode.removeChild(b);
            renderChip();
          }, function () {});
        });
      }
      setTimeout(renderChip, 3000);
    });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
