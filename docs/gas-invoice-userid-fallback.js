/**
 * docs/gas-invoice-userid-fallback.js
 *
 * INVOICES.user_id が空のままになる問題（生リンク決済等で
 * SUBSCRIPTIONS.user_id が空 → 既存の lookupUserIdByCustomer_ が ''
 * を返してしまう）への対症療法。3 段階フォールバックで解決する。
 *
 * 効果：
 *   1. invoice.paid / invoice.payment_succeeded 等で新規 INVOICES 行が
 *      書かれる際に、可能な限り user_id を確実に埋める（realtime fix）
 *   2. 既存の空 user_id 行を一括埋めなおす backfill 関数
 *
 * 解決ロジック（順に試す）:
 *   ① 既存：SUBSCRIPTIONS.customer_id → user_id を引く
 *   ② 追加：invoice payload の customer_email → USERS.email → user_id
 *   ③ 追加：Stripe API で customer を取得し email → USERS.email → user_id
 *
 * デプロイ手順:
 *   1. 本ファイルの 3 関数（lookupUserIdByEmail_, lookupUserIdByInvoice_,
 *      backfillInvoiceUserIdsV2）と、置換版の appendInvoice_ を GAS に貼る。
 *   2. 既存 appendInvoice_ を本ファイルの版で上書き。
 *   3. 「デプロイを管理」→ 既存デプロイの新バージョンを発行
 *      （新規デプロイは作らない＝api.js の URL は不変）。
 *   4. GAS エディタで backfillInvoiceUserIdsV2() を「関数を実行」→ 既存の
 *      空 user_id 行が一括で埋まる（実行ログで件数確認）。
 *
 * 任意（推奨）：時刻トリガーで backfillInvoiceUserIdsV2 を毎日実行。
 *   トリガー → 関数: backfillInvoiceUserIdsV2 / イベントソース: 時間主導型
 *   / 種類: 日 / 時刻: 任意（例 4 時）
 *
 * 安全性：
 *   - 読み取り→照合→空セルの更新のみ。既存の埋まった user_id は触らない。
 *   - Stripe API は失敗時 null を返すだけ（処理続行）。
 */

/* ============================================================
   ① USERS.email → user_id ルックアップ
   ============================================================ */
function lookupUserIdByEmail_(email) {
  if (!email) return '';
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('USERS');
  if (!sh) return '';
  var d = sh.getDataRange().getValues();
  var needle = String(email).toLowerCase().trim();
  for (var i = 1; i < d.length; i++) {
    var e = String(d[i][3] || '').toLowerCase().trim();
    if (e === needle) return String(d[i][0] || '');
  }
  return '';
}

/* ============================================================
   ② Invoice 1 件に対する user_id 解決（3 段階フォールバック）
   ============================================================ */
function lookupUserIdByInvoice_(inv) {
  // Try 1: SUBSCRIPTIONS.customer_id → user_id（既存ロジック）
  var uid = lookupUserIdByCustomer_(inv.customer);
  if (uid) return uid;

  // Try 2: invoice payload の customer_email → USERS.email
  var email = inv.customer_email
           || (inv.customer_details && inv.customer_details.email)
           || '';
  if (email) {
    uid = lookupUserIdByEmail_(email);
    if (uid) return uid;
  }

  // Try 3: Stripe API で customer 取得 → email → USERS.email
  if (inv.customer) {
    var customer = fetchStripe_('https://api.stripe.com/v1/customers/' + inv.customer);
    if (customer && customer.email) {
      uid = lookupUserIdByEmail_(customer.email);
      if (uid) return uid;
    }
  }

  return '';
}

/* ============================================================
   ③ appendInvoice_ の置換版
   既存関数を丸ごとこの版で上書きする
   ============================================================ */
function appendInvoice_(inv) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('INVOICES');
  if (!sh) {
    sh = SpreadsheetApp.getActiveSpreadsheet().insertSheet('INVOICES');
    sh.appendRow(['invoice_id','customer_id','user_id','date','amount','currency','status','description','hosted_url','pdf_url']);
  }
  var d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) if (String(d[i][0]) === String(inv.id)) return;

  sh.appendRow([
    inv.id,
    inv.customer || '',
    lookupUserIdByInvoice_(inv),
    toIsoDate_(inv.created),
    inv.amount_paid || inv.amount_due || 0,
    inv.currency || 'jpy',
    inv.status || '',
    (inv.lines && inv.lines.data && inv.lines.data[0] && inv.lines.data[0].description) || 'TCK Reps · 月額プラン',
    inv.hosted_invoice_url || '',
    inv.invoice_pdf || ''
  ]);
}

/* ============================================================
   ④ 既存 INVOICES 行の user_id 一括補完
   GAS エディタで「関数を実行」→ backfillInvoiceUserIdsV2 で起動。
   既存 backfillInvoiceUserIds は SUBSCRIPTIONS 経由のみ（弱い）。
   こちらは SUBSCRIPTIONS → SUBSCRIPTIONS.email → Stripe customer
   と 3 段階で解決する。
   ============================================================ */
function backfillInvoiceUserIdsV2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var invSh = ss.getSheetByName('INVOICES');
  if (!invSh) { Logger.log('INVOICES sheet not found'); return 0; }

  var invD = invSh.getDataRange().getValues();
  if (invD.length < 2) return 0;
  var invH = invD[0];
  var iInvUser = invH.indexOf('user_id');
  var iInvCust = invH.indexOf('customer_id');
  if (iInvUser < 0 || iInvCust < 0) {
    Logger.log('INVOICES sheet missing user_id or customer_id column');
    return 0;
  }

  // SUBSCRIPTIONS の customer_id → {user_id, email} マップ
  var custMap = {};
  var subSh = ss.getSheetByName('SUBSCRIPTIONS');
  if (subSh) {
    var subD = subSh.getDataRange().getValues();
    var subH = subD[0];
    var iSubUser  = subH.indexOf('user_id');
    var iSubCust  = subH.indexOf('customer_id');
    var iSubEmail = subH.indexOf('email');
    for (var i = 1; i < subD.length; i++) {
      var c = String(subD[i][iSubCust] || '').trim();
      if (!c) continue;
      custMap[c] = {
        user_id: String(subD[i][iSubUser] || '').trim(),
        email:   String(subD[i][iSubEmail] || '').toLowerCase().trim()
      };
    }
  }

  // USERS の email → user_id マップ
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
  for (var r = 1; r < invD.length; r++) {
    if (String(invD[r][iInvUser] || '').trim() !== '') continue;
    var cust = String(invD[r][iInvCust] || '').trim();
    if (!cust) continue;

    var resolved = '';

    // Try 1: SUBSCRIPTIONS.customer_id → user_id
    var info = custMap[cust];
    if (info && info.user_id) {
      resolved = info.user_id;
    } else if (info && info.email) {
      // Try 2: SUBSCRIPTIONS.email → USERS.email
      resolved = emailToId[info.email] || '';
    }

    // Try 3: Stripe API でカスタマー取得 → email → USERS
    if (!resolved) {
      var customer = fetchStripe_('https://api.stripe.com/v1/customers/' + cust);
      stripeQueries++;
      if (customer && customer.email) {
        var se = String(customer.email).toLowerCase().trim();
        resolved = emailToId[se] || '';
      }
    }

    if (resolved) {
      invSh.getRange(r + 1, iInvUser + 1).setValue(resolved);
      updated++;
    }
  }

  Logger.log('backfillInvoiceUserIdsV2: 埋めた行=' + updated +
             ' / Stripe 照会=' + stripeQueries);
  return updated;
}
