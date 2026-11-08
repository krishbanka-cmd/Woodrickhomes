import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../worker-fast.js';

test('Completed Projects serves canonical asset HTML instead of a stripped index redirect',async()=>{
 const html=await readFile(new URL('../admin-products/projects/index.html',import.meta.url),'utf8');
 const paths=[];
 const pageEnv={ADMIN_UPLOAD_TOKEN:'route-test-only',ASSETS:{fetch:async req=>{
  const path=new URL(req.url).pathname;paths.push(path);
  // Workers Assets redirects explicit index.html to the directory URL.
  if(path.endsWith('/index.html'))return new Response(null,{status:307,headers:{location:'/admin-products/projects/'}});
  return new Response(html,{headers:{'content-type':'text/html;charset=utf-8'}});
 }}};
 for(const path of ['/admin-products/projects/','/admin-products/projects','/admin-products/projects/index.html']){
  const r=await worker.fetch(new Request('https://example.com'+path,{headers:{authorization:'Bearer route-test-only'}}),pageEnv,{});
  assert.equal(r.status,200);
  assert.match(await r.text(),/Upload photos and videos/);
  assert.equal(r.headers.get('cache-control'),'private, no-store');
 }
 assert.ok(paths.every(p=>p==='/admin-products/projects/'));
 const blocked=await worker.fetch(new Request('https://example.com/admin-products/projects/'),pageEnv,{});
 assert.equal(blocked.status,302);assert.equal(blocked.headers.get('location'),'https://example.com/admin-products/');
});

test('Project page preserves asset redirects rather than returning a blank redirect without Location',async()=>{
 const r=await worker.fetch(new Request('https://example.com/admin-products/projects/',{headers:{authorization:'Bearer route-test-only'}}),{ADMIN_UPLOAD_TOKEN:'route-test-only',ASSETS:{fetch:async()=>new Response(null,{status:307,headers:{location:'/canonical-projects/'}})}},{});
 assert.equal(r.status,307);assert.equal(r.headers.get('location'),'/canonical-projects/');
});
const source=await readFile(new URL('../worker-completed-projects.js',import.meta.url),'utf8');
const {handleProjects}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const id='12345678-1234-1234-1234-123456789abc';
const objects=new Map();
const env={PRODUCT_MEDIA:{async get(k){const v=objects.get(k);return v===undefined?null:{json:async()=>JSON.parse(v)}},async list(){return {objects:[...objects.keys()].map(key=>({key})),truncated:false}},async put(k,v){objects.set(k,v)},async delete(k){objects.delete(k)}}};
const auth=async r=>r.headers.get('authorization')==='Bearer test';
const req=(path,opts={})=>new Request('https://example.com'+path,opts);
test('admin CRUD, draft privacy, architect credit and upload validation',async()=>{
 let r=await handleProjects(req('/api/projects',{method:'POST',body:new FormData()}),env,auth);assert.equal(r.status,401);
 function form(published=false){const f=new FormData();f.set('name','Kitchen');f.set('doneBy','Architect A');f.set('firm','Studio A');f.set('published',String(published));return f}
 r=await handleProjects(req('/api/projects',{method:'POST',headers:{authorization:'Bearer test'},body:form()}),env,auth);assert.equal(r.status,200);const p=(await r.json()).project;
 assert.equal(p.doneBy,'Architect A');assert.equal(p.firm,'Studio A');
 r=await handleProjects(req('/api/projects'),env,auth);assert.equal((await r.json()).items.length,0);
 r=await handleProjects(req('/api/projects?admin=1'),env,auth);assert.equal(r.status,401);
 const f=form(true);f.set('id',p.id);r=await handleProjects(req('/api/projects',{method:'POST',headers:{authorization:'Bearer test'},body:f}),env,auth);assert.equal(r.status,200);
 r=await handleProjects(req('/api/projects'),env,auth);assert.equal((await r.json()).items[0].doneBy,'Architect A');
 const bad=form();bad.append('files',new Blob(['<svg/>'],{type:'image/svg+xml'}),'bad.svg');r=await handleProjects(req('/api/projects',{method:'POST',headers:{authorization:'Bearer test'},body:bad}),env,auth);assert.equal(r.status,400);
 r=await handleProjects(req('/api/projects',{method:'POST',headers:{authorization:'Bearer test',origin:'https://evil.example'},body:form()}),env,auth);assert.equal(r.status,403);
 r=await handleProjects(req('/api/projects?id='+p.id,{method:'DELETE',headers:{authorization:'Bearer test'}}),env,auth);assert.equal(r.status,200);
 assert.equal(objects.size,0);
});
