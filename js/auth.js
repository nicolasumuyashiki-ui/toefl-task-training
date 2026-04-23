/* ============================================================
   TCK Workshop — Auth + Access Control
   ============================================================ */

var TCK_ALLOWED_DOMAINS = [
  '@tckworkshop.co.jp',
  '@tck-workshop.com', // fallback
];
var TCK_ALLOWLIST = [
  // External beta emails go here (lowercase).
  // 'beta@example.com',
];
/* Staff login IDs — emergency bypass for users whose email cannot be
   validated. Empty by default now that GAS returns the email field.
   Add entries here only as a short-term override. */
var TCK_STAFF_ID_ALLOWLIST = [];

function tckIsAllowed(email, userId) {
  if (userId && TCK_STAFF_ID_ALLOWLIST.indexOf(userId) !== -1) return true;
  if (!email || typeof email !== 'string') return false;
  var e = email.toLowerCase();
  for (var i = 0; i < TCK_ALLOWED_DOMAINS.length; i++) {
    if (e.endsWith(TCK_ALLOWED_DOMAINS[i])) return true;
  }
  for (var j = 0; j < TCK_ALLOWLIST.length; j++) {
    if (e === TCK_ALLOWLIST[j].toLowerCase()) return true;
  }
  return false;
}
function tckIsStaff(email, userId) {
  if (userId && TCK_STAFF_ID_ALLOWLIST.indexOf(userId) !== -1) return true;
  return !!email && email.toLowerCase().endsWith('@tckworkshop.co.jp');
}

/* Figure out the relative prefix to reach the root (index.html / menu.html).
   Examples:
     /index.html           → ''
     /menu.html            → ''
     /admin/index.html     → '../'
     /reading/ctw/x.html   → '../../' */
function tckRootPrefix() {
  var parts = location.pathname.split('/').filter(function(s){ return s && s.indexOf('.html') === -1; });
  return parts.length > 0 ? new Array(parts.length + 1).join('../') : '';
}

var Auth = {
  SESSION_KEY: 'kickstart_user',

  require: function() {
    // 1. Require a session
    if (!this.getUser()) {
      window.location.href = tckRootPrefix() + 'index.html';
      return false;
    }
    // 2. Enforce domain gate (skip in ?preview=1 mode)
    if (location.search.indexOf('preview=1') === -1) {
      var u = this.getUser();
      // If no email is present in the session (GAS may omit it), fall
      // back to userId allowlist. Only reject if email exists AND fails.
      if (u && u.email && !tckIsAllowed(u.email, u.userId)) {
        sessionStorage.removeItem(this.SESSION_KEY);
        window.location.href = tckRootPrefix() + 'index.html?gate=denied';
        return false;
      }
    }
    return true;
  },

  getUser: function() {
    try {
      var d = JSON.parse(sessionStorage.getItem(this.SESSION_KEY));
      return (d && d.userId) ? d : null;
    } catch(e) { return null; }
  },

  save: function(userData) {
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(userData));
  },

  showBadge: function(elementId) {
    var u = this.getUser(), el = document.getElementById(elementId);
    if (u && el) el.innerHTML = '<strong>' + u.userName + '</strong>';
  },

  completeSet: function(setNum) {
    var c = JSON.parse(sessionStorage.getItem('kickstart_completed') || '[]');
    if (c.indexOf(setNum) === -1) c.push(setNum);
    sessionStorage.setItem('kickstart_completed', JSON.stringify(c));
  },

  getCompletedSets: function() {
    return JSON.parse(sessionStorage.getItem('kickstart_completed') || '[]');
  }
};

if (typeof window !== 'undefined') {
  window.tckIsAllowed = tckIsAllowed;
  window.tckIsStaff = tckIsStaff;
}
