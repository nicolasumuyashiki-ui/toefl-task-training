/**
 * gas-subscription-fallback.js
 *
 * Fixes the "paid user is still asked to subscribe" bug.
 *
 * SYMPTOM
 *   A user completes Stripe Checkout. Stripe writes a row to the
 *   SUBSCRIPTIONS sheet with status=active, plan_id, period, etc. —
 *   but the B column `user_id` ends up empty (the webhook / Zapier
 *   step doesn't map Stripe's `client_reference_id` into it). On the
 *   next page load, `handleGetSubscription_` looks the user up by
 *   `r.user_id === u.userId`, the empty cell never matches, and the
 *   client-side subscription gate (js/auth.js) sends the user to
 *   billing.html as if they had never paid.
 *
 * FIX
 *   Match by user_id first (existing behavior); if no row is found,
 *   fall back to email (case-insensitive). Mirrors the pattern
 *   already used by handleGetConsultationStatus_ in
 *   gas-consultation-additions.js, which had the same Zapier-can't-
 *   guarantee-user_id problem and solved it the same way.
 *
 *   This is purely defensive: once the Zapier Stripe→Sheet step is
 *   patched to write client_reference_id into the user_id column,
 *   the fallback path becomes dead code and no harm is done.
 *
 * INSTALLATION
 *   1. Open the GAS project bound to the TOEFL Reps Database
 *      spreadsheet.
 *   2. Locate the existing `handleGetSubscription_` (currently the
 *      one from gas-monitor-allowlist.js). REPLACE it with the
 *      version below.
 *   3. Save (Ctrl+S) → Deploy → Manage deployments → 鉛筆 →
 *      New version → Deploy. No client-side change needed.
 *
 * ALSO RECOMMENDED (root cause)
 *   In the Zapier Zap that writes Stripe events into the
 *   SUBSCRIPTIONS sheet, map `client_reference_id` (from the
 *   Stripe Checkout Session) into the **user_id** column. Without
 *   this, every new customer hits the same bug and the email
 *   fallback below silently masks it.
 *
 * IMMEDIATE WORKAROUND for already-affected users
 *   Manually fill in the empty B column (user_id) on their
 *   SUBSCRIPTIONS row. They'll be unlocked on the next page load
 *   (or up to 15 min later, when the client-side cache TTL
 *   expires — see js/auth.js:128).
 */


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
        plan_name: 'TOEFL Reps · Monitor',
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

  // Primary match: user_id column. This is the canonical key.
  var matches = rows.filter(function(r){
    return String(r.user_id || '').trim() !== '' &&
           String(r.user_id) === String(u.userId);
  });

  // Fallback: email (case-insensitive). Covers rows written by the
  // Stripe→Sheet Zapier step that didn't populate user_id. Required
  // until the Zap is patched to map client_reference_id → user_id.
  if (matches.length === 0 && u.email) {
    var needle = String(u.email).toLowerCase().trim();
    matches = rows.filter(function(r){
      return String(r.email || '').toLowerCase().trim() === needle;
    });
  }

  var sub = matches.sort(function(a,b){
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  })[0];

  return jsonpResponse_(callback, { success: true, subscription: sub || null });
}
