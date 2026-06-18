/**
 * gas-chat-space-bridge.js
 *
 * Paste-in code for the TCK Reps GAS backend that mirrors inquiries
 * sent to reps-support@tckworkshop.co.jp (the public Google Group
 * created during the Phase B trademark migration) into the team's
 * "TOEFL Reps 問い合わせ" Google Chat Space.
 *
 * WHY THIS EXISTS
 *
 *   The legacy support address (TOEFL-Reps-tfpif@) was wired into a
 *   Workspace-admin-created Google Group whose member list directly
 *   includes the Chat Space's internal subscription identifier
 *   (space/AAQAgl3Gl50). When a customer emails the old address the
 *   message lands in the Chat Space natively.
 *
 *   The new address reps-support@ is a brand-new Google Group that
 *   *cannot* host the Chat Space directly — Google Groups' standard
 *   "Add member" UI rejects the `space/…` identifier, and the admin
 *   path that allows it is gated by admin.google.com access. To keep
 *   the Chat Space symmetric without requiring Workspace-admin help,
 *   this script polls Gmail for messages addressed to the new group
 *   and re-posts them into the Space via its incoming webhook URL.
 *
 *   Mail to the OLD address keeps flowing into the Space natively;
 *   only NEW-address mail uses this bridge. The `to:` filter in the
 *   Gmail search guarantees no duplicate posts.
 *
 * SETUP
 *
 *   1. Make sure the script-owning Gmail account is a member of the
 *      reps-support@tckworkshop.co.jp Google Group with delivery set
 *      to "メッセージごとにメール" (each-message). Without this the
 *      inbox never receives copies and the poller will see nothing.
 *
 *   2. Open the "TOEFL Reps 問い合わせ" Chat Space settings → アプリと統合
 *      → Webhook. Copy the full webhook URL (includes a `?key=…`
 *      secret).
 *
 *   3. In the GAS editor, ⚙ Settings → Script Properties → add:
 *        SPACE_WEBHOOK_URL = <the webhook URL from step 2>
 *      The secret stays in Script Properties so the URL never ends
 *      up in source control.
 *
 *   4. Paste the functions below at the bottom of any .gs file in
 *      the GAS project.
 *
 *   5. Run `testChatSpaceWebhook` once manually → authorize the
 *      `script.external_request` scope when prompted. A test card
 *      should appear in the Chat Space.
 *
 *   6. Run `pollNewGroupForChatSpace` once manually → authorize the
 *      Gmail scope. Verify the function reports "No new messages"
 *      (assuming nothing fresh in the inbox).
 *
 *   7. Create a time-based trigger:
 *      Triggers (clock icon) → Add Trigger →
 *        Function: pollNewGroupForChatSpace
 *        Event source: Time-driven
 *        Type: Minutes timer → Every 5 minutes
 *
 * IDEMPOTENCY
 *
 *   Processed threads are tagged with the Gmail label
 *   "tck/space-synced" so subsequent polls skip them. The label is
 *   created automatically on first run.
 *
 *   Only the *latest message* of each unsynced thread is forwarded;
 *   replies inside an existing customer thread will not auto-post.
 *   This is intentional — customer inquiries usually start a fresh
 *   thread, and the Chat Space is for first-touch awareness, not for
 *   full conversation mirroring.
 *
 * LOOP / DUPLICATE PREVENTION
 *
 *   The Gmail search uses `to:reps-support@tckworkshop.co.jp`, which
 *   only matches messages whose original `To:` header is the new
 *   address. Mail that arrived at the OLD address and was forwarded
 *   to the new Group via the OLD→NEW Group member bridge keeps its
 *   `to:toefl-reps-tfpif@…` header and does NOT match — so it is
 *   never re-posted by this script (the OLD path already delivers it
 *   to the Space natively).
 *
 * KNOWN LIMITATIONS
 *
 *   - 5-minute latency. The OLD-address direct path is instant; this
 *     bridge adds polling lag. Acceptable for first-touch awareness.
 *   - Plain-text body only, truncated to 2,000 characters.
 *   - No attachment forwarding.
 *   - If the webhook URL is rotated in the Chat Space settings, the
 *     Script Property must be updated to match — the script will
 *     otherwise log a 4xx response and skip until fixed.
 */

var SPACE_BRIDGE_LABEL = 'tck/space-synced';
var SPACE_BRIDGE_QUERY = 'to:reps-support@tckworkshop.co.jp newer_than:7d';
var SPACE_BRIDGE_BODY_MAX = 2000;

function pollNewGroupForChatSpace() {
  var webhookUrl = PropertiesService.getScriptProperties()
    .getProperty('SPACE_WEBHOOK_URL');
  if (!webhookUrl) {
    Logger.log('❌ SPACE_WEBHOOK_URL not set in Script Properties');
    return 0;
  }

  var label = GmailApp.getUserLabelByName(SPACE_BRIDGE_LABEL)
    || GmailApp.createLabel(SPACE_BRIDGE_LABEL);

  var query = SPACE_BRIDGE_QUERY + ' -label:"' + SPACE_BRIDGE_LABEL + '"';
  var threads = GmailApp.search(query, 0, 20);

  if (threads.length === 0) {
    Logger.log('No new messages to forward to Chat Space');
    return 0;
  }

  var posted = 0;
  threads.forEach(function (thread) {
    var messages = thread.getMessages();
    var msg = messages[messages.length - 1];

    var from    = msg.getFrom();
    var subject = msg.getSubject();
    var body    = msg.getPlainBody() || '';
    if (body.length > SPACE_BRIDGE_BODY_MAX) {
      body = body.substring(0, SPACE_BRIDGE_BODY_MAX) + '\n…(truncated)';
    }

    var text = '📨 *新規お問い合わせ (reps-support@)*\n\n' +
               '*From:* ' + from + '\n' +
               '*Subject:* ' + subject + '\n\n' +
               body;

    try {
      var resp = UrlFetchApp.fetch(webhookUrl, {
        method: 'post',
        contentType: 'application/json; charset=UTF-8',
        payload: JSON.stringify({ text: text }),
        muteHttpExceptions: true
      });
      if (resp.getResponseCode() === 200) {
        thread.addLabel(label);
        posted++;
        Logger.log('✓ Posted thread ' + thread.getId() +
                   ' (' + subject + ') to Chat Space');
      } else {
        Logger.log('⚠ Webhook returned ' + resp.getResponseCode() +
                   ': ' + resp.getContentText());
      }
    } catch (err) {
      Logger.log('❌ Post error for thread ' + thread.getId() + ': ' + err);
    }
  });

  Logger.log('pollNewGroupForChatSpace: posted ' + posted + ' message(s)');
  return posted;
}

/* Manual helper — sends a single test card to the Chat Space using the
   configured webhook URL. Use to confirm Script Properties + outbound
   network access are working before relying on the polling loop. */
function testChatSpaceWebhook() {
  var webhookUrl = PropertiesService.getScriptProperties()
    .getProperty('SPACE_WEBHOOK_URL');
  if (!webhookUrl) {
    Logger.log('❌ SPACE_WEBHOOK_URL not set');
    return;
  }
  var resp = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify({
      text: '🧪 Webhook テスト送信 — ' + new Date().toISOString()
    }),
    muteHttpExceptions: true
  });
  Logger.log('HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText());
}
