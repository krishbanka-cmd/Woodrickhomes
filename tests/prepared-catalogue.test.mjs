import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedCatalogue} from '../assets/prepared-catalogue.mjs';
import {cataloguePages} from '../worker-catalogue-pages.js';
import worker from '../worker-fast.js';
const entry={etag:'"v1"',pages:[{width:1200,height:1800,file:'a'.repeat(24)+'/1.webp'}]};
const envFor=(etag='"v1"')=>({PRODUCT_MEDIA:{head:async()=>({httpEtag:etag})},ASSETS:{fetch:async req=>req.url.endsWith('index.json')?Response.json({'public.pdf':entry}):new Response('image bytes')}});
test('Prepared catalogue manifest and page bytes require an unchanged original',async()=>{
 const base='https://example.com/api/catalogue-pages?key=public.pdf';
 const data=await (await cataloguePages(new Request(base),envFor())).json();
 assert.equal(data.pages.length,1);assert.equal(data.pages[0].url,'/api/catalogue-pages?key=public.pdf&page=1');
 const image=await cataloguePages(new Request(base+'&page=1'),envFor());assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/webp');
 assert.equal((await cataloguePages(new Request(base),envFor('"v2"'))).status,404);
 assert.equal((await cataloguePages(new Request(base+'&page=0'),envFor())).status,404);
 assert.equal((await cataloguePages(new Request('https://example.com/api/catalogue-pages?key=private/kyc.pdf'),envFor())).status,404);
});
test('Prepared files cannot be read directly or after vendor approval is revoked',async()=>{
 const env=envFor();env.PRODUCT_MEDIA.get=async()=>({json:async()=>({status:'rejected'})});
 const key='vendor-public/owner/product/1/pdf.pdf';
 assert.equal((await worker.fetch(new Request('https://example.com/assets%2Fcatalogue-pages%2Findex.json'),env,{})).status,404);
 assert.equal((await worker.fetch(new Request('https://example.com/api/catalogue-pages?key='+encodeURIComponent(key)),env,{})).status,404);
 assert.equal((await worker.fetch(new Request('https://example.com/assets/catalogue-pages/index.json'),env,{})).status,404);
 assert.equal((await worker.fetch(new Request('https://example.com/assets/catalogue-pages/'+'a'.repeat(24)+'/1.webp'),env,{})).status,404);
});
test('Prepared image adapter retains page count, renders and reuses the loaded image',async()=>{
 let loads=0,draws=0;
 const doc=await preparedCatalogue('public.pdf',{fetcher:async()=>Response.json({pages:[{width:1200,height:1800,url:'/api/catalogue-pages?key=public.pdf&page=1'}]}),makeImage:()=>({set src(_v){loads++;queueMicrotask(()=>this.onload())}})});
 assert.equal(doc.numPages,1);const page=await doc.getPage(1);
 assert.deepEqual(page.getViewport({scale:.5}),{width:600,height:900});
 await page.render({canvasContext:{drawImage(){draws++}},viewport:{width:600,height:900}}).promise;
 await doc.getPage(1);assert.equal(loads,1);assert.equal(draws,1);
 await assert.rejects(doc.getPage(2));await doc.destroy();await assert.rejects(doc.getPage(1));
});
test('Missing or unsafe prepared manifests leave the existing PDF engine available',async()=>{
 assert.equal(await preparedCatalogue('new.pdf',{fetcher:async()=>new Response('',{status:404})}),null);
 assert.equal(await preparedCatalogue('new.pdf',{fetcher:async()=>Response.json({pages:[{width:1,height:1,url:'https://evil.example/image'}]})}),null);
});
