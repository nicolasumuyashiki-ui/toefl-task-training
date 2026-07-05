/* reading-state.js — Practice Test "Reading" section answer persistence.
 *
 * The Reading section is a sequence of SEPARATE HTML documents
 * (reading-ctw → reading-rdl1 → reading-rdl2 → reading-academic → …).
 * Historically each page kept the learner's answers only in an in-memory
 * `userAnswers` object / live DOM inputs, and NEVER restored them on load.
 * So navigating BACK to a previous question (footer "‹ Back", the Review
 * "Go to Question" jump, or the browser Back button) reloaded that page
 * fresh and wiped every answer — unlike the real TOEFL, which lets you move
 * back and forth within a module with your answers intact.
 *
 * This helper fixes that with ZERO per-page logic changes: it mirrors every
 * answer into sessionStorage as it is made (event delegation on the shared
 * markup) and restores them on load. It covers all three Reading answer
 * shapes used across the practice test:
 *   1. Single-choice MC     — `.option[data-q][data-v]`  (+ page `selectOption`)
 *   2. Complete-the-Words   — `.bx input`  (letter boxes, global order)
 *   3. Sentence insertion   — `.insert-square[data-insert]` (academic Q19)
 *
 * Scope / lifetime: sessionStorage, keys prefixed `practice_` so the existing
 * cross-test wipe in test-select.html (`/^(practice_|m1_|…)/`) clears them when
 * a new mock is started. Restoring is additive and never deletes answers.
 *
 * Real-TOEFL module boundary: going back is only meaningful WITHIN a module.
 * reading-m2-select.html calls PTReadingState.clearModule1() at the
 * Module 1 → Module 2 handoff so Module 2 starts clean and a learner cannot
 * reach back into the previous module (matches ETS adaptive behaviour).
 */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var MC_KEY  = 'practice_reading_ans';  // { "q11":"B", "q19":"C", ... }
  var CTW_KEY = 'practice_reading_ctw';   // { "reading-ctw.html":["a","b",...], ... }

  function readJSON(k) { try { return JSON.parse(sessionStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }
  function writeJSON(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function pageKey() { return (location.pathname.split('/').pop() || 'reading'); }
  function closest(el, sel) {
    while (el && el.nodeType === 1) { if (el.matches && el.matches(sel)) return el; el = el.parentElement; }
    return null;
  }

  /* ---------- capture (write) ---------- */

  function saveMC(q, v) { if (!q) return; var m = readJSON(MC_KEY); m[q] = v; writeJSON(MC_KEY, m); }

  function saveCTW() {
    var boxes = document.querySelectorAll('.bx input');
    if (!boxes.length) return;
    var arr = []; boxes.forEach(function (b) { arr.push(b.value || ''); });
    var m = readJSON(CTW_KEY); m[pageKey()] = arr; writeJSON(CTW_KEY, m);
  }

  // Capture in the CAPTURE phase so we record the answer even if a page
  // handler stops propagation.
  document.addEventListener('click', function (e) {
    var opt = closest(e.target, '.option[data-q][data-v]');
    if (opt) { saveMC(opt.getAttribute('data-q'), opt.getAttribute('data-v')); return; }
    var sq = closest(e.target, '.insert-square[data-insert]');
    if (sq) { saveMC('q19', sq.getAttribute('data-insert')); }
  }, true);

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches('.bx input')) saveCTW();
  }, true);

  /* ---------- restore (read) ---------- */

  function restoreMC() {
    var m = readJSON(MC_KEY);
    Object.keys(m).forEach(function (q) {
      // q19 is an INSERTION question on the Module-1 academic page (no
      // `.option` there → this no-ops and restoreInsertion() handles it) but a
      // normal MC on reading-m2h-academic2. So don't skip it: try the MC path,
      // which only fires when a matching `.option` actually exists on this page.
      var el = document.querySelector('.option[data-q="' + q + '"][data-v="' + m[q] + '"]');
      if (!el) return;
      if (typeof window.selectOption === 'function') {
        try { window.selectOption(el); return; } catch (e) {}
      }
      el.classList.add('selected');
      var inp = el.querySelector('input'); if (inp) inp.checked = true;
      if (window.userAnswers) window.userAnswers[q] = m[q];
    });
  }

  function restoreCTW() {
    var boxes = document.querySelectorAll('.bx input');
    if (!boxes.length) return;
    var arr = readJSON(CTW_KEY)[pageKey()];
    if (!arr || !arr.length) return;
    boxes.forEach(function (b, i) { if (arr[i] != null && arr[i] !== '') b.value = arr[i]; });
  }

  // Academic Q19 insertion: set the page globals so that when the learner
  // returns to the insertion page, updateParagraphVersion() rebuilds the
  // paragraph with the sentence placed, and the Review overlay marks it
  // answered. `selectedInsertionPoint` is declared (null) only on the
  // academic page, so this is a no-op elsewhere.
  function restoreInsertion() {
    var pos = readJSON(MC_KEY)['q19'];
    if (!pos) return;
    if (typeof window.selectedInsertionPoint === 'undefined') return;
    try { window.selectedInsertionPoint = pos; } catch (e) {}
    if (window.userAnswers) window.userAnswers['q19'] = pos;
    if (typeof window.updateParagraphVersion === 'function') {
      try { window.updateParagraphVersion(); } catch (e) {}
    }
  }

  function restoreAll() { restoreMC(); restoreCTW(); restoreInsertion(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreAll);
  else restoreAll();

  /* ---------- module boundary ---------- */

  window.PTReadingState = {
    clearModule1: function () {
      var mc = readJSON(MC_KEY);
      ['q11', 'q12', 'q13', 'q14', 'q15', 'q16', 'q17', 'q18', 'q19', 'q20'].forEach(function (q) { delete mc[q]; });
      writeJSON(MC_KEY, mc);
      var ctw = readJSON(CTW_KEY); delete ctw['reading-ctw.html']; writeJSON(CTW_KEY, ctw);
    }
  };
})();
