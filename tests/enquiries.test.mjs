import test from 'node:test';
import assert from 'node:assert/strict';
import {handleEnquiries} from '../worker-enquiries.js';

function bucket(){
  const data=new Map();return {data,
    async get(key){return data.has(key)?{text:async()=>data.get(key)}:null},
    async put(key,value){data.set(key,String(value))},
    async list({prefix,limit,cursor}){const keys=[...data.keys()].filter(key=>key.startsWith(prefix)).sort(),offset=cursor?keys.indexOf(cursor)+1:0,objects=keys.slice(offset,offset+limit).map(key=>({key}));return {objects,truncated:offset+limit<keys.length,cursor:objects.at(-1)?.key}}
  };
}
function request(method='GET',body,headers={}){return new Request('https://woodrickhomes.com/api/enquiries',{method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})})}
test('enquiry is saved privately and can only be listed by admin',async()=>{
  const storage=bucket(),env={PRODUCT_MEDIA:storage,ADMIN_UPLOAD_TOKEN:'test-admin'};
  const result=await handleEnquiries(request('POST',{name:'Customer',mobile:'9415324839',city:'Gorakhpur',requirement:'Plywood',message:'18 mm'}),env);
  assert.equal(result.status,201);const saved=await result.json();assert.ok(saved.id);
  assert.equal((await handleEnquiries(request(),env)).status,401);
  const response=await handleEnquiries(request('GET',null,{authorization:'Bearer test-admin'}),env);
  const list=await response.json();assert.equal(list.items.length,1);assert.equal(list.items[0].id,saved.id);
  assert.equal(list.items[0].mobile,'9415324839');
  assert.equal([...storage.data.keys()].filter(k=>k.startsWith('private/enquiries/records/')).length,1);
});
test('invalid mobile, cross-origin request and missing storage never report success',async()=>{
  const env={PRODUCT_MEDIA:bucket(),ADMIN_UPLOAD_TOKEN:'test-admin'};
  assert.equal((await handleEnquiries(request('POST',{name:'A',mobile:'123'}),env)).status,400);
  assert.equal((await handleEnquiries(request('POST',{name:'Customer',mobile:'9415324839'},{origin:'https://elsewhere.example'}),env)).status,403);
  assert.equal((await handleEnquiries(request('POST',{name:'Customer',mobile:'9415324839'}),{},)).status,503);
});
test('admin can page through more than 100 private enquiries',async()=>{
  const storage=bucket(),env={PRODUCT_MEDIA:storage,ADMIN_UPLOAD_TOKEN:'test-admin'};
  for(let i=0;i<105;i++)storage.data.set('private/enquiries/records/'+String(i).padStart(4,'0')+'.json',JSON.stringify({id:String(i),name:'Customer '+i,createdAt:'2026-09-28T00:00:00Z'}));
  const first=await (await handleEnquiries(request('GET',null,{authorization:'Bearer test-admin'}),env)).json();
  assert.equal(first.items.length,100);assert.equal(first.truncated,true);
  const next=await (await handleEnquiries(new Request('https://woodrickhomes.com/api/enquiries?cursor='+encodeURIComponent(first.cursor),{headers:{authorization:'Bearer test-admin'}}),env)).json();
  assert.equal(next.items.length,5);assert.equal(next.truncated,false);
});
