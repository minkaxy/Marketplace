import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import worker from '../dist/server/index.js';
const root=path.resolve('.local-data');await fs.mkdir(root,{recursive:true});
const file=key=>path.join(root,Buffer.from(key).toString('base64url'));
const BUCKET={
 async get(key){try{const raw=JSON.parse(await fs.readFile(file(key),'utf8')),bytes=Buffer.from(raw.bytes,'base64');return{json:async()=>JSON.parse(bytes.toString()),body:bytes,httpMetadata:raw.httpMetadata}}catch(e){if(e.code==='ENOENT')return null;throw e}},
 async put(key,value,options={}){if(options.onlyIf&&await this.get(key))return null;const bytes=typeof value==='string'?Buffer.from(value):Buffer.from(value);await fs.writeFile(file(key),JSON.stringify({key,bytes:bytes.toString('base64'),httpMetadata:options.httpMetadata}));return{}},
 async list({prefix=''}){const rows=await Promise.all((await fs.readdir(root)).map(async f=>JSON.parse(await fs.readFile(path.join(root,f),'utf8'))));return{objects:rows.filter(r=>r.key.startsWith(prefix)).map(r=>({key:r.key})),truncated:false}}
};
http.createServer(async(req,res)=>{try{let body=[];for await(const part of req)body.push(part);const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','local-owner');headers.set('oai-authenticated-user-email','owner@local.test');const r=await worker.fetch(new Request('http://localhost:4173'+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(body)}:{})}),{BUCKET});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()))}catch(e){console.error(e);res.writeHead(500);res.end('Local server error')}}).listen(4173,'127.0.0.1',()=>console.log('Local: http://localhost:4173 · Development owner identity only.'));
