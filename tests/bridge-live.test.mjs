import assert from 'node:assert/strict';
import { randomBytes, webcrypto } from 'node:crypto';

const account = 'https://vkmmqhnuvphiyblyjgif.supabase.co/functions/v1/axiom-account';
const bridge = 'https://vkmmqhnuvphiyblyjgif.supabase.co/functions/v1/axiom-bridge';
const origin = 'https://zaoastronaftik-bit.github.io';
const email = 'apc-bridge-' + Date.now() + '-' + randomBytes(4).toString('hex') + '@example.invalid';
const password = 'E2e!' + randomBytes(24).toString('base64url');
console.log('Synthetic test email:', email);
const bytes = value => Buffer.from(value).toString('base64url');
const raw = value => Buffer.from(value, 'base64url');
async function call(url, method = 'GET', payload, bearer, browser = false) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(browser ? { Origin: origin } : {}),
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(bearer ? { Authorization: 'Bearer ' + bearer } : {})
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, headers: response.headers };
}
const status = await call(bridge + '/api/status');
assert.equal(status.status, 200);
const denied = await call(bridge + '/api/sync/pending', 'GET', undefined, undefined, true);
assert.equal(denied.status, 401);
console.log('Bridge health and anonymous denial: OK');
const signup = await call(account + '/api/auth/sign-up/email', 'POST', { email, password }, undefined, true);
assert.equal(signup.status, 200, 'signup: ' + JSON.stringify(signup.body));
const webToken = signup.headers.get('set-auth-token');
assert.ok(webToken?.length === 64);
const id = signup.body.user.id;
console.log('Original website authentication: OK');

const nickname = await call(bridge + '/api/profile', 'PATCH', { nickname: 'BridgeTester' }, webToken, true);
assert.equal(nickname.status, 200, 'nickname: ' + JSON.stringify(nickname.body));
assert.equal(nickname.body.nickname, 'BridgeTester');
const profile = await call(bridge + '/api/profile', 'GET', undefined, webToken, true);
assert.equal(profile.body.id, id);
assert.equal(profile.body.nickname, 'BridgeTester');
console.log('Profile nickname: OK');

const pair = await webcrypto.subtle.generateKey({
  name: 'RSA-OAEP', modulusLength: 3072,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'
}, false, ['encrypt','decrypt']);
const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
const registered = await call(bridge + '/api/sync/key', 'POST', { publicKey: jwk }, webToken, true);
assert.equal(registered.status, 200, 'register key: ' + JSON.stringify(registered.body));
const key = await call(bridge + '/api/sync/key', 'GET', undefined, webToken, true);
assert.equal(key.body.publicKey.n, jwk.n);
console.log('Account-specific public key: OK');

const device = await call(bridge + '/api/device?action=start', 'POST', {});
assert.equal(device.status, 200, 'device start: ' + JSON.stringify(device.body));
assert.match(device.body.userCode, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
assert.match(device.body.deviceCode, /^[A-Za-z0-9_-]{40,50}$/);
const pending = await call(bridge + '/api/device?action=poll', 'POST', { deviceCode: device.body.deviceCode });
assert.equal(pending.status, 202, 'pending poll: ' + JSON.stringify(pending.body));
const approval = await call(bridge + '/api/device?action=approve', 'POST', { userCode: device.body.userCode }, webToken, true);
assert.equal(approval.status, 200, 'approval: ' + JSON.stringify(approval.body));
const authorized = await call(bridge + '/api/device?action=poll', 'POST', { deviceCode: device.body.deviceCode });
assert.equal(authorized.status, 200, 'authorized poll: ' + JSON.stringify(authorized.body));
const cliToken = authorized.body.accessToken;
assert.match(cliToken, /^axiom_cli_[A-Za-z0-9_-]{40,50}$/);
const doublePoll = await call(bridge + '/api/device?action=poll', 'POST', { deviceCode: device.body.deviceCode });
assert.equal(doublePoll.status, 400);
const whoami = await call(bridge + '/api/cli', 'GET', undefined, cliToken);
assert.equal(whoami.status, 200);
assert.equal(whoami.body.userId, id);
const keyForCLI = await call(bridge + '/api/sync/key', 'GET', undefined, cliToken);
assert.equal(keyForCLI.body.publicKey.n, jwk.n);
console.log('CLI start → pending → approval → single-use exchange → whoami: OK');

const snapshot = {
  schema: 1,
  modules: [{ id:'runtime', name:'llama.cpp', version:'b11669', source:'local' }],
  chats: [{ id:'fixture-chat', title:'Saved coding conversation', model:'Qwen', date: new Date().toISOString(),
    messages: [{role:'user',content:'Review hello.js'},{role:'assistant',content:'Checked locally.'}] }]
};
const aes = await webcrypto.subtle.generateKey({ name:'AES-GCM', length:256 }, true, ['encrypt','decrypt']);
const rawKey = await webcrypto.subtle.exportKey('raw', aes);
const iv = randomBytes(12);
const ciphertext = await webcrypto.subtle.encrypt({ name:'AES-GCM', iv }, aes, new TextEncoder().encode(JSON.stringify(snapshot)));
const pub = await webcrypto.subtle.importKey('jwk', keyForCLI.body.publicKey, {name:'RSA-OAEP',hash:'SHA-256'}, false, ['encrypt']);
const wrapped = await webcrypto.subtle.encrypt({name:'RSA-OAEP'},pub,rawKey);
const envelope = {v:1,alg:'RSA-OAEP-256+A256GCM',ek:bytes(wrapped),iv:bytes(iv),data:bytes(ciphertext)};
const uploaded = await call(bridge + '/api/sync/upload','POST',{envelope},cliToken);
assert.equal(uploaded.status,200,'upload: '+JSON.stringify(uploaded.body));
const inbox = await call(bridge + '/api/sync/pending','GET',undefined,webToken,true);
assert.equal(inbox.status,200);
assert.equal(inbox.body.packages.length,1);
const pkg = inbox.body.packages[0];
const unwrapped = await webcrypto.subtle.decrypt({name:'RSA-OAEP'},pair.privateKey,raw(pkg.envelope.ek));
const importedAES = await webcrypto.subtle.importKey('raw',unwrapped,'AES-GCM',false,['decrypt']);
const recovered = await webcrypto.subtle.decrypt({name:'AES-GCM',iv:raw(pkg.envelope.iv)},importedAES,raw(pkg.envelope.data));
assert.deepEqual(JSON.parse(new TextDecoder().decode(recovered)),snapshot);
const receipt = await call(bridge + '/api/sync/ack','POST',{ids:[pkg.id]},webToken,true);
assert.equal(receipt.status,200);
const emptied = await call(bridge + '/api/sync/pending','GET',undefined,webToken,true);
assert.equal(emptied.body.packages.length,0);
console.log('Encrypted CLI upload → browser decrypt → deletion after ACK: OK');

const logoutCLI = await call(bridge + '/api/cli?action=revoke','POST',{},cliToken);
assert.equal(logoutCLI.status,200);
const rejectedCLI = await call(bridge + '/api/cli','GET',undefined,cliToken);
assert.equal(rejectedCLI.status,401);
const logoutWeb = await call(account + '/api/auth/sign-out','POST',{},webToken,true);
assert.equal(logoutWeb.status,200);
const rejectedWeb = await call(bridge + '/api/profile','GET',undefined,webToken,true);
assert.equal(rejectedWeb.status,401);
console.log('Browser sign out + CLI revocation: OK');
console.log('LIVE END-TO-END BRIDGE TEST PASSED');
