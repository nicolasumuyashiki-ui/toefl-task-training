/**
 * docs/gas-subscription-resync.js
 *   Stripe を正本として SUBSCRIPTIONS の「行そのものが無い」を直す
 *
 * ■ どういうときに使うか
 *   `diagnoseAccess` が **原因③（SUBSCRIPTIONS にこの方の行がありません）** と
 *   出たとき。入金しているのに行が無い＝ webhook がその契約を取りこぼしている。
 *
 *   - 原因①（user_id が空）→ diagnoseAccess({apply:true}) で直る
 *   - 原因②（status が active でない）→ diagnoseAccess({apply:true, activate:true})
 *   - **原因③（行が無い）→ このファイル**
 *
 *   `backfillSubscriptionUserIdsV2` は「既にある行の user_id を埋める」関数なので、
 *   行が無いケースには効かない。ここが埋まっていなかった。
 *
 * ■ 使い方（GAS エディタで実行 → 実行ログ）
 *   resyncSubscriptionsByEmail('someone@example.com')
 *       … Stripe を照会して「何があるか」を表示するだけ（書き込みなし）
 *   resyncSubscriptionsByEmail('someone@example.com', {apply:true})
 *       … 見つかった契約を SUBSCRIPTIONS へ取り込む
 *
 *   auditStripeSubscriptionsNotInSheet()
 *       … Stripe で有効なのにシートに行が無い契約を一覧（確認のみ）。
 *         webhook の取りこぼしが何件あるかを把握するため。
 *
 * ■ 安全性
 *   - 書き込みは既存の `upsertSubscriptionFromSub_`（webhook 本体が使うのと
 *     同じ関数）に任せる。独自に行を組み立てないので列構成がずれない。
 *   - 取り込み後の解錠（user_id の紐づけ）は従来どおり `diagnoseAccess` で行う。
 *     このファイルは user_id を勝手に書かない。
 *   - ANSWERS / PT_RESULTS / RECORDINGS / BANDS には一切触れない。
 *   - Stripe へは GET しか発行しない（Stripe 側のデータは変更しない）。
 *
 * ■ 前提
 *   既存プロジェクトの `fetchStripe_(url)` と `upsertSubscriptionFromSub_(sub)`
 *   を使う（どちらもデプロイ済み）。無い場合はログにその旨を出して止まる。
 */

var SR_SHEET = 'SUBSCRIPTIONS';

function _srMask_(e) {
  e = String(e || '');
  var at = e.indexOf('@');
  return at < 1 ? e : e.slice(0, Math.min(3, at)) + '…' + e.slice(at);
}
function _srWhen_(unixSec) {
  if (!unixSec) return '—';
  try { return Utilities.formatDate(new Date(unixSec * 1000), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'); }
  catch (e) { return String(unixSec); }
}
/* シートにある customer_id / subscription_id の集合。列は見出し名で引く。 */
function _srSheetIds_() {
  var out = { cust: {}, sub: {}, ok: false };
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SR_SHEET);
  if (!sh) return out;
  var d = sh.getDataRange().getValues();
  if (!d.length) return out;
  var h = d[0].map(function (x) { return String(x || ''); });
  var iC = h.indexOf('customer_id');
  var iS = h.indexOf('subscription_id');
  if (iS < 0) iS = h.indexOf('sub_id');
  out.ok = true;
  for (var r = 1; r < d.length; r++) {
    if (iC >= 0 && d[r][iC]) out.cust[String(d[r][iC]).trim()] = r + 1;
    if (iS >= 0 && d[r][iS]) out.sub[String(d[r][iS]).trim()] = r + 1;
  }
  return out;
}

/* ============================================================
 * resyncSubscriptionsByEmail — 1 名分を Stripe から取り込み直す
 * ============================================================ */
function resyncSubscriptionsByEmail(email, opts) {
  opts = opts || {};
  var APPLY = opts.apply === true;
  var L = function (s) { Logger.log(s); };

  var mail = String(email || '').trim();
  if (!mail) { L('メールアドレスを渡してください: resyncSubscriptionsByEmail(\'x@y.com\')'); return; }
  if (typeof fetchStripe_ !== 'function') {
    L('⛔ fetchStripe_ がこのプロジェクトにありません。Stripe 連携のコードが入っているプロジェクトで実行してください。');
    return;
  }

  L('=== Stripe 照会' + (APPLY ? '（取り込み実行）' : '（確認のみ・書き込みません）') + ' : ' + _srMask_(mail) + ' ===');

  var cres;
  try {
    cres = fetchStripe_('https://api.stripe.com/v1/customers?limit=100&email=' + encodeURIComponent(mail));
  } catch (err) {
    L('⛔ Stripe 照会に失敗: ' + err); return;
  }
  var customers = (cres && cres.data) || [];
  if (!customers.length) {
    L('⛔ このメールの Customer が Stripe にありません。');
    L('   → 決済に使われたメールがアプリの登録メールと違う可能性が高いです。');
    L('     Stripe 側の実際のメールが分かれば、スクリプトプロパティ SUB_EMAIL_ALIASES に');
    L('     {"' + mail + '":"<決済メール>"} を足して diagnoseAccess を再実行してください。');
    return;
  }
  L('Customer ' + customers.length + ' 件:');

  var known = _srSheetIds_();
  if (!known.ok) { L('⛔ SUBSCRIPTIONS シートが見つかりません'); return; }

  var imported = 0, alreadyThere = 0, seen = 0;

  customers.forEach(function (c) {
    L('');
    L('  ・' + c.id + ' / ' + _srMask_(c.email) + ' / 作成 ' + _srWhen_(c.created));
    if (String(c.email || '').toLowerCase().trim() !== mail.toLowerCase()) {
      L('    ⚠ Stripe 側のメールが照会値と異なります（別名の可能性）');
    }
    var sres;
    try {
      sres = fetchStripe_('https://api.stripe.com/v1/subscriptions?limit=100&status=all&customer=' + encodeURIComponent(c.id));
    } catch (err) { L('    ⛔ subscriptions 照会に失敗: ' + err); return; }
    var subs = (sres && sres.data) || [];
    if (!subs.length) { L('    契約なし（支払いはあるが subscription が作られていない可能性）'); return; }

    subs.forEach(function (s) {
      seen++;
      var inSheet = !!(known.sub[s.id] || known.cust[c.id]);
      L('    - ' + s.id + ' / status=' + s.status + ' / 開始 ' + _srWhen_(s.created) +
        ' / シート: ' + (inSheet ? '有り(行' + (known.sub[s.id] || known.cust[c.id]) + ')' : '**無し**'));
      if (inSheet) { alreadyThere++; return; }
      if (!APPLY) return;
      if (typeof upsertSubscriptionFromSub_ !== 'function') {
        L('      ⛔ upsertSubscriptionFromSub_ がありません（webhook 側のコードが未導入）');
        return;
      }
      try {
        upsertSubscriptionFromSub_(s);
        imported++;
        L('      ✓ SUBSCRIPTIONS に取り込みました');
      } catch (err) {
        L('      ⛔ 取り込みに失敗: ' + err);
      }
    });
  });

  L('');
  L('--------');
  L('Stripe 上の契約 ' + seen + ' 件 / シートに既にある ' + alreadyThere + ' 件 / ' +
    (APPLY ? ('取り込み ' + imported + ' 件') : ('取り込み可能 ' + (seen - alreadyThere) + ' 件')));
  if (!APPLY && seen - alreadyThere > 0) {
    L('→ 取り込むには resyncSubscriptionsByEmail(\'' + mail + '\', {apply:true})');
  }
  if (APPLY && imported) {
    L('→ 続けて diagnoseAccess(\'' + mail + '\') を実行し、user_id の紐づけを確認してください。');
  }
}

/* ============================================================
 * auditStripeSubscriptionsNotInSheet — webhook の取りこぼしを一覧
 *
 * Stripe で active / trialing なのに SUBSCRIPTIONS に行が無い契約を出す。
 * 確認のみ（書き込みなし）。件数が多ければ webhook 自体の不具合を疑う。
 * ============================================================ */
function auditStripeSubscriptionsNotInSheet(opts) {
  opts = opts || {};
  var LIMIT = Number(opts.max || 300);
  var L = function (s) { Logger.log(s); };
  if (typeof fetchStripe_ !== 'function') {
    L('⛔ fetchStripe_ がこのプロジェクトにありません。'); return;
  }

  var known = _srSheetIds_();
  if (!known.ok) { L('⛔ SUBSCRIPTIONS シートが見つかりません'); return; }

  L('=== Stripe で有効なのにシートに無い契約（確認のみ） ===');
  var missing = 0, checked = 0, starting = '';
  for (var page = 0; page < 10; page++) {
    var url = 'https://api.stripe.com/v1/subscriptions?limit=100&status=all' +
              (starting ? ('&starting_after=' + encodeURIComponent(starting)) : '');
    var res;
    try { res = fetchStripe_(url); } catch (err) { L('⛔ 照会に失敗: ' + err); break; }
    var data = (res && res.data) || [];
    if (!data.length) break;
    for (var i = 0; i < data.length; i++) {
      var s = data[i];
      checked++;
      starting = s.id;
      if (checked > LIMIT) break;
      if (['active', 'trialing'].indexOf(String(s.status)) === -1) continue;
      var cust = typeof s.customer === 'string' ? s.customer : (s.customer && s.customer.id) || '';
      if (known.sub[s.id] || (cust && known.cust[cust])) continue;
      missing++;
      L('  ⛔ ' + s.id + ' / customer=' + cust + ' / status=' + s.status + ' / 開始 ' + _srWhen_(s.created));
    }
    if (checked > LIMIT || !res.has_more) break;
  }
  L('--------');
  L('確認 ' + checked + ' 件 / シートに無い有効契約 ' + missing + ' 件');
  if (missing) {
    L('→ 1 件ずつ直すなら resyncSubscriptionsByEmail(\'<その方のメール>\', {apply:true})');
    L('→ 件数が多い場合は webhook（checkout.session.completed / customer.subscription.*）の');
    L('   受信設定とエラーログを確認してください。取りこぼしが構造的に起きています。');
  }
  return missing;
}
