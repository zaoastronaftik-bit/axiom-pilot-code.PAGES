/* UI-only routing layer: retain the classic sign-in dialog, give profiles their own page. */
(() => {
  'use strict';
  const button = document.getElementById('open-account');
  const dialog = document.getElementById('account-modal');
  const mini = document.getElementById('auth-profile');
  if (!button || !dialog || !mini) return;
  function profileURL() {
    const value = new URLSearchParams(location.search).get('device');
    const code = value && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i.test(value)
      ? '?device=' + encodeURIComponent(value.toUpperCase()) : '';
    return './profile.html' + code;
  }
  function signedIn() {
    try { return Boolean(sessionStorage.getItem('axiom-account-session-v1')); }
    catch { return false; }
  }
  function maybeNavigate() {
    if (dialog.open && !mini.hidden && signedIn()) location.assign(profileURL());
  }
  if (signedIn()) {
    button.textContent = 'My profile';
    button.addEventListener('click', event => {
      event.stopImmediatePropagation();
      location.assign(profileURL());
    }, true);
  }
  const observer = new MutationObserver(maybeNavigate);
  observer.observe(mini, { attributes: true, attributeFilter: ['hidden'] });
  observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  const params = new URLSearchParams(location.search);
  if ((params.has('login') || params.has('device') || params.has('signup')) && !signedIn())
    queueMicrotask(() => {
      button.click();
      if (params.has('signup')) document.getElementById('auth-tab-signup')?.click();
    });
})();
