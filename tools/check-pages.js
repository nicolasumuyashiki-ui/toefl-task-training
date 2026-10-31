#!/usr/bin/env node
/* check-pages.js — 出荷前の静的検査（画面が「進まなくなる」事故の再発防止）
 *
 * WHY: 2026-08 に模試3の reading-rdl2.html で、設問ブロックの id が page13/14/15
 *   なのにページ送りは page1/2/3 を探す実装だったため、getElementById が null を
 *   返して例外になり、Next ボタンを押しても先へ進めなくなった（お客さまからのご報告）。
 *   構文は正しく、リンク切れも無いため既存の検査では素通りしていた。人の目視に
 *   頼らず、同じ形の事故を機械で止めるための検査。
 *
 * 検査内容（いずれも「問題文・正解・レイアウト」には一切触れない読み取り専用）:
 *   ① インライン <script> が構文として解釈できる
 *   ② getElementById('x').prop の 'x' が同じページに実在する
 *   ③ var totalPages = N のページに id="page1"…"pageN" が揃っている
 *   ④ 内部リンク（href / location.href の *.html）の遷移先ファイルが実在する
 *   ⑤ Api.saveAnswers 等の引数に未定義の変数が無い（保存が黙って消えるのを防ぐ）
 *
 * 使い方:  node tools/check-pages.js            … リポジトリ全体
 *          node tools/check-pages.js practice-test
 * 終了コード: 問題ゼロなら 0、1件でもあれば 1（CI が落ちる）
 */
const fs = require('fs');
const path = require('path');

const SKIP_DIR = /^(\.git|node_modules|audio|audio_backup|assets|docs)$/;
const roots = process.argv.slice(2);
const problems = [];
let scanned = 0;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) walk(p); }
    else if (e.name.endsWith('.html')) check(p);
  }
}

function check(file) {
  scanned++;
  const html = fs.readFileSync(file, 'utf8');
  const add = (msg) => problems.push(file + ' — ' + msg);

  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

  // ① 構文
  inline.forEach((code, i) => {
    try { new Function(code); }
    catch (e) { add('インライン script #' + i + ' が構文エラー: ' + e.message); }
  });

  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  const js = inline.join('\n');

  // ② 存在しない id への無防備な参照（プロパティに直接アクセスしている箇所のみ）
  const refs = new Set([...js.matchAll(
    /getElementById\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)\s*\.\s*(classList|style|textContent|innerHTML|innerText|value|disabled|onclick|src|play|pause|focus|remove|setAttribute|checked|files)/g
  )].map(m => m[1]));
  const missing = [...refs].filter(r => !ids.has(r));
  if (missing.length) add('存在しない id を無防備に参照: ' + missing.join(', '));

  // ③ ページ送りの id 連番
  const mTotal = js.match(/var\s+totalPages\s*=\s*(\d+)/);
  if (mTotal) {
    const n = Number(mTotal[1]);
    const lack = [];
    for (let i = 1; i <= n; i++) if (!ids.has('page' + i)) lack.push('page' + i);
    if (lack.length) {
      const actual = [...ids].filter(x => /^page\d+$/.test(x));
      add('totalPages=' + n + ' なのに ' + lack.join(', ') + ' が無い（実在: ' +
          (actual.join(', ') || 'なし') + '）→ ページ送りで例外になり先へ進めない');
    }
  }

  // ⑤ 保存呼び出しの引数に「どこにも定義されていない変数」が無いか
  //   2026-10 発覚: writing/discussion の全10ページが Api.saveAnswers(…{words:wordCount}…)
  //   と書いていたが、ページ内で定義されていたのは wc。参照した瞬間に ReferenceError
  //   になり、周りの try{}catch(e){} がそれを黙って捨てたため、7/2 から3か月半、
  //   有料会員の Discussion 提出が 1 件もサーバに届かなかった。完了画面は正常時と
  //   同じ表示、端末のメニューも「提出済み」になるので、人の目では気づけなかった。
  checkSaveCalls(js, add);

  // ④ 内部リンクの遷移先
  const dir = path.dirname(file);
  const targets = new Set([...html.matchAll(
    /(?:location\.href\s*=\s*|location\.replace\(\s*|href=)["']([^"'#]+?\.html)(?:[?#][^"']*)?["']/g
  )].map(m => m[1]));
  for (const t of targets) {
    if (/^(https?:)?\/\//.test(t) || t.startsWith('/')) continue;
    if (!fs.existsSync(path.join(dir, t))) add('リンク先が存在しない: ' + t);
  }
}

/* ⑤ の本体。Api.saveAnswers(...) / Api.savePtAnswers(...) / Api.savePtResult(...) の
   引数に現れる素の識別子を拾い、ページ内で宣言されているか、共有 JS が提供する
   既知のグローバルかを確かめる。文字列・オブジェクトのキー・プロパティアクセス
   （a.b の b）は対象外。 */
const KNOWN_GLOBALS = new Set([
  'Api', 'Auth', 'TCKAttempt', 'TCKProgress', 'window', 'document', 'navigator',
  'sessionStorage', 'localStorage', 'JSON', 'Math', 'Date', 'String', 'Number',
  'Boolean', 'Array', 'Object', 'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent',
  'undefined', 'null', 'true', 'false', 'typeof', 'new', 'this', 'NaN', 'Infinity'
]);
function checkSaveCalls(js, add) {
  const stripped = js
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1 ');
  const re = /Api\.(saveAnswers|savePtAnswers|savePtResult)\s*\(/g;
  let m;
  while ((m = re.exec(stripped))) {
    let i = re.lastIndex, depth = 1;
    while (i < stripped.length && depth) {
      const c = stripped[i];
      if (c === '"' || c === "'" || c === '`') {        // 文字列は丸ごと飛ばす
        const q = c; i++;
        while (i < stripped.length && stripped[i] !== q) i += stripped[i] === '\\' ? 2 : 1;
      } else if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    const args = stripped.slice(re.lastIndex, i - 1)
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, '""')
      .replace(/([{,]\s*)[A-Za-z_$][\w$]*\s*:/g, '$1');   // オブジェクトのキーを除く
    const idents = new Set([...args.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)/g)].map(x => x[1]));
    const undef = [...idents].filter(id => !KNOWN_GLOBALS.has(id) && !isDeclared(stripped, id));
    if (undef.length) {
      add('Api.' + m[1] + '(…) の引数に未定義の変数: ' + undef.join(', ') +
          ' → 実行時に ReferenceError になり、try/catch に握りつぶされて保存が黙って消える');
    }
  }
}
function isDeclared(js, id) {
  const e = id.replace(/\$/g, '\\$');
  return new RegExp('\\b(?:var|let|const)\\s+' + e + '\\b').test(js) ||                      // var x
         new RegExp('\\b(?:var|let|const)\\s[^;]*?[,{]\\s*' + e + '\\s*(?:=|,|;|}|\\n)').test(js) || // var a=0, x=1 / {x}
         new RegExp('\\bfunction\\s+' + e + '\\s*\\(').test(js) ||                        // 関数名
         new RegExp('\\bfunction\\s*[\\w$]*\\s*\\([^)]*\\b' + e + '\\b[^)]*\\)').test(js) || // 関数の引数
         new RegExp('\\(\\s*[^()]*\\b' + e + '\\b[^()]*\\)\\s*=>').test(js) ||              // アロー関数の引数
         new RegExp('\\b' + e + '\\s*=>').test(js) ||
         new RegExp('\\bwindow\\.' + e + '\\s*=').test(js);                                 // window.x = …
}

(roots.length ? roots : ['.']).forEach(walk);

if (problems.length) {
  console.error('❌ ' + problems.length + ' 件の問題が見つかりました（' + scanned + ' ページ走査）\n');
  problems.forEach(p => console.error('  ' + p));
  console.error('\nいずれも「画面が進まなくなる」型の事故につながります。修正してから出荷してください。');
  process.exit(1);
}
console.log('✅ 問題なし（' + scanned + ' ページ走査）');
