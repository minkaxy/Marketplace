import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from './server.mjs';
import worker from '../dist/server/index.js';

test('container serves assets, health checks, and catalog without Cloudflare bindings; denies forged identity', async t => {
  const server = await createServer({ worker, config: {} });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(base + '/healthz');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', storage: 'unconfigured', authentication: 'unconfigured' });
  assert.equal((await fetch(base + '/healthz', { method: 'HEAD' })).status, 200);
  assert.match(await (await fetch(base)).text(), /BAAN/);
  assert.match((await fetch(base + '/app.js')).headers.get('content-type'), /javascript/);
  const bootstrap = await (await fetch(base + '/api/bootstrap', { headers: { 'oai-authenticated-user-id': 'attacker', 'oai-authenticated-user-email': 'attacker@example.test' } })).json();
  assert.equal(bootstrap.user, null);
  assert.equal(bootstrap.products.length, 8);
  assert.equal(bootstrap.deployment.readOnly, true);
  assert.equal((await fetch(base + '/api/settings', { method: 'POST', body: '{}' })).status, 503);
  assert.equal((await fetch(base + '/signin-with-chatgpt')).status, 503);
  assert.equal((await fetch(base + '/api/orders')).status, 401);
});

test('container trusts only the configured authentication gateway and reserves the admin identity', async t => {
  const records = new Map();
  const bucket = { readOnly: false, async get(k) { const v=records.get(k); return v ? { json:async()=>JSON.parse(v) } : null; }, async put(k,v,o={}) { if(!o.onlyIf||!records.has(k))records.set(k,v); }, async list(){return {objects:[],truncated:false};} };
  const secret = 'a-test-only-gateway-secret-32-chars';
  const server = await createServer({ worker, bucket, config: { AUTH_PROXY_SECRET: secret, ADMIN_USER_ID: 'owner' } });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  server.listen(0, '127.0.0.1'); await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const get = async(id,token) => (await fetch(base+'/api/bootstrap',{headers:{'oai-authenticated-user-id':id,'x-baan-proxy-secret':token}})).json();
  assert.equal((await get('owner','wrong')).user,null);
  assert.equal((await get('member',secret)).user.role,'member');
  assert.equal((await get('owner',secret)).user.role,'admin');
});
