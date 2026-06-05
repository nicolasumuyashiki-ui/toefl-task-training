/**
 * api.js — GAS API通信モジュール (JSONP方式)
 * Google Workspace アカウントのGASはCORS制約があるため、
 * scriptタグ注入 (JSONP) でリダイレクト問題を回避する。
 * GAS側の doGet に callback パラメータ対応が必要。
 */
var API_URL = 'https://script.google.com/macros/s/AKfycbwjI8n86Cu1ar1IsPffyq9mboDrUNpG-SsVpFtURjP6AmCFHD3Zbw5_qcJJUksz_UDyyw/exec';

var _jsonpCounter = 0;

function _jsonpRequest(url) {
  return new Promise(function(resolve, reject) {
    var cbName = '_gasCallback_' + (++_jsonpCounter) + '_' + Date.now();
    var timeout = setTimeout(function() {
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('Request timeout'));
    }, 15000);

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
  saveAnswers: function(setName, answers, score, meta) {
    var user = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    meta = meta || {};
    var url = API_URL + '?action=saveAnswers'
      + '&userId=' + encodeURIComponent(user.userId || '')
      + '&userName=' + encodeURIComponent(user.userName || '')
      + '&set=' + encodeURIComponent(setName)
      + '&answers=' + encodeURIComponent(JSON.stringify(answers))
      + '&score=' + encodeURIComponent(score)
      + '&harderCorrect=' + encodeURIComponent(meta.harderCorrect || 0)
      + '&harderTotal=' + encodeURIComponent(meta.harderTotal || 0)
      + '&attemptNumber=' + encodeURIComponent(meta.attemptNumber || 1);
    return _jsonpRequest(url);
  },

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
