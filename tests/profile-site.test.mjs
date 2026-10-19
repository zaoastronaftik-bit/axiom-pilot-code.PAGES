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
  assert.match(sw, /axiom-profile-static-v3/);
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

test('support links keep the classic landing layout and open the specified Telegram bot', () => {
  const homepage = file('index.html');
  const profile = file('profile.html');
  const support = file('support.html');
  const logo = readFileSync(new URL('../support-icon.webp', import.meta.url));
  const css = file('support.css');
  assert.match(homepage, /href="\.\/support\.html"/);
  assert.match(profile, /href="\.\/support\.html"/);
  assert.match(homepage, /class="support-shortcut"/);
  assert.match(profile, /class="support-shortcut"/);
  assert.match(homepage, /<dialog id="account-modal"/);
  assert.doesNotMatch(homepage, /enhancements\.css|data-theme-toggle/);
  assert.match(support, /https:\/\/t\.me\/AxiomPilotCode_bot/);
  assert.match(support, /rel="noopener noreferrer"/);
  assert.match(support, /src="\.\/support-icon\.webp"/);
  assert.match(homepage, /src="\.\/support-icon\.webp"/);
  assert.match(profile, /src="\.\/support-icon\.webp"/);
  assert.doesNotMatch(homepage + profile + support, /support\.svg/);
  assert.match(support, /href="\.\/site\.css"/);
  assert.match(support, /href="\.\/support\.css"/);
  assert.equal(logo.toString('ascii', 0, 4), 'RIFF');
  assert.equal(logo.toString('ascii', 8, 12), 'WEBP');
  assert.ok(logo.byteLength > 2500);
  assert.match(file('profile-sw.js'), /support-icon\.webp/);
  assert.match(css, /@media\(max-width:460px\)/);
});
