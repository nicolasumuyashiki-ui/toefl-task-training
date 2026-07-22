/**
 * docs/gas-pt-admin.js — Admin（staff 認証）で全生徒の Practice Test（模試）を見る
 *
 * これは「任意」の強化です。未デプロイでも Admin の「模試」タブは動きます
 * （client は staff 版が無ければ既存の listPtResults / getPtAnswers に自動フォールバック）。
 * デプロイすると、模試データの取得を @tckworkshop.co.jp の staff 認証必須にできます。
 *
 * ■ デプロイ手順:
 *   1. 本ファイルの2関数を GAS プロジェクト末尾に貼り付け。
 *   2. doGet() の dispatch に3行追加（既存 listX 群の近く）:
 *        if (action === 'adminListPtResults')    return handleAdminListPtResults_(e, callback);
 *        if (action === 'adminGetPtAnswers')     return handleAdminGetPtAnswers_(e, callback);
 *        if (action === 'adminListPtRecordings') return handleAdminListPtRecordings_(e, callback);
 *   3. デプロイ管理 → 既存デプロイを編集 → 新しいバージョン発行（API_URL は変えない）。
 *
 * ■ シート:
 *   PT_RESULTS: timestamp,userId,userName,session_id,reading_correct,reading_total,
 *     reading_scaled,listening_correct,listening_total,listening_scaled,
 *     writing_sent_correct,writing_sent_total,writing_scaled,speaking_lr,speaking_ti,
 *     total,band,reading_path,testId  (A-S)
 *   PT_ANSWERS: timestamp,userId,userName,sessionId,answersJson  (A-E)
 */

// 全生徒の PT_RESULTS を返す（staff 認証必須）。列は client の期待に合わせて camelCase 化。
function handleAdminListPtResults_(e, callback) {
  if (!verifyStaff_(e.parameter.id, e.parameter.pass)) {
    return jsonpResponse_(callback, { success: false, error: 'auth_failed' });
  }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PT_RESULTS');
  if (!sh) return jsonpResponse_(callback, { success: true, results: [] });
  var d = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < d.length; i++) {
    if (!d[i][3]) continue; // no session_id → skip
    out.push({
      timestamp: d[i][0] ? new Date(d[i][0]).toISOString() : '',
      userId: String(d[i][1] || ''),
      userName: String(d[i][2] || ''),
      sessionId: String(d[i][3] || ''),
      readingCorrect: Number(d[i][4] || 0), readingTotal: Number(d[i][5] || 0), readingScaled: Number(d[i][6] || 0),
      listeningCorrect: Number(d[i][7] || 0), listeningTotal: Number(d[i][8] || 0), listeningScaled: Number(d[i][9] || 0),
      writingSentCorrect: Number(d[i][10] || 0), writingSentTotal: Number(d[i][11] || 0), writingScaled: Number(d[i][12] || 0),
      speakingLr: String(d[i][13]) === 'yes' || d[i][13] === true || String(d[i][13]) === 'true',
      speakingTi: String(d[i][14]) === 'yes' || d[i][14] === true || String(d[i][14]) === 'true',
      total: Number(d[i][15] || 0), band: String(d[i][16] || ''),
      readingPath: String(d[i][17] || ''), testId: String(d[i][18] || '')
    });
  }
  out.sort(function (a, b) { return (b.timestamp || '').localeCompare(a.timestamp || ''); });
  return jsonpResponse_(callback, { success: true, results: out });
}

// 指定 sessionId（任意ユーザー）の回答スナップショットを返す（staff 認証必須）。
function handleAdminGetPtAnswers_(e, callback) {
  if (!verifyStaff_(e.parameter.id, e.parameter.pass)) {
    return jsonpResponse_(callback, { success: false, error: 'auth_failed' });
  }
  var sid = String(e.parameter.sessionId || '');
  var uid = String(e.parameter.userId || '');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PT_ANSWERS');
  if (!sh) return jsonpResponse_(callback, { success: true, answersJson: '' });
  var d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    var rowSid = String(d[i][3] || '');
    var rowUid = String(d[i][1] || '');
    if (sid ? (rowSid === sid) : (uid && rowUid === uid)) {
      return jsonpResponse_(callback, {
        success: true,
        userId: rowUid, userName: String(d[i][2] || ''), sessionId: rowSid,
        answersJson: String(d[i][4] || '')
      });
    }
  }
  return jsonpResponse_(callback, { success: true, answersJson: '' });
}

// 指定ユーザーの Practice Test スピーキング録音（RECORDINGS_PT）を返す（staff 認証必須）。
// RECORDINGS_PT columns: 0 ts,1 userId,2 name,3 task,4 practice_set,5 q_index,6 dur,7 attempt,8 file_id,9 file_url,10 mime,11 source
function handleAdminListPtRecordings_(e, callback) {
  if (!verifyStaff_(e.parameter.id, e.parameter.pass)) {
    return jsonpResponse_(callback, { success: false, error: 'auth_failed' });
  }
  var uid = String(e.parameter.userId || '');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('RECORDINGS_PT');
  if (!sh) return jsonpResponse_(callback, { success: true, recordings: [] });
  var d = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < d.length; i++) {
    if (uid && String(d[i][1]) !== uid) continue;
    out.push({
      timestamp: d[i][0] ? new Date(d[i][0]).toISOString() : '',
      userId: String(d[i][1] || ''), userName: String(d[i][2] || ''),
      task: String(d[i][3] || ''), practiceSet: String(d[i][4] || ''),
      questionIndex: Number(d[i][5] || 0), durationSec: Number(d[i][6] || 0),
      fileId: String(d[i][8] || ''), fileUrl: String(d[i][9] || '')
    });
  }
  out.sort(function (a, b) { return (a.timestamp || '').localeCompare(b.timestamp || ''); });
  return jsonpResponse_(callback, { success: true, recordings: out });
}
