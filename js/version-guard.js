/* version-guard.js — 自動更新（版ずれ検知 → 自動リロード）
 *
 * WHY: ブラウザはアプリのコード（HTML/JS）を数日キャッシュする。修正を本番に
 * 出しても、お客様の端末が古いコードを掴んだままだと反映されない（前田様・
 * 矢口様の「直したのに変わらない」の根本原因）。人手の「強制再読み込み」に
 * 依存せず、開いた瞬間にサーバ最新版と照合し、古ければ1回だけ自動リロードして
 * 新コードへ更新する。以後この種の不具合が構造的に起きなくなる。
 *
 * HOW:
 *  - このスクリプト自身の ?v=YYYYMMDD を「動作中の版(BUILD)」として読む。
 *  - 同ディレクトリ基準の version.json（no-store・キャッシュ回避）を取得し、
 *    build と一致しなければ（新旧どちらでも）location.reload()。
 *  - 無限ループ防止: sessionStorage で試行回数を数え、最大2回で打ち切り。
 *    最新に追いついたらカウンタをクリア。
 *  - 安全側: メニュー/トップ/マイスコア等「リロードで失うものが無いページ」
 *    にのみ読み込む（練習中ページには入れない）。取得失敗・オフラインは無視。
 *
 * DEPLOY: tools/bump-cache-version.py が version.json の build も同時に更新する。
 *   version.json の build と、全 HTML の ?v= は「常に同じ値」でなければならない。
 *   ずれている間、全端末が（上限2回まで）リロードを繰り返す。
 *
 * ⚠️ 版番号は必ず単調増加させること（実日付より進んでいても構わない）。
 *   2026-07-19〜07-22 の事故で最大 20260810 まで配布済みのため、以後の版は
 *   20260811 以上のみ有効。ここを下回る値を出すと、旧ロジック（数値比較）を
 *   掴んだままの端末が更新不能のまま取り残される。
 */
(function () {
  function selfScript() {
    if (document.currentScript) return document.currentScript;
    var ss = document.getElementsByTagName('script');
    for (var i = 0; i < ss.length; i++) {
      if (ss[i].src && /version-guard\.js/.test(ss[i].src)) return ss[i];
    }
    return null;
  }
  var s = selfScript();
  if (!s || !s.src) return;

  var mV = s.src.match(/[?&]v=(\d+)/);
  var BUILD = mV ? mV[1] : '';
  if (!BUILD) return;                                  // 版が読めなければ何もしない

  var base = s.src.replace(/js\/version-guard\.js.*$/, '');   // 同階層の base URL
  var url = base + 'version.json?ts=' + (new Date()).getTime();  // キャッシュ回避

  function clearTries() { try { sessionStorage.removeItem('tck_update_tries'); } catch (e) {} }

  try {
    fetch(url, { cache: 'no-store' }).then(function (r) {
      return r && r.ok ? r.json() : null;
    }).then(function (j) {
      if (!j) return;                                  // 取得不可 → 無視（degrade）
      var latest = String(j.build || '');
      if (!latest || !/^\d+$/.test(latest)) return;
      // 一致 → 何もしない。不一致なら「新しい/古い」を問わず1回だけ揃えにいく。
      // 旧実装は Number(latest) <= Number(BUILD) で「サーバの方が数値的に大きい時だけ」
      // 更新していた。そのため版番号が一度でも誤って未来日で配布されると（実際に
      // 2026-07-19〜07-22 に最大 20260810 まで逸脱・その後 20260723 へ巻き戻し）、
      // その版を掴んだ端末は latest <= BUILD が永久に真になり二度と更新されなくなる。
      // 方向を問わない不一致判定にすることで、同じ事故が起きても自己修復する。
      if (latest === BUILD) { clearTries(); return; }

      var tries = 0;
      try { tries = Number(sessionStorage.getItem('tck_update_tries') || '0'); } catch (e) {}
      if (tries >= 2) return;                          // ループ保険（2回で打ち切り）
      try { sessionStorage.setItem('tck_update_tries', String(tries + 1)); } catch (e) {}

      // 明示リロード（ブラウザは document を再検証 → 新しい HTML を取得し、
      // その HTML が参照する新しい ?v= の JS を読み込む）。
      location.reload();
    }).catch(function () {});                           // 通信失敗は無視
  } catch (e) {}
})();
