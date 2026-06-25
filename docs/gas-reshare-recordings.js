/**
 * gas-reshare-recordings.js
 *
 * RECOVERY + HARDENING for Speaking recordings that show a row (date /
 * duration) in the admin Recordings tab but NO playable player.
 *
 * Why this happens: handleUploadRecording_ creates the Drive file, then calls
 * file.setSharing(ANYONE_WITH_LINK, VIEW) inside a try/catch that swallows any
 * error ("non-fatal"). The admin player is a Drive /preview iframe, which only
 * renders when the file is publicly viewable. So if setSharing failed at upload
 * time (Drive rate-limit / transient / policy), the AUDIO IS SAFE in Drive but
 * the inline player can't show it. This script re-applies public sharing to the
 * already-uploaded files, restoring playback. The audio is NOT re-uploaded and
 * nothing is deleted — it only fixes the share setting.
 *
 * ----------------------------------------------------------------------
 * PASTE FLOW (one-time recovery):
 *   1. Paste reshareAllRecordings() (+ helper) below at the bottom of the file.
 *   2. Run reshareAllRecordings()  (start with dry-run to preview, then live).
 *        reshareAllRecordings()              // DRY RUN — logs what it would do
 *        reshareAllRecordings({dryRun:false})// LIVE   — actually re-shares
 *   3. Reload the admin Recordings tab — the missing players should appear.
 *
 * HARDENING (so it stops happening): replace the setSharing line in
 *   handleUploadRecording_ with the retried version in BLOCK 2 below.
 * ----------------------------------------------------------------------
 */

// =============================================================
// BLOCK 1 — recovery: re-share every recording's Drive file
// =============================================================
function reshareAllRecordings(opts) {
  opts = opts || {};
  var DRY_RUN = opts.dryRun !== false;   // default: dry run (no changes)
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var total = 0, fixed = 0, alreadyOk = 0, missing = 0, failed = 0;

  ['RECORDINGS', 'RECORDINGS_PT'].forEach(function (sheetName) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    var d = sh.getDataRange().getValues();
    // col 8 (index) = file_id  (timestamp,userId,userName,task,practice_set,
    //                           question_index,duration_sec,attempt_number,file_id,...)
    for (var r = 1; r < d.length; r++) {
      var fileId = String(d[r][8] || '').trim();
      if (!fileId) { missing++; continue; }
      total++;
      try {
        var file = DriveApp.getFileById(fileId);
        var access = file.getSharingAccess();
        if (access === DriveApp.Access.ANYONE_WITH_LINK || access === DriveApp.Access.ANYONE) {
          alreadyOk++;
          continue;
        }
        if (DRY_RUN) {
          Logger.log('[would re-share] ' + sheetName + ' row ' + (r + 1) + ' file=' + fileId + ' (' + file.getName() + ')');
          fixed++;
        } else {
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          fixed++;
        }
      } catch (e) {
        // File truly gone / inaccessible — this row's audio is unrecoverable.
        Logger.log('[MISSING/ERROR] ' + sheetName + ' row ' + (r + 1) + ' file=' + fileId + ' : ' + e);
        failed++;
      }
    }
  });

  var msg = 'reshareAllRecordings ' + (DRY_RUN ? '(DRY RUN) ' : '(LIVE) ') +
            '— rows_with_file=' + total + ', re-shared=' + fixed +
            ', already_public=' + alreadyOk + ', no_file_id=' + missing +
            ', missing_in_drive=' + failed;
  Logger.log(msg);
  if (DRY_RUN) Logger.log('↑ DRY RUN. To actually apply: reshareAllRecordings({dryRun:false})');
  return msg;
}

// =============================================================
// BLOCK 2 — hardening: retry setSharing in handleUploadRecording_
// Replace the existing block:
//     try {
//       file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
//     } catch (shErr) {
//       Logger.log('setSharing failed (non-fatal): ' + shErr);
//     }
// ...with this retried version so a transient share failure self-heals:
// =============================================================
//   var _shared = false;
//   for (var _a = 0; _a < 3 && !_shared; _a++) {
//     try {
//       file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
//       _shared = true;
//     } catch (shErr) {
//       Logger.log('setSharing attempt ' + (_a + 1) + ' failed: ' + shErr);
//       Utilities.sleep(400 * (_a + 1));
//     }
//   }
//   // Even if sharing didn't stick now, reshareAllRecordings() can fix it later;
//   // the audio file + RECORDINGS row are already saved regardless.
