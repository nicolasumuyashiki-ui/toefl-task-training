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
    // Auth pages (login / password-change / admin login) centre a single card
    // via `body{display:flex;justify-content:center;align-items:center}`. A
    // normally-appended child becomes a SECOND flex item and lands BESIDE the
    // card, breaking the layout. When the body is a flex/grid container, pin
    // the disclaimer to the viewport bottom so it stays out of that flow.
    var disp = '', dir = '';
    try {
      var cs = window.getComputedStyle(document.body);
      disp = String(cs.display || '').toLowerCase();
      dir  = String(cs.flexDirection || '').toLowerCase();
    } catch (e) {}
    // Only pin to the viewport bottom when a normally-appended child would land
    // BESIDE the centred card — i.e. a ROW flex container, or a grid. A COLUMN
    // flex container (e.g. the login page) stacks children vertically, so the
    // disclaimer flows cleanly BELOW the card's own footer links; pinning it
    // fixed there just overlaps "パスワードを忘れた / 管理者はこちら".
    var isRowFlex = disp.indexOf('flex') !== -1 && dir.indexOf('row') === 0;
    var isGrid = disp.indexOf('grid') !== -1;
    if (isRowFlex || isGrid) {
      css.push('position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:1');
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
