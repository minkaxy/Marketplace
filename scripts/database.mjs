import { DatabaseSync, backup } from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function openDatabase(directory) {
 const root=path.resolve(directory);await fs.mkdir(root,{recursive:true,mode:0o700});
 const filename=path.join(root,'marketplace.sqlite'),db=new DatabaseSync(filename);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=10000;');
 db.exec('CREATE TABLE IF NOT EXISTS objects (key TEXT PRIMARY KEY, value BLOB NOT NULL, metadata TEXT NOT NULL DEFAULT \'{}\')');
 if(process.platform!=='win32')await fs.chmod(filename,0o600);
 const select=db.prepare('SELECT value,metadata FROM objects WHERE key=?');
 const replace=db.prepare('INSERT INTO objects(key,value,metadata) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,metadata=excluded.metadata');
 const insert=db.prepare('INSERT INTO objects(key,value,metadata) VALUES(?,?,?) ON CONFLICT(key) DO NOTHING');
 const bucket={transactional:true,
  async get(key){const row=select.get(key);if(!row)return null;const bytes=Buffer.from(row.value);return {body:bytes,json:async()=>JSON.parse(bytes.toString('utf8')),httpMetadata:JSON.parse(row.metadata)};},
  async put(key,value,options={}){const bytes=typeof value==='string'?Buffer.from(value):Buffer.from(value);return (options.onlyIf?insert:replace).run(key,bytes,JSON.stringify(options.httpMetadata||{})).changes?{}:null;},
  async delete(key){db.prepare('DELETE FROM objects WHERE key=?').run(key);},
  async list({prefix='',cursor='',limit=1000}={}){const rows=db.prepare('SELECT key FROM objects WHERE substr(key,1,length(?))=? AND key>? ORDER BY key LIMIT ?').all(prefix,prefix,cursor,limit+1);const truncated=rows.length>limit,objects=rows.slice(0,limit);return {objects,truncated,cursor:truncated?objects.at(-1).key:undefined};}
 };
 let queue=Promise.resolve();
 function run(write,callback,{rollbackResponse=true}={}){
  const result=queue.then(async()=>{if(write)db.exec('BEGIN IMMEDIATE');try{const value=await callback(bucket);if(write)db.exec(rollbackResponse&&value instanceof Response&&!value.ok?'ROLLBACK':'COMMIT');return value;}catch(error){if(write)db.exec('ROLLBACK');throw error;}});
  queue=result.catch(()=>{});return result;
 }
 let closed=false;
 return {root,filename,bucket,run,async close(){await queue;if(!closed){closed=true;db.close();}},async backup(destination){return run(false,()=>backup(db,destination));}};
}
