// tools/e2e/writing-save.mjs — 「提出→保存→表示」を端から端まで確かめる（Writing 中心＋CTW/RDL の重複保存）
//
// WHY: 2026-10-23、Discussion の提出が 7/2 から1件もサーバに届いていなかったことが発覚した
//   （未定義変数 → ReferenceError → 空の catch）。それまでの修正は毎回「表示側」しか確認して
//   いなかった。このテストは本物のページを本物の GAS ハンドラ（docs/gas-*.js）につないで動かし、
//   「シートに行が増えたか」と「生徒・運営の両画面にその本文が出るか」を実データで確かめる。
//
// 使い方（リポジトリ直下で）:
//   python3 -m http.server 8777 --bind 127.0.0.1 &      # ページを配信
//   npm i --no-save playwright                          # 初回のみ
//   node tools/e2e/writing-save.mjs                     # 全部
//   node tools/e2e/writing-save.mjs T6                  # 一部だけ（テスト名の先頭一致）
// Chromium の場所は環境変数 CHROMIUM で変えられる。
// T8 は本番の実データ行を JSON（PROD_ROWS=…）で渡したときだけ動く。**その JSON はリポジトリに置かない**
//   （docs/ と同様 tools/ も GitHub Pages で公開配信され、生徒の氏名・本文を含むため）。
//
// 本番の GAS・本番シートには一切アクセスしない（通信はすべてブラウザ内で横取りする）。
import { chromium } from 'playwright';
import fs from 'fs';
import { makeGas } from './fakegas.mjs';

const BASE = 'http://127.0.0.1:8777';
const EXE = process.env.CHROMIUM || undefined;   // 未指定なら Playwright 標準の Chromium
const ONLY = process.argv[2] || '';
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? '  ✅ ' : '  ❌ ') + name + (detail ? '  — ' + detail : '')); }

const HDR_ANS = ['timestamp', 'userId', 'userName', 'set', 'answers', 'score', 'harder_correct', 'harder_total', 'attempt_number', 'total'];
const STU = { id: 'stu_test', pass: 'pw-stu', name: 'テスト生徒', email: 'stu@example.com' };
const STU2 = { id: 'stu_two', pass: 'pw-two', name: 'Second Student', email: 'two@example.com' };
const STAFF = { id: 'staff_test', pass: 'pw-staff', name: 'Staff', email: 'staff@tckworkshop.co.jp' };
function baseSeed(extraUsers = [], extraAnswers = [], extraProgress = []) {
  return {
    USERS: [['id', 'password', 'name', 'email'], ...[STU, STU2, STAFF, ...extraUsers].map(u => [u.id, u.pass, u.name, u.email])],
    ANSWERS: [HDR_ANS, ...extraAnswers],
    PROGRESS: [['updatedAt', 'userId', 'task', 'practice', 'state'], ...extraProgress],
  };
}

let browser;
async function newCtx(gas, mode = { relay: true, direct: true }) {
  const ctx = await browser.newContext();
  ctx.mode = mode;
  const errors = [];
  ctx.errors = errors;
  await ctx.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const isGas = url.hostname === 'script.google.com';
    const isRelay = url.hostname.endsWith('workers.dev');
    if (url.hostname === '127.0.0.1') return route.continue();
    if (!isGas && !isRelay) return route.abort();
    if ((isGas && !ctx.mode.direct) || (isRelay && !ctx.mode.relay)) return route.abort('connectionrefused');
    let params = Object.fromEntries(url.searchParams.entries());
    if (req.method() === 'POST') params = Object.assign(params, Object.fromEntries(new URLSearchParams(req.postData() || '').entries()));
    if (isRelay) delete params.callback;
    const r = gas.handle(req.method(), params);
    return route.fulfill({ status: 200, contentType: r.contentType, body: r.body, headers: { 'access-control-allow-origin': '*' } });
  });
  return ctx;
}
async function newPage(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', e => ctx.errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) ctx.errors.push(m.text()); });
  p.on('dialog', d => d.accept());
  return p;
}
async function studentLogin(ctx, u) {
  const p = await newPage(ctx);
  await p.goto(BASE + '/index.html');
  await p.fill('#loginId', u.id); await p.fill('#loginPass', u.pass);
  await Promise.all([p.waitForURL(/menu\.html/, { timeout: 20000 }), p.click('#btnLogin')]);
  return p;
}
async function staffLogin(ctx) {
  const p = await newPage(ctx);
  await p.goto(BASE + '/admin/login.html');
  await p.fill('#loginId', STAFF.id); await p.fill('#loginPass', STAFF.pass);
  await Promise.all([p.waitForURL(/admin\/index\.html/, { timeout: 20000 }), p.click('#btnLogin')]);
  return p;
}
async function adminOpen(ctxA, pa, url) {
  const [pg] = await Promise.all([ctxA.waitForEvent('page'), pa.evaluate(u => window.open(u, '_blank'), url)]);
  pg.on('pageerror', e => ctxA.errors.push('pageerror: ' + e.message));
  await pg.waitForLoadState('domcontentloaded');
  return pg;
}
const discRows = (gas, uid) => gas.sheets.ANSWERS.rows.slice(1).filter(r => r[1] === uid && /^Discussion P\d+$/.test(r[3]));
const parse = r => { try { return JSON.parse(r[4]); } catch (e) { return null; } };
const outbox = p => p.evaluate(() => JSON.parse(localStorage.getItem('tck_outbox') || '[]').length);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(250); } return false; }

// Write and submit one Discussion practice from the practice page.
async function submitDiscussion(p, n, text, { via = 'button', task = 'discussion' } = {}) {
  await p.goto(`${BASE}/writing/${task}/practice-${n}.html`);
  await p.waitForLoadState('domcontentloaded');
  await sleep(600);
  // A leftover resume prompt would block the page — start over if it appears.
  if (await p.locator('.tck-resume-overlay [data-restart]').count()) await p.click('.tck-resume-overlay [data-restart]');
  await p.click('.btn-start');
  await p.fill('#writingArea', text);
  if (via === 'timeout') {
    await p.evaluate(() => { secondsLeft = 2; });
    await p.waitForSelector('#completionPage', { state: 'visible', timeout: 10000 });
  } else {
    await p.click('#btnFinish');
    await p.click('.modal-btn.confirm');
  }
  return p.evaluate(() => getComputedStyle(document.getElementById('completionPage')).display !== 'none');
}
const wordsOf = t => { const s = t.trim(); return s ? s.split(/\s+/).length : 0; };
const SAMPLE = n => `In my view, Practice ${n} raises a real trade-off. Universities should keep broad requirements because they build adaptable thinkers, even though they cost time.`;

/* ================================================================ */
async function T1_allPractices() {
  console.log('\n[T1] Discussion P1〜P10 を通常どおり提出（ボタン）→ サーバ保存');
  const gas = makeGas(baseSeed());
  const ctx = await newCtx(gas);
  const p = await studentLogin(ctx, STU);
  for (let n = 1; n <= 10; n++) {
    const txt = SAMPLE(n);
    const shown = await submitDiscussion(p, n, txt);
    await waitFor(async () => discRows(gas, STU.id).some(r => r[3] === 'Discussion P' + n));
    const row = discRows(gas, STU.id).find(r => r[3] === 'Discussion P' + n);
    const a = row && parse(row);
    check(`P${n}: 完了画面＋ANSWERS に保存（本文・語数・ユーザー一致）`,
      shown && row && a.text === txt && a.words === wordsOf(txt) && row[2] === STU.name && /^\d+:\d\d$/.test(a.time),
      row ? `words=${a.words} time=${a.time}` : '行なし');
  }
  await waitFor(async () => (await outbox(p)) === 0, 15000);   // 最後の提出が送信中のことがある
  check('送信待ち（outbox）が残っていない', (await outbox(p)) === 0);
  check('下書き（PROGRESS）がサーバに残っていない', gas.sheets.PROGRESS.rows.length === 1);
  check('ページエラーなし', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await ctx.close();
  return gas;
}

async function T2_transports() {
  console.log('\n[T2] 通信経路の違い（中継ブロック時の直接 GET / 長文 POST、直接ブロック時の中継）');
  const long = Array.from({ length: 420 }, (_, i) => 'word' + i).join(' ');
  for (const [label, mode] of [['中継(workers.dev)がブロック', { relay: true, direct: true, blockRelay: true }], ['script.google.com がブロック', { relay: true, direct: false }]]) {
    const gas = makeGas(baseSeed());
    const ctx = await newCtx(gas, mode.blockRelay ? { relay: false, direct: true } : mode);
    const p = await studentLogin(ctx, STU);
    await submitDiscussion(p, 2, SAMPLE(2));
    await submitDiscussion(p, 3, long);
    await waitFor(async () => discRows(gas, STU.id).length >= 2, 20000);
    const r2 = discRows(gas, STU.id).find(r => r[3] === 'Discussion P2');
    const r3 = discRows(gas, STU.id).find(r => r[3] === 'Discussion P3');
    check(`${label}: 短文が保存される`, r2 && parse(r2).text === SAMPLE(2));
    check(`${label}: 長文（${wordsOf(long)}語）が保存される`, r3 && parse(r3).text === long && parse(r3).words === 420);
    // Reload a page → flushOutbox runs; long answer via iframe is "unverified" and must be confirmed by read-back, not duplicated
    await p.goto(BASE + '/writing/menu.html'); await sleep(4000);
    await waitFor(async () => (await outbox(p)) === 0, 20000);
    check(`${label}: 再読み込み後に送信待ちが空・重複行なし`, (await outbox(p)) === 0 && discRows(gas, STU.id).filter(r => r[3] === 'Discussion P3').length === 1,
      `outbox=${await outbox(p)} P3行=${discRows(gas, STU.id).filter(r => r[3] === 'Discussion P3').length}`);
    await ctx.close();
  }
}

async function T3_timeout() {
  console.log('\n[T3] 時間切れで自動提出');
  const gas = makeGas(baseSeed());
  const ctx = await newCtx(gas);
  const p = await studentLogin(ctx, STU);
  const shown = await submitDiscussion(p, 4, SAMPLE(4), { via: 'timeout' });
  await waitFor(async () => discRows(gas, STU.id).length === 1);
  const title = await p.textContent('#completionTitle');
  check('時間切れ画面が出て、本文が保存される', shown && /Time/.test(title) && discRows(gas, STU.id).length === 1 && parse(discRows(gas, STU.id)[0]).text === SAMPLE(4));
  await ctx.close();
}

async function T4_offline() {
  console.log('\n[T4] 提出の瞬間に通信が全断 → 復旧後に自動で届く');
  const gas = makeGas(baseSeed());
  const ctx = await newCtx(gas);
  const p = await studentLogin(ctx, STU);
  ctx.mode = { relay: false, direct: false };
  await submitDiscussion(p, 5, SAMPLE(5));
  await sleep(2500);
  check('全断中は送信待ちに 1 件残る（消えていない）', (await outbox(p)) === 1 && discRows(gas, STU.id).length === 0);
  ctx.mode = { relay: true, direct: true };
  await p.goto(BASE + '/writing/menu.html');
  await waitFor(async () => discRows(gas, STU.id).length >= 1, 25000);
  await waitFor(async () => (await outbox(p)) === 0, 15000);
  check('復旧後のページ読み込みで届き、送信待ちが空になる', discRows(gas, STU.id).length === 1 && parse(discRows(gas, STU.id)[0]).text === SAMPLE(5) && (await outbox(p)) === 0,
    `行=${discRows(gas, STU.id).length} outbox=${await outbox(p)}`);
  await ctx.close();
}

async function T5_specialChars() {
  console.log('\n[T5] 特殊文字（引用符・& % + # = ? 改行・タブ・HTML タグ・バッククォート）');
  const txt = 'I think "online" classes & labs help 100% + more.\n\n\tLine 2: #tag <b>bold</b> <script>alert(1)</script> it\'s Carlos`s view; a=b?c&d=e /path\\back {x} [y] ~^|';
  const gas = makeGas(baseSeed());
  const ctx = await newCtx(gas);
  const p = await studentLogin(ctx, STU);
  await submitDiscussion(p, 6, txt);
  await waitFor(async () => discRows(gas, STU.id).length === 1);
  const r = discRows(gas, STU.id)[0];
  check('1 文字も欠けずに保存（trim 後）', r && parse(r).text === txt.trim(), r ? JSON.stringify(parse(r).text).slice(0, 80) : '');
  await ctx.close();
  return { gas, txt };
}

async function T6_resume() {
  console.log('\n[T6] 中断→再開→提出（同じ端末／別の端末）');
  const gas = makeGas(baseSeed());
  const ctx = await newCtx(gas);
  const p = await studentLogin(ctx, STU);
  // (a) start, write, exit with the floating button, come back, resume, finish
  await p.goto(BASE + '/writing/discussion/practice-7.html'); await sleep(600);
  await p.click('.btn-start');
  await p.fill('#writingArea', 'First half of my answer.');
  await sleep(2600); // debounced snapshot
  await p.click('.tck-exit-btn'); await Promise.all([p.waitForURL(/menu\.html/), p.click('.tck-resume-overlay [data-confirm]')]);
  const srv = gas.sheets.PROGRESS.rows.find(r => r[1] === STU.id && r[3] === '7');
  check('(a) 中断した下書きがサーバ PROGRESS に保存される', !!srv && JSON.parse(srv[4]).text === 'First half of my answer.');
  await p.goto(BASE + '/writing/discussion/practice-7.html'); await sleep(800);
  await p.click('.tck-resume-overlay [data-resume]');
  check('(a) 再開すると下書きが戻る', (await p.inputValue('#writingArea')) === 'First half of my answer.');
  await p.fill('#writingArea', 'First half of my answer. Second half added after resuming.');
  await p.click('#btnFinish'); await p.click('.modal-btn.confirm');
  await waitFor(async () => discRows(gas, STU.id).some(r => r[3] === 'Discussion P7'));
  const r7 = discRows(gas, STU.id).find(r => r[3] === 'Discussion P7');
  check('(a) 再開後の提出が全文で保存され、下書きは消える', r7 && parse(r7).text.endsWith('after resuming.') && !gas.sheets.PROGRESS.rows.some(r => r[1] === STU.id && r[3] === '7'));

  // (b) exit from the INSTRUCTION page (before pressing Start), then resume and write
  await p.goto(BASE + '/writing/discussion/practice-8.html'); await sleep(600);
  await p.click('.tck-exit-btn'); await Promise.all([p.waitForURL(/menu\.html/), p.click('.tck-resume-overlay [data-confirm]')]);
  await p.goto(BASE + '/writing/discussion/practice-8.html'); await sleep(800);
  const hasPrompt = await p.locator('.tck-resume-overlay [data-resume]').count();
  if (hasPrompt) await p.click('.tck-resume-overlay [data-resume]');
  const onWriting = await p.evaluate(() => getComputedStyle(document.getElementById('writingPage')).display !== 'none');
  if (!onWriting) await p.click('.btn-start');
  await p.fill('#writingArea', 'Answer written after resuming from the instruction page.');
  await p.click('#btnFinish'); await p.click('.modal-btn.confirm');
  await sleep(2500);
  const r8 = discRows(gas, STU.id).find(r => r[3] === 'Discussion P8');
  const done8 = await p.evaluate(() => getComputedStyle(document.getElementById('completionPage')).display !== 'none');
  check('(b) 説明画面で中断→再開→提出 でも保存される', !!r8 && done8, `再開ダイアログ=${hasPrompt ? 'あり' : 'なし'} 完了画面=${done8} 保存=${!!r8}`);

  // (c) other device: draft on device A, resume on device B
  await p.goto(BASE + '/writing/discussion/practice-9.html'); await sleep(600);
  await p.click('.btn-start');
  await p.fill('#writingArea', 'Draft started on the laptop.');
  await sleep(2600);
  await p.click('.tck-exit-btn'); await Promise.all([p.waitForURL(/menu\.html/), p.click('.tck-resume-overlay [data-confirm]')]);
  const ctxB = await newCtx(gas);
  const pb = await studentLogin(ctxB, STU);
  await pb.goto(BASE + '/writing/discussion/practice-9.html'); await sleep(1500);
  const prB = await pb.locator('.tck-resume-overlay [data-resume]').count();
  if (prB) await pb.click('.tck-resume-overlay [data-resume]');
  const gotB = prB ? await pb.inputValue('#writingArea') : '';
  check('(c) 別端末で開くと下書きから再開できる', gotB === 'Draft started on the laptop.', `再開ダイアログ=${prB ? 'あり' : 'なし'}`);
  if (prB) {
    await pb.fill('#writingArea', 'Draft started on the laptop. Finished on the phone.');
    await pb.click('#btnFinish'); await pb.click('.modal-btn.confirm');
    await waitFor(async () => discRows(gas, STU.id).some(r => r[3] === 'Discussion P9'));
  }
  const r9 = discRows(gas, STU.id).find(r => r[3] === 'Discussion P9');
  check('(c) 別端末で提出した全文が保存される', r9 && parse(r9).text.endsWith('Finished on the phone.'));
  check('ページエラーなし', ctx.errors.length + ctxB.errors.length === 0, [...ctx.errors, ...ctxB.errors].slice(0, 3).join(' | '));
  await ctx.close(); await ctxB.close();
}

async function T7_displayEverywhere() {
  console.log('\n[T7] 表示確認：生徒（同じ端末・別端末）と運営（Admin）');
  const special = 'Line one with <b>tag</b> & "quotes".\nLine two 100% + #hash';
  const gas = makeGas(baseSeed());
  // device A: submit P1 twice (two attempts) and P2 with special chars
  const ctx = await newCtx(gas);
  const p = await studentLogin(ctx, STU);
  await submitDiscussion(p, 1, 'My FIRST attempt at practice one.');
  await sleep(1200);
  await submitDiscussion(p, 1, 'My SECOND attempt at practice one, improved.');
  await submitDiscussion(p, 2, special);
  await waitFor(async () => discRows(gas, STU.id).length === 3);
  check('2 回目の提出も別の行として保存（上書きされない）', discRows(gas, STU.id).filter(r => r[3] === 'Discussion P1').length === 2);
  // same device: answers page right after submitting
  await p.goto(BASE + '/writing/discussion/practice-2-answers.html'); await sleep(2500);
  check('同じ端末：解答ページに自分の回答が出る', (await p.textContent('#userPreview')).includes('Line two 100% + #hash'));
  await ctx.close();

  // device B: brand-new browser, nothing local
  const ctxB = await newCtx(gas);
  const pb = await studentLogin(ctxB, STU);
  await pb.goto(BASE + '/writing/menu.html'); await sleep(4000);
  const menuTxt = await pb.evaluate(() => document.body.innerText);
  const doneKeys = await pb.evaluate(() => Object.keys(localStorage).filter(k => /^tck_done_discussion_p/.test(k)).sort());
  check('別端末：メニューで P1・P2 が「提出済み」になる', doneKeys.includes('tck_done_discussion_p1') && doneKeys.includes('tck_done_discussion_p2'), doneKeys.join(','));
  await pb.screenshot({ path: OUT + '/student-menu.png', fullPage: true });
  await pb.goto(BASE + '/writing/discussion/practice-1-answers.html'); await sleep(3500);
  const prev = await pb.textContent('#userPreview');
  const hist = await pb.locator('#tckMyHistory').innerText().catch(() => '');
  check('別端末：解答ページの「あなたの回答」に最新の提出が出る', prev.includes('SECOND attempt'));
  check('別端末：過去の回答一覧に 2 件とも出る', /2 件|\(2\)/.test(hist) && hist.includes('SECOND attempt'), hist.slice(0, 60).replace(/\n/g, ' '));
  await pb.locator('#tckMyHistory details').nth(1).evaluate(d => d.open = true).catch(() => {});
  check('別端末：1 回目の本文も開いて読める', (await pb.locator('#tckMyHistory').innerText().catch(() => '')).includes('FIRST attempt'));
  await pb.screenshot({ path: OUT + '/student-answers-p1.png', fullPage: true });
  await pb.goto(BASE + '/writing/discussion/practice-2-answers.html'); await sleep(3500);
  const prev2 = await pb.textContent('#userPreview');
  const injected = await pb.evaluate(() => !!document.querySelector('#tckMyHistory b, #userPreview b, #tckMyHistory script'));
  check('別端末：特殊文字がそのまま表示され、HTML として実行されない', prev2.includes('<b>tag</b>') && prev2.includes('100% + #hash') && !injected);
  await pb.goto(BASE + '/my-score.html'); await sleep(4500);
  const ms = await pb.evaluate(() => document.body.innerText);
  check('別端末：My Score の学習履歴に Discussion が出る', /Discussion|ディスカッション/.test(ms), (ms.match(/.*Discussion.*/) || [''])[0].slice(0, 80));
  await pb.screenshot({ path: OUT + '/student-myscore.png', fullPage: true });
  check('生徒側ページエラーなし', ctxB.errors.length === 0, ctxB.errors.slice(0, 3).join(' | '));
  await ctxB.close();

  // admin
  const ctxA = await newCtx(gas);
  const pa = await staffLogin(ctxA);
  await pa.waitForFunction(() => typeof ATTEMPTS !== 'undefined' && ATTEMPTS.some(a => a.task === 'discussion'), null, { timeout: 20000 }).catch(() => {});
  const nAdmin = await pa.evaluate(id => ATTEMPTS.filter(a => a.userId === id && a.task === 'discussion').length, STU.id);
  check('Admin：受験履歴に Discussion 3 件が入る', nAdmin === 3, `件数=${nAdmin}`);
  await pa.click('.tab[data-panel="writing"]').catch(() => {});
  await sleep(500);
  await pa.evaluate(id => selectWritingUser(id), STU.id);
  const wd = await pa.textContent('#writingDetail');
  check('Admin：ライティングタブに Academic Discussion（3）が出る', /Academic Discussion（3）/.test(wd), wd.slice(0, 80));
  await pa.screenshot({ path: OUT + '/admin-writing.png', fullPage: true });
  // 本文を見る → answers page in admin mode
  const [ov] = await Promise.all([ctxA.waitForEvent('page'), pa.locator('#writingDetail button', { hasText: '本文を見る' }).first().click()]);
  ov.on('pageerror', e => ctxA.errors.push('pageerror: ' + e.message));
  await ov.waitForLoadState('domcontentloaded'); await sleep(4000);
  const ovTxt = await ov.evaluate(() => document.body.innerText);
  check('Admin：「本文を見る」で生徒の本文が表示される', /SECOND attempt|Line two 100%/.test(ovTxt), ov.url().split('/').pop());
  await ov.screenshot({ path: OUT + '/admin-view-answer.png', fullPage: true });
  // every discussion row → overlay shows its text
  for (const pr of [1, 2]) {
    const pg = await adminOpen(ctxA, pa, `${BASE}/writing/discussion/practice-${pr}-answers.html?userId=${STU.id}&userName=x&fromAdmin=1`); await sleep(3500);
    const t = await pg.evaluate(() => document.body.innerText);
    check(`Admin：P${pr} の本文が出る`, pr === 1 ? t.includes('SECOND attempt') : t.includes('Line two 100% + #hash'));
    if (pr === 1) {
      const opts = await pg.evaluate(() => [...document.querySelectorAll('select option')].map(o => o.textContent));
      check('Admin：P1 は 2 回分を切り替えて見られる', opts.length >= 2, opts.join(' / ').slice(0, 100));
    }
    await pg.close();
  }
  check('Admin 側ページエラーなし', ctxA.errors.length === 0, ctxA.errors.slice(0, 3).join(' | '));
  await ctxA.close();
}

async function T8_prodRows() {
  console.log('\n[T8] 本番シートの実データ（修正後の実提出 1 件＋復元 3 件）が両側で表示される');
  if (!process.env.PROD_ROWS) { console.log('  （PROD_ROWS 未指定のためスキップ）'); return; }
  const rows = JSON.parse(fs.readFileSync(process.env.PROD_ROWS));
  const users = [...new Set(rows.map(r => r[1]))].map(id => ({ id, pass: 'x-' + id, name: rows.find(r => r[1] === id)[2], email: id + '@example.com' }));
  const ans = rows.map(r => { const t = /^\d{4}\/\d\d\/\d\d /.test(r[0]) ? new Date(r[0].replace(/\//g, '-').replace(' ', 'T') + '+09:00') : r[0]; return [t, ...r.slice(1)]; });
  const gas = makeGas(baseSeed(users, ans));
  const ctxA = await newCtx(gas);
  const pa = await staffLogin(ctxA);
  await pa.waitForFunction(() => typeof ATTEMPTS !== 'undefined' && ATTEMPTS.length, null, { timeout: 20000 }).catch(() => {});
  for (const r of rows) {
    const uid = r[1], pr = r[3].match(/P(\d+)/)[1], text = JSON.parse(r[4]).text;
    const head = text.trim().slice(0, 40);
    const inList = await pa.evaluate(([u, n]) => ATTEMPTS.some(a => a.userId === u && a.task === 'discussion' && a.practice === n), [uid, +pr]);
    const pg = await adminOpen(ctxA, pa, `${BASE}/writing/discussion/practice-${pr}-answers.html?userId=${encodeURIComponent(uid)}&userName=x&fromAdmin=1`); await sleep(3000);
    const t = await pg.evaluate(() => document.body.innerText); await pg.close();
    check(`Admin：${r[2]} / ${r[3]} が一覧にあり本文が出る`, inList && t.includes(head));
    const ctxS = await newCtx(gas);
    const ps = await studentLogin(ctxS, users.find(u => u.id === uid));
    await ps.goto(`${BASE}/writing/discussion/practice-${pr}-answers.html`); await sleep(3000);
    const sp = await ps.textContent('#userPreview');
    await ps.goto(BASE + '/writing/menu.html'); await sleep(3500);
    const done = await ps.evaluate(n => !!localStorage.getItem('tck_done_discussion_p' + n), pr);
    check(`生徒：${r[2]} 本人の画面で ${r[3]} の本文が出て、メニューが「提出済み」`, sp.includes(head) && done);
    await ctxS.close();
  }
  await ctxA.close();
}

async function T9_edge() {
  console.log('\n[T9] 境界ケース');
  const gas = makeGas(baseSeed());
  const ctx = await newCtx(gas);
  const p = await studentLogin(ctx, STU);
  // empty submission
  await submitDiscussion(p, 10, '');
  await sleep(2500);
  const r = discRows(gas, STU.id).find(x => x[3] === 'Discussion P10');
  check('何も書かずに提出：記録は残る（words=0、エラーにならない）', !!r && parse(r).words === 0 && parse(r).text === '');
  // double-click on confirm must not create two rows
  await p.goto(BASE + '/writing/discussion/practice-3.html'); await sleep(600);
  await p.click('.btn-start'); await p.fill('#writingArea', 'Double click test.');
  await p.click('#btnFinish');
  await p.evaluate(() => { finishWriting('manual'); finishWriting('manual'); });
  await sleep(2500);
  check('完了ボタンを連打しても 1 行だけ', discRows(gas, STU.id).filter(x => x[3] === 'Discussion P3').length === 1);
  // a different student on the same browser after logout → rows attributed correctly
  await ctx.close();
  const ctx2 = await newCtx(gas);
  const p2 = await studentLogin(ctx2, STU2);
  await submitDiscussion(p2, 3, 'Second student answer.');
  await waitFor(async () => discRows(gas, STU2.id).length === 1);
  check('別の生徒の提出は別の userId で保存され、混ざらない', discRows(gas, STU2.id).length === 1 && parse(discRows(gas, STU2.id)[0]).text === 'Second student answer.' && discRows(gas, STU.id).every(x => !parse(x).text.includes('Second student')));
  await ctx2.close();
}

async function T10_email() {
  console.log('\n[T10] 対照：Write an Email P1〜P10 も保存される');
  const gas = makeGas(baseSeed());
  const ctx = await newCtx(gas);
  const p = await studentLogin(ctx, STU);
  let ok = 0;
  for (let n = 1; n <= 10; n++) {
    await submitDiscussion(p, n, 'Dear Professor, email number ' + n + '.', { task: 'email' });
    await waitFor(async () => gas.sheets.ANSWERS.rows.some(r => r[3] === 'Email P' + n), 8000);
    if (gas.sheets.ANSWERS.rows.some(r => r[3] === 'Email P' + n && JSON.parse(r[4]).text.includes('email number ' + n))) ok++;
  }
  check('Email 10/10 保存', ok === 10, ok + '/10');
  await ctx.close();
}

async function T11_legacyDraft() {
  console.log('\n[T11] 実在した下書きの状態（started:false＋本文あり・残り 202 秒）から再開→提出');
  const st = JSON.stringify({ updatedAt: Date.now(), text: 'While I appreciate both opinions by Claire and David, I strongly agree.', timeLeft: 202, started: false });
  const gas = makeGas(baseSeed([], [], [[new Date().toISOString(), STU.id, 'discussion', '6', st]]));
  const ctx = await newCtx(gas);
  const p = await studentLogin(ctx, STU);
  await p.goto(BASE + '/writing/discussion/practice-6.html'); await sleep(1500);
  await p.click('.tck-resume-overlay [data-resume]');
  check('サーバの下書きが復元される', (await p.inputValue('#writingArea')).startsWith('While I appreciate'));
  await p.fill('#writingArea', 'While I appreciate both opinions by Claire and David, I strongly agree. Homework builds habits.');
  await sleep(3000);
  const snap = gas.sheets.PROGRESS.rows.find(r => r[1] === STU.id && r[3] === '6');
  check('再開後も自動保存（下書きの更新）が効く', snap && JSON.parse(snap[4]).text.endsWith('Homework builds habits.'));
  await p.click('#btnFinish'); await p.click('.modal-btn.confirm');
  await waitFor(async () => discRows(gas, STU.id).length === 1);
  const r = discRows(gas, STU.id)[0];
  check('完了ボタンで提出され、本文が保存される', r && parse(r).text.endsWith('Homework builds habits.'));
  await ctx.close();
}

async function T12_doubleFire() {
  console.log('\n[T12] 完了ボタンの二度押し（CTW / RDL）でも 1 行・回数 +1 だけ');
  const gas = makeGas(baseSeed());
  const ctx = await newCtx(gas);
  const p = await studentLogin(ctx, STU);
  await p.goto(BASE + '/reading/ctw/practice-1-set-1.html'); await sleep(1200);
  if (await p.locator('.tck-resume-overlay [data-restart]').count()) await p.click('.tck-resume-overlay [data-restart]');
  await Promise.all([p.waitForURL(/practice-1-set-2\.html/, { timeout: 15000 }), p.evaluate(() => { goNext(); goNext(); goNext(); })]);
  await sleep(4000);
  const ctwRows = gas.sheets.ANSWERS.rows.filter(r => r[1] === STU.id && r[3] === 'CTW P1 Set 1');
  check('CTW：Next を 3 連打しても ANSWERS は 1 行', ctwRows.length === 1, `行=${ctwRows.length}`);
  await p.goto(BASE + '/reading/rdl/practice-1.html'); await sleep(1200);
  if (await p.locator('.tck-resume-overlay [data-restart]').count()) await p.click('.tck-resume-overlay [data-restart]');
  await p.evaluate(() => { currentQ = totalQ; navigate(1); navigate(1); }).catch(() => {});   // 2 回目の遷移指示で 1 回目が中断されるのは正常
  await p.waitForURL(/practice-1-answers\.html/, { timeout: 15000 }).catch(() => {});
  await sleep(4000);
  const rdlRows = gas.sheets.ANSWERS.rows.filter(r => r[1] === STU.id && r[3] === 'RDL P1');
  const cnt = await p.evaluate(() => localStorage.getItem('training_attempts_rdl_p1'));
  check('RDL：最後の Next を 2 連打しても ANSWERS は 1 行・回数は 1', rdlRows.length === 1 && cnt === '1', `行=${rdlRows.length} 回数=${cnt}`);
  check('サーバ：ANSWERS への追加はすべてロック中に行われる', gas.lockStats.acquired > 0 && gas.lockStats.unlockedAppends === 0,
    `lock=${gas.lockStats.acquired} ロック外の追加=${gas.lockStats.unlockedAppends}`);
  check('ページエラーなし', ctx.errors.length === 0, ctx.errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function T13_existingDuplicates() {
  console.log('\n[T13] すでに重なって入っている行は 1 回として数える（行は消さない）');
  const t = new Date(Date.now() - 3600e3);
  const row = (d, att) => [new Date(t.getTime() + d), STU.id, STU.name, 'RDL P1', JSON.stringify(['B', 'B', 'C', 'B']), 4, 0, 0, att, 4];
  // 1 回目が 3 行に重複、2 回目（10 分後）は 1 行
  const gas = makeGas(baseSeed([], [row(0, 1), row(0, 1), row(800, 1), row(600e3, 2)]));
  const ctx = await newCtx(gas);
  const p = await studentLogin(ctx, STU);
  await p.goto(BASE + '/reading/menu.html'); await sleep(4500);
  const cnt = await p.evaluate(() => localStorage.getItem('training_attempts_rdl_p1'));
  check('生徒：受験回数は 2（重複 3 行 ＋ 別の回 1 行）', cnt === '2', `回数=${cnt}`);
  await ctx.close();
  const ctxA = await newCtx(gas);
  const pa = await staffLogin(ctxA);
  await pa.waitForFunction(() => typeof ATTEMPTS !== 'undefined' && ATTEMPTS.some(a => a.task === 'rdl'), null, { timeout: 20000 }).catch(() => {});
  const n = await pa.evaluate(id => ATTEMPTS.filter(a => a.userId === id && a.task === 'rdl').length, STU.id);
  check('Admin：受験履歴の件数も 2', n === 2, `件数=${n}`);
  check('シートの行は 4 行のまま（削除しない）', gas.sheets.ANSWERS.rows.length === 5);
  await ctxA.close();
}

async function T14_slowApiLoad() {
  console.log('\n[T14] 保存用スクリプトの読み込みが遅い時に完了→即移動しても、記録が消えない（RDL 2 回目）');
  const prevRow = [new Date(Date.now() - 86400e3), STU.id, STU.name, 'RDL P1', JSON.stringify(['B', 'B', 'C', 'B']), 4, 0, 0, 1, 4];
  const gas = makeGas(baseSeed([], [prevRow]));
  const ctx = await newCtx(gas);
  const p = await studentLogin(ctx, STU);
  // api.js の読み込みを遅らせる（回線が遅い・初回アクセス直後の状態を再現）
  await p.route(/\/js\/api\.js/, async r => { await sleep(3000); await r.continue(); });
  await p.goto(BASE + '/reading/rdl/practice-1.html', { waitUntil: 'domcontentloaded' }); await sleep(300);
  await p.evaluate(() => { currentQ = totalQ; navigate(1); }).catch(() => {});
  await p.waitForURL(/practice-1-answers\.html/, { timeout: 15000 }).catch(() => {});
  await p.unroute(/\/js\/api\.js/);
  await waitFor(async () => gas.sheets.ANSWERS.rows.filter(r => r[3] === 'RDL P1').length >= 2, 20000);
  const rows = gas.sheets.ANSWERS.rows.filter(r => r[1] === STU.id && r[3] === 'RDL P1');
  check('2 回目の記録がサーバに届く（重複なし）', rows.length === 2, `行=${rows.length}`);
  await ctx.close();
}

const OUT = process.env.E2E_OUT || '/tmp/tck-e2e-out'; fs.mkdirSync(OUT, { recursive: true });
browser = await chromium.launch({ executablePath: EXE });
const ALL = { T1_allPractices, T2_transports, T3_timeout, T4_offline, T5_specialChars, T6_resume, T7_displayEverywhere, T8_prodRows, T9_edge, T10_email, T11_legacyDraft, T12_doubleFire, T13_existingDuplicates, T14_slowApiLoad };
for (const [k, fn] of Object.entries(ALL)) {
  if (ONLY && !k.startsWith(ONLY)) continue;
  try { await fn(); } catch (e) { check(k + ' 実行中に例外', false, String(e.message).split('\n')[0]); }
}
await browser.close();
const bad = results.filter(r => !r.ok);
console.log(`\n==== 合計 ${results.length} 項目 / 合格 ${results.length - bad.length} / 不合格 ${bad.length} ====`);
bad.forEach(b => console.log('  ❌ ' + b.name + (b.detail ? '  — ' + b.detail : '')));
fs.writeFileSync(OUT + '/results.json', JSON.stringify(results, null, 1));
