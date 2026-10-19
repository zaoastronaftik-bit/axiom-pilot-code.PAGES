import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const client = readFileSync(new URL('../account.js', import.meta.url), 'utf8');
const baseURL = 'https://vkmmqhnuvphiyblyjgif.supabase.co/functions/v1/axiom-account';

function mount(apiURL) {
  const elements = new Map();
  const store = new Map();
  const calls = [];
  const email = 'test@example.invalid';
  const password = 'ExampleTestPassword123!';
  const values = { email, password, repeatPassword: password };

  function element(id) {
    if (!elements.has(id)) {
      const listeners = new Map();
      elements.set(id, {
        id, hidden: false, dataset: {}, textContent: '', disabled: false,
        listeners, open: false,
        addEventListener(event, handler) { listeners.set(event, handler); },
        setAttribute() {},
        showModal() { this.open = true; },
        close() { this.open = false; },
        querySelector() { return { disabled: false }; },
        elements: { namedItem(name) { return { value: values[name] ?? '' }; } },
        reset() {}
      });
    }
    return elements.get(id);
  }

  const fetch = async (url, options) => {
    calls.push({ url, options });
    let data = {};
    let headers = {};
    if (url.endsWith('/api/status')) data = { passwordRecovery: false };
    else if (url.endsWith('/api/auth/sign-up/email')) {
      data = { user: { id: 'test-id', email, plan: 'free' } };
      headers = { 'set-auth-token': 'temporary-session-token' };
    } else if (url.endsWith('/api/profile')) {
      data = { id: 'test-id', email, plan: 'free' };
    } else if (url.endsWith('/api/auth/sign-out')) data = { ok: true };
    return { ok: true, status: 200, headers: { get: key => headers[key] ?? null }, json: async () => data };
  };

  vm.runInNewContext(client, {
    window: { AXIOM_ACCOUNT_API: { baseURL: apiURL } },
    document: { getElementById: element },
    sessionStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: key => store.delete(key)
    },
    fetch, URL, location: { origin: 'https://zaoastronaftik-bit.github.io', pathname: '/' }
  });
  return { elements, store, calls };
}

const ready = () => new Promise(resolve => setImmediate(resolve));

test('account initializes status request for HTTPS Edge Function URL with a path', async () => {
  const app = mount(baseURL);
  await ready();
  assert.equal(app.calls[0]?.url, baseURL + '/api/status');
  assert.equal(app.elements.get('auth-message').hidden, true);
});

test('account displays disconnected warning when API URL is unset', async () => {
  const app = mount('');
  await ready();
  assert.equal(app.calls.length, 0);
  assert.match(app.elements.get('auth-message').textContent, /server is connected/i);
});

test('sign-up creates a session, opens profile, and sign-out clears it', async () => {
  const app = mount(baseURL);
  await ready();
  const submit = app.elements.get('auth-signup-form').listeners.get('submit');
  await submit({ preventDefault() {} });
  const signup = app.calls.find(c => c.url.endsWith('/api/auth/sign-up/email'));
  assert.ok(signup, 'registration request must be sent');
  const body = JSON.parse(signup.options.body);
  assert.equal(body.email, 'test@example.invalid');
  assert.equal(body.password, 'ExampleTestPassword123!');
  assert.equal(app.store.get('axiom-account-session-v1'), 'temporary-session-token');
  const profile = app.calls.find(c => c.url.endsWith('/api/profile'));
  assert.equal(profile?.options.headers.Authorization, 'Bearer temporary-session-token');
  assert.equal(app.elements.get('auth-profile').hidden, false);

  await app.elements.get('sign-out').listeners.get('click')();
  assert.equal(app.store.has('axiom-account-session-v1'), false);
  assert.ok(app.calls.some(c => c.url.endsWith('/api/auth/sign-out')));
});