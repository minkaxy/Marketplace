import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { openDatabase } from './database.mjs';
import { currentUser,authRequest } from './auth.mjs';

export async function createServer({worker,config=process.env,database}={}){
 const db=database||await openDatabase(config.DATA_DIR||path.resolve('data'));
 const tokenPath=path.join(db.root,'setup-token.txt');let setupToken=config.SETUP_TOKEN;
 if(!setupToken){try{setupToken=(await fs.readFile(tokenPath,'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;setupToken=randomBytes(24).toString('hex');await fs.writeFile(tokenPath,setupToken+'\n',{flag:'wx',mode:0o600});}}
 if(setupToken.length<32)throw new Error('SETUP_TOKEN must contain at least 32 characters');
 const publicOrigin=config.PUBLIC_ORIGIN?new URL(config.PUBLIC_ORIGIN).origin:null;
 if(publicOrigin&&!publicOrigin.startsWith('https://')&&!/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(publicOrigin))throw new Error('PUBLIC_ORIGIN must use HTTPS for public access');
 const server=http.createServer(async(req,res)=>{
  try{
   const origin=publicOrigin||`http://${req.headers.host}`,url=new URL(req.url,origin);
   if(url.origin!==origin){res.writeHead(400);res.end('Invalid origin');return;}
   if(url.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:JSON.stringify({status:'ok',storage:'sqlite'}));return;}
   if(url.pathname==='/signin-with-chatgpt'||url.pathname==='/signout-with-chatgpt'){res.writeHead(302,{Location:'/#/account'});res.end();return;}
   const write=!['GET','HEAD'].includes(req.method);
   if(write&&(req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'คำขอมาจากเว็บไซต์อื่น / Invalid request origin'}));return;}
   const max=url.pathname.startsWith('/api/upload')?25*1024*1024:1024*1024;
   if(Number(req.headers['content-length'])>max){res.writeHead(413);res.end('Request too large');return;}
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
   const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined&&!key.startsWith('oai-')&&!['x-baan-proxy-secret','connection','transfer-encoding'].includes(key))headers.set(key,Array.isArray(value)?value.join(', '):value);
   const request=new Request(url,{method:req.method,headers,...(write?{body:Buffer.concat(chunks)}:{})});const isAuth=url.pathname.startsWith('/api/auth/');
   const response=await db.run(write,async bucket=>{
    if(isAuth)return authRequest(request,bucket,{setupToken,secure:origin.startsWith('https://'),clientAddress:req.socket.remoteAddress});
    const user=await currentUser(request,bucket);if(user){headers.set('oai-authenticated-user-id',user.id);headers.set('oai-authenticated-user-email',user.email);}
    const forwarded=new Request(url,{method:req.method,headers,...(write?{body:Buffer.concat(chunks)}:{})});let result=await worker.fetch(forwarded,{BUCKET:bucket});
    if(url.pathname==='/api/bootstrap'&&result.ok){const body=await result.json();body.auth={provider:'local',setupRequired:!await bucket.get('system/owner')};result=new Response(JSON.stringify(body),{status:200,headers:result.headers});}return result;
   },{rollbackResponse:!isAuth});
   const responseHeaders=Object.fromEntries(response.headers);responseHeaders['X-Content-Type-Options']='nosniff';responseHeaders['Referrer-Policy']='same-origin';responseHeaders['X-Frame-Options']='DENY';
   res.writeHead(response.status,responseHeaders);res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error('Request failed:',error.code||error.name);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'เซิร์ฟเวอร์ทำงานผิดพลาด กรุณาลองอีกครั้ง / Server error. Please try again.'}));}
 });
 server.headersTimeout=15000;server.requestTimeout=120000;server.database=db;server.setupTokenPath=tokenPath;
 const sweep=setInterval(()=>db.run(true,bucket=>worker.maintenance?.({BUCKET:bucket})).catch(error=>console.error('Order expiry failed:',error.name)),60000);sweep.unref();
 server.on('close',()=>{clearInterval(sweep);if(!database)db.close().catch(()=>{});});return server;
}
