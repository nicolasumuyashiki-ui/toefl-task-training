/**
 * gas-subscription-email-alias.js
 *
 * 「Stripe の決済メール」と「アプリの登録メール」が違うお客さまを、
 * 登録した瞬間に自動で SUBSCRIPTIONS.user_id へ紐づけるための仕組み。
 *
 * ■ 背景
 * SUBSCRIPTIONS の user_id は、以下の順で埋まる想定になっている。
 *   1) 決済に client_reference_id（= userId）が乗っていた場合    … アプリ内決済（billing.html / #185）
 *   2) SUBSCRIPTIONS.email が USERS.email と一致した場合          … lookupUserIdByEmail_ / backfillSubscriptionUserIdsV2
 * ところが、
 *   - 保護者がカードで支払い、生徒がアプリを使う
 *   - 会社カード・法人アドレスで決済
 *   - Apple Pay / Google Pay が別のアドレスを送る
 *   - 申込フォームは PC のメール、決済は別のメール
 * といった理由で 2) の一致が成立しないことが実際に起きる。この場合、
 * user_id は空欄のままで、お客さまは決済済みなのにアプリを使えない。
 *
 * ■ この仕組み
 * 「アプリの登録メール → 決済メール」の対応表を **Script Properties** に置き、
 * 紐づけ処理がその別名も見に行くようにする。対応表をコードに書かないのは、
 * docs/ が GitHub Pages でそのまま公開配信されるため（個人情報を置かない）。
 *
 * ■ 設定手順
 *   1. GAS エディタ → 左の歯車「プロジェクトの設定」
 *      → 「スクリプト プロパティ」→「スクリプト プロパティを追加」
 *   2. プロパティ名: SUB_EMAIL_ALIASES
 *      値: JSON で「アプリの登録メール」: 「Stripe の決済メール」
 *
 *        {"student@example.com":"payer@example.net"}
 *
 *      複数ある場合はカンマ区切りで並べる:
 *
 *        {"a@example.com":"payer-a@example.net","b@example.com":"payer-b@example.net"}
 *
 *      ※ 大文字小文字は自動で吸収されるのでそのまま貼ってよい。
 *   3. 下の BLOCK 1・BLOCK 2 を GAS に貼る（BLOCK 3 は任意）
 *   4. 保存 → デプロイ → デプロイを管理 → 鉛筆 → 新バージョン → デプロイ
 *
 * ■ 効果
 * 対応表に載っているアドレスで新規登録が行われると、handleRegister_ の中から
 * linkSubscriptionByEmail_ が走り、**登録完了の時点で** user_id が埋まる。
 * お客さまはそのまま menu.html に入れる（billing.html に飛ばされないので、
 * 二重決済の事故も起きない）。
 *
 * ■ 安全性
 *   - user_id が既に入っている行には **絶対に書き込まない**（上書きしない）。
 *   - 一致するのは、対応表に明示したアドレスだけ。空欄同士では一致しない。
 *   - 対応表が未設定でも、従来どおりの「同じメール同士の一致」で動作する。
 */


// =============================================================
// BLOCK 1 — 別名テーブルのヘルパー（新規・どこに貼ってもよい）
// =============================================================

/* Script Property `SUB_EMAIL_ALIASES` を読む。
   戻り値は { アプリの登録メール(小文字) : 決済メール(小文字) }。
   未設定・JSON が壊れている場合は空オブジェクトを返し、
   呼び出し側は従来どおりの挙動にフォールバックする。 */
function _subEmailAliases_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('SUB_EMAIL_ALIASES');
    if (!raw) return {};
    var map = JSON.parse(raw);
    var out = {};
    Object.keys(map).forEach(function (k) {
      var from = String(k).toLowerCase().trim();
      var to   = String(map[k] || '').toLowerCase().trim();
      if (from && to) out[from] = to;
    });
    return out;
  } catch (e) {
    Logger.log('SUB_EMAIL_ALIASES の読み取りに失敗: ' + e);
    return {};
  }
}

/* 逆引き { 決済メール : アプリの登録メール }。backfill 側で使う。 */
function _subEmailAliasesReverse_() {
  var m = _subEmailAliases_();
  var out = {};
  Object.keys(m).forEach(function (appEmail) { out[m[appEmail]] = appEmail; });
  return out;
}

/* アプリの登録メールから、SUBSCRIPTIONS を探すときの候補アドレス一覧を作る。
   別名が登録されていればそれも候補に加える。 */
function _subscriptionLookupEmails_(email) {
  var e = String(email || '').toLowerCase().trim();
  if (!e) return [];
  var list = [e];
  var alias = _subEmailAliases_()[e];
  if (alias && list.indexOf(alias) === -1) list.push(alias);
  return list;
}


// =============================================================
// BLOCK 2 — linkSubscriptionByEmail_ を「まるごと」差し替える
// =============================================================
// 既存の linkSubscriptionByEmail_ を削除し、この版に置き換える。
// 呼び出し側（handleRegister_ / handleLogin_）の変更は不要。

function linkSubscriptionByEmail_(userId, email) {
  userId = String(userId || '').trim();
  var candidates = _subscriptionLookupEmails_(email);
  if (!userId || !candidates.length) return 0;

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SUBSCRIPTIONS');
  if (!sh) return 0;

  var d = sh.getDataRange().getValues();
  if (d.length < 2) return 0;

  var headers = d[0];
  var iUserId = headers.indexOf('user_id');
  var iEmail  = headers.indexOf('email');
  if (iUserId < 0 || iEmail < 0) return 0;

  var filled = 0;
  for (var r = 1; r < d.length; r++) {
    // 既に user_id が入っている行には触れない（他人の契約を奪わないため）。
    if (String(d[r][iUserId] || '').trim() !== '') continue;

    var rowEmail = String(d[r][iEmail] || '').toLowerCase().trim();
    if (!rowEmail) continue;
    if (candidates.indexOf(rowEmail) === -1) continue;

    sh.getRange(r + 1, iUserId + 1).setValue(userId);
    filled++;
  }

  if (filled) {
    Logger.log('linkSubscriptionByEmail_: userId=' + userId +
               ' に SUBSCRIPTIONS ' + filled + ' 行を紐づけました');
  }
  return filled;
}


// =============================================================
// BLOCK 3 —（任意）日次 backfill も別名を見るようにする
// =============================================================
// backfillSubscriptionUserIdsV2 は「SUBSCRIPTIONS.email → USERS.email」の
// 向きで照合するため、別名は逆引きが必要。既存関数の Tier 1 の直後に
// 下の 4 行を足すと、登録が先に済んでいたお客さまも日次で拾えるようになる。
//
//   // Tier 1: existing sheet email
//   var sheetEmail = String(subD[r][iEmail] || '').toLowerCase().trim();
//   if (sheetEmail) {
//     resolved = emailToId[sheetEmail] || '';
//   }
//
//   // --- ここから追加 ---
//   if (!resolved && sheetEmail) {
//     var aliasApp = _subEmailAliasesReverse_()[sheetEmail];
//     if (aliasApp) resolved = emailToId[aliasApp] || '';
//   }
//   // --- ここまで ---
//
// これを入れておくと、対応表を後から追加した場合でも、翌日の
// runDailyBackfill() で自動的に埋まる。


// =============================================================
// 動作確認 — GAS エディタから直接実行できる
// =============================================================
// 関数を選んで実行し、ログを確認する。シートは書き換えない。
function checkSubEmailAliases() {
  var m = _subEmailAliases_();
  var keys = Object.keys(m);
  if (!keys.length) {
    Logger.log('SUB_EMAIL_ALIASES が未設定です（従来どおり同一メールのみ照合します）');
    return;
  }
  Logger.log('登録されている別名: ' + keys.length + ' 件');

  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SUBSCRIPTIONS');
  if (!sh) { Logger.log('SUBSCRIPTIONS シートが見つかりません'); return; }
  var d = sh.getDataRange().getValues();
  var headers = d[0];
  var iUserId = headers.indexOf('user_id');
  var iEmail  = headers.indexOf('email');

  keys.forEach(function (appEmail) {
    var payEmail = m[appEmail];
    var hit = 0, already = 0;
    for (var r = 1; r < d.length; r++) {
      if (String(d[r][iEmail] || '').toLowerCase().trim() !== payEmail) continue;
      if (String(d[r][iUserId] || '').trim() !== '') { already++; continue; }
      hit++;
    }
    // メールアドレスそのものはログに出さない（実行ログも共有され得るため）。
    Logger.log('別名 #' + (keys.indexOf(appEmail) + 1) +
               ' → 紐づけ待ちの行: ' + hit + ' / 紐づけ済みの行: ' + already);
  });
}


// =============================================================
// BLOCK 4 — 別名を使って「既存の」SUBSCRIPTIONS 行を埋める
// =============================================================
// なぜ必要か:
//   BLOCK 2 の linkSubscriptionByEmail_ は handleRegister_ / handleLogin_
//   から呼ばれるので、別名が効くのは **お客さまが次にログイン（または新規
//   登録）したとき**。既に SUBSCRIPTIONS に空欄の行がある状態で別名を
//   足しても、それだけでは何も起きない。
//
//   また backfillSubscriptionUserIdsV2（docs/gas-subscription-userid-
//   fallback-v2.js）は SUBSCRIPTIONS.email / Stripe の customer.email を
//   USERS.email と **直接** 突き合わせるだけで、別名表は見ない。
//   つまり「決済メール ≠ 登録メール」の行は、あの backfill を何度流しても
//   埋まらない。
//
//   この関数はその隙間を埋める。既存関数には一切手を触れない独立版なので、
//   貼り付けても他の挙動は変わらない。
//
// 使い方（GAS エディタで関数を選んで実行 → 実行ログを見る）:
//   backfillSubscriptionUserIdsByAlias()             … 確認のみ（既定）
//   backfillSubscriptionUserIdsByAlias({apply:true}) … 実際に user_id を埋める
//
// 安全性:
//   - 触るのは SUBSCRIPTIONS の user_id 列のみ。しかも **空欄の行だけ**。
//     既に入っている user_id は絶対に上書きしない（他人の契約を奪わない）。
//   - USERS は読むだけ。ANSWERS / PT_RESULTS / BANDS には一切触れない。
//   - 別名表に明示したアドレスとしか一致しない。空欄同士では一致しない。

function backfillSubscriptionUserIdsByAlias(opts) {
  opts = opts || {};
  var APPLY = opts.apply === true;

  var aliases = _subEmailAliases_();          // { 登録メール : 決済メール }
  var keys = Object.keys(aliases);
  if (!keys.length) {
    Logger.log('SUB_EMAIL_ALIASES が未設定です。先に対応表を登録してください。');
    return 0;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('SUBSCRIPTIONS');
  if (!sh) { Logger.log('SUBSCRIPTIONS シートが見つかりません'); return 0; }

  var d = sh.getDataRange().getValues();
  if (d.length < 2) { Logger.log('SUBSCRIPTIONS にデータ行がありません'); return 0; }

  var headers = d[0];
  var iUserId = headers.indexOf('user_id');
  var iEmail  = headers.indexOf('email');
  if (iUserId < 0 || iEmail < 0) {
    Logger.log('SUBSCRIPTIONS に user_id / email 列がありません');
    return 0;
  }

  // 決済メール → 登録メール（逆引き）
  var payToApp = _subEmailAliasesReverse_();

  // USERS: email → user_id
  var emailToId = {};
  var usersSh = ss.getSheetByName('USERS');
  if (usersSh) {
    var ud = usersSh.getDataRange().getValues();
    for (var u = 1; u < ud.length; u++) {
      var e = String(ud[u][3] || '').toLowerCase().trim();
      var id = String(ud[u][0] || '').trim();
      if (e && id) emailToId[e] = id;
    }
  }

  Logger.log('=== 別名による SUBSCRIPTIONS の紐づけ' +
             (APPLY ? '（実行）' : '（確認のみ・書き換えません）') + ' ===');
  Logger.log('登録されている別名: ' + keys.length + ' 件');

  var filled = 0, noAccount = 0;

  for (var r = 1; r < d.length; r++) {
    if (String(d[r][iUserId] || '').trim() !== '') continue;   // 埋まっている行は触らない

    var rowEmail = String(d[r][iEmail] || '').toLowerCase().trim();
    if (!rowEmail) continue;

    var appEmail = payToApp[rowEmail];
    if (!appEmail) continue;              // 別名表に載っていない行は対象外

    var uid = emailToId[appEmail] || '';
    if (!uid) {
      // 別名は登録済みだが、その登録メールのアカウントがまだ存在しない
      noAccount++;
      Logger.log('  △ 行' + (r + 1) + ' : 別名は登録済みですが、対応する' +
                 'アプリのアカウントがまだありません（ご登録のご案内が必要）');
      continue;
    }

    Logger.log('  ✓ 行' + (r + 1) + ' : user_id=' + uid + ' を紐づけ' +
               (APPLY ? 'ました' : 'られます'));
    if (APPLY) sh.getRange(r + 1, iUserId + 1).setValue(uid);
    filled++;
  }

  Logger.log('--------');
  Logger.log((APPLY ? '紐づけました: ' : '紐づけられる見込み: ') + filled + ' 行' +
             ' / アカウント未作成: ' + noAccount + ' 行');
  if (!APPLY && filled) {
    Logger.log('→ 実行するには backfillSubscriptionUserIdsByAlias({apply:true})');
  }
  if (filled && APPLY) {
    Logger.log('※ お客さまは再ログインすれば（キャッシュ次第では即座に）使えるようになります。');
  }
  return filled;
}
