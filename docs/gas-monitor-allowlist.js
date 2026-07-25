/**
 * gas-monitor-allowlist.js
 *
 * Moves the monitor / comp-tier allowlist from the client-side
 * js/auth.js (where it was visible to anyone via View Source) into
 * the GAS backend so the emails never reach the browser.
 *
 * After this change, monitor users see "active" subscription status
 * coming back from GAS, and the client-side gate lets them through
 * exactly like a paying customer — but the monitor list itself is
 * never transmitted to browsers.
 *
 * Paste flow:
 *   1. Add the MONITOR_EMAILS constant + isMonitorEmail_ helper
 *      (block 1 below) somewhere near the top of the file — right
 *      under the existing constant block (DATETIME_FMT etc.) is fine.
 *   2. REPLACE your existing `handleGetSubscription_` function with
 *      the new version below (block 2). The only diff is a 4-line
 *      monitor short-circuit at the top.
 *   3. ALSO patch `handleLogin_` to return `isMonitor` (block 3).
 *      The index.html login flow uses this flag to skip the
 *      domain whitelist check so monitor gmail addresses can sign in.
 *   4. Save (Ctrl+S) → Deploy → Manage deployments → 鉛筆 →
 *      New version → Deploy.
 *
 * To add / remove monitors later: edit MONITOR_EMAILS, save, redeploy.
 * No client-side code change needed.
 */


// =============================================================
// BLOCK 1 — paste near the top of the GAS file (under DATETIME_FMT)
// =============================================================

/* Monitor / comp-tier accounts — these emails get an "active"
   subscription synthesised by GAS, so they can use all paid features
   without going through Stripe. The list lives server-side so it
   never appears in the browser. Lowercase.

   This list also covers GOODWILL LIFETIME COMPS — paying customers we
   have granted free-forever access (e.g. as compensation). Mark each
   with a dated comment so nobody removes them later thinking they are a
   stale monitor. IMPORTANT: adding an email here grants APP ACCESS at
   ¥0, but does NOT cancel that person's existing Stripe subscription —
   to actually stop charging a paying customer you must ALSO cancel
   their subscription in the Stripe Dashboard. */
var MONITOR_EMAILS = [
  'saekadowaki322@gmail.com',
  'bellsince2004@gmail.com',
  'mkusunoki0811@gmail.com',
  'soccerzurdo1@gmail.com',
  'nanasey103@gmail.com',
  // 前田 宗一郎 — goodwill comp (2026-06, 今後無料). Listed BOTH login-id and
  // account email because GAS matches on the email column (u.email); both
  // are included so the comp activates regardless of which field is checked.
  'kyo.maeda2015@gmail.com',
  'soichiro941@gmail.com',
  // 矢口 洪太 (login id: yagu1004) — goodwill comp (2026-07, 今後無料).
  // 経緯: 6/25〜7/20 の間、送信未確認の保存を再送打ち切りで破棄する実装が
  // あり、娘さまの Read in Daily Life Practice 3〜6 の記録が失われたため。
  // GAS は USERS の email 列で照合するので、アカウント email を登録する。
  // ※ 娘さまご本人の email (yagucchan0625@yahoo.co.jp) で別アカウントを
  //   作られた場合は、その email もここに追加すること。
  'rena.yon811@gmail.com'
];

function isMonitorEmail_(email) {
  if (!email) return false;
  return MONITOR_EMAILS.indexOf(String(email).toLowerCase().trim()) !== -1;
}


// =============================================================
// BLOCK 2 — REPLACE your existing handleGetSubscription_ with this
// =============================================================

function handleGetSubscription_(e, callback) {
  var u = verifyUser_(e.parameter.id, e.parameter.pass);
  if (!u) return jsonpResponse_(callback, { success: false, error: 'auth_failed' });

  // Monitor / comp-tier — return synthetic active subscription.
  // Keeps the email list off the client and out of any Git history.
  if (isMonitorEmail_(u.email)) {
    return jsonpResponse_(callback, {
      success: true,
      subscription: {
        status: 'active',
        plan_id: 'monitor_comp',
        plan_name: 'TCK Reps · Monitor',
        amount: 0,
        currency: 'jpy',
        current_period_start: '',
        current_period_end:   '',
        started_at: '',
        canceled_at: '',
        customer_id: '',
        email: u.email,
        user_id: u.userId,
        pm_brand: '',
        pm_last4: '',
        pm_exp: '',
        updated_at: new Date().toISOString()
      }
    });
  }

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SUBSCRIPTIONS');
  if (!sh) return jsonpResponse_(callback, { success: true, subscription: null });
  var rows = readSheetAsObjects_(sh);
  var sub = rows.filter(function(r){ return String(r.user_id) === String(u.userId); })
                .sort(function(a,b){ return (b.updated_at || '').localeCompare(a.updated_at || ''); })[0];
  return jsonpResponse_(callback, { success: true, subscription: sub || null });
}


// =============================================================
// BLOCK 3 — patch handleLogin_ to surface isMonitor flag
// =============================================================
// In your existing handleLogin_, the success return looks like:
//
//   return jsonpResponse_(callback, {
//     success: true,
//     userId: String(d[i][0]),
//     userName: String(d[i][2] || ''),
//     email: String(d[i][3] || ''),
//     mustChangePassword: mustChange
//   });
//
// ADD ONE LINE so it becomes:
//
//   return jsonpResponse_(callback, {
//     success: true,
//     userId: String(d[i][0]),
//     userName: String(d[i][2] || ''),
//     email: String(d[i][3] || ''),
//     mustChangePassword: mustChange,
//     isMonitor: isMonitorEmail_(String(d[i][3] || ''))   // <-- ADD THIS
//   });
//
// That's the only diff. index.html consumes `isMonitor` to skip the
// TCK-domain check for comp-tier accounts.
