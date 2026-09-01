/**
 * gas-consultation-gmail-poller.js
 *
 * Paste-in code for the TCK Reps GAS backend that auto-populates the
 * CONSULTATION_BOOKINGS sheet from eeasy booking-confirmation emails.
 *
 * Original design assumed Zapier would do this. In practice no Zap was
 * ever set up, so bookings never landed in the sheet and the cooldown
 * gate on consultation.html was effectively inert. This poller replaces
 * the missing Zap with a 100% in-GAS solution — no external service.
 *
 * SETUP
 *
 *   1. Paste the functions below at the bottom of any .gs file in the
 *      GAS project.
 *
 *   2. Make sure the script-owning Gmail account RECEIVES the eeasy
 *      booking emails for the TCK Reps page. Two options:
 *
 *      (a) In eeasy admin, add the script-owner's address to the
 *          notification recipients of the "TOEFL Reps 面談用" /
 *          "TCK Reps 面談用" booking page.
 *
 *      (b) On an existing recipient mailbox (e.g. info@tckworkshop.co.jp),
 *          add a Gmail filter that forwards messages matching
 *              from:info@tckworkshop.co.jp
 *              subject:("予約受付：面談（TCK Reps" OR "予約受付：面談（TOEFL Reps")
 *          to the script-owner's inbox.
 *
 *   3. In the GAS editor, run `pollConsultationBookings` once manually
 *      → authorize Gmail + Sheets scope when prompted.
 *
 *   4. Create a time-based trigger:
 *      Triggers (clock icon) → Add Trigger →
 *        Function: pollConsultationBookings
 *        Event source: Time-driven
 *        Type: Minutes timer → Every 10 minutes
 *
 * IDEMPOTENCY
 *
 *   Processed messages are tagged with the Gmail label
 *   "tck/consultation-synced" so subsequent polls skip them. As a
 *   second defense, sheet inserts are dedup'd on (email,
 *   sessionDate, sessionTime).
 *
 * NOT HANDLED (future work)
 *
 *   - Cancellation emails. If a user cancels via eeasy, eeasy sends a
 *     separate "予約取消" mail; this poller currently ignores those.
 *     For now, mark cancelled rows manually in column G (status =
 *     "cancelled"). handleGetConsultationStatus_ already ignores
 *     anything that isn't "active".
 */

var CONSULTATION_SHEET = 'CONSULTATION_BOOKINGS';
var CONSULTATION_LABEL = 'tck/consultation-synced';

// Subject lines we sync. Order matters only insofar as the search query
// is OR'd; both old and new brand spellings are accepted because past
// emails use "TOEFL Reps" and future ones will use "TCK Reps".
var CONSULTATION_SUBJECT_NEEDLES = [
  '予約受付：面談（TCK Reps',
  '予約受付：面談（TOEFL Reps'
];

function pollConsultationBookings() {
  var label = GmailApp.getUserLabelByName(CONSULTATION_LABEL)
    || GmailApp.createLabel(CONSULTATION_LABEL);

  // Build an OR query over the subject needles, excluding anything
  // already tagged. -label:"..." is the supported Gmail search exclusion.
  var subjectQuery = CONSULTATION_SUBJECT_NEEDLES
    .map(function(s){ return 'subject:"' + s + '"'; })
    .join(' OR ');
  var query = '(' + subjectQuery + ') -label:"' + CONSULTATION_LABEL + '"';

  var threads = GmailApp.search(query, 0, 50);
  if (threads.length === 0) {
    Logger.log('pollConsultationBookings: nothing new');
    return 0;
  }

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONSULTATION_SHEET);
  if (!sh) {
    sh = SpreadsheetApp.getActiveSpreadsheet().insertSheet(CONSULTATION_SHEET);
    sh.appendRow(['timestamp','userId','email','userName','sessionDate','sessionTime','status']);
  }

  // Build (email|date|time) dedup index from existing rows.
  var existingKeys = {};
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var k = String(data[i][2]).toLowerCase().trim()
          + '|' + String(data[i][4]).trim()
          + '|' + String(data[i][5]).trim();
    existingKeys[k] = true;
  }

  var inserted = 0;
  threads.forEach(function(thread){
    thread.getMessages().forEach(function(msg){
      var parsed = parseEeasyBookingEmail_(msg);
      if (!parsed) return;
      var key = parsed.email.toLowerCase() + '|' + parsed.sessionDate + '|' + parsed.sessionTime;
      if (existingKeys[key]) return;

      sh.appendRow([
        parsed.timestamp,
        '',  // userId — left blank; handleGetConsultationStatus_ falls back to email match
        parsed.email,
        parsed.userName,
        parsed.sessionDate,
        parsed.sessionTime,
        'active'
      ]);
      sh.getRange(sh.getLastRow(), 1).setNumberFormat(DATETIME_FMT);
      existingKeys[key] = true;
      inserted++;
    });
    thread.addLabel(label);
  });

  Logger.log('pollConsultationBookings: scanned ' + threads.length + ' threads, inserted ' + inserted);
  return inserted;
}

/**
 * Parse one eeasy "予約受付" plaintext email body into the shape
 * needed by CONSULTATION_BOOKINGS. Returns null if any required field
 * is missing.
 *
 * eeasy bodies are formatted with full-width colons and padded
 * full-width spaces, roughly:
 *
 *   （※ 実在のお客さまの氏名・メールは書かないこと。このリポジトリは public で
 *      docs/ は GitHub Pages がそのまま配信する。以下はダミー。）
 *
 *   　件名：　　　　　　面談（TOEFL Reps）：山田 花子
 *   　日程：　　　　　　06/16（火） 18:00～18:45(日本時間(UTC+9))
 *   　氏名：　　　　　　山田 花子
 *   　メールアドレス：　hanako.yamada@example.com
 */
function parseEeasyBookingEmail_(msg) {
  var body = msg.getPlainBody();
  if (!body) return null;

  var name     = extractEeasyField_(body, '氏名');
  var email    = extractEeasyField_(body, 'メールアドレス');
  var schedule = extractEeasyField_(body, '日程');
  if (!name || !email || !schedule) return null;

  // Schedule looks like "06/16（火） 18:00～18:45(日本時間(UTC+9))".
  var dateMatch = schedule.match(/(\d{1,2})\/(\d{1,2})/);
  var timeMatch = schedule.match(/(\d{1,2}:\d{2})\s*[~〜～]/);
  if (!dateMatch || !timeMatch) return null;

  // eeasy strips the year from the schedule line; we infer it from
  // the email received-at (eeasy sends the confirmation immediately).
  // If the inferred date would land in the past (i.e. booking for
  // early next year, confirmed in late December), bump the year.
  var receivedAt = msg.getDate();
  var year  = receivedAt.getFullYear();
  var month = parseInt(dateMatch[1], 10);
  var day   = parseInt(dateMatch[2], 10);
  var sessionDate = new Date(year, month - 1, day);
  if (sessionDate.getTime() < receivedAt.getTime() - 24 * 60 * 60 * 1000) {
    sessionDate = new Date(year + 1, month - 1, day);
  }

  return {
    timestamp:   receivedAt,
    userName:    name,
    email:       email,
    sessionDate: Utilities.formatDate(sessionDate, 'Asia/Tokyo', 'yyyy-MM-dd'),
    sessionTime: timeMatch[1]
  };
}

/**
 * Extract one labeled field's value from an eeasy plaintext body.
 * Handles full-width colons (：), full-width spaces (　), and trims.
 * Returns '' if the label isn't found.
 */
function extractEeasyField_(body, label) {
  var re = new RegExp(label + '[：:]([^\\r\\n]+)');
  var m = body.match(re);
  if (!m) return '';
  return m[1].replace(/^[\s　]+|[\s　]+$/g, '');
}

/**
 * One-shot backfill — run manually if there are historical eeasy
 * booking emails in the inbox that pre-date the trigger. Scans the
 * full inbox (no label filter), parses, dedupes, and tags processed
 * messages so the regular poller won't double-insert them.
 *
 * Safe to re-run.
 */
function backfillConsultationBookingsFromGmail() {
  var label = GmailApp.getUserLabelByName(CONSULTATION_LABEL)
    || GmailApp.createLabel(CONSULTATION_LABEL);

  var subjectQuery = CONSULTATION_SUBJECT_NEEDLES
    .map(function(s){ return 'subject:"' + s + '"'; })
    .join(' OR ');
  var threads = GmailApp.search('(' + subjectQuery + ')', 0, 500);
  Logger.log('backfill: found ' + threads.length + ' threads');

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONSULTATION_SHEET);
  if (!sh) {
    sh = SpreadsheetApp.getActiveSpreadsheet().insertSheet(CONSULTATION_SHEET);
    sh.appendRow(['timestamp','userId','email','userName','sessionDate','sessionTime','status']);
  }

  var existingKeys = {};
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var k = String(data[i][2]).toLowerCase().trim()
          + '|' + String(data[i][4]).trim()
          + '|' + String(data[i][5]).trim();
    existingKeys[k] = true;
  }

  var inserted = 0;
  threads.forEach(function(thread){
    thread.getMessages().forEach(function(msg){
      var parsed = parseEeasyBookingEmail_(msg);
      if (!parsed) return;
      var key = parsed.email.toLowerCase() + '|' + parsed.sessionDate + '|' + parsed.sessionTime;
      if (existingKeys[key]) return;
      sh.appendRow([
        parsed.timestamp, '', parsed.email, parsed.userName,
        parsed.sessionDate, parsed.sessionTime, 'active'
      ]);
      sh.getRange(sh.getLastRow(), 1).setNumberFormat(DATETIME_FMT);
      existingKeys[key] = true;
      inserted++;
    });
    thread.addLabel(label);
  });

  Logger.log('backfill: inserted ' + inserted + ' row(s)');
  return inserted;
}
