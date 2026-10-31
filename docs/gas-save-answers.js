/**
 * gas-save-answers.js — ANSWERS 保存ハンドラ（デプロイ済み GAS の写し）
 *
 * ■ なぜこのファイルがあるか（2026-07-25 監査で判明した乖離）
 *   CLAUDE.md は docs/gas-*.js を「GAS にペースト＆デプロイする正本」として扱っているが、
 *   **実際にデプロイされている saveAnswers 実装（clientSaveId による重複排除を含む）が
 *   docs/ のどこにも存在しなかった**。そのため 2026-07-25 の監査で「GAS 側に重複排除は
 *   実装されていない」と誤判定した（実際には実装済み）。同じ誤判定を将来の監査で繰り返さない
 *   ため、デプロイ済みのコードをここに写す。
 *
 *   ⚠️ このファイルは「現に動いているコードの記録」であって、新規に貼り付けるための手順書では
 *      ない。GAS 側を変更したら **必ずここも同じコミットで更新**すること。ずれた瞬間、
 *      監査は再び実物と違うものを読む。
 *
 * ■ 重複排除の仕様と限界（重要）
 *   クライアント（js/api.js の outbox）は各保存に clientSaveId を採番し、サーバ応答を
 *   「検証できた」時だけキューから消す。iframe POST 経路は cross-origin で応答を読めず
 *   常に unverified を返すため、**GAS が正常に書き込んでいてもクライアントは再送する**。
 *   その再送を吸収するのがこの dedup。ただし:
 *     - CacheService の TTL は 21600 秒（6 時間）。**6 時間以降の再送は重複行になる**。
 *     - CacheService は保証付きストレージではなく、TTL 前でも evict されうる。
 *   → 設計は「取りこぼす」より「重複する」方向に倒れている。ANSWERS に同一 set の行が
 *     複数あっても異常ではなく、メニュー／予想スコア側が set 単位で畳んでいる。
 *
 * ■ ANSWERS の実列数（コメントとの食い違いに注意）
 *   GAS 冒頭のシート説明は「ANSWERS … A-I（9 列）」と書いてあるが、下記のとおり
 *   **実際は 10 個の値を appendRow している**（J 列 = total）。handleGetMyHistory_ も
 *   row[9] を total として読む。説明コメントの方が古い。
 *     0 timestamp | 1 userId | 2 userName | 3 set | 4 answers | 5 score
 *     6 harder_correct | 7 harder_total | 8 attempt_number | 9 total
 *
 * ■ 空 userId の扱い
 *   normalizeSaveUserId_ / normalizeSaveUserName_ が userId 空の保存を捨てずに
 *   'trial-anon' / '（無料体験）' として着地させる（詳細と背景は docs/gas-empty-userid.js）。
 *   これは無料体験アプリ（toefl-reps-demo・別デプロイ）からの保存が userId を持たないため。
 *   有料会員の履歴とは別空間であり、trial-anon 行は「失われた記録」ではない。
 */

// ============================================================
// Answers (sheet: ANSWERS, 10 cols — 上記コメント参照)
// ============================================================
// ■ 2026-10 修正: 同時に届いた再送が重複行になっていた
//   CTW / RDL は保存直後にページを移動するため、同じ保存（同じ clientSaveId）が
//   「ページ自身の送信」「ページを離れる瞬間の sendBeacon」「次ページでの再送」の
//   3 経路から 1〜2 秒以内に届く。以前は「キャッシュ確認 → appendRow → 書式 →
//   キャッシュ記録」をロック無しで行っていたため、ほぼ同時の 3 件が全員キャッシュを
//   すり抜けて 3 行になっていた（本番で同一秒・同一内容の 2〜3 行を確認）。
//   書式設定も getLastRow() を使っていたため、重なると別の行に掛かり、
//   「4:22:52」と「04:22:52」が混在していた。
//   → スクリプトロックで「確認 → 追加 → 記録」を 1 件ずつ行い、書式は自分が
//     追加した行番号に掛ける。ロックを取れなかった時も保存は捨てない（従来どおり追加）。
function _appendAnswerOnce_(p) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ANSWERS');
  var _sid = String(p.clientSaveId || '');
  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  var locked = false;
  try { lock.waitLock(20000); locked = true; } catch (e) {}
  try {
    if (_sid && cache.get('save_' + _sid)) return { success: true, dedup: true };
    sh.appendRow([
      new Date(),
      normalizeSaveUserId_(p.userId),
      normalizeSaveUserName_(p.userId, p.userName),
      p.set      || '',
      p.answers  || '',
      p.score    || '',
      p.harderCorrect || 0,
      p.harderTotal   || 0,
      p.attemptNumber || 1,
      Number(p.total  || 0)
    ]);
    var row = sh.getLastRow();   // ロック中なので、いま追加した行
    sh.getRange(row, 1).setNumberFormat(DATETIME_FMT);
    if (_sid) { try { cache.put('save_' + _sid, '1', 21600); } catch (e) {} }
    return { success: true };
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (e) {} }
  }
}

function handleSaveAnswers_(e, callback) {
  return jsonpResponse_(callback, _appendAnswerOnce_(e.parameter || {}));
}

function handleSaveAnswersPost_(e) {
  return ContentService.createTextOutput(JSON.stringify(_appendAnswerOnce_(e.parameter || {})))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- 空 userId のフォールバック（本体の解説は docs/gas-empty-userid.js） ----
function isEmptyUserId_(userId) {
  return !String(userId == null ? '' : userId).trim();
}
function normalizeSaveUserId_(userId) {
  return isEmptyUserId_(userId) ? 'trial-anon' : String(userId).trim();
}
function normalizeSaveUserName_(userId, userName) {
  if (String(userName == null ? '' : userName).trim()) return userName;
  return isEmptyUserId_(userId) ? '（無料体験）' : userName;
}
