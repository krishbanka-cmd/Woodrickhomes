import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {File} from 'node:buffer';
import app from '../worker-fast.js';

class TestBucket{
 constructor(){this.map=new Map()}
 async get(key){const item=this.map.get(key);if(!item)return null;return {etag:item.etag,text:async()=>item.text,json:async()=>JSON.parse(item.text),body:new Blob([item.text]).stream()}}
 async put(key,value,options={}){
  const current=this.map.get(key);
  if(options.onlyIf?.etagDoesNotMatch==='*'&&current)return null;
  if(options.onlyIf?.etagMatches&&options.onlyIf.etagMatches!==current?.etag)return null;
  const text=typeof value==='string'?value:JSON.stringify(value);
  const record={text,etag:crypto.randomUUID()};this.map.set(key,record);return {etag:record.etag}
 }
 async list({prefix=''}){return {objects:[...this.map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false}}
 async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])this.map.delete(key)}
}
const env=()=>({PRODUCT_MEDIA:new TestBucket(),ADMIN_UPLOAD_TOKEN:'unit-test-key'});
async function request(environment,path,body,opts={}){
 const headers={origin:'https://website.test','content-type':'application/json','cf-connecting-ip':opts.ip||'203.0.113.11'};
 if(opts.admin)headers.authorization='Bearer '+environment.ADMIN_UPLOAD_TOKEN;
 const response=await app.fetch(new Request('https://website.test'+path,{method:body?'POST':'GET',headers,...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})}),environment,{waitUntil(p){p.catch(()=>{})}});
 return {status:response.status,body:await response.json()};
}
test('Quick vendor registration privately captures a consented mobile without creating an approved account',async()=>{
 const e=env(),body={name:'Sample Contact',mobile:'9876543210',consent:true};
 const result=await request(e,'/api/vendor/lead',body);
 assert.equal(result.status,200);assert.equal(result.body.received,true);
 const records=[...e.PRODUCT_MEDIA.map.entries()].filter(([k])=>k.startsWith('private/vendors/leads/'));
 assert.equal(records.length,1);
 const lead=JSON.parse(records[0][1].text);
 assert.equal(lead.name,'Sample Contact');assert.equal(lead.mobile,body.mobile);
 assert.equal(lead.status,'incomplete');assert.equal(lead.fullApplicationId,'');
 assert.equal(e.PRODUCT_MEDIA.map.has('private/vendors/backup/leads/'+lead.id+'.json'),true);
 assert.equal((await request(e,'/api/vendor-applications',null,{admin:true})).body.items.length,0);
 const retry=await request(e,'/api/vendor/lead',{...body,name:'Sample Contact Updated'});
 assert.equal(retry.status,200);
 assert.equal([...e.PRODUCT_MEDIA.map.keys()].filter(k=>k.startsWith('private/vendors/leads/')).length,1,'same phone must not duplicate leads');
 assert.equal(JSON.parse(e.PRODUCT_MEDIA.map.get(records[0][0]).text).name,'Sample Contact Updated');
});

test('Quick lead requires contact consent, valid mobile, and is rate limited',async()=>{
 const e=env();
 for(const body of [
  {name:'Sample Contact',mobile:'123',consent:true},
  {name:'Sample Contact',mobile:'9876543210',consent:false},
  {name:'S',mobile:'9876543210',consent:true},
  {name:'Sample Contact',mobile:'9876543210',consent:true,website:'website spam'}
 ])assert.equal((await request(e,'/api/vendor/lead',body)).status,400);
 assert.equal(e.PRODUCT_MEDIA.map.size,0);
 for(let i=0;i<4;i++)assert.equal((await request(e,'/api/vendor/lead',{name:'Test Person',mobile:'9876543210',consent:true})).status,200);
 assert.equal((await request(e,'/api/vendor/lead',{name:'Test Person',mobile:'9876543210',consent:true})).status,429);
});

test('Final application changes quick lead to submitted and keeps public vendor safeguards',async()=>{
 const e=env(),number='9876543210';
 await request(e,'/api/vendor/lead',{name:'Supplier Contact',mobile:number,consent:true});
 const form=new FormData();
 for(const [k,v] of Object.entries({business:'Example Suppliers',contact:'Supplier Contact',mobile:number,whatsapp:'9123456789',city:'Gorakhpur',category:'Laminates'}))form.set(k,v);
 form.set('file',new File(['%PDF-1.7\nTest PDF bytes'],'registration.pdf',{type:'application/pdf'}));
 const response=await app.fetch(new Request('https://website.test/api/vendor-applications',{method:'POST',headers:{origin:'https://website.test','cf-connecting-ip':'203.0.113.30'},body:form}),e,{waitUntil(p){p.catch(()=>{})}});
 assert.equal(response.status,201,await response.clone().text());
 const created=await response.json();
 assert.equal(created.vendor.status,'pending');
 assert.equal(created.vendor.mobileVerified,false);
 assert.equal(created.vendor.whatsapp,'9123456789');
 const leadEntry=[...e.PRODUCT_MEDIA.map.entries()].find(([key])=>key.startsWith('private/vendors/leads/'));
 const lead=JSON.parse(leadEntry[1].text);
 assert.equal(lead.status,'submitted');assert.equal(lead.fullApplicationId,created.id);
 const queue=JSON.parse(e.PRODUCT_MEDIA.map.get('private/vendors/backup/leads/'+lead.id+'.json').text);
 assert.equal(queue.kind,'lead');assert.equal(queue.event.status,'submitted');
 assert.equal((await request(e,'/api/vendor/lead',{name:'Supplier Contact',mobile:number,consent:true})).status,200);
 assert.equal(JSON.parse(e.PRODUCT_MEDIA.map.get(leadEntry[0]).text).status,'submitted');
});

test('Quick form is displayed first; full form popup requires successful save, and Sheet uses Vendor Leads tab',async()=>{
 const [html,script,sheet]=await Promise.all([
  readFile(new URL('../become-a-vendor/index.html',import.meta.url),'utf8'),
  readFile(new URL('../assets/vendor-panel.js',import.meta.url),'utf8'),
  readFile(new URL('../google-apps-script/vendor-backup.gs',import.meta.url),'utf8')]);
 assert.match(html,/id="vendor-quick-form"/);
 assert.match(html,/id="quick-name"/);assert.match(html,/id="quick-mobile"/);
 assert.match(html,/id="complete-registration-dialog"/);
 assert.match(html,/id="application-form"/);
 assert.match(html,/id="whatsapp"/);assert.match(html,/id="same-whatsapp"/);
 assert.ok(html.indexOf('id="vendor-quick-form"')<html.indexOf('id="complete-registration-dialog"'));
 assert.match(script,/await post\('\/api\/vendor\/lead'/);
 assert.ok(script.indexOf("await post('/api/vendor/lead'")<script.indexOf('dialog.showModal()'));
 assert.match(sheet,/Vendor Leads/);
 assert.match(sheet,/followUpStatus/);
 assert.match(sheet,/remark/);
 assert.match(sheet,/fullApplicationId/);
 assert.match(sheet,/dateColumn = headers.indexOf\('updatedAt'\)/);
});

test('Quick registration opens full-form popup only after lead API succeeds',async()=>{
 const source=await readFile(new URL('../assets/vendor-panel.js',import.meta.url),'utf8');
 const script=source.slice(source.indexOf('function setupQuickVendorLead(){'),source.indexOf('async function applyPage()'));
 assert.ok(script.startsWith('function setupQuickVendorLead(){'));
 let saved=null,shown=0,closed=0;
 const fields={contact:{value:''},mobile:{value:'',readOnly:false}};
 const dialog={showModal(){shown++},close(){closed++}};
 const submit={disabled:false,textContent:'Submit & continue'};
 const quick={elements:{website:{value:''}},querySelector:()=>submit,addEventListener(type,fn){this[type]=fn}};
 const full={elements:{namedItem:key=>fields[key]}};
 const same={checked:true,addEventListener(type,fn){this[type]=fn}};
 const wa={value:'',readOnly:false};
 const values={
  'vendor-quick-form':quick,
  'complete-registration-dialog':dialog,
  'application-form':full,
  'same-whatsapp':same,
  'whatsapp':wa,
  'mobile':fields.mobile,
  'close-registration-dialog':{addEventListener(type,fn){this[type]=fn}},
  'quick-name':{value:'Sample Vendor'},
  'quick-mobile':{value:'9876543210'},
  'quick-consent':{checked:true},
  'verify-mobile':{value:''}
 };
 const ctx={ $:name=>values[name],setField:(form,key,value)=>{form.elements.namedItem(key).value=value},
  message(){},busy:async(button,work)=>work(),
  post:async(path,body)=>{saved={path,body};assert.equal(shown,0,'popup must not open before lead is saved');return {ok:true}} };
 const {runInNewContext}=await import('node:vm');
 runInNewContext(script+';this.install=setupQuickVendorLead',ctx);
 ctx.install();
 await quick.submit({preventDefault(){}});
 assert.equal(saved.path,'/api/vendor/lead');
 assert.deepEqual(JSON.parse(JSON.stringify(saved.body)),{name:'Sample Vendor',mobile:'9876543210',consent:true,website:''});
 assert.equal(shown,1);assert.equal(fields.contact.value,'Sample Vendor');assert.equal(fields.mobile.value,'9876543210');
 assert.equal(wa.value,'9876543210');assert.equal(wa.readOnly,true);
});
test('Homepage vendor login links out to full-size quick registration page',async()=>{
 const html=await readFile(new URL('../vendor/index.html',import.meta.url),'utf8');
 assert.match(html,/href="\/become-a-vendor\/" target="_top"/);
});
