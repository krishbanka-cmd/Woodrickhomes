import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('Catalogue landing uses one public index, retains legacy PDFs and reuses persistent cache before refreshing',async()=>{
 const html=await readFile(new URL('../catalogues/index.html',import.meta.url),'utf8');
 const code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
 const elements=new Map();const el=()=>({value:'',innerHTML:'',textContent:'',addEventListener(){},querySelectorAll(){return[]},replaceChildren(){},appendChild(){}});
 const cache=new Map(),requests=[];let resolveResponse;
 const context=vm.createContext({URLSearchParams,Map,Set,AbortController,setTimeout,clearTimeout,console,
  location:{search:'',pathname:'/catalogues/',hash:''},history:{replaceState(){}},
  document:{getElementById(id){if(!elements.has(id))elements.set(id,el());return elements.get(id)},createTextNode:s=>s,createElement:el},
  WoodrickCatalogue:{pdfKey:i=>i.key,cover:()=>'/catalogue-covers/test.webp',observe(){}},
  localStorage:{getItem:k=>cache.get(k),setItem:(k,v)=>cache.set(k,v)},
  fetch:async url=>{requests.push(url);return new Promise(r=>resolveResponse=r)}
 });
 vm.runInContext(code,context);
 const items=[{key:'louvers/image/led.pdf',type:'image',originalName:'LED.pdf',brand:'Woodline',category:'Louvers',title:'Woodline LED'}, {key:'vendor-public/new/pdf.pdf',type:'pdf',title:'New brand PDF',brand:'New',category:'Laminates'}];
 resolveResponse({ok:true,json:async()=>({items,truncated:false})});
 await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(requests,['/api/media?catalogue=1']);assert.match(elements.get('status').textContent,/2 catalogues found/);
 assert.match(elements.get('grid').innerHTML,/led.pdf/);assert.match(elements.get('grid').innerHTML,/New brand PDF/);
 elements.get('grid').innerHTML='';vm.runInContext('loadCatalogues()',context);
 assert.match(elements.get('grid').innerHTML,/New brand PDF/);assert.equal(requests.length,1,'fresh cached list should not request the API again');
 const saved=JSON.parse(cache.get('woodrick-catalogues-v3'));
 cache.set('woodrick-catalogues-v3',JSON.stringify({...saved,at:Date.now()-6*60*1000}));
 vm.runInContext('loadCatalogues()',context);
 assert.equal(requests.length,2,'a stale cached list should revalidate in the background');
 resolveResponse({ok:true,json:async()=>({items,truncated:false})});await new Promise(r=>setTimeout(r,0));
});
