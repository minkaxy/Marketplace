import worker from '../dist/server/index.js';
import { createServer } from './server.mjs';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
const server = await createServer({ worker });
server.listen(port, '0.0.0.0', () => {
  console.log(`BAAN listening on 0.0.0.0:${port}; health check: /healthz`);
  if (!process.env.S3_BUCKET || !process.env.AUTH_PROXY_SECRET || !process.env.ADMIN_USER_ID) console.log('Read-only preview: configure durable storage and an authentication gateway to enable member operations.');
});
server.on('error', error => { console.error('Server startup failed:', error.code); process.exitCode = 1; });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10000).unref();
});
