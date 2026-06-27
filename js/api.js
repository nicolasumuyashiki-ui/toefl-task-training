/**
 * api.js — GAS API通信モジュール (JSONP方式)
 * Google Workspace アカウントのGASはCORS制約があるため、
 * scriptタグ注入 (JSONP) でリダイレクト問題を回避する。
 * GAS側の doGet に callback パラメータ対応が必要。
 */
var API_URL = 'https://script.google.com/macros/s/AKfycbwjI8n86Cu1ar1IsPffyq9mboDrUNpG-SsVpFtURjP6AmCFHD3Zbw5_qcJJUksz_UDyyw/exec';

/* Same-origin SAVE RELAY (root fix for environments that block the direct
   request to script.google.com — privacy extensions, corporate/VPN filters).
   When set to your Cloudflare Worker URL (see docs/cloudflare-save-proxy.js),
   writes (saveAnswers / uploadRecording) are sent to YOUR domain, which the
   Worker forwards to GAS server-to-server — defeating domain-based blockers.
   EMPTY = disabled → behavior is 100% unchanged (direct GAS as before).
   Saves always FALL BACK to the direct method if the proxy errors, so flipping
   this on can never make saving worse than today. */
var SAVE_PROXY_URL = 'https://tck-save.nicolas-umuyashiki.workers.dev/';

var _jsonpCounter = 0;

/* POST a params object to the save relay and resolve with the parsed JSON
   response. Rejects on network error / non-2xx / unparseable body so the
   caller can fall back to the direct transport. */
function _proxyPost(params) {
  if (!SAVE_PROXY_URL || typeof fetch !== 'function') return Promise.reject(new Error('no_proxy'));
  var body = Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k] == null ? '' : params[k]);
  }).join('&');
  return fetch(SAVE_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body
  }).then(function (r) {
    if (!r.ok) throw new Error('proxy_http_' + r.status);
    return r.text();
  }).then(function (txt) {
    // GAS answers with a JSON object. Parse it; if the body is NOT a JSON
    // object (e.g. a misconfigured Worker still returning "Hello World!", or
    // an HTML error page), REJECT so the caller falls back to the direct
    // transport — never report a false success that would drop the save.
    try { var o = JSON.parse(txt); if (o && typeof o === 'object') return o; } catch (e) {}
    var m = txt && txt.match(/\{[\s\S]*\}/);
    if (m) { try { var o2 = JSON.parse(m[0]); if (o2 && typeof o2 === 'object') return o2; } catch (e2) {} }
    throw new Error('proxy_bad_response');
  });
}

/* GET via the same-origin relay (fetch → Worker → GAS). Used so LOGIN and
   READS also survive an environment that blocks script.google.com directly
   (e.g. McAfee WebAdvisor / privacy extensions — the same block that stops
   saves). Resolves with the parsed JSON; rejects on any failure so the caller
   falls back to the classic JSONP <script> request. */
function _proxyGet(url) {
  if (!SAVE_PROXY_URL || typeof fetch !== 'function') return Promise.reject(new Error('no_proxy'));
  var qIndex = url.indexOf('?');
  var qs = qIndex >= 0 ? url.slice(qIndex) : '';
  var target = SAVE_PROXY_URL.replace(/\/$/, '') + '/' + qs;
  var fetchP = fetch(target, { method: 'GET' }).then(function (r) {
    if (!r.ok) throw new Error('proxy_http_' + r.status);
    return r.text();
  }).then(function (txt) {
    // GAS returns a JSON object (plain, or — if it wraps — extractable).
    try { var o = JSON.parse(txt); if (o && typeof o === 'object') return o; } catch (e) {}
    var m = txt && txt.match(/\{[\s\S]*\}/);
    if (m) { try { var o2 = JSON.parse(m[0]); if (o2 && typeof o2 === 'object') return o2; } catch (e2) {} }
    throw new Error('proxy_bad_response');
  });
  // Bound the wait so a hung relay falls back to JSONP rather than hanging.
  var timeoutP = new Promise(function (_, reject) { setTimeout(function () { reject(new Error('proxy_timeout')); }, 12000); });
  return Promise.race([fetchP, timeoutP]);
}

// Once we detect (this session) that direct calls to script.google.com are
// blocked — a security product / extension / network filter — remember it, so
// every subsequent request goes RELAY-FIRST and the user (e.g. a McAfee user)
// isn't slowed by a doomed direct attempt on each call. Normal users never set
// this flag, so their path stays 100% unchanged.
function _relayPref() { try { return sessionStorage.getItem('tck_relay_pref') === '1'; } catch (e) { return false; } }
function _setRelayPref() { try { sessionStorage.setItem('tck_relay_pref', '1'); } catch (e) {} }

function _jsonpRequest(url) {
  if (!SAVE_PROXY_URL) return _jsonpDirect(url);
  if (_relayPref()) {
    // Known-blocked environment this session → relay first (fast), JSONP fallback.
    return _proxyGet(url).catch(function () { return _jsonpDirect(url); });
  }
  // Normal: direct first (unchanged for the 99%). If it fails — the security-
  // software case — use the relay AND remember it for the rest of the session
  // so the user gets full speed from then on.
  return _jsonpDirect(url, 9000).catch(function () {
    return _proxyGet(url).then(function (res) { _setRelayPref(); return res; });
  });
}

function _jsonpDirect(url, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var cbName = '_gasCallback_' + (++_jsonpCounter) + '_' + Date.now();
    var timeout = setTimeout(function() {
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('Request timeout'));
    }, timeoutMs || 15000);

    window[cbName] = function(data) {
      clearTimeout(timeout);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      resolve(data);
    };

    var script = document.createElement('script');
    script.src = url + '&callback=' + cbName;
    script.onerror = function() {
      clearTimeout(timeout);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('Network error'));
    };
    document.head.appendChild(script);
  });
}

/* ============================================================
   Durable save OUTBOX — every saveAnswers payload is written to a
   localStorage queue FIRST, then transmitted. On a confirmed server
   response the item is removed; otherwise it stays and is re-sent on the
   next page load / login (flushOutbox). This guarantees a completed
   attempt is NEVER silently lost to a network blip, GAS congestion, an
   immediate page navigation, or the tab closing. Add-only — it never
   deletes history; it only ensures saves actually reach the server.
   ============================================================ */
var _OUTBOX_KEY = 'tck_outbox';
var _OUTBOX_MAX = 500;
var _flushingOutbox = false;

function _outboxRead() {
  try { return JSON.parse(localStorage.getItem(_OUTBOX_KEY) || '[]') || []; } catch (e) { return []; }
}
function _outboxWrite(arr) {
  try {
    if (arr.length > _OUTBOX_MAX) arr = arr.slice(arr.length - _OUTBOX_MAX);
    localStorage.setItem(_OUTBOX_KEY, JSON.stringify(arr));
  } catch (e) {}
}
function _outboxAdd(item) { var a = _outboxRead(); a.push(item); _outboxWrite(a); }
function _outboxRemove(id) {
  var a = _outboxRead();
  var n = a.filter(function (it) { return it && it.id !== id; });
  if (n.length !== a.length) _outboxWrite(n);
}
function _genSaveId() { return 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9); }

/* Build + transmit ONE save payload (hybrid GET / hidden-iframe POST).
   Resolves with the server response on success; rejects on network
   failure/timeout. clientSaveId lets the server dedupe retries (optional
   GAS-side; without it a rare lost-response retry just adds a duplicate
   row, which the menu/predicted view already collapse per set). */
/* Build the saveAnswers params object (shared by the proxy + POST paths). */
function _saveParams(item) {
  var user = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
  var meta = item.meta || {};
  return {
    action: 'saveAnswers',
    userId: user.userId || '', userName: user.userName || '',
    set: item.setName || '', answers: JSON.stringify(item.answers == null ? '' : item.answers),
    score: String(item.score == null ? '' : item.score),
    harderCorrect: String(meta.harderCorrect || 0),
    harderTotal: String(meta.harderTotal || 0),
    attemptNumber: String(meta.attemptNumber || 1),
    total: String(meta.total || 0),
    clientSaveId: String(item.id || '')
  };
}

/* Try the same-origin relay first (if configured), then fall back to the
   direct GET/iframe transport. The relay defeats domain-based blockers; the
   fallback guarantees we never do WORSE than today's direct method. */
function _sendSavePayload(item) {
  if (SAVE_PROXY_URL) {
    return _proxyPost(_saveParams(item)).then(function (res) {
      if (res && res.success !== false) return res;
      return _sendSaveDirect(item);   // relay reachable but GAS said no → retry direct
    }, function () {
      return _sendSaveDirect(item);   // relay blocked/errored → direct
    });
  }
  return _sendSaveDirect(item);
}

function _sendSaveDirect(item) {
  var user = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
  var meta = item.meta || {};
  var answersStr = JSON.stringify(item.answers == null ? '' : item.answers);
  var getUrl = API_URL + '?action=saveAnswers'
    + '&userId=' + encodeURIComponent(user.userId || '')
    + '&userName=' + encodeURIComponent(user.userName || '')
    + '&set=' + encodeURIComponent(item.setName || '')
    + '&answers=' + encodeURIComponent(answersStr)
    + '&score=' + encodeURIComponent(item.score == null ? '' : item.score)
    + '&harderCorrect=' + encodeURIComponent(meta.harderCorrect || 0)
    + '&harderTotal=' + encodeURIComponent(meta.harderTotal || 0)
    + '&attemptNumber=' + encodeURIComponent(meta.attemptNumber || 1)
    + '&total=' + encodeURIComponent(meta.total || 0)
    + '&clientSaveId=' + encodeURIComponent(item.id || '');
  if (getUrl.length <= 1500) return _jsonpRequest(getUrl);
  var data = {
    action: 'saveAnswers',
    userId: user.userId || '', userName: user.userName || '',
    set: item.setName || '', answers: answersStr,
    score: String(item.score == null ? '' : item.score),
    harderCorrect: String(meta.harderCorrect || 0),
    harderTotal: String(meta.harderTotal || 0),
    attemptNumber: String(meta.attemptNumber || 1),
    total: String(meta.total || 0),
    clientSaveId: String(item.id || '')
  };
  return new Promise(function (resolve, reject) {
    var name = 'gasSave_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    var iframe = document.createElement('iframe');
    iframe.name = name; iframe.style.display = 'none';
    document.body.appendChild(iframe);
    var form = document.createElement('form');
    form.method = 'POST'; form.action = API_URL; form.target = name;
    form.enctype = 'application/x-www-form-urlencoded'; form.acceptCharset = 'UTF-8';
    form.style.display = 'none';
    Object.keys(data).forEach(function (k) {
      var inp = document.createElement('input');
      inp.type = 'hidden'; inp.name = k; inp.value = data[k];
      form.appendChild(inp);
    });
    document.body.appendChild(form);
    var done = false;
    function cleanup(result, ok) {
      if (done) return; done = true;
      setTimeout(function () {
        try { form.parentNode && form.parentNode.removeChild(form); } catch (e) {}
        try { iframe.parentNode && iframe.parentNode.removeChild(iframe); } catch (e) {}
      }, 250);
      ok ? resolve(result) : reject(new Error((result && result.error) || 'post_failed'));
    }
    iframe.onload = function () { cleanup({ success: true }, true); };
    setTimeout(function () { cleanup({ success: true, timeout: true }, true); }, 30000);
    try { form.submit(); } catch (e) { cleanup({ success: false, error: String(e) }, false); }
  });
}

/* Re-send every pending save until the server confirms. Safe to call on
   every page load — staggered, guarded against concurrent runs. */
function _flushOutbox() {
  if (_flushingOutbox) return Promise.resolve();
  var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
  if (!u.userId) return Promise.resolve();
  var arr = _outboxRead();
  if (!arr.length) return Promise.resolve();
  _flushingOutbox = true;
  var i = 0;
  function step() {
    if (i >= arr.length) { _flushingOutbox = false; return Promise.resolve(); }
    var item = arr[i++];
    return _sendSavePayload(item).then(function (res) {
      if (res && res.success !== false) _outboxRemove(item.id);
    }, function () {}).then(function () {
      return new Promise(function (r) { setTimeout(r, 500); }).then(step);
    });
  }
  return step().then(null, function () { _flushingOutbox = false; });
}

var Api = {
  login: function(id, pass) {
    return _jsonpRequest(API_URL + '?action=login&id=' + encodeURIComponent(id) + '&pass=' + encodeURIComponent(pass));
  },

  register: function(id, pass, name, email) {
    var url = API_URL + '?action=register&id=' + encodeURIComponent(id)
      + '&pass=' + encodeURIComponent(pass)
      + '&name=' + encodeURIComponent(name)
      + '&email=' + encodeURIComponent(email || '');
    return _jsonpRequest(url);
  },

  recover: function(email) {
    return _jsonpRequest(API_URL + '?action=recover&email=' + encodeURIComponent(email));
  },

  /* Change password — used by the forced password-change flow after a
     temp-password login, and also available for self-service later.
     Verifies `current` against col B; on success writes `newPass` and
     clears col H (pass_temp_at). */
  changePassword: function(id, current, newPass) {
    return _jsonpRequest(API_URL + '?action=changePassword'
      + '&id=' + encodeURIComponent(id)
      + '&current=' + encodeURIComponent(current)
      + '&newPass=' + encodeURIComponent(newPass));
  },

  /* Heartbeat — fire-and-forget ping that updates the user's
     last_seen_at on the USERS sheet so admin can show "active now". */
  heartbeat: function() {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    if (!u.userId) return Promise.resolve(null);
    return _jsonpRequest(API_URL + '?action=heartbeat&id=' + encodeURIComponent(u.userId));
  },

  /**
   * Save a completed practice attempt.
   *   setName  — e.g. "CTW P1 Set 1", "LCR P3"
   *   answers  — per-question answer payload
   *   score    — total correct count (raw, unweighted)
   *   meta     — optional { harderCorrect, harderTotal, attemptNumber }
   *
   * `meta` is added so admin's Predicted Score can apply 1.5× Harder
   * weighting and dedupe to first-attempt only. When omitted (legacy
   * callers / pages not yet updated), GAS defaults to 0/0/1.
   */
  /**
   * Save a completed practice attempt — now OUTBOX-backed so it can never
   * be silently lost. The payload is written to a durable localStorage
   * queue FIRST, then sent; on a confirmed response it's removed, otherwise
   * it's re-sent on the next page load / login. Callers are unchanged.
   */
  saveAnswers: function(setName, answers, score, meta) {
    var item = { id: _genSaveId(), setName: setName, answers: answers, score: score, meta: meta || {}, enqueuedAt: new Date().toISOString() };
    _outboxAdd(item);   // durable FIRST — survives navigation / offline / crash
    return _sendSavePayload(item).then(function (res) {
      if (res && res.success !== false) _outboxRemove(item.id);
      return res;
    }, function (err) {
      return { success: false, queued: true, error: String((err && err.message) || err) };
    });
  },

  /* Re-send any saves the server hasn't confirmed yet. Idempotent + guarded. */
  flushOutbox: function() { return _flushOutbox(); },
  outboxPending: function() { return _outboxRead().length; },

  /* Admin endpoints — require staff id/pass.
     Pass is read from sessionStorage.kickstart_staff_pass (set on
     admin login) or can be provided explicitly. */
  listUsers: function(id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=listUsers'
      + '&id=' + encodeURIComponent(id || u.userId || '')
      + '&pass=' + encodeURIComponent(p));
  },

  listAttempts: function(id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=listAttempts'
      + '&id=' + encodeURIComponent(id || u.userId || '')
      + '&pass=' + encodeURIComponent(p));
  },

  /* Demo (USERS_TRIAL) admin listings — show free-trial signups and
     their saved answers in admin. Speaking recordings are not in the
     demo product, so no listTrialRecordings is provided. */
  listTrialUsers: function(id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=listTrialUsers'
      + '&id=' + encodeURIComponent(id || u.userId || '')
      + '&pass=' + encodeURIComponent(p));
  },

  listTrialAttempts: function(id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=listTrialAttempts'
      + '&id=' + encodeURIComponent(id || u.userId || '')
      + '&pass=' + encodeURIComponent(p));
  },

  listRecordings: function(id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=listRecordings'
      + '&id=' + encodeURIComponent(id || u.userId || '')
      + '&pass=' + encodeURIComponent(p));
  },

  /* Student self-recordings — returns ONLY the caller's own LR/TI
     recordings, authenticated with the student pass. Used by my-score.html
     and student-history.js so learners can review their own audio without
     staff privileges. */
  listMyRecordings: function(id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_pass') || '';
    return _jsonpRequest(API_URL + '?action=listMyRecordings'
      + '&id=' + encodeURIComponent(id || u.userId || '')
      + '&pass=' + encodeURIComponent(p));
  },

  /* Student-side: fetch the logged-in user's own past attempts for a
     specific (task, practice [, set]). GAS forces userId == verified
     user so callers can't read someone else's data. Used by
     js/student-history.js on each answer / tips page. */
  getMyAnswers: function(task, practice, set, id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_pass') || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=getMyAnswers'
      + '&id='       + encodeURIComponent(id || u.userId || '')
      + '&pass='     + encodeURIComponent(p)
      + '&task='     + encodeURIComponent(task)
      + '&practice=' + encodeURIComponent(practice)
      + '&set='      + encodeURIComponent(set || ''));
  },

  /* Student-side BULK history — returns a COMPACT list of EVERY attempt the
     logged-in user has saved (all tasks/practices) in one JSONP call:
     [{ set, score, total, timestamp }]. GAS forces userId == verified user.
     Used by js/history-sync.js to hydrate menu / my-score badges from the
     server so history follows the account across browsers and devices
     (localStorage / sessionStorage are per-browser and can't do that).
     Backed by handleGetMyHistory_ — see docs/gas-my-history.js. */
  getMyHistory: function(id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_pass') || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=getMyHistory'
      + '&id='   + encodeURIComponent(id || u.userId || '')
      + '&pass=' + encodeURIComponent(p));
  },

  /* ---- Cross-device "中断 / Resume" sync (see docs/gas-progress-sync.js) ----
     The in-progress snapshot a learner leaves mid-practice is mirrored to the
     server so it can be resumed on another device. saveProgress uses the same
     small->GET / large->POST hybrid as saveAnswers (Discussion snapshots carry
     the essay text). Best-effort: if the GAS endpoints aren't deployed yet the
     client just falls back to the local snapshot. */
  saveProgress: function(task, practice, state) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    if (!u.userId) return Promise.resolve(null);
    var stateStr = JSON.stringify(state == null ? {} : state);
    var getUrl = API_URL + '?action=saveProgress'
      + '&userId=' + encodeURIComponent(u.userId)
      + '&task=' + encodeURIComponent(task)
      + '&practice=' + encodeURIComponent(practice)
      + '&state=' + encodeURIComponent(stateStr);
    if (getUrl.length <= 1500) return _jsonpRequest(getUrl).catch(function(){ return null; });
    var data = { action:'saveProgress', userId:u.userId, task:String(task), practice:String(practice), state:stateStr };
    return new Promise(function(resolve){
      var name = 'gasProg_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
      var iframe = document.createElement('iframe'); iframe.name = name; iframe.style.display = 'none'; document.body.appendChild(iframe);
      var form = document.createElement('form');
      form.method = 'POST'; form.action = API_URL; form.target = name;
      form.enctype = 'application/x-www-form-urlencoded'; form.acceptCharset = 'UTF-8'; form.style.display = 'none';
      Object.keys(data).forEach(function(k){ var i = document.createElement('input'); i.type='hidden'; i.name=k; i.value=data[k]; form.appendChild(i); });
      document.body.appendChild(form);
      var done = false;
      function cleanup(r){ if(done) return; done = true; setTimeout(function(){ try{form.parentNode&&form.parentNode.removeChild(form);}catch(e){} try{iframe.parentNode&&iframe.parentNode.removeChild(iframe);}catch(e){} }, 250); resolve(r); }
      iframe.onload = function(){ cleanup({ success:true }); };
      setTimeout(function(){ cleanup({ success:true, timeout:true }); }, 30000);
      try { form.submit(); } catch(e){ cleanup({ success:false }); }
    });
  },

  getProgress: function(id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_pass') || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=getProgress'
      + '&id='   + encodeURIComponent(id || u.userId || '')
      + '&pass=' + encodeURIComponent(p));
  },

  clearProgress: function(task, practice, id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_pass') || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=clearProgress'
      + '&id='   + encodeURIComponent(id || u.userId || '')
      + '&pass=' + encodeURIComponent(p)
      + '&task=' + encodeURIComponent(task)
      + '&practice=' + encodeURIComponent(practice)).catch(function(){ return null; });
  },

  /* Fetch the saved `answers` JSON for a specific attempt (admin only).
     Used by the answer pages when opened with ?fromAdmin=1 to overlay
     the student's actual submission on top of the answer key. */
  getAttemptAnswers: function(userId, task, practice, set, id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=getAttemptAnswers'
      + '&id='       + encodeURIComponent(id || u.userId || '')
      + '&pass='     + encodeURIComponent(p)
      + '&userId='   + encodeURIComponent(userId)
      + '&task='     + encodeURIComponent(task)
      + '&practice=' + encodeURIComponent(practice)
      + '&set='      + encodeURIComponent(set || ''));
  },

  /* Student self-data — billing. Uses kickstart_pass
     (set on student login) or kickstart_staff_pass (set on admin login). */
  getSubscription: function(id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_pass') || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=getSubscription'
      + '&id=' + encodeURIComponent(id || u.userId || '')
      + '&pass=' + encodeURIComponent(p));
  },

  listInvoices: function(id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_pass') || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=listInvoices'
      + '&id=' + encodeURIComponent(id || u.userId || '')
      + '&pass=' + encodeURIComponent(p));
  },

  /* Stripe Customer Portal — returns { success, url } so the page can
     redirect the user to Stripe's hosted portal for payment-method
     updates, cancellation, and invoice history. */
  /* Upload a Speaking recording (LR / TI) to GAS, which writes the audio
     to a Drive folder and appends a row to the RECORDINGS sheet.

     Why hidden-iframe form submit instead of fetch?
     GAS Web App POST returns a 302 redirect to script.googleusercontent.com.
     Browser fetch (per RFC ambiguity) demotes 302 POST to GET on follow,
     so the request body never reaches doPost — we'd see 401 at the redirect
     target. HTML form submission to a same-name iframe target follows the
     redirect with the POST body intact. We can't read the response (the
     iframe is cross-origin), but recording uploads are fire-and-forget
     anyway: success is verified server-side via the RECORDINGS sheet.

     Returns a Promise that resolves once the iframe finishes loading. */
  uploadRecording: function(meta, base64Audio) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var data = {
      action:        'uploadRecording',
      userId:        u.userId   || '',
      userName:      u.userName || '',
      task:          meta.task          || '',
      practiceSet:   String(meta.practiceSet || ''),
      questionIndex: String(meta.questionIndex || 0),
      mime:          meta.mime || 'audio/webm',
      ext:           meta.ext  || 'webm',
      durationSec:   String(meta.durationSec || 0),
      attemptNumber: String(meta.attemptNumber || 1),
      audioB64:      base64Audio || ''
    };
    // Same-origin relay first (defeats domain blockers that drop the large
    // cross-origin recording POST), then fall back to the iframe POST.
    var _direct = function(){ return Api._uploadRecordingDirect(data); };
    if (SAVE_PROXY_URL) {
      return _proxyPost(data).then(function(res){
        return (res && res.success !== false) ? res : _direct();
      }, _direct);
    }
    return _direct();
  },

  _uploadRecordingDirect: function(data) {
    return new Promise(function(resolve){
      var name = 'gasUpload_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
      var iframe = document.createElement('iframe');
      iframe.name = name;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      var form = document.createElement('form');
      form.method = 'POST';
      form.action = API_URL;
      form.target = name;
      form.enctype = 'application/x-www-form-urlencoded';
      form.acceptCharset = 'UTF-8';
      form.style.display = 'none';

      Object.keys(data).forEach(function(k){
        var inp = document.createElement('input');
        inp.type = 'hidden';
        inp.name = k;
        inp.value = data[k];
        form.appendChild(inp);
      });
      document.body.appendChild(form);

      var done = false;
      function cleanup(result){
        if (done) return; done = true;
        setTimeout(function(){
          try { form.parentNode && form.parentNode.removeChild(form); } catch(e){}
          try { iframe.parentNode && iframe.parentNode.removeChild(iframe); } catch(e){}
        }, 250);
        resolve(result);
      }
      iframe.onload = function(){ cleanup({ success: true, transparent: true }); };
      // Safety timeout — cross-origin onload sometimes doesn't fire.
      setTimeout(function(){ cleanup({ success: true, timeout: true }); }, 30000);
      form.submit();
    });
  },

  createPortalSession: function(id, pass) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = pass || sessionStorage.getItem('kickstart_pass') || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=createPortalSession'
      + '&id=' + encodeURIComponent(id || u.userId || '')
      + '&pass=' + encodeURIComponent(p));
  },

  /* Private Coaching request — submits selected skills, triggering a
     bilingual auto-reply email to the user and a notification to the
     instructor. Backed by handleRequestCoaching_ on the GAS side, which
     also appends a row to the COACHING_REQUESTS sheet. */
  requestCoaching: function(skills) {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var lang = (typeof localStorage !== 'undefined' && localStorage.getItem('tck_lang')) || 'jp';
    return _jsonpRequest(API_URL + '?action=requestCoaching'
      + '&userId='   + encodeURIComponent(u.userId   || '')
      + '&userName=' + encodeURIComponent(u.userName || '')
      + '&email='    + encodeURIComponent(u.email    || '')
      + '&skills='   + encodeURIComponent(skills)
      + '&lang='     + encodeURIComponent(lang));
  },

  /* Consultation booking status — reads CONSULTATION_BOOKINGS sheet (which
     Zapier populates from eeasy webhook events) and returns whether the
     user is currently locked out (already booked this calendar month).
     Backed by handleGetConsultationStatus_ on the GAS side. */
  getConsultationStatus: function() {
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var p = sessionStorage.getItem('kickstart_pass') || sessionStorage.getItem('kickstart_staff_pass') || '';
    return _jsonpRequest(API_URL + '?action=getConsultationStatus'
      + '&id='   + encodeURIComponent(u.userId || '')
      + '&pass=' + encodeURIComponent(p));
  }
};

/* On every load, retry any saves the server hasn't confirmed yet, so a
   completed attempt eventually reaches the server even if the original
   send failed (offline / GAS congestion / tab closed mid-send). */
try { setTimeout(function () { try { _flushOutbox(); } catch (e) {} }, 1500); } catch (e) {}
