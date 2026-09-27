import test from 'node:test';
import assert from 'node:assert/strict';
import {createVendorSession,handleVendorProducts} from '../worker-vendor-products.js';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SECRET='test-only-secret-with-at-least-32-characters';
function storage(){
  const data=new Map();
  return {
    data,
    async get(key){return data.has(key)?{text:async()=>data.get(key)}:null},
    async put(key,value){data.set(key,String(value))},
    async list({prefix,limit,cursor}){
      const keys=[...data.keys()].filter(key=>key.startsWith(prefix)).sort();
      const offset=cursor?keys.indexOf(cursor)+1:0,objects=keys.slice(offset,offset+limit).map(key=>({key}));
      return {objects,truncated:offset+limit<keys.length,cursor:objects.at(-1)?.key};
    }
  };
}
function request(path,{token,admin,method='GET',body}={}){
  return new Request('https://woodrickhomes.com'+path,{
    method,
    headers:{...(token?{cookie:'woodrick_vendor='+token}:{}),...(admin?{authorization:'Bearer admin-test'}:{}),...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
}
test('only approved vendor can submit and only sees their own proposals',async()=>{
  const bucket=storage(),env={PRODUCT_MEDIA:bucket,VENDOR_SESSION_SECRET:SECRET,ADMIN_UPLOAD_TOKEN:'admin-test'};
  bucket.data.set('private/vendors/records/'+A+'.json',JSON.stringify({id:A,status:'approved'}));
  bucket.data.set('private/vendors/records/'+B+'.json',JSON.stringify({id:B,status:'pending'}));
  const tokenA=await createVendorSession(A,SECRET),tokenB=await createVendorSession(B,SECRET);
  assert.equal((await handleVendorProducts(request('/api/vendor-products',{token:tokenB}),env)).status,401);
  const create=await handleVendorProducts(request('/api/vendor-products',{token:tokenA,method:'POST',body:{title:'Laminated board',brand:'Ristal',category:'Laminates',sku:'R-001',vendorId:B}}),env);
  assert.equal(create.status,201);
  const submitted=await create.json();assert.equal(submitted.public,false);
  const owned=await (await handleVendorProducts(request('/api/vendor-products',{token:tokenA}),env)).json();
  assert.equal(owned.items.length,1);assert.equal(owned.items[0].vendorId,A);assert.equal(owned.items[0].status,'pending');
  assert.equal((await handleVendorProducts(request('/api/vendor-products'),env)).status,401);
  assert.equal((await handleVendorProducts(request('/api/vendor-products',{token:tokenA.slice(0,-1)+'X'}),env)).status,401);
  const review=await handleVendorProducts(request('/api/vendor-products/admin/status',{admin:true,method:'POST',body:{vendorId:A,id:submitted.id,status:'approved'}}),env);
  assert.equal((await review.json()).public,false);
  const adminList=await (await handleVendorProducts(request('/api/vendor-products/admin',{admin:true}),env)).json();
  assert.equal(adminList.items.length,1);
  bucket.data.set('private/vendors/records/'+A+'.json',JSON.stringify({id:A,status:'rejected'}));
  assert.equal((await handleVendorProducts(request('/api/vendor-products',{token:tokenA}),env)).status,401);
});
test('sessions expire and correction reason is required',async()=>{
  const bucket=storage(),env={PRODUCT_MEDIA:bucket,VENDOR_SESSION_SECRET:SECRET,ADMIN_UPLOAD_TOKEN:'admin-test'};
  bucket.data.set('private/vendors/records/'+A+'.json',JSON.stringify({id:A,status:'approved'}));
  const expired=await createVendorSession(A,SECRET,Date.now()-9*60*60*1000);
  assert.equal((await handleVendorProducts(request('/api/vendor-products',{token:expired}),env)).status,401);
  const token=await createVendorSession(A,SECRET);
  const created=await (await handleVendorProducts(request('/api/vendor-products',{token,method:'POST',body:{title:'Plywood',brand:'CenturyPly',category:'Plywood',sku:'CP-01'}}),env)).json();
  const response=await handleVendorProducts(request('/api/vendor-products/admin/status',{admin:true,method:'POST',body:{vendorId:A,id:created.id,status:'correction_required'}}),env);
  assert.equal(response.status,400);
});
