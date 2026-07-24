/**
 * gas-subscription-client-ref.js — 根本原因の修正
 *
 * ■ これまで何度直しても user_id が空になっていた理由
 *   SUBSCRIPTIONS の user_id を埋める処理は、これまで全て次の2つだけに
 *   依存していた:
 *     (1) customer_id → user_id の対応表（lookupUserIdByCustomer_）
 *     (2) メール一致（lookupUserIdByEmail_ … Stripe 顧客のメール）
 *   どちらも「新規顧客（対応表に無い）」かつ「決済メール ≠ アカウント登録メール」
 *   だと外れる。すると user_id は空のまま → 課金ゲートが「未登録」と誤判定する。
 *   小山さま（決済 miwaza.koyama@icloud.com / 登録 miwazac86@gmail.com）が該当。
 *
 *   そして決定的な点: **どの GAS コードも client_reference_id を読んでいなかった**。
 *   client_reference_id は「サブスク開始ボタンを押した時にログインしていた
 *   アカウントの userId」で、決済メールが何であろうと本人を一意に特定できる
 *   唯一の値。これを使っていなかったため、メール不一致のたびに破綻していた。
 *
 * ■ この修正（フロントの billing.html #185 と対で機能する）
 *   billing.html は決済リンクに ?client_reference_id=<userId> を必ず載せる
 *   ようになった（#185）。その値は Stripe の `checkout.session.completed`
 *   イベントに `session.client_reference_id` として届く。本ファイルは、その
 *   イベントを受けて **customer_id ↔ userId を SUBSCRIPTIONS 行に権威的に
 *   バインド**する。以後 user_id が空になることはない。
 *
 * ■ デプロイ手順
 *   1. 本ファイルの関数を GAS プロジェクト末尾に貼り付け。
 *   2. Stripe webhook を捌いている doPost（イベント dispatch）に1行追加:
 *
 *        if (event.type === 'checkout.session.completed') {
 *          handleCheckoutSessionCompleted_(event.data.object);
 *          // ↓ 既存の他イベント処理はそのまま
 *        }
 *
 *      ※ 既に checkout.session.completed を処理している箇所があれば、その中で
 *        handleCheckoutSessionCompleted_(session) を呼ぶだけで良い。
 *   3. デプロイ → 新しいバージョン発行（API_URL は変えない）。
 *   4. （任意）既存の空 user_id 行のうち、決済時に client_reference_id を
 *      持っていた回は backfillUserIdFromCheckoutSessions() で後埋めできる。
 *
 * ■ 依存
 *   既存の upsertSubscriptionRow_（gas-subscription-userid-fallback-v2.js で
 *   customer_id をキーに upsert・空フィールドは既存値を維持）と fetchStripe_ を
 *   使う。無ければ両者を先にデプロイしておくこと。
 */

// ============================================================
// 権威バインド — checkout 完了時に client_reference_id を user_id へ
// ============================================================
function handleCheckoutSessionCompleted_(session) {
  if (!session) return;
  var uid      = String(session.client_reference_id || '').trim();
  var customer = String(session.customer || '').trim();
  if (!uid || !customer) return;   // client_reference_id 無し（旧リンク等）は従来経路に任せる

  // customer_id をキーに user_id を書き込む。upsertSubscriptionRow_ は
  // 空でないフィールドだけ上書きするので、既存行の他項目（status 等）は壊さない。
  // 行がまだ無ければ最小行を作り、後続の subscription.updated が肉付けする。
  upsertSubscriptionRow_({
    customer_id: customer,
    user_id: uid,
    updated_at: new Date().toISOString()
  });

  // 顧客メールもアカウントに寄せて記録しておく（監査・将来の照合用）。任意。
  try {
    if (session.customer_details && session.customer_details.email) {
      upsertSubscriptionRow_({ customer_id: customer, user_id: uid, email: String(session.customer_details.email) });
    }
  } catch (e) {}
}

// ============================================================
// （任意）後埋め — 既存の空 user_id 行を、決済時の client_reference_id で救済
// ============================================================
// 各空行について、その顧客の Checkout Session を Stripe API で引き、
// client_reference_id を読んで user_id を埋める。決済時に
// client_reference_id を持っていた回のみ救済できる（#185 デプロイ以降の回）。
// 決済時に付いていなかった古い回（例: 小山さまの 2026-07-24）は救済不可 →
// その回だけ手動で user_id 列を補完する。冪等（既に埋まった行はスキップ）。
function backfillUserIdFromCheckoutSessions() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SUBSCRIPTIONS');
  if (!sh) { Logger.log('SUBSCRIPTIONS not found'); return 0; }
  var d = sh.getDataRange().getValues();
  if (d.length < 2) return 0;
  var H = d[0];
  var iUid = H.indexOf('user_id'), iCust = H.indexOf('customer_id');
  if (iUid < 0 || iCust < 0) { Logger.log('missing column'); return 0; }

  var filled = 0;
  for (var r = 1; r < d.length; r++) {
    if (String(d[r][iUid] || '').trim() !== '') continue;
    var customer = String(d[r][iCust] || '').trim();
    if (!customer) continue;
    // その顧客の最新の Checkout Session を取得
    var res = fetchStripe_('https://api.stripe.com/v1/checkout/sessions?customer=' +
                           encodeURIComponent(customer) + '&limit=3');
    var sessions = (res && res.data) || [];
    var uid = '';
    for (var s = 0; s < sessions.length; s++) {
      var cri = String(sessions[s].client_reference_id || '').trim();
      if (cri) { uid = cri; break; }
    }
    if (uid) {
      sh.getRange(r + 1, iUid + 1).setValue(uid);
      filled++;
    }
  }
  Logger.log('backfillUserIdFromCheckoutSessions: 埋めた user_id=' + filled);
  return filled;
}
