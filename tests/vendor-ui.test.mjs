import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function adminHarness(){
 const source=await readFile(new URL('../assets/vendor-panel.js',import.meta.url),'utf8');
 const rows={children:[],classList:{toggle(){}},replaceChildren(...items){this.children=items},append(item){this.children.push(item)}};
 const controls={'admin-items':rows,'status-filter':{value:''},search:{value:''},'admin-more':{hidden:true}},pending=[],messages=[];
 const context={syncVendorViews(){},URLSearchParams,$:id=>controls[id],node:(tag,text)=>({tag,text}),vendorCard:item=>({kind:'vendor',id:item.id}),productCard:item=>({kind:'product',id:item.id}),message:(id,text)=>messages.push(text),location:{href:''},api:url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject}))};
 vm.createContext(context);vm.runInContext("let adminTab='vendors',adminCursor=null,loading=false,adminLoading=false,adminLoadVersion=0;"+source.slice(source.indexOf('async function loadAdmin('),source.indexOf('async function adminPage(')),context);
 return {context,rows,pending,messages,controls,load:more=>context.loadAdmin(more),tab:value=>vm.runInContext('adminTab='+JSON.stringify(value),context)};
}

test('Rapid vendor/product switching keeps the newest tab response and ignores an older response',async()=>{
 const h=await adminHarness(),old=h.load(false);h.tab('products');const latest=h.load(false);
 assert.equal(h.pending.length,2,'new tab must request its own data while old request is pending');
 assert.match(h.pending[1].url,/vendor-applications\/products/);
 h.pending[1].resolve({items:[{id:'product-1'}],cursor:null});await latest;
 h.pending[0].resolve({items:[{id:'vendor-1'}],cursor:'obsolete'});await old;
 assert.equal(h.rows.children.length,1);assert.equal(h.rows.children[0].kind,'product');assert.equal(h.rows.children[0].id,'product-1');assert.equal(h.controls['admin-more'].hidden,true);
 assert.deepEqual(h.messages,['1 products loaded.']);
});

test('An obsolete admin error does not replace the current tab with an error or login redirect',async()=>{
 const h=await adminHarness(),old=h.load(false);h.tab('products');const latest=h.load(false);
 assert.equal(h.pending.length,2);h.pending[1].resolve({items:[],cursor:null});await latest;
 const error=new Error('Old request expired');error.status=401;h.pending[0].reject(error);await old;
 assert.equal(h.context.location.href,'');assert.deepEqual(h.messages,['0 products loaded.']);
});

test('Load more cannot duplicate a pending page, and refresh can supersede it',async()=>{
 const h=await adminHarness();const initial=h.load(false);h.pending[0].resolve({items:[{id:'vendor-1'}],cursor:'next'});await initial;
 const more=h.load(true);await h.load(true);assert.equal(h.pending.length,2);
 const refreshed=h.load(false);assert.equal(h.pending.length,3);h.pending[2].resolve({items:[{id:'vendor-new'}],cursor:null});await refreshed;
 h.pending[1].resolve({items:[{id:'vendor-old'}],cursor:null});await more;
 assert.equal(h.rows.children.length,1);assert.equal(h.rows.children[0].id,'vendor-new');
});

async function catalogueHarness(failPart){
 const source=await readFile(new URL('../assets/vendor-panel.js',import.meta.url),'utf8'),posts=[],parts=[],messages=[];let attempts=0;
 const context={TextDecoder,post:async(url,body)=>{posts.push({url,body});return url.endsWith('/start')?{id:'upload-test',partSize:8*1024*1024,total:Math.ceil(body.size/(8*1024*1024))}:{ok:true}},api:async(url,options)=>{parts.push({url,size:options.body.size});if(failPart&&attempts++===0)throw Object.assign(new Error('Network error'),{status:failPart});return {ok:true}},message:(id,text)=>messages.push(text),setTimeout:fn=>fn()};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('async function uploadCatalogue('),source.indexOf('async function submitVendorProduct(')),context);
 const file=size=>({name:'test.pdf',size,slice:(start,end)=>({size:Math.min(end,size)-start,arrayBuffer:async()=>new TextEncoder().encode('%PDF-').buffer})});
 return {posts,parts,messages,upload:size=>context.uploadCatalogue(file(size),'product-test',0)};
}
test('500 MB client upload sends bounded parts and reports progress before completion',async()=>{
 const h=await catalogueHarness();assert.equal(await h.upload(500*1024*1024),'upload-test');assert.equal(h.parts.length,63);assert.ok(h.parts.every(p=>p.size<=8*1024*1024));assert.equal(h.parts.at(-1).size,4*1024*1024);assert.match(h.messages.at(-1),/100%/);assert.match(h.posts.at(-1).url,/complete/);
 const tooLarge=await catalogueHarness();await assert.rejects(()=>tooLarge.upload(500*1024*1024+1),/500 MB/);assert.equal(tooLarge.posts.length,0);
});
test('Client retries a failed part and aborts immediately for authentication failures',async()=>{
 const transient=await catalogueHarness(503);await transient.upload(21*1024*1024);assert.equal(transient.parts.length,4);assert.equal(transient.parts[0].url,transient.parts[1].url);
 const unauthorized=await catalogueHarness(401);await assert.rejects(()=>unauthorized.upload(21*1024*1024),/Network error/);assert.equal(unauthorized.parts.length,1);assert.match(unauthorized.posts.at(-1).url,/abort/);
});


test('Vendor status lists request the selected status and ignore an earlier list response',async()=>{
 const h=await adminHarness();h.controls['status-filter'].value='pending';const pending=h.load(false);
 assert.match(h.pending[0].url,/status=pending/);
 h.controls['status-filter'].value='approved';const approved=h.load(false);assert.match(h.pending[1].url,/status=approved/);
 h.pending[1].resolve({items:[{id:'approved-vendor'}],cursor:null});await approved;
 h.pending[0].resolve({items:[{id:'pending-vendor'}],cursor:null});await pending;
 assert.equal(h.rows.children[0].id,'approved-vendor');
 h.controls['status-filter'].value='';const all=h.load(false);assert.doesNotMatch(h.pending[2].url,/status=/);
 h.pending[2].resolve({items:[],cursor:null});await all;
});

test('Vendor login dialog stays compact, accessible, and preserves standalone vendor dashboard',async()=>{
 const popup=await readFile(new URL('../assets/vendor-login.js',import.meta.url),'utf8');
 const vendor=await readFile(new URL('../vendor/index.html',import.meta.url),'utf8');
 const styles=await readFile(new URL('../assets/vendor-panel.css',import.meta.url),'utf8');
 const home=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(popup,/width:min\(560px,calc\(100vw - 28px\)\)/);
 assert.match(popup,/height:min\(570px,calc\(100dvh - 92px\)\)/);
 assert.match(popup,/Close vendor login/);
 assert.match(vendor,/window\.parent!==window/);
 assert.match(styles,/html\.vendor-embedded \.top\{display:none!important\}/);
 assert.match(vendor,/vendor-panel\.css\?v=20261009-contentfit/);
 assert.match(styles,/html\.vendor-embedded #password-status:empty\{display:none\}/);
 assert.match(home,/vendor-login\.js\?v=20261009-contentfit/);
 assert.match(popup,/position:fixed;inset:auto;top:50%;left:50%;right:auto;bottom:auto;transform:translate\(-50%,-50%\);margin:0/);
});

test('Vendor modal stays within the visible area between site header and brand rail',async()=>{
 const source=await readFile(new URL('../assets/vendor-login.js',import.meta.url),'utf8');
 const elements=[],handlers={};
 const document={
  documentElement:{clientHeight:720},
  createElement(tag){
   const el={tag,open:false,style:{},setAttribute(){},append(){},close(){this.open=false},showModal(){this.open=true}};
   elements.push(el);return el;
  },
  body:{append(){}},
  addEventListener(type,fn){handlers[type]=fn},
  querySelector(selector){
   if(selector==='header.nav')return {getBoundingClientRect:()=>({top:28,bottom:130})};
   if(selector==='.hero-brand-dock')return {getBoundingClientRect:()=>({top:600,bottom:705})};
   return null;
  }
 };
 const window={innerHeight:720,addEventListener(type,fn){handlers['window-'+type]=fn}};
 const location={origin:'https://woodrickhomes.com',href:''};
 vm.runInNewContext(source,{document,window,location});
 const dialog=elements.find(x=>x.tag==='dialog'),frame=elements.find(x=>x.tag==='iframe');
 let prevented=false;
 handlers.click({target:{closest:()=>({})},preventDefault(){prevented=true}});
 assert.equal(prevented,true);
 assert.equal(dialog.open,true);
 assert.equal(frame.src,'/vendor/');
 assert.equal(dialog.style.top,'365px');
 assert.equal(dialog.style.maxHeight,'446px');
 assert.equal(frame.style.height,'394px');
 assert.equal(365-446/2,142,'dialog must start below navigation');
 assert.equal(365+446/2,588,'dialog must end above the brand rail');
});

test('Embedded vendor login adjusts its height to content while clearing header and rail',async()=>{
 const source=await readFile(new URL('../assets/vendor-login.js',import.meta.url),'utf8');
 const elements=[],handlers={};
 const document={
  documentElement:{clientHeight:720},
  createElement(tag){
   const el={tag,open:false,offsetHeight:tag==='div'?52:0,style:{},setAttribute(){},append(){},close(){this.open=false},showModal(){this.open=true}};
   elements.push(el);return el;
  },
  body:{append(){}},
  addEventListener(type,fn){handlers[type]=fn},
  querySelector(selector){
   if(selector==='header.nav')return {getBoundingClientRect:()=>({top:28,bottom:130})};
   if(selector==='.hero-brand-dock')return {getBoundingClientRect:()=>({top:600,bottom:705})};
   return null;
  }
 };
 const window={innerHeight:720,addEventListener(){}};
 const location={origin:'https://woodrickhomes.com',href:''};
 vm.runInNewContext(source,{document,window,location});
 const dialog=elements.find(x=>x.tag==='dialog'),frame=elements.find(x=>x.tag==='iframe');
 handlers.click({target:{closest:()=>({})},preventDefault(){}});
 frame.contentDocument={querySelector:selector=>selector==='main'?{
  scrollHeight:334,getBoundingClientRect:()=>({top:5,bottom:339})
 }:null};
 frame.onload();
 assert.equal(dialog.style.maxHeight,'395px');
 assert.equal(frame.style.height,'343px');
 assert.equal(dialog.style.top,'365px');
 assert.equal(365-395/2>130,true);
 assert.equal(365+395/2<600,true);
});

test('Entire vendor browser script parses and initializes clickable password/OTP tabs',async()=>{
 const source=await readFile(new URL('../assets/vendor-panel.js',import.meta.url),'utf8');
 assert.doesNotThrow(()=>new vm.Script(source),'vendor login JavaScript must parse without stray semicolons before else');
 const tabSource=source.slice(source.indexOf('function setupVendorAuthTabs()'),source.indexOf('(async()=>{try'));
 assert.ok(tabSource.includes('function setupVendorAuthTabs()'));
 const controls=new Map();
 function control(id){if(!controls.has(id))controls.set(id,{hidden:false,type:'password',textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(event,fn){this[event]=fn}});return controls.get(id)}
 const buttons=['password','otp'].map(mode=>({dataset:{vendorAuthTab:mode},attrs:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v},addEventListener(type,fn){this[type]=fn}}));
 const context={document:{querySelectorAll(selector){assert.equal(selector,'[data-vendor-auth-tab]');return buttons}},$:control};
 vm.createContext(context);vm.runInContext(tabSource+';this.setupVendorAuthTabs=setupVendorAuthTabs',context);
 context.setupVendorAuthTabs();
 assert.equal(control('password-login').hidden,false);
 assert.equal(control('otp-login-panel').hidden,true);
 buttons[1].click();
 assert.equal(control('password-login').hidden,true);
 assert.equal(control('otp-login-panel').hidden,false);
 assert.equal(buttons[1].attrs['aria-selected'],'true');
 buttons[0].click();
 assert.equal(control('password-login').hidden,false);
 assert.equal(control('otp-login-panel').hidden,true);
});

test('Unavailable OTP has a clear first-login support fallback and working link',async()=>{
 const source=await readFile(new URL('../assets/vendor-panel.js',import.meta.url),'utf8');
 const vendor=await readFile(new URL('../vendor/index.html',import.meta.url),'utf8');
 assert.ok(vendor.includes('vendor-panel.js?v=20261009-otpfix'));
 const block=source.slice(source.indexOf('async function configureOTP()'),source.indexOf('async function applyPage()'));
 assert.ok(block.includes('Mobile OTP is not active yet'));
 assert.ok(block.includes('First login / Forgot password'));
 assert.ok(block.includes('https://wa.me/919415324839'));
});
