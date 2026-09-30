import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {readFile} from 'node:fs/promises';
import app from '../worker-fast.js';
import {syncAndClean} from '../worker-product-media-sync.js';

class MemoryR2{
 constructor(){this.rows=new Map();this.version=0}
 async get(key){const row=this.rows.get(key);if(!row)return null;return {...row,body:row.bytes,text:async()=>row.bytes.toString(),json:async()=>JSON.parse(row.bytes.toString()),writeHttpMetadata(h){h.set('content-type',row.httpMetadata?.contentType||'application/octet-stream')}}}
 async head(key){return this.get(key)}
 async put(key,body,options={}){const old=this.rows.get(key),condition=options.onlyIf;if(condition?.etagMatches&&old?.etag!==condition.etagMatches)return null;if(condition?.etagDoesNotMatch==='*'&&old)return null;const bytes=typeof body==='string'?Buffer.from(body):Buffer.from(await new Response(body).arrayBuffer());const row={key,bytes,size:bytes.length,etag:String(++this.version),uploaded:new Date(),httpMetadata:options.httpMetadata,customMetadata:options.customMetadata};this.rows.set(key,row);return row}
 async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])this.rows.delete(key)}
 async list({prefix='',limit=1000,cursor,delimiter}={}){let rows=[...this.rows.values()].filter(x=>x.key.startsWith(prefix)).sort((a,b)=>a.key.localeCompare(b.key)),delimitedPrefixes=[];if(delimiter){const dirs=new Set();rows=rows.filter(x=>{const pos=x.key.indexOf(delimiter,prefix.length);if(pos<0)return true;dirs.add(x.key.slice(0,pos+1));return false});delimitedPrefixes=[...dirs]}const offset=Number(cursor||0),objects=rows.slice(offset,offset+limit),truncated=offset+limit<rows.length;return {objects,truncated,...(truncated?{cursor:String(offset+limit)}:{}),delimitedPrefixes}}
}
function setup(){
 const storage=new MemoryR2();
 const env={PRODUCT_MEDIA:storage,ADMIN_UPLOAD_TOKEN:'synthetic-test-secret',ASSETS:{fetch:async req=>{
  const path=new URL(req.url).pathname;
  try{return new Response(await readFile(new URL('..'+path.replace(/\/$/,'/index.html'),import.meta.url)),{headers:{'content-type':'text/html'}})}
  catch{return new Response('Asset',{headers:{'content-type':'text/plain'}})}
 }}};
 const ctx={waitUntil(p){p.catch(()=>{})}};
 return {storage,env,ctx};
}
async function call(s,path,{admin=false,cookie,body,method}={}){const headers={origin:'https://example.test','cf-connecting-ip':'192.0.2.1'};if(admin)headers.authorization='Bearer '+s.env.ADMIN_UPLOAD_TOKEN;if(cookie)headers.cookie=cookie;if(body&&!(body instanceof FormData))headers['content-type']='application/json';const req=new Request('https://example.test'+path,{method:method||(body?'POST':'GET'),headers,...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});return app.fetch(req,s.env,s.ctx)}
const data=async response=>{const d=await response.json();return {status:response.status,...d}};
function application(number,name='Test Supplies'){const f=new FormData();for(const [key,value] of Object.entries({business:name,contact:'Test Owner',mobile:number,city:'Gorakhpur',category:'Laminates',gst:'',note:'Synthetic test application'}))f.set(key,value);f.set('file',new File(['%PDF-1.7\nsynthetic-business-document'],'business.pdf',{type:'application/pdf'}));return f}
async function create(s,number,name){const response=await call(s,'/api/vendor-applications',{admin:true,body:application(number,name)});assert.equal(response.status,201,JSON.stringify(await response.clone().json()));return (await response.json()).vendor}
async function approve(s,v){const response=await call(s,'/api/vendor-applications/status',{admin:true,body:{id:v.id,status:'approved',manualVerified:true}});assert.equal(response.status,200)}
async function login(s,v){const grant=await data(await call(s,'/api/vendor-applications/login-link',{admin:true,body:{id:v.id}}));const token=new URLSearchParams(new URL(grant.url).hash.slice(1)).get('activate'),response=await call(s,'/api/vendor/activate',{body:{token}});assert.equal(response.status,200);return {cookie:response.headers.get('set-cookie').split(';')[0],token}}
function product(id,revision){const f=new FormData();for(const [k,v] of Object.entries({title:'Test Laminate',brand:'Test Brand',category:'Laminates',description:'Synthetic product',price:'1000',...(id?{id,revision:String(revision)}:{})}))f.set(k,v);f.set('photo',new File([new Uint8Array([255,216,255,224,1,2,3,4])],'photo.jpg',{type:'image/jpeg'}));return f}
async function newProduct(s,cookie){const r=await call(s,'/api/vendor/products',{cookie,body:product()});assert.equal(r.status,201,JSON.stringify(await r.clone().json()));return (await r.json()).product}
async function review(s,p,status='approved'){return call(s,'/api/vendor-applications/products/review',{admin:true,body:{id:p.id,revision:p.revision,status,note:status==='rejected'?'Test review reason':''}})}
async function publicItems(s){return (await data(await call(s,'/api/media?_=test'))).items}

test('Private applications, real verification gates, one-time links and isolation',async()=>{
 const s=setup();assert.equal((await call(s,'/api/vendor-applications')).status,401);assert.equal((await call(s,'/api/vendor-applications/file?id=00000000-0000-0000-0000-000000000000')).status,401);assert.equal((await call(s,'/api/media?prefix=private/vendors/')).status,404);
 const pending=await data(await call(s,'/api/vendor-applications',{body:application('9876543210')}));assert.equal(pending.status,201);assert.equal(pending.vendor.mobileVerified,false);assert.equal((await call(s,'/api/vendor-applications/status',{admin:true,body:{id:pending.id,status:'approved'}})).status,400);await approve(s,pending.vendor);
 const signed=await login(s,pending.vendor);assert.equal((await call(s,'/api/vendor/activate',{body:{token:signed.token}})).status,401);assert.equal((await call(s,'/api/vendor/products',{cookie:signed.cookie+'forged'})).status,401);assert.equal((await data(await call(s,'/api/vendor/session',{cookie:signed.cookie}))).vendor.id,pending.id);
 const v2=await create(s,'9876543211','Second Vendor');const second=await login(s,v2);assert.equal((await call(s,'/api/vendor/products',{cookie:second.cookie,body:product()})).status,403);await approve(s,v2);
 const p=await newProduct(s,signed.cookie);assert.equal((await publicItems(s)).some(x=>x.productId===p.id),false);assert.equal((await call(s,'/api/vendor/file?productId='+p.id+'&kind=image',{cookie:second.cookie})).status,404);assert.equal((await call(s,'/api/vendor/file?productId='+p.id+'&kind=image',{cookie:signed.cookie})).status,200);assert.equal((await call(s,'/api/media?key='+encodeURIComponent(p.files[0].key))).status,404);
 assert.equal((await review(s,p)).status,200);assert.equal((await publicItems(s)).some(x=>x.productId===p.id),true);assert.equal((await call(s,'/api/vendor-applications/products/review',{admin:true,body:{id:p.id,revision:999,status:'approved'}})).status,409);
 const p2=await newProduct(s,second.cookie);assert.equal((await review(s,p2)).status,200);await syncAndClean(s.env);assert.equal((await publicItems(s)).filter(x=>x.title==='Test Laminate').length,2);
 const updated=await data(await call(s,'/api/vendor/products',{cookie:signed.cookie,body:product(p.id,p.revision)}));assert.equal(updated.status,200);assert.equal((await publicItems(s)).filter(x=>x.productId===p.id).length,1);assert.equal((await review(s,updated.product,'rejected')).status,200);assert.equal((await publicItems(s)).filter(x=>x.productId===p.id).length,0);
 await review(s,p2);assert.equal((await call(s,'/api/vendor-applications/status',{admin:true,body:{id:v2.id,status:'suspended',note:'Synthetic suspension'}})).status,200);assert.equal((await publicItems(s)).some(x=>x.vendorId===v2.id),false);assert.equal((await call(s,'/api/vendor/products',{cookie:second.cookie,body:product()})).status,403);
 assert.equal((await s.storage.get('private/vendors/backup/'+v2.id+'.json')).json instanceof Function,true);assert.equal((await (await s.storage.get('private/vendors/backup/'+v2.id+'.json')).json()).state,'pending');
});

test('OTP never fakes verification; provider-approved codes issue sessions and resend is limited',async()=>{
 const s=setup();assert.equal((await call(s,'/api/vendor/otp/start',{body:{mobile:'9876543210'}})).status,503);Object.assign(s.env,{TWILIO_ACCOUNT_SID:'AC-test',TWILIO_AUTH_TOKEN:'test-token',TWILIO_VERIFY_SERVICE_SID:'VA-test'});assert.equal((await call(s,'/api/vendor-applications',{body:application('9876543210')})).status,401);
 const original=globalThis.fetch;const calls=[];globalThis.fetch=async(url,opts)=>{calls.push({url,body:String(opts.body)});return new Response(JSON.stringify({status:String(url).endsWith('VerificationCheck')?'approved':'pending'}),{headers:{'content-type':'application/json'}})};
 try{assert.equal((await call(s,'/api/vendor/otp/start',{body:{mobile:'9876543210'}})).status,200);assert.equal((await call(s,'/api/vendor/otp/start',{body:{mobile:'9876543210'}})).status,429);const verified=await call(s,'/api/vendor/otp/check',{body:{mobile:'9876543210',code:'123456'}});assert.equal(verified.status,200);const cookie=verified.headers.get('set-cookie').split(';')[0];const submitted=await data(await call(s,'/api/vendor-applications',{cookie,body:application('9876543210')}));assert.equal(submitted.status,201);assert.equal(submitted.vendor.mobileVerified,true);assert.ok(calls[0].url.endsWith('/Verifications'));assert.ok(calls[1].url.endsWith('/VerificationCheck'))}finally{globalThis.fetch=original}
});

test('More than 1000 vendors can be paginated, searched and protected from cross-origin writes',async()=>{
 const s=setup();for(let i=0;i<1101;i++){const id=crypto.randomUUID();await s.storage.put('private/vendors/records/'+id+'.json',JSON.stringify({id,business:'Seed Vendor '+i,contact:'Synthetic',mobile:'9'+String(i).padStart(9,'0'),city:'Test City',category:'Laminates',status:'pending',createdAt:new Date().toISOString()}))}let cursor=null,total=0,pages=0;do{const result=await data(await call(s,'/api/vendor-applications'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{admin:true}));assert.equal(result.status,200);total+=result.items.length;cursor=result.cursor;pages++}while(cursor);assert.equal(total,1101);assert.ok(pages>20);
 let found=[];cursor=null;do{const result=await data(await call(s,'/api/vendor-applications?search=Seed%20Vendor%201100'+(cursor?'&cursor='+cursor:''),{admin:true}));found.push(...result.items);cursor=result.cursor}while(cursor);assert.equal(found.length,1);
 const req=new Request('https://example.test/api/vendor-applications/status',{method:'POST',headers:{origin:'https://attacker.test',authorization:'Bearer '+s.env.ADMIN_UPLOAD_TOKEN,'content-type':'application/json'},body:'{}'});assert.equal((await app.fetch(req,s.env,s.ctx)).status,403);
});

test('Resubmission, malformed documents and orphan public copies cannot bypass review',async()=>{
 const s=setup();
 const malformed=application('9876543210');malformed.set('file',new File(['not a PDF'],'business.pdf',{type:'application/pdf'}));assert.equal((await call(s,'/api/vendor-applications',{body:malformed})).status,400);
 const missing=application('9876543210');missing.delete('file');assert.equal((await call(s,'/api/vendor-applications',{body:missing})).status,400);
 const v=await create(s,'9876543210');const signed=await login(s,v);
 assert.equal((await call(s,'/api/vendor-applications/status',{admin:true,body:{id:v.id,status:'rejected',note:'Please correct business details'}})).status,200);
 const resubmit=application('9876543210','Corrected Firm');resubmit.delete('file');const res=await data(await call(s,'/api/vendor/profile',{cookie:signed.cookie,body:resubmit}));assert.equal(res.status,200);assert.equal(res.vendor.status,'pending');assert.equal(res.vendor.business,'Corrected Firm');await approve(s,v);
 const p=await newProduct(s,signed.cookie),orphan='vendor-public/'+v.id+'/'+p.id+'/999/image.jpg';await s.storage.put(orphan,new Uint8Array([255,216,255]),{customMetadata:{vendorId:v.id,productId:p.id,type:'image'}});
 assert.equal((await call(s,'/api/media?key='+encodeURIComponent(orphan))).status,404);assert.equal((await publicItems(s)).some(x=>x.key===orphan),false);
 assert.equal((await review(s,p)).status,200);const stored=await (await s.storage.get('private/vendors/products/'+p.id+'.json')).json();const key=stored.publicKeys[0];assert.equal((await call(s,'/api/media?key='+encodeURIComponent(key))).status,200);
 assert.equal((await call(s,'/api/vendor/products/archive',{cookie:signed.cookie,body:{id:p.id}})).status,200);assert.equal((await call(s,'/api/media?key='+encodeURIComponent(key))).status,404);assert.equal((await publicItems(s)).some(x=>x.productId===p.id),false);
});
