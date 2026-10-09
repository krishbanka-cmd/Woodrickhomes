import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {readFile} from 'node:fs/promises';
import app from '../worker-fast.js';
import {syncAndClean} from '../worker-product-media-sync.js';

test('Vendor catalogue upload accepts 500 MB and rejects larger declarations',async()=>{
 const s=setup(),v=await create(s,'9876543210');await approve(s,v);const signed=await login(s,v);
 for(const [size,expected] of [[500*1024*1024,201],[500*1024*1024+1,400]]){
  const result=await data(await call(s,'/api/vendor/catalogue-upload/start',{cookie:signed.cookie,body:{productId:crypto.randomUUID(),revision:0,size,name:'catalogue.pdf',contentType:'application/pdf'}}));assert.equal(result.status,expected);if(expected===201)assert.equal(result.total,63);else assert.match(result.error,/500 MB/);
 }
});

test('Vendor brands and supply locations are separate, editable and included in backup',async()=>{
 const s=setup(),form=application('9876543210');form.set('brands','Woodline, Century, Green');form.set('supplyLocations','Gorakhpur, Deoria');
 const created=await data(await call(s,'/api/vendor-applications',{body:form}));assert.equal(created.status,201);assert.equal(created.vendor.brands,'Woodline, Century, Green');assert.equal(created.vendor.supplyLocations,'Gorakhpur, Deoria');
 const signed=await login(s,created.vendor),edit=application('9876543210');edit.delete('file');edit.delete('note');edit.set('brands','Century');edit.set('supplyLocations','Kushinagar');
 const revised=await data(await call(s,'/api/vendor/profile',{cookie:signed.cookie,body:edit}));assert.equal(revised.status,200);assert.equal(revised.vendor.brands,'Century');assert.equal(revised.vendor.supplyLocations,'Kushinagar');assert.equal(revised.vendor.note,'Synthetic test application');
 await approve(s,created.vendor);const path='/api/vendor-applications/coverage',body={id:created.id,brands:'Woodline, Century, Green',supplyLocations:'Gorakhpur, Maharajganj'};
 assert.equal((await call(s,path,{body})).status,401);assert.equal((await call(s,path,{cookie:signed.cookie,body})).status,401);
 const saved=await data(await call(s,path,{admin:true,body}));assert.equal(saved.status,200);assert.equal(saved.vendor.status,'approved');assert.equal(saved.vendor.brands,body.brands);assert.equal(saved.vendor.supplyLocations,body.supplyLocations);
 const persisted=await data(await call(s,'/api/vendor-applications',{admin:true}));assert.equal(persisted.items.find(v=>v.id===created.id).brands,body.brands);assert.equal(persisted.items.find(v=>v.id===created.id).supplyLocations,body.supplyLocations);
 assert.equal((await call(s,path,{admin:true,body:{id:created.id,brands:'',supplyLocations:''}})).status,400);
 const afterBlank=await data(await call(s,'/api/vendor-applications',{admin:true}));assert.equal(afterBlank.items.find(v=>v.id===created.id).brands,body.brands);
 assert.equal((await call(s,path,{admin:true,body:{...body,brands:'x'.repeat(501)}})).status,400);
 const backup=await (await s.storage.get('private/vendors/backup/'+created.id+'.json')).json();assert.equal(backup.event.brands,body.brands);assert.equal(backup.event.supplyLocations,body.supplyLocations);
 const ownerBody={brands:'Century, Green',supplyLocations:'Deoria',id:'00000000-0000-0000-0000-000000000000'};
 assert.equal((await call(s,'/api/vendor/coverage',{body:ownerBody})).status,401);
 const corrected=await data(await call(s,'/api/vendor/coverage',{cookie:signed.cookie,body:ownerBody}));assert.equal(corrected.status,200);assert.equal(corrected.vendor.id,created.id);assert.equal(corrected.vendor.status,'approved');
 const ownerSession=await data(await call(s,'/api/vendor/session',{cookie:signed.cookie}));assert.equal(ownerSession.vendor.brands,ownerBody.brands);assert.equal(ownerSession.vendor.supplyLocations,ownerBody.supplyLocations);
 const adminRows=await data(await call(s,'/api/vendor-applications',{admin:true}));assert.equal(adminRows.items.find(v=>v.id===created.id).supplyLocations,ownerBody.supplyLocations);
 assert.equal((await call(s,'/api/vendor/coverage',{cookie:signed.cookie,body:{brands:'',supplyLocations:''}})).status,400);
 const isolated=await create(s,'9876543212'),isolatedLogin=await login(s,isolated);await call(s,'/api/vendor/coverage',{cookie:isolatedLogin.cookie,body:{...ownerBody,id:created.id,brands:'Other brand'}});assert.equal((await data(await call(s,'/api/vendor/session',{cookie:signed.cookie}))).vendor.brands,ownerBody.brands);
 await call(s,'/api/vendor-applications/status',{admin:true,body:{id:created.id,status:'suspended',note:'Synthetic suspension'}});assert.equal((await call(s,'/api/vendor/coverage',{cookie:signed.cookie,body:ownerBody})).status,403);
 const legacy=await create(s,'9876543211');assert.equal(legacy.brands,'');assert.equal(legacy.supplyLocations,'');
});

test('Optional Aadhaar and PAN files stay private and persist through profile edits',async()=>{
 const s=setup(),form=application('9876543210');for(const kind of ['aadhaar','pan'])form.set(kind,new File(['%PDF-1.7\nsynthetic-'+kind],kind+'.pdf',{type:'application/pdf'}));
 const created=await data(await call(s,'/api/vendor-applications',{body:form}));assert.equal(created.status,201);assert.equal(created.vendor.hasAadhaar,true);assert.equal(created.vendor.hasPan,true);assert.equal(created.vendor.aadhaarKey,undefined);assert.equal(created.vendor.panKey,undefined);
 const rows=await data(await call(s,'/api/vendor-applications',{admin:true})),stored=rows.items[0];
 const owner=await login(s,created.vendor),other=await create(s,'9876543211'),second=await login(s,other);
 for(const kind of ['aadhaar','pan']){
  const path='/api/vendor-applications/file?id='+created.id+'&kind='+kind;
  assert.equal((await call(s,path)).status,401);assert.equal((await call(s,path,{cookie:owner.cookie})).status,401);
  const download=await call(s,path,{admin:true});assert.equal(download.status,200);assert.match(await download.text(),new RegExp('synthetic-'+kind));assert.equal(download.headers.get('cache-control'),'private, no-store');
  assert.equal((await call(s,'/api/vendor/file?document='+kind,{cookie:owner.cookie})).status,200);
  assert.equal((await call(s,'/api/vendor/file?document='+kind+'&id='+created.id,{cookie:second.cookie})).status,404);
  assert.equal((await call(s,'/api/media?key='+encodeURIComponent(stored[kind+'Key']))).status,404);
 }
 const edit=application('9876543210');edit.delete('file');edit.set('pan',new File(['%PDF-1.7\nreplacement-pan'],'pan.pdf',{type:'application/pdf'}));
 const updated=await data(await call(s,'/api/vendor/profile',{cookie:owner.cookie,body:edit}));assert.equal(updated.status,200);assert.equal(updated.vendor.hasAadhaar,true);assert.equal(updated.vendor.hasPan,true);
 assert.match(await (await call(s,'/api/vendor/file?document=pan',{cookie:owner.cookie})).text(),/replacement-pan/);
 const bad=application('9876543212');bad.set('aadhaar',new File(['fake'],'bad.pdf',{type:'application/pdf'}));assert.equal((await call(s,'/api/vendor-applications',{body:bad})).status,400);
 const large=application('9876543212');large.set('pan',new File(['%PDF-',new Uint8Array(5*1024*1024)],'large.pdf',{type:'application/pdf'}));assert.equal((await call(s,'/api/vendor-applications',{body:large})).status,400);
 const backup=await (await s.storage.get('private/vendors/backup/'+created.id+'.json')).json();assert.equal(backup.event.aadhaarKey,undefined);assert.equal(backup.event.panKey,undefined);
 const legacy=await create(s,'9876543213');assert.equal(legacy.hasAadhaar,false);assert.equal(legacy.hasPan,false);
});

test('Business applications preserve multiple categories through admin review and profile resubmission',async()=>{
 const s=setup(),form=application('9876543210');form.append('category','Plywood');form.append('category','Louvers');form.append('category','Plywood');
 const submitted=await data(await call(s,'/api/vendor-applications',{body:form}));assert.equal(submitted.status,201);assert.deepEqual(submitted.vendor.categories,['Laminates','Plywood','Louvers']);assert.equal(submitted.vendor.category,'Laminates, Plywood, Louvers');
 const listed=await data(await call(s,'/api/vendor-applications',{admin:true}));assert.deepEqual(listed.items[0].categories,submitted.vendor.categories);
 const search=await data(await call(s,'/api/vendor-applications?search=9876543210',{admin:true}));assert.equal(search.items[0].category,submitted.vendor.category);
 const signed=await login(s,submitted.vendor),edit=application('9876543210');edit.delete('file');edit.delete('category');edit.append('category','Tiles');edit.append('category','Bath Fittings');
 const updated=await data(await call(s,'/api/vendor/profile',{cookie:signed.cookie,body:edit}));assert.equal(updated.status,200);assert.deepEqual(updated.vendor.categories,['Tiles','Bath Fittings']);
 const backup=await (await s.storage.get('private/vendors/backup/'+submitted.id+'.json')).json();assert.equal(backup.event.category,'Tiles, Bath Fittings');
 const empty=application('9876543211');empty.delete('category');assert.equal((await call(s,'/api/vendor-applications',{body:empty})).status,400);
 const tooLong=application('9876543211');tooLong.set('category','x'.repeat(101));assert.equal((await call(s,'/api/vendor-applications',{body:tooLong})).status,400);
 const tooMany=application('9876543211');for(let i=0;i<40;i++)tooMany.append('category','Category '+i);assert.equal((await call(s,'/api/vendor-applications',{body:tooMany})).status,400);
 const legacy=await create(s,'9876543212');assert.deepEqual(legacy.categories,['Laminates']);
 await approve(s,submitted.vendor);const p=await newProduct(s,signed.cookie);assert.equal(p.category,'Laminates');assert.equal(p.categories,undefined);
});

test('Login history is admin-only, newest first, and records successful sign-ins only',async()=>{
 const s=setup(),v=await create(s,'9876543210'),other=await create(s,'9876543211');
 const path='/api/vendor-applications/login-history?id='+v.id;
 assert.equal((await call(s,path)).status,401);
 assert.equal((await data(await call(s,path,{admin:true}))).items.length,0);
 const signed=await login(s,v);
 assert.equal((await call(s,path,{cookie:signed.cookie})).status,401);
 assert.equal((await call(s,'/api/vendor/activate',{body:{token:signed.token}})).status,401);
 for(let i=0;i<3;i++)await call(s,'/api/vendor/session',{cookie:signed.cookie});
 let result=await data(await call(s,path,{admin:true}));
 assert.equal(result.items.length,1);assert.equal(result.items[0].method,'access-link');
 assert.deepEqual(Object.keys(result.items[0]).sort(),['at','id','method']);
 assert.equal((await data(await call(s,'/api/vendor-applications/login-history?id='+other.id,{admin:true}))).items.length,0);
 const rows=await data(await call(s,'/api/vendor-applications',{admin:true}));
 assert.equal(rows.items.find(x=>x.id===v.id).lastLogin.at,result.items[0].at);
 assert.equal(rows.items.find(x=>x.id===other.id).lastLogin,null);
 assert.equal((await call(s,'/api/vendor-applications/login-history?id=../../records',{admin:true})).status,400);
 assert.equal((await call(s,'/api/media?prefix=private/vendors/logins/')).status,404);
 for(let i=0;i<61;i++){const at=new Date(Date.UTC(2025,0,1,0,0,i)).toISOString();await s.storage.put('private/vendors/logins/'+v.id+'/'+String(9999999999999-Date.parse(at))+'-seed-'+i+'.json',JSON.stringify({id:'seed-'+i,at,method:'otp'}))}
 result=await data(await call(s,path,{admin:true}));assert.equal(result.items.length,50);assert.ok(result.cursor);
 const rest=await data(await call(s,path+'&cursor='+encodeURIComponent(result.cursor),{admin:true}));assert.equal(rest.items.length,12);
 const all=[...result.items,...rest.items];assert.deepEqual(all.map(x=>x.at),all.map(x=>x.at).sort().reverse());
 Object.assign(s.env,{TWILIO_ACCOUNT_SID:'AC-test',TWILIO_AUTH_TOKEN:'test-token',TWILIO_VERIFY_SERVICE_SID:'VA-test'});
 const original=globalThis.fetch;let approved=false;globalThis.fetch=async()=>new Response(JSON.stringify({status:approved?'approved':'pending'}));
 try{assert.equal((await call(s,'/api/vendor/otp/check',{body:{mobile:v.mobile,code:'123456'}})).status,400);approved=true;assert.equal((await call(s,'/api/vendor/otp/check',{body:{mobile:v.mobile,code:'123456'}})).status,200)}finally{globalThis.fetch=original}
 const stored=await s.storage.list({prefix:'private/vendors/logins/'+v.id+'/'});assert.equal(stored.objects.length,63);
 assert.equal((await data(await call(s,path,{admin:true}))).items[0].method,'otp');
});

class MemoryR2{
 constructor(){this.rows=new Map();this.version=0;this.multipart=new Map()}
 async createMultipartUpload(key,options){const uploadId=crypto.randomUUID();this.multipart.set(uploadId,{key,options,parts:new Map()});return {...this.resumeMultipartUpload(key,uploadId),uploadId}}
 resumeMultipartUpload(key,uploadId){const store=this;return {uploadId,async uploadPart(partNumber,bytes){const u=store.multipart.get(uploadId);if(!u||u.key!==key)throw Error('No upload');u.parts.set(partNumber,Buffer.from(bytes));return {partNumber,etag:'part-'+partNumber}},async complete(parts){const u=store.multipart.get(uploadId);if(!u||u.key!==key)throw Error('No upload');const buffers=parts.map(p=>{assert.equal(p.etag,'part-'+p.partNumber);return u.parts.get(p.partNumber)});const result=await store.put(key,Buffer.concat(buffers),u.options);store.multipart.delete(uploadId);return result},async abort(){store.multipart.delete(uploadId)}}}
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

test('Multipart PDFs validate parts, isolate vendors, attach privately and publish only after review',async()=>{
 const s=setup(),v=await create(s,'9876543210');await approve(s,v);const signed=await login(s,v),other=await create(s,'9876543211');await approve(s,other);const second=await login(s,other),productId=crypto.randomUUID(),size=8*1024*1024+20;
 const start=await data(await call(s,'/api/vendor/catalogue-upload/start',{cookie:signed.cookie,body:{productId,revision:0,size,name:'catalogue.pdf',contentType:'application/pdf'}}));assert.equal(start.status,201);
 const route='/api/vendor/catalogue-upload/',query='?id='+start.id;
 const raw=async(bytes,part,cookie=signed.cookie,origin='https://example.test')=>data(await app.fetch(new Request('https://example.test'+route+'part'+query+'&part='+part,{method:'POST',headers:{cookie,origin,'content-type':'application/octet-stream'},body:bytes}),s.env,s.ctx));
 assert.equal((await call(s,route+'complete'+query,{cookie:signed.cookie,body:{}})).status,409);
 assert.equal((await raw(new Uint8Array(20),2,second.cookie)).status,404);assert.equal((await raw(new Uint8Array(20),2,signed.cookie,'https://attacker.test')).status,403);
 assert.equal((await raw(new Uint8Array(21),2)).status,413);
 const bytes=new Uint8Array(start.partSize);assert.equal((await raw(bytes,1)).status,400);bytes.set(new TextEncoder().encode('%PDF-1.7'));assert.equal((await raw(bytes,1)).status,200);
 assert.equal((await raw(new Uint8Array(20),2)).status,200);assert.equal((await call(s,route+'complete'+query,{cookie:signed.cookie,body:{}})).status,200);assert.equal((await call(s,route+'complete'+query,{cookie:signed.cookie,body:{}})).status,200);
 const form=product(productId,0);form.delete('photo');form.set('catalogueUpload',start.id);
 assert.equal((await call(s,'/api/vendor/products',{cookie:second.cookie,body:form})).status,409);
 const submitted=await data(await call(s,'/api/vendor/products',{cookie:signed.cookie,body:form}));assert.equal(submitted.status,201);assert.equal(submitted.product.files[0].size,size);assert.equal(submitted.product.status,'pending');assert.ok(!(await publicItems(s)).some(p=>p.productId===productId));
 // A lost submit response followed by cleanup must not delete the saved product file.
 assert.equal((await call(s,route+'abort'+query,{cookie:signed.cookie,body:{}})).status,200);assert.ok(await s.storage.head(submitted.product.files[0].key));
 assert.equal((await review(s,submitted.product)).status,200);assert.ok((await publicItems(s)).some(p=>p.productId===productId));
 assert.equal((await call(s,'/api/vendor/products',{cookie:signed.cookie,body:form})).status,409);
});
test('Aborted/expired multipart uploads cannot be attached or completed',async()=>{
 const s=setup(),v=await create(s,'9876543210');await approve(s,v);const signed=await login(s,v),id=crypto.randomUUID();
 const start=await data(await call(s,'/api/vendor/catalogue-upload/start',{cookie:signed.cookie,body:{productId:id,revision:0,size:30,name:'test.pdf',contentType:'application/pdf'}}));const query='?id='+start.id;
 assert.equal((await call(s,'/api/vendor/catalogue-upload/abort'+query,{cookie:signed.cookie,body:{}})).status,200);
 assert.equal((await call(s,'/api/vendor/catalogue-upload/complete'+query,{cookie:signed.cookie,body:{}})).status,409);
 const form=product(id,0);form.set('catalogueUpload',start.id);assert.equal((await call(s,'/api/vendor/products',{cookie:signed.cookie,body:form})).status,409);
 const expired=await data(await call(s,'/api/vendor/catalogue-upload/start',{cookie:signed.cookie,body:{productId:id,revision:0,size:30,name:'test.pdf',contentType:'application/pdf'}}));const key='private/vendors/catalogue-uploads/'+expired.id+'.json',record=await s.storage.get(key).then(r=>r.json());await s.storage.put(key,JSON.stringify({...record,expires:0}));assert.equal((await call(s,'/api/vendor/catalogue-upload/complete?id='+expired.id,{cookie:signed.cookie,body:{}})).status,409);
});


test('Sheet settings require admin, reject unsafe URLs and keep tokens private',async()=>{
 const s=setup(),path='/api/vendor-applications/backup-settings',body={url:'https://script.google.com/macros/s/'+'A'.repeat(30)+'/exec',token:'secret'.repeat(12)};
 assert.equal((await call(s,path,{body})).status,401);
 assert.equal((await call(s,path,{admin:true,body:{...body,url:'https://evil.test/exec'}})).status,400);
 assert.equal((await call(s,path,{admin:true,body:{...body,token:'short'}})).status,400);
 const saved=await data(await call(s,path,{admin:true,body}));assert.equal(saved.ok,true);assert.equal(saved.token,undefined);
 const config=await data(await call(s,'/api/vendor-applications/config',{admin:true}));assert.equal(config.sheetBackupAvailable,true);assert.equal(config.token,undefined);
 const raw=new Request('https://example.test'+path,{method:'POST',headers:{origin:'https://evil.test',authorization:'Bearer '+s.env.ADMIN_UPLOAD_TOKEN,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await app.fetch(raw,s.env,s.ctx)).status,403);
 assert.equal((await call(s,'/api/media?key=private/vendors/settings/sheet-backup.json')).status,404);
});

test('Sheet retry confirms actual delivery and preserves pending records on failure',async()=>{
 const s=setup(),v=await create(s,'9876543210'),body={url:'https://script.google.com/macros/s/'+'A'.repeat(30)+'/exec',token:'secret'.repeat(12)};
 await call(s,'/api/vendor-applications/backup-settings',{admin:true,body});
 const original=globalThis.fetch;let accepted=true;const sent=[];
 globalThis.fetch=async(url,opts)=>{sent.push({url,payload:JSON.parse(opts.body)});return new Response(JSON.stringify({ok:accepted}))};
 try{
 const ok=await data(await call(s,'/api/vendor-applications/backup-retry',{admin:true,body:{id:v.id}}));assert.equal(ok.synced,true);assert.equal(sent[0].url,body.url);assert.equal(sent[0].payload.token,body.token);assert.equal(sent[0].payload.event.id,v.id);assert.equal(sent[0].payload.event.documentKey,undefined);
 accepted=false;const failed=await data(await call(s,'/api/vendor-applications/backup-retry',{admin:true,body:{id:v.id}}));assert.equal(failed.synced,false);
 assert.equal((await (await s.storage.get('private/vendors/backup/'+v.id+'.json')).json()).state,'pending');
 }finally{globalThis.fetch=original}
});

test('Approved vendors set passwords after verified access and sign in on another device',async()=>{
 const s=setup(),v=await create(s,'9876543210');
 assert.equal((await call(s,'/api/vendor/password',{body:{password:'a strong password 123'}})).status,401);
 const pending=await login(s,v);assert.equal((await call(s,'/api/vendor/password',{cookie:pending.cookie,body:{password:'a strong password 123'}})).status,403);
 await approve(s,v);const signed=await login(s,v);
 assert.equal((await call(s,'/api/vendor/password',{cookie:signed.cookie,body:{password:'short'}})).status,400);
 assert.equal((await call(s,'/api/vendor/password',{cookie:signed.cookie,body:{password:'a strong password 123'}})).status,200);
 const stored=await (await s.storage.get('private/vendors/credentials/'+v.id+'.json')).json();assert.ok(stored.hash);assert.ok(stored.salt);assert.ok(!JSON.stringify(stored).includes('a strong password'));
 assert.equal((await call(s,'/api/vendor/password/login',{body:{mobile:'9876543210',password:'wrong password 123'}})).status,401);
 const result=await call(s,'/api/vendor/password/login',{body:{mobile:'9876543210',password:'a strong password 123'}});assert.equal(result.status,200);
 const cookie=result.headers.get('set-cookie').split(';')[0];const session=await data(await call(s,'/api/vendor/session',{cookie}));assert.equal(session.vendor.id,v.id);assert.equal(session.canSetPassword,false);assert.ok(!JSON.stringify(session).includes(stored.hash));
 assert.equal((await call(s,'/api/vendor/password',{cookie,body:{password:'another password 123'}})).status,403);
 await call(s,'/api/vendor-applications/status',{admin:true,body:{id:v.id,status:'suspended',note:'Test suspension'}});
 assert.equal((await call(s,'/api/vendor/password/login',{body:{mobile:'9876543210',password:'a strong password 123'}})).status,401);
});

test('Vendor email registration, ownership verification and email password login',async()=>{
 const s=setup(),form=application('9876543210');form.set('email','Vendor.Owner@Gmail.com');
 const created=await data(await call(s,'/api/vendor-applications',{admin:true,body:form}));assert.equal(created.status,201);const v=created.vendor;assert.equal(v.email,'vendor.owner@gmail.com');assert.equal(v.emailVerified,false);
 await approve(s,v);const signed=await login(s,v);await call(s,'/api/vendor/password',{cookie:signed.cookie,body:{password:'vendor password 1234'}});
 const signIn=email=>call(s,'/api/vendor/password/login',{body:{identifier:email,password:'vendor password 1234'}});
 assert.equal((await signIn('vendor.owner@gmail.com')).status,401);
 assert.equal((await call(s,'/api/vendor-applications/email-verify',{cookie:signed.cookie,body:{id:v.id,email:v.email,confirmed:true}})).status,401);
 assert.equal((await call(s,'/api/vendor-applications/email-verify',{admin:true,body:{id:v.id,email:v.email,confirmed:false}})).status,400);
 assert.equal((await call(s,'/api/vendor-applications/email-verify',{admin:true,body:{id:v.id,email:v.email,confirmed:true}})).status,200);
 const response=await signIn('VENDOR.OWNER@gmail.com');assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];assert.equal((await data(await call(s,'/api/vendor/session',{cookie}))).vendor.id,v.id);
 const other=await create(s,'9876543211');await approve(s,other);const otherLogin=await login(s,other);await call(s,'/api/vendor/email',{cookie:otherLogin.cookie,body:{email:v.email}});
 assert.equal((await call(s,'/api/vendor-applications/email-verify',{admin:true,body:{id:other.id,email:v.email,confirmed:true}})).status,409);
 assert.equal((await call(s,'/api/vendor/email',{body:{email:'new@example.com'}})).status,401);
 assert.equal((await call(s,'/api/vendor/email',{cookie,body:{email:'bad-email'}})).status,400);
 assert.equal((await call(s,'/api/vendor/email',{cookie,body:{email:'new@example.com',id:other.id}})).status,200);
 assert.equal((await signIn(v.email)).status,401);
 assert.equal((await call(s,'/api/vendor/password/login',{body:{identifier:'9876543210',password:'vendor password 1234'}})).status,200);
 const otherSession=await data(await call(s,'/api/vendor/session',{cookie:otherLogin.cookie}));assert.equal(otherSession.vendor.email,v.email);
});

test('Admin-controlled login link remains a working OTP-free sign-in and password setup path',async()=>{
 const s=setup(),v=await create(s,'9876543210');
 await approve(s,v);
 const config=await data(await call(s,'/api/vendor/config'));
 assert.equal(config.otpAvailable,false);
 assert.equal((await call(s,'/api/vendor-applications/login-link',{body:{id:v.id}})).status,401,'public users may not generate tokens');
 const link=await data(await call(s,'/api/vendor-applications/login-link',{admin:true,body:{id:v.id}}));
 assert.equal(link.status,200);
 assert.ok(link.expiresAt>Date.now());
 assert.ok(link.expiresAt<Date.now()+86400000+2000);
 const token=new URLSearchParams(new URL(link.url).hash.slice(1)).get('activate');
 assert.ok(token);
 const activation=await call(s,'/api/vendor/activate',{body:{token}});
 assert.equal(activation.status,200);
 const cookie=activation.headers.get('set-cookie').split(';')[0];
 assert.equal((await data(await call(s,'/api/vendor/session',{cookie}))).canSetPassword,true);
 assert.equal((await call(s,'/api/vendor/activate',{body:{token}})).status,401,'one-time token cannot be replayed');
 const saved=await call(s,'/api/vendor/password',{cookie,body:{password:'a new vendor password 123'}});
 assert.equal(saved.status,200);
 const normalCookie=saved.headers.get('set-cookie').split(';')[0];
 assert.equal((await data(await call(s,'/api/vendor/session',{cookie:normalCookie}))).canSetPassword,false);
 assert.equal((await call(s,'/api/vendor/password/login',{body:{mobile:'9876543210',password:'a new vendor password 123'}})).status,200);
 // A vendor can still sign in with a fresh admin-approved one-time link while OTP is unavailable.
 const another=await data(await call(s,'/api/vendor-applications/login-link',{admin:true,body:{id:v.id}}));
 const anotherToken=new URLSearchParams(new URL(another.url).hash.slice(1)).get('activate');
 assert.notEqual(anotherToken,token);
 assert.equal((await call(s,'/api/vendor/activate',{body:{token:anotherToken}})).status,200);
});
