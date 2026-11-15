import { randomBytes,randomUUID,createHash,scrypt as scryptCallback,timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt=promisify(scryptCallback),digest=x=>createHash('sha256').update(String(x)).digest('hex');
const get=async(b,k)=>{const o=await b.get(k);return o?o.json():null;},put=(b,k,v)=>b.put(k,JSON.stringify(v));
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const same=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const accountKey=email=>'auth/accounts/'+digest(email);
const tokenOf=req=>(req.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('baan_session='))?.slice(13)||'';
const cookie=(token,secure,age=604800)=>`baan_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
export async function passwordHash(password,salt=randomBytes(16).toString('hex')){const hash=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return {salt,hash:hash.toString('hex')};}
async function passwordMatches(password,record){const result=await passwordHash(password,record?.salt||'00000000000000000000000000000000');return !!record&&same(result.hash,record.hash);}
export async function currentUser(request,bucket){
 const token=tokenOf(request);if(!/^[a-f0-9]{64}$/.test(token))return null;
 const session=await get(bucket,'auth/sessions/'+digest(token));if(!session||session.expires<Date.now())return null;
 const user=await get(bucket,'users/'+session.user);if(!user||user.disabled||session.version!==(user.sessionVersion||0))return null;return user;
}
async function signIn(bucket,user,request,secure){
 const old=tokenOf(request);if(old)await bucket.delete('auth/sessions/'+digest(old));
 const token=randomBytes(32).toString('hex');await put(bucket,'auth/sessions/'+digest(token),{user:user.id,version:user.sessionVersion||0,expires:Date.now()+604800000});
 return json({ok:true},200,{'Set-Cookie':cookie(token,secure)});
}
async function limited(bucket,key,limit=10){const now=Date.now(),old=await get(bucket,key);const entry=old&&old.until>now?old:{count:0,until:now+900000};entry.count++;await put(bucket,key,entry);return entry.count>limit;}
export async function authRequest(request,bucket,{setupToken,secure=true,clientAddress='local'}={}){
 const action=new URL(request.url).pathname.split('/').pop();if(request.method!=='POST')return json({error:'Method not allowed'},405);
 let body;try{body=await request.json();}catch{return json({error:'ข้อมูลไม่ถูกต้อง / Invalid request'},400);}
 const email=String(body.email||'').trim().toLowerCase(),owner=await get(bucket,'system/owner');
 if(action==='logout'){const token=tokenOf(request);if(token)await bucket.delete('auth/sessions/'+digest(token));return json({ok:true},200,{'Set-Cookie':cookie('',secure,0)});}
 if(!['setup','register','login','password','recover'].includes(action))return json({error:'Not found'},404);
 if(await limited(bucket,'auth/limits/ip/'+digest(clientAddress),100))return json({error:'ลองอีกครั้งใน 15 นาที / Too many attempts. Try again in 15 minutes.'},429);
 if(action==='recover'){
  const key='auth/recovery/'+digest(body.code||''),recovery=await get(bucket,key);
  if(!recovery||recovery.expires<Date.now())return json({error:'รหัสกู้บัญชีไม่ถูกต้องหรือหมดอายุ / Invalid or expired recovery code'},400);
  if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)return json({error:'รหัสผ่านต้องมี 12–128 ตัวอักษร / Use 12–128 characters'},400);
  const user=await get(bucket,'users/'+recovery.user),record=await get(bucket,accountKey(recovery.email));
  if(!user||user.disabled||!record||record.user!==user.id||recovery.version!==(user.sessionVersion||0))return json({error:'รหัสกู้บัญชีใช้ไม่ได้ / Recovery code unavailable'},400);
  Object.assign(record,await passwordHash(body.password));await put(bucket,accountKey(recovery.email),record);user.sessionVersion=(user.sessionVersion||0)+1;await put(bucket,'users/'+user.id,user);await bucket.delete(key);return json({ok:true});
 }
 if(action==='password'){
  const user=await currentUser(request,bucket);if(!user)return json({error:'กรุณาเข้าสู่ระบบ / Please sign in'},401);
  const record=await get(bucket,accountKey(user.email));
  if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)return json({error:'รหัสผ่านต้องมี 12–128 ตัวอักษร / Use 12–128 characters'},400);
  if(await limited(bucket,'auth/limits/password/'+user.id)||!await passwordMatches(String(body.currentPassword||'').slice(0,128),record))return json({error:'รหัสผ่านเดิมไม่ถูกต้อง หรือมีการลองมากเกินไป / Invalid password or too many attempts'},400);
  Object.assign(record,await passwordHash(body.password));await put(bucket,accountKey(user.email),record);user.sessionVersion=(user.sessionVersion||0)+1;await put(bucket,'users/'+user.id,user);return signIn(bucket,user,request,secure);
 }
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof body.password!=='string'||body.password.length>128)return json({error:'กรุณาตรวจสอบอีเมลและรหัสผ่าน / Check email and password'},400);
 if(await limited(bucket,'auth/limits/'+action+'/'+digest(email)))return json({error:'ลองอีกครั้งใน 15 นาที / Try again in 15 minutes'},429);
 if(action==='setup'){
  if(owner)return json({error:'ตั้งผู้ดูแลแล้ว / Administrator already configured'},409);
  if(!setupToken||!same(body.setupToken||'',setupToken))return json({error:'รหัสตั้งค่าไม่ถูกต้อง / Invalid setup code'},403);
 }else if(!owner)return json({error:'เว็บไซต์กำลังตั้งค่าผู้ดูแล / Administrator setup is required'},503);
 const key=accountKey(email),existing=await get(bucket,key);
 if(action==='login'){
  if(!await passwordMatches(body.password,existing))return json({error:'อีเมลหรือรหัสผ่านไม่ถูกต้อง / Invalid email or password'},401);
  const user=await get(bucket,'users/'+existing.user);if(!user||user.disabled)return json({error:'บัญชีไม่พร้อมใช้งาน / Account unavailable'},403);
  await bucket.delete('auth/limits/login/'+digest(email));return signIn(bucket,user,request,secure);
 }
 if(existing)return json({error:'ไม่สามารถสมัครด้วยอีเมลนี้ กรุณาเข้าสู่ระบบ / Unable to register this email; try signing in'},409);
 if(body.password.length<12||!String(body.name||'').trim())return json({error:'กรอกชื่อและรหัสผ่านอย่างน้อย 12 ตัวอักษร / Enter a name and a password of at least 12 characters'},400);
 const user={id:randomUUID(),email,name:String(body.name).trim().slice(0,80),role:action==='setup'?'admin':'member',sessionVersion:0,created:new Date().toISOString()};
 await put(bucket,'users/'+user.id,user);await put(bucket,key,{...await passwordHash(body.password),user:user.id});if(action==='setup')await put(bucket,'system/owner',{id:user.id});
 return signIn(bucket,user,request,secure);
}
