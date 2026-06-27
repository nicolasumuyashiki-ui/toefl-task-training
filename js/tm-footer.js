/* tm-footer.js — ETS trademark disclaimer, injected site-wide.
 *
 * Per ETS brand guidelines (TCK legal review): wherever the TOEFL mark
 * appears we must show the registered-trademark disclaimer. Loaded on
 * every page, this appends one disclaimer block to the end of <body>.
 * Centralised here so the wording lives in exactly one place.
 *
 * NOTE (English wording): the JP text below is verbatim from the legal
 * department / toefl-ibt.jp site policy. The EN line is the standard ETS
 * trademark disclaimer ("not endorsed or approved by ETS"). If legal
 * supplies exact licensed wording, update this one string.
 */
(function () {
  if (typeof document === 'undefined') return;

  function inject() {
    if (!document.body || document.getElementById('tckTmDisclaimer')) return;
    var el = document.createElement('div');
    el.id = 'tckTmDisclaimer';
    el.setAttribute('role', 'contentinfo');
    var css = [
      'box-sizing:border-box', 'width:100%', 'margin:0', 'padding:14px 22px 18px',
      'text-align:center', 'font-size:11px', 'line-height:1.65', 'color:#8A938C',
      'font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif',
      'background:transparent', 'border-top:1px solid rgba(0,0,0,.06)'
    ];
    // CRITICAL: never pin the disclaimer with position:fixed. A fixed footer
    // sits ON TOP of page content and was covering the "次へ" button (and on
    // small screens, question text / audio controls), so learners couldn't
    // advance, see the problem, or play audio. Instead keep it in NORMAL FLOW
    // at the very end of the document, where it can never overlap anything.
    //
    // Belt-and-suspenders: pointer-events:none guarantees that even if some
    // page positions content over this footer, clicks/taps pass THROUGH to the
    // control beneath (the disclaimer is non-interactive text — it has no
    // links/buttons, so nothing is lost by making it click-through).
    css.push('pointer-events:none');
    var disp = '', dir = '';
    try {
      var cs = window.getComputedStyle(document.body);
      disp = String(cs.display || '').toLowerCase();
      dir  = String(cs.flexDirection || '').toLowerCase();
    } catch (e) {}
    // On a flex/grid body (auth cards, some practice layouts) make the footer
    // span the full row and sort LAST, so it sits cleanly BELOW the centred
    // content instead of beside it. For a row-flex body, allow wrapping so the
    // full-width footer drops to its own line rather than squeezing the card.
    if (disp.indexOf('flex') !== -1) {
      css.push('flex-basis:100%', 'order:9999');
      if (dir.indexOf('row') === 0) { try { document.body.style.flexWrap = 'wrap'; } catch (e) {} }
    } else if (disp.indexOf('grid') !== -1) {
      css.push('grid-column:1 / -1', 'order:9999');
    }
    el.style.cssText = css.join(';');
    el.innerHTML =
      'TOEFLはEducational Testing Service（ETS）の登録商標です。このウェブサイトはETSによって承認または推奨されたものではありません。'
      + '<br>'
      + 'TOEFL is a registered trademark of Educational Testing Service (ETS). This website is not endorsed or approved by ETS.';
    document.body.appendChild(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
