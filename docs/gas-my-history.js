/**
 * gas-my-history.js
 *
 * Student-side BULK endpoint: returns a COMPACT list of every attempt the
 * logged-in user has ever saved — across all tasks and practices — in a
 * single JSONP call. This is what lets the menus, my-score.html, and the
 * predicted-score view show a learner's full history on ANY browser or
 * device, because the source of truth is the server (ANSWERS sheet keyed
 * by userId), not per-browser localStorage / sessionStorage.
 *
 * Why a new endpoint instead of getMyAnswers?
 *   getMyAnswers returns the FULL answer bodies for ONE (task, practice).
 *   For menu hydration we need EVERY attempt at once, but only the light
 *   fields needed to draw a badge: set label, score, total, timestamp.
 *   Returning compact rows keeps the JSONP payload small even for users
 *   with hundreds of attempts.
 *
 * Security: uses verifyUser_ (NOT verifyStaff_) and forces the row filter
 * to the verified user's own userId — callers can never read someone
 * else's history.
 *
 * ----------------------------------------------------------------------
 * PASTE FLOW (one-time, ~2 min):
 *   1. Add ONE new line to your existing doGet() if-chain (just below the
 *      getMyAnswers line is the natural spot):
 *        if (action === 'getMyHistory') return handleGetMyHistory_(e, callback);
 *   2. Paste the function below at the bottom of the GAS file.
 *   3. Save (Ctrl+S) → Deploy → Manage deployments → 鉛筆 → New version → Deploy.
 *      (The API_URL / deployment id does NOT change, so js/api.js needs no
 *       edit — it already calls action=getMyHistory.)
 *
 * Until this is deployed the frontend degrades gracefully: history-sync.js
 * treats a missing/!success response as "no server data" and simply keeps
 * showing whatever the local cache has. Nothing breaks.
 * ----------------------------------------------------------------------
 */

function handleGetMyHistory_(e, callback) {
  try {
    var u = verifyUser_(e.parameter.id, e.parameter.pass);
    if (!u) return jsonpResponse_(callback, { success: false, error: 'auth_failed' });

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ANSWERS');
    if (!sheet) return jsonpResponse_(callback, { success: true, attempts: [] });
    var data = sheet.getDataRange().getValues();
    if (!data.length) return jsonpResponse_(callback, { success: true, attempts: [] });

    // Column layout (must match handleSaveAnswers_ / handleGetMyAnswers_):
    //   0 timestamp | 1 userId | 2 userName | 3 set | 4 answers(JSON) | 5 score | 6 total(optional)
    var attempts = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      if (String(row[1]) !== String(u.userId)) continue;  // own rows only

      var setName = String(row[3] || '').trim();
      if (!setName) continue;

      // Derive total (question count). The dedicated `total` column (index 9)
      // is unreliable — js/api.js saveAnswers does not send &total, so it is
      // 0 for every row. So derive from the answers ARRAY length (every
      // auto-graded task saves answers as an array; CTW saves `ua`, the
      // others save an array of length=total). Free-response tasks
      // (Email/Discussion/LR/TI) save an object → not an array → total 0.
      // Fall back to the total column only if it ever carries a real value.
      //
      // NOTE: do NOT read row[6] for total — that column is harder_correct.
      var total = 0;
      try {
        var parsed = (typeof row[4] === 'string' && row[4]) ? JSON.parse(row[4]) : row[4];
        if (Array.isArray(parsed)) total = parsed.length;
      } catch (err) { total = 0; }
      if (!total && row.length > 9 && row[9] !== '' && row[9] !== null && !isNaN(Number(row[9]))) {
        total = Number(row[9]);
      }

      var scoreRaw = row[5];
      var score = (scoreRaw === '' || scoreRaw === null || scoreRaw === undefined)
        ? null : Number(scoreRaw);

      // Count how many answers the learner actually ENTERED (non-blank), so the
      // client can reflect a graded attempt only when they genuinely engaged:
      // a blank click-through ("入って出ただけ" — all '', all 0, or the reconcile
      // [0,0,…] placeholder) has answered=0 and is NOT counted; a real attempt
      // that scored 0 (all wrong / timed out WITH answers) has answered>0 and IS
      // counted. Treats '', 0 and '0' as "not answered" (matches the [0,0,…]
      // blank convention). Free-response (object answers) → answered stays 0,
      // which the client ignores (it keeps unscored submissions regardless).
      var answered = 0;
      try {
        var pans = (typeof row[4] === 'string' && row[4]) ? JSON.parse(row[4]) : row[4];
        if (Array.isArray(pans)) {
          for (var _ai = 0; _ai < pans.length; _ai++) {
            var _v = pans[_ai];
            if (_v && typeof _v === 'object' && 'selected' in _v) _v = _v.selected;
            if (!(_v === '' || _v === null || _v === undefined || _v === 0 || _v === '0')) answered++;
          }
        }
      } catch (e2) {}

      var tsRaw = row[0];
      var tsStr = (tsRaw instanceof Date) ? tsRaw.toISOString() : String(tsRaw || '');

      attempts.push({
        set: setName,        // e.g. "CTW P1 Set 1", "LCR P3", "Discussion P2"
        score: score,        // raw correct count (null for unscored)
        total: total,        // question count (0 for free-response)
        answered: answered,  // non-blank answers entered (0 = blank click-through → not reflected)
        timestamp: tsStr
      });
    }

    // Oldest → newest so the client can pick first vs latest deterministically.
    attempts.sort(function (a, b) { return (a.timestamp || '').localeCompare(b.timestamp || ''); });
    return jsonpResponse_(callback, { success: true, attempts: attempts });
  } catch (err) {
    return jsonpResponse_(callback, { success: false, error: String(err && err.message ? err.message : err) });
  }
}
