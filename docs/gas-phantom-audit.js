/**
 * gas-phantom-audit.js — 「解いていないはずの履歴」（幽霊行）を全ユーザー分まとめて
 * 洗い出すための、読み取り専用の監査スクリプト。
 *
 * 背景（なぜ幽霊行ができるか）:
 *   ① reconcile（js/history-sync.js）が、ブラウザに残った tck_done_* の印を
 *      サーバに無ければ {"recovered":true} の行として書き戻す。
 *   ② Speaking 完了フック（js/speaking-recorder-hook.js）が、実際の録音が無くても
 *      {"recorded":true}（score 0）の「提出済み」行を書く。
 *   ③ 旧 reconcile が "CTW PN"（Set 番号なし）のゴミ行を書いたことがある。
 *
 * このスクリプトは ANSWERS シートを走査し、上記に該当する行を
 *   ・行番号（シート上の実際の行）
 *   ・ユーザー・set・理由
 * として Logger に出力するだけ。**削除は一切行わない**。
 *
 * 使い方（GAS エディタ）:
 *   1. このファイルの中身を GAS プロジェクトに貼り付けて保存。
 *   2. 関数 auditPhantomRows を実行 → 表示 > ログ で結果を確認。
 *   3. 返り値（2次元配列）をスプレッドシートに書き出したい場合は
 *      auditPhantomRowsToSheet を実行（"PHANTOM_AUDIT" シートに出力）。
 *
 * 実際に削除する場合は、必ず内容を確認した上で deletePhantomRows を使う
 *   （既定は dryRun=true。実削除は deletePhantomRows({dryRun:false})）。
 *   ※ 正答実績のある本物の行・実際の録音がある提出行には一切触れない設計。
 */

// ANSWERS 列（0-index）: 0 timestamp, 1 userId, 2 userName, 3 set, 4 answers,
//   5 score, 6 harderCorrect, 7 harderTotal, 8 attemptNumber, 9 total
// RECORDINGS 列: 0 timestamp, 1 userId, 2 userName, 3 task, 4 practice_set,
//   5 question_index, 6 duration_sec, 7 attempt_number, 8 file_id

// ANSWERS の set 名（"LR P5" 等）から practice 番号を取る（"P" 前提）
function _ph_practiceNum_(s) {
  var m = String(s || '').match(/p\s*0*(\d+)/i);
  return m ? Number(m[1]) : null;
}

// RECORDINGS の practice_set は素の数字（"5"）なので、"P" 無しでも拾う
function _ph_num_(s) {
  var m = String(s == null ? '' : s).match(/0*(\d+)/);
  return m ? Number(m[1]) : null;
}

/** RECORDINGS から「userId + task + practice」で実際の録音があるキーの集合を作る。 */
function _ph_recordedKeys_() {
  var set = {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['RECORDINGS', 'RECORDINGS_PT'].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var d = sh.getDataRange().getValues();
    for (var r = 1; r < d.length; r++) {
      var uid = String(d[r][1] || '').trim();
      var task = String(d[r][3] || '').trim().toLowerCase();
      var pnum = _ph_num_(d[r][4]);   // practice_set は "5" のような素の数字
      var fileId = String(d[r][8] || '').trim();
      if (!uid || !task || pnum === null) continue;
      // file_id があれば「本物の録音」。空でも行があれば提出はされたとみなす緩めの判定。
      set[uid + '|' + task + '|' + pnum] = fileId ? 'audio' : 'rowonly';
    }
  });
  return set;
}

/**
 * 幽霊行を分類して返す。削除はしない（読み取り専用）。
 * @return {Array<Object>} {row, ts, userId, userName, set, reason, severity}
 */
function _ph_collect_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('ANSWERS');
  if (!sh) throw new Error('ANSWERS シートが見つかりません');
  var d = sh.getDataRange().getValues();
  var recorded = _ph_recordedKeys_();
  var out = [];

  for (var r = 1; r < d.length; r++) {
    var row = d[r];
    var uid = String(row[1] || '').trim();
    var name = String(row[2] || '').trim();
    var setName = String(row[3] || '').trim();
    if (!setName) continue;
    var rawAns = row[4];

    var ans = null;
    try { ans = (typeof rawAns === 'string' && rawAns) ? JSON.parse(rawAns) : rawAns; } catch (e) { ans = rawAns; }
    var isObj = ans && typeof ans === 'object' && !Array.isArray(ans);

    var reason = null, severity = null;

    // ① reconcile が書いた復元行（解いた実体が無いのに履歴化されたもの）
    if (isObj && ans.recovered === true) {
      reason = 'reconcile 復元行（{"recovered":true}）— 解いた実体なし';
      severity = 'high';
    }
    // ② 録音フックの提出マーカー。実際の録音が無ければ幽霊。
    else if (isObj && ans.recorded === true) {
      var taskM = setName.match(/^(LR|TI)\b/i);
      var task = taskM ? taskM[1].toLowerCase() : '';
      var pnum = _ph_practiceNum_(setName);
      var key = uid + '|' + task + '|' + pnum;
      if (task && pnum !== null && !recorded[key]) {
        reason = '録音なしの提出マーカー（{"recorded":true}）— RECORDINGS に該当音声なし';
        severity = 'high';
      }
      // 録音があるものは本物の提出 → 対象外（フラグしない）
    }
    // ③ Set 番号なしの CTW ゴミ行
    else if (/^ctw\b/i.test(setName) && !/set\s*\d+/i.test(setName)) {
      reason = 'CTW の Set 番号なしゴミ行（旧 reconcile 由来）';
      severity = 'mid';
    }

    if (reason) {
      var ts = row[0];
      out.push({
        row: r + 1,                         // シート上の実際の行番号（1-based）
        ts: (ts instanceof Date) ? Utilities.formatDate(ts, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss') : String(ts || ''),
        userId: uid, userName: name, set: setName, reason: reason, severity: severity
      });
    }
  }
  return out;
}

/**
 * 診断用：RECORDINGS の中身と、マッチング状況を確認する（読み取り専用）。
 * 「録音なし」判定が正しいかを検証するために、削除の前に必ずこれを実行する。
 */
function auditRecordingsDebug() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var keys = _ph_recordedKeys_();
  var nKeys = Object.keys(keys).length;
  Logger.log('=== RECORDINGS 診断 ===');
  ['RECORDINGS', 'RECORDINGS_PT'].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { Logger.log(name + ': シートなし'); return; }
    var d = sh.getDataRange().getValues();
    Logger.log(name + ': ' + (d.length - 1) + ' 行');
    for (var r = 1; r < d.length && r <= 6; r++) {
      Logger.log('   sample row ' + (r + 1) + ' | userId=' + d[r][1] +
        ' | task=' + d[r][3] + ' | practice_set=' + d[r][4] +
        ' | file_id=' + (String(d[r][8] || '') ? 'あり' : 'なし'));
    }
  });
  Logger.log('マッチキー数（userId|task|practice）= ' + nKeys);

  // recorded:true の ANSWERS 行のうち、何件が録音とマッチするか
  var sh = ss.getSheetByName('ANSWERS');
  var d = sh.getDataRange().getValues();
  var matched = 0, unmatched = 0;
  for (var i = 1; i < d.length; i++) {
    var setName = String(d[i][3] || '').trim();
    var ans = null;
    try { ans = (typeof d[i][4] === 'string' && d[i][4]) ? JSON.parse(d[i][4]) : d[i][4]; } catch (e) {}
    if (!(ans && typeof ans === 'object' && ans.recorded === true)) continue;
    var tm = setName.match(/^(LR|TI)\b/i);
    var task = tm ? tm[1].toLowerCase() : '';
    var pnum = _ph_practiceNum_(setName);
    if (task && pnum !== null && keys[d[i][1] + '|' + task + '|' + pnum]) matched++; else unmatched++;
  }
  Logger.log('recorded:true の ANSWERS 行 → 録音あり ' + matched + ' 件 / 録音なし ' + unmatched + ' 件');
  Logger.log('※ 録音あり が 0 のままなら、まだマッチが取れていない（RECORDINGS の列を要確認）。');
  return { recordingKeys: nKeys, matched: matched, unmatched: unmatched };
}

/** ログに、ユーザーごとにまとめて出力する（読み取り専用）。 */
function auditPhantomRows() {
  var rows = _ph_collect_();
  if (!rows.length) { Logger.log('幽霊行は見つかりませんでした。'); return rows; }

  // userId でグルーピングして見やすく
  var byUser = {};
  rows.forEach(function (x) { (byUser[x.userId] = byUser[x.userId] || []).push(x); });

  Logger.log('=== 幽霊行 監査（読み取り専用・削除なし） 合計 ' + rows.length + ' 行 ===');
  Object.keys(byUser).sort().forEach(function (uid) {
    var list = byUser[uid];
    Logger.log('\n■ ' + uid + '（' + (list[0].userName || '') + '） — ' + list.length + ' 行');
    list.forEach(function (x) {
      Logger.log('   row ' + x.row + ' | ' + x.ts + ' | ' + x.set + ' | [' + x.severity + '] ' + x.reason);
    });
  });
  Logger.log('\n削除する場合は内容確認の上 deletePhantomRows({dryRun:false}) を実行。既定は dry run。');
  return rows;
}

/** 監査結果を "PHANTOM_AUDIT" シートに書き出す（こちらも削除はしない）。 */
function auditPhantomRowsToSheet() {
  var rows = _ph_collect_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('PHANTOM_AUDIT') || ss.insertSheet('PHANTOM_AUDIT');
  sh.clearContents();
  sh.appendRow(['ANSWERS行', '日時', 'userId', '氏名', 'set', '重要度', '理由']);
  rows.sort(function (a, b) { return a.userId.localeCompare(b.userId) || a.row - b.row; });
  rows.forEach(function (x) { sh.appendRow([x.row, x.ts, x.userId, x.userName, x.set, x.severity, x.reason]); });
  Logger.log('PHANTOM_AUDIT シートに ' + rows.length + ' 行を書き出しました。');
  return rows.length;
}

/**
 * 幽霊行を削除する。**既定は dryRun=true（実際には消さない）**。
 * 必ず auditPhantomRows で内容を確認し、オーナーの承認を得てから
 *   deletePhantomRows({dryRun:false}) を実行すること。
 * 下から消すので行番号がずれない。正答実績のある行・録音実体のある行は対象外。
 */
function deletePhantomRows(opts) {
  opts = opts || {};
  var DRY_RUN = opts.dryRun !== false;
  // 任意: 特定 userId だけに限定したい場合 opts.userId を渡す
  var onlyUser = opts.userId ? String(opts.userId) : null;
  // 任意: 重要度 'high' のみ消す等。既定は high+mid 全部。
  var minSeverity = opts.severity || null; // 'high' を渡すと high のみ

  var rows = _ph_collect_();
  if (onlyUser) rows = rows.filter(function (x) { return x.userId === onlyUser; });
  if (minSeverity === 'high') rows = rows.filter(function (x) { return x.severity === 'high'; });

  if (!rows.length) { Logger.log('対象の幽霊行はありません。'); return 'no rows'; }

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ANSWERS');
  // 行番号の大きい順に消す（小さい行を消すと下の行番号がずれるため）
  rows.sort(function (a, b) { return b.row - a.row; });

  var deleted = 0;
  rows.forEach(function (x) {
    if (DRY_RUN) {
      Logger.log('[would delete] row ' + x.row + ' | ' + x.userId + ' | ' + x.set + ' | ' + x.reason);
    } else {
      sh.deleteRow(x.row);
      deleted++;
    }
  });

  var msg = 'deletePhantomRows ' + (DRY_RUN ? '(DRY RUN) ' : '(LIVE) ') +
            '— 対象 ' + rows.length + ' 行' + (DRY_RUN ? '（未削除）' : '、削除 ' + deleted + ' 行');
  Logger.log(msg);
  if (DRY_RUN) Logger.log('↑ DRY RUN。実削除は deletePhantomRows({dryRun:false})');
  return msg;
}
