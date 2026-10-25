/**
 * gas-pt-results.js
 *
 * Practice Test (full-length mock) history endpoints — PT_RESULTS sheet.
 * The Practice Test front-end (practice-test/results.html +
 * practice-test/js/api.js) calls these two actions on the aggregate GAS
 * (REC_URL, the SAME deployment as the main app's API_URL). Results are
 * persisted server-side keyed by userId, so the "過去の模試結果" history
 * table works on any browser/device.
 *
 * ※ この写しは **デプロイ済み GAS の正本** です（CLAUDE.md の
 *   「docs/gas-*.js は実物と一致させる」ルール）。GAS 側を変更したら
 *   必ず同じコミットで本ファイルも更新すること。
 *
 * ----------------------------------------------------------------------
 * AUTH（重要・2026-07-25 監査 6-B で導入済み）
 *   listPtResults は staff、または「本人であることをパスワードで証明できた
 *   場合」のみ許可する。旧実装は完全に無認証で、
 *     - userId 無し → 全生徒の模試結果（氏名・全セクション素点・Band）を
 *       誰でも一括ダウンロードできた
 *     - userId 指定 → その userId を知っていれば他人の結果が読めた
 *   という状態だった。学習者側（practice-test/js/api.js）が id + pass を
 *   送るようになったため、本人確認を必須にできる。
 *   ※ 認証情報を送らない古いクライアントは弾かれる。必ずクライアントを
 *     先にデプロイしてから本ガードを有効化すること。
 *   savePtResult は録音アップロードと同じ fire-and-forget 設計のため
 *   userId のみ（書き込み専用・他人のデータは読めない）。
 *
 * DEPENDENCIES（同じ GAS プロジェクト内の他ファイルで定義）
 *   verifyStaff_(id, pass)    — @tckworkshop.co.jp / @tck-workshop.com のみ
 *   verifyAnyUser_(id, pass)  — USERS と USERS_TRIAL の両方を見る
 *   jsonpResponse_(callback, payload)
 *
 * SHEET: PT_RESULTS — A〜S の 19 列
 *   timestamp, userId, userName, session_id,
 *   reading_correct, reading_total, reading_scaled,
 *   listening_correct, listening_total, listening_scaled,
 *   writing_sent_correct, writing_sent_total, writing_scaled,
 *   speaking_lr, speaking_ti, total, band, reading_path, testId
 *   ※ speaking_lr / speaking_ti は 'yes' / 'no' の**文字列**で保存する。
 *     読み出し側は boolean / 'true' の旧行も受け付けて後方互換を保つ。
 *
 * PASTE FLOW (one-time):
 *   1. doGet() の if-chain に2行追加:
 *        if (action === 'savePtResult')  return handleSavePtResult_(e, callback);
 *        if (action === 'listPtResults') return handleListPtResults_(e, callback);
 *   2. 下の2関数を GAS ファイル末尾に貼る。
 *   3. Save → Deploy → Manage deployments → 鉛筆 → New version → Deploy.
 *      (URL 不変なのでフロント側の修正は不要)
 * ----------------------------------------------------------------------
 */

var PT_RESULTS_SHEET = 'PT_RESULTS';

function handleSavePtResult_(e, callback) {
  try {
    var p = e.parameter;
    var userId = String(p.userId || '');
    if (!userId) return jsonpResponse_(callback, { success: false, error: 'missing_user' });

    var sessionId = String(p.sessionId || '');
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PT_RESULTS_SHEET);
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(PT_RESULTS_SHEET);
      sheet.appendRow(['timestamp','userId','userName','session_id',
        'reading_correct','reading_total','reading_scaled',
        'listening_correct','listening_total','listening_scaled',
        'writing_sent_correct','writing_sent_total','writing_scaled',
        'speaking_lr','speaking_ti','total','band','reading_path','testId']);
    }
    var data = sheet.getDataRange().getValues();

    // ★ 同一 (userId, sessionId) は上書き（再受験・再読込で重複行を作らない）
    var targetRow = -1;
    if (sessionId) {
      for (var r = 1; r < data.length; r++) {
        if (String(data[r][1]) === userId && String(data[r][3]) === sessionId) { targetRow = r + 1; break; }
      }
    }

    var row = [
      (new Date()).toISOString(),
      userId,
      String(p.userName || ''),
      sessionId,
      Number(p.readingCorrect)   || 0,
      Number(p.readingTotal)     || 0,
      Number(p.readingScaled)    || 0,
      Number(p.listeningCorrect) || 0,
      Number(p.listeningTotal)   || 0,
      Number(p.listeningScaled)  || 0,
      Number(p.writingSentCorrect) || 0,
      Number(p.writingSentTotal)   || 0,
      Number(p.writingScaled)      || 0,
      String(p.speakingLr) === 'true' ? 'yes' : 'no',
      String(p.speakingTi) === 'true' ? 'yes' : 'no',
      Number(p.total) || 0,
      String(p.band || ''),
      String(p.readingPath || ''),
      String(p.testId || '')          // ★ どの模試か: '1' | '2' | '3'（旧行は空）
    ];

    if (targetRow > 0) {
      sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
    return jsonpResponse_(callback, { success: true });
  } catch (err) {
    return jsonpResponse_(callback, { success: false, error: String(err && err.message ? err.message : err) });
  }
}

function handleListPtResults_(e, callback) {
  try {
    var uid = String(e.parameter.userId || '');

    // ★ 6-B（2026-07-25 監査）: staff、または本人（id + pass 一致）のみ許可。
    //   詳細はファイル冒頭の AUTH 節を参照。
    var isStaff = !!verifyStaff_(e.parameter.id, e.parameter.pass);
    if (!isStaff) {
      var me = verifyAnyUser_(e.parameter.id, e.parameter.pass);
      if (!me || (uid && String(me.userId) !== uid)) {
        return jsonpResponse_(callback, { success: false, error: 'auth_failed' });
      }
      // uid が空でも自分に固定する。URL を書き換えても他人の行には到達できない。
      uid = String(me.userId);
    }

    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PT_RESULTS_SHEET);
    if (!sh) return jsonpResponse_(callback, { success: true, results: [] });
    var d = sh.getDataRange().getValues();
    var rows = [];
    for (var i = 1; i < d.length; i++) {
      if (uid && String(d[i][1]) !== uid) continue;
      rows.push({
        timestamp: d[i][0] ? new Date(d[i][0]).toISOString() : '',
        userId: String(d[i][1] || ''),
        userName: String(d[i][2] || ''),
        sessionId: String(d[i][3] || ''),
        readingCorrect: Number(d[i][4] || 0),
        readingTotal: Number(d[i][5] || 0),
        readingScaled: Number(d[i][6] || 0),
        listeningCorrect: Number(d[i][7] || 0),
        listeningTotal: Number(d[i][8] || 0),
        listeningScaled: Number(d[i][9] || 0),
        writingSentCorrect: Number(d[i][10] || 0),
        writingSentTotal: Number(d[i][11] || 0),
        writingScaled: Number(d[i][12] || 0),
        speakingLr: d[i][13] === 'yes' || d[i][13] === true || String(d[i][13]) === 'true',
        speakingTi: d[i][14] === 'yes' || d[i][14] === true || String(d[i][14]) === 'true',
        total: Number(d[i][15] || 0),
        band: String(d[i][16] || ''),
        readingPath: String(d[i][17] || ''),
        testId: String(d[i][18] || '')
      });
    }
    rows.sort(function(a,b){ return (b.timestamp || '').localeCompare(a.timestamp || ''); });
    return jsonpResponse_(callback, { success: true, results: rows });
  } catch (err) {
    return jsonpResponse_(callback, { success: false, error: String(err && err.message ? err.message : err) });
  }
}
