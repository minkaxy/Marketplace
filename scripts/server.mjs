import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createBucket } from './storage.mjs';

function matches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function createServer({ worker, config = process.env, bucket } = {}) {
  const BUCKET = bucket || await createBucket(config);
  const authConfigured = !!(config.AUTH_PROXY_SECRET && config.ADMIN_USER_ID && !BUCKET.readOnly);
  if (config.AUTH_PROXY_SECRET && config.AUTH_PROXY_SECRET.length < 32) throw new Error('AUTH_PROXY_SECRET must contain at least 32 characters');
  if (authConfigured) {
    await BUCKET.put('system/owner', JSON.stringify({ id: config.ADMIN_USER_ID }), { onlyIf: { etagDoesNotMatch: '*' } });
    const owner = await (await BUCKET.get('system/owner')).json();
    if (owner.id !== config.ADMIN_USER_ID) throw new Error('ADMIN_USER_ID does not match the stored owner');
  }
  const publicOrigin = config.PUBLIC_ORIGIN ? new URL(config.PUBLIC_ORIGIN).origin : null;
  const server = http.createServer(async (req, res) => {
    try {
      const protocol = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const origin = publicOrigin || `${protocol}://${req.headers.host}`;
      const url = new URL(req.url, origin);
      if (url.origin !== origin) { res.writeHead(400); res.end('Invalid request origin'); return; }
      if (url.pathname === '/healthz' && ['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok', storage: BUCKET.readOnly ? 'unconfigured' : 's3', authentication: authConfigured ? 'trusted-proxy' : 'unconfigured' }));
        return;
      }
      if (['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback'].includes(url.pathname)) {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Account setup required</title><main><h1>ระบบสมาชิกยังไม่เปิดใช้งานบนโฮสต์นี้</h1><p>ผู้ดูแลต้องเชื่อมต่อระบบเข้าสู่ระบบสำหรับโฮสต์ใหม่นี้ก่อน</p><h2>Account setup required</h2><p>Sites sign-in is not available on this host. An authentication gateway must be configured before member features can be used.</p><a href="/">กลับหน้าร้าน / Back to shop</a></main></html>');
        return;
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined && !key.startsWith('oai-') && !['x-baan-proxy-secret', 'connection', 'transfer-encoding'].includes(key)) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      // Sites headers are NOT credentials on an ordinary internet-facing container.
      // Only an independently authenticated gateway holding this secret may supply them.
      if (authConfigured && matches(req.headers['x-baan-proxy-secret'], config.AUTH_PROXY_SECRET)) {
        const id = req.headers['oai-authenticated-user-id'];
        if (typeof id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(id)) {
          headers.set('oai-authenticated-user-id', id);
          headers.set('oai-authenticated-user-email', String(req.headers['oai-authenticated-user-email'] || ''));
        }
      }
      if (BUCKET.readOnly && !['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Persistent storage is not configured. This deployment is read-only.' }));
        return;
      }
      const chunks = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 26 * 1024 * 1024) { res.writeHead(413); res.end('Upload too large'); return; }
        chunks.push(chunk);
      }
      const request = new Request(url, { method: req.method, headers,
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
      let response = await worker.fetch(request, { BUCKET });
      if (response.headers.get('content-type')?.startsWith('text/html') && (BUCKET.readOnly || !authConfigured)) {
        const html = await response.text();
        const notice = '<div class="notice" role="status" style="margin:0;border-radius:0;text-align:center">โหมดพรีวิว — ระบบสมาชิกและสั่งซื้อยังไม่เปิดใช้งาน · Preview — accounts and checkout are not enabled yet.</div>';
        response = new Response(html.replace('<body>', '<body>' + notice), { status: response.status, headers: response.headers });
      }
      if (url.pathname === '/api/bootstrap' && response.ok) {
        const data = await response.json();
        data.deployment = { readOnly: BUCKET.readOnly || !authConfigured };
        response = new Response(JSON.stringify(data), { status: response.status, headers: response.headers });
      }
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error('Request failed:', error.name || 'Error');
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error. Check storage and runtime configuration.' }));
    }
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 120000;
  server.on('close', () => BUCKET.close?.());
  return server;
}
