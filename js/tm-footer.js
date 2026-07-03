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
      'box-sizing:border-box', 'width:100%', 'margin:0', 'padding:12px 22px 16px',
      'text-align:center', 'font-size:10px', 'line-height:1.6', 'color:#9AA39C',
      'font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif',
      'background:transparent', 'border-top:1px solid rgba(0,0,0,.05)'
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
    // Keep it SMALL and at the VERY BOTTOM — only seen when you scroll all the
    // way down — on every device. Practice / practice-test pages are
    // `min-height:100vh; display:flex; flex-direction:column`, so `margin-top:
    // auto` sinks the footer to the bottom edge of the viewport-tall column
    // (content stays at the top; footer is below the fold). For a row-flex body
    // (auth) allow wrapping so it drops to its own full-width line at the end.
    if (disp.indexOf('flex') !== -1) {
      css.push('order:9999', 'margin-top:auto');
      // CRITICAL: flex-basis meaning depends on the main axis.
      //  - ROW flex (auth pages): main axis = horizontal, so flex-basis is a
      //    WIDTH. 100% + flex-wrap drops the disclaimer onto its own full-width
      //    line at the very end. Correct.
      //  - COLUMN flex (every practice / practice-test page —
      //    display:flex;flex-direction:column;height:100vh;overflow:hidden):
      //    main axis = vertical, so flex-basis is a HEIGHT. Setting 100% made
      //    the disclaimer 100vh tall, driving free space negative and shrinking
      //    the flex:1 content region (.main-content) to ZERO height. With
      //    overflow:hidden that renders a fully blank page (the listening
      //    white-screen bug). So NEVER set flex-basis here for column: leave it
      //    auto (natural height). width:100% (base css) already spans the cross
      //    axis; margin-top:auto still sinks it and is inert wherever a
      //    flex-grow sibling already consumes the free space.
      if (dir.indexOf('column') !== 0) {
        css.push('flex-basis:100%');
        try { document.body.style.flexWrap = 'wrap'; } catch (e) {}
      }
    } else if (disp.indexOf('grid') !== -1) {
      css.push('grid-column:1 / -1', 'order:9999', 'margin-top:auto');
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
