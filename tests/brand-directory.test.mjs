import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBrandDirectory} from '../worker-brand-directory.js';
import {publicMediaList} from '../worker-product-media-sync.js';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('Published brands join the rail/category directory once and retain curated logos',()=>{
 const items=buildBrandDirectory([{key:'vendor-public/a/p/1/pdf.pdf',brand:'Royal Crown',category:'Laminates'},{key:'vendor-public/a/p/1/image.jpg',brand:'ROYAL CROWN',category:'Plywood'},{key:'old.pdf',brand:'Woodline Louvers',category:'Louvers'},{key:'private/kyc.pdf',brand:'Secret',category:'Plywood'}],[{brand:'Woodline',src:'/logo.svg'},{brand:'CenturyPly',src:'/century.svg'}]);
 assert.equal(items.filter(x=>x.brand.toLowerCase()==='royal crown').length,1);assert.equal(items.find(x=>x.brand==='Royal Crown').mediaCount,2);assert.deepEqual(items.find(x=>x.brand==='Royal Crown').categories,['Laminates','Plywood']);assert.equal(items.find(x=>x.brand==='Woodline').src,'/logo.svg');assert.equal(items.find(x=>x.brand==='Woodline').categoryCounts.Louvers,1);assert.deepEqual(items.find(x=>x.brand==='CenturyPly').categories,['Plywood']);assert.ok(!items.some(x=>x.brand==='Secret'));
});
test('Only published approved vendor copies can contribute a brand; suspension removes it',async()=>{
 let status='approved';const key='vendor-public/v/p/1/pdf.pdf',meta={vendorId:'v',productId:'p',brand:'Royal Crown',category:'Laminates',type:'pdf'};
 const env={PRODUCT_MEDIA:{list:async options=>options.delimiter?{objects:[],delimitedPrefixes:['vendor-public/'],truncated:false}:options.prefix==='vendor-public/'?{objects:[{key,customMetadata:meta}],truncated:false}:{objects:[],truncated:false},get:async path=>({json:async()=>path.includes('/records/')?{status}:{publicKeys:status==='pending'?[]:[key]}})}};
 for(const state of ['pending','approved','suspended']){status=state;const data=await publicMediaList(env).then(r=>r.json());const brands=buildBrandDirectory(data.items);assert.equal(brands.some(x=>x.brand==='Royal Crown'),state==='approved')}
});
test('Brand media stays within the selected category while including brand aliases',async()=>{
 const html=await readFile(new URL('../brands/index.html',import.meta.url),'utf8'),source=html.slice(html.indexOf('const norm='),html.indexOf('function pdfCover(')),ctx={requested:'Woodline',params:new URLSearchParams({category:'Louvers'}),title:{},document:{}};vm.runInNewContext(source+';this.matches=belongs',ctx);
 assert.equal(ctx.matches({brand:'Woodline Louvers',category:'Louvers',type:'pdf'}),true);assert.equal(ctx.matches({brand:'Woodline',category:'Laminates',type:'pdf'}),false);assert.equal(ctx.matches({brand:'Royal Crown',category:'Louvers',type:'pdf'}),false);
});

test('Saved brand categories survive a directory refresh without requiring uploaded media',()=>{
 const items=buildBrandDirectory([],[{brand:'Ambuja Cement',label:'Ambuja Cement',categories:['Cement','Tiles','Cement']}]);
 assert.deepEqual(items[0].categories,['Cement','Tiles']);
 const merged=buildBrandDirectory([{key:'ambuja.pdf',brand:'Ambuja Cement',category:'Plywood'}],[{brand:'Ambuja Cement',categories:['Cement']}]);
 assert.deepEqual(merged[0].categories,['Cement','Plywood']);
});

test('Every published brand can be hidden from the hero while remaining editable with its catalogues',async()=>{
 const {default:app}=await import('../worker-fast.js');let saved=null;
 const env={ADMIN_UPLOAD_TOKEN:'test-secret',PRODUCT_MEDIA:{
  get:async key=>key==='_system/brand-rail-v1.json'&&saved?{text:async()=>saved}:null,
  put:async(key,body)=>{assert.equal(key,'_system/brand-rail-v1.json');saved=body},
  list:async options=>({objects:options.prefix==='product-sync/'?[{key:'product-sync/royal.pdf',customMetadata:{brand:'Royal Crown',category:'Laminates',catalogue:'Royal Crown 1mm',type:'pdf'}}]:[],truncated:false})
 }};
 const post=async(body,authorized=true)=>app.fetch(new Request('https://test/api/brands',{method:'POST',headers:{'content-type':'application/json',...(authorized?{authorization:'Bearer test-secret'}:{})},body:JSON.stringify(body)}),env,{});
 assert.equal((await post({action:'visibility',brand:'Royal Crown',railEnabled:false},false)).status,401);
 assert.equal((await post({action:'visibility',brand:'Royal Crown',railEnabled:false})).status,200);
 const list=async scope=>(await app.fetch(new Request('https://test/api/brands'+scope),env,{})).json();
 assert.ok(!(await list('')).items.some(x=>x.brand==='Royal Crown'));
 const hidden=(await list('?scope=all')).items.find(x=>x.brand==='Royal Crown');assert.equal(hidden.railEnabled,false);assert.equal(hidden.mediaCount,1);
 assert.equal((await post({item:{brand:'Royal Crown',label:'Royal Crown corrected'}})).status,200);
 assert.ok(!(await list('')).items.some(x=>x.brand==='Royal Crown'));
 assert.equal((await post({action:'visibility',brand:'Royal Crown',railEnabled:true})).status,200);
 assert.equal((await list('')).items.find(x=>x.brand==='Royal Crown').label,'Royal Crown corrected');
 assert.equal(JSON.parse(saved).items.filter(x=>x.brand==='Royal Crown').length,1);
});

test('Home shows Royal Crown and its navigation retains the catalogue identity after display-name edits',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<div class="trusted-name">Royal Crown<\/div>/);
 assert.doesNotMatch(html,/<div class="trusted-name">Royale Touche<\/div>/);
 assert.doesNotMatch(html,/'Royal Crown':.*royale-touche/);
 const worker=await readFile(new URL('../worker-home.js',import.meta.url),'utf8');
 const go=worker.slice(worker.indexOf('function go(c)'),worker.indexOf('function bind()'));
 const ctx={m:{},location:{},encodeURIComponent};vm.runInNewContext(go+';this.navigate=go',ctx);
 ctx.navigate({dataset:{libraryBrand:'Royal Crown'},querySelector:()=>({textContent:'Royal Crown Laminates'})});
 assert.equal(ctx.location.href,'/brands/?brand=Royal%20Crown');
 assert.match(worker,/fetch\('\/api\/brand-directory'/);
});

test('Rainbow Door Skin remains separate from Doors in the public list and brand filters',async()=>{
 const media=[{key:'rainbow.pdf',brand:'Rainbow',category:'Door Skin',type:'pdf'},{key:'door.pdf',brand:'Rainbow',category:'Doors',type:'pdf'}];
 const directory=buildBrandDirectory(media);
 assert.deepEqual(directory[0].categories,['Door Skin','Doors']);
 assert.equal(directory[0].categoryCounts['Door Skin'],1);
 const html=await readFile(new URL('../brands/index.html',import.meta.url),'utf8'),source=html.slice(html.indexOf('const norm='),html.indexOf('function pdfCover('));
 const ctx={requested:'Rainbow',params:new URLSearchParams({category:'Door Skin'}),title:{},document:{}};vm.runInNewContext(source+';this.matches=belongs',ctx);
 assert.equal(ctx.matches(media[0]),true);assert.equal(ctx.matches(media[1]),false);
 assert.equal(ctx.matches({...media[0],category:'Doorskin'}),true);
 const env={PRODUCT_MEDIA:{list:async options=>({objects:options.prefix==='product-sync/'?[{key:'product-sync/door-skin/rainbow/catalogue.pdf',customMetadata:media[0]}]:[],truncated:false})}};
 const listed=await publicMediaList(env).then(r=>r.json());assert.equal(listed.items.find(x=>x.brand==='Rainbow').category,'Door Skin');
});

test('Saving upload aliases keeps one brand and preserves corrected labels, logos and visibility',async()=>{
 const {default:app}=await import('../worker-fast.js');let saved=null;
 const env={ADMIN_UPLOAD_TOKEN:'test-secret',PRODUCT_MEDIA:{get:async()=>saved?{text:async()=>saved}:null,put:async(key,body)=>{saved=body}}};
 const post=async body=>app.fetch(new Request('https://test/api/brands',{method:'POST',headers:{authorization:'Bearer test-secret','content-type':'application/json'},body:JSON.stringify(body)}),env,{});
 await post({item:{brand:'Ristal',label:'Ristal Laminates',src:'/ristal-logo.svg',categories:['Laminates'],railEnabled:false}});
 await post({item:{brand:'Ristal1mm'}});
 const ristal=JSON.parse(saved).items.filter(x=>x.brand==='Ristal');assert.equal(ristal.length,1);assert.equal(ristal[0].label,'Ristal Laminates');assert.equal(ristal[0].src,'/ristal-logo.svg');assert.equal(ristal[0].railEnabled,false);
 await post({action:'replace',items:[]});
 const response=await app.fetch(new Request('https://test/api/brands?scope=managed'),env,{});assert.deepEqual((await response.json()).items,[]);
 const admin=await readFile(new URL('../admin-products/index.html',import.meta.url),'utf8');const register=admin.slice(admin.indexOf('async function registerBrandName'),admin.indexOf('function clearBrandForm'));
 assert.doesNotMatch(register,/label:brand/);
});

test('Category menu shows only active admin categories, searches them and routes to matching brands',async()=>{
 const source=await readFile(new URL('../worker-hero-category-test.js',import.meta.url),'utf8');
 const patchCtx={};vm.runInNewContext(source.slice(source.indexOf('const patch='),source.indexOf('export default'))+';this.patch=patch',patchCtx);
 const script=patchCtx.patch.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
 const nodes={woodrickCategorySearch:{value:''},woodrickCategoryGroups:{innerHTML:''},woodrickCategoryStatus:{textContent:''}};
 const ctx={document:{readyState:'loading',addEventListener(){},getElementById:id=>nodes[id]},fetch:async()=>({ok:true,json:async()=>({categories:['Door Skin','Doors','Tiles','Tiles']})})};
 vm.runInNewContext(script.replace('})();',';this.menuLoad=load;this.menuRender=render;})();'),ctx);
 await ctx.menuLoad();const html=nodes.woodrickCategoryGroups.innerHTML;
 assert.match(html,/Door%20Skin/);assert.match(html,/category=Doors/);assert.doesNotMatch(html,/Plywood/);
 assert.equal((html.match(/category=Tiles/g)||[]).length,1);
 nodes.woodrickCategorySearch.value='door';ctx.menuRender();assert.doesNotMatch(nodes.woodrickCategoryGroups.innerHTML,/Tiles/);assert.match(nodes.woodrickCategoryStatus.textContent,/2 categories/);
 assert.match(script,/aria-haspopup/);assert.match(script,/dialog.showModal/);
});

test('Production homepage worker actually includes the category menu',async()=>{
 const {default:app}=await import('../worker-fast.js');
 const env={ASSETS:{fetch:async()=>new Response('<html><body><nav class="nav-inner"><div class="menu"><a href="/products/">PRODUCTS</a></div></nav></body></html>',{headers:{'content-type':'text/html'}})}};
 const response=await app.fetch(new Request('https://test/'),env,{waitUntil(){}});
 const html=await response.text();
 assert.match(html,/woodrick-category-menu-v4/);
 assert.match(html,/Browse by Category/);
});


test('Legacy Woodline Door Skin records appear with Rainbow in Door Skin without moving files',async()=>{
 const legacy={key:'product-sync/doors/woodline/woodline-door-skin.pdf',brand:'Woodline',category:'Doors',catalogue:'Woodline Door Skin',type:'pdf'};
 const directory=buildBrandDirectory([legacy,{key:'rainbow.pdf',brand:'Rainbow',category:'Door Skin'}]);
 assert.deepEqual(directory.filter(x=>x.categories.includes('Door Skin')).map(x=>x.brand),['Woodline','Rainbow']);
 assert.equal(directory[0].categoryCounts['Door Skin'],1);
 assert.ok(!directory[0].categories.includes('Doors'));
 assert.ok(buildBrandDirectory([{...legacy,key:'woodline-door.pdf',catalogue:'Woodline Doors'}])[0].categories.includes('Doors'));
 const env={PRODUCT_MEDIA:{list:async options=>({objects:options.prefix==='product-sync/'?[{key:legacy.key,customMetadata:legacy}]:[],truncated:false})}};
 const result=await publicMediaList(env).then(r=>r.json());
 const item=result.items.find(x=>x.brand==='Woodline');assert.equal(item.category,'Door Skin');assert.equal(item.key,legacy.key);
 const {default:app}=await import('../worker-fast.js');
 env.PRODUCT_MEDIA.get=async()=>({uploaded:new Date(),text:async()=>JSON.stringify({items:[legacy],total:1})});
 const indexed=await app.fetch(new Request('https://test/api/media'),env,{}).then(r=>r.json());
 assert.equal(indexed.items.find(x=>x.brand==='Woodline').category,'Door Skin');
});
