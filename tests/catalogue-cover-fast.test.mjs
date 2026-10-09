import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const asset=new URL('../assets/catalogue-presentation.js',import.meta.url);
const page=new URL('../catalogues/index.html',import.meta.url);
function previewRuntime(script){
 const timers=[];
 const createElement=(tag)=>({
  tagName:tag.toUpperCase(),className:'',style:{},textContent:'',children:[],
  append(...children){this.children.push(...children)},
  replaceChildren(...children){this.children=children}
 });
 const document={createElement};
 const window={};
 vm.runInNewContext(script.slice(script.indexOf('// Shared catalogue-cover rendering:')),{window,document,Map,WeakSet,Promise,setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){},console});
 return {window,timers,createElement};
}
test('Senator and other large catalogues do not download full PDFs to render covers',async()=>{
 const s=await readFile(asset,'utf8'),html=await readFile(page,'utf8');
 const env=previewRuntime(s);
 const tile={
  isConnected:true,dataset:{cataloguePdf:'/api/media?key=senator.pdf&raw=1',catalogueTitle:'Senator · Sanitary & Bath Fittings',cataloguePreview:'none'},
  querySelector(){return null},
  replaceChildren(...nodes){this.nodes=nodes}
 };
 env.window.WoodrickCatalogue.observe({querySelectorAll(){return [tile]}});
 assert.equal(tile.nodes.length,1);
 const cover=tile.nodes[0];
 assert.equal(cover.className,'cover-fallback');
 assert.equal(cover.children[0].textContent,'Senator · Sanitary & Bath Fittings');
 assert.equal(cover.children[1].textContent,'PDF CATALOGUE');
 assert.equal(env.timers.length,0,'large PDF must not start a cover download or timer');
 assert.ok(!s.includes("el.textContent='Loading cover…'"),'indefinite waiting label removed');
 assert.ok(html.includes("Number(g.pdf.size)<=4*1024*1024?'small':'none'"));
 assert.ok(html.includes('/assets/catalogue-presentation.js?v=20261010-coverfix'));
});
test('Slow or failed cover image has a bounded fallback rather than hanging',async()=>{
 const script=await readFile(asset,'utf8'),env=previewRuntime(script);
 let onError,onLoad;
 const image={
  complete:false,naturalWidth:0,addEventListener(event,callback){
   if(event==='error')onError=callback;
   if(event==='load')onLoad=callback;
  }
 };
 const tile={isConnected:true,dataset:{cataloguePdf:'big.pdf',catalogueTitle:'Senator Catalogue',cataloguePreview:'none'},querySelector(){return image},replaceChildren(...nodes){this.nodes=nodes}};
 env.window.WoodrickCatalogue.observe({querySelectorAll(){return [tile]}});
 assert.equal(env.timers.length,1);
 assert.equal(tile.nodes,undefined);
 env.timers[0]();
 assert.equal(tile.nodes[0].className,'cover-fallback');
 assert.equal(tile.nodes[0].children[0].textContent,'Senator Catalogue');
 onLoad();
 onError();
 assert.equal(tile.nodes[0].className,'cover-fallback');
});
test('Only small opted-in PDFs may be previewed and any attempt has a seven-second timeout',async()=>{
 const script=await readFile(asset,'utf8');
 assert.match(script,/el\.dataset\.cataloguePreview!=='small'/);
 assert.match(script,/const MAX_PREVIEW_MS=7000/);
 assert.match(script,/disableAutoFetch:true,rangeChunkSize:65536/);
 assert.match(script,/Promise\.race\(\[work,new Promise/);
 assert.match(script,/task\.destroy\(\)/);
});
