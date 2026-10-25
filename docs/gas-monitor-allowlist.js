/**
 * gas-monitor-allowlist.js
 *
 * Moves the monitor / comp-tier allowlist out of client-side js/auth.js
 * (where it was visible via View Source) into the GAS backend, so the
 * emails never reach the browser.
 *
 * ⚠️ 個人情報を本ファイルに書かないこと（2026-08-07 監査で是正）
 *   このリポジトリは **public**、かつ `docs/` は GitHub Pages でそのまま
 *   配信される（リポジトリ直下に .nojekyll があるため）。したがって
 *   docs/ に書いたメールアドレスは
 *     - https://github.com/<owner>/<repo>/blob/main/docs/…
 *     - https://apps.tckworkshop.co.jp/toefl-task-training/docs/…
 *   の両方で誰でも閲覧できる。
 *   以前この位置に実在顧客のメールアドレス9件・氏名・login id が
 *   ベタ書きされていた（「emails never reach the browser」と書いた
 *   ファイル自身が公開配信されていた）。
 *   → 実データは **Script Properties** に置き、本ファイルには
 *     仕組みだけを書く。氏名・comp の経緯などもここには残さない。
 *
 * Paste flow:
 *   1. Script Properties に `MONITOR_EMAILS_JSON` を追加する。
 *      値は小文字のメールアドレスの JSON 配列。例:
 *        ["someone@example.com","another@example.net"]
 *      （⚙ プロジェクトの設定 → スクリプト プロパティ）
 *   2. BLOCK 1（下）を GAS の定数ブロック付近に貼る。
 *   3. 既存の `handleGetSubscription_` を BLOCK 2 で置き換える。
 *   4. `handleLogin_` に BLOCK 3 の 1 行を追加する。
 *   5. Save → Deploy → Manage deployments → 鉛筆 → New version → Deploy.
 *
 * モニターの追加・削除は Script Properties の値を編集するだけ。
 * 再デプロイもコード変更も不要になる（従来はコード編集＋再デプロイが必要だった）。
 *
 * 運用メモ: ここに登録すると APP へのアクセスが ¥0 になるだけで、
 * その人の Stripe サブスクは解約されない。実際に課金を止めるには
 * Stripe ダッシュボード側でも解約すること。
 * 誰がどの理由で comp なのか（goodwill comp の経緯・氏名・日付）は
 * **公開されない場所**に記録する（Script Properties のコメント欄、
 * 社内 Drive、非公開の運用メモ等）。
 */


// =============================================================
// BLOCK 1 — paste near the top of the GAS file (under DATETIME_FMT)
// =============================================================

/* Monitor / comp-tier accounts — these emails get an "active"
   subscription synthesised by GAS, so they can use all paid features
   without going through Stripe.

   実データは Script Properties `MONITOR_EMAILS_JSON`（小文字メールの
   JSON 配列）から読む。コードにも docs にも実アドレスを置かないため、
   public リポジトリ／GitHub Pages に載らない。
   未設定・JSON 破損時は空リストになり、comp が効かなくなるだけで
   他機能は壊れない（fail-closed）。 */
function getMonitorEmails_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('monitor_emails');
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  var out = [];
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('MONITOR_EMAILS_JSON');
    if (raw) {
      var arr = JSON.parse(raw);
      if (Object.prototype.toString.call(arr) === '[object Array]') {
        for (var i = 0; i < arr.length; i++) {
          var em = String(arr[i] || '').toLowerCase().trim();
          if (em) out.push(em);
        }
      }
    }
  } catch (err) {
    Logger.log('MONITOR_EMAILS_JSON の読み取りに失敗: ' + err);
    return [];
  }
  try { cache.put('monitor_emails', JSON.stringify(out), 300); } catch (e) {}
  return out;
}

function isMonitorEmail_(email) {
  if (!email) return false;
  return getMonitorEmails_().indexOf(String(email).toLowerCase().trim()) !== -1;
}


// =============================================================
// BLOCK 2 — REPLACE your existing handleGetSubscription_ with this
// =============================================================

function handleGetSubscription_(e, callback) {
  var u = verifyUser_(e.parameter.id, e.parameter.pass);
  if (!u) return jsonpResponse_(callback, { success: false, error: 'auth_failed' });

  // Monitor / comp-tier — return synthetic active subscription.
  if (isMonitorEmail_(u.email)) {
    return jsonpResponse_(callback, {
      success: true,
      subscription: {
        status: 'active',
        plan_id: 'monitor_comp',
        plan_name: 'TCK Reps · Monitor',
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
  var sub = rows.filter(function(r){ return String(r.user_id) === String(u.userId); })
                .sort(function(a,b){ return (b.updated_at || '').localeCompare(a.updated_at || ''); })[0];
  return jsonpResponse_(callback, { success: true, subscription: sub || null });
}


// =============================================================
// BLOCK 3 — patch handleLogin_ to surface isMonitor flag
// =============================================================
// In your existing handleLogin_, the success return looks like:
//
//   return jsonpResponse_(callback, {
//     success: true,
//     userId: String(d[i][0]),
//     userName: String(d[i][2] || ''),
//     email: String(d[i][3] || ''),
//     mustChangePassword: mustChange
//   });
//
// ADD ONE LINE so it becomes:
//
//   return jsonpResponse_(callback, {
//     success: true,
//     userId: String(d[i][0]),
//     userName: String(d[i][2] || ''),
//     email: String(d[i][3] || ''),
//     mustChangePassword: mustChange,
//     isMonitor: isMonitorEmail_(String(d[i][3] || ''))   // <-- ADD THIS
//   });
//
// index.html consumes `isMonitor` to skip the TCK-domain check for
// comp-tier accounts.


// =============================================================
// 移行用ヘルパー — 現行のベタ書きリストを Script Properties へ移す
// =============================================================
// GAS 側にまだ `var MONITOR_EMAILS = [...]` が残っている場合、
// 一度だけ実行するとその中身を Script Properties へ移送できる。
// 実行後は GAS から `var MONITOR_EMAILS = [...]` を削除すること。
//
// function migrateMonitorEmailsOnce() {
//   PropertiesService.getScriptProperties()
//     .setProperty('MONITOR_EMAILS_JSON', JSON.stringify(MONITOR_EMAILS));
//   CacheService.getScriptCache().remove('monitor_emails');
//   Logger.log('移送しました: ' + MONITOR_EMAILS.length + ' 件');
//   Logger.log('★ GAS から var MONITOR_EMAILS = [...] を削除してください');
// }
