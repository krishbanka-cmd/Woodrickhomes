import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const src=path=>readFile(new URL(path,import.meta.url),'utf8');
function store(data){const m=new Map(Object.entries(data));return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};}

test('Category folder paints cached brands synchronously without waiting for an API response',async()=>{
  const code=await src('../assets/category-brands.js'),nodes=new Map(),listeners={};
  let requests=0;
  function element(tag='div'){return {
    tagName:tag.toUpperCase(),dataset:{},children:[],textContent:'',value:'',href:'',
    hidden:false,className:'',style:{},append(...a){this.children.push(...a)},
    replaceChildren(...a){this.children=[...a]},
    addEventListener(name,handler){this['on'+name]=handler;},
    setAttribute(name,value){this[name]=value}
  };}
  const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
  const cached={at:Date.now(),data:{
    categories:['Louvers','Laminates'],items:[{
      brand:'Woodline',label:'Woodline',src:'',categories:['Louvers','Laminates'],
      mediaCount:3,categoryCounts:{Louvers:2,Laminates:1}
    }]
  }};
  const ctx=vm.createContext({
    location:{search:'?category=Louvers',pathname:'/products/brands/',origin:'https://woodrickhomes.com'},
    document:{getElementById:node,createElement:element,addEventListener(){},visibilityState:'visible'},
    window:{addEventListener:(ev,fn)=>listeners[ev]=fn},
    navigator:{connection:{saveData:true}},
    localStorage:store({'woodrick-public-brand-directory-v1':JSON.stringify(cached)}),
    fetch:async()=>{requests++;return new Promise(()=>{})},URL,URLSearchParams,Map,Set,
    Date,JSON,console,setTimeout,clearTimeout,encodeURIComponent
  });
  vm.runInContext(code,ctx);
  assert.equal(node('brandGrid').children.length,1);
  assert.equal(node('brandGrid').children[0].href,'/brands/?brand=Woodline&return=%2Fproducts%2Fbrands%2F%3Fcategory%3DLouvers&category=Louvers');
  assert.match(node('directoryStatus').textContent,/1 brand in Louvers/);
  assert.equal(requests,0,'fresh cached directory must not block on a new request');
  listeners.pageshow({persisted:true});
  assert.equal(requests,0,'return navigation should not perform duplicate fetches');
});

test('A stale category folder stays visible while its directory is revalidated',async()=>{
  const code=await src('../assets/category-brands.js'),nodes=new Map(),callbacks=[];
  function element(){return{children:[],value:'',textContent:'',hidden:false,append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v},addEventListener(){},setAttribute(){}}}
  const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
  let fetches=0;
  const ctx=vm.createContext({
    document:{getElementById:node,createElement:element,addEventListener(){},visibilityState:'visible'},
    window:{addEventListener(){}},navigator:{connection:{saveData:true}},
    location:{search:'?category=Louvers',pathname:'/products/brands/',origin:'https://woodrickhomes.com'},
    localStorage:store({'woodrick-public-brand-directory-v1':JSON.stringify({at:Date.now()-180000,data:{
      categories:['Louvers'],items:[{brand:'Woodline',label:'Woodline',categories:['Louvers'],categoryCounts:{Louvers:1},mediaCount:1}]
    }})}),
    fetch:async()=>{fetches++;return new Promise(()=>{})},AbortController,URL,URLSearchParams,Map,Set,
    Date,JSON,console,setTimeout:(cb)=>{callbacks.push(cb);return callbacks.length},clearTimeout(){},encodeURIComponent
  });
  vm.runInContext(code,ctx);
  assert.equal(node('brandGrid').children.length,1,'cached folder should render before fetch resolves');
  assert.equal(fetches,1,'only one background revalidation request');
  assert.match(node('directoryStatus').textContent,/1 brand/,'no loading spinner while data refreshes');
});

test('Brand catalogue folder immediately displays media already fetched by Products',async()=>{
  const html=await src('../brands/index.html'),code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const nodes=new Map();let requests=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',addEventListener(){},querySelectorAll(){return[]}});return nodes.get(id)};
  const cached={savedAt:Date.now(),items:[{key:'product-sync/laminates/ristal/ristal.pdf',brand:'Ristal',category:'Laminates',type:'pdf',title:'Ristal Premium'}]};
  const ctx=vm.createContext({
    location:{search:'?brand=Ristal&category=Laminates',pathname:'/brands/',origin:'https://woodrickhomes.com'},
    document:{getElementById:node,querySelector:q=>q==='a.back'?{href:'',textContent:''}:null,querySelectorAll:()=>[]},
    localStorage:store({'woodrick-public-media-v1':JSON.stringify(cached)}),
    WoodrickCatalogue:{pdfKey:x=>x.key,title:()=> 'Ristal Premium',cover:()=>'',observe(){}},
    fetch:async()=>{requests++;throw Error('Should not need fetch while cache is fresh')},
    URL,URLSearchParams,Map,Set,Date,JSON,console,history:{replaceState(){}},encodeURIComponent,setTimeout,clearTimeout
  });
  vm.runInContext(code,ctx);
  assert.match(node('grid').innerHTML,/Ristal Premium/);
  assert.match(node('status').textContent,/1 media item/);
  assert.equal(requests,0);
});

test('Products prewarms the same directory key used by category folders',async()=>{
  const products=await src('../products/index.html'),category=await src('../assets/category-brands.js');
  assert.match(products,/warmPublicBrandFolders/);
  assert.match(products,/woodrick-public-brand-directory-v1/);
  assert.match(category,/woodrick-public-brand-directory-v1/);
  assert.doesNotMatch(category,/visibilityState==='visible'\)load\(\)/,'do not reload every time the page becomes visible');
  assert.match(category,/fingerprint===displayedFingerprint/,'unchanged directory should not cause visible card reflow');
});
