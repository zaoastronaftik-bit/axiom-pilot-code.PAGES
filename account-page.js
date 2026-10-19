/* AxiomPilotCode · full-page registration, sign-in, and workspace.
   Backend contract: custom Supabase Edge API, not Supabase Auth. */
(() => {
  'use strict';
  const view = document.body.dataset.authView;
  if (!['login','signup','account'].includes(view)) return;

  const $ = id => document.getElementById(id);
  const sessionKey = 'axiom-account-session-v1';
  const baseURL = String(window.AXIOM_ACCOUNT_API?.baseURL ?? '').replace(/\/$/, '');
  let apiEnabled = false;
  try {
    const u = new URL(baseURL);
    apiEnabled = u.protocol === 'https:' && Boolean(u.hostname) &&
      !u.username && !u.password && !u.search && !u.hash;
  } catch { /* unconfigured API */ }

  const storedToken = () => {
    try { return sessionStorage.getItem(sessionKey) || ''; }
    catch { return ''; }
  };
  const saveToken = value => {
    try {
      if (value) sessionStorage.setItem(sessionKey, value);
      else sessionStorage.removeItem(sessionKey);
      return true;
    } catch { return false; }
  };

  function notice(message, kind = 'error') {
    const box = $('auth-message');
    if (!box) return;
    box.textContent = message;
    box.dataset.kind = kind;
    box.hidden = !message;
  }

  async function request(path, options = {}) {
    if (!apiEnabled) throw new Error('Account server is not configured.');
    const token = options.token === undefined ? storedToken() : options.token;
    const responseOptions = {
      method: options.method || 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      }
    };
    if (options.body !== undefined) responseOptions.body = JSON.stringify(options.body);
    let response;
    try {
      response = await fetch(baseURL + path, responseOptions);
    } catch {
      throw new Error('Could not reach the account server. Check your connection and try again.');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.message || data?.error?.message ||
        (typeof data?.error === 'string' ? data.error : '') ||
        'Request failed (' + response.status + ').');
      error.status = response.status;
      throw error;
    }
    return { data, token: response.headers.get('set-auth-token') };
  }

  function withSubmitting(form, callback) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (form.dataset.submitting === 'true') return;
      if (!form.reportValidity()) return;
      const button = form.querySelector('[type="submit"]');
      const label = button.querySelector('span');
      const previous = label.textContent;
      form.dataset.submitting = 'true';
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      label.textContent = 'Please wait…';
      notice('');
      try {
        await callback(new FormData(form));
      } catch (error) {
        notice(error.message || 'Something went wrong. Please try again.');
      } finally {
        label.textContent = previous;
        button.disabled = false;
        button.removeAttribute('aria-busy');
        delete form.dataset.submitting;
      }
    });
  }

  document.querySelectorAll('[data-password-toggle]').forEach(button => {
    const input = $(button.dataset.passwordToggle);
    if (!input) return;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      button.textContent = visible ? 'Hide' : 'Show';
      button.setAttribute('aria-label', (visible ? 'Hide' : 'Show') + ' password');
      button.setAttribute('aria-pressed', String(visible));
      input.focus({ preventScroll: true });
    });
  });

  async function validateExistingSession() {
    if (!storedToken()) return;
    try {
      await request('/api/profile');
      location.replace('./account.html');
    } catch (error) {
      if (error.status === 401) saveToken('');
      // Keep the form usable if the server is temporarily unavailable.
    }
  }

  if (view === 'login') {
    const status = new URLSearchParams(location.search).get('status');
    if (status === 'signed-out') notice('You have signed out of your account.', 'success');
    if (status === 'offline-signout')
      notice('Signed out of this tab, but the server could not be reached to revoke the session.');
    const form = $('login-form');
    withSubmitting(form, async data => {
      const email = String(data.get('email') || '').trim();
      const password = String(data.get('password') || '');
      const result = await request('/api/auth/sign-in/email', {
        method: 'POST', token: '',
        body: { email, password }
      });
      if (!result.token) throw new Error('The server did not return a session token.');
      if (!saveToken(result.token)) throw new Error('This browser is blocking session storage. Enable it to sign in.');
      form.reset();
      location.assign('./account.html');
    });
    validateExistingSession();
  }

  if (view === 'signup') {
    const form = $('signup-form');
    const passwordInput = $('signup-password');
    const confirmInput = $('signup-repeat');
    const syncPasswordError = () => {
      const mismatch = Boolean(confirmInput.value && passwordInput.value !== confirmInput.value);
      confirmInput.setCustomValidity(mismatch ? 'Passwords do not match.' : '');
      confirmInput.setAttribute('aria-invalid', String(mismatch));
    };
    passwordInput.addEventListener('input', syncPasswordError);
    confirmInput.addEventListener('input', syncPasswordError);
    withSubmitting(form, async data => {
      syncPasswordError();
      if (!form.reportValidity()) return;
      const email = String(data.get('email') || '').trim();
      const password = String(data.get('password') || '');
      if (password.length < 10 || password.length > 128) throw new Error('Password must be 10–128 characters long.');
      if (password !== String(data.get('repeatPassword') || '')) throw new Error('Passwords do not match.');
      const result = await request('/api/auth/sign-up/email', {
        method: 'POST', token: '',
        body: { name: email.split('@')[0], email, password }
      });
      if (!result.token) {
        form.reset();
        location.assign('./login.html');
        return;
      }
      if (!saveToken(result.token)) throw new Error('This browser is blocking session storage. Enable it to sign in.');
      form.reset();
      location.assign('./account.html');
    });
    validateExistingSession();
  }

  if (view === 'account') {
    const status = $('workspace-status');
    const workspace = $('workspace-main');
    const tabs = [...document.querySelectorAll('[data-workspace-tab]')];
    const valid = new Set(['overview', 'security', 'devices']);
    const activate = (name, updateURL = false) => {
      if (!valid.has(name)) return;
      for (const button of tabs) {
        const selected = button.dataset.workspaceTab === name;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        const panel = $('panel-' + button.dataset.workspaceTab);
        panel.hidden = !selected;
      }
      if (updateURL) history.replaceState(null, '', location.pathname + location.search + '#' + name);
    };
    tabs.forEach((button, index) => {
      button.addEventListener('click', () => activate(button.dataset.workspaceTab, true));
      button.addEventListener('keydown', event => {
        let next = null;
        if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft') next = tabs[(index + tabs.length - 1) % tabs.length];
        if (event.key === 'Home') next = tabs[0];
        if (event.key === 'End') next = tabs[tabs.length - 1];
        if (!next) return;
        event.preventDefault();
        activate(next.dataset.workspaceTab, true);
        next.focus();
      });
    });
    activate(location.hash.slice(1) || 'overview');

    async function loadProfile() {
      if (!storedToken()) {
        location.replace('./login.html');
        return;
      }
      status.hidden = false;
      status.textContent = 'Checking your account…';
      try {
        const result = await request('/api/profile');
        if (!result.data?.id || !result.data?.email) throw new Error('Your profile could not be loaded.');
        const profile = result.data;
        $('profile-email').textContent = profile.email;
        $('profile-avatar').textContent = profile.email.slice(0, 1).toUpperCase();
        const plan = profile.plan === 'pro' ? 'Pro' : 'Free';
        $('profile-plan').textContent = plan;
        $('overview-plan').textContent = plan;
        workspace.hidden = false;
        status.hidden = true;
      } catch (error) {
        if (error.status === 401) {
          saveToken('');
          location.replace('./login.html');
          return;
        }
        status.textContent = error.message || 'Could not load the account.';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn btn-secondary';
        retry.textContent = 'Retry';
        retry.style.marginLeft = '15px';
        retry.addEventListener('click', loadProfile);
        status.append(retry);
      }
    }

    $('sign-out').addEventListener('click', async event => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      let revoked = false;
      try {
        await request('/api/auth/sign-out', { method: 'POST', body: {} });
        revoked = true;
      } catch { /* Still discard local token, but do not claim server revocation. */ }
      saveToken('');
      location.assign('./login.html?status=' + (revoked ? 'signed-out' : 'offline-signout'));
    });
    loadProfile();
  }
})();
