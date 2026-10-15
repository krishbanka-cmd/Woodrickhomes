import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import legacyWorker from '../worker.js';
import websiteWorker from '../worker-fast.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('SEO: canonical pages and local search metadata are present',()=>{
  const home=read('index.html');
  assert.match(home,/<title>Woodrick Homes \| Plywood, Laminates &amp; More in Gorakhpur<\/title>/);
  assert.match(home,/<link rel="canonical" href="https:\/\/woodrickhomes\.com\/"\s*\/>/);
  assert.match(home,/"@type":"LocalBusiness"/);
  assert.match(home,/"addressLocality":"Gorakhpur"/);
  assert.match(home,/<section class="hero" id="home">/);
  assert.match(home,/id="wh-footer-refresh"/);
  for(const [file,path] of [
    ['products/index.html','/products/'],
    ['catalogues/index.html','/catalogues/'],
    ['products/brands/index.html','/products/brands/'],
    ['become-a-vendor/index.html','/become-a-vendor/']
  ]){
    const source=read(file);
    assert.ok(source.includes('https://woodrickhomes.com'+path),file+' missing canonical');
    assert.match(source,/<meta name="description"\s+content=/,file+' missing description');
  }
});

test('SEO: sitemap contains only chosen public crawlable pages',()=>{
  const sitemap=read('sitemap.xml');
  const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
  assert.equal(urls.length,5);
  assert.equal(new Set(urls).size,5);
  assert.ok(urls.every(u=>u.startsWith('https://woodrickhomes.com/')));
  assert.ok(!urls.some(u=>u.includes('/admin')||u.includes('/api/')||u.includes('/vendor/')));
});

test('SEO: www browsing redirects to the canonical hostname',async()=>{
  const response=await websiteWorker.fetch(new Request('https://www.woodrickhomes.com/products/?category=Plywood',{method:'GET'}),{},{});
  assert.equal(response.status,301);
  assert.equal(response.headers.get('location'),'https://woodrickhomes.com/products/?category=Plywood');
});

test('Security: vendor login is unindexed and gets protective headers',async()=>{
  const response=await websiteWorker.fetch(new Request('https://woodrickhomes.com/vendor/'),{
    ASSETS:{fetch:async()=>new Response('<html><head></head><body>Vendor login</body></html>',{headers:{'content-type':'text/html'}})}
  },{});
  assert.equal(response.headers.get('x-robots-tag'),'noindex');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});

test('Security: login requires authentication and cannot be framed',async()=>{
  const response=await legacyWorker.fetch(new Request('https://woodrickhomes.com/admin-products/'),{ADMIN_UPLOAD_TOKEN:'test-secret'});
  assert.match(await response.text(),/Admin Login/);
  assert.match(response.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
});

test('Security: legacy admin upload rejects a fake PDF signature',async()=>{
  const data=new FormData();
  data.set('file',new File(['<html>not a PDF document</html>'],'fake.pdf',{type:'application/pdf'}));
  data.set('category','Plywood');
  data.set('title','Test');
  let writes=0;
  const req=new Request('https://woodrickhomes.com/api/upload',{
    method:'POST',headers:{authorization:'Bearer test-secret'},body:data
  });
  const response=await legacyWorker.fetch(req,{ADMIN_UPLOAD_TOKEN:'test-secret',PRODUCT_MEDIA:{put:async()=>{writes++;}}});
  assert.equal(response.status,415);
  assert.equal(writes,0);
  assert.match((await response.json()).error,/does not match/i);
});

test('Security: a valid PDF signature passes the legacy upload gate',async()=>{
  const data=new FormData();
  data.set('file',new File(['%PDF-1.7\n1 0 obj\n'],'safe.pdf',{type:'application/pdf'}));
  data.set('category','Plywood');
  data.set('title','Sample');
  let writtenKey='';
  const req=new Request('https://woodrickhomes.com/api/upload',{
    method:'POST',headers:{authorization:'Bearer test-secret'},body:data
  });
  const response=await legacyWorker.fetch(req,{ADMIN_UPLOAD_TOKEN:'test-secret',PRODUCT_MEDIA:{
    put:async key=>{writtenKey=key;}
  }});
  assert.equal(response.status,201);
  assert.match(writtenKey,/\.pdf$/);
});
