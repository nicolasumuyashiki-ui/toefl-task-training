/**
 * gas-hold-yagu-reading.js — 矢口さま（yagu1004）の Reading バンドを 4.5 に固定（フロア）
 *
 * WHY
 *   据え置き対応で Listening 5.0 / Writing 5.0 / Total は BANDS シートに固定済みだが、
 *   Reading だけはフロアが 3.5（scaled 16）のままで、表示の 4.5 は「実データの再計算」に
 *   依存していた。通信失敗時などに 3.5 へ落ちうるため、L/W と同じく Reading も 4.5 を
 *   サーバ側フロアとして固定し、どの端末・キャッシュ状態でも必ず 4.5 以上にする。
 *
 *   これは 3.5 → 4.5 への「引き上げ」のみ。_mergeBands_ は MAX マージなので、
 *   既存の値より下げることは絶対にない（「スコアを下げない」ルールに完全準拠）。
 *   今後 Reading で全問不正解の回があっても、フロア 4.5 は維持される（HWM）。
 *
 * バンド境界（sectionToBand(scaled) = totalToBand(scaled*4)）:
 *   scaled 22 → 22*4=88 → ≥86 = 4.5（4.5 の最小フロア）
 *   scaled 21 → 84 → 4.0 / scaled 24 → 96 → 5.0
 *
 * 前提: _bandsSheet_() と _mergeBands_() が GAS プロジェクトに既に存在すること
 *       （gas-band-hwm.js / getBands・saveBands デプロイ済み）。
 *
 * 実行: GAS の関数ドロップダウンで holdYaguReading を選んで ▶（1回でよい）。
 *       ログに merged 後の bands が出れば成功。
 */
function holdYaguReading() {
  var USER_ID = 'yagu1004';
  // Reading 4.5 のフロア。pct / correctTotal は表示用メタ（22/30 ≒ 72%）。
  var incoming = {
    sec_reading: { scaled: 22, pct: 72, correctTotal: 22, attempts: 1 }
  };

  var sh = _bandsSheet_();
  var d = sh.getDataRange().getValues();
  var now = new Date().toISOString();

  for (var r = 1; r < d.length; r++) {
    if (String(d[r][0]) === USER_ID) {
      var cur = {};
      try { cur = JSON.parse(d[r][1] || '{}'); } catch (e) { cur = {}; }
      var merged = _mergeBands_(cur, incoming); // MAX マージ：3.5→4.5 に上がるだけ
      sh.getRange(r + 1, 2).setValue(JSON.stringify(merged));
      sh.getRange(r + 1, 3).setValue(now);
      Logger.log('yagu1004 BANDS 更新（Reading 4.5 固定）: ' + JSON.stringify(merged));
      return;
    }
  }
  // 行が無ければ新規（通常は holdYaguBands 済みなので既存行があるはず）
  sh.appendRow([USER_ID, JSON.stringify(_mergeBands_({}, incoming)), now]);
  Logger.log('yagu1004 BANDS 新規作成（Reading 4.5 固定）');
}
