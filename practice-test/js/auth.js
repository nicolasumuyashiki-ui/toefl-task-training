/**
 * セッション管理 (localStorage)
 */
const Auth = {
  save(user) {
    localStorage.setItem('toefl_user', JSON.stringify(user));
    // Mirror to sessionStorage under the Task Training key so the recording
    // hook (which reads kickstart_user) can find the user without a separate
    // login. Stores under both `userId` (TT canonical) and `id` (PT legacy).
    try {
      const u = user || {};
      sessionStorage.setItem('kickstart_user', JSON.stringify({
        userId:   u.id || u.userId || u.name || '',
        userName: u.name || u.userName || '',
        email:    u.email || ''
      }));
    } catch (e) {}
  },
  get() {
    // Primary: TT's kickstart_user in sessionStorage — the account that is
    // ACTUALLY logged in right now. This must win: toefl_user persists in
    // localStorage across account switches on a shared PC, and letting it
    // override the live session made results save under the PREVIOUS user.
    let tt = null;
    try { tt = JSON.parse(sessionStorage.getItem('kickstart_user')); } catch {}
    let pt = null;
    try { pt = JSON.parse(localStorage.getItem('toefl_user')); } catch {}
    if (tt && (tt.userId || tt.userName || tt.email)) {
      // Stale persisted login from a DIFFERENT account → discard it so it can
      // never resurrect the previous user after this session ends.
      const ptId = pt ? String(pt.id || pt.userId || '') : '';
      if (pt && ptId && ptId !== String(tt.userId || '')) {
        try { localStorage.removeItem('toefl_user'); } catch (e) {}
      }
      return { id: tt.userId, name: tt.userName, email: tt.email };
    }
    // Fallback: PT's own persisted login (standalone PT usage with no live
    // session in this tab).
    if (pt) return pt;
    return null;
  },
  clear() {
    localStorage.removeItem('toefl_user');
    sessionStorage.removeItem('kickstart_user');
  },
  require() {
    // --- Admin/staff preview -------------------------------------------------
    // Opened from the Admin console's "問題を確認する" link with ?preview=1.
    // A rel="noopener" tab starts with an EMPTY sessionStorage, so the staff
    // kickstart_user does NOT carry over here — we cannot rely on it. The
    // explicit flag is what makes the button open the question directly every
    // time. Preview is view-only: no login, no saving, no heartbeat (see
    // getUserId → null), and js/api.js short-circuits every save.
    let isPreview = false;
    try {
      isPreview = /[?&]preview=1(?:&|$)/.test(location.search) ||
                  sessionStorage.getItem('pt_preview') === '1';
    } catch (e) {}
    if (isPreview) {
      try { sessionStorage.setItem('pt_preview', '1'); } catch (e) {} // survive in-tab nav
      window.__PT_PREVIEW__ = true;
      Auth._showPreviewBanner();
      return { id: '', name: 'プレビュー', email: '', preview: true };
    }
    // -------------------------------------------------------------------------
    const u = this.get();
    if (!u) {
      // If we're in a sub-folder (TT context), bounce up to TT's login.
      // Otherwise (standalone PT), bounce to local index.
      const inTT = location.pathname.indexOf('/practice-test/') !== -1;
      location.href = inTT ? '../index.html' : 'index.html';
      return null;
    }
    // Re-mirror on every require() so a user from a long-running tab still
    // has the kickstart_user key available even after sessionStorage was
    // cleared by a different tab close.
    Auth.save(u);
    return u;
  },
  showBadge(elementId) {
    const u = this.get();
    const el = document.getElementById(elementId);
    if (window.__PT_PREVIEW__ && el) { el.innerHTML = '<strong>プレビュー（採点・保存なし）</strong>'; return; }
    if (u && u.name && el) {
      el.innerHTML = 'Welcome, <strong>' + u.name + '</strong>';
    }
  },
  // Fixed banner shown in Admin preview so staff know this view is read-only
  // and nothing they touch here is graded or saved.
  _showPreviewBanner() {
    try {
      if (document.getElementById('pt-preview-banner')) return;
      var add = function () {
        if (document.getElementById('pt-preview-banner')) return;
        var b = document.createElement('div');
        b.id = 'pt-preview-banner';
        b.textContent = '👁 プレビュー表示（Admin）— 採点も保存もされません';
        b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#0F5C3A;color:#fff;' +
          'font:600 13px/1.4 system-ui,sans-serif;text-align:center;padding:6px 10px;letter-spacing:.02em';
        document.body.appendChild(b);
        document.body.style.paddingTop = (b.offsetHeight || 30) + 'px';
      };
      if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
    } catch (e) {}
  }
};

/* Heartbeat — pings the Task Training GAS so admin dashboard's
   "ACTIVE NOW" pulse lights up while the user is taking the
   Practice Test. Fire-and-forget JSONP, every 90s. Silent failure
   if unauthenticated (no user → skip). */
(function startHeartbeat(){
  var GAS = 'https://script.google.com/macros/s/AKfycbwjI8n86Cu1ar1IsPffyq9mboDrUNpG-SsVpFtURjP6AmCFHD3Zbw5_qcJJUksz_UDyyw/exec';
  function getUserId(){
    var u = null;
    try { u = JSON.parse(sessionStorage.getItem('kickstart_user') || 'null'); } catch(e){}
    if (u && u.userId) return u.userId;
    try { u = JSON.parse(localStorage.getItem('toefl_user') || 'null'); } catch(e){}
    if (u && (u.id || u.userId || u.name)) return u.id || u.userId || u.name;
    return null;
  }
  // Global JSONP callback shared by every ping (server response is ignored).
  window._ptHbCb = function(){};
  function ping(){
    var id = getUserId();
    if (!id) return;
    var s = document.createElement('script');
    s.src = GAS + '?action=heartbeat&id=' + encodeURIComponent(id) + '&callback=_ptHbCb';
    s.onload = s.onerror = function(){ if (s.parentNode) s.parentNode.removeChild(s); };
    document.head.appendChild(s);
  }
  setTimeout(ping, 1500);
  setInterval(ping, 90000); // every 90 sec
})();
