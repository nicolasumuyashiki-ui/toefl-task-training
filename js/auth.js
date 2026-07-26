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

/* ============================================================
   PERMANENT LOCAL LEDGER — a completed record must NEVER disappear from the
   learner's device, whether or not it reached the server. Every OTHER store
   can lose a record: training_score_* is purged on an account switch and can
   be overwritten by a server re-hydrate that lost the row; tck_outbox is
   cleared once "sent" (or, previously, dropped after N tries). This ledger is
   the ONE store that is only ever appended to / merged into — no code path
   deletes from it. It is keyed per account (tck_ledger_<uid>) so one learner
   never SEES another's records, but nobody's records are ever destroyed: when
   a learner returns to their own account, their work is restored from here
   even if the server never received it. (Owner requirement, restated many
   times: "サーバーに送られようがローカルに留まろうが記録だけは絶対に消さない".)
   ============================================================ */
(function (global) {
  if (global.TCKLedger) return;
  var RE = /^(training_score_|training_best_|training_first_|training_attempts_|training_answers_|tck_done_|tck_hwm_|tck_progress_)/;
  function lkey(uid) { return 'tck_ledger_' + uid; }
  function readL(uid) { try { return JSON.parse(localStorage.getItem(lkey(uid)) || '{}') || {}; } catch (e) { return {}; } }
  function writeL(uid, o) { try { localStorage.setItem(lkey(uid), JSON.stringify(o)); } catch (e) {} }
  function pj(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  // A 0-score auto-graded attempt (correct 0 of a real total) is an
  // "opened / quit midway", NOT a completion — never immortalise it as a
  // reflected score. (Owner rule: 正式に完了した取り組み以外はスコア反映しない.)
  function zeroScore(k, raw) {
    if (String(k).indexOf('training_score_') !== 0) return false;
    var d = pj(raw); return !!(d && d.total > 0 && (d.correct || 0) === 0);
  }

  /* Merge ONE display key into `store` with a never-lose / never-lower rule.
     Returns the merged raw string value for that key. `base` is the value to
     start from (the ledger's current value, or the live value on restore). */
  function mergeVal(k, base, incoming) {
    if (incoming == null) return base;
    if (base == null) return incoming;
    if (k.indexOf('training_best_') === 0) {
      var nb = pj(incoming), cb = pj(base);
      var better = !cb || !(cb.total > 0) || (nb && nb.total > 0 && (nb.correct / nb.total) > (cb.correct / cb.total));
      return better ? incoming : base;
    }
    if (k.indexOf('training_attempts_') === 0) {
      return String(Math.max(parseInt(incoming, 10) || 0, parseInt(base, 10) || 0));
    }
    if (k.indexOf('training_score_') === 0 || k.indexOf('tck_progress_') === 0) {
      var ns = pj(incoming), cs = pj(base);
      var nt = (ns && (ns.updatedAt || ns.capturedAt)) || '';
      var ct = (cs && (cs.updatedAt || cs.capturedAt)) || '';
      return (nt >= ct) ? incoming : base;   // keep the latest attempt
    }
    // training_first_ / tck_done_ / training_answers_ / tck_hwm_ → set-if-absent
    return base;
  }

  var TCKLedger = {
    // Permanently record one completed key under uid (append/merge only).
    record: function (uid, k, rawVal) {
      if (!uid || !k || rawVal == null || !RE.test(k)) return;
      if (zeroScore(k, rawVal)) return;   // don't keep an abandoned 0-score
      var store = readL(uid);
      store[k] = mergeVal(k, store[k] == null ? null : store[k], rawVal);
      writeL(uid, store);
    },
    // Snapshot ALL of an account's live display keys before they are purged.
    archive: function (uid) {
      if (!uid) return;
      var store = readL(uid), touched = false;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (!k || !RE.test(k)) continue;
          var raw = localStorage.getItem(k);
          if (zeroScore(k, raw)) continue;   // skip abandoned 0-score attempts
          store[k] = mergeVal(k, store[k] == null ? null : store[k], raw);
          touched = true;
        }
      } catch (e) {}
      if (touched) writeL(uid, store);
    },
    // Restore an account's kept records into the live keys (merge; never lower).
    restore: function (uid) {
      if (!uid) return;
      var store = readL(uid);
      Object.keys(store).forEach(function (k) {
        try {
          var live = localStorage.getItem(k);
          localStorage.setItem(k, mergeVal(k, live, store[k]));
        } catch (e) {}
      });
    }
  };
  global.TCKLedger = TCKLedger;
})(window);

/* ============================================================
   Account-cache isolation — prevents one account's history/scores from
   showing under ANOTHER account on the SAME browser.

   The per-account DISPLAY cache (training_score_*, training_best_*,
   tck_done_*, tck_progress_*, tck_hwm_* …) lives in shared localStorage and
   is NOT namespaced by user. Without this, logging into account B on a
   browser that previously held account A's data shows A's scores/history
   under B (observed: logging into a learner's account, then a test account,
   on the same device). On a detected account CHANGE we purge ONLY the
   previous account's display cache so it cannot leak; history-sync then
   re-hydrates the correct account from the SERVER.

   The SERVER (ANSWERS sheet) is the source of truth and is NEVER touched
   here — so a learner's own history is never deleted. When they log back
   into their own account, their real history simply reloads from the server.
   ============================================================ */
(function () {
  try {
    if (typeof localStorage === 'undefined' || typeof sessionStorage === 'undefined') return;
    var u = null;
    try { u = JSON.parse(sessionStorage.getItem('kickstart_user') || 'null'); } catch (e) {}
    var uid = (u && u.userId) ? String(u.userId) : '';
    if (!uid) return;                       // logged out → nothing to isolate
    var prev = localStorage.getItem('tck_cache_uid');
    if (prev && prev !== uid) {
      // A different account used this browser before → purge its display cache
      // FROM VIEW so it can't show under the new account. But first archive it
      // permanently so it is HIDDEN, never DESTROYED: the leaving learner gets
      // it all back (restore()) the moment they log into their own account
      // again — even for work the server never received.
      if (window.TCKLedger) { try { window.TCKLedger.archive(prev); } catch (e) {} }
      var kill = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^(training_score_|training_best_|training_first_|training_attempts_|training_answers_|tck_done_|tck_progress_|tck_hwm_|tck_retry_shown_)/.test(k)) kill.push(k);
      }
      for (var j = 0; j < kill.length; j++) { try { localStorage.removeItem(kill[j]); } catch (e) {} }
      // NEVER delete not-yet-sent saves. Each outbox item carries its OWN
      // captured owner (item.user), so it flushes under the RIGHT account and is
      // never mis-attributed. Only stamp owner-less legacy items with the
      // LEAVING account so the new session can't accidentally claim them.
      try {
        var _ob = JSON.parse(localStorage.getItem('tck_outbox') || '[]') || [];
        var _obChanged = false;
        for (var _oi = 0; _oi < _ob.length; _oi++) {
          if (_ob[_oi] && (!_ob[_oi].user || !_ob[_oi].user.userId)) { _ob[_oi].user = { userId: prev, userName: '' }; _obChanged = true; }
        }
        if (_obChanged) localStorage.setItem('tck_outbox', JSON.stringify(_ob));
      } catch (e) {}
      // SAME-TAB switch: sessionStorage survives a login change in the same
      // tab, so the previous user's in-tab results (ctw_p*_answers_*,
      // lcrAnswers, convAnswers, …) would render as the new user's own on
      // answer pages — and CTW's renderAll would even mirror them into the
      // new user's local score cache. Purge every display/result key too.
      try {
        var skill = [];
        for (var si = 0; si < sessionStorage.length; si++) {
          var sk = sessionStorage.key(si);
          if (sk && /^(training_|ctw_p\d+_answers_|ctwL_|tck_(seeded|stu_restored|admin_att|admin_restored|retry_shown|hist_cache|sub_status|reconcile_pushed)_|lcrAnswers$|convAnswers$|announceAnswers$|talkPractice\d+Answers$|sentenceAnswers(_p\d+)?$|(email|discussion)Response(_p\d+)?$)/.test(sk)) skill.push(sk);
        }
        for (var sj = 0; sj < skill.length; sj++) { try { sessionStorage.removeItem(skill[sj]); } catch (e) {} }
      } catch (e) {}
    }
    if (prev !== uid) { try { localStorage.setItem('tck_cache_uid', uid); } catch (e) {} }
    // On EVERY load, first snapshot whatever completed work is live right now
    // into this account's immortal ledger (captures auto-graded scores AND
    // free-response done-markers / answers written directly to localStorage),
    // then bring the ledger back into the live keys (merge; never lowers, never
    // deletes). Net effect: any completed record is continuously immortalised
    // and self-heals — work that only ever lived on this device (server never
    // got it) is restored whenever the learner is on their own account, and
    // survives anything that clears the live keys.
    if (window.TCKLedger && uid) {
      try { window.TCKLedger.archive(uid); } catch (e) {}
      try { window.TCKLedger.restore(uid); } catch (e) {}
    }
  } catch (e) {}
})();

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
    if (!u || !el) return;
    // The badge is a SMALL circular avatar (≈28px). Show ONE initial, never
    // the full name: a long name (e.g. "屋敷 ニコラ") overflowed the circle,
    // wrapped one character per line, and pushed the whole page wider than the
    // phone screen → horizontal scroll on mobile (the speaker photo then looked
    // "cut off"). Full name is kept in the title tooltip.
    var name = String(u.userName || u.userId || '?').trim();
    el.textContent = name ? name.charAt(0).toUpperCase() : '?';
    try { el.title = name; } catch (e) {}
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
  // Admin "回答を見る" opens answer pages with ?fromAdmin=1 to overlay a
  // STUDENT's answers. Those pages — and admin-answer-overlay's renderAll() —
  // write training_score_* / ctw_p*_answers_* through this hooked setItem. If we
  // mirrored or auto-saved them, the STUDENT's data would land in the ADMIN's
  // own localStorage (menu-badge contamination — another student's scores show
  // up as the admin's) and, for auto-saved tasks, on the server under the admin.
  // In admin-view we pass straight through to sessionStorage only: the overlay
  // display still works, but nothing touches the admin's durable record. The
  // flag is sticky per-tab so it survives in-page navigation.
  var _isAdminView = (function () {
    try {
      if (/[?&]fromAdmin=1(?:&|$)/.test(location.search)) { try { origSet('tck_admin_view', '1'); } catch (e) {} return true; }
      return sessionStorage.getItem('tck_admin_view') === '1';
    } catch (e) { return false; }
  })();
  sessionStorage.setItem = function (key, value) {
    if (_isAdminView) { origSet(key, value); return; }  // admin view: sessionStorage only, never mirror/save
    origSet(key, value);
    // CTW set results only live in sessionStorage (the set pages save to the
    // server themselves, so they're excluded from the training_answers_
    // mirror below). Mirror them to durable localStorage so the answers
    // page can restore "yesterday's" attempt on the same device.
    if (/^ctw_p\d+_answers_[12]$/.test(String(key))) {
      try { localStorage.setItem(key, value); } catch (e) {}
      // DEVICE-LOCAL "done" for CTW — independent of the server.
      // Every other auto-graded task writes training_score_<task>_pN, which the
      // block below mirrors to localStorage so its menu badge appears the instant
      // the learner finishes, WHETHER OR NOT the save reached the server. CTW was
      // the sole exception: its set pages only store ctw_pN_answers_SET + push
      // "CTW PN Set X" to the server, and never write training_score_ctw_pN — so
      // the reading-menu CTW badge appeared ONLY after history-sync hydrated the
      // SERVER rows. If that save never landed (offline / relay down / stale
      // api.js), a finished CTW practice showed as NOT done, and the recovery
      // banner couldn't see CTW either. Fold the two per-set snapshots (this
      // write + whatever the other set stored, session or the localStorage mirror
      // above) into an aggregate training_score_ctw_pN so the badge is driven by
      // THIS device's own record. CTW is excluded from AUTO_SAVE_LABELS and from
      // history-sync's reconcile, so this creates NO extra server write and NO
      // phantom row — it only fixes the on-device display.
      try {
        var _cpm = String(key).match(/^ctw_p(\d+)_answers_[12]$/);
        if (_cpm) {
          var _cpn = _cpm[1], _cCorr = 0, _cTot = 0, _cSeen = 0;
          for (var _csi = 1; _csi <= 2; _csi++) {
            var _csk = 'ctw_p' + _cpn + '_answers_' + _csi;
            var _craw = (_csk === String(key)) ? value
              : (sessionStorage.getItem(_csk) || localStorage.getItem(_csk));
            if (!_craw) continue;
            var _csd = JSON.parse(_craw);
            // Only count a set the learner actually ENGAGED with — at least one
            // blank filled in. A set left entirely empty (opened then left /
            // clicked through) is not a real attempt and must never reflect,
            // otherwise a finished 20/20 could drop after someone merely reopens
            // a set and abandons it. A genuinely-attempted set that scored 0
            // (all wrong) IS counted. (Owner rule: 解答解説に到達＝実際に解答した回
            // だけ反映。時間切れでも解答があれば反映。)
            var _cAnswered = _csd && Array.isArray(_csd.answers) && _csd.answers.some(function (x) { return x !== '' && x != null; });
            if (_csd && typeof _csd.score === 'number' && typeof _csd.total === 'number' && _csd.total > 0 && _cAnswered) {
              _cCorr += _csd.score; _cTot += _csd.total; _cSeen++;
            }
          }
          if (_cSeen > 0 && _cTot > 0) {
            // NEVER LOWER an already-recorded genuine CTW score from this path.
            // Recomputing from the two current per-set snapshots can under-count
            // when one set wasn't (re)done this session — e.g. a finished 20/20
            // where only one set is revisited. The badge must reflect the best
            // completed result (same as the server's best-per-set badge), so
            // only write when the aggregate does not reduce the current score.
            var _prevCtw = null;
            try { _prevCtw = JSON.parse(localStorage.getItem('training_score_ctw_p' + _cpn) || 'null'); } catch (e) {}
            // "Worse" = fewer sets counted (less complete, e.g. 10/10 vs a
            // finished 20/20 when only one set was revisited), or — at the same
            // completeness — a lower raw score. Either way, don't overwrite.
            var _worse = _prevCtw && typeof _prevCtw.correct === 'number' && _prevCtw.total > 0 &&
              (_cTot < _prevCtw.total || (_cTot === _prevCtw.total && _cCorr < _prevCtw.correct));
            if (!_worse) {
              // Re-enters this override on the training_score_ branch (which mirrors
              // to localStorage + best/first); CTW has no AUTO_SAVE label, so it is
              // NOT re-sent to the server. updatedAt=now marks it a fresh attempt.
              sessionStorage.setItem('training_score_ctw_p' + _cpn,
                JSON.stringify({ correct: _cCorr, total: _cTot, updatedAt: new Date().toISOString() }));
            }
          }
        }
      } catch (e) {}
    }
    // Email/Discussion submissions also only live in sessionStorage. The
    // key carries no practice number, so scope the durable mirror by the
    // page path to keep practices from overwriting each other.
    // Writing pages use an unscoped key on P1 (`emailResponse`) but a
    // practice-scoped one on P2..P10 (`emailResponse_pN`) — mirror both
    // forms to a durable practice-scoped localStorage copy.
    var wr = String(key).match(/^((?:email|discussion)Response)(_p\d+)?$/);
    if (wr) {
      if (wr[2]) {
        try { localStorage.setItem(key, value); } catch (e) {}
      } else {
        var pm = location.pathname.match(/\/writing\/(?:email|discussion)\/practice-(\d+)\.html$/i);
        if (pm) { try { localStorage.setItem(key + '_p' + pm[1], value); } catch (e) {} }
      }
    }
    var m = String(key).match(/^training_score_(.+)_p(\d+)$/);
    if (!m) return;
    var task = m[1], practice = m[2];
    var firstKey = 'training_first_' + task + '_p' + practice;
    var countKey = 'training_attempts_' + task + '_p' + practice;
    try {
      var d = JSON.parse(value);
      if (!d || typeof d.total !== 'number') return;
      // Mirror the page's selection snapshot to DURABLE localStorage so
      // reconcile can recover it on a later login if this attempt's immediate
      // save fails. (The page writes training_answers_* just before training_score.)
      try { var _ta = sessionStorage.getItem('training_answers_' + task + '_p' + practice); if (_ta) localStorage.setItem('training_answers_' + task + '_p' + practice, _ta); } catch (e) {}
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
      // Stamp updatedAt=now (when the page didn't) so the "latest-attempt wins"
      // switch-over recognises this as a NEW attempt even in another tab,
      // before the server round-trip.
      try {
        var _mirror = value;
        if (!d.updatedAt) { d.updatedAt = new Date().toISOString(); _mirror = JSON.stringify(d); }
        localStorage.setItem('training_score_' + task + '_p' + practice, _mirror);
      } catch (e) {}

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

      // (1c) PERMANENT LEDGER — record this completed attempt the instant it is
      // done, so it can NEVER disappear from this device: it survives the
      // account-switch purge, a server that never received it, and cache
      // eviction of the live keys. Keyed per account; restored on next login.
      try {
        var _luid = (JSON.parse(sessionStorage.getItem('kickstart_user') || '{}') || {}).userId || '';
        if (_luid && window.TCKLedger) {
          window.TCKLedger.record(_luid, 'training_score_' + task + '_p' + practice, localStorage.getItem('training_score_' + task + '_p' + practice));
          window.TCKLedger.record(_luid, 'training_best_' + task + '_p' + practice, localStorage.getItem('training_best_' + task + '_p' + practice));
          window.TCKLedger.record(_luid, 'training_first_' + task + '_p' + practice, localStorage.getItem(firstKey));
          window.TCKLedger.record(_luid, 'training_attempts_' + task + '_p' + practice, localStorage.getItem(countKey));
          var _la = localStorage.getItem('training_answers_' + task + '_p' + practice);
          if (_la) window.TCKLedger.record(_luid, 'training_answers_' + task + '_p' + practice, _la);
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
          // Record the real question count so the ANSWERS `total` column isn't
          // left 0 (display can also derive it from answers.length, but storing
          // it keeps the sheet honest for admin/export).
          var meta = { harderCorrect: d.harderCorrect || 0, harderTotal: d.harderTotal || 0, attemptNumber: n + 1, total: total };
          _ensureApi(function () {
            try {
              // Build a length=total answers array so getMyHistory still derives
              // the question count from .length. Fill REAL selected answers from
              // the page's training_answers_* snapshot when present (so Admin can
              // see what the student chose).
              // Unanswered slots are padded with null — NOT 0 — because conv /
              // announce / talk record the chosen option as a 0-BASED INDEX, so
              // 0 is a legitimate answer (choice A). Padding with 0 made a skipped
              // question indistinguishable from "picked A", which the server's
              // answered-count then read as a blank attempt. null is unambiguous.
              var ansArr = new Array(total).fill(null);
              try {
                var _raw = sessionStorage.getItem('training_answers_' + task + '_p' + practice);
                var _parsed = _raw ? JSON.parse(_raw) : null;
                if (Array.isArray(_parsed)) {
                  for (var _i = 0; _i < total; _i++) {
                    var _v = _parsed[_i];
                    if (_v !== undefined && _v !== null) ansArr[_i] = (_v && typeof _v === 'object' && 'selected' in _v) ? _v.selected : _v;
                  }
                } else if (_parsed && typeof _parsed === 'object') {
                  Object.keys(_parsed).forEach(function (k) {
                    var _idx = parseInt(String(k).replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(_idx)) {
                      var _pos = _idx >= 1 ? _idx - 1 : _idx;   // q-keys are 1-based
                      if (_pos >= 0 && _pos < total) {
                        var _w = _parsed[k];
                        ansArr[_pos] = (_w && typeof _w === 'object' && 'selected' in _w) ? _w.selected : _w;
                      }
                    }
                  });
                }
              } catch (e) {}
              Api.saveAnswers(label + ' P' + practice, ansArr, correct, meta);
            } catch (e) {}
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
   Language persistence — pages that carry .jp/.en spans but never
   set data-lang on <body> show BOTH languages at once and ignore
   the learner's saved preference (tck_lang). Apply the saved
   language globally when the page hasn't set it; pages that manage
   data-lang themselves (setLang handlers, static attribute) are
   left untouched. Every bilingual page repo-wide has symmetric
   jp/en pairs (verified), so hiding one side never blanks content.
   ============================================================ */
(function(){
  if (typeof document === 'undefined') return;
  function applyLang(){
    try {
      var b = document.body;
      if (!b || b.getAttribute('data-lang')) return;
      b.setAttribute('data-lang', localStorage.getItem('tck_lang') === 'en' ? 'en' : 'jp');
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyLang);
  else applyLang();
})();

/* ============================================================
   Review-restore seeding — every answer page reads the student's
   result from sessionStorage, which dies when the browser closes,
   so "open the answers page tomorrow" used to show 0 points and no
   answers. The attempt data survives in durable localStorage
   (mirrored on save), so: if the page's display key is missing but
   the localStorage mirror exists, copy it back and reload ONCE so
   the page's own inline renderer (which already ran with empty
   data — auth.js loads after it) re-renders with the real attempt.
   Cross-device restore (no localStorage either) is handled by
   student-history.js via the server. Admin mode is excluded — the
   admin overlay is the only writer there. Never touches scores.
   ============================================================ */
(function(){
  if (typeof location === 'undefined') return;
  if (location.search.indexOf('fromAdmin=1') !== -1) return;
  var m = location.pathname.match(/\/(reading|listening|writing|speaking)\/([a-z]+)\/practice-(\d+)(?:-set-\d+)?-answers\.html$/i);
  if (!m) return;
  var task = m[2].toLowerCase(), practice = m[3];
  var FLAG = 'tck_seeded_' + task + '_p' + practice;   // one-shot reload guard
  var seeded = false;
  // Native setter — bypasses the auto-save hook above (this is a restore
  // of an existing attempt, not a new one; it must never re-save).
  function rawSet(k, v) { Storage.prototype.setItem.call(sessionStorage, k, v); }
  function seed(sessKey, localKey, transform) {
    try {
      if (sessionStorage.getItem(sessKey) !== null) return;
      var raw = localStorage.getItem(localKey);
      if (raw == null) return;
      var v = transform ? transform(raw) : raw;
      if (v == null) return;
      rawSet(sessKey, v);
      seeded = true;
    } catch (e) {}
  }
  var ta = 'training_answers_' + task + '_p' + practice;
  if (task === 'rdl' || task === 'academic') {
    seed('training_' + task + '_p' + practice + '_answers', ta);
  } else if (task === 'lcr') {
    seed('lcrAnswers', ta);
  } else if (task === 'conv' || task === 'announce') {
    seed(task + 'Answers', ta);
  } else if (task === 'talk') {
    seed('talkPractice' + practice + 'Answers', ta);
  } else if (task === 'sentence') {
    // Sentence pages read a practice-scoped key everywhere except P1
    // (P1 = `sentenceAnswers`, P2..P10 = `sentenceAnswers_pN`).
    seed(String(practice) === '1' ? 'sentenceAnswers' : 'sentenceAnswers_p' + practice, ta, function (raw) {
      var arr = null, sc = null;
      try { arr = JSON.parse(raw); } catch (e) {}
      try { sc = JSON.parse(localStorage.getItem('training_score_sentence_p' + practice) || 'null'); } catch (e) {}
      if (!sc || typeof sc.correct !== 'number') return null;
      // Carry the attempt time (training_score updatedAt) so the answers page
      // can show the era-correct prompt for pre-#163 attempts on this device.
      return JSON.stringify({ answers: Array.isArray(arr) ? arr : [], score: sc.correct, total: sc.total || 10, ts: sc.updatedAt || sc.capturedAt || '' });
    });
  } else if (task === 'ctw') {
    seed('ctw_p' + practice + '_answers_1', 'ctw_p' + practice + '_answers_1');
    seed('ctw_p' + practice + '_answers_2', 'ctw_p' + practice + '_answers_2');
  } else if (task === 'email' || task === 'discussion') {
    // Page reads the unscoped key on P1, the practice-scoped one on P2..P10.
    seed(task + 'Response' + (String(practice) === '1' ? '' : '_p' + practice), task + 'Response_p' + practice);
  }
  if (seeded && sessionStorage.getItem(FLAG) !== '1') {
    try { rawSet(FLAG, '1'); location.reload(); } catch (e) {}
  }
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

/* ============================================================
   Save-guard loader — inject js/save-guard.js on EVERY page (for
   logged-in learners) so a save that didn't reach the server becomes
   visible with a one-tap resend, instead of being silently lost. The
   module no-ops for logged-out pages and is pure UI over the existing
   outbox (never touches save logic or history).
   ============================================================ */
(function(){
  if (typeof location === 'undefined') return;
  if (location.search.indexOf('fromAdmin=1') !== -1) return; // admin overlay path
  var here = (document.currentScript && document.currentScript.src) || '';
  if (!here) {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i].src || '';
      if (/\/auth\.js(\?|$)/.test(s)) { here = s; break; }
    }
  }
  if (!here) return;
  var guardSrc = here.replace(/\/auth\.js(\?[^#]*)?(\#.*)?$/, '/save-guard.js$1');
  var tag = document.createElement('script');
  tag.src = guardSrc;
  tag.defer = true;
  document.head.appendChild(tag);
})();

/* ============================================================
   Score-notice loader — inject js/score-notice.js ONLY on the main screens
   (skill menus + my-score), so the one-time dismissible score-fix banner
   shows there and never during a practice/test. Self-guards on URL too.
   ============================================================ */
(function(){
  if (typeof location === 'undefined') return;
  var pq = location.pathname + location.search;
  if (!(/\/menu\.html(?:[?#]|$)/.test(pq) || /\/my-score\.html(?:[?#]|$)/.test(pq))) return;
  var here = (document.currentScript && document.currentScript.src) || '';
  if (!here) {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i].src || '';
      if (/\/auth\.js(\?|$)/.test(s)) { here = s; break; }
    }
  }
  if (!here) return;
  var noticeSrc = here.replace(/\/auth\.js(\?[^#]*)?(\#.*)?$/, '/score-notice.js$1');
  var tag = document.createElement('script');
  tag.src = noticeSrc;
  tag.defer = true;
  document.head.appendChild(tag);
})();
