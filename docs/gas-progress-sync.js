/**
 * gas-progress-sync.js
 *
 * Cross-device "中断 / Resume" sync. The in-progress snapshot a learner
 * leaves mid-practice (TCKProgress.save → localStorage `tck_progress_*`) used
 * to live ONLY in that browser, so on another device the practice started
 * over from scratch. These endpoints let the snapshot follow the account.
 *
 * Sheet: PROGRESS  (auto-created)
 *   A updatedAt | B userId | C task | D practice | E state(JSON)
 * One row per (userId, task, practice) — upserted (latest wins).
 *
 * Security: getProgress / clearProgress use verifyUser_ (own data only).
 * saveProgress is POST and trusts userId (same fire-and-forget model as
 * uploadRecording / saveAnswers POST — the snapshot is non-sensitive).
 *
 * ----------------------------------------------------------------------
 * PASTE FLOW (one-time):
 *   1. Add to doGet()'s if-chain (next to getMyHistory):
 *        if (action === 'getProgress')   return handleGetProgress_(e, callback);
 *        if (action === 'clearProgress') return handleClearProgress_(e, callback);
 *   2. Add to doPost()'s if-chain (next to saveAnswers):
 *        if (action === 'saveProgress')  return handleSaveProgress_(e);
 *   3. Paste the three functions below at the bottom of the file.
 *   4. Save → Deploy → Manage deployments → 鉛筆 → New version → Deploy.
 *
 * Until deployed the client degrades gracefully (resume falls back to the
 * local snapshot, exactly like today). Nothing breaks.
 * ----------------------------------------------------------------------
 */

var PROGRESS_SHEET = 'PROGRESS';

function _progressSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PROGRESS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PROGRESS_SHEET);
    sh.appendRow(['updatedAt', 'userId', 'task', 'practice', 'state']);
  }
  return sh;
}

/* POST: upsert the in-progress snapshot for (userId, task, practice). */
function handleSaveProgress_(e) {
  try {
    var p = e.parameter || {};
    var userId = String(p.userId || '');
    var task = String(p.task || '');
    var practice = String(p.practice || '');
    if (!userId || !task || !practice) return jsonResponse_({ success: false, error: 'missing_params' });

    var sh = _progressSheet_();
    var data = sh.getDataRange().getValues();
    var rowNum = -1;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][1]) === userId && String(data[r][2]) === task && String(data[r][3]) === practice) { rowNum = r + 1; break; }
    }
    var row = [(new Date()).toISOString(), userId, task, practice, String(p.state || '')];
    if (rowNum > 0) sh.getRange(rowNum, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return jsonResponse_({ success: true });
  } catch (err) {
    return jsonResponse_({ success: false, error: String(err && err.message ? err.message : err) });
  }
}

/* JSONP: return every in-progress snapshot for the verified user. */
function handleGetProgress_(e, callback) {
  try {
    var u = verifyUser_(e.parameter.id, e.parameter.pass);
    if (!u) return jsonpResponse_(callback, { success: false, error: 'auth_failed' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(PROGRESS_SHEET);
    if (!sh) return jsonpResponse_(callback, { success: true, progress: [] });
    var data = sh.getDataRange().getValues();
    var out = [];
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][1]) !== String(u.userId)) continue;
      var stateRaw = data[r][4];
      var state;
      try { state = (typeof stateRaw === 'string' && stateRaw) ? JSON.parse(stateRaw) : stateRaw; }
      catch (err) { state = null; }
      var tsRaw = data[r][0];
      out.push({
        task: String(data[r][2] || ''),
        practice: String(data[r][3] || ''),
        state: state,
        updatedAt: (tsRaw instanceof Date) ? tsRaw.toISOString() : String(tsRaw || '')
      });
    }
    return jsonpResponse_(callback, { success: true, progress: out });
  } catch (err) {
    return jsonpResponse_(callback, { success: false, error: String(err && err.message ? err.message : err) });
  }
}

/* JSONP: delete the snapshot for (userId, task, practice) — called when the
   learner completes the practice (TCKProgress.clear). */
function handleClearProgress_(e, callback) {
  try {
    var u = verifyUser_(e.parameter.id, e.parameter.pass);
    if (!u) return jsonpResponse_(callback, { success: false, error: 'auth_failed' });
    var task = String(e.parameter.task || '');
    var practice = String(e.parameter.practice || '');

    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PROGRESS_SHEET);
    if (!sh) return jsonpResponse_(callback, { success: true });
    var data = sh.getDataRange().getValues();
    for (var r = data.length - 1; r >= 1; r--) {
      if (String(data[r][1]) === String(u.userId) && String(data[r][2]) === task && String(data[r][3]) === practice) {
        sh.deleteRow(r + 1);
      }
    }
    return jsonpResponse_(callback, { success: true });
  } catch (err) {
    return jsonpResponse_(callback, { success: false, error: String(err && err.message ? err.message : err) });
  }
}
