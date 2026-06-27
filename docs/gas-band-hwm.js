/**
 * gas-band-hwm.js — CROSS-DEVICE BAND HIGH-WATER-MARK (server side)
 *
 * WHY
 *   The predicted band on my-score is recomputed from attempt data on every
 *   open. To stop it ever "resetting", the client keeps a per-device
 *   high-water-mark (the highest band/total ever shown) and never displays
 *   lower. THIS file makes that high-water-mark follow the ACCOUNT: it is
 *   stored on the server and merged (MAX of each field) so a brand-new device,
 *   a private window, or a partial sync still shows the learner's true best —
 *   the score becomes identical and stable on every device.
 *
 *   It ONLY EVER RAISES each field. It never lowers a score, and it stores no
 *   raw answers — just the small computed band snapshot.
 *
 * CONTRACT (matches js/api.js getBands / saveBands)
 *   GET  ?action=getBands&id=<userId>&pass=<pass>
 *        → { success:true, bands:{ sec_reading:{scaled,pct,attempts,correctTotal},
 *                                  sec_listening:{...}, sec_writing:{...}, total:<num> } }
 *   GET  ?action=saveBands&id=<userId>&pass=<pass>&bands=<JSON>
 *        → { success:true }   (server MERGES by max into the stored row)
 *
 * INSTALL
 *   1. Paste the two handlers below into the GAS project.
 *   2. In doGet(...) routing add:
 *        if (action === 'getBands')  return handleGetBands_(e, callback);
 *        if (action === 'saveBands') return handleSaveBands_(e, callback);
 *      (If saveBands may arrive via POST too, route it in doPost as well.)
 *   3. Save → Deploy → Manage deployments → New version → Deploy.
 *   Until deployed, the client just falls back to the per-device mark (safe).
 */

function _bandsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('BANDS');
  if (!sh) {
    sh = ss.insertSheet('BANDS');
    sh.appendRow(['user_id', 'bands_json', 'updated_at']);
  }
  return sh;
}

// Merge b INTO a, keeping the MAX of each field. Returns the merged object.
function _mergeBands_(a, b) {
  a = a || {}; b = b || {};
  ['sec_reading', 'sec_listening', 'sec_writing'].forEach(function (k) {
    var av = a[k], bv = b[k];
    if (!bv || typeof bv !== 'object') return;
    if (!av || typeof av !== 'object') { a[k] = bv; return; }
    // keep whichever has the higher scaled band (with its metadata)
    var as = (typeof av.scaled === 'number') ? av.scaled : -1;
    var bs = (typeof bv.scaled === 'number') ? bv.scaled : -1;
    var keep = (bs > as) ? { scaled: bv.scaled, pct: bv.pct, correctTotal: bv.correctTotal }
                         : { scaled: av.scaled, pct: av.pct, correctTotal: av.correctTotal };
    keep.attempts = Math.max(Number(av.attempts) || 0, Number(bv.attempts) || 0);
    a[k] = keep;
  });
  var at = Number(a.total), bt = Number(b.total);
  if (!isNaN(bt)) a.total = isNaN(at) ? bt : Math.max(at, bt);
  return a;
}

function handleGetBands_(e, callback) {
  var u = verifyUser_(e.parameter.id, e.parameter.pass);
  if (!u) return jsonpResponse_(callback, { success: false, error: 'auth_failed' });
  var sh = _bandsSheet_();
  var d = sh.getDataRange().getValues();
  for (var r = 1; r < d.length; r++) {
    if (String(d[r][0]) === String(u.userId)) {
      var bands = {};
      try { bands = JSON.parse(d[r][1] || '{}'); } catch (err) { bands = {}; }
      return jsonpResponse_(callback, { success: true, bands: bands });
    }
  }
  return jsonpResponse_(callback, { success: true, bands: {} });
}

function handleSaveBands_(e, callback) {
  var u = verifyUser_(e.parameter.id, e.parameter.pass);
  if (!u) return jsonpResponse_(callback, { success: false, error: 'auth_failed' });
  var incoming = {};
  try { incoming = JSON.parse(e.parameter.bands || '{}'); } catch (err) { incoming = {}; }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (e2) {}
  try {
    var sh = _bandsSheet_();
    var d = sh.getDataRange().getValues();
    var now = new Date().toISOString();
    for (var r = 1; r < d.length; r++) {
      if (String(d[r][0]) === String(u.userId)) {
        var cur = {};
        try { cur = JSON.parse(d[r][1] || '{}'); } catch (err) { cur = {}; }
        var merged = _mergeBands_(cur, incoming);     // only ever raises
        sh.getRange(r + 1, 2).setValue(JSON.stringify(merged));
        sh.getRange(r + 1, 3).setValue(now);
        return jsonpResponse_(callback, { success: true });
      }
    }
    sh.appendRow([u.userId, JSON.stringify(_mergeBands_({}, incoming)), now]);
    return jsonpResponse_(callback, { success: true });
  } finally {
    try { lock.releaseLock(); } catch (e3) {}
  }
}
