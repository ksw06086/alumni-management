import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-worker/src/index.js';

const origin = 'https://ksw06086.github.io';
const env = { ALLOWED_ORIGINS: `${origin},http://localhost:5173`, APPS_SCRIPT_URL: 'https://script.example/exec' };
const request = (method = 'POST', headers = {}, body = '') => new Request('https://worker.example/api', { method, headers: { Origin: origin, ...headers }, body: method === 'GET' || method === 'HEAD' ? undefined : body });

test('Cloudflare Worker request policy and proxy behavior', async t => {
  await t.test('allows preflight only from configured origins', async () => {
    const accepted = await worker.fetch(request('OPTIONS'), env);
    assert.equal(accepted.status, 204);
    assert.equal(accepted.headers.get('Access-Control-Allow-Origin'), origin);
    const rejected = await worker.fetch(new Request('https://worker.example/api', { method: 'OPTIONS', headers: { Origin: 'https://attacker.example' } }), env);
    assert.equal(rejected.status, 403);
  });

  await t.test('rejects other methods, content types, and oversized requests', async () => {
    assert.equal((await worker.fetch(request('GET'), env)).status, 405);
    assert.equal((await worker.fetch(request('POST', { 'Content-Type': 'text/plain' }, 'x'), env)).status, 415);
    assert.equal((await worker.fetch(request('POST', { 'Content-Type': 'application/json' }, 'x'.repeat(1024 * 1024 + 1)), env)).status, 413);
  });

  await t.test('does not proxy while the Apps Script URL is a placeholder', async () => {
    const response = await worker.fetch(request('POST', { 'Content-Type': 'application/json' }, '{}'), { ...env, APPS_SCRIPT_URL: 'https://script.example/REPLACE_WITH_ID' });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  });

  await t.test('forwards JSON and returns uncached JSON with CORS headers', async () => {
    const originalFetch = globalThis.fetch;
    let forwarded;
    globalThis.fetch = async (url, init) => {
      forwarded = { url, init };
      return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const response = await worker.fetch(request('POST', { 'Content-Type': 'application/json' }, '{"action":"students"}'), env);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
      assert.equal(forwarded.url, env.APPS_SCRIPT_URL);
      assert.equal(forwarded.init.body, '{"action":"students"}');
      assert.deepEqual(await response.json(), { ok: true });
    } finally { globalThis.fetch = originalFetch; }
  });

  await t.test('converts upstream network errors to a safe 502 response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('private upstream detail'); };
    try {
      const response = await worker.fetch(request('POST', { 'Content-Type': 'application/json' }, '{}'), env);
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
      assert.deepEqual(await response.json(), { ok: false, error: 'Google Apps Script에 연결할 수 없습니다.' });
    } finally { globalThis.fetch = originalFetch; }
  });
});
