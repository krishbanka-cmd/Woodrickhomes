import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../worker-fast.js';

const assetEnv={
 ASSETS:{fetch:async(request)=>{
  const p=new URL(request.url).pathname;
  if(p.endsWith('/notfound.js'))return new Response('Missing',{status:404,headers:{'content-type':'application/javascript'}});
  if(p.endsWith('/index.html')||p==='/products/presentation/')return new Response('<html><body><h1>PDF presentation</h1></body></html>',{headers:{'content-type':'text/html'}});
  return new Response('console.log("public pdf code");',{headers:{'content-type':'application/javascript'}});
 }}
};

test('All shared PDF viewer JS and PDF.js worker pieces are cacheable by browser, but not HTML',async()=>{
 for(const file of [
 '/products/presentation/viewer.js?v=20261010-shared-cache',
 '/products/presentation/vendor/pdf.min.mjs',
 '/products/presentation/vendor/pdf.worker.part-1.js',
 '/products/presentation/vendor/pdf.worker.part-4.js'
 ]){
  const response=await worker.fetch(new Request('https://woodrickhomes.com'+file),assetEnv,{});
  assert.equal(response.status,200,file);
  assert.match(response.headers.get('cache-control'),/public, max-age=86400/,file);
  assert.equal(response.headers.get('pragma'),null,file);
  assert.ok((await response.text()).includes('public pdf code'));
 }
 const html=await worker.fetch(new Request('https://woodrickhomes.com/products/presentation/?key=example.pdf'),assetEnv,{});
 assert.equal(html.status,200);
 assert.match(html.headers.get('cache-control'),/no-store/);
 assert.match(await html.text(),/woodrick-fixed-catalogue-back/,'each PDF preserves original back navigation');
 const missing=await worker.fetch(new Request('https://woodrickhomes.com/products/presentation/notfound.js'),assetEnv,{});
 assert.equal(missing.status,404);
 assert.match(missing.headers.get('cache-control'),/no-store/,'never cache missing assets for a whole day');
});

test('One accelerated viewer is shared by library and brands, without altering file links',async()=>{
 const [html,engine,viewer,library,brands]=await Promise.all([
  readFile(new URL('../products/presentation/index.html',import.meta.url),'utf8'),
  readFile(new URL('../assets/pdf-engine.mjs',import.meta.url),'utf8'),
  readFile(new URL('../products/presentation/viewer.js',import.meta.url),'utf8'),
  readFile(new URL('../catalogues/index.html',import.meta.url),'utf8'),
  readFile(new URL('../brands/index.html',import.meta.url),'utf8')
 ]);
 assert.ok(html.includes('<link rel="modulepreload" href="/assets/pdf-engine.mjs?v=20261010-shared-cache">'));
 assert.ok(html.includes('viewer.js?v=20261010-quick-preview-v1'));
 assert.ok(viewer.includes("import('/assets/pdf-engine.mjs?v=20261010-shared-cache')"));
 assert.ok(viewer.includes('disableAutoFetch:true,disableStream:true'),'do not re-download whole PDF');
 assert.ok(viewer.includes("withDeadline(task.promise,30000"),'stalled catalogue has retry');
 assert.ok(viewer.includes("stageTiming('first-page-visible')"),'first visible page timing marker');
 assert.ok(engine.includes("cache:'default'"));
 assert.ok(!engine.includes("cache:'no-cache'"));
 assert.ok(library.includes('pdfviewer=1&title='));
 assert.ok(brands.includes('pdfviewer=1&key='));
});

test('All publicly accessible catalogue PDFs still have HTTP range-support and safe original links',async()=>{
 const env={PRODUCT_MEDIA:{
   head:async()=>({size:660000,httpEtag:'"v1"',writeHttpMetadata:headers=>headers.set('content-type','application/pdf')}),
   get:async(key,opts)=>({body:new Uint8Array(opts?.range?.length??660000)})
 }};
 const request=new Request('https://woodrickhomes.com/api/media?key=public-catalogue.pdf&raw=1',{headers:{Range:'bytes=0-65535'}});
 const response=await worker.fetch(request,env,{});
 assert.equal(response.status,206);
 assert.equal(response.headers.get('content-range'),'bytes 0-65535/660000');
 assert.equal((await response.arrayBuffer()).byteLength,65536);
});
