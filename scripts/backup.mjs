import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
try{process.loadEnvFile();}catch(e){if(e.code!=='ENOENT')throw e;}
const source=path.resolve(process.env.DATA_DIR||'data','marketplace.sqlite');await fs.access(source);
const folder=path.resolve('backups');await fs.mkdir(folder,{recursive:true,mode:0o700});
const target=path.join(folder,'baan-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
const db=new DatabaseSync(source,{readOnly:true});try{await backup(db,target);}finally{db.close();}
if(process.platform!=='win32')await fs.chmod(target,0o600);
console.log('Backup created: '+target);
