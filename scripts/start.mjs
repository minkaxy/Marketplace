import worker from '../dist/server/index.js';
import { createServer } from './server.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

try { process.loadEnvFile(); } catch(error) { if(error.code!=='ENOENT')throw error; }

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
const server = await createServer({ worker });
const lockPath=path.join(server.database.root,'server.lock');
try { const old=JSON.parse(await fs.readFile(lockPath,'utf8')); let alive=true;try{process.kill(old.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}if(alive)throw new Error('A server is already using this data directory. Stop it before starting another.');await fs.unlink(lockPath); } catch(e){if(e.code!=='ENOENT')throw e;}
await fs.writeFile(lockPath,JSON.stringify({pid:process.pid}),{flag:'wx',mode:0o600});
const host=process.env.HOST||'127.0.0.1';
server.listen(port, host, () => {
  console.log(`BAAN listening on ${host}:${port}; health check: /healthz`);
  console.log(`Database: ${server.database.filename}`);
  console.log(`First administrator setup code: read ${server.setupTokenPath}`);
});
server.on('error', error => { console.error('Server startup failed:', error.code); process.exitCode = 1; });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(async () => {await server.database.close();await fs.unlink(lockPath).catch(()=>{});process.exit(0);});
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10000).unref();
});
