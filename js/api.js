/**
 * api.js — GAS API通信モジュール
 * 【重要】デプロイ後、下のURLを自分のGASウェブアプリURLに置換すること
 */
var API_URL = 'https://script.google.com/macros/s/AKfycbwSS8PVVtK0o9otRQ0cCPBFxoXeivf51aCbxpGcO0crCEyyyRynX74Z1lYXeKFyoHJr/exec';

var Api = {
  login: function(id, pass) {
    return fetch(API_URL + '?action=login&id=' + encodeURIComponent(id) + '&pass=' + encodeURIComponent(pass))
      .then(function(r) { return r.json(); });
  },

  register: function(id, pass, name, email) {
    var url = API_URL + '?action=register&id=' + encodeURIComponent(id)
      + '&pass=' + encodeURIComponent(pass)
      + '&name=' + encodeURIComponent(name)
      + '&email=' + encodeURIComponent(email || '');
    return fetch(url).then(function(r) { return r.json(); });
  },

  recover: function(email) {
    return fetch(API_URL + '?action=recover&email=' + encodeURIComponent(email))
      .then(function(r) { return r.json(); });
  },

  saveAnswers: function(setName, answers, score) {
    var user = JSON.parse(sessionStorage.getItem('kickstart_user') || '{}');
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'saveAnswers',
        userId: user.userId || '',
        userName: user.userName || '',
        set: setName,
        answers: answers,
        score: score
      })
    }).then(function(r) { return r.json(); });
  }
};
