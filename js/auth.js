/* ============================================================
   TCK Workshop — Auth + Access Control
   ============================================================ */

var TCK_ALLOWED_DOMAINS = [
  '@tckworkshop.co.jp',
  '@tck-workshop.com', // fallback
];
var TCK_ALLOWLIST = [
  // External beta emails go here (lowercase).
  // 'beta@example.com',
];
/* Monitor / comp-tier allowlist used to live here. Moved server-side
   (GAS handleGetSubscription_ short-circuits to status=active for
   listed emails) so the list isn't visible in client source / Git
   history. See docs/gas-monitor-allowlist.js for the GAS-side code. */
/* Staff login IDs — emergency bypass for users whose email cannot be
   validated. Empty by default now that GAS returns the email field.
   Add entries here only as a short-term override. */
var TCK_STAFF_ID_ALLOWLIST = [];

function tckIsAllowed(email, userId) {
  if (userId && TCK_STAFF_ID_ALLOWLIST.indexOf(userId) !== -1) return true;
  if (!email || typeof email !== 'string') return false;
  var e = email.toLowerCase();
  for (var i = 0; i < TCK_ALLOWED_DOMAINS.length; i++) {
    if (e.endsWith(TCK_ALLOWED_DOMAINS[i])) return true;
  }
  for (var j = 0; j < TCK_ALLOWLIST.length; j++) {
    if (e === TCK_ALLOWLIST[j].toLowerCase()) return true;
  }
  return false;
}
function tckIsStaff(email, userId) {
  if (userId && TCK_STAFF_ID_ALLOWLIST.indexOf(userId) !== -1) return true;
  return !!email && email.toLowerCase().endsWith('@tckworkshop.co.jp');
}

/* Figure out the absolute URL of the app root (where index.html /
   menu.html live). Returns e.g. "https://apps.tckworkshop.co.jp/toefl-task-training/"
   or "/" depending on deployment.

   Strategy: locate the <script> tag that loaded this auth.js. Its src
   ends in ".../js/auth.js", so strip that suffix to get the app root.
   This is robust against:
   - subpath deployments (/toefl-task-training/...)
   - nested pages (/reading/ctw/practice-1.html, /admin/index.html, etc.)
   - local filesystem testing (file://...)
   - custom-domain → GitHub Pages forwarding

   Bug fixed 2026-04: the old "count slashes in pathname" approach
   wrongly treated "/toefl-task-training/" as a directory to traverse,
   so menu.html → ../index.html resolved to the host root, which 404'd
   into GitHub's user-profile page. */
function tckRootPrefix() {
  var scripts = document.getElementsByTagName('script');
  for (var i = 0; i < scripts.length; i++) {
    var src = scripts[i].src || '';
    var m = src.match(/^(.*\/)js\/auth\.js(?:\?.*)?$/);
    if (m) return m[1];
  }
  // Fallback for edge cases (e.g. inline auth.js): empty prefix means
  // "current directory", which is correct for index.html / menu.html
  // accessed at the app root and acceptable elsewhere.
  return '';
}

var Auth = {
  SESSION_KEY: 'kickstart_user',

  require: function() {
    // 1. Require a session
    if (!this.getUser()) {
      window.location.href = tckRootPrefix() + 'index.html';
      return false;
    }
    // 2. Domain-whitelist gate removed (post-public-launch). Anyone
    //    with a USERS row can navigate; the subscription gate below
    //    is the real content-access control. To re-enable a domain
    //    block, restore: if (u && u.email && !tckIsAllowed(...)) {…}.
    if (location.search.indexOf('preview=1') === -1) {
      var u = this.getUser();
      // 3. Subscription gate — TCK staff bypass; everyone else needs an
      //    active subscription. Runs in the background so the page paints
      //    immediately; if the check fails, redirects to billing.html.
      this._enforceSubscriptionGate(u);
    }
    return true;
  },

  /* Allow billing/consultation/score pages to render without the gate
     redirecting away from itself. The gate redirects TO billing.html, so
     the gate must NOT trigger on billing.html itself. */
  _SUB_EXEMPT_PAGES: [
    'billing.html',          // the gate redirect target
    'private-coaching.html', // upsell page
    'consultation.html',     // free perk
    'my-score.html',         // self-data view
    'index.html',            // login (Auth.require shouldn't run here anyway)
    'menu.html',             // landing — a "subscribe" banner there is friendlier than a redirect
  ],

  _enforceSubscriptionGate: function(user) {
    if (!user) return;
    // Staff bypass — TCK domain users always have access.
    if (tckIsStaff(user.email, user.userId)) return;
    // (Monitor / comp-tier bypass moved server-side — GAS returns
    // status=active for those emails, so the standard subscription
    // check below handles them transparently.)
    // Grandfather bypass — sessions from before GAS started returning the
    // email field have no email at all. Such users have already passed
    // tckIsAllowed (which fails-open when email is missing), so we can't
    // distinguish a TCK staffer from an external member here. Default to
    // "let them through" rather than show a false subscription banner;
    // the gate still fires on actual task pages where it matters.
    if (!user.email) return;

    // Pages where the gate should not redirect (so users can pay).
    var page = (location.pathname.split('/').pop() || '').toLowerCase();
    if (this._SUB_EXEMPT_PAGES.indexOf(page) !== -1) return;

    // Cached subscription status (15-min TTL for ACTIVE only) so we don't
    // hit GAS on every page load. Negative results are intentionally NOT
    // cached: a just-paid user can be in the window between Stripe checkout
    // and the SUBSCRIPTIONS row landing in GAS, and a stale "not active"
    // cache would lock them out for up to 15 min after they've paid.
    // Cache key includes userId so multiple sessions on the same browser
    // don't collide.
    var cacheKey = 'tck_sub_status_' + user.userId;
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null'); } catch (e) {}
    // Only trust POSITIVE cache. Old negative entries from earlier
    // versions are ignored automatically and forced to re-check.
    var fresh = cached && cached.active === true
                       && (Date.now() - cached.checkedAt) < 15 * 60 * 1000;
    if (fresh) return;  // proven active recently — let through

    // No fresh positive cache → check via Api. Render the page in the
    // meantime; if the check resolves to "not active", redirect.
    var self = this;
    if (typeof Api === 'undefined' || !Api.getSubscription) return; // Api not loaded yet — fail-open
    Api.getSubscription().then(function(res) {
      var active = !!(res && res.success && res.subscription &&
        ['active','trialing'].indexOf(String(res.subscription.status || '').toLowerCase()) !== -1);
      if (active) {
        // Cache positive result (15-min TTL keeps perf benefit for paid users).
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ active: true, checkedAt: Date.now() })); } catch (e) {}
      } else {
        // Do NOT cache negative result; also clear any stale entry so the
        // next page load re-checks immediately after a webhook lands.
        try { sessionStorage.removeItem(cacheKey); } catch (e) {}
        self._redirectToBilling();
      }
    }).catch(function(){
      // Network failure — fail-open so we don't lock paying users out.
    });
  },

  _redirectToBilling: function() {
    // Avoid redirect loops if already on billing.
    var page = (location.pathname.split('/').pop() || '').toLowerCase();
    if (page === 'billing.html') return;
    window.location.href = tckRootPrefix() + 'billing.html?gate=subscribe';
  },

  getUser: function() {
    try {
      var d = JSON.parse(sessionStorage.getItem(this.SESSION_KEY));
      return (d && d.userId) ? d : null;
    } catch(e) { return null; }
  },

  save: function(userData) {
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(userData));
  },

  showBadge: function(elementId) {
    var u = this.getUser(), el = document.getElementById(elementId);
    if (u && el) el.innerHTML = '<strong>' + u.userName + '</strong>';
  },

  completeSet: function(setNum) {
    var c = JSON.parse(sessionStorage.getItem('kickstart_completed') || '[]');
    if (c.indexOf(setNum) === -1) c.push(setNum);
    sessionStorage.setItem('kickstart_completed', JSON.stringify(c));
  },

  getCompletedSets: function() {
    return JSON.parse(sessionStorage.getItem('kickstart_completed') || '[]');
  }
};

if (typeof window !== 'undefined') {
  window.tckIsAllowed = tckIsAllowed;
  window.tckIsStaff = tckIsStaff;
}

/* ============================================================
   Menu-side subscription click interceptor.
   ----------------------------------------------------------
   Runs on any menu.html (root + per-skill). For non-staff users
   without an active subscription, intercepts clicks on .skill-card
   / .flt-card / .practice-btn (the elements that lead into actual
   tasks) and shows a polite modal instead of letting auth.js's
   hard redirect kick in afterwards. "More" cards (My Score,
   Billing, Consultation, Private Coaching) stay clickable so
   users can still pay or manage their account.
   ============================================================ */
(function () {
  if (window.__TCKSubGateInit) return;
  window.__TCKSubGateInit = true;

  function isMenuPage() {
    var page = (location.pathname.split('/').pop() || '').toLowerCase();
    return page === 'menu.html';
  }
  if (!isMenuPage()) return;

  function init() {
    var u; try { u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}'); } catch (e) { u = {}; }
    if (!u.userId) return;
    if (typeof tckIsStaff === 'function' && tckIsStaff(u.email, u.userId)) return; // Staff bypass
    // (Monitor / comp-tier bypass moved server-side — GAS will return
    // status=active for those emails so applyLockedState never fires.)
    // Grandfather bypass — same logic as Auth._enforceSubscriptionGate.
    // Sessions saved before GAS started returning the email field have
    // u.email === '' (or undefined). We can't distinguish a TCK staffer
    // from an external member at that point, so default to "let them
    // through" rather than show a false subscription banner / lock the
    // tiles. The actual task pages still gate on a fresh API check.
    if (!u.email) return;

    var cacheKey = 'tck_sub_status_' + u.userId;
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null'); } catch (e) {}
    if (cached && (Date.now() - cached.checkedAt) < 15 * 60 * 1000) {
      if (!cached.active) applyLockedState();
      return;
    }
    if (typeof Api === 'undefined' || !Api.getSubscription) return;
    Api.getSubscription().then(function (res) {
      var active = !!(res && res.success && res.subscription &&
        ['active','trialing'].indexOf(String(res.subscription.status || '').toLowerCase()) !== -1);
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ active: active, checkedAt: Date.now() })); } catch (e) {}
      if (!active) applyLockedState();
    }).catch(function () {});
  }

  function applyLockedState() {
    var sel = '.skill-card, .flt-card, .practice-btn:not(.locked)';
    var cards = document.querySelectorAll(sel);
    cards.forEach(function (c) {
      c.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        showSubModal();
      }, true);
      c.style.cursor = 'not-allowed';
      c.style.opacity = '.62';
      c.setAttribute('aria-disabled', 'true');
    });
    // Optional inline nudge already in the page
    var nudge = document.getElementById('subNudge');
    if (nudge) nudge.style.display = 'block';
  }

  function showSubModal() {
    if (document.getElementById('tckSubBd')) return;
    if (!document.getElementById('tckSubGateCSS')) {
      var css = document.createElement('style');
      css.id = 'tckSubGateCSS';
      css.textContent =
        '#tckSubBd{position:fixed;inset:0;background:rgba(15,21,17,.42);backdrop-filter:blur(6px);' +
          'display:flex;align-items:center;justify-content:center;padding:24px;z-index:10000;' +
          'animation:tckSubFade .22s ease}' +
        '@keyframes tckSubFade{from{opacity:0}to{opacity:1}}' +
        '#tckSubModal{background:#fff;border-radius:18px;max-width:440px;width:100%;' +
          'box-shadow:0 24px 64px rgba(0,40,23,.28);overflow:hidden;' +
          'font-family:"Manrope","Zen Kaku Gothic New",sans-serif;color:#0F1511;' +
          'animation:tckSubSlide .3s cubic-bezier(.16,1,.3,1)}' +
        '@keyframes tckSubSlide{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}' +
        '#tckSubModal .h{background:linear-gradient(135deg,#B85C3C,#8A3E24);color:#fff;padding:24px 28px 20px}' +
        '#tckSubModal .ic{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;' +
          'border-radius:12px;background:rgba(255,255,255,.18);font-size:22px;margin-bottom:10px}' +
        '#tckSubModal .ek{font-family:"Manrope",sans-serif;font-size:.7em;font-weight:800;letter-spacing:.12em;' +
          'text-transform:uppercase;color:rgba(255,255,255,.78);margin-bottom:3px}' +
        '#tckSubModal .ti{font-size:1.3em;font-weight:800;letter-spacing:-0.01em;line-height:1.25}' +
        '#tckSubModal .b{padding:24px 28px;font-size:.95em;line-height:1.7}' +
        '#tckSubModal .b p{margin-bottom:10px}' +
        '#tckSubModal .b p:last-child{margin-bottom:0}' +
        '#tckSubModal .b strong{color:#8A3E24}' +
        '#tckSubModal .ac{padding:0 28px 24px;display:flex;gap:10px;justify-content:flex-end}' +
        '#tckSubModal .btn{font-family:"Manrope",sans-serif;font-weight:700;font-size:.88em;' +
          'padding:11px 22px;border-radius:999px;border:none;cursor:pointer;letter-spacing:.02em;' +
          'text-decoration:none;display:inline-flex;align-items:center;gap:6px;transition:all .15s}' +
        '#tckSubModal .btn-pri{background:#007646;color:#fff}' +
        '#tckSubModal .btn-pri:hover{background:#005434;transform:translateY(-1px)}' +
        '#tckSubModal .btn-gh{background:transparent;color:#5B6660;border:1px solid #E8E4D8}' +
        '#tckSubModal .btn-gh:hover{background:#E8E4D8;color:#0F1511}';
      document.head.appendChild(css);
    }

    var billingHref = tckRootPrefix() + 'billing.html';

    var bd = document.createElement('div');
    bd.id = 'tckSubBd';
    bd.innerHTML =
      '<div id="tckSubModal" role="dialog" aria-modal="true">' +
        '<div class="h">' +
          '<div class="ic">🔒</div>' +
          '<div class="ek">Subscription required</div>' +
          '<div class="ti"><span class="jp">サブスクリプションが必要です</span><span class="en">Subscription required</span></div>' +
        '</div>' +
        '<div class="b">' +
          '<p><span class="jp">TCK Reps の各タスクをご利用いただくには、月額プラン <strong>¥3,980 / 月</strong>（税込 ¥4,378）へのご登録が必要です。</span>' +
          '<span class="en">An active subscription is required to use TCK Reps tasks. The plan is <strong>¥3,980/month</strong> (¥4,378 tax incl.).</span></p>' +
          '<p><span class="jp">登録後すぐに全タスクが解放されます。いつでもキャンセル可能です。</span>' +
          '<span class="en">All tasks unlock immediately after sign-up. Cancel anytime.</span></p>' +
        '</div>' +
        '<div class="ac">' +
          '<button class="btn btn-gh" type="button" onclick="document.getElementById(\'tckSubBd\').remove()">' +
            '<span class="jp">閉じる</span><span class="en">Close</span>' +
          '</button>' +
          '<a class="btn btn-pri" href="' + billingHref + '">' +
            '<span class="jp">サブスクを開始</span><span class="en">Start subscription</span>' +
            '<span>→</span>' +
          '</a>' +
        '</div>' +
      '</div>';
    bd.addEventListener('click', function (e) { if (e.target === bd) bd.remove(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape' && document.getElementById('tckSubBd')) {
        bd.remove();
        document.removeEventListener('keydown', esc);
      }
    });
    document.body.appendChild(bd);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ============================================================
   First-Attempt capture for Predicted Score integrity.
   ----------------------------------------------------------
   TOEFL is a one-shot test, so the most honest predictor of
   real performance is the FIRST attempt at each practice.
   Subsequent retakes still get useful learning value, but
   they're tallied separately as "Mastery Rate" — they never
   inflate the Predicted Score.

   Implementation: monkey-patch sessionStorage.setItem so that
   the first time a `training_score_{task}_p{N}` value is
   written, we mirror it to localStorage as
   `training_first_{task}_p{N}` (and never overwrite). This
   means problem pages don't need to know about the convention
   — auth.js is loaded by every page, so the hook is universal.

   Also exposes `TCKAttempt.count(task, practice)` so problem
   pages can detect retries on load and show the retry modal.
   ============================================================ */
(function () {
  if (window.__TCKFirstAttemptInit) return;
  window.__TCKFirstAttemptInit = true;

  // Capture auth.js's own URL now (document.currentScript is valid during
  // this synchronous load) so we can lazy-load api.js later, from inside
  // the setItem hook, on pages that don't include it.
  var AUTH_SRC = (document.currentScript && document.currentScript.src) || (function () {
    var s = document.getElementsByTagName('script');
    for (var i = 0; i < s.length; i++) { if (/\/auth\.js(\?|#|$)/.test(s[i].src || '')) return s[i].src; }
    return '';
  })();

  // Tasks that DON'T already persist their attempts to the server on their
  // own get auto-saved here so their history survives a browser close and
  // follows the account across devices (same as the others). Excluded:
  //   ctw      → set files call Api.saveAnswers("CTW PN Set X")
  //   email/discussion → call Api.saveAnswers in finishWriting()
  //   lr/ti    → upload recordings to the RECORDINGS sheet
  // Auto-saving those would create duplicate / conflicting rows.
  var AUTO_SAVE_LABELS = {
    rdl: 'RDL', academic: 'Academic', lcr: 'LCR', conv: 'Conv',
    announce: 'Announce', talk: 'Talk', sentence: 'Sentence'
  };
  var _apiLoading = null, _lastSaved = {};
  function _ensureApi(cb) {
    if (typeof Api !== 'undefined' && Api.saveAnswers) return cb();
    if (_apiLoading) { _apiLoading.then(cb, function () {}); return; }
    if (!AUTH_SRC) return;
    var apiSrc = AUTH_SRC.replace(/\/auth\.js(\?[^#]*)?(#.*)?$/, '/api.js$1');
    _apiLoading = new Promise(function (resolve, reject) {
      var t = document.createElement('script');
      t.src = apiSrc; t.onload = resolve; t.onerror = reject;
      document.head.appendChild(t);
    });
    _apiLoading.then(function () { if (typeof Api !== 'undefined' && Api.saveAnswers) cb(); }, function () {});
  }

  var origSet = sessionStorage.setItem.bind(sessionStorage);
  sessionStorage.setItem = function (key, value) {
    origSet(key, value);
    var m = String(key).match(/^training_score_(.+)_p(\d+)$/);
    if (!m) return;
    var task = m[1], practice = m[2];
    var firstKey = 'training_first_' + task + '_p' + practice;
    var countKey = 'training_attempts_' + task + '_p' + practice;
    try {
      var d = JSON.parse(value);
      if (!d || typeof d.total !== 'number') return;
      // Lock in the first completed attempt forever.
      if (!localStorage.getItem(firstKey)) {
        localStorage.setItem(firstKey, JSON.stringify({
          correct: d.correct, total: d.total,
          capturedAt: new Date().toISOString()
        }));
      }
      // Bump attempt counter (used for retry-modal display).
      var n = parseInt(localStorage.getItem(countKey) || '0', 10) || 0;
      localStorage.setItem(countKey, String(n + 1));

      // (1) Mirror the LATEST score to localStorage (persists across a
      // browser close on the SAME device — sessionStorage does not). This
      // alone fixes "scores vanished on my PC" for every task, with no
      // backend. history-sync later overwrites with server truth when online.
      try { localStorage.setItem('training_score_' + task + '_p' + practice, value); } catch (e) {}

      // (1b) Keep the BEST score for the menu badge — a worse retake must
      // never lower it (history-sync maintains the same key from server data).
      try {
        if (typeof d.correct === 'number' && typeof d.total === 'number' && d.total > 0) {
          var _bk = 'training_best_' + task + '_p' + practice;
          var _cb = JSON.parse(localStorage.getItem(_bk) || 'null');
          var _better = !_cb || typeof _cb.correct !== 'number' || typeof _cb.total !== 'number' || !(_cb.total > 0)
            || (d.correct / d.total) > (_cb.correct / _cb.total)
            || ((d.correct / d.total) === (_cb.correct / _cb.total) && d.total > _cb.total);
          if (_better) localStorage.setItem(_bk, JSON.stringify({ correct: d.correct, total: d.total }));
        }
      } catch (e) {}

      // (2) Auto-save to the server for tasks that don't persist on their
      // own, so their history follows the account across devices. answers is
      // an array of length=total so the server can derive the question count.
      var label = AUTO_SAVE_LABELS[task];
      if (label) {
        var sig = task + '_p' + practice + '=' + value;
        if (_lastSaved[task + '_p' + practice] !== sig) {  // de-dupe identical writes
          _lastSaved[task + '_p' + practice] = sig;
          var correct = d.correct, total = d.total;
          var meta = { harderCorrect: d.harderCorrect || 0, harderTotal: d.harderTotal || 0, attemptNumber: n + 1 };
          _ensureApi(function () {
            try { Api.saveAnswers(label + ' P' + practice, new Array(total).fill(0), correct, meta); } catch (e) {}
          });
        }
      }
    } catch (e) {}
  };

  window.TCKAttempt = {
    /** Returns number of completed attempts for this practice. */
    count: function (task, practice) {
      return parseInt(localStorage.getItem('training_attempts_' + task + '_p' + practice) || '0', 10) || 0;
    },
    /** Returns the first-attempt score, or null if not yet completed. */
    first: function (task, practice) {
      try { return JSON.parse(localStorage.getItem('training_first_' + task + '_p' + practice) || 'null'); }
      catch (e) { return null; }
    },
    /** Reset all first-attempt + counter data (for testing or admin). */
    resetAll: function () {
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf('training_first_') === 0 || k.indexOf('training_attempts_') === 0) {
          localStorage.removeItem(k);
        }
      });
    },

    /** Parse the current URL to (task, practice). Returns null if not
       a practice page. */
    parseUrl: function () {
      var p = location.pathname;
      if (/-answers\.html$|-tips\.html$/.test(p)) return null;
      var m = p.match(/\/(reading|listening|writing|speaking)\/(\w+)\/practice-(\d+)(?:-set-\d+)?\.html$/);
      if (!m) return null;
      return { task: m[2], practice: parseInt(m[3], 10) };
    },

    /** Auto-detect retake on the current practice page. If this is at
       least the 2nd attempt at this practice, show a modal explaining
       that Predicted Score keeps the first attempt and only Mastery
       updates. Called automatically on DOMContentLoaded. */
    maybeShowRetryModal: function () {
      var info = this.parseUrl();
      if (!info) return;
      var n = this.count(info.task, info.practice);
      if (n < 1) return;  // First time — no modal
      // Show at most ONCE per practice per browser session, so advancing
      // through a multi-page practice (e.g. CTW Set 1 → Set 2) or coming
      // back to a page doesn't keep re-popping the review modal. The intent
      // is "only when you start the practice".
      var shownKey = 'tck_retry_shown_' + info.task + '_p' + info.practice;
      try {
        if (sessionStorage.getItem(shownKey)) return;
        sessionStorage.setItem(shownKey, '1');
      } catch (e) {}
      _showRetryModal(n + 1);
    }
  };

  function _showRetryModal(attemptN) {
    if (document.getElementById('tckRetryBackdrop')) return;
    var css = document.createElement('style');
    css.textContent =
      '#tckRetryBackdrop{position:fixed;inset:0;background:rgba(15,21,17,.32);backdrop-filter:blur(4px);' +
        'display:flex;align-items:center;justify-content:center;padding:24px;z-index:9999;' +
        'animation:tckRetryFade .25s ease}' +
      '@keyframes tckRetryFade{from{opacity:0}to{opacity:1}}' +
      '#tckRetryModal{background:#fff;border-radius:18px;max-width:460px;width:100%;' +
        'box-shadow:0 24px 64px rgba(0,40,23,.24);overflow:hidden;font-family:"Manrope","Zen Kaku Gothic New",sans-serif;color:#0F1511;line-height:1.7;' +
        'animation:tckRetrySlide .35s cubic-bezier(.16,1,.3,1)}' +
      '@keyframes tckRetrySlide{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}' +
      '#tckRetryModal .rh{background:linear-gradient(135deg,#007646,#005434);color:#fff;padding:24px 28px 20px}' +
      '#tckRetryModal .ic{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.18);font-size:20px;margin-bottom:10px}' +
      '#tckRetryModal .kk{font-family:"Manrope",sans-serif;font-size:.7em;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.75);margin-bottom:3px}' +
      '#tckRetryModal .ti{font-size:1.3em;font-weight:800;letter-spacing:-0.01em}' +
      '#tckRetryModal .bd{padding:22px 28px}' +
      '#tckRetryModal .bd p{font-size:.92em;margin-bottom:12px}' +
      '#tckRetryModal .bd p:last-of-type{margin-bottom:0}' +
      '#tckRetryModal .bd strong{color:#005434;font-weight:700}' +
      '#tckRetryModal .pill{display:inline-flex;align-items:center;gap:6px;background:#FDF4F0;color:#8A3E24;font-family:"Manrope",sans-serif;font-size:.7em;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:999px;margin-bottom:12px}' +
      '#tckRetryModal .hint{background:#F7F4EB;border-left:3px solid #D4A349;padding:11px 14px;border-radius:6px;font-size:.8em;color:#5B6660;line-height:1.7;margin-top:14px}' +
      '#tckRetryModal .ac{padding:0 28px 24px;display:flex;gap:10px;justify-content:flex-end}' +
      '#tckRetryModal .b{font-family:"Manrope",sans-serif;font-weight:700;font-size:.86em;padding:10px 22px;border-radius:999px;border:none;cursor:pointer;letter-spacing:.02em}' +
      '#tckRetryModal .pr{background:#007646;color:#fff}' +
      '#tckRetryModal .pr:hover{background:#005434}' +
      '#tckRetryModal .gh{background:transparent;color:#5B6660;border:1px solid #E8E4D8}' +
      '#tckRetryModal .gh:hover{background:#E8E4D8;color:#0F1511}';
    document.head.appendChild(css);

    var bd = document.createElement('div');
    bd.id = 'tckRetryBackdrop';
    bd.innerHTML =
      '<div id="tckRetryModal" role="dialog" aria-modal="true">' +
        '<div class="rh">' +
          '<div class="ic">🔁</div>' +
          '<div class="kk">Retry Session</div>' +
          '<div class="ti">これは ' + attemptN + ' 回目 の挑戦です</div>' +
        '</div>' +
        '<div class="bd">' +
          '<span class="pill">⚡ Attempt #' + attemptN + '</span>' +
          '<p>予想スコアには <strong>最初に完了した結果のみ</strong> が反映されます（中断含む）。この練習の予想スコアは既に記録済みです。</p>' +
          '<p>このページは復習用として、何度でも取り組んでください。解き直した結果は <strong>「習得率（Mastery Rate）」</strong> に反映されます。</p>' +
          '<div class="hint">💡 TOEFL® テストは一発勝負。初回の素点が本番の実力を最も正確に予測します。じっくり復習して、解法の定着を目指しましょう。</div>' +
        '</div>' +
        '<div class="ac">' +
          '<button class="b gh" type="button" onclick="window.history.back()">戻る</button>' +
          '<button class="b pr" type="button" onclick="document.getElementById(\'tckRetryBackdrop\').remove()">復習を始める</button>' +
        '</div>' +
      '</div>';
    bd.addEventListener('click', function (e) { if (e.target === bd) bd.remove(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape' && document.getElementById('tckRetryBackdrop')) {
        bd.remove();
        document.removeEventListener('keydown', esc);
      }
    });
    if (document.body) document.body.appendChild(bd);
    else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(bd); });
  }

  // Auto-trigger on practice pages.
  function _autoCheck() {
    if (window.TCKAttempt) window.TCKAttempt.maybeShowRetryModal();
    _startHeartbeat();
  }

  /* Heartbeat keeps last_seen_at on the USERS sheet fresh so admin
     can show "active now". Skip if Api isn't loaded (e.g. login page
     before session) or if user isn't signed in. */
  function _startHeartbeat() {
    if (window.__TCKHeartbeatStarted) return;
    if (typeof Api === 'undefined' || !Api.heartbeat) return;
    var u = (function(){ try { return JSON.parse(sessionStorage.getItem('kickstart_user') || '{}'); } catch(e){ return {}; }})();
    if (!u.userId) return;
    window.__TCKHeartbeatStarted = true;
    function ping() { try { Api.heartbeat().catch(function(){}); } catch (e) {} }
    ping();                            // immediate
    setInterval(ping, 2 * 60 * 1000);  // every 2 min while page open
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoCheck);
  } else {
    _autoCheck();
  }
})();

/* ============================================================
   ASCII-only input lock for English-language tasks.
   ----------------------------------------------------------
   TOEFL is English-only, so any answer field on a practice page
   should reject IME input (Japanese, Chinese, etc.). The classic
   `lang="en" inputmode="latin"` attributes don't actually block
   IME on most desktop browsers — users can still commit JP text.
   We listen for `input` and `compositionend` events on every
   text input / textarea inside a problem page (URL-scoped), and
   strip every non-ASCII printable character on the way out.
   Cursor is restored to a sensible position so typing flow isn't
   visibly disrupted.
   ============================================================ */
(function () {
  if (window.__TCKAsciiInit) return;
  window.__TCKAsciiInit = true;

  function isPracticePage() {
    var p = location.pathname;
    if (/-answers\.html$|-tips\.html$/.test(p)) return false;
    return /\/(reading|listening|writing|speaking)\//.test(p);
  }

  /* Keep ASCII printable + tab + newline. Strips Japanese / emoji /
     accented Latin (TOEFL accepts only plain English ASCII). */
  function stripNonAscii(s) {
    return String(s || '').replace(/[^\x20-\x7E\n\r\t]/g, '');
  }

  function attach(el) {
    if (el.__tckAsciiBound) return;
    el.__tckAsciiBound = true;

    /* Layer 1: block IME composition before any character renders.
       Firefox + Chromium honor preventDefault on compositionstart and
       refuse to begin the composition session at all. WebKit ignores
       this; Layer 2 catches it there. */
    el.addEventListener('compositionstart', function (e) {
      e.preventDefault();
      try { el.blur(); el.focus(); } catch (e2) {}
    });

    /* Layer 2: cancel non-ASCII insertion at the input layer. The
       beforeinput event fires before the value mutates and can be
       cancelled for both keystrokes and IME commits in modern
       browsers. */
    el.addEventListener('beforeinput', function (e) {
      var data = e.data;
      var t = e.inputType || '';
      if ((t === 'insertText' || t === 'insertCompositionText' || t === 'insertFromPaste' ||
           t === 'insertFromDrop' || t === 'insertFromComposition') &&
          data && /[^\x20-\x7E\n\r\t]/.test(data)) {
        e.preventDefault();
      }
    });

    /* Layer 3: post-mutation safety net for browsers that didn't
       honor the cancellation. Strips anything that slipped through
       and rolls the cursor back so typing still feels natural. */
    el.addEventListener('compositionend', function () {
      var clean = stripNonAscii(el.value);
      if (clean !== el.value) el.value = clean;
    });
    el.addEventListener('input', function () {
      var clean = stripNonAscii(el.value);
      if (clean !== el.value) {
        var pos = el.selectionStart;
        el.value = clean;
        try { el.setSelectionRange(pos - 1, pos - 1); } catch (e) {}
      }
    });

    /* Paste — strip non-ASCII from clipboard payload before insertion. */
    el.addEventListener('paste', function (e) {
      var txt = (e.clipboardData || window.clipboardData).getData('text');
      if (/[^\x20-\x7E\n\r\t]/.test(txt)) {
        e.preventDefault();
        var clean = stripNonAscii(txt);
        var s = el.selectionStart, eEnd = el.selectionEnd, v = el.value;
        el.value = v.slice(0, s) + clean + v.slice(eEnd);
        try { el.setSelectionRange(s + clean.length, s + clean.length); } catch (e2) {}
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  function bindAll() {
    if (!isPracticePage()) return;
    var nodes = document.querySelectorAll('input[type="text"], input:not([type]), textarea');
    for (var i = 0; i < nodes.length; i++) attach(nodes[i]);
  }

  // Re-bind on DOM mutations: many practice pages render inputs after
  // the user clicks Start, so the initial query misses them.
  function watchMutations() {
    if (!isPracticePage()) return;
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (!n.querySelectorAll) continue;
          if ((n.tagName === 'INPUT' && (n.type === 'text' || !n.type)) ||
              n.tagName === 'TEXTAREA') attach(n);
          var kids = n.querySelectorAll('input[type="text"], input:not([type]), textarea');
          for (var k = 0; k < kids.length; k++) attach(kids[k]);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bindAll();
      watchMutations();
    });
  } else {
    bindAll();
    watchMutations();
  }
})();

/* ============================================================
   Admin overlay loader — when an admin opens an answer page with
   ?fromAdmin=1, lazily inject js/admin-answer-overlay.js so the
   student's saved submission is fetched and rendered on top of
   the answer key. The overlay script itself decides whether to do
   anything (it checks the URL params and the page DOM).

   We resolve the path relative to *this* auth.js file so the
   include works no matter how deep the page lives in the tree
   (e.g. /writing/email/practice-3-answers.html → ../../js/...).
   ============================================================ */
(function(){
  if (typeof location === 'undefined') return;
  if (location.search.indexOf('fromAdmin=1') === -1) return;
  var here = (document.currentScript && document.currentScript.src) || '';
  if (!here) {
    // Fallback: scan all script tags for one ending in /auth.js.
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i].src || '';
      if (/\/auth\.js(\?|$)/.test(s)) { here = s; break; }
    }
  }
  if (!here) return;
  var overlaySrc = here.replace(/\/auth\.js(\?[^#]*)?(\#.*)?$/, '/admin-answer-overlay.js$1');
  var tag = document.createElement('script');
  tag.src = overlaySrc;
  tag.defer = true;
  document.head.appendChild(tag);
})();

/* ============================================================
   Student-history loader — on answer / tips pages (NOT in admin
   mode), inject js/student-history.js so the logged-in student
   can review their past attempts. Symmetric to the admin loader
   above; same path-resolution trick relative to auth.js.
   ============================================================ */
(function(){
  if (typeof location === 'undefined') return;
  if (location.search.indexOf('fromAdmin=1') !== -1) return; // admin path handles this
  if (!/practice-\d+(?:-set-\d+)?(?:-answers|-tips)\.html(?:[?#]|$)/.test(location.pathname + location.search)) return;
  var here = (document.currentScript && document.currentScript.src) || '';
  if (!here) {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i].src || '';
      if (/\/auth\.js(\?|$)/.test(s)) { here = s; break; }
    }
  }
  if (!here) return;
  var historySrc = here.replace(/\/auth\.js(\?[^#]*)?(\#.*)?$/, '/student-history.js$1');
  var tag = document.createElement('script');
  tag.src = historySrc;
  tag.defer = true;
  document.head.appendChild(tag);
})();
