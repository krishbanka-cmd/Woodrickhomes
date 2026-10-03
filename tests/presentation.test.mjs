import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';
import worker from '../worker-fast.js';
import {consistentCustomerResponse} from '../worker-ui-consistency.js';

test('Customer presentation normalizes versions without changing authenticated panels or the PDF stage',async()=>{
  const source='<html><body class="existing"><a href="#products-services">Products</a><script src="/assets/catalogue-presentation.js?v=old"></script></body></html>';
  const response=()=>new Response(source,{headers:{'content-type':'text/html','content-length':'999'}});
  for(const path of ['/brands/','/products/','/catalogues/','/woodrick-library.html','/woodrick-library']){
    const result=await consistentCustomerResponse(response(),new URL('https://example.com'+path)),html=await result.text();
    assert.match(html,/existing woodrick-browse-page/);assert.match(html,/href="\/products\/">Products/);assert.match(html,/catalogue-presentation.js\?v=20261002-audit1/);assert.match(html,/customer-ui.css/);assert.equal(result.headers.get('content-length'),null);
  }
  for(const path of ['/admin-products/','/vendor/','/become-a-vendor/','/products/presentation/']){
    const result=await consistentCustomerResponse(response(),new URL('https://example.com'+path));assert.equal(await result.text(),source);
  }
});

test('Offline cache fetches fresh UI assets and preserves the cached copy when offline',async()=>{
  const listeners={},saved=new Map([['https://example.com/assets/customer-ui.css',new Response('old')]]);
  const cache={match:async r=>saved.get(r.url||r)?.clone(),put:async(r,v)=>saved.set(r.url||r,v)};
  let online=true;
  const context={self:{addEventListener:(n,f)=>listeners[n]=f,skipWaiting(){},clients:{claim(){}}},location:{origin:'https://example.com'},caches:{open:async()=>cache,match:async r=>cache.match(r)},fetch:async()=>{if(!online)throw Error('offline');return new Response('new')},URL};
  vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),context);
  const request={url:'https://example.com/assets/customer-ui.css',method:'GET',destination:'style'};
  let pending;listeners.fetch({request,respondWith:p=>pending=p});assert.equal(await(await pending).text(),'new');
  online=false;listeners.fetch({request,respondWith:p=>pending=p});assert.equal(await(await pending).text(),'new');
  for(const path of ['/api/media','/vendor/','/admin-products/']){
    let intercepted=false;listeners.fetch({request:{...request,url:'https://example.com'+path},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
  }
});

test('Legacy catalogue originals and public product records choose the same cover',async()=>{
  const context={window:{},Map,WeakSet};vm.runInNewContext(await readFile(new URL('../assets/catalogue-presentation.js',import.meta.url),'utf8'),context);
  const c=context.window.WoodrickCatalogue;
  assert.equal(c.cover({key:'library/ristal/laminate/ristal-75mm/original/ristal-75mm.pdf'}),c.cover({key:'laminates/pdf/1787751962530-ristal-slim-75mm.pdf'}));
  assert.equal(c.cover({key:'laminate/original-pdf/1787901460624-ristal1mm.pdf'}),c.cover({key:'product-sync/laminates/ristal1mm/ristal1mm.pdf'}));
  assert.equal(c.cover({key:'vendor-public/new/pdf.pdf'}),'');
});

test('Every HTML route produces syntactically valid inline scripts after live worker enhancements',async()=>{
  async function files(dir=''){
    const entries=await readdir(new URL('../'+dir,import.meta.url),{withFileTypes:true}),result=[];
    for(const entry of entries){const path=dir+entry.name;if(entry.isDirectory()&&!['.git','node_modules','android-app'].includes(entry.name))result.push(...await files(path+'/'));else if(entry.isFile()&&entry.name.endsWith('.html'))result.push(path)}return result;
  }
  const pages=await files(),env={ADMIN_UPLOAD_TOKEN:'presentation-test-only',PRODUCT_MEDIA:{get:async()=>null,head:async()=>null,list:async()=>({objects:[],truncated:false}),put:async()=>{},delete:async()=>{}},ASSETS:{fetch:async request=>{
    const p=new URL(request.url).pathname.slice(1),path=p||'index.html';
    try{return new Response(await readFile(new URL('../'+path,import.meta.url)),{headers:{'content-type':'text/html'}})}catch{return new Response('Missing asset',{status:404})}
  }}};
  for(const page of pages){
    const result=await worker.fetch(new Request('https://example.com/'+page,{headers:{authorization:'Bearer presentation-test-only'}}),env,{waitUntil(){}});
    assert.equal(result.status,200,page);const html=await result.text();
    for(const [index,match]of [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries()){
      if(!match[2].trim()||/application\/ld\+json|type=["']module/.test(match[1]))continue;
      assert.doesNotThrow(()=>new vm.Script(match[2]),page+' inline '+index);
    }
  }
  assert.ok(pages.length>=24);
});

test('Category library includes legacy PDFs labelled as images without duplicate originals or private files',async()=>{
  const html=await readFile(new URL('../woodrick-library.html',import.meta.url),'utf8');
  const context={window:{},Map,WeakSet};
  vm.runInNewContext(await readFile(new URL('../assets/catalogue-presentation.js',import.meta.url),'utf8'),context);
  context.WoodrickCatalogue=context.window.WoodrickCatalogue;
  vm.runInNewContext(html.slice(html.indexOf('function isCataloguePdf('),html.indexOf('async function loadAll(){')),context);
  const original={key:'library/woodline-louvers/louvers/woodline-louvers-8x5/original/woodline-louvers-8x5.pdf',type:'original-pdf'};
  const page={key:'library/woodline-louvers/louvers/woodline-louvers-8x5/jpg/page-001.jpg',type:'jpg-page'};
  const items=context.completeCatalogueItems([original,page],[
    {key:'product-sync/louvers/woodline-louvers/woodline-louvers-8x5.pdf',sourceKey:original.key,type:'pdf'},
    {key:'louvers/image/1787636958432-woodline-led-louvers.pdf',type:'image',title:'WOODLINE LED LOUVERS'},
    {key:'louvers/image/1787636923292-woodline-louvers-9-5x6.pdf',type:'image',title:'WOODLINE LOUVERS 9.5X6'},
    {key:'private/document.pdf',type:'pdf'},
    {key:'louvers/image/photo.jpg',type:'image'}
  ]);
  assert.equal(items.filter(context.isCataloguePdf).length,3);
  assert.equal(items.filter(x=>x.type==='jpg-page').length,1);
  assert.equal(items[3].catalogue,'WOODLINE LOUVERS 9.5X6');
});
