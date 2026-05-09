/**
 * gas-my-answers.js
 *
 * Student-side endpoint that returns the logged-in user's own saved
 * answers for a specific (task, practice [, set]). Mirrors
 * handleGetAttemptAnswers_ but uses verifyUser_ (not verifyStaff_)
 * and forces the userId to whoever the password validates.
 *
 * Used by js/student-history.js on each answer / tips page so students
 * can review their past attempts without depending on sessionStorage
 * (which is wiped between sessions / browsers).
 *
 * Paste flow:
 *   1. Add ONE new line to your existing doGet() if-chain (just below
 *      the getAttemptAnswers line is fine):
 *        if (action === 'getMyAnswers') return handleGetMyAnswers_(e, callback);
 *   2. Paste the function below at the bottom of the file.
 *   3. Save (Ctrl+S) → Deploy → Manage deployments → 鉛筆 → New version → Deploy.
 */

function handleGetMyAnswers_(e, callback) {
  try {
    var u = verifyUser_(e.parameter.id, e.parameter.pass);
    if (!u) return jsonpResponse_(callback, { success: false, error: 'auth_failed' });

    var task     = (e.parameter.task    || '').toLowerCase();
    var practice = String(e.parameter.practice || '');
    var setNum   = String(e.parameter.set      || '');
    if (!task || !practice) {
      return jsonpResponse_(callback, { success: false, error: 'missing_params' });
    }

    var TASK_LABELS = {
      ctw:'CTW', rdl:'RDL', academic:'Academic',
      lcr:'LCR', conv:'Conv', announce:'Announce', talk:'Talk',
      sentence:'Sentence', email:'Email', discussion:'Discussion',
      lr:'LR', ti:'TI'
    };
    var label = TASK_LABELS[task];
    if (!label) return jsonpResponse_(callback, { success: false, error: 'unknown_task' });

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ANSWERS');
    if (!sheet) return jsonpResponse_(callback, { success: true, attempts: [] });
    var data = sheet.getDataRange().getValues();
    if (!data.length) return jsonpResponse_(callback, { success: true, attempts: [] });

    var wantPrefix  = label + ' P' + practice;
    var wantWithSet = setNum ? (label + ' P' + practice + ' Set ' + setNum) : null;

    var matches = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      // Force userId match against the verified user — never trust the param.
      if (String(row[1]) !== String(u.userId)) continue;
      var setName = String(row[3] || '').trim();
      var ok = false;
      if (wantWithSet && setName === wantWithSet) ok = true;
      else if (!wantWithSet && setName === wantPrefix) ok = true;
      else if (!wantWithSet && setName.indexOf(wantPrefix) === 0 &&
               (setName.length === wantPrefix.length || setName.charAt(wantPrefix.length) === ' ')) {
        ok = true;
      }
      if (!ok) continue;

      var rawAnswers = row[4];
      var parsed;
      try {
        parsed = (typeof rawAnswers === 'string' && rawAnswers) ? JSON.parse(rawAnswers) : rawAnswers;
      } catch (err) { parsed = String(rawAnswers); }

      var tsRaw = row[0];
      var tsStr = (tsRaw instanceof Date) ? tsRaw.toISOString() : String(tsRaw || '');

      matches.push({
        timestamp: tsStr,
        set: setName,
        score: row[5],
        answers: parsed
      });
    }

    matches.sort(function(a,b){ return (b.timestamp || '').localeCompare(a.timestamp || ''); });
    return jsonpResponse_(callback, { success: true, attempts: matches });
  } catch (err) {
    return jsonpResponse_(callback, { success: false, error: String(err && err.message ? err.message : err) });
  }
}
