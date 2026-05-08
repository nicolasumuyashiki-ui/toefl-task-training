/**
 * gas-attempt-answers.js
 *
 * Adds an admin endpoint that returns the saved `answers` payload for a
 * specific (userId, task, practice [, set]) tuple. Used by the admin
 * "回答を見る / 本文を見る" buttons to overlay the student's actual
 * submission on top of the answer-key page.
 *
 * Paste flow:
 *   1. Add ONE new case to your existing doGet() switch:
 *        case 'getAttemptAnswers': result = handleGetAttemptAnswers_(e); break;
 *   2. Paste the function below at the bottom of the file.
 *   3. Save (Ctrl+S) → Deploy → Manage deployments → 鉛筆 → New version → Deploy.
 *      (Same deployment URL — no need to update js/api.js.)
 *
 * Sheet assumption (verified against the live "TOEFL Reps Database" book):
 *   Sheet name: ANSWERS
 *   Columns:    A=timestamp | B=userId | C=userName | D=set
 *               E=answers   | F=score  | G=harder_correct | H=harder_total
 *               I=attempt_number
 *   `answers` is a JSON string written by saveAnswers().
 *   The `set` column holds the setName like "Email P1", "Discussion P3",
 *   "CTW P1 Set 1", "LCR P3", etc.
 *
 *   Header detection is tolerant — if the timestamp column has no header
 *   it falls back to column index 0. Column-name variants are accepted.
 */

/* ============================================================
   handleGetAttemptAnswers_
   Query params:
     id, pass        — staff credentials (same as listUsers/listAttempts)
     userId          — target student
     task            — task key: ctw / rdl / academic / lcr / conv /
                       announce / talk / sentence / email / discussion /
                       lr / ti
     practice        — practice number (1..10)
     set             — optional set number (CTW only)
     callback        — JSONP callback name

   Returns:
     { success: true, attempts: [ { timestamp, set, score, status,
                                    answers (parsed JSON) }, ... ] }
   ============================================================ */
function handleGetAttemptAnswers_(e, callback) {
  try {
    if (!verifyStaff_(e.parameter.id, e.parameter.pass)) {
      return jsonpResponse_(callback, { success: false, error: 'auth_failed' });
    }

    var userId   = e.parameter.userId   || '';
    var task     = (e.parameter.task    || '').toLowerCase();
    var practice = String(e.parameter.practice || '');
    var setNum   = String(e.parameter.set      || '');
    if (!userId || !task || !practice) return jsonpResponse_(callback, { success:false, error:'missing_params' });

    // Map task key → setName prefix used on saveAnswers.
    // These prefixes mirror the calls scattered through the practice pages.
    var TASK_LABELS = {
      ctw:'CTW', rdl:'RDL', academic:'Academic',
      lcr:'LCR', conv:'Conv', announce:'Announce', talk:'Talk',
      sentence:'Sentence', email:'Email', discussion:'Discussion',
      lr:'LR', ti:'TI'
    };
    var label = TASK_LABELS[task];
    if (!label) return jsonpResponse_(callback, { success:false, error:'unknown_task' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // The live sheet is named ANSWERS. Fall back to ATTEMPTS in case a
    // future deployment renames it.
    var sheet = ss.getSheetByName('ANSWERS') || ss.getSheetByName('ATTEMPTS');
    if (!sheet) return jsonpResponse_(callback, { success:false, error:'no_sheet' });

    var data = sheet.getDataRange().getValues();
    if (!data.length) return jsonpResponse_(callback, { success:true, attempts:[] });

    var headers = data[0];
    var col = {};
    headers.forEach(function(h, i){ col[String(h).trim()] = i; });
    // Header tolerance — accept either "set" or "setName", "answers" or "answersJson", etc.
    function pick(/* ...names */){ for (var k = 0; k < arguments.length; k++) if (col[arguments[k]] !== undefined) return col[arguments[k]]; return -1; }
    var iUser    = pick('userId','user_id','id');
    var iSet     = pick('set','setName','set_name');
    var iAns     = pick('answers','answersJson','answers_json');
    var iScore   = pick('score');
    var iStatus  = pick('status'); // optional — ANSWERS sheet does not have this column
    // Timestamp column: live sheet has it in col A but the header cell may
    // be blank. Try named columns first, then fall back to column 0.
    var iTs = pick('timestamp','updatedAt','updated_at','time','date');
    if (iTs < 0) iTs = 0;

    if (iUser < 0 || iSet < 0) return jsonpResponse_(callback, { success:false, error:'sheet_missing_columns' });

    // The setName format from practice pages (verified):
    //   "<Label> P<N>"             — e.g. "Email P3", "Discussion P1"
    //   "<Label> P<N> Set <S>"     — CTW only
    // Build the matcher.
    var wantPrefix = label + ' P' + practice;
    var wantWithSet = setNum ? (label + ' P' + practice + ' Set ' + setNum) : null;

    var matches = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      if (String(row[iUser]) !== String(userId)) continue;
      var setName = String(row[iSet] || '').trim();
      var ok = false;
      if (wantWithSet && setName === wantWithSet) ok = true;
      else if (!wantWithSet && setName === wantPrefix) ok = true;
      // Loose fallback: starts-with prefix and the next char is " " or end-of-string,
      // so "Email P1" matches but "Email P10" doesn't accidentally match "Email P1".
      else if (!wantWithSet && setName.indexOf(wantPrefix) === 0 &&
               (setName.length === wantPrefix.length || setName.charAt(wantPrefix.length) === ' ')) {
        ok = true;
      }
      if (!ok) continue;

      var rawAnswers = iAns >= 0 ? row[iAns] : '';
      var parsed;
      try { parsed = (typeof rawAnswers === 'string' && rawAnswers) ? JSON.parse(rawAnswers) : rawAnswers; }
      catch (err) { parsed = String(rawAnswers); }

      // Timestamp column may hold a Date object — normalise to ISO string.
      var tsRaw = iTs >= 0 ? row[iTs] : '';
      var tsStr = '';
      if (tsRaw instanceof Date) {
        tsStr = tsRaw.toISOString();
      } else {
        tsStr = String(tsRaw || '');
      }
      matches.push({
        timestamp: tsStr,
        set:       setName,
        score:     iScore >= 0 ? row[iScore] : null,
        status:    iStatus>= 0 ? String(row[iStatus] || '') : '',
        answers:   parsed
      });
    }

    // Newest first (timestamp is ISO-ish so lexical compare works).
    matches.sort(function(a,b){ return (b.timestamp || '').localeCompare(a.timestamp || ''); });

    return jsonpResponse_(callback, { success:true, attempts: matches });
  } catch (err) {
    return jsonpResponse_(callback, { success:false, error: String(err && err.message ? err.message : err) });
  }
}
