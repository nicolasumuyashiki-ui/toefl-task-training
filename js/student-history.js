/**
 * student-history.js
 *
 * Loaded automatically by js/auth.js on answer/tips pages (when not in
 * admin mode). Fetches the logged-in user's past attempts from GAS and
 * renders a "📜 これまでのあなたの回答" panel.
 *
 * Today only Writing (Email/Discussion) and Speaking (LR/TI) are wired
 * up — those are the non-auto-graded tasks where reviewing past
 * attempts adds the most value. The auto-graded tasks (CTW/LCR/etc.)
 * already show scores after each attempt.
 */
(function(){
  // Skip in admin mode — admin-answer-overlay.js owns the overlay.
  var qs = new URLSearchParams(location.search);
  if (qs.get('fromAdmin') === '1') return;

  // Match either practice-N-answers.html, practice-N-tips.html,
  // or practice-N-set-S-answers.html. (CTW uses the set form, but we
  // skip CTW for now — keep the regex permissive for future use.)
  var path = location.pathname;
  var match = path.match(/\/(reading|listening|writing|speaking)\/([a-z]+)\/practice-(\d+)(?:-set-(\d+))?(-answers|-tips)\.html/i);
  if (!match) return;
  var task     = match[2].toLowerCase();
  var practice = match[3];
  var setNum   = match[4] || '';

  // Need a logged-in student. (Admin sessions also have kickstart_user
  // but the fromAdmin guard above already excludes the admin overlay
  // path; an admin browsing the answer page directly would just see
  // their own — which they don't have — and the panel renders nothing.)
  var user = null;
  try { user = JSON.parse(sessionStorage.getItem('kickstart_user') || 'null'); } catch(e){}
  if (!user || !user.userId) return;
  var pass = sessionStorage.getItem('kickstart_pass') || sessionStorage.getItem('kickstart_staff_pass');
  if (!pass) return;

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  // Lazy-load api.js if the page doesn't include it (Reading/Listening
  // answer pages typically only have auth.js).
  function ensureApi(cb){
    if (typeof Api !== 'undefined' && Api.getMyAnswers) return cb();
    var here = '';
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      if (/student-history\.js(\?|$|#)/.test(src)) { here = src; break; }
    }
    if (!here) { return poll(cb); }
    var apiSrc = here.replace(/student-history\.js(\?[^#]*)?(\#.*)?$/, 'api.js');
    var tag = document.createElement('script');
    tag.src = apiSrc;
    tag.onload = function(){ poll(cb); };
    tag.onerror = function(){};
    document.head.appendChild(tag);
  }
  function poll(cb, n){
    if (typeof Api !== 'undefined' && Api.getMyAnswers) return cb();
    if ((n || 0) > 40) return; // ~4s
    setTimeout(function(){ poll(cb, (n || 0) + 1); }, 100);
  }

  function renderWriting(attempts){
    if (!attempts.length) return;
    var box = document.createElement('div');
    box.id = 'tckMyHistory';
    box.style.cssText = 'background:#FBF6EC;border:1px solid #F5E9D3;border-radius:14px;padding:18px 22px;margin:22px auto;max-width:840px;font-family:"Zen Kaku Gothic New","Noto Sans JP",sans-serif';
    var header = '<div style="font-weight:800;color:#005434;font-size:1em;margin-bottom:12px"><span class="jp">📜 これまでのあなたの回答（' + attempts.length + ' 件）</span><span class="en">📜 Your past attempts (' + attempts.length + ')</span></div>';
    var rows = attempts.map(function(att, i){
      var t  = (att.answers && att.answers.text) || '';
      var w  = (att.answers && att.answers.words) || '—';
      var tm = (att.answers && (att.answers.time || att.answers.timeUsed)) || '—';
      var dt = att.timestamp ? new Date(att.timestamp).toLocaleString('ja-JP', { hour12:false }) : '';
      return '<details ' + (i === 0 ? 'open' : '') + ' style="border-top:1px solid #F5E9D3;padding:10px 0">' +
        '<summary style="cursor:pointer;font-weight:700;color:#005434;font-size:.92em;display:flex;justify-content:space-between;align-items:center;gap:10px;list-style:none">' +
          '<span>' + (i === 0 ? '🆕 ' : '#' + (attempts.length - i) + '  ') + escapeHtml(dt) + '</span>' +
          '<span style="font-family:Manrope,sans-serif;font-size:.82em;color:#5A6861;font-weight:500">語数 ' + escapeHtml(String(w)) + ' ／ ' + escapeHtml(String(tm)) + '</span>' +
        '</summary>' +
        '<div style="margin-top:10px;padding:14px;background:#fff;border-radius:8px;border:1px solid #F5E9D3;font-family:Manrope,Georgia,serif;font-size:.92em;line-height:1.7;white-space:pre-wrap;color:#1F2622">' +
          escapeHtml(t || '(本文なし)') +
        '</div>' +
      '</details>';
    }).join('');
    box.innerHTML = header + rows;
    insertAfterUserPreview(box);
  }

  // Auto-graded tasks (CTW/RDL/Academic/LCR/Conv/Announce/Talk/Sentence).
  // For each attempt: date, score, total, percentage, set label (CTW only).
  // Total is derived from answers array length.
  function renderAutoGraded(attempts){
    if (!attempts.length) return;
    var box = document.createElement('div');
    box.id = 'tckMyHistory';
    box.style.cssText = 'background:#FBF6EC;border:1px solid #F5E9D3;border-radius:14px;padding:18px 22px;margin:22px auto;max-width:840px;font-family:"Zen Kaku Gothic New","Noto Sans JP",sans-serif';
    var header = '<div style="font-weight:800;color:#005434;font-size:1em;margin-bottom:12px"><span class="jp">📊 これまでのあなたの記録（' + attempts.length + ' 回）</span><span class="en">📊 Your past attempts (' + attempts.length + ')</span></div>';
    var rows = attempts.map(function(att, i){
      var dt = att.timestamp ? new Date(att.timestamp).toLocaleString('ja-JP', { hour12:false }) : '';
      var sc = (att.score === null || att.score === undefined || att.score === '') ? null : Number(att.score);
      var ans = att.answers;
      var total = Array.isArray(ans) ? ans.length : 0;
      var pct = (sc !== null && total > 0) ? Math.round(sc / total * 100) : null;
      // Performance colour code so trends are scannable at a glance.
      var color = (pct === null) ? '#5A6861'
                : (pct >= 80) ? '#005434'
                : (pct >= 50) ? '#A47A1F'
                : '#9C3D1F';
      var icon  = (pct === null) ? '○'
                : (pct >= 80) ? '🌟'
                : (pct >= 50) ? '✓'
                : '↻';
      // CTW stores "CTW P1 Set 1" — surface the Set number when present.
      var setLabel = '';
      var setMatch = String(att.set || '').match(/Set\s+(\d+)/);
      if (setMatch) setLabel = '<span style="color:#5A6861;font-family:Manrope,sans-serif;font-size:.78em;background:#F5E9D3;padding:2px 8px;border-radius:999px">Set ' + setMatch[1] + '</span>';
      var label = (i === 0 ? '🆕 ' : '#' + (attempts.length - i) + '  ');
      return '<div style="border-top:1px solid #F5E9D3;padding:12px 0;display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
        '<div style="font-family:Manrope,sans-serif;font-size:.82em;color:#5A6861;min-width:170px">' + escapeHtml(label + dt) + '</div>' +
        setLabel +
        '<div style="font-family:Manrope,sans-serif;font-weight:800;color:' + color + ';font-size:1.05em;margin-left:auto">' +
          icon + ' ' +
          (sc !== null ? sc + (total > 0 ? ' / ' + total : '') : '—') +
          (pct !== null ? '<span style="font-size:.82em;font-weight:600;margin-left:6px;color:#5A6861">(' + pct + '%)</span>' : '') +
        '</div>' +
      '</div>';
    }).join('');
    box.innerHTML = header + rows;
    // Insert just below the existing score summary card if it exists,
    // otherwise append at end of body.
    var ss = document.getElementById('scoreSummary') || document.querySelector('.score-summary');
    if (ss && ss.parentNode) {
      ss.parentNode.insertBefore(box, ss.nextSibling);
    } else {
      document.body.appendChild(box);
    }
  }

  function renderSpeaking(recordings){
    if (!recordings.length) return;
    recordings.sort(function(a,b){
      if (a.questionIndex !== b.questionIndex) return Number(a.questionIndex) - Number(b.questionIndex);
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    });
    var box = document.createElement('div');
    box.id = 'tckMyHistory';
    box.style.cssText = 'background:#FBF6EC;border:1px solid #F5E9D3;border-radius:14px;padding:18px 22px;margin:22px auto;max-width:840px;font-family:"Zen Kaku Gothic New","Noto Sans JP",sans-serif';
    var header = '<div style="font-weight:800;color:#005434;font-size:1em;margin-bottom:12px"><span class="jp">🎤 これまでのあなたの録音（' + recordings.length + ' 件）</span><span class="en">🎤 Your past recordings (' + recordings.length + ')</span></div>';
    var rows = recordings.map(function(rc){
      var previewUrl = rc.fileId ? 'https://drive.google.com/file/d/' + rc.fileId + '/preview' : '';
      var dt  = rc.timestamp ? new Date(rc.timestamp).toLocaleString('ja-JP', { hour12:false }) : '';
      var dur = rc.durationSec ? (Math.floor(rc.durationSec/60) + ':' + String(rc.durationSec%60).padStart(2,'0')) : '—';
      return '<div style="border-top:1px solid #F5E9D3;padding:12px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<div style="font-weight:800;color:#005434;font-size:.95em;min-width:42px">Q' + rc.questionIndex + '</div>' +
        '<div style="font-family:Manrope,sans-serif;font-size:.78em;color:#5A6861;min-width:130px">' + escapeHtml(dt) + '<br>長さ ' + escapeHtml(dur) + '</div>' +
        (previewUrl
          ? '<iframe src="' + previewUrl + '" style="flex:1;min-width:260px;height:80px;border:0;border-radius:6px" allow="autoplay"></iframe>'
          : '<span style="color:#5A6861">音声なし</span>') +
      '</div>';
    }).join('');
    box.innerHTML = header + rows;
    document.body.appendChild(box);
  }

  // For Writing answer pages: insert just below the existing
  // userPreview card (the "あなたの回答" block). For other pages, fall
  // back to appending at body end.
  function insertAfterUserPreview(box){
    var prev = document.getElementById('userPreview');
    if (prev) {
      var card = prev.closest ? prev.closest('.card') : null;
      if (!card) {
        var p = prev.parentNode;
        while (p && p !== document.body && !(p.classList && p.classList.contains('card'))) p = p.parentNode;
        if (p && p !== document.body) card = p;
      }
      if (card && card.parentNode) {
        card.parentNode.insertBefore(box, card.nextSibling);
        return;
      }
    }
    document.body.appendChild(box);
  }

  ensureApi(function(){
    if (task === 'lr' || task === 'ti') {
      if (!Api.listMyRecordings) return;
      Api.listMyRecordings().then(function(r){
        if (!r || !r.success) return;
        var recs = (r.recordings || []).filter(function(x){
          return String(x.task) === task && String(x.practiceSet) === practice;
        });
        renderSpeaking(recs);
      }).catch(function(){});
    } else if (task === 'email' || task === 'discussion') {
      Api.getMyAnswers(task, practice, setNum).then(function(r){
        if (!r || !r.success) return;
        renderWriting(r.attempts || []);
      }).catch(function(){});
    } else {
      // Auto-graded tasks (CTW/RDL/Academic/LCR/Conv/Announce/Talk/Sentence).
      // For CTW we deliberately do NOT pass setNum so the panel shows
      // every set the student has tried for this practice.
      Api.getMyAnswers(task, practice, setNum).then(function(r){
        if (!r || !r.success) return;
        renderAutoGraded(r.attempts || []);
      }).catch(function(){});
    }
  });
})();
