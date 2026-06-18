/**
 * gas-coaching-additions.js
 *
 * Paste-in code for the existing TCK Reps GAS backend to add the
 * Private Coaching auto-reply flow. Drop these functions into the
 * same Apps Script file that already contains handleLogin_, handleRegister_,
 * etc. — then add ONE new case to the doGet() switch statement.
 *
 * After pasting:
 *   1. In Apps Script editor, save the file (Ctrl+S).
 *   2. Click "Deploy" → "Manage deployments" → pencil icon on the active
 *      deployment → "New version" → Deploy.
 *      (Keep the same URL — the existing js/api.js's API_URL stays valid.)
 *   3. Test by hitting the URL directly:
 *      https://script.google.com/macros/s/.../exec?action=requestCoaching
 *        &userId=test&userName=Test&email=YOUR_EMAIL@example.com
 *        &skills=Reading,Speaking&callback=cb
 *      You should receive two emails (to YOUR_EMAIL and to the instructor)
 *      and see a new row in the COACHING_REQUESTS sheet.
 */

// =============================================================
// STEP 1: add this case to your existing doGet() switch statement.
//
// Look for the function that looks like:
//
//   function doGet(e) {
//     var action = e.parameter.action;
//     var result;
//     switch (action) {
//       case 'login':    result = handleLogin_(e); break;
//       case 'register': result = handleRegister_(e); break;
//       ...
//     }
//     return ContentService.createTextOutput(...).setMimeType(...);
//   }
//
// Add this single line inside the switch:
//
//   case 'requestCoaching': result = handleRequestCoaching_(e); break;
// =============================================================


// =============================================================
// STEP 2: paste the three functions below at the bottom of the file.
// =============================================================

/* ============================================================
   handleRequestCoaching_ : Private Coaching auto-reply + instructor notification
   ============================================================
   Called from private-coaching.html when the user submits the skill
   selection form. Records the request in the COACHING_REQUESTS sheet
   and sends two emails:
     1. Confirmation to the user (thanks-page text)
     2. Notification to the instructor

   Query params:
     userId   — TCK user identifier (sessionStorage.kickstart_user.userId)
     userName — user's display name
     email    — user's email address
     skills   — comma-separated skill list (e.g. "Reading,Speaking")
     lang     — "jp" or "en" (defaults to "jp")

   Returns:
     { ok: true, ts: <ISO timestamp> }   on success
     { ok: false, error: <msg> }         on failure
   ============================================================ */
function handleRequestCoaching_(e) {
  try {
    var userId   = e.parameter.userId   || '';
    var userName = e.parameter.userName || '';
    var email    = e.parameter.email    || '';
    var skills   = e.parameter.skills   || '';
    var lang     = (e.parameter.lang === 'en') ? 'en' : 'jp';

    if (!email)  return { ok: false, error: 'email_required' };
    if (!skills) return { ok: false, error: 'skills_required' };

    // Append to COACHING_REQUESTS sheet (auto-create with header on first use)
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = 'COACHING_REQUESTS';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow([
        'timestamp', 'userId', 'userName', 'email',
        'skills', 'lang', 'status'
      ]);
      // Freeze header row + bold
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    }

    var ts = new Date();
    sheet.appendRow([ts, userId, userName, email, skills, lang, 'pending']);

    // Send confirmation to user
    sendCoachingConfirmationToUser_(email, userName, skills, lang);

    // Send notification to instructor
    sendCoachingNotificationToInstructor_(userId, userName, email, skills, ts);

    return { ok: true, ts: ts.toISOString() };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}


/* User-facing confirmation email — bilingual based on `lang` param. */
function sendCoachingConfirmationToUser_(email, userName, skills, lang) {
  var skillsList = skills.split(',').map(function(s){ return s.trim(); });
  var skillsBullet = skillsList.map(function(s){ return '・' + s; }).join('\n');
  var skillsPlus   = skillsList.join(' + ');

  var subject, body;
  if (lang === 'en') {
    subject = 'Thank you for your Private Coaching request — TCK Workshop';
    body =
      'Hi ' + (userName || 'there') + ',\n\n' +
      'Thank you for requesting a TCK Reps Private Coaching session.\n\n' +
      '── Your request ──\n' +
      'Skills: ' + skillsPlus + '\n\n' +
      '── Next steps ──\n' +
      '1. BOOK YOUR SESSION (60 min)\n' +
      '   Pick an available slot on the booking page below. The Google Meet\n' +
      '   URL is auto-issued at booking and arrives in eeasy\'s confirmation\n' +
      '   email.\n\n' +
      '   ▶ Booking page:\n' +
      '   https://tckwshop.eeasy.jp/nicolas.umuyashiki/reps\n\n' +
      '2. PAY VIA THE LINK BELOW (¥11,000 incl. JCT for Japan / ¥10,000\n' +
      '   tax-exempt for overseas)\n' +
      '   Stripe auto-detects your country from the billing address you\n' +
      '   enter and adjusts the tax accordingly. Receipt PDF is sent\n' +
      '   automatically after payment.\n\n' +
      '   ▶ Payment link:\n' +
      '   https://buy.stripe.com/cNi00j7q3eHibVW7Vj1kA3x\n\n' +
      '   ⚠ If payment is not completed by 23:59 JST the day before the\n' +
      '   session, the booking is treated as canceled and the slot is\n' +
      '   released automatically.\n\n' +
      '── About the session ──\n' +
      'The 60-minute session focuses entirely on the skills you selected:\n' +
      'explanation, feedback, and hands-on practice. Held on Google Meet.\n\n' +
      'Questions? Reply to this email or contact reps-support@tckworkshop.co.jp.\n\n' +
      '— TCK Workshop / TCK Reps';
  } else {
    subject = '個別指導のお申込みありがとうございます — TCK Workshop';
    body =
      (userName ? userName + ' 様\n\n' : 'こんにちは。\n\n') +
      'TCK Reps の個別指導をお申込みいただき、ありがとうございます。\n\n' +
      '── お申込み内容 ──\n' +
      '希望技能：\n' + skillsBullet + '\n\n' +
      '── 次のステップ ──\n' +
      '1. セッションを予約する（60 分）\n' +
      '   下記の予約ページから空いている時間をお選びください。\n' +
      '   予約確定時に Google Meet の URL が自動で発行され、eeasy からの\n' +
      '   予約確定メールに同梱されます。\n\n' +
      '   ▶ 予約ページ：\n' +
      '   https://tckwshop.eeasy.jp/nicolas.umuyashiki/reps\n\n' +
      '2. 受講料をお支払い（国内在住 ¥11,000 税込 / 海外在住 ¥10,000 税抜）\n' +
      '   下記の決済リンクからお支払いください。請求先住所で国内 / 海外を\n' +
      '   自動判定し、税込・税抜を切り替えます。決済完了後、Stripe から\n' +
      '   領収書 PDF が自動でメール送信されます。\n\n' +
      '   ▶ 決済リンク：\n' +
      '   https://buy.stripe.com/cNi00j7q3eHibVW7Vj1kA3x\n\n' +
      '   ⚠ セッション前日 23:59 までに支払いが完了しない場合、\n' +
      '   キャンセル扱いとなり、自動的に枠が解放されます。\n' +
      '   お早めのお手続きをお願いいたします。\n\n' +
      '── セッションについて ──\n' +
      'セッションでは、選択された技能に絞って、解説・添削・実践演習を行います。\n' +
      '1 セッション 60 分、Google Meet にて開催します。\n\n' +
      'ご質問はこのメールに返信、または reps-support@tckworkshop.co.jp まで\n' +
      'ご連絡ください。\n\n' +
      '— TCK Workshop / TCK Reps';
  }

  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: body,
    name: 'TCK Workshop · TCK Reps'
  });
}


/* Instructor notification email (always Japanese, sent to the coach). */
function sendCoachingNotificationToInstructor_(userId, userName, email, skills, ts) {
  var instructorEmail = 'nicolas.umuyashiki@tckworkshop.co.jp';
  var skillsBullet = skills.split(',').map(function(s){ return '・' + s.trim(); }).join('\n');
  var dateStr = Utilities.formatDate(ts, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');

  var subject = '【TCK Reps】個別指導お申込み: ' + (userName || email);
  var body =
    'TCK Reps の個別指導お申込みがありました。\n\n' +
    '── 申込者 ──\n' +
    'お名前：' + (userName || '未設定') + '\n' +
    'Email：' + email + '\n' +
    'User ID：' + (userId || '未設定') + '\n' +
    '送信日時：' + dateStr + '\n\n' +
    '── 希望技能 ──\n' +
    skillsBullet + '\n\n' +
    '次のアクション：申込者は eeasy で予約 → 自動決済リンクで支払い、の流れです。\n' +
    '   予約: https://tckwshop.eeasy.jp/nicolas.umuyashiki/reps\n' +
    '   セッション前日 23:59 までに支払いが完了しなければ自動キャンセル。\n\n' +
    '記録：スプレッドシート COACHING_REQUESTS シート\n' +
    '— TCK Workshop GAS';

  MailApp.sendEmail({
    to: instructorEmail,
    subject: subject,
    body: body,
    name: 'TCK Workshop · GAS'
  });
}


// =============================================================
// QUOTA NOTE
// =============================================================
// Standard Google Workspace accounts have a daily MailApp quota of
// 1,500 emails per day. Each Coaching request sends 2 emails (user +
// instructor) = ~750 requests/day max. More than enough for this use
// case.
//
// If you'd rather send from a Gmail alias (e.g. reps-support@tckworkshop.co.jp
// instead of the Apps Script owner's address), replace MailApp.sendEmail
// with GmailApp.sendEmail and add { from: 'reps-support@tckworkshop.co.jp' } —
// but that requires the alias to be registered as a "send mail as"
// address in the Apps Script owner's Gmail settings.
//
// =============================================================
