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
 * That Module 1 → Module 2 handoff is owned entirely by reading-m2-select.html's
 * startModule2(), and it is NOT a plain wipe: it first ARCHIVES the learner's
 * q11–q20 answers into the m1-namespaced keys (practice_reading_m1_ans /
 * practice_reading_m1_ctw), and only then clears the live keys. Module 2 REUSES
 * the q11–q20 ids, so the live keys must be cleared — but the Module-1 answers
 * themselves must survive, because the results snapshot and the Admin
 * per-question review both read them back.
 *
 * Do NOT add a bare "clear Module 1" helper here and wire it into that handoff:
 * a wipe that skips the archive step would silently destroy answers the learner
 * is entitled to keep. (Such a helper used to live here, unused, described as
 * "behaviour is identical" to startModule2() — it was not, and it was removed.)
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

  /* ---------- section-global timer ----------
   * Each Reading page historically ran its OWN hardcoded countdown, so moving
   * back reset the clock to that page's start value (extra time, unlike the
   * real TOEFL single section clock). Instead we keep one deadline per module
   * in sessionStorage and drive the timer element from it, so the countdown is
   * continuous across back/forward within a module. Module totals mirror the
   * ETS 2026 official Reading timing: the routing module and the second module
   * together run about 27 minutes (27-30 across both adaptive modules). The
   * mock previously ran 36:00 + 9:30/12:00 = 45:30/48:00 — roughly 1.6x the
   * real thing — so the totals below were rescaled to land inside the official
   * range while keeping the old internal balance (M1 : M2 was about 3 : 1, and
   * the harder Module 2 stays longer than the easier one):
   *   Module 1 = 21:00; Module 2 easy = 6:00, hard = 7:00
   *   -> 27:00 total on the easy path, 28:00 on the hard path.
   * (The two Module-2 paths are mutually exclusive per attempt.) Keys are
   * practice_-prefixed so test-select's cross-test wipe clears them.
   */
  function initTimer() {
    var el = document.getElementById('timerDisplay') || document.getElementById('timer');
    if (!el) return;
    var pk = pageKey(), mod, total;
    if (pk.indexOf('m2e') !== -1)      { mod = 'm2'; total = 6 * 60; }
    else if (pk.indexOf('m2h') !== -1) { mod = 'm2'; total = 7 * 60; }
    else                                { mod = 'm1'; total = 21 * 60; } // ctw / rdl1 / rdl2 / academic
    // Stop the page's own per-page countdown (it stores its handle in the
    // global `timerInterval`); we render the element from the shared deadline.
    try { if (window.timerInterval) clearInterval(window.timerInterval); } catch (e) {}
    var dkey = 'practice_reading_deadline_' + mod;
    var dl = parseInt(sessionStorage.getItem(dkey), 10);
    if (!dl || isNaN(dl)) { dl = Date.now() + total * 1000; try { sessionStorage.setItem(dkey, String(dl)); } catch (e) {} }
    function render() {
      var left = Math.round((dl - Date.now()) / 1000);
      if (left < 0) left = 0;
      var m = Math.floor(left / 60), s = left % 60;
      el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
      if (left <= 0 && window.__rsTimerInterval) { try { clearInterval(window.__rsTimerInterval); } catch (e) {} }
    }
    render();
    try { window.__rsTimerInterval = setInterval(render, 1000); } catch (e) {}
  }

  function restoreAll() { restoreMC(); restoreCTW(); restoreInsertion(); initTimer(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreAll);
  else restoreAll();

  /* ---------- module boundary ----------
   * Intentionally no export here — see the header comment. The Module 1 → Module 2
   * handoff (archive, then clear) belongs to reading-m2-select.html's startModule2().
   */
})();
