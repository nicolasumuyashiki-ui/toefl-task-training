/**
 * admin-answer-overlay.js
 *
 * Loaded automatically by js/auth.js when the URL has ?fromAdmin=1.
 * Job: detect the task type from the URL path, fetch the student's
 * saved `answers` payload via Api.getAttemptAnswers, and overlay it on
 * top of the existing answer-key page.
 *
 * Renderers per task live in `RENDERERS` below. Each one is given the
 * full attempts array (newest first) and decides:
 *   - whether to repopulate sessionStorage so the page's own renderAll
 *     picks up the student's score (CTW/RDL/Academic/LCR/Conv/Announce/Talk),
 *   - whether to inject a custom "Student Submission" banner
 *     (Writing email/discussion already have userPreview / userStats),
 *   - whether to additionally fetch the original practice page and
 *     inject the prompt (Speaking/Writing — the answer/tips page
 *     doesn't already display the prompt).
 *
 * Speaking (LR/TI) is special: recordings live in a separate sheet, so
 * we go through renderSpeakingRecordings() instead of the answers API.
 * The prompt-fetch path still runs so admin sees the question audio
 * + script alongside the recording.
 */
(function(){
  var qs = new URLSearchParams(location.search);
  if (qs.get('fromAdmin') !== '1') return;

  var userId   = qs.get('userId')   || '';
  var userName = qs.get('userName') || '';
  var setParam = qs.get('set')      || '';
  if (!userId) return;

  var path = location.pathname;
  var taskMatch = path.match(/\/(reading|listening|writing|speaking)\/([a-z]+)\/practice-(\d+)/i);
  if (!taskMatch) return;
  var section = taskMatch[1].toLowerCase();
  var task    = taskMatch[2].toLowerCase();
  var practice = taskMatch[3];

  function ensureApiLoaded(cb) {
    if (typeof Api !== 'undefined' && Api.getAttemptAnswers) return cb();
    var here = '';
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      if (/admin-answer-overlay\.js(\?|$|#)/.test(src)) { here = src; break; }
    }
    if (!here) { whenApiReady(cb); return; }
    var apiSrc = here.replace(/admin-answer-overlay\.js(\?[^#]*)?(\#.*)?$/, 'api.js');
    var tag = document.createElement('script');
    tag.src = apiSrc;
    tag.onload = function(){ whenApiReady(cb); };
    tag.onerror = function(){ whenApiReady(cb); };
    document.head.appendChild(tag);
  }
  function whenApiReady(cb, attempts) {
    if (typeof Api !== 'undefined' && Api.getAttemptAnswers) return cb();
    if ((attempts || 0) > 40) return; // ~4s ceiling
    setTimeout(function(){ whenApiReady(cb, (attempts||0) + 1); }, 100);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  /* ============================================================
     Insert a styled panel into the page, right after the admin
     banner (so it sits above the existing answer-key content).
     ============================================================ */
  function insertPanel(panel) {
    var banner = document.getElementById('tckAdminBanner');
    if (banner && banner.parentNode) {
      banner.parentNode.insertBefore(panel, banner.nextSibling);
    } else {
      document.body.insertBefore(panel, document.body.firstChild);
    }
  }

  function makeSubmissionPanel(innerHtml) {
    var panel = document.createElement('div');
    panel.id = 'tckAdminSubmissionPanel';
    panel.style.cssText = 'background:#fff;border:2px solid #B85C3C;border-radius:14px;padding:20px 24px;margin:18px auto;max-width:900px;box-shadow:0 4px 14px rgba(0,0,0,.08);font-family:Manrope,"Noto Sans JP",sans-serif';
    panel.innerHTML =
      '<div style="font-weight:800;color:#8A3E24;font-size:1em;letter-spacing:.04em;margin-bottom:14px">📝 学生の回答 — ' + escapeHtml(userName || userId) + '</div>'
      + innerHtml;
    return panel;
  }

  function makePromptPanel(innerHtml, label) {
    var panel = document.createElement('div');
    panel.id = 'tckAdminPromptPanel';
    panel.style.cssText = 'background:#FBF6EC;border:2px solid #007646;border-radius:14px;padding:20px 24px;margin:18px auto;max-width:900px;box-shadow:0 4px 14px rgba(0,0,0,.08);font-family:Manrope,"Noto Sans JP",sans-serif';
    panel.innerHTML =
      '<div style="font-weight:800;color:#005434;font-size:1em;letter-spacing:.04em;margin-bottom:14px">📄 ' + escapeHtml(label) + '</div>'
      + '<div class="tckAdminPromptBody">' + innerHtml + '</div>';
    return panel;
  }

  /* Fetch the original practice page (sibling of the current
     -answers.html / -tips.html), extract one or more nodes by CSS
     selector, and inject them as a Prompt panel above the rest of the
     page. Used by Writing (email/discussion) and Speaking (lr/ti) to
     give admin the original question + audio + script alongside the
     student's submission. */
  function fetchAndInjectPrompt(selectors, label) {
    var promptUrl = location.pathname.replace(/-answers\.html(?:[?#].*)?$/, '.html')
                                     .replace(/-tips\.html(?:[?#].*)?$/, '.html');
    if (promptUrl === location.pathname) return; // nothing to substitute
    fetch(promptUrl).then(function(res){
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function(html){
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var fragments = [];
      (Array.isArray(selectors) ? selectors : [selectors]).forEach(function(sel){
        doc.querySelectorAll(sel).forEach(function(el){
          fragments.push(el.outerHTML);
        });
      });
      if (!fragments.length) return;
      insertPanel(makePromptPanel(fragments.join('\n'), label));
    }).catch(function(err){
      console.warn('[admin-overlay] prompt fetch failed:', err);
    });
  }

  /* ============================================================
     Per-task renderers — given the full attempts array (newest first
     by GAS sort), populate sessionStorage / inject panels as needed.
     ============================================================ */
  var RENDERERS = {

    /* ---------- CTW ---------- */
    ctw: function(attempts) {
      // GAS returns one row per Set ("CTW P5 Set 1" / "CTW P5 Set 2").
      // Restore each set's sessionStorage so the answer page's renderAll
      // shows the actual scores instead of 0/10.
      attempts.forEach(function(att){
        var m = String(att.set || '').match(/Set\s*(\d+)/i);
        if (!m) return;
        var setNum = m[1];
        var ua = Array.isArray(att.answers) ? att.answers : [];
        var sc = Number(att.score) || 0;
        try {
          sessionStorage.setItem('ctw_p' + practice + '_answers_' + setNum, JSON.stringify({
            answers: ua,
            score: sc,
            total: ua.length || 10
          }));
        } catch (e) {}
      });
      if (typeof window.renderAll === 'function') {
        try { window.renderAll(); } catch (e) {}
      }
    },

    /* ---------- RDL ---------- */
    rdl: function(attempts) {
      var att = attempts[0];
      var answers = (att && att.answers && typeof att.answers === 'object') ? att.answers : {};
      try {
        sessionStorage.setItem('training_rdl_p' + practice + '_answers', JSON.stringify(answers));
      } catch (e) {}
      // RDL answer pages don't auto-rerender on storage write — bounce a
      // visual banner so admin sees the saved selections without needing
      // to reload.
      var rows = Object.keys(answers).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){
        return '<div style="padding:4px 0">Q' + escapeHtml(k) + ': <strong style="color:#005434">' + escapeHtml(answers[k]) + '</strong></div>';
      }).join('');
      insertPanel(makeSubmissionPanel(rows || '<div style="color:#5A6861">回答データなし</div>'));
    },

    /* ---------- Academic ---------- */
    academic: function(attempts) {
      var att = attempts[0];
      var answers = (att && att.answers && typeof att.answers === 'object') ? att.answers : {};
      try {
        sessionStorage.setItem('training_academic_p' + practice + '_answers', JSON.stringify(answers));
      } catch (e) {}
      var rows = Object.keys(answers).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){
        return '<div style="padding:4px 0">Q' + escapeHtml(k) + ': <strong style="color:#005434">' + escapeHtml(answers[k]) + '</strong></div>';
      }).join('');
      insertPanel(makeSubmissionPanel(rows || '<div style="color:#5A6861">回答データなし</div>'));
    },

    /* ---------- LCR ---------- */
    lcr: function(attempts) {
      var att = attempts[0];
      var answers = (att && att.answers && typeof att.answers === 'object') ? att.answers : {};
      // LCR page expects { q1: {selected, correct, isCorrect}, ... } shape.
      // The saved `ua` from practice-N.html is the raw answers object — try
      // to coerce; if it's a plain {1:"A",2:"B"} map, lift into the
      // expected shape so the answer page can still render.
      try {
        var lifted = {};
        Object.keys(answers).forEach(function(k){
          var v = answers[k];
          var key = /^q\d+$/.test(k) ? k : ('q' + k);
          if (v && typeof v === 'object' && 'selected' in v) {
            lifted[key] = v;
          } else {
            lifted[key] = { selected: v, correct: null, isCorrect: null };
          }
        });
        sessionStorage.setItem('lcrAnswers', JSON.stringify(lifted));
      } catch (e) {}
      var rows = Object.keys(answers).sort().map(function(k){
        var v = answers[k];
        var pick = (v && typeof v === 'object' && 'selected' in v) ? v.selected : v;
        return '<div style="padding:4px 0">' + escapeHtml(k) + ': <strong style="color:#005434">' + escapeHtml(pick == null ? '—' : pick) + '</strong></div>';
      }).join('');
      insertPanel(makeSubmissionPanel(rows || '<div style="color:#5A6861">回答データなし</div>'));
    },

    /* ---------- Conv / Announce / Talk ---------- */
    conv: function(attempts) {
      genericListeningRenderer(attempts, 'convAnswers');
    },
    announce: function(attempts) {
      genericListeningRenderer(attempts, 'announceAnswers');
    },
    talk: function(attempts) {
      genericListeningRenderer(attempts, 'talkPractice' + practice + 'Answers');
    },

    /* ---------- Email ---------- */
    email: function(attempts) {
      writingRenderer(attempts, 'Email Prompt（出題内容）');
    },

    /* ---------- Discussion ---------- */
    discussion: function(attempts) {
      writingRenderer(attempts, 'Discussion Prompt（出題内容）');
    },

    /* ---------- Build a Sentence ---------- */
    sentence: function(attempts) {
      var att = attempts[0];
      var answers = (att && att.answers && typeof att.answers === 'object') ? att.answers : {};
      try {
        sessionStorage.setItem('training_sentence_p' + practice + '_answers', JSON.stringify(answers));
      } catch (e) {}
      var rows = Object.keys(answers).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){
        var v = answers[k];
        return '<div style="padding:6px 0;border-bottom:1px solid #F5E9D3"><strong>Q' + escapeHtml(k) + '</strong>: ' + escapeHtml(typeof v === 'string' ? v : JSON.stringify(v)) + '</div>';
      }).join('');
      insertPanel(makeSubmissionPanel(rows || '<div style="color:#5A6861">回答データなし</div>'));
    }
  };

  function genericListeningRenderer(attempts, storageKey) {
    var att = attempts[0];
    var answers = (att && att.answers && typeof att.answers === 'object') ? att.answers : {};
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(answers));
    } catch (e) {}
    var rows = Object.keys(answers).sort().map(function(k){
      var v = answers[k];
      var pick = (v && typeof v === 'object' && 'selected' in v) ? v.selected : v;
      return '<div style="padding:4px 0">' + escapeHtml(k) + ': <strong style="color:#005434">' + escapeHtml(pick == null ? '—' : pick) + '</strong></div>';
    }).join('');
    insertPanel(makeSubmissionPanel(rows || '<div style="color:#5A6861">回答データなし</div>'));
  }

  /* Writing (email/discussion) — restore the existing userPreview/
     userStats text injection AND fetch the original prompt from the
     practice page so admin sees what the student was responding to. */
  function writingRenderer(attempts, promptLabel) {
    var att = attempts[0];
    var t = (att.answers && att.answers.text) || (typeof att.answers === 'string' ? att.answers : '');
    var w = (att.answers && att.answers.words) || '—';
    var tm = (att.answers && (att.answers.time || att.answers.timeUsed)) || '—';
    var prev = document.getElementById('userPreview');
    if (prev) prev.textContent = t || '(本文なし)';
    var stats = document.getElementById('userStats');
    if (stats) stats.innerHTML = '語数: ' + escapeHtml(w) + ' ／ 使用時間: ' + escapeHtml(tm);
    fetchAndInjectPrompt(['.left-panel', '.scenario-box', '.discussion-header'], promptLabel);
  }

  /* Speaking (LR / TI) — recordings live in the RECORDINGS sheet, not
     ANSWERS. Pull them via Api.listRecordings (admin auth, returns all)
     and inject a player panel at the top of the tips page. */
  function renderSpeakingRecordings() {
    // Also fetch the prompt (audio + script) from the practice page so
    // admin can compare the student's recording against the original.
    fetchAndInjectPrompt(
      ['.task-card', '.question-card', '.script-card', '.tck-instruction-card'],
      task.toUpperCase() + ' Prompt（出題音声・スクリプト）'
    );

    if (!Api.listRecordings) {
      showError('Api.listRecordings is unavailable.');
      return;
    }
    Api.listRecordings().then(function(r){
      if (!r || !r.success) {
        showError('録音の取得に失敗しました（' + ((r && r.error) || 'unknown') + '）');
        return;
      }
      var recs = (r.recordings || []).filter(function(x){
        return String(x.userId) === String(userId)
            && String(x.task) === String(task)
            && String(x.practiceSet) === String(practice);
      });

      injectBanner(recs.length ? recs : [{ timestamp: '', set: task.toUpperCase() + ' P' + practice }]);
      hideStudentControls();

      if (!recs.length) {
        showError(escapeHtml(userName || userId) + ' の ' + task.toUpperCase() + ' P' + practice + ' の録音は見つかりませんでした。');
        return;
      }

      recs.sort(function(a,b){ return Number(a.questionIndex) - Number(b.questionIndex); });

      var panel = document.createElement('div');
      panel.id = 'tckAdminRecPanel';
      panel.style.cssText = 'background:#fff;border:2px solid #007646;border-radius:14px;padding:20px 24px;margin:18px auto;max-width:900px;box-shadow:0 4px 14px rgba(0,0,0,.08);font-family:Manrope,"Noto Sans JP",sans-serif';
      var html = '<div style="font-weight:800;color:#005434;font-size:1em;letter-spacing:.04em;margin-bottom:14px">🎤 生徒の録音 <span style="color:#5A6861;font-weight:600">(' + recs.length + ' 件)</span></div>';
      html += recs.map(function(rc){
        var previewUrl = rc.fileId ? 'https://drive.google.com/file/d/' + rc.fileId + '/preview' : '';
        var dur = rc.durationSec ? (Math.floor(rc.durationSec/60) + ':' + String(rc.durationSec%60).padStart(2,'0')) : '—';
        var dt = rc.timestamp ? new Date(rc.timestamp).toLocaleString('ja-JP', { hour12:false }) : '';
        var driveLink = rc.fileUrl ? '<a href="' + rc.fileUrl + '" target="_blank" rel="noopener" style="color:#005434;font-size:.82em;margin-left:8px;white-space:nowrap">Drive →</a>' : '';
        return '<div style="border-top:1px solid #F5E9D3;padding:14px 0;display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
          '<div style="font-weight:800;color:#005434;font-size:.95em;min-width:48px">Q' + rc.questionIndex + '</div>' +
          '<div style="font-size:.78em;color:#5A6861;min-width:140px">' + escapeHtml(dt) + '<br>長さ ' + escapeHtml(dur) + '</div>' +
          (previewUrl
            ? '<iframe src="' + previewUrl + '" style="flex:1;min-width:280px;height:80px;border:0;border-radius:6px" allow="autoplay"></iframe>'
            : '<span style="color:#5A6861">音声ファイルなし</span>') +
          driveLink +
        '</div>';
      }).join('');
      panel.innerHTML = html;
      insertPanel(panel);
    }).catch(function(err){
      showError('録音取得時の通信エラー：' + (err && err.message || err));
    });
  }

  function hideStudentControls() {
    var killText = ['もう一度解く', 'Try again', 'メニューに戻る', 'Back to menu'];
    var killPatterns = [/Practice\s*\d+\s*に戻る/, /Back to Practice\s*\d+/i];
    var anchors = document.querySelectorAll('a, button');
    for (var i = 0; i < anchors.length; i++) {
      var t = (anchors[i].textContent || '').trim();
      var hit = false;
      for (var j = 0; j < killText.length; j++) {
        if (t.indexOf(killText[j]) !== -1) { hit = true; break; }
      }
      if (!hit) {
        for (var k = 0; k < killPatterns.length; k++) {
          if (killPatterns[k].test(t)) { hit = true; break; }
        }
      }
      if (hit) anchors[i].style.display = 'none';
    }
  }

  function injectBanner(attempts) {
    var banner = document.createElement('div');
    banner.id = 'tckAdminBanner';
    banner.style.cssText = 'position:sticky;top:0;z-index:200;background:linear-gradient(135deg,#0F4E2A,#1A6F3F);color:#fff;padding:12px 20px;font-family:Manrope,sans-serif;font-size:.86em;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;box-shadow:0 4px 14px rgba(0,0,0,.18)';
    var label = '<strong style="font-weight:800;letter-spacing:.04em">ADMIN VIEW</strong> · ' +
      escapeHtml(userName || userId) +
      ' の回答 · ' + task.toUpperCase() + ' P' + practice +
      (attempts.length > 1 ? ' （' + attempts.length + ' 回提出 — 最新を表示中）' : '');
    var sel = '';
    if (attempts.length > 1) {
      sel = '<select id="tckAdminAttemptSel" style="background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);padding:5px 10px;border-radius:6px;font-family:inherit;font-size:.92em">' +
        attempts.map(function(a, i){
          var ts = a.timestamp ? new Date(a.timestamp).toLocaleString('ja-JP', { hour12:false }) : '#' + (i+1);
          return '<option value="' + i + '">' + escapeHtml(ts) + '</option>';
        }).join('') + '</select>';
    }
    banner.innerHTML = '<span>' + label + '</span><span style="display:flex;gap:10px;align-items:center">' + sel + '<button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:5px 12px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:.88em">タブを閉じる</button></span>';
    document.body.insertBefore(banner, document.body.firstChild);

    var selEl = document.getElementById('tckAdminAttemptSel');
    if (selEl) selEl.addEventListener('change', function(){
      var idx = Number(selEl.value);
      var fn = RENDERERS[task];
      if (fn && attempts[idx]) fn([attempts[idx]]);
    });
  }

  function showError(msg) {
    var bar = document.createElement('div');
    bar.style.cssText = 'background:#7F1D1D;color:#fff;padding:14px 20px;font-family:Manrope,sans-serif;font-size:.9em;text-align:center';
    bar.textContent = '[Admin] ' + msg;
    document.body.insertBefore(bar, document.body.firstChild);
  }

  ensureApiLoaded(function(){
    // Speaking (LR / TI) lives in the RECORDINGS sheet, not ANSWERS.
    if (task === 'lr' || task === 'ti') {
      renderSpeakingRecordings();
      return;
    }

    // Email / Discussion: fetch the original prompt early so it shows
    // even if Api.getAttemptAnswers fails or returns no attempts.
    if (task === 'email') {
      fetchAndInjectPrompt(['.left-panel', '.scenario-box'], 'Email Prompt（出題内容）');
    } else if (task === 'discussion') {
      fetchAndInjectPrompt(['.left-panel', '.discussion-header', '.professor-post'], 'Discussion Prompt（出題内容）');
    }

    // CTW needs both sets — strip the `set` filter so GAS returns
    // every "CTW P{N} Set *" row for this practice.
    var apiSet = (task === 'ctw') ? '' : setParam;

    Api.getAttemptAnswers(userId, task, practice, apiSet).then(function(res){
      if (!res || !res.success) {
        showError('回答の取得に失敗しました（' + ((res && res.error) || 'unknown') + '）');
        return;
      }
      var atts = res.attempts || [];
      if (!atts.length) {
        showError(escapeHtml(userName || userId) + ' の ' + task.toUpperCase() + ' P' + practice + ' の提出は見つかりませんでした。');
        return;
      }
      injectBanner(atts);
      hideStudentControls();

      var renderer = RENDERERS[task];
      if (!renderer) {
        showError('このタスクの回答表示はまだ未対応です（task=' + task + '）。');
        return;
      }
      // CTW renderer takes all attempts (set 1 + set 2); others take
      // newest only.
      renderer(task === 'ctw' ? atts : [atts[0]]);
    }).catch(function(err){
      showError('通信エラー：' + (err && err.message || err));
    });
  });
})();
