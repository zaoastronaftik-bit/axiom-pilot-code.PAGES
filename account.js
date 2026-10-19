/* AxiomPilotCode | account client for the independent Better Auth backend. */
(() => {
  'use strict';
  const dialog = document.getElementById('account-modal');
  if (!dialog) return;
  const $ = id => document.getElementById(id);
  const forms = Object.fromEntries(['login','signup','reset','recover'].map(x => [x, $('auth-'+x+'-form')]));
  const tabs = $('auth-tabs');
  const messageBox = $('auth-message');
  const base = String(window.AXIOM_ACCOUNT_API?.baseURL ?? '').replace(/\/$/, '');
  const enabled = /^https:\/\/[a-z0-9][a-z0-9.-]+(?::443)?$/i.test(base);
  const storageKey = 'axiom-account-session-v1';
  const storedToken = () => sessionStorage.getItem(storageKey) || '';
  let token = storedToken();
  let me = null;
  let canRecover = false;
  let busy = false;

  const labels = {
    login: ['Welcome back.', 'Sign in to your AxiomPilotCode account.'],
    signup: ['Create your account.', 'Your personal workspace starts here.'],
    reset: ['Recover access.', 'Enter your email to receive a password-reset link.'],
    recover: ['Choose a new password.', 'Set a new password for your account.'],
    profile: ['Your workspace.', 'Your personal AxiomPilotCode account.']
  };

  function notice(text = '', type = 'info') {
    messageBox.textContent = text;
    messageBox.dataset.kind = type;
    messageBox.hidden = !text;
  }

  function mode(name, resetNotice = true) {
    const [title, desc] = labels[name] || labels.login;
    $('auth-title').textContent = title;
    $('auth-description').textContent = desc;
    for (const [key, form] of Object.entries(forms)) form.hidden = name !== key;
    $('auth-profile').hidden = name !== 'profile';
    tabs.hidden = name !== 'login' && name !== 'signup';
    $('auth-tab-login').setAttribute('aria-selected', String(name === 'login'));
    $('auth-tab-signup').setAttribute('aria-selected', String(name === 'signup'));
    if (resetNotice) notice();
    if (!enabled && name !== 'profile') notice('Registration and sign-in will open after the AxiomPilotCode account server is connected. Please do not enter passwords yet.');
  }

  function open(name = 'login') {
    mode(me ? 'profile' : name);
    if (!dialog.open) dialog.showModal();
  }

  ['open-account', 'preview-profile'].forEach(id => $(id)?.addEventListener('click', () => open()));
  $('close-account').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  $('auth-tab-login').addEventListener('click', () => mode('login'));
  $('auth-tab-signup').addEventListener('click', () => mode('signup'));
  $('forgot-password').addEventListener('click', () => {
    if (!canRecover) return notice('Password recovery is not enabled yet. Contact support if you need assistance.');
    mode('reset');
  });
  $('back-to-login').addEventListener('click', () => mode('login'));

  async function request(path, options = {}) {
    if (!enabled) throw new Error('Axiom account server has not been connected yet.');
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        method: options.method || 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers,
        body: options.body == null ? undefined : JSON.stringify(options.body),
        cache: 'no-store'
      });
    } catch { throw new Error('Cannot reach the Axiom account server. Try again later.'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data?.message || data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || `Request failed (${response.status})`;
      throw new Error(detail);
    }
    return { data, authToken: response.headers.get('set-auth-token') };
  }

  function saveToken(value) {
    token = value;
    if (value) sessionStorage.setItem(storageKey, value);
    else sessionStorage.removeItem(storageKey);
  }

  function passwordFor(form, confirm) {
    const pass = form.elements.namedItem('password').value;
    if (confirm && pass !== form.elements.namedItem('repeatPassword').value) throw new Error('The passwords do not match.');
    if (pass.length < 10) throw new Error('Use at least 10 characters for your password.');
    return pass;
  }

  async function showProfile() {
    const { data } = await request('/api/profile');
    if (!data?.id || !data?.email) throw new Error('Account details are temporarily unavailable.');
    me = data;
    $('profile-email').textContent = data.email;
    $('profile-avatar').textContent = data.email[0].toUpperCase();
    $('profile-plan').textContent = data.plan === 'pro' ? 'Pro' : 'Free';
    $('open-account').textContent = 'My account';
    mode('profile');
    await showCliTokens();
  }

  async function showCliTokens() {
    let panel = $('cli-token-panel');
    if (!panel) { panel=document.createElement('section'); panel.id='cli-token-panel'; $('auth-profile').append(panel); }
    panel.replaceChildren();
    const title=document.createElement('h3'); title.textContent='Connected CLI tokens'; panel.append(title);
    try {
      const {data}=await request('/api/tokens');
      if (!Array.isArray(data?.tokens)) throw new Error('Invalid token list');
      if (!data.tokens.length) { const empty=document.createElement('p'); empty.textContent='No CLI tokens.'; panel.append(empty); }
      for (const item of data.tokens) {
        const row=document.createElement('div'); const label=document.createElement('p');
        const expired=Date.parse(item.expires_at)<=Date.now();
        label.textContent=`Created ${item.created_at} · expires ${item.expires_at} · ${item.revoked_at ? 'revoked' : expired ? 'expired' : 'active'}`;
        row.append(label);
        if (!item.revoked_at && !expired) {
          const button=document.createElement('button'); button.type='button'; button.textContent='Revoke this CLI token';
          button.addEventListener('click', async () => {
            if (!confirm('Revoke this CLI token? The CLI will need to sign in again.')) return;
            button.disabled=true;
            try { await request('/api/tokens?action=revoke',{method:'POST',body:{tokenId:item.id}}); await showCliTokens(); }
            catch(error) { notice(error.message,'error'); button.disabled=false; }
          }); row.append(button);
        }
        panel.append(row);
      }
    } catch(error) { const failed=document.createElement('p'); failed.textContent=`Token management unavailable: ${error.message}`; panel.append(failed); }
  }

  function submit(form, handler) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      const button = form.querySelector('[type=submit]');
      button.disabled = true;
      notice();
      try { await handler(form); }
      catch (error) { notice(error.message || 'Please try again.', 'error'); }
      finally { button.disabled = false; busy = false; }
    });
  }

  submit(forms.login, async form => {
    const { authToken } = await request('/api/auth/sign-in/email', {
      method: 'POST',
      body: {
        email: form.elements.namedItem('email').value.trim(),
        password: form.elements.namedItem('password').value
      }
    });
    if (!authToken) throw new Error('Your account session could not be created.');
    saveToken(authToken);
    form.reset();
    await showProfile();
  });

  submit(forms.signup, async form => {
    const { authToken } = await request('/api/auth/sign-up/email', {
      method: 'POST',
      body: {
        name: form.elements.namedItem('email').value.split('@')[0],
        email: form.elements.namedItem('email').value.trim(),
        password: passwordFor(form, true)
      }
    });
    form.reset();
    if (!authToken) { mode('login'); return notice('Your account was created. Please sign in.', 'success'); }
    saveToken(authToken);
    await showProfile();
  });

  submit(forms.reset, async form => {
    await request('/api/auth/request-password-reset', {
      method: 'POST',
      body: { email: form.elements.namedItem('email').value.trim(), redirectTo: location.origin + location.pathname }
    });
    notice('If an account exists, a password reset email is on its way.', 'success');
  });

  submit(forms.recover, async form => {
    const params = new URLSearchParams(location.search);
    const resetToken = params.get('token');
    if (!resetToken) throw new Error('The recovery token is missing or expired.');
    await request('/api/auth/reset-password', {
      method: 'POST', body: { token: resetToken, newPassword: passwordFor(form, true) }
    });
    history.replaceState({}, '', location.pathname + location.hash);
    form.reset();
    saveToken('');
    me = null;
    mode('login');
    notice('Password updated. You can now sign in.', 'success');
  });

  $('sign-out').addEventListener('click', async () => {
    try { if (token) await request('/api/auth/sign-out', { method: 'POST', body: {} }); }
    catch { /* Remove the local bearer token even if server is unreachable. */ }
    finally {
      saveToken(''); me = null;
      $('open-account').textContent = 'Sign in';
      mode('login');
      notice('Signed out of this browser.');
    }
  });

  (async () => {
    mode('login');
    if (!enabled) return;
    try {
      const {data: status} = await request('/api/status');
      canRecover = Boolean(status.passwordRecovery);
      if (token) await showProfile();
      if (new URLSearchParams(location.search).has('token')) open('recover');
    } catch {
      if (token) { saveToken(''); me = null; }
    }
  })();
})();
