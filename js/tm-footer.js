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
    el.style.cssText = [
      'box-sizing:border-box', 'width:100%', 'margin:0', 'padding:14px 22px 18px',
      'text-align:center', 'font-size:11px', 'line-height:1.65', 'color:#8A938C',
      'font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif',
      'background:transparent', 'border-top:1px solid rgba(0,0,0,.06)'
    ].join(';');
    el.innerHTML =
      'TOEFLはETSの登録商標です。このウェブサイトはETSの検討を受けまたはその承認を得たものではありません。'
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
