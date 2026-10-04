import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function adminHarness(){
 const source=await readFile(new URL('../assets/vendor-panel.js',import.meta.url),'utf8');
 const rows={children:[],classList:{toggle(){}},replaceChildren(...items){this.children=items},append(item){this.children.push(item)}};
 const controls={'admin-items':rows,'status-filter':{value:''},search:{value:''},'admin-more':{hidden:true}},pending=[],messages=[];
 const context={URLSearchParams,$:id=>controls[id],node:(tag,text)=>({tag,text}),vendorCard:item=>({kind:'vendor',id:item.id}),productCard:item=>({kind:'product',id:item.id}),message:(id,text)=>messages.push(text),location:{href:''},api:url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject}))};
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
