import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
try{process.loadEnvFile();}catch(e){if(e.code!=='ENOENT')throw e;}
if(!process.argv[2])throw Error('Usage: npm run restore -- /path/to/backup.sqlite (stop the server first)');
const source=path.resolve(process.argv[2]),root=path.resolve(process.env.DATA_DIR||'data'),target=path.join(root,'marketplace.sqlite');
if(source===target)throw Error('Choose a separate backup file');
try{const lock=JSON.parse(await fs.readFile(path.join(root,'server.lock'),'utf8'));let alive=true;try{process.kill(lock.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}if(alive)throw Error('Stop the server before restoring');}catch(e){if(e.code!=='ENOENT')throw e;}
const db=new DatabaseSync(source,{readOnly:true});
try{
 const check=db.prepare('PRAGMA integrity_check').get();if(check.integrity_check!=='ok')throw Error('Backup failed integrity check');
 db.prepare('SELECT key,value,metadata FROM objects LIMIT 1').get();
 await fs.mkdir(root,{recursive:true,mode:0o700});
 const temporary=path.join(root,'restore-'+Date.now()+'.sqlite');await backup(db,temporary);
 const suffix='.before-restore-'+Date.now();
 for(const ext of ['','-wal','-shm']){try{await fs.rename(target+ext,target+ext+suffix);}catch(e){if(e.code!=='ENOENT')throw e;}}
 await fs.rename(temporary,target);if(process.platform!=='win32')await fs.chmod(target,0o600);
 console.log('Restored: '+target+'; previous database retained with '+suffix);
}finally{db.close();}
