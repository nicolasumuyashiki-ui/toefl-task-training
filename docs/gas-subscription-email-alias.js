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

/* メールを伏せ字にする（ログは共有され得るので全文は出さない）。
   ドメインは残す。`happycloversae524@gmai.com` → `hap…@gmai.com`
   ＝ gmail/gmai のような綴り間違いはこの形でも見抜ける。 */
function _subMaskEmail_(e) {
  e = String(e || '');
  var at = e.indexOf('@');
  if (at < 1) return '(不正な形式)';
  return e.slice(0, Math.min(3, at)) + '…' + e.slice(at);
}

/* よくある設定ミス: `SUB_EMAIL_ALIASES 2` のように別名のプロパティを
   増やしてしまうケース。コードが読むのは `SUB_EMAIL_ALIASES` ただ 1 つで、
   似た名前のプロパティは **エラーも出さずに完全に無視される**。
   気づきようがないので、ここで明示的に警告する。 */
function _subWarnStrayAliasProps_() {
  var all;
  try { all = PropertiesService.getScriptProperties().getProperties(); }
  catch (e) { return; }
  var strays = Object.keys(all).filter(function (k) {
    return k !== 'SUB_EMAIL_ALIASES' &&
           k.replace(/[\s_-]/g, '').toUpperCase().indexOf('SUBEMAILALIAS') === 0;
  });
  if (!strays.length) return;
  Logger.log('⚠ 読み込まれないプロパティがあります: ' + strays.join(' / '));
  Logger.log('  コードが読むのは SUB_EMAIL_ALIASES ただ 1 つです。');
  Logger.log('  別名が複数ある場合は 1 つの JSON にまとめてください:');
  Logger.log('    {"登録メールA":"決済メールA","登録メールB":"決済メールB"}');
  Logger.log('  まとめたら、上記の余分なプロパティは削除してください。');
  Logger.log('');
}

function checkSubEmailAliases() {
  _subWarnStrayAliasProps_();

  var m = _subEmailAliases_();
  var keys = Object.keys(m);
  if (!keys.length) {
    Logger.log('SUB_EMAIL_ALIASES が未設定です（従来どおり同一メールのみ照合します）');
    Logger.log('※ 値を入れたのにこう出る場合は JSON が壊れています。');
    Logger.log('   波括弧・二重引用符・カンマを確認してください。');
    return;
  }
  Logger.log('登録されている別名: ' + keys.length + ' 件');

  // USERS に「登録メール」側のアカウントが実在するかを先に見る。
  // ここで見つからない = 綴り間違いか、そもそも未登録。
  var usersSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('USERS');
  var known = {};
  if (usersSh) {
    var ud = usersSh.getDataRange().getValues();
    for (var u = 1; u < ud.length; u++) {
      var ue = String(ud[u][3] || '').toLowerCase().trim();
      if (ue) known[ue] = true;
    }
  }
  keys.forEach(function (appEmail) {
    if (usersSh && !known[appEmail]) {
      Logger.log('⚠ 別名 #' + (keys.indexOf(appEmail) + 1) +
                 ' の登録メール ' + _subMaskEmail_(appEmail) +
                 ' が USERS にありません。');
      Logger.log('   綴り間違い（例 gmail → gmai）か、まだご登録がないかのどちらかです。');
    }
  });

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


// =============================================================
// BLOCK 5 — 単独で動く設定チェック（これ 1 つだけ貼れば動く）
// =============================================================
// BLOCK 1〜4 が GAS 側に無くても・貼り付け事故で消えていても動くように、
// 他の関数に **一切依存しない** 自己完結版として書いてある。
// 過去に「checkSubEmailAliases is not defined」が複数回起きているため。
//
// 使い方: GAS エディタでこの関数を選んで実行 → 実行ログを見るだけ。
//         シートもプロパティも**一切書き換えない**。
//
// 見るもの:
//   ① SUB_EMAIL_ALIASES に似た名前の余計なプロパティ（読まれずに無視される）
//   ② JSON として壊れていないか
//   ③ 向きが逆になっていないか（キー＝登録メール / 値＝決済メール）
//   ④ キー（登録メール）が USERS に実在するか ← 綴り間違いの検出
//   ⑤ 値（決済メール）が SUBSCRIPTIONS にあるか・もう紐づいているか

function checkAliasSetup() {
  var L = function (s) { Logger.log(s); };
  L('===== 別名設定の点検（読み取りのみ） =====');

  // ---- ① 余計なプロパティ ----
  var all = {};
  try { all = PropertiesService.getScriptProperties().getProperties() || {}; }
  catch (e) { L('スクリプトプロパティを読めません: ' + e); return; }

  var strays = Object.keys(all).filter(function (k) {
    return k !== 'SUB_EMAIL_ALIASES' &&
           k.replace(/[\s_-]/g, '').toUpperCase().indexOf('SUBEMAILALIAS') === 0;
  });
  if (strays.length) {
    L('⚠ 読み込まれないプロパティ: ' + strays.join(' / '));
    L('   コードが読むのは SUB_EMAIL_ALIASES ただ 1 つだけです。');
    L('   複数の別名は 1 つの JSON にまとめ、余計なプロパティは削除してください:');
    L('     {"登録メールA":"決済メールA","登録メールB":"決済メールB"}');
    L('');
  }

  // ---- ② JSON の妥当性 ----
  var raw = all['SUB_EMAIL_ALIASES'];
  if (!raw) { L('⛔ SUB_EMAIL_ALIASES が未設定です。'); return; }

  var map;
  try { map = JSON.parse(raw); }
  catch (e) {
    L('⛔ SUB_EMAIL_ALIASES の JSON が壊れています: ' + e);
    L('   波括弧 {} ・二重引用符 " ・カンマ , を確認してください。');
    L('   全角の “ ” ではなく半角の " を使うこと。');
    return;
  }
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    L('⛔ SUB_EMAIL_ALIASES が {"a":"b"} 形式のオブジェクトではありません。');
    return;
  }

  var pairs = Object.keys(map).map(function (k) {
    return { app: String(k).toLowerCase().trim(),
             pay: String(map[k] || '').toLowerCase().trim() };
  }).filter(function (p) { return p.app && p.pay; });

  L('登録されている別名: ' + pairs.length + ' 件');
  if (!pairs.length) { L('⛔ 有効な組が 1 件もありません。'); return; }

  var mask = function (e) {
    var at = String(e).indexOf('@');
    return at < 1 ? '(不正)' : String(e).slice(0, Math.min(3, at)) + '…' + String(e).slice(at);
  };

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ---- USERS: email → user_id ----
  var known = {};
  var usersSh = ss.getSheetByName('USERS');
  if (usersSh) {
    var ud = usersSh.getDataRange().getValues();
    for (var u = 1; u < ud.length; u++) {
      var ue = String(ud[u][3] || '').toLowerCase().trim();
      if (ue) known[ue] = String(ud[u][0] || '').trim();
    }
  } else { L('（USERS シートが見つからないため ④ は省略します）'); }

  // ---- SUBSCRIPTIONS ----
  var subD = null, iSubUser = -1, iSubEmail = -1;
  var subSh = ss.getSheetByName('SUBSCRIPTIONS');
  if (subSh) {
    subD = subSh.getDataRange().getValues();
    iSubUser  = subD[0].indexOf('user_id');
    iSubEmail = subD[0].indexOf('email');
    if (iSubUser < 0 || iSubEmail < 0) { subD = null; L('（SUBSCRIPTIONS に user_id / email 列が無いため ⑤ は省略します）'); }
  } else { L('（SUBSCRIPTIONS シートが見つからないため ⑤ は省略します）'); }

  var okAll = true;

  pairs.forEach(function (p, i) {
    L('');
    L('--- 別名 #' + (i + 1) + ' : ' + mask(p.app) + ' → ' + mask(p.pay) + ' ---');

    // ---- ③ 向きが逆になっていないか ----
    if (usersSh && !known[p.app] && known[p.pay]) {
      okAll = false;
      L('  ⛔ 向きが逆です。キーに決済メール、値に登録メールを書いています。');
      L('     正しくは {"' + mask(p.pay) + '":"' + mask(p.app) + '"} の向きです。');
      return;
    }

    // ---- ④ 登録メールが実在するか ----
    if (usersSh) {
      if (known[p.app]) {
        L('  ✅ 登録メールは USERS にあります（user_id=' + known[p.app] + '）');
      } else {
        okAll = false;
        L('  ⛔ 登録メール ' + mask(p.app) + ' が USERS にありません。');
        L('     綴り間違い（例 gmail → gmai）か、まだご登録がないかのどちらかです。');
        L('     未登録なら index.html?email=<決済メール> をお送りしてご登録いただきます。');
      }
    }

    // ---- ⑤ 決済メールの行の状態 ----
    if (subD) {
      var waiting = 0, linked = 0;
      for (var r = 1; r < subD.length; r++) {
        if (String(subD[r][iSubEmail] || '').toLowerCase().trim() !== p.pay) continue;
        if (String(subD[r][iSubUser] || '').trim() !== '') linked++; else waiting++;
      }
      if (waiting) {
        L('  ✅ SUBSCRIPTIONS に紐づけ待ちの行: ' + waiting + ' 件');
      } else if (linked) {
        L('  ✅ すでに紐づけ済み: ' + linked + ' 件（対応は不要です）');
      } else {
        okAll = false;
        L('  ⛔ 決済メール ' + mask(p.pay) + ' の行が SUBSCRIPTIONS にありません。');
        L('     決済メールの綴りを確認するか、Stripe の Customer の email と');
        L('     突き合わせてください。');
      }
    }
  });

  L('');
  L('=====');
  if (okAll) {
    L('設定に問題は見つかりませんでした。');
    L('次に backfillSubscriptionUserIdsByAlias() で実際の紐づけに進めます。');
  } else {
    L('上の ⛔ を直してから、もう一度この関数を実行してください。');
  }
}
