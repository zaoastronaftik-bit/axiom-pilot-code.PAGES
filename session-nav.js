/* Keep account navigation in sync with the current tab's session. */
(() => {
  'use strict';
  let signedIn = false;
  try { signedIn = Boolean(sessionStorage.getItem('axiom-account-session-v1')); } catch { /* storage blocked */ }
  document.addEventListener('DOMContentLoaded', () => {
    const link = document.getElementById('open-account');
    if (link && signedIn) {
      link.href = './account.html';
      link.firstChild.textContent = 'My workspace ';
    }
  });
})();
