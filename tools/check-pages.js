#!/usr/bin/env node
/* check-pages.js — 出荷前の静的検査（画面が「進まなくなる」事故の再発防止）
 *
 * WHY: 2026-08 に模試3の reading-rdl2.html で、設問ブロックの id が page13/14/15
 *   なのにページ送りは page1/2/3 を探す実装だったため、getElementById が null を
 *   返して例外になり、Next ボタンを押しても先へ進めなくなった（茶谷さまのご報告）。
 *   構文は正しく、リンク切れも無いため既存の検査では素通りしていた。人の目視に
 *   頼らず、同じ形の事故を機械で止めるための検査。
 *
 * 検査内容（いずれも「問題文・正解・レイアウト」には一切触れない読み取り専用）:
 *   ① インライン <script> が構文として解釈できる
 *   ② getElementById('x').prop の 'x' が同じページに実在する
 *   ③ var totalPages = N のページに id="page1"…"pageN" が揃っている
 *   ④ 内部リンク（href / location.href の *.html）の遷移先ファイルが実在する
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

(roots.length ? roots : ['.']).forEach(walk);

if (problems.length) {
  console.error('❌ ' + problems.length + ' 件の問題が見つかりました（' + scanned + ' ページ走査）\n');
  problems.forEach(p => console.error('  ' + p));
  console.error('\nいずれも「画面が進まなくなる」型の事故につながります。修正してから出荷してください。');
  process.exit(1);
}
console.log('✅ 問題なし（' + scanned + ' ページ走査）');
