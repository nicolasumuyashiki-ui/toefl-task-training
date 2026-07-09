/**
 * admin-answer-overlay.js
 *
 * Loaded automatically by js/auth.js when the URL has ?fromAdmin=1.
 * Job: detect the task type from the URL path, fetch the student's
 * saved `answers` payload via Api.getAttemptAnswers, and overlay it on
 * top of the existing answer-key page.
 *
 * Renderers per task live in `RENDERERS` below. Each one is given the
 * attempts to show (newest first) and decides:
 *   - whether to repopulate sessionStorage so the page's own renderer
 *     picks up the student's score (CTW/RDL/Academic/LCR/Conv/Announce/
 *     Talk/Sentence). The server stores answers as a 0-BASED ARRAY of
 *     raw selections; each restore converts to the exact shape + key
 *     the target answer page reads (they all differ — see each task).
 *   - whether to inject a "Student Submission" panel (1-based question
 *     numbers, letters instead of raw option indexes),
 *   - whether to additionally fetch the original practice page and
 *     inject the prompt (Speaking/Writing — the answer/tips page
 *     doesn't already display the prompt).
 *
 * Because every answer page renders once at load (before this overlay's
 * network fetch resolves), restores are followed by ONE guarded
 * location.reload() so the page's own score/正誤 display reflects the
 * student data. The guard (sessionStorage flag keyed by attempt index)
 * prevents reload loops; CTW skips this because its page exposes
 * renderAll() for an in-place re-render.
 *
 * Speaking (LR/TI) is special: recordings live in a separate sheet, so
 * we go through renderSpeakingRecordings() instead of the answers API.
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

  /* Which attempt is being shown survives the post-restore reload and
     the attempt-selector dropdown (index into the newest-first list).
     Keyed by userId too: opening a DIFFERENT student in the same tab must
     not reuse the previous student's "already restored" flag, or the page
     would keep showing the previous student's data without reloading. */
  var SEL_KEY  = 'tck_admin_att_' + userId + '_' + task + '_p' + practice;
  var FLAG_KEY = 'tck_admin_restored_' + userId + '_' + task + '_p' + practice;

  /* Tasks whose answer page reads sessionStorage once at load — after a
     restore these need one reload for the page's own score display to
     pick up the student data. CTW re-renders in place via renderAll(). */
  var RELOAD_TASKS = { rdl:1, academic:1, lcr:1, conv:1, announce:1, talk:1, sentence:1 };
  function maybeReloadForPage(idx) {
    if (!RELOAD_TASKS[task]) return false;
    var want = String(idx);
    if (sessionStorage.getItem(FLAG_KEY) === want) return false;   // this attempt already rendered
    try { sessionStorage.setItem(FLAG_KEY, want); } catch (e) { return false; }
    location.reload();
    return true;
  }

  function ensureApiLoaded(cb) {
    if (typeof Api !== 'undefined' && Api.getAttemptAnswers) return cb();
    var here = '';
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      if (/admin-answer-overlay\.js(\?|$|#)/.test(src)) { here = src; break; }
    }
    if (!here) { whenApiReady(cb); return; }
    var apiSrc = here.replace(/admin-answer-overlay\.js(\?[^#]*)?(\#.*)?$/, 'api.js$1');
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

  function fmtJp(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    try { return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false }); }
    catch (e) { return d.toLocaleString('ja-JP', { hour12: false }); }
  }

  /* ---- value helpers ------------------------------------------------ */
  var LETTERS = 'ABCDEFGH';
  function unwrap(v) { return (v && typeof v === 'object' && 'selected' in v) ? v.selected : v; }
  function isBlankVal(v) { return v === null || v === undefined || v === ''; }
  function toLetter(v) {
    if (isBlankVal(v)) return null;
    if (typeof v === 'string' && /^[A-Ha-h]$/.test(v)) return v.toUpperCase();
    var n = Number(v);
    if (!isNaN(n) && n >= 0 && n < LETTERS.length && String(v).trim() !== '') return LETTERS.charAt(n);
    return String(v);
  }
  function valuesOf(ans) {
    if (Array.isArray(ans)) return ans.map(unwrap);
    if (ans && typeof ans === 'object') return Object.keys(ans).map(function(k){ return unwrap(ans[k]); });
    return [];
  }
  /* Every value blank → nothing to show at all. */
  function allBlank(ans) {
    var vals = valuesOf(ans);
    return !vals.length || vals.every(isBlankVal);
  }
  /* Every value exactly 0/'0'. For letter tasks (RDL/Academic/LCR) a 0 is
     impossible as a real selection, so all-zero = the legacy auto-save
     that recorded Array(total).fill(0) → show the score-only note. For
     index tasks (Conv/Announce/Talk) 0 legitimately means "choice A", so
     all-zero rows get rendered WITH a caution line instead of hidden. */
  function allZero(ans) {
    var vals = valuesOf(ans);
    return vals.length > 0 && vals.every(function(v){ return v === 0 || v === '0'; });
  }
  /* Server answers (0-based array, or an object with 1-based / qN keys)
     → {1:'A', 2:'B', ...} letters, blanks skipped. */
  function toObj1(ans) {
    var out = {};
    if (Array.isArray(ans)) {
      ans.forEach(function(v, i){ v = unwrap(v); if (!isBlankVal(v)) out[String(i + 1)] = toLetter(v); });
    } else if (ans && typeof ans === 'object') {
      Object.keys(ans).forEach(function(k){
        var m = String(k).match(/^q?(\d+)$/i);
        if (!m) return;
        var v = unwrap(ans[k]);
        if (!isBlankVal(v)) out[m[1]] = toLetter(v);
      });
    }
    return out;
  }
  /* Server answers → plain 0-based array of RAW values (numeric option
     indexes preserved — the Conv/Announce/Talk pages compare numerically
     against their own correctAnswers). */
  function toArr0(ans) {
    if (Array.isArray(ans)) return ans.map(function(v){ v = unwrap(v); return isBlankVal(v) ? null : v; });
    var out = [];
    if (ans && typeof ans === 'object') {
      Object.keys(ans).forEach(function(k){
        var m = String(k).match(/^q?(\d+)$/i);
        if (!m) return;
        var v = unwrap(ans[k]);
        out[Number(m[1]) - 1] = isBlankVal(v) ? null : v;
      });
    }
    return out;
  }

  var SCORE_ONLY_NOTE = '<div style="padding:10px 12px;background:#FFF4D6;border:1px solid #E3C871;border-radius:8px;color:#6B5A1E;font-size:.9em;line-height:1.6">この記録は自動採点タスクのもので、<strong>得点は有効</strong>ですが、設問ごとの選択内容は保存されていないため表示できません（旧仕様の記録）。<br><span style="font-size:.85em;color:#8A7B45">※ 今後の取り組みからは選択内容も記録され、ここに表示されます。</span></div>';
  var ZERO_CAUTION = '<div style="margin-top:8px;padding:8px 12px;background:#FFF4D6;border:1px solid #E3C871;border-radius:8px;color:#6B5A1E;font-size:.8em;line-height:1.5">※ 全問「A」表示は、選択内容が記録されていない旧仕様の記録（全ゼロ埋め）の可能性があります。得点は有効です。</div>';

  /* ============================================================
     Insert a styled panel into the page, right after the admin
     banner. Same-id panels are REPLACED, not stacked — switching
     attempts in the dropdown used to pile old panels on top of
     each other.
     ============================================================ */
  function insertPanel(panel) {
    if (panel && panel.id) {
      var old = document.getElementById(panel.id);
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }
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
     page. Used by Writing (email/discussion) and Speaking (lr/ti). */
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

  /* Shared panel body: 1-based question numbers + letter answers. */
  function panelRows(obj1, marks) {
    return Object.keys(obj1).sort(function(a,b){ return Number(a) - Number(b); }).map(function(n){
      var mark = marks && (n in marks) && marks[n] !== null
        ? (marks[n] ? ' <span style="color:#007646;font-weight:700">✓</span>' : ' <span style="color:#B85C3C;font-weight:700">✗</span>')
        : '';
      return '<div style="padding:4px 0">Q' + escapeHtml(n) + ': <strong style="color:#005434">' + escapeHtml(obj1[n] == null ? '—' : obj1[n]) + '</strong>' + mark + '</div>';
    }).join('');
  }

  /* ============================================================
     Per-task renderers — (attemptsToShow, idx) where attemptsToShow
     is newest-first and idx is the position of attemptsToShow[0] in
     the full list (for the reload guard).
     ============================================================ */
  function readingRenderer(storageKey) {
    return function(attempts, idx) {
      var att = attempts[0] || {};
      var raw = att.answers;
      if (allZero(raw)) { insertPanel(makeSubmissionPanel(SCORE_ONLY_NOTE)); return; }
      // The RDL/Academic answer pages read a 1-BASED OBJECT of letters
      // ({'1':'A',...}) and grade against their own key — the server's
      // 0-based array written as-is used to shift every answer by one.
      var obj1 = toObj1(raw);
      var wrote = false;
      try { sessionStorage.setItem(storageKey, JSON.stringify(obj1)); wrote = true; } catch (e) {}
      if (wrote && maybeReloadForPage(idx)) return;
      insertPanel(makeSubmissionPanel(allBlank(raw) ? SCORE_ONLY_NOTE : (panelRows(obj1) || '<div style="color:#5A6861">回答データなし</div>')));
    };
  }

  var RENDERERS = {

    /* ---------- CTW ---------- */
    ctw: function(attempts) {
      // CTW was wholesale-rebuilt to v3.5.2 (#125). Attempts saved BEFORE
      // the rebuild answered the OLD passages — mapping them onto today's
      // blanks makes them look like garbage answers even though the saved
      // score is valid. Flag those attempts so admin reads them correctly.
      var CTW_REBUILD_ISO = '2026-07-02T04:07:36Z';
      if (attempts.some(function(a){ return a.timestamp && String(a.timestamp) < CTW_REBUILD_ISO; })) {
        var note = document.createElement('div');
        note.id = 'tckAdminLegacyNote';
        note.style.cssText = 'background:#FFF4D6;border:2px solid #E3C871;border-radius:14px;padding:14px 20px;margin:18px auto;max-width:900px;color:#6B5A1E;font-size:.9em;line-height:1.6;font-family:Manrope,"Noto Sans JP",sans-serif';
        note.innerHTML = '⚠ この生徒の記録には <strong>CTW 全面リビルド（2026-07-02・v3.5.2）以前</strong>の取り組みが含まれます。当時の問題文への回答のため、現在の解答ページ上では選択内容が問題と一致して見えません（<strong>得点は保存時のまま有効</strong>です）。';
        insertPanel(note);
      }
      // GAS returns rows newest-first, one per Set ("CTW P5 Set 1/2").
      // Keep the NEWEST row per set — iterating blindly used to let the
      // OLDEST row win because later writes overwrote earlier ones.
      var seen = {};
      attempts.forEach(function(att){
        var m = String(att.set || '').match(/Set\s*(\d+)/i);
        if (!m) return;
        var setNum = m[1];
        if (seen[setNum]) return;
        seen[setNum] = true;
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

    /* ---------- RDL / Academic ---------- */
    rdl: null,      // assigned below (needs `practice` at call time)
    academic: null,

    /* ---------- LCR ---------- */
    lcr: function(attempts, idx) {
      var att = attempts[0] || {};
      var raw = att.answers;
      if (allZero(raw)) { insertPanel(makeSubmissionPanel(SCORE_ONLY_NOTE)); return; }
      // The LCR answer page reads { q1: {selected, correct, isCorrect} …
      // q8 } — 1-BASED. The server's 0-based array used to become q0..q7,
      // shifting every answer down a question and zeroing the score.
      var obj1 = toObj1(raw);
      // The answer page defines its own key (global QS, correct = option
      // index) — grade against it so the page's ✓/✗ and score are real.
      var key = null;
      try { if (typeof QS !== 'undefined' && Array.isArray(QS)) key = QS; } catch (e) {}
      var lifted = {}, marks = {};
      Object.keys(obj1).forEach(function(n){
        var sel = obj1[n];
        var corr = null, ic = null;
        var q = key && key[Number(n) - 1];
        if (q && typeof q.correct === 'number') {
          corr = LETTERS.charAt(q.correct);
          ic = (sel === corr);
        }
        lifted['q' + n] = { selected: sel, correct: corr, isCorrect: ic };
        marks[n] = ic;
      });
      var wrote = false;
      try { sessionStorage.setItem('lcrAnswers', JSON.stringify(lifted)); wrote = true; } catch (e) {}
      if (wrote && maybeReloadForPage(idx)) return;
      insertPanel(makeSubmissionPanel(allBlank(raw) ? SCORE_ONLY_NOTE : (panelRows(obj1, marks) || '<div style="color:#5A6861">回答データなし</div>')));
    },

    /* ---------- Conv / Announce / Talk ---------- */
    conv: function(attempts, idx) {
      genericListeningRenderer(attempts, 'convAnswers', idx);
    },
    announce: function(attempts, idx) {
      genericListeningRenderer(attempts, 'announceAnswers', idx);
    },
    talk: function(attempts, idx) {
      genericListeningRenderer(attempts, 'talkPractice' + practice + 'Answers', idx);
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
    sentence: function(attempts, idx) {
      var att = attempts[0] || {};
      var raw = att.answers;
      var arr = Array.isArray(raw) ? raw : [];
      // The Sentence answer page reads `sentenceAnswers` = {score, total}
      // for its score card. (The old overlay wrote to a key nothing reads.)
      var wrote = false;
      try {
        sessionStorage.setItem('sentenceAnswers', JSON.stringify({
          score: Number(att.score) || 0,
          total: arr.length || 10
        }));
        wrote = true;
      } catch (e) {}
      if (wrote && maybeReloadForPage(idx)) return;
      var rows = arr.map(function(v, i){
        v = unwrap(v);
        var txt = isBlankVal(v) ? '—' : (typeof v === 'string' ? v : JSON.stringify(v));
        return '<div style="padding:6px 0;border-bottom:1px solid #F5E9D3"><strong>Q' + (i + 1) + '</strong>: ' + escapeHtml(txt) + '</div>';
      }).join('');
      insertPanel(makeSubmissionPanel(allBlank(raw) ? SCORE_ONLY_NOTE : (rows || '<div style="color:#5A6861">回答データなし</div>')));
    }
  };

  RENDERERS.rdl      = readingRenderer('training_rdl_p' + practice + '_answers');
  RENDERERS.academic = readingRenderer('training_academic_p' + practice + '_answers');

  function genericListeningRenderer(attempts, storageKey, idx) {
    var att = attempts[0] || {};
    var raw = att.answers;
    // These pages read a plain 0-BASED ARRAY of option indexes and grade
    // against their own correctAnswers — restore the raw values untouched.
    var arr = toArr0(raw);
    var wrote = false;
    try { sessionStorage.setItem(storageKey, JSON.stringify(arr)); wrote = true; } catch (e) {}
    if (wrote && maybeReloadForPage(idx)) return;
    // Panel: 1-based question numbers, indexes shown as letters (0 = A).
    var rows = arr.map(function(v, i){
      return '<div style="padding:4px 0">Q' + (i + 1) + ': <strong style="color:#005434">' + escapeHtml(isBlankVal(v) ? '—' : toLetter(v)) + '</strong></div>';
    }).join('');
    var body = allBlank(raw)
      ? SCORE_ONLY_NOTE
      : (rows || '<div style="color:#5A6861">回答データなし</div>') + (allZero(raw) ? ZERO_CAUTION : '');
    insertPanel(makeSubmissionPanel(body));
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

      injectBanner(recs.length ? recs : [{ timestamp: '', set: task.toUpperCase() + ' P' + practice }], 0);
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
        var dt = fmtJp(rc.timestamp);
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

  function injectBanner(attempts, useIdx) {
    var old = document.getElementById('tckAdminBanner');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var banner = document.createElement('div');
    banner.id = 'tckAdminBanner';
    banner.style.cssText = 'position:sticky;top:0;z-index:200;background:linear-gradient(135deg,#0F4E2A,#1A6F3F);color:#fff;padding:12px 20px;font-family:Manrope,sans-serif;font-size:.86em;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;box-shadow:0 4px 14px rgba(0,0,0,.18)';
    var shown = attempts[useIdx] || attempts[0];
    var shownLabel = useIdx === 0 ? '最新を表示中' : ('表示中: ' + fmtJp(shown && shown.timestamp));
    var label = '<strong style="font-weight:800;letter-spacing:.04em">ADMIN VIEW</strong> · ' +
      escapeHtml(userName || userId) +
      ' の回答 · ' + task.toUpperCase() + ' P' + practice +
      (attempts.length > 1 ? ' （' + attempts.length + ' 回提出 — ' + shownLabel + '）' : '');
    var sel = '';
    if (attempts.length > 1) {
      sel = '<select id="tckAdminAttemptSel" style="background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);padding:5px 10px;border-radius:6px;font-family:inherit;font-size:.92em">' +
        attempts.map(function(a, i){
          var ts = a.timestamp ? fmtJp(a.timestamp) : '#' + (i + 1);
          var setFrag = '';
          var sm = String(a.set || '').match(/Set\s*\d+/i);
          if (sm) setFrag = ' · ' + sm[0];
          return '<option value="' + i + '"' + (i === useIdx ? ' selected' : '') + '>' + escapeHtml(ts + setFrag) + '</option>';
        }).join('') + '</select>';
    }
    banner.innerHTML = '<span>' + label + '</span><span style="display:flex;gap:10px;align-items:center">' + sel + '<button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:5px 12px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:.88em">タブを閉じる</button></span>';
    document.body.insertBefore(banner, document.body.firstChild);

    var selEl = document.getElementById('tckAdminAttemptSel');
    if (selEl) selEl.addEventListener('change', function(){
      var idx = Number(selEl.value) || 0;
      try { sessionStorage.setItem(SEL_KEY, String(idx)); } catch (e) {}
      var fn = RENDERERS[task];
      if (fn && attempts[idx]) {
        injectBanner(attempts, idx);   // refresh the "表示中" label
        fn([attempts[idx]], idx);      // restore + (reload tasks) refresh page
      }
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
      var savedIdx = parseInt(sessionStorage.getItem(SEL_KEY) || '0', 10) || 0;
      var useIdx = Math.min(Math.max(savedIdx, 0), atts.length - 1);
      injectBanner(atts, useIdx);
      hideStudentControls();

      var renderer = RENDERERS[task];
      if (!renderer) {
        showError('このタスクの回答表示はまだ未対応です（task=' + task + '）。');
        return;
      }
      // CTW renderer takes all attempts (newest per set); a specific
      // dropdown pick narrows it to that one row. Others take the
      // selected (default: newest) attempt only.
      renderer(task === 'ctw' && useIdx === 0 ? atts : [atts[useIdx]], useIdx);
    }).catch(function(err){
      showError('通信エラー：' + (err && err.message || err));
    });
  });
})();
