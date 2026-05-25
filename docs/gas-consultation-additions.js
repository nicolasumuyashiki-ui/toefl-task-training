/**
 * gas-consultation-additions.js
 *
 * Paste-in code for the existing TCK Reps GAS backend to add the
 * server-side consultation cooldown sync, backed by the CONSULTATION_BOOKINGS
 * sheet (populated by Zapier from eeasy webhook events).
 *
 * INSTALLATION
 *
 *   1. Add this routing line to your existing doGet() switch (next to the
 *      other "if (action === '...')" lines):
 *
 *        if (action === 'getConsultationStatus') return handleGetConsultationStatus_(e, callback);
 *
 *   2. Paste the function below at the bottom of any .gs file in the project.
 *
 *   3. Save (Ctrl+S) → Deploy → Manage deployments → New version → Deploy.
 *      The js/api.js's API_URL stays valid.
 *
 * SHEET FORMAT — CONSULTATION_BOOKINGS (populated by Zapier)
 *
 *   A: timestamp     — Zapier received-at, e.g. 2026-05-05T15:30:00Z or yyyy/MM/dd HH:mm:ss
 *   B: userId        — TCK userId (preferred match key)
 *   C: email         — booker email (fallback match key)
 *   D: userName      — display name
 *   E: sessionDate   — booked session date, e.g. 2026-05-15  (YYYY-MM-DD or YYYY/MM/DD)
 *   F: sessionTime   — booked session time, e.g. 14:00       (optional, just stored)
 *   G: status        — "active" or "cancelled"
 *
 * MATCH RULE
 *
 *   The handler matches by userId first, then by email (case-insensitive)
 *   if userId is empty in the row. Only "active" rows count toward the
 *   cooldown — "cancelled" rows are ignored.
 */


// =============================================================
// handleGetConsultationStatus_ — returns the user's consultation status
// =============================================================
//
// Query params:
//   id   — TCK userId
//   pass — TCK password (verifies via verifyUser_)
//
// Returns (jsonp):
//   { success: true, locked: true,  nextBookable: "2026-06-01",
//     lastSession: { date: "2026-05-15", time: "14:00", status: "active" } }
//   { success: true, locked: false }                     ← never booked, or last booking is cancelled, or already past month boundary
//   { success: false, error: 'auth_failed' }
//
// =============================================================
function handleGetConsultationStatus_(e, callback) {
  var u = verifyUser_(e.parameter.id, e.parameter.pass);
  if (!u) return jsonpResponse_(callback, { success: false, error: 'auth_failed' });

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONSULTATION_BOOKINGS');
  if (!sh) {
    // Sheet hasn't been created yet (no bookings ever) — user is unlocked.
    return jsonpResponse_(callback, { success: true, locked: false });
  }

  var d = sh.getDataRange().getValues();
  if (d.length < 2) {
    return jsonpResponse_(callback, { success: true, locked: false });
  }

  var emailLower = String(u.email || '').toLowerCase();
  var todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  // Walk all rows, collect this user's ACTIVE bookings, keep the latest by sessionDate.
  // Match by userId first; fall back to email if userId column is empty.
  var latest = null;
  for (var i = 1; i < d.length; i++) {
    var rowUserId    = String(d[i][1] || '').trim();
    var rowEmail     = String(d[i][2] || '').trim().toLowerCase();
    var rowSessionDt = d[i][4];
    var rowStatus    = String(d[i][6] || 'active').trim().toLowerCase();

    var matches =
      (rowUserId && rowUserId === String(u.userId)) ||
      (!rowUserId && rowEmail && rowEmail === emailLower);
    if (!matches) continue;
    if (rowStatus !== 'active') continue;
    if (!rowSessionDt) continue;

    var sessionDate = parseSessionDate_(rowSessionDt);
    if (!sessionDate) continue;

    if (!latest || sessionDate.getTime() > latest.sessionDate.getTime()) {
      latest = {
        sessionDate: sessionDate,
        sessionTime: String(d[i][5] || ''),
        status:      rowStatus
      };
    }
  }

  if (!latest) {
    return jsonpResponse_(callback, { success: true, locked: false });
  }

  // Cooldown ends on the 1st of the month following the session date.
  var nextBookable = new Date(latest.sessionDate.getFullYear(),
                              latest.sessionDate.getMonth() + 1, 1);

  if (nextBookable.getTime() <= todayMidnight.getTime()) {
    // Past the cooldown boundary — unlocked.
    return jsonpResponse_(callback, { success: true, locked: false });
  }

  return jsonpResponse_(callback, {
    success: true,
    locked: true,
    nextBookable: fmtYmd_(nextBookable),
    lastSession: {
      date:   fmtYmd_(latest.sessionDate),
      time:   latest.sessionTime,
      status: latest.status
    }
  });
}


// =============================================================
// parseSessionDate_ — accepts Date object, YYYY-MM-DD, YYYY/MM/DD, ISO 8601
// =============================================================
function parseSessionDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v).trim();
  // Try ISO/YYYY-MM-DD/YYYY/MM/DD
  var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) {
    var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  // Fallback: let Date parse it
  var d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}


function fmtYmd_(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1);
  var day = String(d.getDate());
  if (m.length === 1) m = '0' + m;
  if (day.length === 1) day = '0' + day;
  return y + '-' + m + '-' + day;
}
