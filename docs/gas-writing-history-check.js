/**
 * gas-writing-history-check.js
 *
 * 「Write an Email の履歴はあるのに Academic Discussion だけ無い」を
 * 実データで切り分けるための **読み取り専用** 診断ツール。
 *
 * ■ なぜ必要か
 * フロント側は Email と Discussion で完全に対称に実装されている
 * （両方 practice-1〜10 で `Api.saveAnswers("Email P<N>" / "Discussion P<N>", …)`
 *  を完了関数の中から呼び、読み込む js も同じ）。
 * したがって「片方だけ出ない」は次のどれかで、コードを読んでも判別できない。
 *
 *   ① そもそも Discussion を提出していない（行が存在しない）
 *   ② 行はあるが D 列の set 表記が `Discussion P<N>` からずれていて照合に外れる
 *   ③ 行はあるが B 列 userId が別人（＝別アカウントで取り組んだ）
 *
 * 下の関数は ANSWERS シートを読むだけで、①②③のどれなのかを一発で示す。
 *
 * ■ 使い方（GAS エディタで関数を選んで実行 → 実行ログを見る）
 *   checkWritingHistory('山田')          … 氏名の一部で検索（実名は引数で渡す）
 *   checkWritingHistory('U12345')        … userId でも可
 *   listWritingGaps()                    … Email はあるが Discussion が 0 件の人を一覧
 *
 * ■ 安全性
 *   - **一切書き込まない**。ANSWERS を読むだけ。
 *   - 対象者の氏名はコードに書かず、実行時に引数で渡す
 *     （docs/ は GitHub Pages でそのまま公開配信されるため）。
 *   - メールアドレスはログに出さない。
 *
 * ■ ANSWERS の列
 *   A timestamp | B userId | C userName | D set | E answers | F score
 *   G harderCorrect | H harderTotal | I attemptNumber | J total
 */

var WHC_TASKS = ['Email', 'Discussion'];

function _whcRows_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ANSWERS');
  if (!sh) { Logger.log('ANSWERS シートが見つかりません'); return []; }
  return sh.getDataRange().getValues();
}

function _whcWhen_(raw) {
  var d = (raw instanceof Date) ? raw : new Date(raw);
  if (isNaN(d.getTime())) return String(raw || '');
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
}

/* 保存された本文の先頭だけを取り出す（全文はログに流さない）。 */
function _whcPeek_(rawAnswers) {
  var v = rawAnswers;
  try { if (typeof v === 'string' && v) v = JSON.parse(v); } catch (e) {}
  var t = (v && typeof v === 'object' && v.text) ? String(v.text) : String(rawAnswers || '');
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > 50 ? t.slice(0, 50) + '…' : t;
}

/* ============================================================
   ① 特定の受講者の Writing 履歴を丸ごと見る
   ============================================================ */
function checkWritingHistory(who) {
  var needle = String(who || '').trim();
  if (!needle) {
    Logger.log('引数が空です。checkWritingHistory(\'氏名の一部\') のように呼んでください');
    return;
  }

  var d = _whcRows_();
  if (!d.length) return;

  // 氏名の一部 or userId で該当する userId を集める（同姓同名の取りこぼし防止）
  var ids = {};
  for (var i = 1; i < d.length; i++) {
    var uid  = String(d[i][1] || '').trim();
    var name = String(d[i][2] || '').trim();
    if (!uid) continue;
    if (uid === needle || name.indexOf(needle) !== -1) ids[uid] = name;
  }
  var idList = Object.keys(ids);
  if (!idList.length) {
    Logger.log('「' + needle + '」に一致する行が ANSWERS にありません。');
    Logger.log('→ このお客さまは、まだ一度も取り組みを保存していない可能性があります。');
    return;
  }
  if (idList.length > 1) {
    Logger.log('※ 該当する userId が ' + idList.length + ' 件あります（同姓同名 or 複数アカウント）');
  }

  idList.forEach(function (uid) {
    Logger.log('════════════════════════════════════');
    Logger.log('userId=' + uid + ' / ' + ids[uid]);

    var counts = { Email: 0, Discussion: 0 };
    var writing = [];
    var suspicious = [];
    var allSets = {};

    for (var r = 1; r < d.length; r++) {
      if (String(d[r][1] || '').trim() !== uid) continue;
      var setName = String(d[r][3] || '').trim();
      allSets[setName] = (allSets[setName] || 0) + 1;

      var matched = null;
      for (var k = 0; k < WHC_TASKS.length; k++) {
        // student-history.js / handleGetMyAnswers_ と同じ照合条件
        var pre = WHC_TASKS[k] + ' P';
        if (setName.indexOf(pre) === 0 && /^\d/.test(setName.slice(pre.length))) {
          matched = WHC_TASKS[k]; break;
        }
      }
      if (matched) {
        counts[matched]++;
        writing.push({ when: _whcWhen_(d[r][0]), set: setName, peek: _whcPeek_(d[r][4]) });
      } else if (/discussion|email/i.test(setName)) {
        // 表記ゆれ（②）の候補 — 照合には引っかからないが Writing っぽい行
        suspicious.push({ when: _whcWhen_(d[r][0]), set: setName });
      }
    }

    Logger.log('  Write an Email      : ' + counts.Email + ' 件');
    Logger.log('  Academic Discussion : ' + counts.Discussion + ' 件');

    writing.sort(function (a, b) { return a.when < b.when ? -1 : 1; });
    writing.forEach(function (w) {
      Logger.log('    ' + w.when + '  [' + w.set + ']  ' + w.peek);
    });

    if (suspicious.length) {
      Logger.log('  ⚠ 表記がずれている疑いのある行（照合に外れます）:');
      suspicious.forEach(function (s) { Logger.log('    ' + s.when + '  set="' + s.set + '"'); });
      Logger.log('  → set 列を "Discussion P<番号>" の形に直せば履歴に出るようになります。');
    }

    Logger.log('  --- 判定 ---');
    if (counts.Discussion > 0) {
      Logger.log('  ✅ Discussion の行はサーバに存在します。');
      Logger.log('     画面に出ないなら表示側の問題なので、該当 practice 番号をお知らせください。');
    } else if (suspicious.length) {
      Logger.log('  ⚠ ② 表記ゆれの可能性が高いです（上の行を確認してください）。');
    } else {
      Logger.log('  ℹ ① Discussion の行がそもそも 1 件もありません。');
      Logger.log('     = まだ Academic Discussion を提出されていない、という状態です（不具合ではありません）。');
      Logger.log('     途中で離脱すると tck_progress_* に中断が残るだけで ANSWERS には行が立ちません。');
    }

    // 参考: この方が保存している set の全種類（何に取り組んだかの俯瞰）
    var kinds = Object.keys(allSets).sort();
    Logger.log('  この方の保存済み set 一覧（' + kinds.length + ' 種類）:');
    Logger.log('    ' + kinds.join(' / '));
  });
}

/* ============================================================
   ② 「Email はあるが Discussion が 0 件」の人を一覧する
      —— 1 人だけなら未提出、大半がそうなら実装を疑うべき、の切り分け用
   ============================================================ */
function listWritingGaps() {
  var d = _whcRows_();
  if (!d.length) return;

  var per = {};   // userId -> {name, email:n, disc:n}
  for (var r = 1; r < d.length; r++) {
    var uid = String(d[r][1] || '').trim();
    if (!uid) continue;
    if (!per[uid]) per[uid] = { name: String(d[r][2] || '').trim(), email: 0, disc: 0 };
    var setName = String(d[r][3] || '').trim();
    if (setName.indexOf('Email P') === 0)      per[uid].email++;
    if (setName.indexOf('Discussion P') === 0) per[uid].disc++;
  }

  var both = 0, onlyEmail = [], onlyDisc = [], neither = 0;
  Object.keys(per).forEach(function (uid) {
    var p = per[uid];
    if (p.email && p.disc)      both++;
    else if (p.email && !p.disc) onlyEmail.push({ uid: uid, name: p.name, n: p.email });
    else if (!p.email && p.disc) onlyDisc.push({ uid: uid, name: p.name, n: p.disc });
    else neither++;
  });

  Logger.log('=== Writing の取り組み状況（ANSWERS 全体・読み取りのみ） ===');
  Logger.log('  両方あり           : ' + both + ' 名');
  Logger.log('  Email のみ         : ' + onlyEmail.length + ' 名');
  Logger.log('  Discussion のみ    : ' + onlyDisc.length + ' 名');
  Logger.log('  どちらも無し       : ' + neither + ' 名');
  Logger.log('');

  if (onlyEmail.length) {
    Logger.log('--- Email のみ（Discussion 未提出） ---');
    onlyEmail.forEach(function (x) {
      Logger.log('  ' + x.name + ' (' + x.uid + ')  Email ' + x.n + ' 件 / Discussion 0 件');
    });
  }
  if (onlyDisc.length) {
    Logger.log('--- Discussion のみ（Email 未提出） ---');
    onlyDisc.forEach(function (x) {
      Logger.log('  ' + x.name + ' (' + x.uid + ')  Discussion ' + x.n + ' 件 / Email 0 件');
    });
  }

  Logger.log('');
  Logger.log('--- 読み方 ---');
  if (onlyDisc.length > 0) {
    Logger.log('  「Discussion のみ」の方がいる = 保存経路は両方とも生きています。');
    Logger.log('  → 「Email のみ」の方は単に Discussion が未提出、と判断してよいです。');
  } else if (onlyEmail.length > 0 && both === 0) {
    Logger.log('  ⚠ Discussion を保存できている人が 1 人もいません。実装side を疑うべき状態です。');
  } else {
    Logger.log('  両方ありの方がいる = Discussion の保存経路は正常に動いています。');
  }
}
