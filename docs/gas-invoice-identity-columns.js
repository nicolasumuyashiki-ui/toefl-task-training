/**
 * gas-invoice-identity-columns.js
 *
 * INVOICES タブに **email と user_name の列を足して、誰の請求書なのか
 * 一目で分かるようにする**ための追加。
 *
 * ■ なぜ必要か
 * 現在の INVOICES は
 *   invoice_id | customer_id | user_id | date | amount | currency |
 *   status | description | hosted_url | pdf_url
 * の 10 列しかなく、並んでいるのは `in_1Q...` `cus_Ut...` `U0042` といった
 * ID だけ。**シートを開いても誰の入金なのか分からない。**
 * しかも user_id が空の行があると、手がかりが完全に消える。
 *
 * ■ この追加でやること
 *   1. INVOICES に `email` と `user_name` の列を足す（既にあれば足さない）
 *   2. 既存の全行について、その 2 列を埋める
 *   3. 今後に備えて appendInvoice_ を差し替え、新しい請求書にも自動で入るようにする
 *
 * ■ 誰のものかを解決する順番（上から試す）
 *   ① user_id → USERS の email / 氏名
 *   ② customer_id → SUBSCRIPTIONS.email → USERS の氏名
 *   ③ customer_id → Stripe API で customer を取得 → その email
 * ③ まで落ちた行は、アプリに未登録のメールで決済された行なので、
 *    email だけ入って user_name は空になる。**それがまさに
 *    「入金したのにアプリを使えない」お客さまの正体**なので、
 *    空欄が残ること自体が有用なサインになる。
 *
 * ■ 使い方（GAS エディタで関数を選んで実行 → 実行ログを見る）
 *   addInvoiceIdentityColumns()               … 確認のみ（既定・書き換えない）
 *   addInvoiceIdentityColumns({apply:true})   … 列を足して実際に埋める
 *
 * ■ 安全性
 *   - 触るのは **INVOICES シートだけ**。SUBSCRIPTIONS / USERS / ANSWERS /
 *     PT_RESULTS などは読むだけで、一切書き込まない。
 *   - 既に値が入っているセルは上書きしない（空欄だけ埋める）。
 *   - 列は**名前で探して名前で書く**ので、列順を入れ替えても壊れない。
 *   - Stripe API は失敗しても null を返すだけで、処理は続行する。
 *
 * ■ 注意
 *   `handleListInvoices_` が行をそのまま返す実装なら、billing.html の
 *   レスポンスに email / user_name が含まれるようになる。返るのは
 *   **ログイン本人の行だけ**なので他人の情報は出ないが、気になる場合は
 *   handleListInvoices_ 側で 2 列を落としてから返すとよい。
 */

var INV_SHEET = 'INVOICES';
var INV_EMAIL_COL = 'email';
var INV_NAME_COL  = 'user_name';


/* ============================================================
   ヘッダ名で列番号を引く。無ければ右端に足す（apply 時のみ）。
   戻り値は 0 始まりの列 index、足せなかったときは -1。
   ============================================================ */
function _invEnsureColumn_(sh, header, name, apply) {
  var i = header.indexOf(name);
  if (i >= 0) return i;
  if (!apply) return -1;
  var col = header.length + 1;
  sh.getRange(1, col).setValue(name);
  header.push(name);
  Logger.log('  列を追加しました: ' + name + '（' + col + ' 列目）');
  return col - 1;
}


/* ============================================================
   INVOICES に email / user_name を足して埋める
   ============================================================ */
function addInvoiceIdentityColumns(opts) {
  opts = opts || {};
  var APPLY = opts.apply === true;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(INV_SHEET);
  if (!sh) { Logger.log(INV_SHEET + ' シートが見つかりません'); return 0; }

  var d = sh.getDataRange().getValues();
  if (d.length < 2) { Logger.log(INV_SHEET + ' にデータ行がありません'); return 0; }

  var header   = d[0].slice();
  var iInvId   = header.indexOf('invoice_id');
  var iCust    = header.indexOf('customer_id');
  var iUser    = header.indexOf('user_id');
  if (iCust < 0 || iUser < 0) {
    Logger.log('INVOICES に customer_id / user_id 列がありません');
    return 0;
  }

  Logger.log('=== INVOICES の身元列' + (APPLY ? '（実行）' : '（確認のみ・書き換えません）') + ' ===');

  var iEmail = _invEnsureColumn_(sh, header, INV_EMAIL_COL, APPLY);
  var iName  = _invEnsureColumn_(sh, header, INV_NAME_COL,  APPLY);
  if (!APPLY && (iEmail < 0 || iName < 0)) {
    Logger.log('  （実行すると ' +
      [iEmail < 0 ? INV_EMAIL_COL : null, iName < 0 ? INV_NAME_COL : null]
        .filter(function (x) { return x; }).join(' / ') + ' 列を追加します）');
  }

  // USERS: user_id → {email, name} と email → {id, name}
  var byId = {}, byEmail = {};
  var usersSh = ss.getSheetByName('USERS');
  if (usersSh) {
    var ud = usersSh.getDataRange().getValues();
    for (var u = 1; u < ud.length; u++) {
      var uid   = String(ud[u][0] || '').trim();
      var uname = String(ud[u][2] || '').trim();   // C 列 = 氏名
      var uem   = String(ud[u][3] || '').toLowerCase().trim();   // D 列 = email
      if (uid) byId[uid] = { email: uem, name: uname };
      if (uem) byEmail[uem] = { id: uid, name: uname };
    }
  }

  // SUBSCRIPTIONS: customer_id → email
  var custEmail = {};
  var subSh = ss.getSheetByName('SUBSCRIPTIONS');
  if (subSh) {
    var sd = subSh.getDataRange().getValues();
    var sh0 = sd[0];
    var iSC = sh0.indexOf('customer_id');
    var iSE = sh0.indexOf('email');
    if (iSC >= 0 && iSE >= 0) {
      for (var s = 1; s < sd.length; s++) {
        var c = String(sd[s][iSC] || '').trim();
        var e = String(sd[s][iSE] || '').toLowerCase().trim();
        if (c && e && !custEmail[c]) custEmail[c] = e;
      }
    }
  }

  var filled = 0, unknown = 0, stripeCalls = 0;
  var orphans = [];

  for (var r = 1; r < d.length; r++) {
    var row     = d[r];
    var already = iEmail >= 0 ? String(row[iEmail] || '').trim() : '';
    if (already) continue;               // 既に入っている行は触らない

    var uid  = String(row[iUser] || '').trim();
    var cust = String(row[iCust] || '').trim();
    var email = '', name = '', via = '';

    // ① user_id → USERS
    if (uid && byId[uid]) {
      email = byId[uid].email; name = byId[uid].name; via = 'user_id';
    }
    // ② customer_id → SUBSCRIPTIONS.email → USERS で氏名も
    if (!email && cust && custEmail[cust]) {
      email = custEmail[cust];
      if (byEmail[email]) name = byEmail[email].name;
      via = 'SUBSCRIPTIONS.email';
    }
    // ③ Stripe の customer から email
    if (!email && cust && typeof fetchStripe_ === 'function') {
      var customer = fetchStripe_('https://api.stripe.com/v1/customers/' + cust);
      stripeCalls++;
      if (customer && customer.email) {
        email = String(customer.email).toLowerCase().trim();
        if (byEmail[email]) name = byEmail[email].name;
        via = 'Stripe';
      }
    }

    if (!email) {
      unknown++;
      Logger.log('  ⛔ 特定できず  行' + (r + 1) +
        '  invoice=' + (iInvId >= 0 ? row[iInvId] : '?') + '  customer=' + (cust || '(空)'));
      continue;
    }

    if (APPLY) {
      if (iEmail >= 0) sh.getRange(r + 1, iEmail + 1).setValue(email);
      if (iName  >= 0 && name) sh.getRange(r + 1, iName + 1).setValue(name);
    }
    filled++;

    // 決済はあるのにアプリ側に該当ユーザが居ない ＝ 使えないお客さま
    if (!name || !byEmail[email]) {
      orphans.push({ row: r + 1, invoice: iInvId >= 0 ? row[iInvId] : '', email: email });
    }
  }

  Logger.log('--------');
  Logger.log((APPLY ? '埋めました: ' : '埋められる見込み: ') + filled + ' 行' +
             ' / 特定できず: ' + unknown + ' 行' +
             (stripeCalls ? ' / Stripe 照会: ' + stripeCalls + ' 回' : ''));

  if (orphans.length) {
    Logger.log('');
    Logger.log('⚠ 決済はあるのに USERS に該当アカウントが無い行（' + orphans.length + ' 件）');
    Logger.log('  ＝「入金したのにアプリを使えない」お客さまの候補です。');
    orphans.forEach(function (o) {
      Logger.log('    行' + o.row + '  ' + o.email + '  invoice=' + o.invoice);
    });
    Logger.log('  対処: そのメールでご登録いただくか、決済メールとアプリ登録メールが');
    Logger.log('        違う場合は SUB_EMAIL_ALIASES に「登録メール : 決済メール」を追加する');
    Logger.log('        （docs/gas-subscription-email-alias.js 参照）。');
  }

  if (!APPLY && (filled || unknown)) {
    Logger.log('→ 実行するには addInvoiceIdentityColumns({apply:true})');
  }
  return filled;
}


/* ============================================================
   appendInvoice_ の置換版
   —— 既存の版（docs/gas-invoice-userid-fallback.js）を上書きする。
   違いは 2 点だけ:
     ・email / user_name も一緒に書く
     ・列を**位置ではなくヘッダ名で**書くので、列を足しても並べ替えても壊れない
   ============================================================ */
function appendInvoice_(inv) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(INV_SHEET);
  if (!sh) {
    sh = ss.insertSheet(INV_SHEET);
    sh.appendRow(['invoice_id','customer_id','user_id','date','amount','currency',
                  'status','description','hosted_url','pdf_url',
                  INV_EMAIL_COL, INV_NAME_COL]);
  }

  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  // 同じ invoice_id が既にあれば何もしない（重複防止・既存の挙動を維持）
  var iInvId = header.indexOf('invoice_id');
  if (iInvId >= 0 && sh.getLastRow() > 1) {
    var ids = sh.getRange(2, iInvId + 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(inv.id)) return;
    }
  }

  var userId = lookupUserIdByInvoice_(inv);

  // 表示用の email / 氏名を決める
  var email = String(inv.customer_email ||
                     (inv.customer_details && inv.customer_details.email) || '')
              .toLowerCase().trim();
  var name = '';
  var usersSh = ss.getSheetByName('USERS');
  if (usersSh) {
    var ud = usersSh.getDataRange().getValues();
    for (var u = 1; u < ud.length; u++) {
      var uid = String(ud[u][0] || '').trim();
      var uem = String(ud[u][3] || '').toLowerCase().trim();
      if ((userId && uid === userId) || (email && uem === email)) {
        name  = String(ud[u][2] || '').trim();
        if (!email) email = uem;
        break;
      }
    }
  }

  var values = {
    invoice_id:  inv.id,
    customer_id: inv.customer || '',
    user_id:     userId,
    date:        toIsoDate_(inv.created),
    amount:      inv.amount_paid || inv.amount_due || 0,
    currency:    inv.currency || 'jpy',
    status:      inv.status || '',
    description: (inv.lines && inv.lines.data && inv.lines.data[0] &&
                  inv.lines.data[0].description) || 'TCK Reps · 月額プラン',
    hosted_url:  inv.hosted_invoice_url || '',
    pdf_url:     inv.invoice_pdf || ''
  };
  values[INV_EMAIL_COL] = email;
  values[INV_NAME_COL]  = name;

  var rowOut = header.map(function (h) {
    return Object.prototype.hasOwnProperty.call(values, h) ? values[h] : '';
  });
  sh.appendRow(rowOut);
}
