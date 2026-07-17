/**
 * GAS API 通信モジュール — Practice Test (模試) 用
 *
 * 2系統の GAS を使い分け:
 *  - API_URL (PT 自前):   ログイン・getQuestions・旧 saveAnswer など。
 *                         PT 独自の users/answers シートを参照。JSON 応答。
 *  - REC_URL (TT 集約):   録音アップロードと PT 結果保存。Task Training の
 *                         GAS に集約してスタッフが一元管理できるように。
 *                         JSONP 応答 (callback ラップ) なので fetch で .json()
 *                         してはいけない — script タグ注入で読む。
 */

// PT 自前の GAS — ログイン用 (JSON で返す)
const API_URL = 'https://script.google.com/macros/s/AKfycbwylm042co9aSzwlQG_nV8ZxyMEFtr0VGhL5i6hqHXoLLfNA8YJOLrpJriw0NdTWvZG2Q/exec';

// Task Training の GAS — 録音アップロード + PT 結果保存用 (JSONP で返す)
const REC_URL = 'https://script.google.com/macros/s/AKfycbwjI8n86Cu1ar1IsPffyq9mboDrUNpG-SsVpFtURjP6AmCFHD3Zbw5_qcJJUksz_UDyyw/exec';

const API = {
  async login(id, pass) {
    const url = `${API_URL}?action=login&id=${encodeURIComponent(id)}&pass=${encodeURIComponent(pass)}`;
    const res = await fetch(url, { redirect: 'follow' });
    return res.json();
  },

  async getQuestions(section) {
    const url = `${API_URL}?action=getQuestions&section=${encodeURIComponent(section)}`;
    const res = await fetch(url, { redirect: 'follow' });
    return res.json();
  },

  async saveAnswer(userId, section, answers) {
    const res = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ action: 'saveAnswer', userId, section, answers })
    });
    return res.json();
  },

  async saveAudio(userId, questionId, audioBase64) {
    const res = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ action: 'saveAudio', userId, questionId, audioBase64 })
    });
    return res.json();
  }
};

/* JSONP helper for cross-origin GAS calls (login/recover/results work
   fine via script-tag injection because they're GET-only and small). */
function _ptJsonp(url) {
  return new Promise(function(resolve, reject){
    var cb = '_ptCb_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    var to = setTimeout(function(){
      delete window[cb];
      if (s.parentNode) s.parentNode.removeChild(s);
      reject(new Error('timeout'));
    }, 15000);
    window[cb] = function(data){
      clearTimeout(to);
      delete window[cb];
      if (s.parentNode) s.parentNode.removeChild(s);
      resolve(data);
    };
    var s = document.createElement('script');
    s.src = url + '&callback=' + cb;
    s.onerror = function(){
      clearTimeout(to);
      delete window[cb];
      if (s.parentNode) s.parentNode.removeChild(s);
      reject(new Error('network'));
    };
    document.head.appendChild(s);
  });
}

/* ============================================================
   SAVE RELAY + durable OUTBOX for Practice-Test RESULTS
   ------------------------------------------------------------
   The mock-exam result save used to be a single fire-and-forget JSONP to
   script.google.com. In environments that block direct writes to that host
   (privacy/security software, school/office filters — the 前田様 case) EVERY
   result save silently failed and the score was lost. The task-side app
   already routes saves through a same-origin Cloudflare relay + a durable
   outbox; this ports the SAME proven pattern to the Practice Test:
     1. relay-GET first (YOUR domain → Worker → GAS, defeats domain blocks),
     2. direct JSONP fallback (never worse than before),
     3. a localStorage outbox so a failed save is retried on the next load
        instead of vanishing. GAS dedups by sessionId, so re-sends never
        create duplicate rows.
   ============================================================ */
var PT_SAVE_PROXY_URL = 'https://tck-save.nicolas-umuyashiki.workers.dev/';

function _ptProxyGet(url) {
  if (!PT_SAVE_PROXY_URL || typeof fetch !== 'function') return Promise.reject(new Error('no_proxy'));
  var qi = url.indexOf('?');
  var qs = qi >= 0 ? url.slice(qi) : '';
  var target = PT_SAVE_PROXY_URL.replace(/\/$/, '') + '/' + qs;
  var p = fetch(target, { method: 'GET' }).then(function (r) {
    if (!r.ok) throw new Error('proxy_http_' + r.status);
    return r.text();
  }).then(function (txt) {
    try { var o = JSON.parse(txt); if (o && typeof o === 'object') return o; } catch (e) {}
    var m = txt && txt.match(/\{[\s\S]*\}/);
    if (m) { try { var o2 = JSON.parse(m[0]); if (o2 && typeof o2 === 'object') return o2; } catch (e2) {} }
    throw new Error('proxy_bad_response');
  });
  var t = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('proxy_timeout')); }, 12000); });
  return Promise.race([p, t]);
}

var _PT_OUTBOX_KEY = 'tck_pt_outbox';
function _ptOutboxRead() { try { return JSON.parse(localStorage.getItem(_PT_OUTBOX_KEY) || '[]') || []; } catch (e) { return []; } }
function _ptOutboxWrite(a) { try { localStorage.setItem(_PT_OUTBOX_KEY, JSON.stringify(a.slice(-50))); } catch (e) {} }
// Upsert by id (a re-save of the same sessionId replaces, never duplicates).
function _ptOutboxAdd(it) { var a = _ptOutboxRead().filter(function (x) { return x && x.id !== it.id; }); a.push(it); _ptOutboxWrite(a); }
function _ptOutboxRemove(id) { var a = _ptOutboxRead(); var n = a.filter(function (x) { return x && x.id !== id; }); if (n.length !== a.length) _ptOutboxWrite(n); }

// Send one queued result: relay-GET first, then direct JSONP.
function _ptSendResult(item) {
  return _ptProxyGet(REC_URL + item.qs).then(function (res) {
    if (res && res.success !== false) return res;
    return _ptJsonp(REC_URL + item.qs);   // relay reachable but GAS declined → direct
  }, function () {
    return _ptJsonp(REC_URL + item.qs);   // relay blocked/errored → direct
  });
}

var _ptFlushing = false;
function _ptFlushOutbox() {
  if (_ptFlushing) return Promise.resolve();
  var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
  if (!u.userId) return Promise.resolve();
  var arr = _ptOutboxRead();
  if (!arr.length) return Promise.resolve();
  _ptFlushing = true;
  var i = 0;
  function step() {
    if (i >= arr.length) { _ptFlushing = false; return Promise.resolve(); }
    var item = arr[i++];
    item.tries = (item.tries || 0) + 1;
    _ptOutboxAdd(item);   // persist the incremented try count
    return _ptSendResult(item).then(function (res) {
      // Both channels return a readable object, so success is verifiable —
      // remove on confirmed success, or after 6 tries give up retrying.
      if ((res && res.success !== false) || item.tries >= 6) _ptOutboxRemove(item.id);
    }, function () {}).then(function () {
      return new Promise(function (r) { setTimeout(r, 500); }).then(step);
    });
  }
  return step().then(null, function () { _ptFlushing = false; });
}

/* POST helper (hidden iframe form-submit) for bodies too LARGE for a JSONP GET
   URL — e.g. archived answer contents. Same transport as uploadRecording, so it
   bypasses the GAS 302 → CORS issue. Resolves when the iframe loads (best-effort
   archival; a not-yet-deployed endpoint simply no-ops). */
function _ptPost(data) {
  return new Promise(function(resolve){
    var name = 'ptPost_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    var iframe = document.createElement('iframe');
    iframe.name = name; iframe.style.display = 'none';
    document.body.appendChild(iframe);
    var form = document.createElement('form');
    form.method = 'POST'; form.action = REC_URL; form.target = name;
    form.enctype = 'application/x-www-form-urlencoded'; form.acceptCharset = 'UTF-8';
    form.style.display = 'none';
    Object.keys(data).forEach(function(k){
      var inp = document.createElement('input');
      inp.type = 'hidden'; inp.name = k; inp.value = data[k];
      form.appendChild(inp);
    });
    document.body.appendChild(form);
    var done = false;
    function cleanup(r){ if (done) return; done = true;
      setTimeout(function(){
        try { form.parentNode && form.parentNode.removeChild(form); } catch(e){}
        try { iframe.parentNode && iframe.parentNode.removeChild(iframe); } catch(e){}
      }, 250);
      resolve(r);
    }
    iframe.onload = function(){ cleanup({ success: true }); };
    setTimeout(function(){ cleanup({ success: true, timeout: true }); }, 30000);
    form.submit();
  });
}

/* Lower-case `Api` mirror — speaking-recorder-hook.js looks for this name.
   Uses hidden iframe form-submit POST to bypass the GAS 302 → CORS issue
   that causes plain fetch to lose the body. Same pattern as Task Training. */
var Api = {
  uploadRecording: function(meta, base64Audio){
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var data = {
      action:        'uploadRecording',
      source:        'pt',                                // <- Practice Test marker
      userId:        u.userId   || sessionStorage.getItem('practice_test_user') || 'anon',
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
    return new Promise(function(resolve){
      var name = 'gasUpload_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
      var iframe = document.createElement('iframe');
      iframe.name = name;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      var form = document.createElement('form');
      form.method = 'POST';
      form.action = REC_URL;  // Task Training の集約 GAS へ
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
      function cleanup(r){
        if (done) return; done = true;
        setTimeout(function(){
          try { form.parentNode && form.parentNode.removeChild(form); } catch(e){}
          try { iframe.parentNode && iframe.parentNode.removeChild(iframe); } catch(e){}
        }, 250);
        resolve(r);
      }
      iframe.onload = function(){ cleanup({ success: true, transparent: true }); };
      setTimeout(function(){ cleanup({ success: true, timeout: true }); }, 30000);
      form.submit();
    });
  },

  /* Save the current Practice Test result (every attempt — no dedup) */
  savePtResult: function(payload){
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var qs = '?action=savePtResult'
      + '&userId='   + encodeURIComponent(u.userId   || '')
      + '&userName=' + encodeURIComponent(u.userName || '')
      + '&sessionId='+ encodeURIComponent(payload.sessionId || '')
      + '&readingCorrect='   + encodeURIComponent(payload.readingCorrect   || 0)
      + '&readingTotal='     + encodeURIComponent(payload.readingTotal     || 0)
      + '&readingScaled='    + encodeURIComponent(payload.readingScaled    || 0)
      + '&listeningCorrect=' + encodeURIComponent(payload.listeningCorrect || 0)
      + '&listeningTotal='   + encodeURIComponent(payload.listeningTotal   || 0)
      + '&listeningScaled='  + encodeURIComponent(payload.listeningScaled  || 0)
      + '&writingSentCorrect=' + encodeURIComponent(payload.writingSentCorrect || 0)
      + '&writingSentTotal='   + encodeURIComponent(payload.writingSentTotal   || 0)
      + '&writingScaled='      + encodeURIComponent(payload.writingScaled || 0)
      + '&speakingLr=' + (payload.speakingLr ? 'true' : 'false')
      + '&speakingTi=' + (payload.speakingTi ? 'true' : 'false')
      + '&total=' + encodeURIComponent(payload.total || 0)
      + '&band='  + encodeURIComponent(payload.band  || '')
      + '&readingPath=' + encodeURIComponent(payload.readingPath || '')
      + '&testId=' + encodeURIComponent(payload.testId || '');   // which mock (1/2/3) so the listening retake can target the right attempt
    // Durable-first: queue the result, then send relay-first (→ direct
    // fallback). A blocked/failed save is retried on the next load instead
    // of being lost. id = sessionId+testId so re-saves upsert (GAS also
    // dedups by sessionId → never a duplicate row).
    var item = { id: 'ptr_' + (payload.sessionId || '') + '_' + (payload.testId || ''), qs: qs, enqueuedAt: new Date().toISOString(), tries: 1 };
    _ptOutboxAdd(item);
    return _ptSendResult(item).then(function (res) {
      if (res && res.success !== false) _ptOutboxRemove(item.id);
      return res;
    }, function (err) {
      return { success: false, queued: true, error: String((err && err.message) || err) };
    });
  },

  /* Re-send any Practice-Test results the server hasn't confirmed yet, and
     report how many are still pending — used on load and by the save chip. */
  flushPtOutbox: function () { return _ptFlushOutbox(); },
  ptOutboxPending: function () { return _ptOutboxRead().length; },

  /* Fetch all past Practice Test results for the current user */
  listPtResults: function(){
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    return _ptJsonp(REC_URL + '?action=listPtResults&userId=' + encodeURIComponent(u.userId || ''));
  },

  /* Archive the raw per-question ANSWER CONTENTS for a mock attempt so they can
     be recovered/audited later. PT_RESULTS stores scores only; this stores what
     the learner actually selected. Keyed by (userId, sessionId) and upserted
     server-side (same sessionId → overwrite, e.g. a listening retake replaces
     that attempt's listening answers). Large body → POST. Best-effort: if the
     GAS endpoint is not deployed yet it degrades to a no-op and never blocks the
     score save. */
  savePtAnswers: function(sessionId, answersObj){
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var json; try { json = JSON.stringify(answersObj || {}); } catch(e){ json = '{}'; }
    return _ptPost({
      action:      'savePtAnswers',
      userId:      u.userId   || '',
      userName:    u.userName || '',
      sessionId:   String(sessionId || ''),
      answersJson: json
    });
  },

  /* Fetch archived answer contents for (current user, sessionId) — recovery/audit. */
  getPtAnswers: function(sessionId){
    var u = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    return _ptJsonp(REC_URL + '?action=getPtAnswers&userId=' + encodeURIComponent(u.userId || '') + '&sessionId=' + encodeURIComponent(sessionId || ''));
  }
};

/* On every load, retry any Practice-Test results the server has not
   confirmed yet — so a mock score lost to a blocked/failed save (前田様
   type environment) eventually reaches the server on a later visit. */
try { setTimeout(function () { try { _ptFlushOutbox(); } catch (e) {} }, 1500); } catch (e) {}
try {
  var _ptLastVis = 0;
  function _ptVisFlush() {
    var now = Date.now();
    if (now - _ptLastVis < 10000) return;
    _ptLastVis = now;
    try { _ptFlushOutbox(); } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') _ptVisFlush(); });
  window.addEventListener('pageshow', _ptVisFlush);
  window.addEventListener('online', function () { setTimeout(_ptVisFlush, 1500); });
} catch (e) {}
