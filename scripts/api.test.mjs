import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
function storage(){const data=new Map();return {async get(k){const o=data.get(k);return o?{json:async()=>JSON.parse(o.value),body:o.value,httpMetadata:o.metadata}:null},async put(k,v,opt={}){if(opt.onlyIf&&data.has(k))return null;data.set(k,{value:typeof v==='string'?v:new TextDecoder().decode(v),metadata:opt.httpMetadata});return{}},async list({prefix}){return{objects:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false}}}}
test('authorization, server pricing, shop shipping, payment review and tracking',async()=>{
 const env={BUCKET:storage()};
 async function request(p,{user='owner',method='GET',body,origin}={}){const headers={};if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']=user+'@example.test'}if(body)headers['Content-Type']='application/json';if(origin)headers.Origin=origin;const r=await worker.fetch(new Request('https://test.local/api/'+p,{method,headers,body:body?JSON.stringify(body):undefined}),env);return {status:r.status,data:await r.json()}}
 let r=await request('bootstrap');assert.equal(r.data.user.role,'admin');const settings=r.data.settings;
 r=await request('bootstrap',{user:'buyer'});assert.equal(r.data.user.role,'member');
 assert.equal((await request('settings',{user:'buyer',method:'POST',body:settings})).status,403);
 assert.equal((await request('orders',{user:null})).status,401);
 assert.equal((await request('profile',{method:'POST',body:{name:'x'},origin:'https://evil.test'})).status,403);
 assert.equal((await request('settings',{method:'POST',body:{...settings,bankName:'Test bank',bankAccount:'1234567890',bankHolder:'Test only',promptpay:'0812345678'}})).status,200);
 const address={name:'Test buyer',phone:'0812345678',detail:'123 Testing Road Bangkok',postcode:'10110'};
 const cart={items:[{id:'ceramic-mug',qty:2,price:1},{id:'coffee-blend',qty:1}],address,total:1};
 r=await request('orders',{user:'buyer',method:'POST',body:cart});assert.equal(r.status,200);const order=r.data;
 assert.equal(order.total,1190);assert.equal(order.groups.length,2);assert.equal(order.groups[0].shipping,50);assert.equal(order.groups[1].shipping,40);
 assert.equal((await request('orders',{user:'outsider'})).data.length,0);
 assert.equal((await request('orders/'+order.id,{user:'outsider',method:'POST',body:{action:'slip',slip:'/media/slip/outsider/fake'}})).status,403);
 assert.equal((await request('orders/'+order.id,{method:'POST',body:{action:'tracking',shop:'slow-living',tracking:'TH123',carrier:'Test'}})).status,400);
 await env.BUCKET.put('slip/buyer/test','test-image');
 assert.equal((await request('orders/'+order.id,{user:'buyer',method:'POST',body:{action:'slip',slip:'/media/slip/buyer/test'}})).status,200);
 assert.equal((await request('orders/'+order.id,{user:'buyer',method:'POST',body:{action:'payment',approved:true}})).status,403);
 assert.equal((await request('orders/'+order.id,{method:'POST',body:{action:'payment',approved:true}})).status,200);
 r=await request('orders/'+order.id,{method:'POST',body:{action:'tracking',shop:'slow-living',tracking:'TH123',carrier:'Test'}});assert.equal(r.data.groups[0].status,'shipping');assert.equal(r.data.groups[1].status,'preparing');
 assert.equal((await request('orders/'+order.id,{user:'buyer',method:'POST',body:{action:'received',shop:'slow-living'}})).data.groups[0].status,'delivered');
 assert.equal((await request('orders',{user:'buyer',method:'POST',body:{...cart,items:[{id:'ceramic-mug',qty:10000}]}})).status,400);
 assert.equal((await request('products',{user:'buyer',method:'POST',body:{shop:'slow-living'}})).status,403);
 assert.equal((await worker.fetch(new Request('https://test.local/media/orders/'+order.id),env)).status,404);
 assert.equal((await worker.fetch(new Request('https://test.local/media/users/owner'),env)).status,404);
});
