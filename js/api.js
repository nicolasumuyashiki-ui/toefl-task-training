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

  saveAnswers: function(setName, answers, score) {
    var user = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    var url = API_URL + '?action=saveAnswers'
      + '&userId=' + encodeURIComponent(user.userId || '')
      + '&userName=' + encodeURIComponent(user.userName || '')
      + '&set=' + encodeURIComponent(setName)
      + '&answers=' + encodeURIComponent(JSON.stringify(answers))
      + '&score=' + encodeURIComponent(score);
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
  }
};
