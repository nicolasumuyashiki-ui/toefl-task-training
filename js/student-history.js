/**
 * student-history.js
 *
 * Loaded automatically by js/auth.js on answer/tips pages (when not in
 * admin mode). Fetches the logged-in user's past attempts from GAS and
 * renders a "📜 これまでのあなたの回答" panel.
 *
 * Roles:
 *   - Writing (Email/Discussion): list past submissions with full text.
 *   - Speaking (LR/TI): list past recordings with players.
 *   - Auto-graded tasks (CTW/RDL/Academic/LCR/Conv/Announce/Talk/
 *     Sentence): list past attempts WITH per-question ✓/✗ against the
 *     answer key that lives on this very page, plus a "間違いのみ"
 *     filter. If the page itself rendered with no data (sessionStorage
 *     was empty and auth.js found no localStorage mirror — e.g. another
 *     device), restore the newest server attempt into the page's own
 *     display key and reload ONCE so the page shows the real result.
 *
 * CTW attempts saved before the 2026-07-02 full rebuild (#125) answered
 * the OLD passages — they are never restored onto the current page;
 * instead the panel links to the legacy archive (reading/ctw/legacy/)
 * where the original questions live.
 */
(function(){
  // Skip in admin mode — admin-answer-overlay.js owns the overlay.
  var qs = new URLSearchParams(location.search);
  if (qs.get('fromAdmin') === '1') return;

  // Match either practice-N-answers.html, practice-N-tips.html,
  // or practice-N-set-S-answers.html. The legacy archive
  // (reading/ctw/legacy/…) intentionally does NOT match.
  var path = location.pathname;
  var match = path.match(/\/(reading|listening|writing|speaking)\/([a-z]+)\/practice-(\d+)(?:-set-(\d+))?(-answers|-tips)\.html/i);
  if (!match) return;
  var task     = match[2].toLowerCase();
  var practice = match[3];
  var setNum   = match[4] || '';

  var CTW_REBUILD_ISO = '2026-07-02T04:07:36Z';

  // Need a logged-in student.
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

  /* ---- value helpers (same conventions as admin-answer-overlay) ---- */
  var LETTERS = 'ABCDEFGH';
  function unwrap(v){ return (v && typeof v === 'object' && 'selected' in v) ? v.selected : v; }
  function isBlankVal(v){ return v === null || v === undefined || v === ''; }
  function toLetter(v){
    if (isBlankVal(v)) return null;
    if (typeof v === 'string' && /^[A-Ha-h]$/.test(v)) return v.toUpperCase();
    var n = Number(v);
    if (!isNaN(n) && n >= 0 && n < LETTERS.length && String(v).trim() !== '') return LETTERS.charAt(n);
    return String(v);
  }
  /* Server answers (0-based array, or object with 1-based / qN keys)
     → {1:'A', 2:'B', …} letters, blanks skipped. */
  function toObj1(ans){
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
     indexes preserved — Conv/Announce/Talk pages compare numerically). */
  function toArr0(ans){
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
  function rawSet(k, v){ try { Storage.prototype.setItem.call(sessionStorage, k, v); } catch (e) {} }

  /* The answer key THIS page grades against, as a 1-based array of
     letters (index 0 = Q1). Detected from the page's own globals so the
     panel's ✓/✗ always agrees with the page itself. Null when the page
     exposes no key (writing/speaking, or an unexpected page shape). */
  function pageAnswerKey(){
    try {
      if (task === 'lcr' && typeof QS !== 'undefined' && Array.isArray(QS)) {
        return QS.map(function(q){ return (q && typeof q.correct === 'number') ? LETTERS.charAt(q.correct) : null; });
      }
      if ((task === 'conv' || task === 'announce' || task === 'talk')
          && typeof correctAnswers !== 'undefined' && Array.isArray(correctAnswers)) {
        return correctAnswers.map(function(c){ return typeof c === 'number' ? LETTERS.charAt(c) : toLetter(c); });
      }
      if ((task === 'rdl' || task === 'academic')
          && typeof correctAnswers !== 'undefined' && correctAnswers && typeof correctAnswers === 'object' && !Array.isArray(correctAnswers)) {
        var out = [];
        Object.keys(correctAnswers).forEach(function(k){
          var n = Number(k);
          if (!isNaN(n) && n >= 1) out[n - 1] = String(correctAnswers[k]).toUpperCase();
        });
        return out;
      }
    } catch (e) {}
    return null;
  }

  /* CTW: correct endings for a given set (1|2) from the page's SD. */
  function ctwKeyForSet(setN){
    try {
      if (typeof SD !== 'undefined' && Array.isArray(SD) && SD[setN - 1]) {
        return SD[setN - 1].target.filter(function(t){ return t.a !== null; }).map(function(t){ return t.a; });
      }
    } catch (e) {}
    return null;
  }

  /* Sentence: model sentences (+alt) from the page's `answers` global. */
  function sentenceKey(){
    try {
      if (task === 'sentence' && typeof answers !== 'undefined' && Array.isArray(answers)) return answers;
    } catch (e) {}
    return null;
  }
  function normSentence(s){ return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  // Lazy-load api.js if the page doesn't include it.
  function ensureApi(cb){
    if (typeof Api !== 'undefined' && Api.getMyAnswers) return cb();
    var here = '';
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      if (/student-history\.js(\?|$|#)/.test(src)) { here = src; break; }
    }
    if (!here) { return poll(cb); }
    var apiSrc = here.replace(/student-history\.js(\?[^#]*)?(\#.*)?$/, 'api.js$1');
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
    // Page-level restore: the page's own "あなたの回答" preview reads
    // sessionStorage, which dies with the browser. When it still shows
    // the placeholder, fill it with the newest server submission so the
    // student sees their text on any device.
    try {
      var prev = document.getElementById('userPreview');
      if (prev && (prev.querySelector('.no-response') || !prev.textContent.trim())) {
        var newest = attempts[0];
        var txt = (newest.answers && newest.answers.text) || '';
        if (txt) {
          prev.textContent = txt;
          var stats = document.getElementById('userStats');
          if (stats) {
            var w0 = (newest.answers && newest.answers.words) || '—';
            var t0 = (newest.answers && (newest.answers.time || newest.answers.timeUsed)) || '—';
            stats.innerHTML = '<span class="jp">語数: ' + escapeHtml(String(w0)) + ' | 使用時間: ' + escapeHtml(String(t0)) + '</span><span class="en">Words: ' + escapeHtml(String(w0)) + ' | Time used: ' + escapeHtml(String(t0)) + '</span>';
          }
        }
      }
    } catch (e) {}
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

  // True when every stored selection is 0/empty — the old auth.js auto-save
  // pushed a score-only row (new Array(total).fill(0)) before per-question
  // selections were captured (2026-06-25, #89/#90). Show an honest note
  // instead of "Q1: 0".
  function selectionsLookEmpty(ans){
    if (!ans) return true;
    var vals = Array.isArray(ans) ? ans : Object.keys(ans).map(function(k){ return ans[k]; });
    if (!vals.length) return true;
    return vals.every(function(v){
      var x = (v && typeof v === 'object' && 'selected' in v) ? v.selected : v;
      return x === 0 || x === '0' || x === null || x === undefined || x === '';
    });
  }

  var SCORE_ONLY_NOTE = '<div style="padding:8px 10px;background:#FFF4D6;border:1px solid #E3C871;border-radius:8px;color:#6B5A1E;font-size:.84em;line-height:1.55"><span class="jp">この記録は得点のみ保存された旧仕様（2026-06-25以前）のため、設問ごとの選択内容は表示できません（得点は有効です）。</span><span class="en">This attempt predates per-question recording (before 2026-06-25), so only the score is available.</span></div>';

  /* Render the learner's per-question selections with ✓/✗ against the
     page's own answer key. Rows carry data-ok for the 間違いのみ filter. */
  function formatSelections(ans, att){
    if (selectionsLookEmpty(ans)) return SCORE_ONLY_NOTE;

    /* ---- CTW: typed word-endings vs SD ---- */
    if (task === 'ctw') {
      var sm = String(att && att.set || '').match(/Set\s*(\d)/i);
      var key0 = sm ? ctwKeyForSet(Number(sm[1])) : null;
      var arr = Array.isArray(ans) ? ans : toArr0(ans);
      var rows0 = arr.map(function(v, i){
        v = unwrap(v);
        var corr = key0 ? key0[i] : null;
        var ok = (corr != null && !isBlankVal(v)) ? (String(v).toLowerCase() === String(corr).toLowerCase()) : null;
        return row(i + 1, isBlankVal(v) ? '—' : String(v), corr, ok);
      }).join('');
      return wrapRows(rows0);
    }

    /* ---- Sentence: built sentences vs model (+alt) ---- */
    if (task === 'sentence') {
      var models = sentenceKey();
      var arr2 = Array.isArray(ans) ? ans : toArr0(ans);
      var rows1 = arr2.map(function(v, i){
        v = unwrap(v);
        var mdl = models && models[i];
        var ok = null;
        if (mdl && !isBlankVal(v)) {
          var u = normSentence(v);
          ok = (u === normSentence(mdl.sentence)) || (mdl.alt ? u === normSentence(mdl.alt) : false);
        }
        return row(i + 1, isBlankVal(v) ? '—' : String(v), mdl ? mdl.sentence : null, ok, true);
      }).join('');
      return wrapRows(rows1);
    }

    /* ---- Letter tasks (RDL/Academic/LCR/Conv/Announce/Talk) ---- */
    var key = pageAnswerKey();
    var obj1 = toObj1(ans);
    var nums = Object.keys(obj1).sort(function(a,b){ return Number(a) - Number(b); });
    var rows2 = nums.map(function(n){
      var sel = obj1[n];
      var corr = key ? (key[Number(n) - 1] || null) : null;
      var ok = (corr != null && sel != null) ? (sel === corr) : null;
      return row(n, sel == null ? '—' : sel, corr, ok);
    }).join('');
    return wrapRows(rows2);

    function row(n, yours, corr, ok, isLong){
      var mark = ok === null ? '' : (ok
        ? '<span style="color:#007646;font-weight:800">✓</span>'
        : '<span style="color:#B85C3C;font-weight:800">✗</span>');
      var corrHtml = (ok === false && corr != null)
        ? '<span style="color:#5A6861;font-size:.9em"><span class="jp">正解: </span><span class="en">Correct: </span><strong style="color:#007646">' + escapeHtml(String(corr)) + '</strong></span>'
        : '';
      return '<div data-ok="' + (ok === true ? '1' : '0') + '" style="padding:5px 0;display:flex;gap:10px;align-items:baseline;font-size:.88em;flex-wrap:wrap;border-bottom:1px dashed #F5E9D3">' +
        '<span style="min-width:38px;color:#5A6861;font-weight:600">Q' + escapeHtml(String(n)) + '</span>' +
        '<span style="min-width:16px">' + mark + '</span>' +
        '<strong style="color:#005434;' + (isLong ? 'flex:1;min-width:180px' : '') + '">' + escapeHtml(String(yours)) + '</strong>' +
        corrHtml +
      '</div>';
    }
    function wrapRows(r){
      return '<div style="margin-top:8px;padding:12px 14px;background:#fff;border:1px solid #F5E9D3;border-radius:8px">' +
        '<div style="font-size:.78em;font-weight:700;color:#8A6D2A;margin-bottom:6px"><span class="jp">あなたが選んだ答え（✗の行に正解を表示）</span><span class="en">Your answers (correct answer shown on ✗ rows)</span></div>' + r + '</div>';
    }
  }

  function displayKeysFor(){
    if (task === 'rdl' || task === 'academic') return ['training_' + task + '_p' + practice + '_answers'];
    if (task === 'lcr') return ['lcrAnswers'];
    if (task === 'conv' || task === 'announce') return [task + 'Answers'];
    if (task === 'talk') return ['talkPractice' + practice + 'Answers'];
    // Sentence pages use a practice-scoped key everywhere except P1
    // (P1 = `sentenceAnswers`, P2..P10 = `sentenceAnswers_pN`).
    if (task === 'sentence') return [String(practice) === '1' ? 'sentenceAnswers' : 'sentenceAnswers_p' + practice];
    if (task === 'ctw') return ['ctw_p' + practice + '_answers_1', 'ctw_p' + practice + '_answers_2'];
    return null;
  }
  function displayKeysPresent(){
    var keys = displayKeysFor();
    if (!keys) return true;
    try { return keys.some(function(k){ return sessionStorage.getItem(k) !== null; }); } catch (e) {}
    return true;
  }

  /* If this page rendered with NO attempt data (sessionStorage empty and
     no localStorage mirror — typically another device), restore the
     newest usable server attempt into the page's own display key and
     reload once. Returns true when a reload was triggered. */
  function restorePageFromServer(attempts){
    var displayKeys = displayKeysFor();
    if (!displayKeys) return false;
    if (displayKeysPresent()) return false;

    function usable(a){ return a && a.answers && !selectionsLookEmpty(a.answers); }
    var FLAG = 'tck_stu_restored_' + task + '_p' + practice;
    var wrote = false, sig = '';

    if (task === 'ctw') {
      var seen = {};
      attempts.forEach(function(a){
        var m2 = String(a.set || '').match(/Set\s*(\d)/i);
        if (!m2 || seen[m2[1]]) return;
        // Pre-rebuild attempts answered the OLD passages — never map them
        // onto today's questions. The panel links to the legacy archive.
        if (String(a.timestamp || '') < CTW_REBUILD_ISO) return;
        seen[m2[1]] = 1;
        if (!usable(a)) return;
        var ua = Array.isArray(a.answers) ? a.answers : [];
        rawSet('ctw_p' + practice + '_answers_' + m2[1], JSON.stringify({ answers: ua, score: Number(a.score) || 0, total: ua.length || 10 }));
        wrote = true; sig += String(a.timestamp || '') + ';';
      });
    } else {
      var att = null;
      for (var i = 0; i < attempts.length; i++) { if (usable(attempts[i])) { att = attempts[i]; break; } }
      if (att) {
        sig = String(att.timestamp || '1');
        if (task === 'rdl' || task === 'academic') {
          rawSet(displayKeys[0], JSON.stringify(toObj1(att.answers))); wrote = true;
        } else if (task === 'lcr') {
          var key = pageAnswerKey();
          var obj1 = toObj1(att.answers), lifted = {};
          Object.keys(obj1).forEach(function(n){
            var sel = obj1[n];
            var corr = key ? (key[Number(n) - 1] || null) : null;
            lifted['q' + n] = { selected: sel, correct: corr, isCorrect: corr != null ? sel === corr : null };
          });
          rawSet(displayKeys[0], JSON.stringify(lifted)); wrote = true;
        } else if (task === 'conv' || task === 'announce' || task === 'talk') {
          rawSet(displayKeys[0], JSON.stringify(toArr0(att.answers))); wrote = true;
        } else if (task === 'sentence') {
          var arr = Array.isArray(att.answers) ? att.answers.map(unwrap) : [];
          // Carry the attempt timestamp so the answers page can show the
          // era-correct prompt (prompts revised in #163; answers unchanged).
          rawSet(displayKeys[0], JSON.stringify({ answers: arr, score: Number(att.score) || 0, total: arr.length || 10, ts: att.timestamp || '' })); wrote = true;
        }
      }
    }

    if (wrote && sessionStorage.getItem(FLAG) !== sig) {
      rawSet(FLAG, sig);
      location.reload();
      return true;
    }
    return false;
  }

  /* Score rescue — when per-question data can NOT be put back on the page
     (pre-capture zero rows, pre-rebuild CTW), the page's own header shows
     a misleading 0/N even though the SCORE column on the server is real
     (the "My Score says 65%, the page says 0%" complaint).

     The number shown here MUST equal the number the learner just clicked
     in My Score, so this reproduces history-sync's aggregation and
     my-score's pickCurrent EXACTLY: per-set buckets (CTW) summed as
     latest / best (best skips 0-score sets), then latest wins only when
     it lands at/after the switch-over and isn't a glitch zero — otherwise
     best. Touches DOM text only — never writes storage. */
  var SCORE_CUTOFF = '2026-06-29T15:00:00Z';   // keep in sync with js/history-sync.js + my-score.html
  function rescueScoreHeader(attempts){
    try {
      if (displayKeysPresent()) return;

      // ---- bucket per set (CTW: Set 1/2; others: one bucket) ----
      var buckets = {};
      attempts.forEach(function(a){
        if (!a || a.score === null || a.score === undefined || a.score === '') return;
        var tot = Array.isArray(a.answers) ? a.answers.length
                : (a.answers && typeof a.answers === 'object' ? Object.keys(a.answers).length : 0);
        if (!tot) return;
        var sk = '0';
        if (task === 'ctw') {
          var m = String(a.set || '').match(/Set\s*(\d+)/i);
          if (!m) return;                       // set-less CTW row = legacy garbage
          sk = m[1];
        }
        (buckets[sk] = buckets[sk] || []).push({ score: Number(a.score) || 0, total: tot, ts: String(a.timestamp || '') });
      });
      var setKeys = Object.keys(buckets);
      if (!setKeys.length) return;

      var latestC = 0, latestT = 0, bestC = 0, bestT = 0, latestTs = '';
      var perSetLatest = {}, perSetBest = {};
      setKeys.forEach(function(sk){
        var rows = buckets[sk];
        rows.sort(function(x, y){ return x.ts.localeCompare(y.ts); });
        var latest = rows[rows.length - 1];
        latestC += latest.score; latestT += latest.total;
        if (latest.ts > latestTs) latestTs = latest.ts;
        perSetLatest[sk] = latest;
        var bestRow = null;
        rows.forEach(function(r){ if (bestRow === null || r.score > bestRow.score) bestRow = r; });
        // Same rule as history-sync: a set whose best is 0 points is an
        // "opened but not completed" artifact — leave it out of BEST sums.
        if (bestRow && bestRow.score > 0) { bestC += bestRow.score; bestT += bestRow.total; perSetBest[sk] = bestRow; }
      });

      // ---- pickCurrent (identical to my-score / history-sync) ----
      var useLatest = latestT > 0 && latestTs >= SCORE_CUTOFF && !(latestC === 0 && latestT > 0);
      var pickC = useLatest ? latestC : (bestT > 0 ? bestC : latestC);
      var pickT = useLatest ? latestT : (bestT > 0 ? bestT : latestT);
      var perSet = useLatest ? perSetLatest : (bestT > 0 ? perSetBest : perSetLatest);
      if (!pickT) return;

      if (task === 'ctw') {
        var el = document.getElementById('scoreSummary');
        if (!el) return;
        var html = '';
        ['1', '2'].forEach(function(sk){
          var c = perSet[sk];
          html += '<div class="score-card"><h3>Set ' + sk + '</h3><div class="score-num"><span class="correct">' + (c ? c.score : '—') + '</span>/' + (c ? c.total : 10) + '</div><div class="score-detail">' + (c ? Math.round(c.score / c.total * 100) + '%' : '—') + '</div></div>';
        });
        html += '<div class="score-card total"><h3>Total</h3><div class="score-num"><span class="correct">' + pickC + '</span>/' + pickT + '</div><div class="score-detail">' + Math.round(pickC / pickT * 100) + '%</div></div>';
        el.innerHTML = html;
        return;
      }
      var el2 = document.getElementById('scoreDisplay') || document.getElementById('scoreBig');
      if (el2) el2.textContent = pickC + ' / ' + pickT;
      var bar = document.getElementById('scoreBar');
      if (bar) bar.style.width = (pickC / pickT * 100) + '%';
    } catch (e) {}
  }

  // Auto-graded tasks: per-attempt score line + expandable graded answers.
  function renderAutoGraded(attempts){
    if (!attempts.length) return;
    var box = document.createElement('div');
    box.id = 'tckMyHistory';
    box.style.cssText = 'background:#FBF6EC;border:1px solid #F5E9D3;border-radius:14px;padding:18px 22px;margin:22px auto;max-width:840px;font-family:"Zen Kaku Gothic New","Noto Sans JP",sans-serif';

    var header = '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">' +
      '<div style="font-weight:800;color:#005434;font-size:1em"><span class="jp">📊 これまでのあなたの記録（' + attempts.length + ' 回）</span><span class="en">📊 Your past attempts (' + attempts.length + ')</span></div>' +
      '<button id="tckWrongOnlyBtn" type="button" style="margin-left:auto;background:#fff;border:1px solid #B85C3C;color:#B85C3C;border-radius:999px;padding:4px 14px;font-size:.78em;font-weight:700;cursor:pointer;font-family:inherit"><span class="jp">✗ 間違いのみ表示</span><span class="en">✗ Wrong only</span></button>' +
    '</div>';

    // CTW attempts predating the 2026-07-02 rebuild → link to the archive
    // that still shows the questions as they were.
    var legacyNote = '';
    if (task === 'ctw' && attempts.some(function(a){ return a.timestamp && String(a.timestamp) < CTW_REBUILD_ISO; })) {
      legacyNote = '<div style="margin-bottom:12px;padding:10px 14px;background:#FFF4D6;border:1px solid #E3C871;border-radius:10px;color:#6B5A1E;font-size:.86em;line-height:1.6">' +
        '<span class="jp">⚠ 2026-07-02 の問題全面改訂より前の記録が含まれます。当時の問題文・自分の回答は <a href="legacy/practice-' + practice + '-answers.html" style="color:#8A3E24;font-weight:700">旧版アーカイブ</a> で確認できます（復習用の再挑戦も可能です）。</span>' +
        '<span class="en">⚠ Some attempts predate the 2026-07-02 question rebuild. View them (and retry the original questions) in the <a href="legacy/practice-' + practice + '-answers.html" style="color:#8A3E24;font-weight:700">legacy archive</a>.</span></div>';
    }

    var rows = attempts.map(function(att, i){
      var dt = att.timestamp ? new Date(att.timestamp).toLocaleString('ja-JP', { hour12:false }) : '';
      var sc = (att.score === null || att.score === undefined || att.score === '') ? null : Number(att.score);
      var ans = att.answers;
      var total = Array.isArray(ans) ? ans.length : (ans && typeof ans === 'object' ? Object.keys(ans).length : 0);
      var pct = (sc !== null && total > 0) ? Math.round(sc / total * 100) : null;
      var color = (pct === null) ? '#5A6861' : (pct >= 80) ? '#005434' : (pct >= 50) ? '#A47A1F' : '#9C3D1F';
      var icon  = (pct === null) ? '○' : (pct >= 80) ? '🌟' : (pct >= 50) ? '✓' : '↻';
      var isLegacyCtw = (task === 'ctw' && att.timestamp && String(att.timestamp) < CTW_REBUILD_ISO);
      var setLabel = '';
      var setMatch = String(att.set || '').match(/Set\s+(\d+)/);
      if (setMatch) setLabel = '<span style="color:#5A6861;font-family:Manrope,sans-serif;font-size:.78em;background:#F5E9D3;padding:2px 8px;border-radius:999px">Set ' + setMatch[1] + '</span>';
      var label = (i === 0 ? '🆕 ' : '#' + (attempts.length - i) + '  ');
      var scoreHtml = '<div style="font-family:Manrope,sans-serif;font-weight:800;color:' + color + ';font-size:1.05em;margin-left:auto">' +
          icon + ' ' + (sc !== null ? sc + (total > 0 ? ' / ' + total : '') : '—') +
          (pct !== null ? '<span style="font-size:.82em;font-weight:600;margin-left:6px;color:#5A6861">(' + pct + '%)</span>' : '') +
        '</div>';
      var body = isLegacyCtw
        ? '<div style="margin-top:8px;padding:8px 12px;background:#FFF4D6;border:1px solid #E3C871;border-radius:8px;color:#6B5A1E;font-size:.84em"><span class="jp">この回は改訂前の問題への回答です → <a href="legacy/practice-' + practice + '-answers.html" style="color:#8A3E24;font-weight:700">旧版アーカイブで見る</a></span><span class="en">This attempt used the pre-rebuild questions → <a href="legacy/practice-' + practice + '-answers.html" style="color:#8A3E24;font-weight:700">view in the legacy archive</a></span></div>'
        : formatSelections(ans, att);
      return '<details ' + (i === 0 ? 'open' : '') + ' style="border-top:1px solid #F5E9D3;padding:12px 0">' +
        '<summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
          '<span style="font-family:Manrope,sans-serif;font-size:.82em;color:#5A6861;min-width:170px">' + escapeHtml(label + dt) + '</span>' +
          setLabel + scoreHtml +
          '<span style="font-size:.72em;color:#8A6D2A;font-weight:700;width:100%;margin-top:2px">▼ <span class="jp">答案を見る</span><span class="en">View answers</span></span>' +
        '</summary>' + body +
      '</details>';
    }).join('');

    box.innerHTML = header + legacyNote + rows;

    // 間違いのみ filter — hides data-ok="1" rows inside this panel.
    var style = document.createElement('style');
    style.textContent = '#tckMyHistory.tck-wrong-only [data-ok="1"]{display:none}';
    box.appendChild(style);
    var btn = box.querySelector('#tckWrongOnlyBtn');
    if (btn) btn.addEventListener('click', function(){
      var on = box.classList.toggle('tck-wrong-only');
      btn.style.background = on ? '#B85C3C' : '#fff';
      btn.style.color = on ? '#fff' : '#B85C3C';
    });

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
      // Auto-graded tasks. For CTW we deliberately do NOT pass setNum so
      // the panel shows every set the student has tried for this practice.
      Api.getMyAnswers(task, practice, setNum).then(function(r){
        if (!r || !r.success) return;
        var attempts = r.attempts || [];
        // Other-device restore: fill the page's own display key from the
        // newest server attempt and reload once so the page shows it.
        if (attempts.length && restorePageFromServer(attempts)) return;
        // Restore impossible (old-era rows) → at least repaint the score
        // header with the real server score instead of a misleading 0/N.
        if (attempts.length) rescueScoreHeader(attempts);
        renderAutoGraded(attempts);
      }).catch(function(){});
    }
  });
})();
