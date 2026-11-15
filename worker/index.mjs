import {defaults} from './data.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const read=async(env,key,fallback=null)=>{const o=await env.BUCKET.get(key);return o?o.json():fallback};
const write=async(env,key,value)=>env.BUCKET.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}});
const list=async(env,prefix)=>{let cursor,objects=[];do{const r=await env.BUCKET.list({prefix,cursor,limit:1000});objects.push(...r.objects);cursor=r.truncated?r.cursor:undefined}while(cursor);return(await Promise.all(objects.map(x=>read(env,x.key)))).filter(Boolean)};
const str=(v,max=200)=>String(v??'').trim().slice(0,max);
const number=(v,min=0,max=1e7)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)fail('Invalid number');return Math.round(n*100)/100};
const localized=(v,max=300)=>({th:str(v?.th,max),en:str(v?.en,max)});
const safeUrl=v=>{const s=str(v,2000);if(!s)return '';if(s.startsWith('/media/'))return s;try{const u=new URL(s);return u.protocol==='https:'?s:''}catch{return ''}};
const requireUser=u=>{if(!u)fail('Please sign in',401);return u};
const admin=(u)=>{requireUser(u);if(u.role!=='admin')fail('Administrator access required',403)};
const catalogs=async env=>{const [products,shops]=await Promise.all([list(env,'products/'),list(env,'shops/')]);return {products:products.filter(x=>!x.deleted),shops:shops.filter(x=>!x.deleted)}};
const owns=(u,s)=>u&&(u.role==='admin'||s?.owner===u.id);
const publicShop=({owner,...s})=>s;
const shipping=(subtotal,shop,settings)=>subtotal>=Number(shop.freeShipping??settings.freeShipping)&&Number(shop.freeShipping??settings.freeShipping)>0?0:Number(shop.shipping??settings.shipping);
const orderView=(o,u)=>{if(u.role==='admin'||u.id===o.user)return o;const groups=o.groups.filter(g=>g.owner===u.id);return {...o,slip:undefined,payment:undefined,total:groups.reduce((sum,g)=>sum+g.subtotal+g.shipping,0),groups}};
async function api(request,env){
 const url=new URL(request.url),p=url.pathname,method=request.method;
 if(method!=='GET'&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)fail('Cross-origin write denied',403);
 const uid=request.headers.get('oai-authenticated-user-id');
 let user=uid?await read(env,'users/'+uid):null;
 if(uid&&!user){
  let owner=await read(env,'system/owner');
  // Owner creation is performed only by the authenticated setup flow.
  user={id:uid,email:request.headers.get('oai-authenticated-user-email')||'',name:request.headers.get('oai-authenticated-user-email')?.split('@')[0]||'Member',role:owner?.id===uid?'admin':'member'};await write(env,'users/'+uid,user);
 }
 const settings={...defaults,...await read(env,'settings',{})};
 if(p==='/api/bootstrap') {const c=await catalogs(env);return json({...c,shops:c.shops.map(publicShop),settings,user})}
 if(p==='/api/profile'&&method==='POST'){requireUser(user);const b=await request.json();user.name=str(b.name,80)||user.name;await write(env,'users/'+uid,user);return json(user)}
 if(p==='/api/settings'&&method==='POST'){
  admin(user);const b=await request.json();const s={...settings,name:str(b.name,60)||settings.name,tagline:localized(b.tagline),heroTitle:localized(b.heroTitle),heroText:localized(b.heroText,700),heroImage:safeUrl(b.heroImage),logo:safeUrl(b.logo),favicon:safeUrl(b.favicon),color:/^#[0-9a-f]{6}$/i.test(b.color)?b.color:settings.color,priceSize:number(b.priceSize,16,48),discountSize:number(b.discountSize,10,28),bankName:str(b.bankName,100),bankAccount:str(b.bankAccount,40),bankHolder:str(b.bankHolder,100),promptpay:str(b.promptpay,13).replace(/\D/g,''),shipping:number(b.shipping),freeShipping:number(b.freeShipping),sponsorFee:number(b.sponsorFee),showHero:!!b.showHero,showStores:!!b.showStores};
  if(s.promptpay&&!/^(\d{10}|\d{13})$/.test(s.promptpay))fail('PromptPay must have 10 or 13 digits');
  if(Array.isArray(b.categories))s.categories=b.categories.slice(0,30).map((c,i)=>({id:str(c.id||'cat-'+i,50),th:str(c.th,60),en:str(c.en,60),icon:str(c.icon||'grid',30)})).filter(c=>c.id&&c.th&&c.en);
  await write(env,'settings',s);return json(s)
 }
 if(p==='/api/shops'&&method==='POST'){
  requireUser(user);const b=await request.json(),c=await catalogs(env);let shop=b.id?c.shops.find(s=>s.id===b.id):null;if(b.id&&!shop)fail('Shop not found',404);if(shop&&!owns(user,shop))fail('Access denied',403);if(!shop&&c.shops.some(s=>s.owner===uid))fail('You already have a shop');
  const value={...shop,id:shop?.id||crypto.randomUUID(),owner:shop?.owner||uid,name:str(b.name,80),description:localized(b.description,600),cover:safeUrl(b.cover),color:/^#[0-9a-f]{6}$/i.test(b.color)?b.color:'#203e34',categories:(b.categories||[]).map(x=>str(x,60)).filter(Boolean).slice(0,30),shipping:number(b.shipping),freeShipping:number(b.freeShipping),verified:shop?.verified||false};if(!value.name)fail('Shop name is required');await write(env,'shops/'+value.id,value);return json(publicShop(value))
 }
 if(p==='/api/my-shop'){requireUser(user);const c=await catalogs(env);return json(c.shops.filter(s=>owns(user,s)))}
 if(p==='/api/products'&&method==='POST'){
  requireUser(user);const b=await request.json(),c=await catalogs(env),shop=c.shops.find(s=>s.id===b.shop);if(!owns(user,shop))fail('Access denied',403);const old=c.products.find(x=>x.id===b.id);if(old&&old.shop!==shop.id)fail('Cannot move product between shops');const value={...old,id:old?.id||crypto.randomUUID(),shop:shop.id,name:localized(b.name),description:localized(b.description,5000),category:str(b.category,50),shopCategory:str(b.shopCategory,60),price:number(b.price,1),original:number(b.original,1),stock:number(b.stock,0,100000),images:(b.images||[]).map(safeUrl).filter(Boolean).slice(0,15),videos:(b.videos||[]).map(safeUrl).filter(Boolean).slice(0,5),rating:old?.rating||0,reviews:old?.reviews||0};if(!Number.isInteger(value.stock)||!value.name.th||!value.name.en||!value.images.length||value.original<value.price||!settings.categories.some(x=>x.id===value.category))fail('Check product names, images, category, stock and prices');await write(env,'products/'+value.id,value);return json(value)
 }
 if(p.startsWith('/api/products/')&&method==='DELETE'){requireUser(user);const c=await catalogs(env),item=c.products.find(x=>x.id===p.split('/').pop());if(!item)fail('Not found',404);if(!owns(user,c.shops.find(s=>s.id===item.shop)))fail('Access denied',403);await write(env,'products/'+item.id,{...item,deleted:true});return json({ok:true})}
 if(p==='/api/upload'&&method==='POST'){
  requireUser(user);const kind=url.searchParams.get('kind')==='slip'?'slip':'media';const type=request.headers.get('Content-Type')||'';if(!/^(image\/(jpeg|png|webp)|video\/(mp4|webm))$/.test(type)||kind==='slip'&&!type.startsWith('image/'))fail('Supported: JPG, PNG, WebP, MP4, WebM');const bytes=await request.arrayBuffer();if(bytes.byteLength>25*1024*1024||!bytes.byteLength)fail('File must be between 1 byte and 25 MB');const key=kind+'/'+uid+'/'+crypto.randomUUID();await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:type}});return json({url:'/media/'+key})
 }
 if(p==='/api/orders'&&method==='POST'){
  requireUser(user);if(!env.BUCKET.transactional)fail('Transactional storage is required',503);if(!settings.bankAccount||!settings.bankHolder||!settings.promptpay)fail('The administrator must configure payment details first');const b=await request.json();if(!/^[a-f0-9-]{36}$/.test(b.requestId||''))fail('Invalid checkout reference');const prior=await read(env,'checkout/'+uid+'/'+b.requestId);if(prior){const existing=await read(env,'orders/'+prior.id);if(existing)return json(existing)}const c=await catalogs(env);if(!Array.isArray(b.items)||!b.items.length||b.items.length>100)fail('Cart is empty or too large');const address={name:str(b.address?.name,100),phone:str(b.address?.phone,20),detail:str(b.address?.detail,600),postcode:str(b.address?.postcode,5)};if(!address.name||!/^\+?[0-9 -]{9,16}$/.test(address.phone)||address.detail.length<10||!/^\d{5}$/.test(address.postcode))fail('Please enter a complete delivery address');let groups=[];const seen=new Set();for(const item of b.items){if(seen.has(item.id))fail('Duplicate item');seen.add(item.id);const product=c.products.find(x=>x.id===item.id),q=number(item.qty,1,100);if(!Number.isInteger(q)||!product||product.stock<q)fail('Product out of stock');const shop=c.shops.find(s=>s.id===product.shop);if(!shop)fail('Shop unavailable');let group=groups.find(g=>g.shop===shop.id);if(!group){group={shop:shop.id,name:shop.name,owner:shop.owner||null,items:[],subtotal:0,shipping:0,status:'pending',tracking:'',carrier:''};groups.push(group)}group.items.push({id:product.id,name:product.name,image:product.images[0],price:product.price,qty:q});group.subtotal=Math.round((group.subtotal+product.price*q)*100)/100;await write(env,'products/'+product.id,{...product,stock:product.stock-q})}
  for(const g of groups)g.shipping=shipping(g.subtotal,c.shops.find(s=>s.id===g.shop),settings);const total=Math.round(groups.reduce((a,g)=>a+g.subtotal+g.shipping,0)*100)/100;const order={id:'BN-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().slice(0,4).toUpperCase(),user:uid,created:new Date().toISOString(),address,groups,total,expires:Date.now()+86400000,paymentStatus:'unpaid',slip:'',payment:{bankName:settings.bankName,bankAccount:settings.bankAccount,bankHolder:settings.bankHolder,promptpay:settings.promptpay}};await write(env,'orders/'+order.id,order);await write(env,'checkout/'+uid+'/'+b.requestId,{id:order.id});return json(order)
 }
 if(p==='/api/orders'){requireUser(user);const orders=await list(env,'orders/');return json(orders.filter(o=>user.role==='admin'||o.user===uid||o.groups.some(g=>g.owner===uid)).map(o=>orderView(o,user)).sort((a,b)=>b.created.localeCompare(a.created)))}
 if(p.startsWith('/api/orders/')&&method==='POST'){
  requireUser(user);const id=p.split('/').pop(),o=await read(env,'orders/'+id);if(!o)fail('Order not found',404);const b=await request.json();if(b.action==='cancel'){if(o.user!==uid&&user.role!=='admin')fail('Access denied',403);if(!['unpaid','rejected','review'].includes(o.paymentStatus))fail('This order cannot be cancelled');await releaseOrder(env,o,'cancelled')}else if(b.action==='slip'){if(o.user!==uid)fail('Access denied',403);if(o.expires<Date.now())fail('Order expired. Please place a new order.');if(!['unpaid','rejected'].includes(o.paymentStatus))fail('Payment already submitted');if(!str(b.slip).startsWith('/media/slip/'+uid+'/'))fail('Upload a payment slip first');if(!await env.BUCKET.get(b.slip.slice(7)))fail('Uploaded slip not found');o.slip=b.slip;o.paymentStatus='review'}else if(b.action==='payment'){admin(user);if(o.paymentStatus!=='review')fail('No payment awaiting review');o.paymentStatus=b.approved?'paid':'rejected';if(!b.approved)o.expires=Date.now()+86400000;if(b.approved)o.groups.forEach(g=>g.status='preparing')}else if(b.action==='tracking'){const g=o.groups.find(g=>g.shop===b.shop);if(!g||!(user.role==='admin'||g.owner===uid))fail('Access denied',403);if(o.paymentStatus!=='paid')fail('Payment must be confirmed before shipping');g.tracking=str(b.tracking,100);g.carrier=str(b.carrier,80);if(!g.tracking||!g.carrier)fail('Carrier and tracking number are required');g.status='shipping'}else if(b.action==='received'){if(o.user!==uid)fail('Access denied',403);const g=o.groups.find(g=>g.shop===b.shop);if(!g||g.status!=='shipping')fail('Order is not shipping');g.status='delivered'}else fail('Invalid action');await write(env,'orders/'+id,o);return json(orderView(o,user))
 }
 if(p==='/api/sponsors'&&method==='POST'){requireUser(user);const b=await request.json(),c=await catalogs(env),shop=c.shops.find(s=>s.id===b.shop);if(!owns(user,shop))fail('Access denied',403);const campaign={id:crypto.randomUUID(),shop:shop.id,name:shop.name,owner:uid,created:new Date().toISOString(),status:'pending',fee:settings.sponsorFee};await write(env,'sponsors/'+campaign.id,campaign);return json(campaign)}
 if(p==='/api/sponsors'){const campaigns=await list(env,'sponsors/');return json(campaigns.filter(x=>x.status==='active'||user?.role==='admin'||x.owner===uid))}
 if(p.startsWith('/api/sponsors/')&&method==='POST'){admin(user);const key='sponsors/'+p.split('/').pop(),c=await read(env,key);if(!c)fail('Not found',404);const b=await request.json();c.status=['active','rejected','expired'].includes(b.status)?b.status:'pending';await write(env,key,c);return json(c)}
 fail('Endpoint not found',404)
}
async function releaseOrder(env,order,status){
 for(const group of order.groups){for(const item of group.items){const product=await read(env,'products/'+item.id);if(product)await write(env,'products/'+item.id,{...product,stock:product.stock+item.qty})}group.status=status}
 order.paymentStatus=status;await write(env,'orders/'+order.id,order);
}
async function maintenance(env){
 for(const order of await list(env,'orders/'))if(['unpaid','rejected'].includes(order.paymentStatus)&&order.expires&&order.expires<Date.now())await releaseOrder(env,order,'expired');
}
export default {maintenance,async fetch(request,env){
 try{
  const p=new URL(request.url).pathname;
  if(p.startsWith('/api/')){if(!env.BUCKET)return json({error:'Storage binding BUCKET is unavailable'},503);return await api(request,env)}
  if(p.startsWith('/media/')){
   const key=p.slice(7);
   if(!/^(media|slip)\/[^/]+\/[a-f0-9-]{36}$/.test(key))return new Response('Not found',{status:404});
   if(key.startsWith('slip/')){const uid=request.headers.get('oai-authenticated-user-id'),u=uid?await read(env,'users/'+uid):null;if(!u||u.role!=='admin'&&!key.startsWith('slip/'+uid+'/'))return json({error:'Access denied'},403)}
   const o=await env.BUCKET.get(key);if(!o)return new Response('Not found',{status:404});
   return new Response(o.body,{headers:{'Content-Type':o.httpMetadata?.contentType||'application/octet-stream','Cache-Control':key.startsWith('slip/')?'private, no-store':'public, max-age=86400','X-Content-Type-Options':'nosniff'}})
  }
  const asset=ASSETS[p]??(!p.includes('.')?ASSETS['/']:undefined);if(asset===undefined)return new Response('Not found',{status:404});
  const ext=p.split('.').pop(),type=ext==='js'?'text/javascript':ext==='css'?'text/css':'text/html';
  return new Response(asset,{headers:{'Content-Type':type+'; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}})
 }catch(e){return json({error:e.status?e.message:'An unexpected server error occurred'},e.status||500)}
}};
