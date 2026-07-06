/**
 * gas-pt-results.js
 *
 * Practice Test (full-length mock) history endpoints. The Practice Test
 * front-end (practice-test/results.html + practice-test/js/api.js) is
 * ALREADY wired to call these two actions on the aggregate GAS (REC_URL,
 * which is the SAME deployment as the main app's API_URL). Until these
 * handlers exist, results.html logs "Api.savePtResult missing — history
 * disabled" and silently skips saving — so a learner's mock-test results
 * live only in sessionStorage and vanish on browser close / other device.
 *
 * Pasting the two functions below makes Practice Test results persist
 * server-side (PT_RESULTS sheet, keyed by userId) and show up in the
 * "過去の模試結果" history table on results.html — on any browser/device.
 *
 * NOTE on auth: the PT flow sends only userId (no pass), matching the
 * existing recording-upload design (fire-and-forget, userId trust). If you
 * later want it hardened, add a pass check like handleGetMyHistory_.
 *
 * ----------------------------------------------------------------------
 * PASTE FLOW (one-time):
 *   1. Add TWO lines to your existing doGet() if-chain (next to the other
 *      getMyHistory / getMyAnswers lines):
 *        if (action === 'savePtResult')  return handleSavePtResult_(e, callback);
 *        if (action === 'listPtResults') return handleListPtResults_(e, callback);
 *   2. Paste both functions below at the bottom of the GAS file.
 *   3. Save → Deploy → Manage deployments → 鉛筆 → New version → Deploy.
 *      (URL unchanged, so no front-end edit is needed.)
 * ----------------------------------------------------------------------
 */

var PT_RESULTS_SHEET = 'PT_RESULTS';
var PT_RESULTS_HEADER = [
  'timestamp', 'userId', 'userName', 'sessionId',
  'readingCorrect', 'readingTotal', 'readingScaled',
  'listeningCorrect', 'listeningTotal', 'listeningScaled',
  'writingSentCorrect', 'writingSentTotal', 'writingScaled',
  'speakingLr', 'speakingTi', 'total', 'band', 'readingPath', 'testId'
];

function _ptResultsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PT_RESULTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PT_RESULTS_SHEET);
    sheet.appendRow(PT_RESULTS_HEADER);
  }
  return sheet;
}

function handleSavePtResult_(e, callback) {
  try {
    var p = e.parameter;
    var userId = String(p.userId || '');
    if (!userId) return jsonpResponse_(callback, { success: false, error: 'missing_user' });

    var sessionId = String(p.sessionId || '');
    var sheet = _ptResultsSheet_();
    var data = sheet.getDataRange().getValues();

    // De-dupe by (userId, sessionId): if this mock session was already
    // saved (e.g. results.html reloaded), update that row instead of
    // appending a duplicate. sessionId is column D (index 3).
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
      String(p.speakingLr) === 'true',
      String(p.speakingTi) === 'true',
      Number(p.total) || 0,
      String(p.band || ''),
      String(p.readingPath || ''),
      String(p.testId || '')          // which mock: '1' | '2' | '3'  (blank on legacy rows)
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
    var userId = String(e.parameter.userId || '');
    if (!userId) return jsonpResponse_(callback, { success: false, error: 'missing_user' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(PT_RESULTS_SHEET);
    if (!sheet) return jsonpResponse_(callback, { success: true, results: [] });
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonpResponse_(callback, { success: true, results: [] });

    var results = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      if (String(row[1]) !== userId) continue;
      var tsRaw = row[0];
      var tsStr = (tsRaw instanceof Date) ? tsRaw.toISOString() : String(tsRaw || '');
      results.push({
        timestamp:        tsStr,
        sessionId:        String(row[3] || ''),
        readingCorrect:   Number(row[4])  || 0,
        readingTotal:     Number(row[5])  || 0,
        readingScaled:    Number(row[6])  || 0,
        listeningCorrect: Number(row[7])  || 0,
        listeningTotal:   Number(row[8])  || 0,
        listeningScaled:  Number(row[9])  || 0,
        writingSentCorrect: Number(row[10]) || 0,
        writingSentTotal:   Number(row[11]) || 0,
        writingScaled:      Number(row[12]) || 0,
        speakingLr:       row[13] === true || String(row[13]) === 'true',
        speakingTi:       row[14] === true || String(row[14]) === 'true',
        total:            Number(row[15]) || 0,
        band:             String(row[16] || ''),
        readingPath:      String(row[17] || ''),
        testId:           String(row[18] || '')
      });
    }
    return jsonpResponse_(callback, { success: true, results: results });
  } catch (err) {
    return jsonpResponse_(callback, { success: false, error: String(err && err.message ? err.message : err) });
  }
}
