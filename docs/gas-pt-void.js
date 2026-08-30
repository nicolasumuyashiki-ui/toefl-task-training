/**
 * gas-pt-void.js — 不具合で正しく採点できなかった模試結果を「無効化」する
 *
 * ■ 背景（2026-08）
 * practice-test/test3/reading-rdl2.html は test3 作成時（2026-06-28）から
 * ページ送りの id が page13/14/15 と誤っており、Next が例外で停止していた。
 * 生徒は Review パネルの「Go to Question」で先のページへ飛んで脱出できたが、
 * その経路では rdl2 の採点関数 saveM1RDL2Score() が実行されないため
 * localStorage の m1_rdl2_total が書かれず、**Reading の分母が 40 → 37 に
 * 減った状態**で Band が算出されていた（実例: 模試2 が 24/40 なのに
 * 模試3 は 22/37）。つまり Reading が 3 問ぶん不当に低く出ている。
 *
 * 修正後は 40 点満点に戻るため、旧記録をそのまま残すと過去と比較できず、
 * 予想バンドを不当に押し下げ続ける。
 *
 * ■ 方針: 消さない。退避して外す。
 * CLAUDE.md の最優先ルール「学習者の履歴・スコアを絶対にリセットしない」に従い、
 * 行は削除せず PT_RESULTS_VOID シートへ**丸ごとコピーしてから** PT_RESULTS から
 * 外す。無効化した理由と日時も一緒に残すので、いつでも元に戻せる。
 *   - 触るのは PT_RESULTS と PT_RESULTS_VOID のみ
 *   - ANSWERS / RECORDINGS / RECORDINGS_PT / PT_ANSWERS / BANDS には一切触れない
 *     （PT_ANSWERS の回答本文は残るので、後から内容を確認できる）
 *
 * ■ 使い方
 *   listBrokenPtResults()                     … 対象を一覧（確認のみ・変更しない）
 *   voidPtResult('<sessionId>')               … 確認のみ（dry run）
 *   voidPtResult('<sessionId>', {apply:true}) … 実際に退避して外す
 *   unvoidPtResult('<sessionId>')             … 退避したものを PT_RESULTS へ戻す
 */

var PT_VOID_SHEET = 'PT_RESULTS_VOID';

/* 不具合の影響を受けた回を、氏名ではなくデータで特定する。
   模試3（testId='3'）で Reading の分母が 40 未満の行＝rdl2 が採点されていない回。 */
function listBrokenPtResults() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PT_RESULTS');
  if (!sh) { Logger.log('PT_RESULTS シートがありません'); return []; }
  var d = sh.getDataRange().getValues();
  if (d.length < 2) { Logger.log('PT_RESULTS は空です'); return []; }

  var H = d[0].map(function (x) { return String(x || '').trim(); });
  var iUid = H.indexOf('userId'), iName = H.indexOf('userName'), iSid = H.indexOf('sessionId');
  var iRT = H.indexOf('readingTotal'), iRC = H.indexOf('readingCorrect');
  var iTid = H.indexOf('testId'), iTs = H.indexOf('timestamp'), iBand = H.indexOf('band');

  var hits = [];
  Logger.log('=== 模試3で Reading の分母が 40 未満の回（rdl2 未採点）===');
  for (var r = 1; r < d.length; r++) {
    if (String(d[r][iTid] || '').trim() !== '3') continue;
    var total = Number(d[r][iRT]) || 0;
    if (total >= 40) continue;
    hits.push({ row: r + 1, sessionId: String(d[r][iSid] || '') });
    Logger.log('  行' + (r + 1) + ' | ' + d[r][iUid] + '（' + d[r][iName] + '） | ' +
      String(d[r][iTs]).slice(0, 16) + ' | Reading ' + d[r][iRC] + '/' + total +
      ' | Band ' + d[r][iBand] + ' | sessionId=' + d[r][iSid]);
  }
  Logger.log(hits.length ? ('合計 ' + hits.length + ' 件 → voidPtResult(\'<sessionId>\', {apply:true}) で無効化')
                         : '対象なし ✅');
  return hits;
}

/* 1件を PT_RESULTS_VOID へ退避して PT_RESULTS から外す。既定は確認のみ。 */
function voidPtResult(sessionId, opts) {
  opts = opts || {};
  var APPLY = opts.apply === true;
  var reason = opts.reason || '模試3 reading-rdl2 の不具合により Reading が 37 点満点で採点されたため無効化';
  sessionId = String(sessionId || '').trim();
  if (!sessionId) { Logger.log('sessionId を指定してください'); return 0; }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('PT_RESULTS');
  if (!sh) { Logger.log('PT_RESULTS シートがありません'); return 0; }
  var d = sh.getDataRange().getValues();
  var H = d[0].map(function (x) { return String(x || '').trim(); });
  var iSid = H.indexOf('sessionId');
  if (iSid < 0) { Logger.log('sessionId 列がありません'); return 0; }

  var target = -1;
  for (var r = 1; r < d.length; r++) {
    if (String(d[r][iSid]).trim() === sessionId) { target = r; break; }
  }
  if (target < 0) { Logger.log('該当なし: ' + sessionId); return 0; }

  Logger.log((APPLY ? '=== 無効化（実行）===' : '=== 無効化（確認のみ・変更しません）==='));
  H.forEach(function (h, i) { Logger.log('  ' + h + ' = ' + d[target][i]); });

  if (!APPLY) {
    Logger.log('→ 実行するには voidPtResult(\'' + sessionId + '\', {apply:true})');
    return 0;
  }

  var vs = ss.getSheetByName(PT_VOID_SHEET);
  if (!vs) { vs = ss.insertSheet(PT_VOID_SHEET); vs.appendRow(H.concat(['voidedAt', 'reason'])); }
  vs.appendRow(d[target].concat([new Date().toISOString(), reason]));
  sh.deleteRow(target + 1);
  Logger.log('✓ PT_RESULTS_VOID へ退避し、PT_RESULTS から外しました（行' + (target + 1) + '）');
  Logger.log('  戻すには unvoidPtResult(\'' + sessionId + '\')');
  return 1;
}

/* 退避したものを PT_RESULTS へ戻す（取り消し）。 */
function unvoidPtResult(sessionId) {
  sessionId = String(sessionId || '').trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var vs = ss.getSheetByName(PT_VOID_SHEET);
  var sh = ss.getSheetByName('PT_RESULTS');
  if (!vs || !sh) { Logger.log('シートが見つかりません'); return 0; }
  var vd = vs.getDataRange().getValues();
  var VH = vd[0].map(function (x) { return String(x || '').trim(); });
  var iSid = VH.indexOf('sessionId');
  var H = sh.getDataRange().getValues()[0].map(function (x) { return String(x || '').trim(); });

  for (var r = vd.length - 1; r >= 1; r--) {
    if (String(vd[r][iSid]).trim() !== sessionId) continue;
    sh.appendRow(H.map(function (h) { var i = VH.indexOf(h); return i >= 0 ? vd[r][i] : ''; }));
    vs.deleteRow(r + 1);
    Logger.log('✓ PT_RESULTS へ戻しました: ' + sessionId);
    return 1;
  }
  Logger.log('退避シートに該当なし: ' + sessionId);
  return 0;
}
