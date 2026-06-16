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
      var firstCorrect = 0, firstTotal = 0, latestCorrect = 0, latestTotal = 0;
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

  function hydrate(cb) {
    cb = cb || function () {};
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

    _inflight = Api.getMyHistory().then(function (res) {
      _inflight = null;
      if (!res || !res.success || !Array.isArray(res.attempts)) return cb(false);
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), attempts: res.attempts })); } catch (e) {}
      applyAttempts(res.attempts);
      cb(true);
    }).catch(function () {
      _inflight = null;
      cb(false);  // offline / endpoint not deployed yet → keep local cache
    });
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

  global.TCKHistory = {
    readScore: readScore,
    isDone: isDone,
    hasProgress: hasProgress,
    hydrate: hydrate,
    mount: mount,
    renderMenu: renderMenu,
    applyAttempts: applyAttempts,
    parseSet: parseSet
  };
})(window);
