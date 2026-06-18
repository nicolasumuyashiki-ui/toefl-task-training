/**
 * docs/gas-trial-listing.js
 *
 * 本番 Apps Script (TCK Reps Database に紐づくスクリプト) に追加するコード。
 * admin タブ「デモ版 回答一覧」が呼ぶ 2 つのエンドポイントを実装する。
 *
 * Speaking 録音は無料体験では未提供のため、recordings 系は対象外。
 * （USERS_TRIAL の userId は `trial-{base36}` の prefix を持つので、ANSWERS
 * シートから prefix だけで体験生の attempt を絞り込める。）
 *
 * ─────────────────────────────────────────────────────────────────
 * デプロイ手順:
 *   1. 本ファイルの2関数を GAS プロジェクトの末尾に追記。
 *   2. doGet() の dispatch に下記 2 行を追加（順序は任意・既存 listX 群の近く推奨）:
 *        if (action === 'listTrialUsers')     return handleListTrialUsers_(e, callback);
 *        if (action === 'listTrialAttempts')  return handleListTrialAttempts_(e, callback);
 *   3. 「デプロイを管理」→ 既存デプロイを編集 → 「新しいバージョン」を発行。
 *      api.js の API_URL を変えないこと（既存デプロイの新バージョンを上書き）。
 *   4. admin → 「デモ版 回答一覧」タブを開いて動作確認。
 * ─────────────────────────────────────────────────────────────────
 */

function handleListTrialUsers_(e, callback) {
  if (!verifyStaff_(e.parameter.id, e.parameter.pass)) {
    return jsonpResponse_(callback, { success: false, error: 'auth_failed' });
  }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('USERS_TRIAL');
  if (!sh) return jsonpResponse_(callback, { success: true, users: [] });
  var d = sh.getDataRange().getValues();
  // USERS_TRIAL columns (A-G):
  //   id, pass, name, email, created_at, last_login_at, pass_temp_at
  var users = [];
  for (var i = 1; i < d.length; i++) {
    if (!d[i][0]) continue;
    users.push({
      userId:      String(d[i][0]),
      userName:    String(d[i][2] || ''),
      email:       String(d[i][3] || ''),
      createdAt:   d[i][4] ? new Date(d[i][4]).toISOString() : '',
      lastLoginAt: d[i][5] ? new Date(d[i][5]).toISOString() : '',
      passTempAt:  d[i][6] ? new Date(d[i][6]).toISOString() : ''
    });
  }
  return jsonpResponse_(callback, { success: true, users: users });
}

function handleListTrialAttempts_(e, callback) {
  if (!verifyStaff_(e.parameter.id, e.parameter.pass)) {
    return jsonpResponse_(callback, { success: false, error: 'auth_failed' });
  }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ANSWERS');
  if (!sh) return jsonpResponse_(callback, { success: true, attempts: [] });
  var d = sh.getDataRange().getValues();
  // ANSWERS columns (A-I): timestamp, userId, userName, set, answers, score,
  //                        harder_correct, harder_total, attempt_number
  var rows = [];
  for (var i = 1; i < d.length; i++) {
    var uid = String(d[i][1] || '');
    // Trial userIds are minted as 'trial-' + ts.toString(36) in handleSignupTrial_.
    if (uid.indexOf('trial-') !== 0) continue;
    rows.push({
      timestamp:     d[i][0] ? new Date(d[i][0]).toISOString() : '',
      userId:        uid,
      userName:      String(d[i][2] || ''),
      set:           String(d[i][3] || ''),
      answers:       String(d[i][4] || ''),
      score:         String(d[i][5] || ''),
      harderCorrect: Number(d[i][6] || 0),
      harderTotal:   Number(d[i][7] || 0),
      attemptNumber: Number(d[i][8] || 1)
    });
  }
  return jsonpResponse_(callback, { success: true, attempts: rows });
}
