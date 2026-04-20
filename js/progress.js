/* TCK Progress — save / resume / interrupt shared helper
   Used by every task page. State is serialized to localStorage so it
   survives tab close. Score lives in sessionStorage via existing Auth.saveAnswers. */
(function(global){
  function key(task, practice){ return 'tck_progress_' + task + '_p' + practice; }
  var lang = (localStorage.getItem('tck_lang') || 'jp');

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

  /* Resume modal — calls onResume(savedState) or onRestart() based on choice.
     If no saved state, onRestart() fires immediately. */
  function promptResume(task, practice, callbacks){
    var saved = load(task,practice);
    if (!saved){ if(callbacks && callbacks.onRestart) callbacks.onRestart(); return; }
    var ov = document.createElement('div');
    ov.className = 'tck-resume-overlay';
    ov.innerHTML =
      '<div class="tck-resume-panel">'
      + '<div class="tck-resume-title">' + t('title') + '</div>'
      + '<div class="tck-resume-body">' + t('body') + '</div>'
      + '<div class="tck-resume-actions">'
      + '<button type="button" class="tck-btn-secondary" data-restart>' + t('restart') + '</button>'
      + '<button type="button" class="tck-btn-primary" data-resume>' + t('resume') + '</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    ov.querySelector('[data-resume]').addEventListener('click', function(){
      document.body.removeChild(ov);
      if(callbacks && callbacks.onResume) callbacks.onResume(saved);
    });
    ov.querySelector('[data-restart]').addEventListener('click', function(){
      clear(task,practice);
      document.body.removeChild(ov);
      if(callbacks && callbacks.onRestart) callbacks.onRestart();
    });
  }

  /* Confirm-and-exit dialog. Pass current state to snapshot, menuUrl to navigate to. */
  function confirmExit(task, practice, getState, menuUrl){
    var ov = document.createElement('div');
    ov.className = 'tck-resume-overlay';
    ov.innerHTML =
      '<div class="tck-resume-panel">'
      + '<div class="tck-resume-title">' + t('exitTitle') + '</div>'
      + '<div class="tck-resume-body">' + t('exitBody') + '</div>'
      + '<div class="tck-resume-actions">'
      + '<button type="button" class="tck-btn-secondary" data-cancel>' + t('exitCancel') + '</button>'
      + '<button type="button" class="tck-btn-primary" data-confirm>' + t('exitConfirm') + '</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    ov.querySelector('[data-cancel]').addEventListener('click', function(){ document.body.removeChild(ov); });
    ov.querySelector('[data-confirm]').addEventListener('click', function(){
      var st = (typeof getState === 'function') ? getState() : getState;
      save(task, practice, st);
      location.href = menuUrl;
    });
  }

  /* Inject exit button into the top-right of the page. Call once after DOMReady. */
  function mountExitButton(task, practice, getState, menuUrl, opts){
    opts = opts || {};
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tck-exit-btn';
    btn.innerHTML = '<span aria-hidden="true">✕</span><span class="tck-exit-label">' + t('exitBtnShort') + '</span>';
    btn.addEventListener('click', function(){ confirmExit(task, practice, getState, menuUrl); });
    (opts.container || document.body).appendChild(btn);
    return btn;
  }

  /* Inject minimal CSS once (if not already present) */
  (function injectCss(){
    if (document.getElementById('tck-progress-css')) return;
    var s = document.createElement('style');
    s.id = 'tck-progress-css';
    s.textContent =
      '.tck-resume-overlay{position:fixed;inset:0;background:rgba(0,40,23,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;font-family:"Manrope","Zen Kaku Gothic New","Noto Sans JP",system-ui,sans-serif}'
      + '.tck-resume-panel{background:#FBF6EC;border-radius:16px;max-width:440px;width:100%;padding:28px 28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.25)}'
      + '.tck-resume-title{font-size:1.35em;font-weight:800;color:#002817;letter-spacing:-0.01em;margin-bottom:8px}'
      + '.tck-resume-body{font-size:.92em;color:#5A6861;line-height:1.7;margin-bottom:22px}'
      + '.tck-resume-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}'
      + '.tck-btn-primary,.tck-btn-secondary{font-family:inherit;font-size:.88em;font-weight:600;padding:10px 20px;border-radius:999px;cursor:pointer;border:1.5px solid transparent;transition:all .15s}'
      + '.tck-btn-primary{background:#007646;color:#fff;border-color:#007646}.tck-btn-primary:hover{background:#004D2E;border-color:#004D2E}'
      + '.tck-btn-secondary{background:#fff;color:#004D2E;border-color:#F5E9D3}.tck-btn-secondary:hover{border-color:#007646}'
      + '.tck-exit-btn{position:fixed;top:14px;right:14px;z-index:500;display:inline-flex;align-items:center;gap:6px;padding:8px 14px 8px 10px;background:#fff;border:1.5px solid #F5E9D3;border-radius:999px;font-family:"Manrope",system-ui,sans-serif;font-size:.8em;font-weight:600;color:#5A6861;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.04);transition:all .15s}'
      + '.tck-exit-btn:hover{border-color:#B85C3C;color:#B85C3C}'
      + '.tck-exit-btn span[aria-hidden]{font-size:.9em;line-height:1}'
      + '.tck-exit-label{letter-spacing:.02em}'
      + '@media(max-width:520px){.tck-exit-label{display:none}.tck-exit-btn{padding:8px 10px}}';
    document.head.appendChild(s);
  })();

  global.TCKProgress = {
    key: key,
    save: save,
    load: load,
    clear: clear,
    hasSaved: hasSaved,
    promptResume: promptResume,
    confirmExit: confirmExit,
    mountExitButton: mountExitButton,
    t: t
  };
})(window);
