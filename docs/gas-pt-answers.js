/**
 * gas-pt-answers.js
 *
 * Practice Test (full-length mock) ANSWER-CONTENT archive endpoints.
 *
 * PT_RESULTS (gas-pt-results.js) stores only the SCORES of each mock attempt.
 * The learner's raw per-question answers (which option they chose, the letters
 * they typed for Complete-the-Words, the sentence-insertion position, …) were
 * never persisted server-side — they lived only in sessionStorage and vanished
 * on tab close. That is exactly why one learner's listening-retake answers
 * could not be recovered after the fact.
 *
 * These two handlers archive the raw answer contents to a PT_ANSWERS sheet,
 * keyed by (userId, sessionId) and UPSERTED (same sessionId → overwrite, so a
 * listening retake replaces that attempt's stored listening answers). The
 * front-end (practice-test/js/api.js: Api.savePtAnswers / Api.getPtAnswers) is
 * ALREADY wired to call these; until they exist the calls are a harmless no-op
 * (best-effort — the score save is unaffected).
 *
 * Transport: savePtAnswers is a POST (hidden-iframe form, so large bodies are
 * fine) → route it in doPost(). getPtAnswers is a JSONP GET → route it in
 * doGet(). Auth mirrors the rest of the PT flow: userId trust, no pass.
 *
 * ----------------------------------------------------------------------
 * PASTE FLOW (one-time):
 *   1. In your doPost(e) if-chain add:
 *        if (action === 'savePtAnswers') return handleSavePtAnswers_(e);
 *   2. In your doGet(e) if-chain add (next to listPtResults):
 *        if (action === 'getPtAnswers')  return handleGetPtAnswers_(e, callback);
 *      (doPost must read `action` from e.parameter, same as the other POSTs.)
 *   3. Paste both functions below at the bottom of the GAS file.
 *   4. Save → Deploy → Manage deployments → pencil → New version → Deploy.
 *      (URL unchanged, so no front-end edit is needed.)
 * ----------------------------------------------------------------------
 */

var PT_ANSWERS_SHEET = 'PT_ANSWERS';
var PT_ANSWERS_HEADER = ['timestamp', 'userId', 'userName', 'sessionId', 'answersJson'];

function _ptAnswersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PT_ANSWERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PT_ANSWERS_SHEET);
    sheet.appendRow(PT_ANSWERS_HEADER);
  }
  return sheet;
}

/* POST — archive/overwrite the raw answer contents for (userId, sessionId).
   Returns plain JSON (the front-end POSTs via a hidden iframe and does not read
   the body, so a JSONP callback is unnecessary here). */
function handleSavePtAnswers_(e) {
  try {
    var p = (e && e.parameter) || {};
    var userId = String(p.userId || '');
    var sessionId = String(p.sessionId || '');
    if (!userId || !sessionId) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'missing_user_or_session' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var answersJson = String(p.answersJson || '{}');

    var sheet = _ptAnswersSheet_();
    var data = sheet.getDataRange().getValues();

    // Upsert by (userId, sessionId): sessionId is column D (index 3).
    var targetRow = -1;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][1]) === userId && String(data[r][3]) === sessionId) { targetRow = r + 1; break; }
    }

    var row = [
      (new Date()).toISOString(),
      userId,
      String(p.userName || ''),
      sessionId,
      answersJson
    ];

    if (targetRow > 0) {
      sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: String(err && err.message ? err.message : err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* GET (JSONP) — fetch the archived answer contents for (userId, sessionId).
   Used for recovery / audit. */
function handleGetPtAnswers_(e, callback) {
  try {
    var p = (e && e.parameter) || {};
    var userId = String(p.userId || '');
    var sessionId = String(p.sessionId || '');
    if (!userId) return jsonpResponse_(callback, { success: false, error: 'missing_user' });

    var sheet = _ptAnswersSheet_();
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][1]) === userId && (!sessionId || String(data[r][3]) === sessionId)) {
        return jsonpResponse_(callback, {
          success: true,
          timestamp: String(data[r][0] || ''),
          sessionId: String(data[r][3] || ''),
          answersJson: String(data[r][4] || '{}')
        });
      }
    }
    return jsonpResponse_(callback, { success: true, answersJson: '' }); // none found
  } catch (err) {
    return jsonpResponse_(callback, { success: false, error: String(err && err.message ? err.message : err) });
  }
}
