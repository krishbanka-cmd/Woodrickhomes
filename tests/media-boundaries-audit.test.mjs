import test from 'node:test';
import assert from 'node:assert/strict';
import activeWorker from '../worker-fast.js';
import libraryWorker from '../worker-library.js';
import legacyWorker from '../worker.js';
import {onRequestGet} from '../functions/api/media.js';

const sensitiveKeys=[
 'private/vendors/records/test.json',
 'private/vendors/files/test-aadhaar.pdf',
 'private/enquiries/records/customer.json',
 '_config/public-media-index-v1.json',
 '_system/brand-rail-v1.json'
];
const handlers=[
 ['active Cloudflare worker', (request,env)=>activeWorker.fetch(request,env,{waitUntil(){}})],
 ['legacy worker', (request,env)=>legacyWorker.fetch(request,env)],
 ['library worker', (request,env)=>libraryWorker.fetch(request,env)],
 ['Pages media function', (request,env)=>onRequestGet({request,env})]
];

for(const [name,handle] of handlers){
 test(name+' refuses sensitive R2 keys before reading storage',async()=>{
  const reads=[];
  const env={PRODUCT_MEDIA:{
   async get(key){reads.push(key);return null},
   async head(){return null},
   async list(){throw Error('private request must not list files')}
  }};
  for(const key of sensitiveKeys){
   const request=new Request('https://woodrickhomes.com/api/media?key='+encodeURIComponent(key));
   const response=await handle(request,env);
   assert.equal(response.status,404,name+' exposed '+key);
  }
  assert.deepEqual(reads,[],name+' read a sensitive object');
 });
}

test('Pages public listing never returns private, system or config objects',async()=>{
 const env={PRODUCT_MEDIA:{
  async list(){return {objects:[
   {key:'product-sync/laminates/ristal/catalogue.pdf',size:24,customMetadata:{type:'pdf',brand:'Ristal'}},
   {key:'private/vendors/files/test.pdf',size:40},
   {key:'_system/brand-rail-v1.json',size:50},
   {key:'_config/private-settings.json',size:60}
  ],truncated:false,cursor:null}}
 }};
 const response=await onRequestGet({request:new Request('https://woodrickhomes.com/api/media'),env});
 const data=await response.json();
 assert.equal(response.status,200);
 assert.deepEqual(data.items.map(x=>x.key),['product-sync/laminates/ristal/catalogue.pdf']);
});

test('Pages public media endpoint rejects private listings',async()=>{
 const env={PRODUCT_MEDIA:{async list(){throw Error('private listing must not reach storage')}}};
 for(const prefix of ['private/','_config/','_system/']){
  const response=await onRequestGet({request:new Request('https://woodrickhomes.com/api/media?prefix='+encodeURIComponent(prefix)),env});
  assert.equal(response.status,404);
 }
});
