import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
