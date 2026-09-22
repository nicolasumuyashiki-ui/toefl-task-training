/**
 * docs/gas-pt-recording-session.js
 *   模試スピーキングの録音を「どの受験回のものか」で特定できるようにする
 *
 * ■ 何が問題だったか
 *   RECORDINGS_PT には timestamp / userId / 氏名 / task / practice_set /
 *   q_index / duration / attempt / file_id / file_url / mime / source しか
 *   無く、**受験回（sessionId）を示す列が無い**。PT_RESULTS 側には受験回ごとの
 *   session_id が入っているのに突き合わせられないため、Admin の模試詳細は
 *   「この生徒の模試録音を全部」並べるしかなかった。同じ模試を複数回受けた
 *   生徒では、どれがどの回の録音か日時で推測するしかない状態だった。
 *
 * ■ この方針の理由（既存の uploadRecording を書き換えない）
 *   録音の受け口 handleUploadRecording_ は本番 GAS にしか無く、docs/ に写しが
 *   無い。そこへ手を入れると、写しの無いコードを推測で書き換えることになる。
 *   そこで、録音の append 自体はそのままにし、**直後に別エンドポイントで
 *   「いま入った行」に受験回を書き込む**方式にした。既存の保存経路には一切
 *   触れないので、これが失敗しても録音は従来どおり保存される。
 *
 * ■ デプロイ手順
 *   1. 本ファイルの関数を GAS プロジェクト末尾に貼り付け。
 *   2. doGet() の dispatch に1行追加:
 *        if (action === 'tagPtRecording') return handleTagPtRecording_(e, callback);
 *   3. デプロイ管理 → 既存デプロイを編集 → 新しいバージョン発行（API_URL は変えない）。
 *   4. 既存の録音にも受験回を入れる場合は、エディタで
 *        backfillPtRecordingSessions()               ← 確認のみ（書き換えない）
 *        backfillPtRecordingSessions({apply:true})   ← 実際に書き込む
 *      を実行する。
 *
 * ■ 安全性
 *   - 触るのは RECORDINGS_PT の session_id / test_id 列だけ。
 *     音声ファイル・file_id・file_url・既存の列は一切変更しない。
 *   - 既に session_id が入っている行は上書きしない。
 *   - ANSWERS / PT_RESULTS / PT_ANSWERS / BANDS / RECORDINGS には書き込まない。
 *   - 未デプロイでも client は degrade するだけ（録音は従来どおり保存される）。
 */

var PTREC_SHEET   = 'RECORDINGS_PT';
var PTREC_SESSION = 'session_id';
var PTREC_TEST    = 'test_id';

/* 見出し名で列を引く。無ければ（apply 時のみ）右端に足す。
   位置ではなく見出し名で扱うので、将来列が増えてもずれない。 */
function _ptRecCol_(sh, header, name, createIfMissing) {
  var i = header.indexOf(name);
  if (i >= 0) return i;
  if (!createIfMissing) return -1;
  var col = header.length + 1;
  sh.getRange(1, col).setValue(name);
  header.push(name);
  return col - 1;
}

/* GET(JSONP) — 直前に append された録音行に受験回を刻む。
   (userId, task, q_index) が一致し、session_id がまだ空の行のうち、
   いちばん新しいものを対象にする。連続アップロードでも取り違えないよう
   「空の行だけ」を狙う。 */
function handleTagPtRecording_(e, callback) {
  try {
    var p = (e && e.parameter) || {};
    var userId    = String(p.userId || '').trim();
    var sessionId = String(p.sessionId || '').trim();
    if (!userId || !sessionId) return jsonpResponse_(callback, { success: false, error: 'missing_user_or_session' });
    var task  = String(p.task || '').trim().toLowerCase();
    var qIdx  = String(p.questionIndex == null ? '' : p.questionIndex).trim();
    var testId = String(p.testId || '').trim();

    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PTREC_SHEET);
    if (!sh) return jsonpResponse_(callback, { success: false, error: 'no_sheet' });
    var d = sh.getDataRange().getValues();
    if (d.length < 2) return jsonpResponse_(callback, { success: true, tagged: 0 });

    var header = d[0].map(function (h) { return String(h || ''); });
    var iSes = _ptRecCol_(sh, header, PTREC_SESSION, true);
    var iTst = _ptRecCol_(sh, header, PTREC_TEST, true);

    // 新しい行から探す（直前の append が最後尾にある）。
    for (var r = d.length - 1; r >= 1; r--) {
      if (String(d[r][1] || '').trim() !== userId) continue;
      if (task && String(d[r][3] || '').trim().toLowerCase() !== task) continue;
      if (qIdx !== '' && String(d[r][5] == null ? '' : d[r][5]).trim() !== qIdx) continue;
      var cur = (iSes < d[r].length) ? String(d[r][iSes] || '').trim() : '';
      if (cur) continue;                      // 既に紐づいている行は触らない
      sh.getRange(r + 1, iSes + 1).setValue(sessionId);
      if (testId) sh.getRange(r + 1, iTst + 1).setValue(testId);
      return jsonpResponse_(callback, { success: true, tagged: 1, row: r + 1 });
    }
    return jsonpResponse_(callback, { success: true, tagged: 0 });
  } catch (err) {
    return jsonpResponse_(callback, { success: false, error: String(err && err.message ? err.message : err) });
  }
}

/* ============================================================
 * backfillPtRecordingSessions — 既存の録音に受験回を入れる（さかのぼり）
 *
 * 判定は推測ではなく PT_RESULTS の実データで行う。ある生徒の受験回を
 * 時系列に並べ、録音の収録時刻が「前の受験回の保存時刻より後」かつ
 * 「その受験回の保存時刻＋猶予より前」に入っていれば、その回のものとみなす。
 * 模試は1回あたり数十分なので、この窓は実際の受験と一致する。
 *
 *   backfillPtRecordingSessions()                        … 確認のみ
 *   backfillPtRecordingSessions({apply:true})            … 書き込む
 *   backfillPtRecordingSessions({apply:true, graceMin:30}) … 猶予を変える（既定 30 分）
 *
 * 判定できなかった行は触らない（Admin 側では「受験回が未記録」として扱われる）。
 * ============================================================ */
function backfillPtRecordingSessions(opts) {
  opts = opts || {};
  var APPLY = opts.apply === true;
  var GRACE = (Number(opts.graceMin) || 30) * 60 * 1000;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rec = ss.getSheetByName(PTREC_SHEET);
  if (!rec) { Logger.log('RECORDINGS_PT シートがありません'); return 0; }
  var res = ss.getSheetByName('PT_RESULTS');
  if (!res) { Logger.log('PT_RESULTS シートがありません'); return 0; }

  // userId → [{t, sessionId, testId}] を古い順に
  var attempts = {};
  var rv = res.getDataRange().getValues();
  for (var i = 1; i < rv.length; i++) {
    var uid = String(rv[i][1] || '').trim();
    var sid = String(rv[i][3] || '').trim();
    if (!uid || !sid) continue;
    var raw = rv[i][0];
    var t = (raw instanceof Date) ? raw.getTime() : Date.parse(raw);
    if (isNaN(t)) continue;
    (attempts[uid] = attempts[uid] || []).push({ t: t, sessionId: sid, testId: String(rv[i][18] || '') });
  }
  Object.keys(attempts).forEach(function (uid) {
    attempts[uid].sort(function (a, b) { return a.t - b.t; });
  });

  var d = rec.getDataRange().getValues();
  if (d.length < 2) { Logger.log('RECORDINGS_PT は空です'); return 0; }
  var header = d[0].map(function (h) { return String(h || ''); });
  var iSes = _ptRecCol_(rec, header, PTREC_SESSION, APPLY);
  var iTst = _ptRecCol_(rec, header, PTREC_TEST, APPLY);
  if (iSes < 0) {
    Logger.log('（確認のみ）session_id 列がまだありません。apply:true で実行すると作成します。');
  }

  var tagged = 0, skipped = 0, already = 0;
  Logger.log('=== 録音と受験回の照合' + (APPLY ? '（実行）' : '（確認のみ・書き換えません）') + ' ===');

  for (var r = 1; r < d.length; r++) {
    var uid2 = String(d[r][1] || '').trim();
    if (!uid2) continue;
    var cur = (iSes >= 0 && iSes < d[r].length) ? String(d[r][iSes] || '').trim() : '';
    if (cur) { already++; continue; }

    var raw2 = d[r][0];
    var rt = (raw2 instanceof Date) ? raw2.getTime() : Date.parse(raw2);
    if (isNaN(rt)) { skipped++; continue; }

    var list = attempts[uid2] || [];
    var hit = null;
    for (var k = 0; k < list.length; k++) {
      var prevT = k > 0 ? list[k - 1].t : -Infinity;   // 前の受験回より後
      if (rt > prevT && rt <= list[k].t + GRACE) { hit = list[k]; break; }
    }
    if (!hit) {
      skipped++;
      Logger.log('  △ 判定できず  行' + (r + 1) + ' / ' + uid2 + ' / ' +
        Utilities.formatDate(new Date(rt), 'Asia/Tokyo', 'MM/dd HH:mm') + ' → 該当する受験回なし');
      continue;
    }
    Logger.log('  ✓ ' + (APPLY ? '紐づけ' : '紐づけ可') + '  行' + (r + 1) + ' / ' + uid2 + ' / ' +
      Utilities.formatDate(new Date(rt), 'Asia/Tokyo', 'MM/dd HH:mm') + ' → ' + hit.sessionId);
    if (APPLY) {
      rec.getRange(r + 1, iSes + 1).setValue(hit.sessionId);
      if (hit.testId) rec.getRange(r + 1, iTst + 1).setValue(hit.testId);
    }
    tagged++;
  }

  Logger.log('--------');
  Logger.log((APPLY ? '紐づけました: ' : '紐づけ可能: ') + tagged + ' 件 / 判定できず: ' + skipped +
    ' 件 / すでに紐づけ済み: ' + already + ' 件');
  if (!APPLY && tagged) Logger.log('→ 実行するには backfillPtRecordingSessions({apply:true})');
  return tagged;
}
