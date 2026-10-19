import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('classic homepage retains account dialog and links to separate profile', () => {
  const homepage = file('index.html');
  assert.match(homepage, /<dialog id="account-modal"/);
  assert.match(homepage, /href="\.\/profile\.html"/);
  assert.match(homepage, /profile-entry\.js/);
  assert.doesNotMatch(homepage, /enhancements\.css|data-theme-toggle/);
});
test('profile has independent nickname, chat, module and device surfaces', () => {
  const profile = file('profile.html');
  assert.match(profile, /id="nickname-form"/);
  assert.match(profile, /id="modules-list"/);
  assert.match(profile, /id="chats-list"/);
  assert.match(profile, /id="profile-signout"/);
  assert.match(profile, /id="approve-device"/);
  assert.match(profile, /id="device-token-list"/);
  assert.match(profile, /href="\.\/site\.css"/);
  assert.match(profile, /href="\.\/profile\.css"/);
});
test('offline cache excludes authentication pages and never handles cross-origin API', () => {
  const sw = file('profile-sw.js');
  assert.match(sw, /axiom-profile-static-v2/);
  assert.match(sw, /if \(url\.origin !== self\.location\.origin/);
  assert.doesNotMatch(sw, /['"]\.\/index\.html['"]/);
  assert.doesNotMatch(sw, /['"]\.\/login\.html['"]/);
  assert.doesNotMatch(sw, /['"]\.\/account\.js['"]/);
});
test('CLI sync is not silently enabled on the website and private key remains local', () => {
  const page = file('profile.js');
  assert.match(page, /indexedDB\.open/);
  assert.match(page, /RSA-OAEP/);
  assert.match(page, /AES-GCM/);
  assert.match(page, /api\/sync\/ack/);
  assert.match(page, /api\/sync\/pending/);
  assert.match(page, /privateKey/);
  assert.doesNotMatch(page, /setItem\([^\n]*privateKey/);
});
