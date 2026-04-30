/* TCK Progress — save / resume / interrupt shared helper
   Used by every task page. State is serialized to localStorage so it
   survives tab close. Score lives in sessionStorage via existing Auth.saveAnswers. */
(function(global){
  function key(task, practice){ return 'tck_progress_' + task + '_p' + practice; }
  var lang = (localStorage.getItem('tck_lang') || 'jp');

  /* Apply body[data-lang] so .jp/.en spans work on every page that
     loads this script, not just those that explicitly add the toggle. */
  function applyLangToBody(){
    if (document.body) {
      document.body.setAttribute('data-lang', lang);
      document.documentElement.setAttribute('lang', lang === 'jp' ? 'ja' : 'en');
    }
  }
  if (document.body) applyLangToBody();
  else document.addEventListener('DOMContentLoaded', applyLangToBody);

  var strings = {
    jp: {
      title: '中断から再開しますか？',
      body: '前回の進捗が残っています。続きから再開するか、最初からやり直すか選んでください。',
      resume: '続きから再開',
      restart: '最初からやり直す',
      exitTitle: 'メニューに戻りますか？',
      exitBody: '今の進捗を保存して中断します。あとで「続きから再開」できます。',
      exitCancel: 'この問題を続ける',
      exitConfirm: '保存して戻る',
      exitBtnShort: 'メニューに戻る',
      inProgress: '中断中'
    },
    en: {
      title: 'Resume from where you left off?',
      body: 'You have an unfinished session. Choose to continue or start over.',
      resume: 'Resume',
      restart: 'Start over',
      exitTitle: 'Leave this practice?',
      exitBody: 'Your progress will be saved so you can resume later.',
      exitCancel: 'Keep going',
      exitConfirm: 'Save & exit',
      exitBtnShort: 'Menu',
      inProgress: 'In Progress'
    }
  };
  function t(k){ return (strings[lang] || strings.jp)[k]; }

  function save(task, practice, state){
    try {
      localStorage.setItem(key(task,practice), JSON.stringify(Object.assign({ updatedAt: Date.now() }, state||{})));
    } catch(e){}
  }
  function load(task, practice){
    try { return JSON.parse(localStorage.getItem(key(task,practice))); } catch(e){ return null; }
  }
  function clear(task, practice){
    try { localStorage.removeItem(key(task,practice)); } catch(e){}
  }
  function hasSaved(task, practice){ return !!load(task,practice); }

  /* Done marker — used by tasks that can't be auto-scored (Email, Discussion,
     LR, TI) to indicate "submitted at least once". Persists in localStorage
     so menu pages can render a "提出済み / Submitted" badge across sessions. */
  function doneKey(task, practice){ return 'tck_done_' + task + '_p' + practice; }
  function markDone(task, practice){
    try { localStorage.setItem(doneKey(task,practice), new Date().toISOString()); } catch(e){}
  }
  function isDone(task, practice){
    try { return !!localStorage.getItem(doneKey(task,practice)); } catch(e){ return false; }
  }
  function clearDone(task, practice){
    try { localStorage.removeItem(doneKey(task,practice)); } catch(e){}
  }

  /* Resume modal — calls onResume(savedState) or onRestart() based on choice.
     If no saved state, onRestart() fires immediately. */
  function promptResume(task, practice, callbacks){
    var saved = load(task,practice);
    if (!saved){ if(callbacks && callbacks.onRestart) callbacks.onRestart(); return; }
    var ov = document.createElement('div');
    ov.className = 'tck-resume-overlay';
    function dual(k){ return '<span class="jp">' + strings.jp[k] + '</span><span class="en">' + strings.en[k] + '</span>'; }
    ov.innerHTML =
      '<div class="tck-resume-panel" role="dialog" aria-modal="true">'
      + '<button type="button" class="tck-modal-close" data-close aria-label="Close">✕</button>'
      + '<div class="tck-resume-title">' + dual('title') + '</div>'
      + '<div class="tck-resume-body">' + dual('body') + '</div>'
      + '<div class="tck-resume-actions">'
      + '<button type="button" class="tck-btn-secondary" data-restart>' + dual('restart') + '</button>'
      + '<button type="button" class="tck-btn-primary" data-resume>' + dual('resume') + '</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    function dismiss(){ if(ov.parentNode) document.body.removeChild(ov); }
    ov.querySelector('[data-resume]').addEventListener('click', function(){
      dismiss();
      if(callbacks && callbacks.onResume) callbacks.onResume(saved);
    });
    ov.querySelector('[data-restart]').addEventListener('click', function(){
      clear(task,practice);
      dismiss();
      if(callbacks && callbacks.onRestart) callbacks.onRestart();
    });
    ov.querySelector('[data-close]').addEventListener('click', dismiss);
    ov.addEventListener('click', function(e){ if(e.target===ov) dismiss(); });
    document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ dismiss(); document.removeEventListener('keydown', esc); }});
  }

  /* Confirm-and-exit dialog. Pass current state to snapshot, menuUrl to navigate to. */
  function confirmExit(task, practice, getState, menuUrl){
    var ov = document.createElement('div');
    ov.className = 'tck-resume-overlay';
    function dual(k){ return '<span class="jp">' + strings.jp[k] + '</span><span class="en">' + strings.en[k] + '</span>'; }
    ov.innerHTML =
      '<div class="tck-resume-panel" role="dialog" aria-modal="true">'
      + '<button type="button" class="tck-modal-close" data-close aria-label="Close">✕</button>'
      + '<div class="tck-resume-title">' + dual('exitTitle') + '</div>'
      + '<div class="tck-resume-body">' + dual('exitBody') + '</div>'
      + '<div class="tck-resume-actions">'
      + '<button type="button" class="tck-btn-secondary" data-cancel>' + dual('exitCancel') + '</button>'
      + '<button type="button" class="tck-btn-primary" data-confirm>' + dual('exitConfirm') + '</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    function dismiss(){ if(ov.parentNode) document.body.removeChild(ov); }
    ov.querySelector('[data-cancel]').addEventListener('click', dismiss);
    ov.querySelector('[data-close]').addEventListener('click', dismiss);
    ov.addEventListener('click', function(e){ if(e.target===ov) dismiss(); });
    document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ dismiss(); document.removeEventListener('keydown', esc); }});
    ov.querySelector('[data-confirm]').addEventListener('click', function(){
      var st = (typeof getState === 'function') ? getState() : getState;
      save(task, practice, st);
      location.href = menuUrl;
    });
  }

  /* Inject exit button + language toggle as a single floating cluster at bottom-left. */
  function mountExitButton(task, practice, getState, menuUrl, opts){
    opts = opts || {};
    var container = opts.container || document.body;

    var cluster = document.createElement('div');
    cluster.className = 'tck-floating-cluster';

    // Language toggle
    var toggle = document.createElement('div');
    toggle.className = 'tck-lang-mini';
    toggle.innerHTML =
      '<button type="button" data-lang-btn="jp"' + (lang==='jp'?' class="active"':'') + '>日本語</button>'
      + '<button type="button" data-lang-btn="en"' + (lang==='en'?' class="active"':'') + '>EN</button>';
    toggle.querySelectorAll('[data-lang-btn]').forEach(function(b){
      b.addEventListener('click', function(){
        var l = b.getAttribute('data-lang-btn');
        lang = l;
        localStorage.setItem('tck_lang', l);
        document.body.setAttribute('data-lang', l);
        document.documentElement.setAttribute('lang', l==='jp'?'ja':'en');
        toggle.querySelectorAll('[data-lang-btn]').forEach(function(bb){
          bb.classList.toggle('active', bb.getAttribute('data-lang-btn')===l);
        });
        // Also sync other toggles on the page (e.g., on top-nav)
        document.querySelectorAll('.tck-lang-toggle [data-lang-btn]').forEach(function(bb){
          bb.classList.toggle('active', bb.getAttribute('data-lang-btn')===l);
        });
      });
    });
    cluster.appendChild(toggle);

    // Exit button — dual-span so it tracks body[data-lang] live
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tck-exit-btn';
    btn.innerHTML = '<span aria-hidden="true">✕</span>'
      + '<span class="tck-exit-label jp">' + strings.jp.exitBtnShort + '</span>'
      + '<span class="tck-exit-label en">' + strings.en.exitBtnShort + '</span>';
    btn.addEventListener('click', function(){ confirmExit(task, practice, getState, menuUrl); });
    cluster.appendChild(btn);

    container.appendChild(cluster);
    return btn;
  }

  /* Inject minimal CSS once (if not already present) */
  (function injectCss(){
    if (document.getElementById('tck-progress-css')) return;
    var s = document.createElement('style');
    s.id = 'tck-progress-css';
    s.textContent =
      '.tck-resume-overlay{position:fixed;inset:0;background:rgba(15,21,17,.32);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;font-family:"Manrope","Zen Kaku Gothic New","Noto Sans JP",system-ui,sans-serif}'
      + '.tck-resume-panel{position:relative;background:#FBF6EC;border-radius:16px;max-width:440px;width:100%;padding:28px 28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.25)}'
      + '.tck-modal-close{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;border:none;background:transparent;color:#5A6861;font-size:1.05em;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;font-family:inherit;line-height:1}'
      + '.tck-modal-close:hover{background:#F5E9D3;color:#0F1511}'
      + '.tck-resume-title{font-size:1.35em;font-weight:800;color:#002817;letter-spacing:-0.01em;margin-bottom:8px}'
      + '.tck-resume-body{font-size:.92em;color:#5A6861;line-height:1.7;margin-bottom:22px}'
      + '.tck-resume-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}'
      + '.tck-btn-primary,.tck-btn-secondary{font-family:inherit;font-size:.88em;font-weight:600;padding:10px 20px;border-radius:999px;cursor:pointer;border:1.5px solid transparent;transition:all .15s}'
      + '.tck-btn-primary{background:#007646;color:#fff;border-color:#007646}.tck-btn-primary:hover{background:#004D2E;border-color:#004D2E}'
      + '.tck-btn-secondary{background:#fff;color:#004D2E;border-color:#F5E9D3}.tck-btn-secondary:hover{border-color:#007646}'
      + '.tck-floating-cluster{position:fixed;left:18px;bottom:18px;z-index:500;display:inline-flex;align-items:center;gap:8px}'
      + '.tck-lang-mini{display:inline-flex;background:#fff;border:1.5px solid #D6DAD7;border-radius:999px;padding:3px;font-family:"Manrope",system-ui,sans-serif;font-size:.72em;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.08)}'
      + '.tck-lang-mini button{border:none;background:transparent;padding:5px 11px;border-radius:999px;cursor:pointer;color:#5A6861;font-family:inherit;font-weight:inherit;letter-spacing:.04em}'
      + '.tck-lang-mini button.active{background:#007646;color:#fff}'
      + '.tck-exit-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px 10px 14px;background:#fff;border:1.5px solid #D6DAD7;border-radius:999px;font-family:"Manrope",system-ui,sans-serif;font-size:.82em;font-weight:600;color:#5A6861;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.08);transition:all .15s}'
      + '.tck-exit-btn:hover{border-color:#B85C3C;color:#B85C3C;box-shadow:0 6px 18px rgba(184,92,60,.14)}'
      + '.tck-exit-btn span[aria-hidden]{font-size:.95em;line-height:1}'
      + '.tck-exit-label{letter-spacing:.02em}'
      + '@media(max-width:520px){.tck-floating-cluster{left:12px;bottom:12px;gap:6px}.tck-exit-btn{padding:9px 14px 9px 12px}.tck-lang-mini{font-size:.68em}}';
    document.head.appendChild(s);
  })();

  global.TCKProgress = {
    key: key,
    save: save,
    load: load,
    clear: clear,
    hasSaved: hasSaved,
    markDone: markDone,
    isDone: isDone,
    clearDone: clearDone,
    promptResume: promptResume,
    confirmExit: confirmExit,
    mountExitButton: mountExitButton,
    t: t
  };
})(window);
