import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../worker-fast.js';
import {PUBLIC_MEDIA_INDEX_KEY} from '../worker-product-media-sync.js';

const catalogue={
  key:'product-sync/laminates/ristal/ristal.pdf',
  brand:'Ristal', category:'Laminates', title:'Ristal Premium',
  originalName:'ristal.pdf', type:'pdf'
};

test('Products, brand folders and View Catalogue all reuse one cached public index',async()=>{
  const requested=[];
  const saved={items:[catalogue],total:1,truncated:false};
  const env={PRODUCT_MEDIA:{
    async get(key){
      requested.push(key);
      assert.equal(key,PUBLIC_MEDIA_INDEX_KEY,'no slow per-folder listing or media reads');
      return {uploaded:new Date(Date.now()-5*60*1000),text:async()=>JSON.stringify(saved)};
    },
    async list(){throw Error('Unexpected slow catalogue folder enumeration');}
  }};
  const paths=[
    '/api/media?catalogue=1',
    '/api/media?brand-page=1',
    '/api/media?catalogue-covers=3&_attempt=1&_=1791594300000'
  ];
  for(const path of paths){
    const result=await worker.fetch(new Request('https://woodrickhomes.com'+path),env,{waitUntil(){}});
    assert.equal(result.status,200,path);
    const data=await result.json();
    assert.ok(data.items.some(i=>i.key===catalogue.key),path);
    assert.equal(result.headers.get('x-woodrick-media-index'),'fast-v1');
  }
  assert.equal(requested.length,paths.length);
});

test('Products fetch no longer adds unique URL and no-store flags on every refresh',async()=>{
  const products=await readFile(new URL('../products/index.html',import.meta.url),'utf8');
  assert.match(products,/fetch\('\/api\/media\?catalogue=1',\{cache:attempt===1\?'default':'reload'\}\)/);
  assert.doesNotMatch(products,/catalogue-covers=3&_attempt/);
  const viewer=await readFile(new URL('../products/presentation/viewer.js',import.meta.url),'utf8');
  assert.match(viewer,/if\(retry\|\|!pdf\)\{/,'original PDF must be usable during initial loading');
  assert.match(viewer,/original\.href=rawUrl/);
});
