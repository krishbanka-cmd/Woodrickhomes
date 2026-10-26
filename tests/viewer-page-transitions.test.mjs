import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {withDeadline} from '../assets/pdf-loading.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function viewer(prefetch=false){
 const elements=new Map(),renders=[],draws=[],pageRequests=[];
 function element(id){
  const classes=new Set();
  return {hidden:true,disabled:false,dataset:{},style:{},clientWidth:800,clientHeight:900,
   listeners:{},textContent:'',classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x)}},
   setAttribute(k,v){this[k]=v},addEventListener(name,fn){this.listeners[name]=fn},replaceChildren(){},appendChild(){},
   getContext:()=>({drawImage:buffer=>draws.push(buffer.page)}),getBoundingClientRect:()=>({left:0,top:0,width:800,height:900})};
 }
 const pdf={numPages:8,destroy:async()=>{},getPage:async n=>{
  pageRequests.push(n);
  return {getViewport:({scale})=>({width:600*scale,height:800*scale}),render:({canvasContext})=>{
   let resolve,reject;
   const promise=new Promise((a,b)=>{resolve=a;reject=b});
   const task={promise,cancel(){reject(Error('cancelled'))},finish(){canvasContext.page=n;resolve()},fail(){reject(Error('network'))}};
   // The context identifies its backing offscreen canvas in this harness.
   renders.push({n,...task});return task;
  }};
 }};
 const document={getElementById(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id)},
  createTextNode:x=>x,createElement(tag){const el=element(tag);if(tag==='canvas')el.getContext=()=>el;return el},
  addEventListener(){},documentElement:{}};
 const engine={getDocument:()=>({promise:Promise.resolve(pdf),destroy:async()=>{}})};
 let code=await readFile(new URL('../products/presentation/viewer.js',import.meta.url),'utf8');
 code=code.replace(/^import .*\n/,'').replace("import('/assets/pdf-engine.mjs?v=20261013-parallel-loader')","Promise.resolve({pdfEngine:async()=>engine})");
 vm.runInNewContext(code,{withDeadline,engine,URL,URLSearchParams,document,devicePixelRatio:1,
  location:{search:'?key=test.pdf',origin:'https://example.com'},navigator:{connection:{saveData:!prefetch}},performance:{mark(){}},
  window:{addEventListener(){}},setTimeout,clearTimeout,console});
 await tick();
 return {elements,renders,draws,pageRequests};
}

test('Page changes keep the readable page until the replacement is completely rendered',async()=>{
 const h=await viewer();h.renders[0].finish();await tick();
 const canvas=h.elements.get('page'),count=h.elements.get('count');
 assert.equal(canvas.hidden,false);assert.equal(count.textContent,'1 / 8');
 h.elements.get('next').onclick();await tick();
 assert.equal(canvas.hidden,false,'pending next page must not blank the canvas');
 assert.equal(count.textContent,'1 / 8','counter describes the visible page');
 assert.deepEqual(h.draws,[1]);
 h.renders.at(-1).finish();await tick();
 assert.deepEqual(h.draws,[1,2]);assert.equal(count.textContent,'2 / 8');
});

test('Rapid navigation cancels stale work; failed page retries stay on the requested page',async()=>{
 const h=await viewer();h.renders[0].finish();await tick();
 h.elements.get('next').onclick();await tick();
 const stale=h.renders.at(-1);
 h.elements.get('next').onclick();await tick();
 stale.finish();h.renders.at(-1).finish();await tick();
 assert.deepEqual(h.draws,[1,3]);assert.equal(h.elements.get('count').textContent,'3 / 8');
 h.elements.get('next').onclick();await tick();h.renders.at(-1).fail();await tick();
 assert.equal(h.elements.get('page').hidden,false);
 assert.equal(h.elements.get('count').textContent,'3 / 8');
 // Capture the Retry button appended by setStatus on the next failed request.
 let retry;
 h.elements.get('status').appendChild=el=>{if(el.textContent==='Retry')retry=el};
 h.elements.get('next').onclick();await tick();h.renders.at(-1).fail();await tick();
 assert.ok(retry);retry.onclick();await tick();
 assert.equal(h.renders.at(-1).n,5,'retry must not restart the document at page 1');
 h.renders.at(-1).finish();await tick();
 assert.deepEqual(h.draws,[1,3,5]);
});


test('Next reuses a fully rendered neighbour and Back reuses the previous canvas',async()=>{
 const h=await viewer(true);h.renders[0].finish();await tick();
 assert.equal(h.renders.length,2,'paint next page in the background');
 assert.equal(h.renders[1].n,2);
 h.renders[1].finish();await tick();
 assert.deepEqual(h.draws,[1],'prefetch must not change the visible page');
 h.elements.get('next').onclick();await tick();
 assert.deepEqual(h.draws,[1,2]);
 assert.equal(h.renders.filter(x=>x.n===2).length,1,'no second render on Next');
 assert.equal(h.elements.get('status').hidden,true,'no loading badge over a readable page');
 h.elements.get('previous').onclick();await tick();
 assert.deepEqual(h.draws,[1,2,1]);
 assert.equal(h.renders.filter(x=>x.n===1).length,1,'Back reuses the previous page');
 for(const render of h.renders)render.finish();await tick();
});

test('Clicking Next while its prefetch is pending shares the same render',async()=>{
 const h=await viewer(true);h.renders[0].finish();await tick();
 const neighbour=h.renders[1];
 h.elements.get('next').onclick();await tick();
 assert.equal(h.renders.filter(x=>x.n===2).length,1);
 assert.deepEqual(h.draws,[1]);
 assert.equal(h.elements.get('status').hidden,true);
 neighbour.finish();await tick();
 assert.deepEqual(h.draws,[1,2]);
 for(const render of h.renders)render.finish();await tick();
});


test('Native pinch does not navigate or rerender; ordinary swipes still change pages',async()=>{
 const h=await viewer();h.renders[0].finish();await tick();
 const stage=h.elements.get('stage'),events=stage.listeners;
 events.pointerdown({pointerId:1,isPrimary:true,clientX:300,clientY:200});
 events.pointerdown({pointerId:2,isPrimary:false,clientX:400,clientY:200});
 events.pointerup({pointerId:1,clientX:100,clientY:200});
 events.pointerup({pointerId:2,clientX:600,clientY:200});
 let prevented=false;events.click({preventDefault(){prevented=true},stopImmediatePropagation(){}});
 assert.equal(prevented,true);assert.equal(h.renders.length,1);assert.deepEqual(h.draws,[1]);
 const fresh=await viewer();fresh.renders[0].finish();await tick();
 const swipe=fresh.elements.get('stage').listeners;
 swipe.pointerdown({pointerId:3,isPrimary:true,clientX:300,clientY:200});
 swipe.pointerup({pointerId:3,clientX:100,clientY:200});await tick();
 assert.equal(fresh.renders.at(-1).n,2);fresh.renders.at(-1).finish();await tick();
 assert.deepEqual(fresh.draws,[1,2]);
});

test('Trackpad pinch is left to the browser rather than turning catalogue pages',async()=>{
 const h=await viewer();h.renders[0].finish();await tick();
 h.elements.get('stage').listeners.wheel({ctrlKey:true,deltaY:150,deltaX:0,preventDefault(){assert.fail('native zoom blocked')}});
 assert.equal(h.renders.length,1);
 const html=await readFile(new URL('../products/presentation/index.html',import.meta.url),'utf8');
 assert.match(html,/touch-action:pan-y pinch-zoom/);
 assert.match(html,/touch-action:pan-x pan-y pinch-zoom/);
});
