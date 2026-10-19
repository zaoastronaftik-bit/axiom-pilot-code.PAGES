import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const file = name => readFileSync(new URL(name, root), 'utf8');
const script = file('account-page.js');

test('original landing visuals and account dialog are restored without reverting backend integration', () => {
  const homepage = file('index.html');
  assert.match(homepage, /<dialog id="account-modal"/);
  assert.match(homepage, /href="\.\/auth\.css"/);
  assert.match(homepage, /src="\.\/account\.js/);
  assert.match(homepage, /src="\.\/api-config\.js/);
  assert.doesNotMatch(homepage, /enhancements\.css|session-nav\.js|data-theme-toggle/);
  for (const page of ['login.html', 'signup.html', 'account.html']) {
    const html = file(page);
    assert.match(html, /href="\.\/enhancements\.css"/);
    assert.match(html, /href="\.\/app\.css"/);
    assert.match(html, /src="\.\/theme\.js"/);
    assert.match(html, /src="\.\/account-page\.js"/);
    assert.match(html, /data-auth-view=/);
  }
  assert.match(file('signup.html'), /name="repeatPassword"/);
  assert.match(file('account.html'), /role="tablist"/);
  assert.match(file('account.html'), /id="panel-security"/);
  assert.match(file('account.html'), /id="panel-devices"/);
  assert.match(file('enhancements.css'), /html\[data-theme="dark"\]/);
  assert.match(file('enhancements.css'), /prefers-reduced-motion/);
});

function boot(view, existingToken = '') {
  const elements = new Map();
  const storage = new Map(existingToken ? [['axiom-account-session-v1', existingToken]] : []);
  const requests = [];
  const navigation = [];
  const handlers = new Map();
  const user = { id: 'user-id', email: 'example@test.invalid', plan: 'free' };
  const values = {
    'login-form': { email: user.email, password: 'A-very-strong-password!' },
    'signup-form': { email: user.email, password: 'A-very-strong-password!', repeatPassword: 'A-very-strong-password!' }
  };

  function node(id) {
    if (!elements.has(id)) {
      const listeners = new Map();
      const label = { textContent: 'Submit' };
      const button = {
        disabled: false,
        querySelector: () => label,
        setAttribute() {},
        removeAttribute() {}
      };
      elements.set(id, {
        id, dataset: {}, listeners, textContent: '', hidden: false, disabled: false,
        addEventListener(type, cb) { listeners.set(type, cb); },
        setAttribute(k, v) { this[k] = v; },
        removeAttribute() {},
        append() {},
        focus() {},
        reportValidity() { return true; },
        reset() {},
        querySelector: () => button,
        setCustomValidity() {},
        tabIndex: 0
      });
    }
    return elements.get(id);
  }

  const tabs = ['overview','security','devices'].map(name => {
    const button = node('tab-' + name);
    button.dataset.workspaceTab = name;
    return button;
  });

  const document = {
    body: { dataset: { authView: view } },
    getElementById: node,
    querySelectorAll(selector) {
      if (selector === '[data-password-toggle]') return [];
      if (selector === '[data-workspace-tab]') return tabs;
      return [];
    },
    createElement: tag => node(tag + '-created')
  };
  const location = {
    search: '', hash: '', pathname: '/account.html',
    assign: path => navigation.push(['assign',path]),
    replace: path => navigation.push(['replace',path])
  };
  const fetch = async (url, options) => {
    requests.push({ url, options });
    const endpoint = new URL(url).pathname;
    const result = endpoint.includes('/api/auth/sign-in/email') || endpoint.includes('/api/auth/sign-up/email')
      ? { user }
      : endpoint.includes('/api/profile') ? user : { ok: true };
    return {
      ok: true,
      status: 200,
      headers: { get: name => name === 'set-auth-token' ? 'session-token-123' : null },
      json: async () => result
    };
  };
  class FormDataMock {
    constructor(form) { this.values = values[form.id]; }
    get(key) { return this.values[key]; }
  }
  vm.runInNewContext(script, {
    document, window: { AXIOM_ACCOUNT_API: { baseURL: 'https://example.supabase.co/functions/v1/axiom-account' } },
    URL, URLSearchParams, FormData: FormDataMock, fetch,
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    location, history: { replaceState(...params) { handlers.set('history',params); } }
  });
  return { elements, node, storage, requests, navigation, tabs };
}

test('login page signs in against the existing account API and opens dedicated workspace', async () => {
  const app = boot('login');
  const listener = app.node('login-form').listeners.get('submit');
  await listener({ preventDefault() {} });
  const request = app.requests.find(r => r.url.endsWith('/api/auth/sign-in/email'));
  assert.ok(request);
  assert.equal(JSON.parse(request.options.body).email, 'example@test.invalid');
  assert.equal(app.storage.get('axiom-account-session-v1'), 'session-token-123');
  assert.deepEqual(app.navigation, [['assign', './account.html']]);
});

test('signup sends confirmation-checked password and opens workspace', async () => {
  const app = boot('signup');
  const listener = app.node('signup-form').listeners.get('submit');
  await listener({ preventDefault() {} });
  const request = app.requests.find(r => r.url.endsWith('/api/auth/sign-up/email'));
  assert.ok(request);
  assert.equal(JSON.parse(request.options.body).password, 'A-very-strong-password!');
  assert.equal(app.storage.get('axiom-account-session-v1'), 'session-token-123');
  assert.deepEqual(app.navigation, [['assign', './account.html']]);
});

test('account page loads profile and provides keyboard-accessible tabs', async () => {
  const app = boot('account', 'existing-session');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.node('profile-email').textContent, 'example@test.invalid');
  assert.equal(app.node('workspace-main').hidden, false);
  const security = app.node('tab-security');
  security.listeners.get('click')();
  assert.equal(app.node('panel-overview').hidden, true);
  assert.equal(app.node('panel-security').hidden, false);
  assert.equal(security['aria-selected'], 'true');
  await app.node('sign-out').listeners.get('click')({ currentTarget: app.node('sign-out') });
  assert.equal(app.storage.has('axiom-account-session-v1'), false);
  assert.deepEqual(app.navigation, [['assign', './login.html?status=signed-out']]);
});
