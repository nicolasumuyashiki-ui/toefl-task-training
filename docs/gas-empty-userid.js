/**
 * gas-empty-userid.js — 「userId 空欄行」の 2 点セット
 *   (A) サーバー側ガード … 今後 userId 空で来た saveAnswers を「捨てず」体験用フォールバック
 *       userId を付けて保存する（orphan 化を止め、admin「デモ版 回答一覧」タブに出す）
 *   (B) 監査 … 既に出てしまった空欄行を一覧化（読み取り専用・削除も再割当もしない）
 *
 * ■ 実データで判明した正体（2026-07-19 調査）:
 *   ANSWERS 914 行中 39 行が userId・name 空欄。**全て Practice 1**（Email P1 / Discussion P1 /
 *   CTW P1）で、期間は 2026-05-25〜現在。中身は本物（実在の見込み客が書いた英作文・CTW 解答）。
 *   → これらは **無料体験版アプリ（LP「無料体験版を試す」の遷移先＝ apps.tckworkshop.co.jp/
 *   toefl-reps-demo/。本番 toefl-task-training とは別リポジトリ/別デプロイ）** の Practice 1 の
 *   取り組み。体験は各タスク P1 だけ開放しているので全部 P1 になる。
 *
 *   設計上は体験ユーザーに `trial-{base36}` の userId を採番（GAS handleSignupTrial_）して
 *   ANSWERS に保存し、admin「デモ版 回答一覧」タブが `trial-` prefix で拾う想定。ところが実際に
 *   `trial-` の付いた ANSWERS 行は 1 行だけ（しかもオーナーの SAT テスト）。**体験アプリの保存が
 *   userId を付けずに ANSWERS へ書いている**ため 39 件が空欄 orphan 行になり、demo タブにも
 *   出てこない（＝誰が何を体験で試したかが admin から見えない）。
 *
 *   ※ 本番 toefl-task-training のログイン済み保存とは別空間なので、有料会員の履歴は壊れていない。
 *   ※ 根治は体験アプリ（toefl-reps-demo）側で trial userId を付けること。本ガードはバックエンド
 *     側の最終防波堤：どのクライアントから来ても orphan にせず、体験データを失わず可視化する。
 *
 * ■ シート列（ANSWERS）:
 *   0 ts, 1 userId, 2 name, 3 set, 4 answers, 5 score, 6 harderCorrect, 7 harderTotal, 8 attemptNumber, 9 total
 *
 * ────────────────────────────────────────────────────────────────────────────
 * (A) サーバー側ガードの入れ方（1 行）
 * ────────────────────────────────────────────────────────────────────────────
 *   saveAnswers を処理しているハンドラ（handleSaveAnswers_ / doPost 内の該当ブロック）で、
 *   userId を「取り出した直後・シートに書く前」に次の 1 行を足すだけ：
 *
 *       userId = normalizeSaveUserId_(userId);
 *
 *   ※ これで userId 空なら 'trial-anon' に置換されてから保存される（既定・データを失わない）。
 *     以降その行は admin「デモ版 回答一覧」タブに出る（trial- prefix なので拾える）。
 *     name も空なら '（無料体験）' を補う。既存の 39 行には一切触れない（今後の保存のみ）。
 *
 *   ※ もし「体験の取り組みは記録せず弾きたい」場合は、代わりに次の 1 行にする（非推奨・データ消失）:
 *       if (isEmptyUserId_(userId)) return emptyUserIdResponse_(e);
 */

// userId が実質空（未定義／空白のみ）かどうか
function isEmptyUserId_(userId) {
  return !String(userId == null ? '' : userId).trim();
}

// 【推奨】空 userId を体験用フォールバックへ正規化（捨てずに保存し、demo タブに出す）。
// 返り値をそのまま「シートに書く userId」として使う。trial- prefix なので listTrialAttempts が拾う。
function normalizeSaveUserId_(userId) {
  return isEmptyUserId_(userId) ? 'trial-anon' : String(userId).trim();
}
// name 用の同様のフォールバック（空なら「（無料体験）」を返す）。任意。
function normalizeSaveUserName_(userId, userName) {
  if (String(userName == null ? '' : userName).trim()) return userName;
  return isEmptyUserId_(userId) ? '（無料体験）' : userName;
}

// 【非推奨・代替】空 userId を弾く応答（体験の取り組みは記録されなくなる）。
// 既存に jsonpResponse_(callback, obj) がある前提。無い場合は ContentService 版フォールバック。
function emptyUserIdResponse_(e) {
  var payload = { success: false, error: 'empty_userId', skipped: true,
    message: 'saveAnswers rejected: userId was empty. Row NOT written.' };
  var cb = (e && e.parameter && (e.parameter.callback || e.parameter.cb)) || '';
  try { if (typeof jsonpResponse_ === 'function') return jsonpResponse_(cb, payload); } catch (err) {}
  var body = JSON.stringify(payload);
  if (cb) return ContentService.createTextOutput(cb + '(' + body + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/* ────────────────────────────────────────────────────────────────────────────
 * (B) 既存の「userId 空欄行」を一覧化（読み取り専用・削除も再割当もしない）
 *   実行する関数（GAS の関数ドロップダウンで選んで ▶）:
 *     auditEmptyUserIdRows()        … ログに一覧＋各行の「時間的に近い実ユーザー」候補を表示
 *     auditEmptyUserIdRowsToSheet() … 同上を "EMPTY_USERID_AUDIT" シートへ書き出し
 * ──────────────────────────────────────────────────────────────────────────── */

// 近接候補を探す時間窓（分）。空欄行の前後この範囲で userId のある行を「同一人物候補」として拾う。
var EMPTY_UID_WINDOW_MIN = 15;

function _eu_rowTime_(v) {
  if (v instanceof Date) return v.getTime();
  var t = Date.parse(v); return isNaN(t) ? null : t;
}
function _eu_fmt_(v) {
  return (v instanceof Date)
    ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')
    : String(v || '');
}
// answers が「実際に解いた中身」か（空配列・空文字・null は中身なし扱い）
function _eu_hasContent_(raw) {
  var a = raw;
  try { if (typeof raw === 'string' && raw) a = JSON.parse(raw); } catch (e) { a = raw; }
  if (Array.isArray(a)) return a.some(function (x) { return x !== '' && x !== null && x !== undefined; });
  if (a && typeof a === 'object') return Object.keys(a).length > 0;
  return !!String(raw == null ? '' : raw).trim();
}

function _eu_collect_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ANSWERS');
  if (!sh) throw new Error('ANSWERS シートが見つかりません');
  var d = sh.getDataRange().getValues();

  // まず「userId のある行」を時刻付きで集める（近接候補の探索用）
  var attributed = [];
  for (var r = 1; r < d.length; r++) {
    var uid = String(d[r][1] || '').trim();
    if (!uid) continue;
    var t = _eu_rowTime_(d[r][0]);
    if (t !== null) attributed.push({ t: t, uid: uid, name: String(d[r][2] || '').trim() });
  }
  attributed.sort(function (a, b) { return a.t - b.t; });

  var out = [];
  for (var r2 = 1; r2 < d.length; r2++) {
    var row = d[r2];
    var uid2 = String(row[1] || '').trim();
    var setName = String(row[3] || '').trim();
    if (uid2 || !setName) continue;   // userId があるか、set が無ければ対象外

    var t2 = _eu_rowTime_(row[0]);
    // 時間的に最も近い実ユーザーを候補に（同一時間窓内）
    var best = null, bestDelta = null;
    if (t2 !== null) {
      var win = EMPTY_UID_WINDOW_MIN * 60 * 1000;
      for (var k = 0; k < attributed.length; k++) {
        var delta = Math.abs(attributed[k].t - t2);
        if (delta <= win && (bestDelta === null || delta < bestDelta)) { bestDelta = delta; best = attributed[k]; }
      }
    }
    out.push({
      row: r2 + 1,
      ts: _eu_fmt_(row[0]),
      set: setName,
      hasContent: _eu_hasContent_(row[4]),
      score: (row[5] === '' || row[5] == null) ? '' : row[5],
      total: (row[9] === '' || row[9] == null) ? '' : row[9],
      candidateUid: best ? best.uid : '',
      candidateName: best ? best.name : '',
      candidateDeltaMin: bestDelta === null ? '' : Math.round(bestDelta / 60000 * 10) / 10
    });
  }
  return out;
}

function auditEmptyUserIdRows() {
  var rows = _eu_collect_();
  if (!rows.length) { Logger.log('userId 空欄行は見つかりませんでした。'); return rows; }
  Logger.log('=== userId 空欄行 監査（読み取り専用・削除なし） 合計 ' + rows.length + ' 行 ===');
  Logger.log('（candidate = 時間的に ±' + EMPTY_UID_WINDOW_MIN + '分 で最も近い実ユーザー。あくまで「目星」で確定ではない）');
  var real = 0;
  rows.forEach(function (x) {
    if (x.hasContent) real++;
    Logger.log(
      'row ' + x.row + ' | ' + x.ts + ' | ' + x.set +
      ' | 中身:' + (x.hasContent ? 'あり(本物の取り組み)' : 'なし') +
      ' | score:' + x.score + '/' + x.total +
      ' | 候補: ' + (x.candidateUid ? (x.candidateUid + '（' + x.candidateName + '）+' + x.candidateDeltaMin + '分') : '—'));
  });
  Logger.log('--------');
  Logger.log('うち「中身あり＝本物の取り組みが誰にも紐づいていない」行: ' + real + ' 件');
  Logger.log('※ 削除・再割当はこの関数では行いません。方針が決まってから別途対応してください。');
  return rows;
}

function auditEmptyUserIdRowsToSheet() {
  var rows = _eu_collect_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('EMPTY_USERID_AUDIT') || ss.insertSheet('EMPTY_USERID_AUDIT');
  sh.clearContents();
  sh.appendRow(['ANSWERS行', '日時', 'set', '中身あり?', 'score', 'total', '近接候補userId', '候補氏名', '候補との差(分)']);
  rows.forEach(function (x) {
    sh.appendRow([x.row, x.ts, x.set, x.hasContent ? 'あり' : 'なし', x.score, x.total,
      x.candidateUid, x.candidateName, x.candidateDeltaMin]);
  });
  Logger.log('EMPTY_USERID_AUDIT シートに ' + rows.length + ' 行を書き出しました（読み取り専用・削除なし）。');
  return rows.length;
}
