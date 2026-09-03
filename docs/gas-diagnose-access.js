/**
 * gas-diagnose-access.js
 *
 * 「入金しているのにアプリが使えない」お客さま 1 名について、
 * **なぜ使えないのかを特定し、その場で直す**ための単独ツール。
 *
 * ■ アプリのロックを解除している条件（これが全て）
 * `handleGetSubscription_` は SUBSCRIPTIONS を
 *     user_id === ログイン中の userId
 * で引き、その行の status が **active か trialing** のときだけ解錠する。
 * つまり使えない理由は次の 3 つしかない。
 *
 *   ① SUBSCRIPTIONS にその人の user_id が入っていない（空欄）
 *   ② user_id は入っているが status が active / trialing 以外
 *   ③ そもそもその人の行が SUBSCRIPTIONS に無い
 *
 * INVOICES.user_id は**解錠に一切関係しない**。請求履歴の帰属にしか使わない。
 *
 * ■ 使い方（GAS エディタで関数を選んで実行 → 実行ログを見る）
 *   diagnoseAccess('お名前の一部')                  … 確認のみ（既定）
 *   diagnoseAccess('メールアドレス')                … メールでも引ける
 *   diagnoseAccess('お名前', {apply:true})          … ①を直す（user_id を書く）
 *   diagnoseAccess('お名前', {apply:true, activate:true})
 *                                                  … ①に加えて②も直す
 *                                                    （status を active にする）
 *
 * ■ 安全性
 *   - 触るのは **SUBSCRIPTIONS の user_id 列と status 列だけ**。
 *   - user_id は **空欄の行にしか書かない**（他人の契約を奪わない）。
 *   - status の書き換えは `activate:true` を明示したときだけ。**入金の事実を
 *     ご自身で確認してから**使うこと（Stripe 側が active でないのに解錠して
 *     しまわないため）。
 *   - USERS / INVOICES は読むだけ。ANSWERS / PT_RESULTS / BANDS には触れない。
 *
 * ■ 直したあと
 *   お客さまは**ページを再読み込みするだけ**で入れる。
 *   ロック判定は「使えない」という結果をキャッシュしない実装なので
 *   （auth.js が negative cache を必ず削除する）、
 *   **Ctrl+Shift+R も再ログインも案内しなくてよい。**
 */

var DA_OK_STATUS = ['active', 'trialing'];

function _daMask_(e) {
  e = String(e || '');
  var at = e.indexOf('@');
  return at < 1 ? e : e.slice(0, Math.min(3, at)) + '…' + e.slice(at);
}

function diagnoseAccess(who, opts) {
  opts = opts || {};
  var APPLY    = opts.apply === true;
  var ACTIVATE = opts.activate === true;
  var L = function (s) { Logger.log(s); };

  var needle = String(who || '').toLowerCase().trim();
  if (!needle) { L('引数が空です。diagnoseAccess(\'お名前の一部\') のように呼んでください'); return; }

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ---- USERS からご本人を特定 ----
  var usersSh = ss.getSheetByName('USERS');
  if (!usersSh) { L('USERS シートが見つかりません'); return; }
  var ud = usersSh.getDataRange().getValues();

  var hits = [];
  for (var u = 1; u < ud.length; u++) {
    var uid  = String(ud[u][0] || '').trim();
    var name = String(ud[u][2] || '').trim();
    var mail = String(ud[u][3] || '').toLowerCase().trim();
    if (!uid) continue;
    if (mail === needle || uid.toLowerCase() === needle || name.toLowerCase().indexOf(needle) !== -1) {
      hits.push({ userId: uid, name: name, email: mail });
    }
  }

  if (!hits.length) {
    L('⛔ 「' + who + '」に一致するアカウントが USERS にありません。');
    L('   ＝ まだアプリにご登録がありません。');
    L('   対処: index.html?email=<決済に使ったメール> をお送りしてご登録いただく。');
    L('        このリンクはメール欄を固定するので、登録＝決済メールの一致が保証されます。');
    return;
  }
  // 同一人物が複数アカウントを作っている場合、どれに紐づけるかは
  // こちらでは決められない。**書き込みは行わず**、確認だけして止める。
  // （自動で選ぶと、本人が使っていない方のアカウントに契約を付けてしまう）
  if (hits.length > 1) {
    L('⚠ 該当アカウントが ' + hits.length + ' 件あります（同一人物の重複登録の可能性）');
    hits.forEach(function (p) {
      L('   ・user_id=' + p.userId + ' / ' + _daMask_(p.email) + ' / ' + p.name);
    });
    if (APPLY) {
      APPLY = false; ACTIVATE = false;
      L('   → どちらに紐づけるか判断できないため、**書き込みは行いません**。');
      L('     ご本人が実際にログインしている方の user_id を直接指定してください:');
      L('       diagnoseAccess(\'' + hits[0].userId + '\', {apply:true, activate:true})');
      L('     どちらを使っているかは USERS の最終ログイン日時が新しい方で判断できます。');
    }
    L('');
  }

  // ---- SUBSCRIPTIONS ----
  var subSh = ss.getSheetByName('SUBSCRIPTIONS');
  if (!subSh) { L('SUBSCRIPTIONS シートが見つかりません'); return; }
  var sd = subSh.getDataRange().getValues();
  var h  = sd[0];
  var iU = h.indexOf('user_id'), iE = h.indexOf('email'), iS = h.indexOf('status');
  var iC = h.indexOf('customer_id');
  if (iU < 0 || iE < 0 || iS < 0) { L('SUBSCRIPTIONS に user_id / email / status 列がありません'); return; }

  // 別名表（あれば）: 登録メール → 決済メール
  var alias = {};
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('SUB_EMAIL_ALIASES');
    if (raw) {
      var m = JSON.parse(raw);
      Object.keys(m).forEach(function (k) {
        alias[String(k).toLowerCase().trim()] = String(m[k] || '').toLowerCase().trim();
      });
    }
  } catch (e) {}

  hits.forEach(function (p) {
    L('');
    L('════════════════════════════════════');
    L(p.name + ' / user_id=' + p.userId + ' / ' + _daMask_(p.email));

    var candidates = [p.email];
    if (alias[p.email] && candidates.indexOf(alias[p.email]) === -1) candidates.push(alias[p.email]);

    var byUser = [], byMail = [];
    for (var r = 1; r < sd.length; r++) {
      var rowUser = String(sd[r][iU] || '').trim();
      var rowMail = String(sd[r][iE] || '').toLowerCase().trim();
      if (rowUser === p.userId) byUser.push(r);
      else if (rowMail && candidates.indexOf(rowMail) !== -1) byMail.push(r);
    }

    // ---- 既に紐づいている行があるか ----
    if (byUser.length) {
      var unlocked = false;
      byUser.forEach(function (r) {
        var st = String(sd[r][iS] || '').toLowerCase().trim();
        var ok = DA_OK_STATUS.indexOf(st) !== -1;
        L('  行' + (r + 1) + ' : user_id 紐づけ済み / status="' + (st || '(空)') + '" ' + (ok ? '✅' : '⛔'));
        if (ok) unlocked = true;
      });
      if (unlocked) {
        L('  → ✅ 解錠条件を満たしています。');
        L('     それでも使えない場合はご本人の**ログインアカウント違い**を疑ってください');
        L('     （別のメールで作った 2 つ目のアカウントでログインしている等）。');
        return;
      }
      L('  → ⛔ 原因②: status が active / trialing ではありません。');
      if (APPLY && ACTIVATE) {
        subSh.getRange(byUser[0] + 1, iS + 1).setValue('active');
        L('  ✓ 行' + (byUser[0] + 1) + ' の status を active にしました。');
      } else {
        L('     Stripe 側で課金が有効なことを確認のうえ、');
        L('     diagnoseAccess(\'' + who + '\', {apply:true, activate:true}) で解錠できます。');
      }
      return;
    }

    // ---- メールで見つかるが user_id が空 ----
    if (byMail.length) {
      L('  → ⛔ 原因①: 契約の行はありますが user_id が空です。');
      byMail.forEach(function (r) {
        var st = String(sd[r][iS] || '').toLowerCase().trim();
        L('     行' + (r + 1) + ' : ' + _daMask_(String(sd[r][iE] || '')) +
          ' / status="' + (st || '(空)') + '"' +
          (iC >= 0 ? ' / ' + String(sd[r][iC] || '') : ''));
      });
      if (APPLY) {
        var r0 = byMail[0];
        subSh.getRange(r0 + 1, iU + 1).setValue(p.userId);
        L('  ✓ 行' + (r0 + 1) + ' に user_id=' + p.userId + ' を書きました。');
        var st0 = String(sd[r0][iS] || '').toLowerCase().trim();
        if (DA_OK_STATUS.indexOf(st0) === -1) {
          if (ACTIVATE) {
            subSh.getRange(r0 + 1, iS + 1).setValue('active');
            L('  ✓ あわせて status を active にしました。');
          } else {
            L('  ⚠ ただし status が "' + (st0 || '(空)') + '" のままなので、まだ解錠されません。');
            L('     Stripe を確認のうえ {apply:true, activate:true} で再実行してください。');
            return;
          }
        }
        L('  → ✅ お客さまはページを再読み込みするだけで入れます。');
        L('     （「使えない」はキャッシュされない実装なので Ctrl+Shift+R は不要）');
      } else {
        L('     直すには diagnoseAccess(\'' + who + '\', {apply:true})');
      }
      return;
    }

    // ---- そもそも行が無い ----
    L('  → ⛔ 原因③: SUBSCRIPTIONS にこの方の行がありません。');
    L('     決済メールがアプリの登録メールと違う可能性が高いです。');
    L('     Stripe の Customer の email を確認し、スクリプトプロパティ');
    L('     SUB_EMAIL_ALIASES に {"' + p.email + '":"<決済メール>"} を足してから');
    L('     もう一度この関数を実行してください。');
    L('     （別名表は 1 つの JSON にまとめること。別名のプロパティ名は読まれません）');
  });
}
