/**
 * docs/gas-subscriptions-admin.js — Admin（staff 認証）で全生徒の Stripe
 * サブスクリプション状態を1回のリクエストで返す。
 *
 * Admin ダッシュボードの「個人カルテ」に各生徒の課金状態（active / past_due /
 * canceled 等）を表示するために使う。未デプロイでもフロントは壊れず、
 * 「サブスク情報なし」と degrade する（js/api.js の adminListSubscriptions が
 * reject → admin/index.html が握りつぶす）。
 *
 * ■ デプロイ手順:
 *   1. 本関数を GAS プロジェクト末尾に貼り付け。
 *   2. doGet() の dispatch に1行追加（既存の getSubscription 付近）:
 *        if (action === 'adminListSubscriptions') return handleAdminListSubscriptions_(e, callback);
 *   3. デプロイ管理 → 既存デプロイを編集 → 新しいバージョン発行（API_URL は変えない）。
 *
 * ■ SUBSCRIPTIONS シート（列はヘッダ名で解決するので順番は問わない）:
 *   customer_id, user_id, email, status, current_period_start,
 *   current_period_end, …（Stripe webhook が upsert）
 *
 * セキュリティ: verifyStaff_ 必須（@tckworkshop.co.jp のスタッフのみ）。
 */
function handleAdminListSubscriptions_(e, callback) {
  if (!verifyStaff_(e.parameter.id, e.parameter.pass)) {
    return jsonpResponse_(callback, { success: false, error: 'auth_failed' });
  }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SUBSCRIPTIONS');
  if (!sh) return jsonpResponse_(callback, { success: true, subscriptions: [] });
  var d = sh.getDataRange().getValues();
  if (d.length < 2) return jsonpResponse_(callback, { success: true, subscriptions: [] });

  // Resolve columns by header name (robust to column re-ordering).
  var header = d[0].map(function (h) { return String(h || '').trim().toLowerCase(); });
  function col() {
    for (var a = 0; a < arguments.length; a++) {
      var i = header.indexOf(arguments[a]);
      if (i !== -1) return i;
    }
    return -1;
  }
  var iUid    = col('user_id', 'userid', 'uid');
  var iEmail  = col('email', 'e-mail');
  var iStatus = col('status', 'subscription_status');
  var iEnd    = col('current_period_end', 'period_end', 'currentperiodend');
  var iStart  = col('current_period_start', 'period_start');
  var iCust   = col('customer_id', 'customer');
  var iTs     = col('timestamp', 'updated_at', 'updated', 'created');

  function iso(v) {
    if (v === '' || v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString();
    return String(v);
  }

  var out = [];
  for (var r = 1; r < d.length; r++) {
    var row = d[r];
    var status = iStatus >= 0 ? String(row[iStatus] || '').trim() : '';
    var uid = iUid >= 0 ? String(row[iUid] || '').trim() : '';
    var email = iEmail >= 0 ? String(row[iEmail] || '').trim() : '';
    if (!status && !uid && !email) continue; // blank row
    out.push({
      userId: uid,
      email: email,
      status: status,
      customerId: iCust >= 0 ? String(row[iCust] || '') : '',
      currentPeriodEnd: iEnd >= 0 ? iso(row[iEnd]) : '',
      currentPeriodStart: iStart >= 0 ? iso(row[iStart]) : '',
      timestamp: iTs >= 0 ? iso(row[iTs]) : ''
    });
  }
  // Newest first so the client keeps the latest row per user/email.
  out.sort(function (a, b) { return (b.timestamp || '').localeCompare(a.timestamp || ''); });
  return jsonpResponse_(callback, { success: true, subscriptions: out });
}
