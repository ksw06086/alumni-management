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

test('Cloudflare Worker archive upload sessions and bounded chunk proxy', async t => {
  await t.test('requires the configured upload session KV', async () => {
    const response = await worker.fetch(request('POST', { 'Content-Type': 'application/json' }, JSON.stringify({ action: 'archiveUploadStart', token: 'admin', postId: 'p-1', files: [] })), env);
    assert.equal(response.status, 503);
  });

  await t.test('keeps the Google resumable URL on the Worker and saves its session in KV', async () => {
    const values = new Map();
    const kv = { get: async key => values.get(key) || null, put: async (key, value) => values.set(key, value), delete: async key => values.delete(key) };
    const originalFetch = globalThis.fetch;
    let forwarded;
    globalThis.fetch = async (_url, init) => { forwarded = JSON.parse(init.body); return new Response(JSON.stringify({ ok: true, uploads: [{ uploadId: 'f-1', sessionUrl: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=secret', postId: 'p-1', fileId: 'f-1', originalFilename: 'a.txt', extension: 'txt', mimeType: 'text/plain', fileType: 'document', fileSize: 4 }] })); };
    try {
      const response = await worker.fetch(request('POST', { 'Content-Type': 'application/json' }, JSON.stringify({ action: 'archiveUploadStart', token: 'admin', postId: 'p-1', files: [] })), { ...env, ARCHIVE_BRIDGE_SECRET: 'bridge', ARCHIVE_UPLOADS: kv });
      const result = await response.json();
      assert.equal(result.ok, true);
      assert.equal('sessionUrl' in result.uploads[0], false);
      assert.equal(JSON.parse(values.get('upload:f-1')).sessionUrl.includes('secret'), true);
      assert.equal(forwarded.bridgeSecret, 'bridge');
    } finally { globalThis.fetch = originalFetch; }
  });

  await t.test('validates session and forwards only an 8 MiB maximum file chunk', async () => {
    const values = new Map([['upload:f-1', JSON.stringify({ uploadId: 'f-1', token: 'admin', sessionUrl: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=secret', extension: 'txt', mimeType: 'text/plain', totalSize: 4, fileSize: 4, offset: 0 })]]);
    const kv = { get: async key => values.get(key) || null, put: async (key, value) => values.set(key, value), delete: async key => values.delete(key) };
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) return new Response(JSON.stringify({ ok: true, user: { role: 'admin' } }));
      if (calls === 2) return new Response('', { status: 308 });
      return new Response('', { status: 308, headers: { Range: 'bytes=0-3' } });
    };
    try {
      const chunkRequest = new Request('https://worker.example/archive/chunk', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/octet-stream', 'X-Upload-Id': 'f-1', 'X-Session-Token': 'admin', 'X-Chunk-Start': '0' }, body: 'test' });
      const response = await worker.fetch(chunkRequest, { ...env, ARCHIVE_BRIDGE_SECRET: 'bridge', ARCHIVE_UPLOADS: kv });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, received: 4, total: 4, done: false });
      assert.equal(calls, 3);
    } finally { globalThis.fetch = originalFetch; }
  });
});
