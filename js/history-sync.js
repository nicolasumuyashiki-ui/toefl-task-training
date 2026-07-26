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

  /* SCORE DISPLAY SWITCH-OVER (going-forward, never retroactive).
     From this instant on, a practice's score is driven by the learner's
     LATEST attempt — which CAN be lower than a past best, so review genuinely
     moves the predicted score up toward 6.0 (and a careless retake moves it
     down). BEFORE this instant nothing changes: the best score is still shown,
     so NO existing score drops on its own — a score only moves when the learner
     does a NEW attempt at/after the switch-over. Set to 2026-06-30 00:00 JST so
     nothing already recorded counts as "new". (Mirrored in my-score.html.) */
  var SCORE_CUTOFF = '2026-06-29T15:00:00Z';

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
    var valid = function (d) { return d && typeof d.total === 'number' && d.total > 0 && typeof d.correct === 'number'; };
    var isZero = function (d) { return d && d.total > 0 && (d.correct || 0) === 0; };
    var best = parse(lsGet('training_best_' + k));
    // A post-switch-over latest of 0 is almost always a glitch / "opened but not
    // done", not a real worse attempt — don't let it drop the badge to 0 when a
    // real best exists.
    var glitchZero = function (d) { return isZero(d) && valid(best) && !isZero(best); };
    // A retake done THIS session (sessionStorage) is the learner's current
    // ability → it wins, even if lower than a past best.
    var live = parse(ssGet('training_score_' + k));
    if (valid(live) && !glitchZero(live)) return live;
    // A server-hydrated latest attempt stamped AT/AFTER the switch-over also
    // wins (going-forward honesty — may be lower than best).
    var latest = parse(lsGet('training_score_' + k));
    if (valid(latest) && latest.updatedAt && latest.updatedAt >= SCORE_CUTOFF && !glitchZero(latest)) return latest;
    // Otherwise (no post-switch attempt) keep showing the BEST so an existing
    // badge never drops on its own.
    if (valid(best)) return best;
    var d = latest || parse(lsGet('training_first_' + k));
    if (valid(d)) return d;
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
      // CTW always has a Set number. A set-less CTW row ("CTW P1" with no Set)
      // is the legacy reconcile garbage — ignore it so its junk score can't
      // drag the practice's accuracy down.
      if (info.task === 'ctw' && (info.setNum === undefined || info.setNum === null || info.setNum === '')) return;
      var _sc = (a.score === null || a.score === undefined) ? null : Number(a.score);
      var _tot = Number(a.total) || 0;
      var _answered = (a.answered === undefined || a.answered === null) ? null : Number(a.answered);
      // Reflect a GRADED attempt only when the learner actually ENGAGED — i.e.
      // reached the results/answer screen having entered answers. A blank
      // click-through ("入って出ただけ") must never count: it must not overwrite a
      // genuine score, lower the predicted band, or register as an attempt. But a
      // real attempt that happens to score 0 (all wrong, or timed out WITH some
      // answers) IS counted. The server reports `answered` (non-empty answer
      // count); when present, drop only fully-blank rows. When the server doesn't
      // report it yet (older GAS), fall back to the score heuristic (drop 0).
      // Free-response submissions carry score null (not 0) and are always kept.
      //
      // SAFETY NET (2026-07-25): a row that SCORED is proof the learner engaged,
      // so it is NEVER dropped, whatever `answered` says. This is required
      // because conv / announce / talk store the chosen option as a 0-BASED
      // INDEX, and the server counts 0 as "not answered" — a learner who picked
      // choice A everywhere would otherwise report answered=0 and lose the whole
      // attempt from history despite having a real score (e.g. conv P1 = 1/4).
      // Losing earned history is the one thing that must never happen, so score
      // takes precedence over the blank-detection heuristic.
      if (_sc !== null && _tot > 0 && !(_sc > 0)) {
        if (_answered !== null) { if (_answered === 0) return; }
        else if (_sc === 0) return;
      }
      var gk = info.task + '_p' + info.practice;
      (groups[gk] = groups[gk] || {});
      (groups[gk][info.setNum] = groups[gk][info.setNum] || []).push({
        score: _sc,
        total: _tot,
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
          // Skip a SET whose best is a 0-score (total>0): on auto-graded tasks
          // that is an "opened but not genuinely completed" / save-glitch
          // artifact, and summing it unfairly drags the practice accuracy down
          // (e.g. CTW Set1 9/10 + Set2 0/10 → 9/20). Treat the set as not done.
          if (bestRow && !((bestRow.score || 0) === 0 && bestRow.total > 0)) { bestCorrect += (bestRow.score || 0); bestTotal += bestRow.total; }
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
      try { maybeShowRecoveryBanner(res.attempts); } catch (e) {}
      cb(true);
    }).catch(onFail);
  }

  /* ============================================================
     Device-local recovery banner — some devices hold scores that never
     reached the server (attempts predating auto-save, or a device where
     the silent reconcile path is blocked). Those records exist ONLY in
     this browser's localStorage: they vanish if the browser clears data,
     and every other device shows lower numbers. Surface them VISIBLY
     with a one-tap "save to my account" button instead of relying on the
     silent path, and report how many made it so a failure is diagnosable
     instead of invisible. ADD-ONLY: pushes new rows, never deletes.
     ============================================================ */
  function findLocalOnly(serverAttempts) {
    var have = {};
    (serverAttempts || []).forEach(function (a) {
      var info = parseSet(a.set); if (info) have[info.task + '_p' + info.practice] = true;
    });
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var sm = k && k.match(/^training_score_(rdl|academic|lcr|conv|announce|talk|sentence)_p(\d+)$/);
        if (!sm || have[sm[1] + '_p' + sm[2]]) continue;
        var d = parse(lsGet(k));
        if (d && typeof d.total === 'number' && d.total > 0 && typeof d.correct === 'number' && d.correct > 0) {
          out.push({ key: sm[1] + '_p' + sm[2], task: sm[1], practice: sm[2], correct: d.correct, total: d.total, d: d });
        }
      }
    } catch (e) {}
    return out;
  }

  /* Called after the silent reconcile has had its chance: wait for its
     staggered sends to land, then VERIFY against the server (cache
     bypassed). Only when records are still missing does the banner
     appear — on healthy devices nothing is ever shown. */
  function maybeShowRecoveryBanner(serverAttempts) {
    var uid = userId(); if (!uid) return;
    var candidates = findLocalOnly(serverAttempts);
    if (!candidates.length) {
      var old0 = document.getElementById('tckRecoveryBanner');
      if (old0 && old0.parentNode) old0.parentNode.removeChild(old0);
      return;
    }
    // Give the silent reconcile's staggered pushes time to reach GAS,
    // then check what actually landed.
    setTimeout(function () {
      if (typeof Api === 'undefined' || !Api.getMyHistory) return;
      Api.getMyHistory().then(function (res) {
        if (!res || !res.success || !Array.isArray(res.attempts)) return;
        try { sessionStorage.setItem('tck_hist_cache_' + uid, JSON.stringify({ at: Date.now(), attempts: res.attempts })); } catch (e) {}
        renderRecoveryBanner(res.attempts);
      }).catch(function () {});
    }, candidates.length * 600 + 6000);
  }

  function renderRecoveryBanner(serverAttempts) {
    var uid = userId(); if (!uid) return;
    var old = document.getElementById('tckRecoveryBanner');
    var items = findLocalOnly(serverAttempts);
    if (!items.length) { if (old && old.parentNode) old.parentNode.removeChild(old); return; }
    if (old) {
      var cnt = old.querySelector('[data-recover-count]');
      if (cnt) cnt.textContent = String(items.length);
      return;
    }
    var box = document.createElement('div');
    box.id = 'tckRecoveryBanner';
    box.style.cssText = 'margin:14px auto;max-width:920px;background:#FFF4D6;border:2px solid #E3C871;border-radius:12px;padding:14px 18px;font-family:"Zen Kaku Gothic New","Noto Sans JP",sans-serif;font-size:.9em;line-height:1.7;color:#6B5A1E;display:flex;align-items:center;gap:14px;flex-wrap:wrap';
    box.innerHTML =
      '<div style="flex:1;min-width:240px"><span class="jp">💾 この端末に、アカウント（' + uid.replace(/[<>&"]/g, '') + '）へ未保存の学習記録が <strong data-recover-count>' + items.length + '</strong> 件あります。保存しておくと、他の端末でも同じ成績が表示され、端末のデータが消えても記録が守られます。</span>' +
      '<span class="en">💾 This device holds <strong data-recover-count>' + items.length + '</strong> study record(s) not yet saved to your account (' + uid.replace(/[<>&"]/g, '') + '). Saving protects them and syncs every device.</span></div>' +
      '<button type="button" data-recover-btn style="background:#007646;color:#fff;border:none;border-radius:999px;padding:10px 22px;font-weight:800;cursor:pointer;font-family:inherit;font-size:.95em"><span class="jp">アカウントに保存する</span><span class="en">Save to my account</span></button>';
    var btn = box.querySelector('[data-recover-btn]');
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.innerHTML = '<span class="jp">保存中…</span><span class="en">Saving…</span>';
      // User-confirmed attribution — safe to (re)stamp the cache owner.
      try { localStorage.setItem('tck_cache_uid', String(uid)); } catch (e) {}
      var current = findLocalOnly(serverAttempts);
      // Mark as pushed BEFORE sending so the silent reconcile (and a second
      // tap) can never send the same score twice.
      try {
        var g = 'tck_reconcile_pushed_' + uid;
        var pushedMap = JSON.parse(sessionStorage.getItem(g) || '{}') || {};
        current.forEach(function (p) { pushedMap[p.key] = true; });
        sessionStorage.setItem(g, JSON.stringify(pushedMap));
      } catch (e) {}
      current.forEach(function (p, idx) {
        setTimeout(function () {
          try {
            Api.saveAnswers(RECON_LABEL[p.task] + ' P' + p.practice,
              reconAnswers(p.task, p.practice, p.total), p.correct,
              { harderCorrect: p.d.harderCorrect || 0, harderTotal: p.d.harderTotal || 0, attemptNumber: 1, total: p.total });
          } catch (e) {}
        }, idx * 600);
      });
      // Verify against the server (cache bypassed) and report honestly.
      setTimeout(function () {
        Api.getMyHistory().then(function (res) {
          var left = (res && res.success && Array.isArray(res.attempts)) ? findLocalOnly(res.attempts) : null;
          if (left && left.length === 0) {
            box.style.background = '#E8F5EC'; box.style.borderColor = '#7FBF9B'; box.style.color = '#0F4E2A';
            box.innerHTML = '<span class="jp">✅ ' + current.length + ' 件をアカウントに保存しました。他の端末にも数分で反映されます。</span><span class="en">✅ Saved ' + current.length + ' record(s) to your account. Other devices update within minutes.</span>';
            try { sessionStorage.removeItem('tck_hist_cache_' + uid); } catch (e) {}
          } else if (left) {
            btn.disabled = false;
            btn.innerHTML = '<span class="jp">再試行（残り ' + left.length + ' 件）</span><span class="en">Retry (' + left.length + ' left)</span>';
            box.insertBefore(btn, null);
          } else {
            btn.disabled = false;
            btn.innerHTML = '<span class="jp">確認できませんでした — もう一度押してください</span><span class="en">Could not verify — please tap again</span>';
          }
        }).catch(function () {
          btn.disabled = false;
          btn.innerHTML = '<span class="jp">通信エラー — もう一度押してください</span><span class="en">Network error — please tap again</span>';
        });
      }, current.length * 600 + 4000);
    });
    var anchor = document.querySelector('.header') || document.body.firstElementChild;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
    else document.body.insertBefore(box, document.body.firstChild);
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
    // Cache-owner guard: only push local mirrors to the server when the
    // display cache in this browser is confirmed to belong to the CURRENT
    // account (auth.js stamps tck_cache_uid and purges on account switch).
    // If the stamp is missing or names another account — e.g. a stale cached
    // auth.js that predates the purge logic is still running — pushing would
    // record the previous user's scores under this user's name. Skip instead;
    // display still works and the real saves flow via each page's own save.
    try { if (localStorage.getItem('tck_cache_uid') !== String(uid)) return; } catch (e) { return; }
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
        // Free-response done-markers (Email / Discussion / LR / TI) are NO
        // LONGER reconstructed here. They used to push a CONTENT-LESS
        // {recovered:true} row whenever the server lacked a real submission —
        // which is exactly what produced the "解いていない履歴" phantom rows
        // (a local done-marker is only a UI flag, not proof of a real
        // submission). The genuine submission is already saved durably by its
        // own page and the OUTBOX (api.js), which retries the REAL payload
        // until the server confirms it: Email/Discussion via finishWriting →
        // Api.saveAnswers, and LR/TI via the real RECORDINGS upload + the
        // recorded:true row that speaking-recorder-hook now writes ONLY when
        // audio was actually captured. So the OUTBOX — not a content-less
        // push — is what guarantees nothing is silently lost.
        if (k && /^tck_done_(email|discussion|lr|ti)_p\d+$/.test(k)) continue;
        // Auto-graded scores (usually already on the server; recovered if not).
        // NOTE: CTW is intentionally EXCLUDED here (mirrors auth.js
        // AUTO_SAVE_LABELS). CTW's real attempts are saved per-set as
        // "CTW PN Set X" with the actual selections; reconcile only has the
        // aggregate `training_score_ctw_pN` and NO per-question snapshot
        // (CTW never writes training_answers_ctw_*), so pushing it here would
        // create a malformed set-less "CTW PN" row filled with zeros — the
        // unhelpful all-0 rows we used to see. Let the per-set save + outbox
        // own CTW recovery instead.
        var sm = k && k.match(/^training_score_(rdl|academic|lcr|conv|announce|talk|sentence)_p(\d+)$/);
        if (sm) {
          var sk = sm[1] + '_p' + sm[2];
          if (!have[sk] && !pushed[sk]) {
            var d = parse(lsGet(k));
            if (d && typeof d.total === 'number' && d.total > 0 && typeof d.correct === 'number') {
              have[sk] = true;
              // Pass the real `total` so the recovered row records the question
              // count instead of 0 (display can fall back to answers.length too).
              pending.push({ key: sk, set: RECON_LABEL[sm[1]] + ' P' + sm[2], answers: reconAnswers(sm[1], sm[2], d.total),
                score: d.correct, meta: { harderCorrect: d.harderCorrect || 0, harderTotal: d.harderTotal || 0, attemptNumber: 1, total: d.total } });
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
