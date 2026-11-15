import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {openDatabase} from './database.mjs';
try{process.loadEnvFile();}catch(e){if(e.code!=='ENOENT')throw e;}
const email=String(process.argv[2]||'').trim().toLowerCase(),root=path.resolve(process.env.DATA_DIR||'data');
if(!email)throw Error('Usage: node scripts/reset-password.mjs member@example.com (stop the server first)');
try{const lock=JSON.parse(await fs.readFile(path.join(root,'server.lock'),'utf8'));let alive=true;try{process.kill(lock.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}if(alive)throw Error('Stop the server before creating a recovery code');}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.access(path.join(root,'marketplace.sqlite'));
const db=await openDatabase(root),hash=x=>createHash('sha256').update(x).digest('hex');
try{await db.run(true,async bucket=>{
 const account=await bucket.get('auth/accounts/'+hash(email));if(!account)throw Error('Account not found');
 const record=await account.json(),user=await (await bucket.get('users/'+record.user)).json();
 if(user.disabled)throw Error('Account is disabled');
 const code=randomBytes(24).toString('hex'),filename=path.join(root,'password-recovery.txt');
 await bucket.put('auth/recovery/'+hash(code),JSON.stringify({user:user.id,email,version:user.sessionVersion||0,expires:Date.now()+900000}));
 await fs.writeFile(filename,code+'\n',{mode:0o600});if(process.platform!=='win32')await fs.chmod(filename,0o600);
 console.log('One-time code (expires in 15 minutes) saved to '+filename+'. Restart the server and use the password recovery form.');
});}finally{await db.close();}
