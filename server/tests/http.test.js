import test from 'node:test';
import assert from 'node:assert/strict';
import { cors, sanitizeOrigin, toHeaders } from '../lib/http.js';

test('CORS permits the exact deployed website origin only', () => {
  process.env.WEB_ORIGIN = 'https://zaoastronaftik-bit.github.io';
  function mock(origin) {
    const headers = {};
    return {headers, result: cors({headers:{origin}}, {setHeader(name,val){headers[name]=val}})};
  }
  assert.equal(mock('https://zaoastronaftik-bit.github.io').result,true);
  assert.equal(mock('https://evil.github.io').result,false);
  assert.equal(mock('https://zaoastronaftik-bit.github.io.evil.com').result,false);
});

test('origin parser rejects paths and credentials', () => {
  assert.equal(sanitizeOrigin('https://example.com'),'https://example.com');
  assert.throws(()=>sanitizeOrigin('https://example.com/x'));
  assert.throws(()=>sanitizeOrigin('https://evil:pw@example.com'));
  assert.throws(()=>sanitizeOrigin('http://example.com'));
});

test('headers conversion preserves bearer authorization', () => {
  assert.equal(toHeaders({authorization:'Bearer secret'}).get('authorization'),'Bearer secret');
});
