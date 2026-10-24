// Fake GAS backend: runs the REAL handler code from docs/gas-*.js inside a vm
// with an in-memory SpreadsheetApp. Endpoints whose server code is not in
// docs/ (login, listUsers, listAttempts, getSubscription, heartbeat…) are
// small stubs that mirror what the client expects.
import fs from 'fs';
import vm from 'vm';

const REPO = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

class Range {
  constructor(sh, r, c, nr = 1, nc = 1) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { return this.sh.rows.slice(this.r - 1, this.r - 1 + this.nr).map(row => { const o = []; for (let j = 0; j < this.nc; j++) o.push(row[this.c - 1 + j] ?? ''); return o; }); }
  setValues(v) { v.forEach((row, i) => { const t = this.sh.rows[this.r - 1 + i] || (this.sh.rows[this.r - 1 + i] = []); row.forEach((x, j) => t[this.c - 1 + j] = x); }); return this; }
  setValue(x) { return this.setValues([[x]]); }
  getValue() { return this.getValues()[0][0]; }
  setNumberFormat() { return this; }
}
class Sheet {
  constructor(name, rows) { this.name = name; this.rows = rows; }
  getDataRange() { const nc = Math.max(1, ...this.rows.map(r => r.length)); return new Range(this, 1, 1, this.rows.length, nc); }
  appendRow(row) { this.rows.push(row.slice()); return this; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  getName() { return this.name; }
}

export function makeGas(seed) {
  const sheets = {};
  for (const [k, v] of Object.entries(seed)) sheets[k] = new Sheet(k, v.map(r => r.slice()));
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = new Sheet(n, [])),
  };
  const cache = new Map();
  const out = (content, mime) => ({ content, mime, setMimeType(m) { this.mime = m; return this; } });
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
    ContentService: { createTextOutput: s => out(s, 'text'), MimeType: { JSON: 'json', JAVASCRIPT: 'js' } },
    Utilities: { formatDate: d => new Date(d).toISOString() },
    Logger: { log: () => {} },
    DATETIME_FMT: 'yyyy/MM/dd HH:mm:ss',
    console,
  };
  ctx.jsonpResponse_ = (cb, obj) => cb ? out(cb + '(' + JSON.stringify(obj) + ')', 'js') : out(JSON.stringify(obj), 'json');
  ctx.jsonResponse_ = obj => out(JSON.stringify(obj), 'json');
  const users = () => sheets.USERS.rows.slice(1).map(r => ({ userId: String(r[0]), pass: String(r[1]), userName: String(r[2]), email: String(r[3]) }));
  ctx.verifyUser_ = (id, pass) => { const u = users().find(x => x.userId === String(id) && x.pass === String(pass)); return u ? { userId: u.userId, userName: u.userName, email: u.email } : null; };
  ctx.verifyStaff_ = (id, pass) => { const u = ctx.verifyUser_(id, pass); return !!(u && /@tckworkshop\.co\.jp$/i.test(u.email)); };
  vm.createContext(ctx);
  for (const f of ['gas-save-answers.js', 'gas-my-answers.js', 'gas-my-history.js', 'gas-attempt-answers.js', 'gas-progress-sync.js']) {
    vm.runInContext(fs.readFileSync(`${REPO}/docs/${f}`, 'utf8'), ctx, { filename: f });
  }

  const calls = [];
  function stub(action, p, cb) {
    const J = obj => ctx.jsonpResponse_(cb, obj);
    switch (action) {
      case 'login': { const u = ctx.verifyUser_(p.id, p.pass); return J(u ? Object.assign({ success: true }, u) : { success: false, error: 'auth_failed' }); }
      case 'getSubscription': { const u = ctx.verifyUser_(p.id, p.pass); return J(u ? { success: true, subscription: { status: 'active' } } : { success: false }); }
      case 'heartbeat': case 'reportSaveHealth': return J({ success: true });
      case 'listUsers': if (!ctx.verifyStaff_(p.id, p.pass)) return J({ success: false, error: 'auth_failed' });
        return J({ success: true, users: users().map(u => ({ userId: u.userId, userName: u.userName, email: u.email })) });
      case 'listAttempts': {
        if (!ctx.verifyStaff_(p.id, p.pass)) return J({ success: false, error: 'auth_failed' });
        const rows = sheets.ANSWERS.rows.slice(1).map(r => ({
          timestamp: r[0] instanceof Date ? r[0].toISOString() : String(r[0] || ''),
          userId: String(r[1]), userName: String(r[2]), set: String(r[3]), answers: typeof r[4] === 'string' ? r[4] : JSON.stringify(r[4]),
          score: r[5], harderCorrect: r[6], harderTotal: r[7], attemptNumber: r[8], total: r[9],
        }));
        return J({ success: true, attempts: rows });
      }
      default: return null;
    }
  }
  function handle(method, params) {
    const action = params.action || '';
    const cb = params.callback;
    calls.push({ method, action, set: params.set, task: params.task });
    const e = { parameter: params };
    let r;
    if (method === 'POST') {
      if (action === 'saveAnswers') r = ctx.handleSaveAnswersPost_(e);
      else if (action === 'saveProgress') r = ctx.handleSaveProgress_(e);
    } else {
      if (action === 'saveAnswers') r = ctx.handleSaveAnswers_(e, cb);
      else if (action === 'saveProgress') r = ctx.handleSaveProgress_(e);
      else if (action === 'getMyAnswers') r = ctx.handleGetMyAnswers_(e, cb);
      else if (action === 'getMyHistory') r = ctx.handleGetMyHistory_(e, cb);
      else if (action === 'getAttemptAnswers') r = ctx.handleGetAttemptAnswers_(e, cb);
      else if (action === 'getProgress') r = ctx.handleGetProgress_(e, cb);
      else if (action === 'clearProgress') r = ctx.handleClearProgress_(e, cb);
    }
    if (!r) r = stub(action, params, cb);
    if (!r) { calls[calls.length - 1].unhandled = true; r = ctx.jsonpResponse_(cb, { success: false, error: 'not_stubbed:' + action }); }
    // saveProgress via JSONP GET returns plain JSON from the real handler — wrap for the callback
    if (cb && r.mime === 'json') r = ctx.jsonpResponse_(cb, JSON.parse(r.content));
    return { body: r.content, contentType: r.mime === 'js' ? 'application/javascript' : 'application/json' };
  }
  return { sheets, handle, calls, cache };
}
