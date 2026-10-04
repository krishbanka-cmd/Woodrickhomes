import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dedupeCatalogueItems} from '../worker-catalogue-identity.js';
import {publicMediaList,syncAndClean} from '../worker-product-media-sync.js';
import worker from '../worker-fast.js';
import {withDeadline} from '../assets/pdf-loading.mjs';

const originals=[
  ['product-sync/laminates/ristal/ristal.pdf','product-sync/laminates/ristal/ristal-82mm.pdf','library/ristal/laminate/ristal-82mm/original/ristal-82mm.pdf'],
  ['product-sync/laminates/ristal/ristal-solid-colour.pdf','product-sync/laminates/ristal/ristal-solid-colour-92mm.pdf','library/ristal/laminate/ristal-solid-colour-92mm/original/ristal-solid-colour-92mm.pdf'],
  ['laminates/pdf/1787751962530-ristal-slim-75mm.pdf','product-sync/laminates/ristal/ristal-75mm.pdf','library/ristal/laminate/ristal-75mm/original/ristal-75mm.pdf']
];
const items=originals.flatMap(([stable,duplicate,source])=>[
  {key:duplicate,sourceKey:source,type:'pdf',title:'Edited title .75mm',brand:'Ristal'},
  {key:stable,...(stable.startsWith('product-sync/')?{sourceKey:source}:{}),type:'pdf',title:'Previous name',brand:'Ristal'}
]).concat({key:'product-sync/laminates/ristal1mm/ristal1mm.pdf',type:'pdf',brand:'Ristal1mm'});

test('Seven live Ristal records resolve to four original files regardless of titles',()=>{
  assert.equal(dedupeCatalogueItems(items).length,4);
  assert.deepEqual(dedupeCatalogueItems(items).slice(0,3).map(x=>x.key),originals.map(x=>x[0]));
  const sameSource={sourceKey:'library/new/original/c.pdf',type:'pdf'};
  assert.equal(dedupeCatalogueItems([{...sameSource,key:'copy/a.pdf'},{...sameSource,key:'copy/b.pdf'}]).length,1);
  assert.equal(dedupeCatalogueItems([{...sameSource,key:'a.pdf',vendorId:'a'},{...sameSource,key:'b.pdf',vendorId:'b'}]).length,2);
  // Different thicknesses/files are never collapsed merely because titles match.
  assert.equal(dedupeCatalogueItems([{key:'a.pdf',title:'Catalogue'},{key:'b.pdf',title:'Catalogue'}]).length,2);
});

test('Both the existing fast index and fresh R2 listing remove source duplicates',async()=>{
  const index=JSON.stringify({items,total:7});
  const fast=await worker.fetch(new Request('https://example.com/api/media?brand-page=1'),{
    PRODUCT_MEDIA:{get:async()=>({uploaded:new Date(),text:async()=>index})}
  },{});
  assert.equal((await fast.json()).items.filter(x=>/^Ristal/.test(x.brand)).length,4);
  const objects=items.map(({key,...customMetadata})=>({key,customMetadata}));
  const fresh=await publicMediaList({PRODUCT_MEDIA:{list:async({prefix,delimiter})=>delimiter?{objects:[],delimitedPrefixes:['laminates/']}:{objects:objects.filter(x=>x.key.startsWith(prefix)),truncated:false}}});
  assert.equal((await fresh.json()).items.filter(x=>/^Ristal/.test(x.brand)).length,4);
});

test('A stalled PDF request is cancelled and rejected instead of waiting indefinitely',async()=>{
  let cancelled=0;
  await assert.rejects(withDeadline(new Promise(()=>{}),10,()=>cancelled++),/timed out/);
  assert.equal(cancelled,1);
  assert.equal(await withDeadline(Promise.resolve('page ready'),100,()=>cancelled++),'page ready');
  assert.equal(cancelled,1);
});

test('Scheduled sync retains the stable customer URL after an original is renamed',async()=>{
  const [stable,duplicate,source]=originals[0],objects=new Map();
  const metadata={type:'pdf',brand:'Ristal',category:'Laminates',catalogue:'Renamed .82mm',sourceKey:source};
  objects.set(stable,{key:stable,size:4,customMetadata:{...metadata}});
  objects.set(duplicate,{key:duplicate,size:4,customMetadata:{...metadata}});
  objects.set(source,{key:source,size:4,uploaded:'2026-10-04',customMetadata:{...metadata,type:'original-pdf'}});
  const written=[];
  await syncAndClean({PRODUCT_MEDIA:{
    list:async()=>({objects:[...objects.values()],truncated:false}),head:async key=>objects.get(key),
    get:async key=>objects.has(key)?{...objects.get(key),body:new Uint8Array(4)}:null,
    put:async(key,body,options)=>{written.push(key);objects.set(key,{key,size:4,...options});},
    delete:async key=>objects.delete(key)
  }});
  assert.deepEqual(written,[stable]);assert.ok(objects.has(stable));assert.ok(objects.has(source));
});

test('PDF range reads return only requested bytes; invalid/private reads are refused',async()=>{
  const bytes=new Uint8Array(600000),ranges=[];
  const env={PRODUCT_MEDIA:{
    head:async()=>({size:bytes.length,httpEtag:'"pdf-v1"',writeHttpMetadata:h=>h.set('content-type','application/pdf')}),
    get:async(key,options)=>{ranges.push(options.range);return {body:bytes.slice(options.range.offset,options.range.offset+options.range.length)}}
  }};
  const url='https://example.com/api/media?raw=1&key=catalogue.pdf';
  const response=await worker.fetch(new Request(url,{headers:{Range:'bytes=262144-524287'}}),env,{});
  assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 262144-524287/600000');
  assert.equal((await response.arrayBuffer()).byteLength,262144);assert.deepEqual(ranges,[{offset:262144,length:262144}]);
  const invalid=await worker.fetch(new Request(url,{headers:{Range:'bytes=600001-700000'}}),env,{});
  assert.equal(invalid.status,416);
  const privateFile=await worker.fetch(new Request('https://example.com/api/media?raw=1&key=private/kyc.pdf'),env,{});
  assert.equal(privateFile.status,404);
});
