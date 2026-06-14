/**
 * gas-subscription-userid-fallback.js
 *
 * Patch for the SUBSCRIPTIONS sheet's user_id auto-fill, which has the
 * same gap that INVOICES had before gas-invoice-userid-fallback.js was
 * applied:
 *
 *   - `upsertSubscriptionFromSub_` was hardcoding `email: ''` on every
 *     write, so subscriptions created via Stripe Payment Link (no
 *     `client_reference_id`) landed in SUBSCRIPTIONS with neither
 *     email nor user_id, and the existing `backfillSubscriptionUserIds`
 *     couldn't resolve them (it only fills when email is already present).
 *
 *   - There was no Stripe-API-backed retroactive backfill for the rows
 *     that already exist with both fields empty.
 *
 * This file:
 *   1) Replaces `upsertSubscriptionFromSub_` with a version that pulls
 *      the customer's email from the Stripe customer object so newly-
 *      inserted rows have at least one of {user_id, email} for lookup.
 *   2) Modifies `upsertSubscriptionRow_` to do a final user_id rescue
 *      via email match before writing, so even Payment Link rows get a
 *      user_id immediately when the email matches an existing USERS row.
 *   3) Adds `backfillSubscriptionUserIdsV2` — a Stripe-API-fueled
 *      retroactive backfill that fills user_id for historical rows by
 *      looking at SUBSCRIPTIONS.email first, then falling back to the
 *      Stripe customer's email if the sheet's email is also empty.
 *   4) Updates `runDailyBackfill` to call the V2 function.
 *
 * INSTALLATION
 *   - Replace the existing `upsertSubscriptionFromSub_` and
 *     `upsertSubscriptionRow_` functions in the GAS project with the
 *     versions below.
 *   - Append the new `backfillSubscriptionUserIdsV2` function.
 *   - Update `runDailyBackfill` (or whichever trigger schedules backfill)
 *     to also call `backfillSubscriptionUserIdsV2()`.
 *   - Deploy → New version (API_URL unchanged).
 *   - After deploy, run `backfillSubscriptionUserIdsV2()` once manually
 *     to fill historical rows.
 */


// ============================================================
// REPLACEMENT — upsertSubscriptionFromSub_
// ============================================================
function upsertSubscriptionFromSub_(sub) {
  var customer = sub.customer || '';
  var price = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price;
  var pm = null;
  if (sub.default_payment_method) {
    pm = typeof sub.default_payment_method === 'string'
      ? fetchStripe_('https://api.stripe.com/v1/payment_methods/' + sub.default_payment_method)
      : sub.default_payment_method;
  }
  var card = pm && pm.card;

  // Pull the customer's email from Stripe so rows created via Payment
  // Link (no client_reference_id) still carry an identifying field.
  var email = '';
  if (customer) {
    var cust = fetchStripe_('https://api.stripe.com/v1/customers/' + customer);
    if (cust && cust.email) email = cust.email;
  }

  upsertSubscriptionRow_({
    customer_id: customer,
    user_id: lookupUserIdByCustomer_(customer),  // upsert helper will rescue from email if blank
    email: email,
    status: sub.status,
    plan_id: price ? price.id : '',
    plan_name: 'TCK Reps · Standard',
    amount: price ? price.unit_amount : 0,
    currency: (price ? price.currency : 'jpy').toLowerCase(),
    current_period_start: toIsoDate_(sub.current_period_start),
    current_period_end:   toIsoDate_(sub.current_period_end),
    started_at: toIsoDate_(sub.start_date),
    canceled_at: sub.canceled_at ? toIsoDate_(sub.canceled_at) : '',
    pm_brand: card ? card.brand : '',
    pm_last4: card ? card.last4 : '',
    pm_exp:   card ? (String(card.exp_month).padStart(2,'0') + '/' + card.exp_year) : '',
    updated_at: new Date().toISOString()
  });
}


// ============================================================
// REPLACEMENT — upsertSubscriptionRow_
// ============================================================
// Same write semantics as before, but right before the row is inserted
// we try one more time to fill user_id by email (USERS lookup). This
// closes the gap where Stripe Payment Link rows arrived with no
// client_reference_id and no pre-existing SUBSCRIPTIONS row to seed the
// customer_id → user_id map.
function upsertSubscriptionRow_(row) {
  // Last-chance user_id rescue via email before persisting.
  if (!row.user_id && row.email) {
    var uid = lookupUserIdByEmail_(row.email);
    if (uid) row.user_id = uid;
  }

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SUBSCRIPTIONS');
  if (!sh) {
    sh = SpreadsheetApp.getActiveSpreadsheet().insertSheet('SUBSCRIPTIONS');
    sh.appendRow([
      'customer_id','user_id','email','status','plan_id','plan_name','amount','currency',
      'current_period_start','current_period_end','started_at','canceled_at',
      'pm_brand','pm_last4','pm_exp','updated_at'
    ]);
  }
  var d = sh.getDataRange().getValues();
  var headers = d[0];
  var idx = headers.indexOf('customer_id');

  for (var i = 1; i < d.length; i++) {
    if (String(d[i][idx]) === String(row.customer_id)) {
      var newRow = headers.map(function(h, k) {
        return (row[h] !== undefined && row[h] !== '' && row[h] !== null) ? row[h] : d[i][k];
      });
      sh.getRange(i+1, 1, 1, headers.length).setValues([newRow]);
      return;
    }
  }
  sh.appendRow(headers.map(function(h){ return row[h] !== undefined && row[h] !== null ? row[h] : ''; }));
}


// ============================================================
// NEW — backfillSubscriptionUserIdsV2
// ============================================================
// 3-tier user_id resolution for SUBSCRIPTIONS rows that are missing it:
//   Tier 1: row.email → USERS.email match
//   Tier 2: Stripe customer.email (via API) → USERS.email match
//   Tier 3: give up
//
// Idempotent — skips rows that already have a user_id.
function backfillSubscriptionUserIdsV2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var subSh = ss.getSheetByName('SUBSCRIPTIONS');
  if (!subSh) { Logger.log('SUBSCRIPTIONS sheet not found'); return 0; }

  var subD = subSh.getDataRange().getValues();
  if (subD.length < 2) return 0;
  var headers = subD[0];
  var iUserId = headers.indexOf('user_id');
  var iEmail  = headers.indexOf('email');
  var iCust   = headers.indexOf('customer_id');
  if (iUserId < 0 || iEmail < 0 || iCust < 0) {
    Logger.log('SUBSCRIPTIONS sheet missing required column');
    return 0;
  }

  // Build USERS email → id map once.
  var emailToId = {};
  var usersSh = ss.getSheetByName('USERS');
  if (usersSh) {
    var usersD = usersSh.getDataRange().getValues();
    for (var u = 1; u < usersD.length; u++) {
      var e = String(usersD[u][3] || '').toLowerCase().trim();
      var id = String(usersD[u][0] || '').trim();
      if (e && id) emailToId[e] = id;
    }
  }

  var updated = 0;
  var stripeQueries = 0;
  var emailFills = 0;

  for (var r = 1; r < subD.length; r++) {
    if (String(subD[r][iUserId] || '').trim() !== '') continue;

    var resolved = '';
    var emailNew = '';

    // Tier 1: existing sheet email
    var sheetEmail = String(subD[r][iEmail] || '').toLowerCase().trim();
    if (sheetEmail) {
      resolved = emailToId[sheetEmail] || '';
    }

    // Tier 2: ask Stripe for the customer email
    if (!resolved) {
      var cust = String(subD[r][iCust] || '').trim();
      if (cust) {
        var customer = fetchStripe_('https://api.stripe.com/v1/customers/' + cust);
        stripeQueries++;
        if (customer && customer.email) {
          emailNew = String(customer.email);
          var se = emailNew.toLowerCase().trim();
          resolved = emailToId[se] || '';
        }
      }
    }

    // Write whatever we found. Email gets filled even if user_id
    // still doesn't resolve — that helps future lookups + manual audit.
    if (resolved) {
      subSh.getRange(r + 1, iUserId + 1).setValue(resolved);
      updated++;
    }
    if (emailNew && !sheetEmail) {
      subSh.getRange(r + 1, iEmail + 1).setValue(emailNew);
      emailFills++;
    }
  }

  Logger.log('backfillSubscriptionUserIdsV2: 埋めた user_id=' + updated +
             ' / 補完した email=' + emailFills +
             ' / Stripe 照会=' + stripeQueries);
  return updated;
}


// ============================================================
// UPDATE — runDailyBackfill (reference)
// ============================================================
// Replace your existing runDailyBackfill with this version so the V2
// SUBSCRIPTIONS backfill runs daily alongside the INVOICES one.
function runDailyBackfill() {
  backfillSubscriptionUserIdsV2();  // ← V2 (Stripe-API fallback)
  backfillInvoiceUserIdsV2();
}
