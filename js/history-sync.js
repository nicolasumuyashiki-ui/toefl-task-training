/* ============================================================
   TCK History Sync — server-sourced progress / score history
   ------------------------------------------------------------
   PURPOSE
   The per-task score badges ("Perfect 9/10"), the "提出済み /
   Submitted" markers, and my-score.html USED to read only from
   sessionStorage / localStorage. That is per-browser AND, for
   sessionStorage, wiped the moment the browser closes — so a
   learner saw their history vanish after closing the browser, and
   saw DIFFERENT history on a second device. The data itself was
   never lost: every attempt is saved server-side (GAS ANSWERS
   sheet, keyed by userId) via Api.saveAnswers.

   This module makes the SERVER the source of truth. On menu /
   my-score load it pulls the user's full history once
   (Api.getMyHistory) and writes it into the same localStorage keys
   the existing UI already understands, so history follows the
   ACCOUNT across every browser and device.

   KEYS WRITTEN (all localStorage, i.e. persistent):
     training_score_{task}_p{N}   = {correct,total}  (latest attempt)
     training_first_{task}_p{N}   = {correct,total}  (first attempt; set-if-absent)
     training_attempts_{task}_p{N}= count            (never shrinks)
     tck_done_{task}_p{N}         = ISO timestamp     (free-response submitted)

   IMPORTANT — NEVER RESET HISTORY:
   This module only ADDS / refreshes; it must never clear a user's
   history. Future "minor fixes" to question files must not touch
   these keys or the ANSWERS sheet. See CLAUDE.md.
   ============================================================ */
(function (global) {
  if (global.TCKHistory) return;

  var TASK_LABEL_TO_KEY = {
    ctw: 'ctw', rdl: 'rdl', academic: 'academic',
    lcr: 'lcr', conv: 'conv', announce: 'announce', talk: 'talk',
    sentence: 'sentence', email: 'email', discussion: 'discussion',
    lr: 'lr', ti: 'ti'
  };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  // Best-score store for the menu badge: a worse retake must never lower it.
  function bumpBest(gk, correct, total) {
    if (!(total > 0) || typeof correct !== 'number') return;
    var cur = parse(lsGet('training_best_' + gk));
    var better = !cur || typeof cur.correct !== 'number' || typeof cur.total !== 'number' || !(cur.total > 0)
      || (correct / total) > (cur.correct / cur.total)
      || ((correct / total) === (cur.correct / cur.total) && total > cur.total);
    if (better) lsSet('training_best_' + gk, JSON.stringify({ correct: correct, total: total }));
  }

  function userId() {
    var u = parse(ssGet('kickstart_user')) || {};
    return u.userId || '';
  }

  /* Parse an ANSWERS `set` label like "CTW P1 Set 1", "LCR P3",
     "Discussion P2" → { task, practice, setNum }. Returns null if it
     doesn't look like a practice attempt. */
  function parseSet(setName) {
    var m = String(setName || '').match(/^([A-Za-z]+)\s+P(\d+)(?:\s+Set\s+(\d+))?\s*$/);
    if (!m) return null;
    var key = TASK_LABEL_TO_KEY[m[1].toLowerCase()];
    if (!key) return null;
    return { task: key, practice: m[2], setNum: m[3] || '0' };
  }

  /* ---- READ helpers used by menus / my-score -------------------- */

  /* Latest known score for a practice: in-session sessionStorage wins
     (the user just finished it), then server-hydrated localStorage,
     then the locked-in first attempt. Returns {correct,total} or null. */
  function readScore(task, practice) {
    var k = task + '_p' + practice;
    // Menu badge shows the BEST score (a worse retake won't lower it).
    var best = parse(lsGet('training_best_' + k));
    if (best && typeof best.total === 'number' && best.total > 0 && typeof best.correct === 'number') return best;
    var d = parse(ssGet('training_score_' + k))
         || parse(lsGet('training_score_' + k))
         || parse(lsGet('training_first_' + k));
    if (d && typeof d.total === 'number' && d.total > 0 &&
        typeof d.correct === 'number') return d;
    return null;
  }
  function isDone(task, practice) { return !!lsGet('tck_done_' + task + '_p' + practice); }
  function hasProgress(task, practice) { return !!lsGet('tck_progress_' + task + '_p' + practice); }

  /* ---- WRITE: fold server rows into localStorage ---------------- */

  function applyAttempts(attempts) {
    if (!attempts || !attempts.length) return;

    // group[task_pN][setNum] = [rows sorted oldest→newest]
    var groups = {};
    attempts.forEach(function (a) {
      var info = parseSet(a.set);
      if (!info) return;
      var gk = info.task + '_p' + info.practice;
      (groups[gk] = groups[gk] || {});
      (groups[gk][info.setNum] = groups[gk][info.setNum] || []).push({
        score: (a.score === null || a.score === undefined) ? null : Number(a.score),
        total: Number(a.total) || 0,
        ts: a.timestamp || ''
      });
    });

    Object.keys(groups).forEach(function (gk) {
      var buckets = groups[gk];
      var setKeys = Object.keys(buckets);

      // Sum across sets (CTW has Set 1 + Set 2; everything else is one bucket).
      var firstCorrect = 0, firstTotal = 0, latestCorrect = 0, latestTotal = 0, bestCorrect = 0, bestTotal = 0;
      var graded = false, maxAttempts = 0, latestUnscoredTs = '';
      var latestTs = '', firstTs = '';
      setKeys.forEach(function (sk) {
        var rows = buckets[sk];
        rows.sort(function (x, y) { return (x.ts || '').localeCompare(y.ts || ''); });
        var first = rows[0], latest = rows[rows.length - 1];
        if (rows.length > maxAttempts) maxAttempts = rows.length;
        if (latest.total > 0 && latest.score !== null) {
          graded = true;
          firstCorrect += (first.score || 0); firstTotal += first.total;
          latestCorrect += (latest.score || 0); latestTotal += latest.total;
          // Best attempt for this set (highest score) → drives the menu badge.
          var bestRow = null;
          rows.forEach(function (r) { if (r.total > 0 && r.score !== null && (bestRow === null || (r.score || 0) > (bestRow.score || 0))) bestRow = r; });
          if (bestRow) { bestCorrect += (bestRow.score || 0); bestTotal += bestRow.total; }
          if ((latest.ts || '') > latestTs) latestTs = latest.ts || '';
          if (!firstTs || (first.ts || '') < firstTs) firstTs = first.ts || '';
        } else {
          if ((latest.ts || '') > latestUnscoredTs) latestUnscoredTs = latest.ts || '';
        }
      });

      if (graded && latestTotal > 0) {
        // Latest score → always refresh from server truth (carry the
        // timestamp so my-score can show WHEN it was done).
        lsSet('training_score_' + gk, JSON.stringify({ correct: latestCorrect, total: latestTotal, updatedAt: latestTs }));
        // Best score → what the menu badge shows (never lowered by a worse retake).
        bumpBest(gk, bestCorrect, bestTotal);
        // First attempt → set only if absent (preserve locally-captured first).
        if (!lsGet('training_first_' + gk)) {
          lsSet('training_first_' + gk, JSON.stringify({ correct: firstCorrect, total: firstTotal, capturedAt: firstTs }));
        }
        // Attempt counter → never shrink.
        var localN = parseInt(lsGet('training_attempts_' + gk) || '0', 10) || 0;
        if (maxAttempts > localN) lsSet('training_attempts_' + gk, String(maxAttempts));
      } else if (latestUnscoredTs) {
        // Free-response (Email / Discussion / LR / TI): mark "submitted".
        if (!lsGet('tck_done_' + gk)) lsSet('tck_done_' + gk, latestUnscoredTs);
      }
    });
  }

  /* ---- HYDRATE: pull from server once, with a short cache -------- */

  var _inflight = null;
  var CACHE_TTL = 60 * 1000;  // 60s — snappy in-session menu hopping

  function hydrate(cb, _attempt) {
    cb = cb || function () {};
    _attempt = _attempt || 0;
    var uid = userId();
    if (!uid || typeof Api === 'undefined' || !Api.getMyHistory) return cb(false);

    // Short sessionStorage cache so navigating between menus doesn't refetch.
    var cacheKey = 'tck_hist_cache_' + uid;
    var cached = parse(ssGet(cacheKey));
    if (cached && cached.attempts && (Date.now() - cached.at) < CACHE_TTL) {
      applyAttempts(cached.attempts);
      return cb(true);
    }
    if (_inflight) { _inflight.then(function () { cb(true); }, function () { cb(false); }); return; }

    // Part B — server is the source of truth for what the learner sees. A
    // momentary congestion / offline blip must NOT leave them staring at a
    // stale local cache while the server (= Admin) actually has more. So retry
    // a transient failure with backoff before giving up; on final failure we
    // keep the local cache (degrade), never blank the screen.
    function onFail() {
      _inflight = null;
      if (_attempt < 3) { setTimeout(function () { hydrate(cb, _attempt + 1); }, 1500 * (_attempt + 1)); return; }
      cb(false);
    }

    _inflight = Api.getMyHistory().then(function (res) {
      _inflight = null;
      if (!res || !res.success || !Array.isArray(res.attempts)) { onFail(); return; }
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), attempts: res.attempts })); } catch (e) {}
      applyAttempts(res.attempts);
      reconcile(res.attempts);   // push back any local completions the server is missing
      mirrorProgress();          // pull server in-progress into local so the 中断中 badge shows cross-device
      cb(true);
    }).catch(onFail);
  }

  /* mount(render): draw from whatever's cached locally NOW (instant), then
     hydrate from the server and draw again. `render` MUST be idempotent
     (clear its own previously-added nodes before re-adding). */
  function mount(render) {
    if (typeof render !== 'function') return;
    try { render(); } catch (e) {}
    hydrate(function (changed) { if (changed) { try { render(); } catch (e) {} } });
  }

  /* ---- MENU rendering (shared by all four skill menus) ---------- */

  /* Draw score / submitted / in-progress badges on a menu's
     .practice-btn tiles. `tasks` is the ordered task list matching the
     page's .task-section blocks. opts.showDone toggles the "提出済み /
     Submitted" marker (Writing/Speaking free-response tasks).

     Rendering is idempotent — every injected node carries `.tckhb` and is
     removed before re-drawing — so it can safely run once from the local
     cache and again after the server hydrate lands. */
  function renderMenu(tasks, opts) {
    opts = opts || {};
    var lang = (lsGet('tck_lang') || 'jp');
    var inProgressLabel = lang === 'en' ? 'In Progress' : '中断中';
    var submittedLabel  = lang === 'en' ? 'Submitted'   : '提出済み';

    function draw() {
      tasks.forEach(function (task, ti) {
        var section = document.querySelectorAll('.task-section')[ti];
        if (!section) return;
        var btns = section.querySelectorAll('.practice-btn');
        for (var i = 1; i <= 10; i++) {
          var btn = btns[i - 1];
          if (!btn || btn.classList.contains('locked')) continue;
          // idempotent: clear nodes we injected on a previous pass
          Array.prototype.forEach.call(btn.querySelectorAll('.tckhb'), function (n) {
            if (n.parentNode) n.parentNode.removeChild(n);
          });
          var d = readScore(task, i);
          if (d) {
            var pct = Math.round(d.correct / d.total * 100);
            var grade = pct === 100 ? 'perfect' : pct >= 80 ? 'great' : pct >= 50 ? 'good' : 'keep-trying';
            var label = pct === 100 ? 'Perfect' : pct >= 80 ? 'Great' : pct >= 50 ? 'Good' : 'Keep Going';
            var badge = document.createElement('span'); badge.className = 'score-badge tckhb ' + grade; badge.textContent = label; btn.appendChild(badge);
            var frac = document.createElement('span'); frac.className = 'score-fraction tckhb'; frac.textContent = d.correct + '/' + d.total; btn.appendChild(frac);
            var gauge = document.createElement('div'); gauge.className = 'score-gauge tckhb';
            var fill = document.createElement('div'); fill.className = 'score-gauge-fill ' + grade; fill.style.width = pct + '%';
            gauge.appendChild(fill); btn.appendChild(gauge);
          } else if (opts.showDone && isDone(task, i)) {
            var b3 = document.createElement('span'); b3.className = 'score-badge submitted tckhb'; b3.textContent = submittedLabel; btn.appendChild(b3);
          } else if (hasProgress(task, i)) {
            var b2 = document.createElement('span'); b2.className = 'score-badge in-progress tckhb'; b2.textContent = inProgressLabel; btn.appendChild(b2);
          }
        }
      });
    }

    mount(draw);
  }

  /* ---- REVERSE SYNC (recovery) -----------------------------------
     Push LOCAL completions that the server is MISSING back up to the server.
     Needed because the old GET-based saveAnswers silently dropped long
     free-response essays, so a student's done work lived only in their
     browser's localStorage. This runs automatically on the device that holds
     that localStorage (the student's own PC) the first time they open the app
     after the fix — no console, no staff access. ADD-ONLY: it never deletes
     or overwrites server rows, and only pushes a task the server lacks, so it
     can't create duplicates or disturb existing history. The essay TEXT was
     in sessionStorage (gone on close) and cannot be recovered — only the
     "submitted" status / score is restored. */
  var RECON_LABEL = {
    ctw:'CTW', rdl:'RDL', academic:'Academic', lcr:'LCR', conv:'Conv', announce:'Announce',
    talk:'Talk', sentence:'Sentence', email:'Email', discussion:'Discussion', lr:'LR', ti:'TI'
  };
  /* Build a length=total answers array from the durable training_answers_*
     snapshot (mirrored by auth.js). Lets reconcile push the REAL selections,
     not zeros, when recovering an auto-graded attempt the server is missing. */
  function reconAnswers(task, practice, total) {
    var arr = new Array(total).fill(0);
    try {
      var raw = lsGet('training_answers_' + task + '_p' + practice);
      var parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        for (var i = 0; i < total; i++) { var v = parsed[i]; if (v !== undefined && v !== null) arr[i] = (v && typeof v === 'object' && 'selected' in v) ? v.selected : v; }
      } else if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach(function (k) {
          var idx = parseInt(String(k).replace(/[^0-9]/g, ''), 10);
          if (!isNaN(idx)) { var pos = idx >= 1 ? idx - 1 : idx; if (pos >= 0 && pos < total) { var w = parsed[k]; arr[pos] = (w && typeof w === 'object' && 'selected' in w) ? w.selected : w; } }
        });
      }
    } catch (e) {}
    return arr;
  }

  function reconcile(serverAttempts) {
    var uid = userId(); if (!uid) return;
    if (typeof Api === 'undefined' || !Api.saveAnswers) return;
    // Per-item guard (was a once-per-session global flag): track which task_pN
    // we've already pushed this session, so late-appearing local completions
    // sync on a later menu load instead of being permanently skipped after the
    // first partial run. Add-only — never deletes server rows.
    var guardKey = 'tck_reconcile_pushed_' + uid;
    var pushed = {};
    try { pushed = JSON.parse(sessionStorage.getItem(guardKey) || '{}') || {}; } catch (e) { pushed = {}; }

    // What the server already has, keyed by task_pN.
    var have = {};
    (serverAttempts || []).forEach(function (a) {
      var info = parseSet(a.set); if (info) have[info.task + '_p' + info.practice] = true;
    });

    var pending = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        // Free-response done-markers (Email / Discussion / LR / TI).
        var fm = k && k.match(/^tck_done_(email|discussion|lr|ti)_p(\d+)$/);
        if (fm) {
          var fk = fm[1] + '_p' + fm[2];
          if (!have[fk] && !pushed[fk]) { have[fk] = true; pending.push({ key: fk, set: RECON_LABEL[fm[1]] + ' P' + fm[2], answers: { recovered: true }, score: 0, meta: {} }); }
          continue;
        }
        // Auto-graded scores (usually already on the server; recovered if not).
        var sm = k && k.match(/^training_score_(ctw|rdl|academic|lcr|conv|announce|talk|sentence)_p(\d+)$/);
        if (sm) {
          var sk = sm[1] + '_p' + sm[2];
          if (!have[sk] && !pushed[sk]) {
            var d = parse(lsGet(k));
            if (d && typeof d.total === 'number' && d.total > 0 && typeof d.correct === 'number') {
              have[sk] = true;
              pending.push({ key: sk, set: RECON_LABEL[sm[1]] + ' P' + sm[2], answers: reconAnswers(sm[1], sm[2], d.total),
                score: d.correct, meta: { harderCorrect: d.harderCorrect || 0, harderTotal: d.harderTotal || 0, attemptNumber: 1 } });
            }
          }
        }
      }
    } catch (e) {}

    if (!pending.length) return;
    // Stagger so we don't hammer GAS.
    pending.forEach(function (p, idx) {
      if (p.key) pushed[p.key] = true;
      setTimeout(function () { try { Api.saveAnswers(p.set, p.answers, p.score, p.meta); } catch (e) {} }, idx * 600);
    });
    try { sessionStorage.setItem(guardKey, JSON.stringify(pushed)); } catch (e) {}
  }

  /* Pull the user's server-side in-progress snapshots into local
     tck_progress_* (set-if-absent) so the menu "中断中" badge appears on any
     device. The practice page's own promptResume also falls back to the
     server, so resume works even when opened directly. Best-effort. */
  function mirrorProgress() {
    if (typeof Api === 'undefined' || !Api.getProgress) return;
    Api.getProgress().then(function (res) {
      if (!res || !res.success || !Array.isArray(res.progress)) return;
      res.progress.forEach(function (pr) {
        if (!pr || !pr.task || !pr.practice || !pr.state) return;
        var k = 'tck_progress_' + pr.task + '_p' + pr.practice;
        if (!lsGet(k)) { try { lsSet(k, JSON.stringify(pr.state)); } catch (e) {} }
      });
    }).catch(function () {});
  }

  global.TCKHistory = {
    readScore: readScore,
    isDone: isDone,
    hasProgress: hasProgress,
    hydrate: hydrate,
    mount: mount,
    renderMenu: renderMenu,
    applyAttempts: applyAttempts,
    reconcile: reconcile,
    mirrorProgress: mirrorProgress,
    parseSet: parseSet
  };
})(window);
