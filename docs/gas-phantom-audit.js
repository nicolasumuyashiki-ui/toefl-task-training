/**
 * gas-phantom-audit.js — 幽霊行の監査 + 録音カバレッジ + Drive 実ファイル確認（全部入り・読み取り専用）
 *
 * ■ 実行する関数（GAS の関数ドロップダウンで選んで ▶）:
 *   auditPhantomRows()         … 解いていない幽霊行をユーザー別に一覧（削除しない）
 *   auditPhantomRowsToSheet()  … 同上を "PHANTOM_AUDIT" シートに書き出し（削除しない）
 *   auditRecordingsCoverage()  … 録音の file_id 有無をユーザー別に集計（◆客 / ・内部）
 *   auditDriveCustomers()      … 全お客さんの録音 Drive 実ファイルが開ける/共有されてるか（引数不要）
 *   auditDriveFiles('userId')  … 特定ユーザーだけ Drive 確認（run系ラッパー経由で実行）
 *   deletePhantomRows({dryRun:false}) … 【承認後のみ】幽霊行を削除（既定 dryRun=true で消さない）
 *
 * ■ シート列:
 *   ANSWERS:    0 ts,1 userId,2 name,3 set,4 answers,5 score,6 harderCorrect,7 harderTotal,8 attemptNumber,9 total
 *   RECORDINGS: 0 ts,1 userId,2 name,3 task,4 practice_set,5 q_index,6 dur,7 attempt,8 file_id
 */

// ===== 内部（モニター/管理者/テスト）アカウント。お客さん集計から除外 =====
// 一覧は docs/internal-accounts.md と同期すること。
var INTERNAL_IDS = ('Nico,marisando,Nico1,andomarisa,mayu,yuna.kitamura,Momotaro,h.sakai,'
  + 'satoshi.okadome,hananotck,tmashimo,saosao,monitor-kadowaki,monitor-murakami,'
  + 'monitor-kusunoki,monitor-sato,burton,monitor-nanase,testuser,user01,allZero')
  .split(',').reduce(function (o, x) { o[x.trim()] = 1; return o; }, {});

function _isInternal_(uid) { return !!INTERNAL_IDS[String(uid || '').trim()]; }

// ANSWERS の set 名（"LR P5"）から practice 番号（"P" 前提）
function _ph_practiceNum_(s) {
  var m = String(s || '').match(/p\s*0*(\d+)/i);
  return m ? Number(m[1]) : null;
}
// RECORDINGS の practice_set は素の数字（"5"）。"P" 無しでも拾う
function _ph_num_(s) {
  var m = String(s == null ? '' : s).match(/0*(\d+)/);
  return m ? Number(m[1]) : null;
}

// RECORDINGS から「userId|task|practice」の集合（実音声があるか）を作る
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
      var pnum = _ph_num_(d[r][4]);
      var fileId = String(d[r][8] || '').trim();
      if (!uid || !task || pnum === null) continue;
      set[uid + '|' + task + '|' + pnum] = fileId ? 'audio' : 'rowonly';
    }
  });
  return set;
}

// 幽霊行を分類して返す（読み取り専用）
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

    var ans = null;
    try { ans = (typeof row[4] === 'string' && row[4]) ? JSON.parse(row[4]) : row[4]; } catch (e) { ans = row[4]; }
    var isObj = ans && typeof ans === 'object' && !Array.isArray(ans);

    var reason = null, severity = null;

    if (isObj && ans.recovered === true) {
      reason = 'reconcile 復元行（{"recovered":true}）— 解いた実体なし';
      severity = 'high';
    } else if (isObj && ans.recorded === true) {
      var tm = setName.match(/^(LR|TI)\b/i);
      var task = tm ? tm[1].toLowerCase() : '';
      var pnum = _ph_practiceNum_(setName);
      var key = uid + '|' + task + '|' + pnum;
      if (task && pnum !== null && !recorded[key]) {
        reason = '録音なしの提出マーカー（{"recorded":true}）— RECORDINGS に該当音声なし';
        severity = 'high';
      }
    } else if (/^ctw\b/i.test(setName) && !/set\s*\d+/i.test(setName)) {
      reason = 'CTW の Set 番号なしゴミ行（旧 reconcile 由来）';
      severity = 'mid';
    }

    if (reason) {
      var ts = row[0];
      out.push({
        row: r + 1,
        ts: (ts instanceof Date) ? Utilities.formatDate(ts, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss') : String(ts || ''),
        userId: uid, userName: name, set: setName, reason: reason, severity: severity
      });
    }
  }
  return out;
}

// ★ 幽霊行をユーザー別に一覧（読み取り専用・削除なし）
function auditPhantomRows() {
  var rows = _ph_collect_();
  if (!rows.length) { Logger.log('幽霊行は見つかりませんでした。'); return rows; }
  var byUser = {};
  rows.forEach(function (x) { (byUser[x.userId] = byUser[x.userId] || []).push(x); });
  Logger.log('=== 幽霊行 監査（読み取り専用・削除なし） 合計 ' + rows.length + ' 行 ===');
  Object.keys(byUser).sort().forEach(function (uid) {
    var list = byUser[uid];
    Logger.log('\n■ ' + (_isInternal_(uid) ? '[内部] ' : '') + uid + '（' + (list[0].userName || '') + '） — ' + list.length + ' 行');
    list.forEach(function (x) {
      Logger.log('   row ' + x.row + ' | ' + x.ts + ' | ' + x.set + ' | [' + x.severity + '] ' + x.reason);
    });
  });
  Logger.log('\n削除する場合は内容確認の上 deletePhantomRows({dryRun:false}) を実行。既定は dry run。');
  return rows;
}

// 監査結果を "PHANTOM_AUDIT" シートに書き出す（こちらも削除はしない）
function auditPhantomRowsToSheet() {
  var rows = _ph_collect_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('PHANTOM_AUDIT') || ss.insertSheet('PHANTOM_AUDIT');
  sh.clearContents();
  sh.appendRow(['ANSWERS行', '日時', 'userId', '氏名', 'set', '重要度', '理由', '内部?']);
  rows.sort(function (a, b) { return a.userId.localeCompare(b.userId) || a.row - b.row; });
  rows.forEach(function (x) { sh.appendRow([x.row, x.ts, x.userId, x.userName, x.set, x.severity, x.reason, _isInternal_(x.userId) ? '内部' : '']); });
  Logger.log('PHANTOM_AUDIT シートに ' + rows.length + ' 行を書き出しました。');
  return rows.length;
}

// ★ 録音の file_id 有無をユーザー別に集計（◆客 / ・内部）
function auditRecordingsCoverage() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var agg = {};
  ['RECORDINGS', 'RECORDINGS_PT'].forEach(function (name) {
    var sh = ss.getSheetByName(name); if (!sh) return;
    var d = sh.getDataRange().getValues();
    for (var r = 1; r < d.length; r++) {
      var uid = String(d[r][1] || '').trim();
      if (!uid) continue;
      var hasFile = !!String(d[r][8] || '').trim();
      var a = agg[uid] || (agg[uid] = { rows: 0, withFile: 0 });
      a.rows++; if (hasFile) a.withFile++;
    }
  });
  var custRows = 0, custFile = 0, intFile = 0;
  Logger.log('=== 録音カバレッジ（◆=お客さん / ・=内部）===');
  Object.keys(agg).sort().forEach(function (uid) {
    var a = agg[uid], isInt = _isInternal_(uid);
    if (isInt) intFile += a.withFile; else { custRows += a.rows; custFile += a.withFile; }
    Logger.log('   ' + (isInt ? '・' : '◆') + ' ' + uid + ' : ' + a.rows + ' 行 / ファイルあり ' + a.withFile);
  });
  Logger.log('--------');
  Logger.log('◆お客さん合計: ' + custRows + ' 行 / 実ファイルあり ' + custFile + ' 行');
  Logger.log('・内部合計: 実ファイルあり ' + intFile + ' 行');
  return agg;
}

// 指定ユーザーの録音 file_id が Drive で開ける／共有されているか（読み取り専用）
function auditDriveFiles(userId) {
  userId = String(userId);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ok = 0, priv = 0, gone = 0, total = 0;
  Logger.log('=== ' + userId + ' の Drive 実ファイル確認 ===');
  ['RECORDINGS', 'RECORDINGS_PT'].forEach(function (name) {
    var sh = ss.getSheetByName(name); if (!sh) return;
    var d = sh.getDataRange().getValues();
    for (var r = 1; r < d.length; r++) {
      if (String(d[r][1]).trim() !== userId) continue;
      var fileId = String(d[r][8] || '').trim();
      if (!fileId) continue;
      total++;
      try {
        var f = DriveApp.getFileById(fileId);
        var acc = f.getSharingAccess();
        var shared = (acc === DriveApp.Access.ANYONE_WITH_LINK || acc === DriveApp.Access.ANYONE);
        if (shared) ok++; else priv++;
        if (total <= 6) Logger.log('   ' + name + ' row ' + (r + 1) + ' | ' + d[r][3] + ' P' + d[r][4] +
          ' | ' + (shared ? '✓公開' : '△非公開(要再共有)') + ' | ' + f.getName());
      } catch (e) {
        gone++;
        if (gone <= 6) Logger.log('   ' + name + ' row ' + (r + 1) + ' | ' + d[r][3] + ' P' + d[r][4] +
          ' | ✗消失/不可 | ' + fileId);
      }
    }
  });
  Logger.log('--------');
  Logger.log(userId + ': 合計 ' + total + ' / ✓公開 ' + ok + ' / △非公開 ' + priv + ' / ✗消失 ' + gone);
  return { total: total, ok: ok, priv: priv, gone: gone };
}

// ★ 全お客さんの Drive 実ファイルをまとめて確認（引数不要・読み取り専用）
function auditDriveCustomers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var users = {};
  ['RECORDINGS', 'RECORDINGS_PT'].forEach(function (name) {
    var sh = ss.getSheetByName(name); if (!sh) return;
    var d = sh.getDataRange().getValues();
    for (var r = 1; r < d.length; r++) {
      var uid = String(d[r][1] || '').trim();
      if (uid && !_isInternal_(uid)) users[uid] = 1;
    }
  });
  var tot = 0, ok = 0, priv = 0, gone = 0;
  Logger.log('=== 全お客さんの Drive 実ファイル確認 ===');
  Object.keys(users).sort().forEach(function (uid) {
    var r = auditDriveFiles(uid);
    tot += r.total; ok += r.ok; priv += r.priv; gone += r.gone;
  });
  Logger.log('========');
  Logger.log('◆お客さん総計: ' + tot + ' / ✓公開 ' + ok + ' / △非公開 ' + priv + ' / ✗消失 ' + gone);
  if (priv > 0) Logger.log('→ △非公開がある場合: reshareAllRecordings({dryRun:false}) で一括再共有できます（音声は消えていない）。');
  if (gone > 0) Logger.log('→ ✗消失がある場合: その file_id は Drive 上で削除済み。別途相談。');
  return { total: tot, ok: ok, priv: priv, gone: gone };
}

// 個別ユーザーを調べたいときは、GAS エディタの実行ログから
//   auditDriveFiles('<userId>')
// を直接呼ぶこと（読み取り専用）。
// 以前ここに顧客ごとの呼び出しラッパーを置いていたが、userId や
// メールアドレスがコードに残り、public な docs/ 経由で公開されて
// しまうため撤去した（2026-08-07 監査で是正）。

/**
 * 【削除用・承認後のみ】既定は dryRun=true（消さない）。
 * 実削除: deletePhantomRows({dryRun:false})
 * オプション: {userId:'...'} 特定ユーザーのみ / {severity:'high'} high のみ
 * 下から消すので行番号がずれない。正答実績・録音実体のある行は対象外。
 */
function deletePhantomRows(opts) {
  opts = opts || {};
  var DRY_RUN = opts.dryRun !== false;
  var onlyUser = opts.userId ? String(opts.userId) : null;
  var minSeverity = opts.severity || null;

  var rows = _ph_collect_();
  if (onlyUser) rows = rows.filter(function (x) { return x.userId === onlyUser; });
  if (minSeverity === 'high') rows = rows.filter(function (x) { return x.severity === 'high'; });
  if (!rows.length) { Logger.log('対象の幽霊行はありません。'); return 'no rows'; }

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ANSWERS');
  rows.sort(function (a, b) { return b.row - a.row; });
  var deleted = 0;
  rows.forEach(function (x) {
    if (DRY_RUN) Logger.log('[would delete] row ' + x.row + ' | ' + x.userId + ' | ' + x.set + ' | ' + x.reason);
    else { sh.deleteRow(x.row); deleted++; }
  });
  var msg = 'deletePhantomRows ' + (DRY_RUN ? '(DRY RUN) ' : '(LIVE) ') +
            '— 対象 ' + rows.length + ' 行' + (DRY_RUN ? '（未削除）' : '、削除 ' + deleted + ' 行');
  Logger.log(msg);
  if (DRY_RUN) Logger.log('↑ DRY RUN。実削除は deletePhantomRows({dryRun:false})');
  return msg;
}

/**
 * reconcile が押し込んだ自動採点スコアの「混入の疑い」を全顧客一括で炙り出す（読み取り専用）。
 * 前提：オーナーは顧客アカウントで問題を解いていない → これらは本物の取り組みではない。
 * 3つの手がかり: ①答え全0なのに得点>0 ②別アカウントと完全同一の解答 ③数秒内に複数別課題が同時保存。
 * 「疑い」を出すだけ。削除は内容確認後に deletePhantomRows 等で個別に。
 */
function auditReconcileContamination() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ANSWERS');
  var d = sh.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < d.length; i++) {
    var uid = String(d[i][1] || '').trim();
    if (!uid || _isInternal_(uid)) continue;
    var set = String(d[i][3] || '').trim();
    if (!/^(RDL|Academic|LCR|Conversation|Announcement|Academic Talk|Talk|Build a Sentence|Sentence)/i.test(set)) continue; // 自動採点のみ
    var raw = d[i][4], ans = null;
    try { ans = (typeof raw === 'string' && raw) ? JSON.parse(raw) : raw; } catch (e) {}
    var t = (d[i][0] instanceof Date) ? d[i][0].getTime() : Date.parse(d[i][0]);
    rows.push({ row: i + 1, uid: uid, name: String(d[i][2] || ''), set: set, ans: ans,
      ansStr: (typeof raw === 'string' ? raw : JSON.stringify(raw)), score: Number(d[i][5]) || 0, t: t });
  }
  var flags = {};
  function flag(r, why) { (flags[r.row] = flags[r.row] || { r: r, why: [] }).why.push(why); }

  // ① 答え全0なのに得点>0
  rows.forEach(function (r) {
    if (Array.isArray(r.ans) && r.ans.length &&
        r.ans.every(function (x) { return x === 0 || x === '0' || x === '' || x == null; }) && r.score > 0)
      flag(r, '答え全0なのに得点>0');
  });
  // ② 別アカウントと完全同一の解答配列
  var byAns = {};
  rows.forEach(function (r) {
    if (Array.isArray(r.ans) && r.ans.length >= 2) {
      var k = r.set.replace(/\s*P\d+.*/, '') + '|' + r.ansStr;
      (byAns[k] = byAns[k] || []).push(r);
    }
  });
  Object.keys(byAns).forEach(function (k) {
    var L = byAns[k], u = {}; L.forEach(function (r) { u[r.uid] = 1; });
    if (Object.keys(u).length >= 2) L.forEach(function (r) { flag(r, '別アカウントと完全同一の解答'); });
  });
  // ③ 数秒以内に複数の別課題が同時保存
  var byU = {};
  rows.forEach(function (r) { if (!isNaN(r.t)) (byU[r.uid] = byU[r.uid] || []).push(r); });
  Object.keys(byU).forEach(function (uid) {
    var a = byU[uid].sort(function (x, y) { return x.t - y.t; });
    for (var i = 0; i < a.length; i++) {
      var b = [a[i]];
      for (var j = i + 1; j < a.length && a[j].t - a[i].t <= 6000; j++) b.push(a[j]);
      var s = {}; b.forEach(function (x) { s[x.set] = 1; });
      if (b.length >= 2 && Object.keys(s).length >= 2) b.forEach(function (x) { flag(x, '数秒内に複数別課題が同時保存'); });
    }
  });

  var out = {}, total = 0;
  Object.keys(flags).forEach(function (rw) { var f = flags[rw]; (out[f.r.uid] = out[f.r.uid] || []).push(f); total++; });
  Logger.log('=== reconcile 混入の疑い（読み取り専用・削除なし） 合計 ' + total + ' 行 ===');
  Object.keys(out).sort().forEach(function (uid) {
    Logger.log('\n■ ' + uid + '（' + (out[uid][0].r.name || '') + '） ' + out[uid].length + ' 行');
    out[uid].forEach(function (f) { Logger.log('   行' + f.r.row + ' | ' + f.r.set + ' | score:' + f.r.score + ' | ' + f.why.join(' / ')); });
  });
  Logger.log('\n※ あくまで「疑い」。削除前に必ず内容確認。');
  return total;
}
