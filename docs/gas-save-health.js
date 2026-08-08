/**
 * gas-save-health.js
 *
 * Paste-in code for the TCK Reps GAS backend to receive SAVE-HEALTH telemetry
 * from the front-end and let admin see which accounts have results that are
 * NOT reaching the server (stuck outbox items) — so staff can reach out
 * proactively instead of finding out only via a complaint (前田様 type).
 *
 * INSTALLATION (one-time)
 *   1. Add TWO lines to your existing doGet()/doPost() if-chain (both, so the
 *      relay POST and the direct GET both route):
 *        if (action === 'reportSaveHealth') return handleReportSaveHealth_(e, callback);
 *        if (action === 'listSaveHealth')   return handleListSaveHealth_(e, callback);
 *   2. Paste the functions below at the bottom of any .gs file.
 *   3. Save → Deploy → Manage deployments → New version → Deploy. URL unchanged.
 *
 * SHEET — SAVE_HEALTH (auto-created), one row per userId (upserted):
 *   A userId | B userName | C stuck | D ptStuck | E oldestAgeMin | F maxTries
 *   G lastReportAt (server time) | H ua | I firstSeenAt | J reportCount
 *
 * Degrades gracefully: front-end calls .catch(→null), so nothing breaks if
 * this isn't deployed yet. No answer content is stored — only counts/age/UA.
 *
 * ── ALL-CLEAR （2026-08-08 追加・重要）────────────────────────────────
 * `handleListSaveHealth_` は stuck + ptStuck > 0 の行だけを返す。したがって
 * 「滞留が解消した」ことを client が報告しない限り、行は最後の非ゼロ値のまま
 * 残り続け、実際には送信が完了しているアカウントが admin パネルに赤いまま
 * 表示される（実際に 2 週間消えない行が発生した）。
 *
 * 修正後の js/api.js は、滞留が 0 になった時点で stuck=0 / ptStuck=0 の報告を
 * 1 回だけ送る（30 分スロットルを無視。localStorage `tck_health_flagged` で
 * 「以前フラグを立てた端末か」を判定する）。この 0 報告が upsert されると
 * listSaveHealth のフィルタから外れ、パネルから自動的に消える。
 *
 * → よって **サーバ側の変更は不要**。ただし修正前に付いた古い行は、その生徒が
 *   再訪して 0 報告を送るまで残る。それを掃除するのが下の
 *   `reconcileSaveHealth()`（ANSWERS / PT_RESULTS の実績を根拠に解消判定する）。
 */

var SAVE_HEALTH_SHEET = 'SAVE_HEALTH';
var SAVE_HEALTH_HEADER = [
  'userId', 'userName', 'stuck', 'ptStuck', 'oldestAgeMin', 'maxTries',
  'lastReportAt', 'ua', 'firstSeenAt', 'reportCount'
];

function _saveHealthSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SAVE_HEALTH_SHEET);
  if (!sh) { sh = ss.insertSheet(SAVE_HEALTH_SHEET); sh.appendRow(SAVE_HEALTH_HEADER); }
  return sh;
}

// ---- Front-end telemetry receiver (no auth: userId-scoped, no secrets) ----
function handleReportSaveHealth_(e, callback) {
  try {
    var p = e.parameter || {};
    var userId = String(p.userId || '').trim();
    if (!userId) return jsonpResponse_(callback, { success: false, error: 'missing_user' });

    var sh = _saveHealthSheet_();
    var d = sh.getDataRange().getValues();
    var nowIso = new Date().toISOString();
    var row = [
      userId, String(p.userName || ''),
      Number(p.stuck || 0), Number(p.ptStuck || 0),
      Number(p.oldestAgeMin || 0), Number(p.maxTries || 0),
      nowIso, String(p.ua || '').slice(0, 300), nowIso, 1
    ];

    // Upsert by userId (col A). Preserve firstSeenAt + accumulate reportCount.
    for (var i = 1; i < d.length; i++) {
      if (String(d[i][0]).trim() === userId) {
        row[8] = d[i][8] || nowIso;                 // keep firstSeenAt
        row[9] = (Number(d[i][9]) || 0) + 1;        // reportCount++
        sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
        return jsonpResponse_(callback, { success: true, updated: true });
      }
    }
    sh.appendRow(row);
    return jsonpResponse_(callback, { success: true, created: true });
  } catch (err) {
    return jsonpResponse_(callback, { success: false, error: String(err) });
  }
}

// ---- Admin read (staff-authenticated) ----
function handleListSaveHealth_(e, callback) {
  // Reuse whatever staff check the other admin endpoints use. Adjust the
  // function name if your project's is different (e.g. verifyStaff_).
  var ok = false;
  try { ok = !!verifyStaff_(e.parameter.id, e.parameter.pass); }
  catch (err) {
    // Fallback: treat a @tckworkshop.co.jp verified user as staff.
    try { var u = verifyUser_(e.parameter.id, e.parameter.pass); ok = !!(u && String(u.email || '').toLowerCase().indexOf('@tckworkshop.co.jp') !== -1); } catch (e2) {}
  }
  if (!ok) return jsonpResponse_(callback, { success: false, error: 'auth_failed' });

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SAVE_HEALTH_SHEET);
  if (!sh) return jsonpResponse_(callback, { success: true, rows: [] });
  var d = sh.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < d.length; i++) {
    var stuck = Number(d[i][2]) || 0, ptStuck = Number(d[i][3]) || 0;
    if (stuck + ptStuck <= 0) continue;   // only accounts with unresolved saves
    rows.push({
      userId: d[i][0], userName: d[i][1], stuck: stuck, ptStuck: ptStuck,
      oldestAgeMin: Number(d[i][4]) || 0, maxTries: Number(d[i][5]) || 0,
      lastReportAt: d[i][6], ua: d[i][7], reportCount: Number(d[i][9]) || 0
    });
  }
  // Most-stuck / oldest first.
  rows.sort(function (a, b) { return (b.oldestAgeMin - a.oldestAgeMin) || ((b.stuck + b.ptStuck) - (a.stuck + a.ptStuck)); });
  return jsonpResponse_(callback, { success: true, rows: rows });
}


// ============================================================
// reconcileSaveHealth — 古い滞留フラグを実績にもとづいて解消する
//
// 判定根拠は推測ではなく実データ:
//   その userId が「最後の報告時刻より後」に ANSWERS または PT_RESULTS へ
//   保存できていれば、その端末の送信経路は生きている＝滞留は解消済み。
//
// 触るのは SAVE_HEALTH シート（表示用テレメトリ）だけ。
// ANSWERS / RECORDINGS / PT_RESULTS / BANDS には一切書き込まない。
//
// 使い方:
//   reconcileSaveHealth()                  … 確認のみ（既定・書き換えない）
//   reconcileSaveHealth({apply:true})      … 実績のある行を 0 にする
//   reconcileSaveHealth({apply:true, staleDays:14})
//                                          … 加えて「最後の報告から N 日以上
//                                            音沙汰なし」の行も 0 にする
//                                            （既定は無効。0/未指定でスキップ）
// ============================================================
function reconcileSaveHealth(opts) {
  opts = opts || {};
  var APPLY = opts.apply === true;
  var STALE_DAYS = Number(opts.staleDays || 0);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SAVE_HEALTH_SHEET);
  if (!sh) { Logger.log('SAVE_HEALTH シートがありません'); return 0; }

  var d = sh.getDataRange().getValues();
  if (d.length < 2) { Logger.log('SAVE_HEALTH は空です'); return 0; }

  // userId → 最後にサーバへ保存が着地した時刻（ANSWERS + PT_RESULTS の最大）
  function lastLanded_() {
    var map = {};
    function scan(sheetName, iUid, iTs) {
      var s = ss.getSheetByName(sheetName);
      if (!s) return;
      var v = s.getDataRange().getValues();
      for (var i = 1; i < v.length; i++) {
        var uid = String(v[i][iUid] || '').trim();
        if (!uid) continue;
        var raw = v[i][iTs];
        var t = (raw instanceof Date) ? raw.getTime() : Date.parse(raw);
        if (isNaN(t)) continue;
        if (!map[uid] || t > map[uid]) map[uid] = t;
      }
    }
    scan('ANSWERS', 1, 0);      // B=userId, A=timestamp
    scan('PT_RESULTS', 1, 0);   // B=userId, A=timestamp
    return map;
  }

  var landed = lastLanded_();
  var now = Date.now();
  var cleared = 0, kept = 0;

  Logger.log('=== 保存ヘルスの照合' + (APPLY ? '（実行）' : '（確認のみ・書き換えません）') + ' ===');

  for (var r = 1; r < d.length; r++) {
    var uid = String(d[r][0] || '').trim();
    if (!uid) continue;
    var stuck = Number(d[r][2]) || 0, ptStuck = Number(d[r][3]) || 0;
    if (stuck + ptStuck <= 0) continue;   // すでに解消済みの行は対象外

    var reportedAt = Date.parse(d[r][6]);
    var landedAt = landed[uid] || 0;
    var reason = '';

    if (!isNaN(reportedAt) && landedAt > reportedAt) {
      reason = '報告後にサーバ保存の実績あり（' +
        Utilities.formatDate(new Date(landedAt), 'Asia/Tokyo', 'MM/dd HH:mm') + '）';
    } else if (STALE_DAYS > 0 && !isNaN(reportedAt) &&
               (now - reportedAt) > STALE_DAYS * 24 * 60 * 60 * 1000) {
      reason = STALE_DAYS + ' 日以上 報告が更新されていない（古いフラグ）';
    }

    if (!reason) {
      kept++;
      Logger.log('  △ 残す  ' + uid + ' | 滞留 ' + (stuck + ptStuck) + ' 件 | 最終報告 ' +
        String(d[r][6] || '').slice(0, 16) + ' → 解消の根拠なし。本人に連絡が必要');
      continue;
    }

    Logger.log('  ✓ 解消  ' + uid + ' | 滞留 ' + (stuck + ptStuck) + ' 件 | ' + reason);
    if (APPLY) {
      sh.getRange(r + 1, 3).setValue(0);   // stuck
      sh.getRange(r + 1, 4).setValue(0);   // ptStuck
      sh.getRange(r + 1, 5).setValue(0);   // oldestAgeMin
    }
    cleared++;
  }

  Logger.log('--------');
  Logger.log((APPLY ? '解消しました: ' : '解消できる見込み: ') + cleared + ' 件 / 要対応のまま: ' + kept + ' 件');
  if (!APPLY && cleared) Logger.log('→ 実行するには reconcileSaveHealth({apply:true})');
  return cleared;
}
