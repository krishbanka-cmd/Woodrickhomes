const prefix='private/completed-projects/';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const valid=id=>/^[a-f0-9-]{36}$/.test(id);
async function record(env,id){const o=await env.PRODUCT_MEDIA.get(prefix+id+'/record.json');return o?o.json():null}
async function records(env){let cursor,items=[];do{const page=await env.PRODUCT_MEDIA.list({prefix,cursor});for(const o of page.objects)if(o.key.endsWith('/record.json')){const r=await env.PRODUCT_MEDIA.get(o.key);if(r)items.push(await r.json())}cursor=page.truncated?page.cursor:undefined}while(cursor);return items.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}
export async function handleProjects(request,env,authorized){
 const u=new URL(request.url),admin=await authorized(request,env);
 if(!env.PRODUCT_MEDIA)return json({error:'Project storage unavailable'},503);
 try{
 if(u.pathname==='/api/projects/media'){
  if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);
  const id=u.searchParams.get('project'),file=u.searchParams.get('file');if(!valid(id||''))return json({error:'Not found'},404);
  const p=await record(env,id),m=p?.media.find(m=>m.id===file);if(!p||!m||(!p.published&&!admin))return json({error:'Not found'},404);
  const key=prefix+id+'/'+m.id,head=await env.PRODUCT_MEDIA.head(key);if(!head)return json({error:'Not found'},404);
  const range=request.headers.get('range'),o=await env.PRODUCT_MEDIA.get(key,range?{range:request.headers}:undefined);if(!o)return json({error:'Not found'},404);
  const h=new Headers({'content-type':m.type,'cache-control':'private, no-store','accept-ranges':'bytes','x-content-type-options':'nosniff'});let status=200;
  if(o.range){h.set('content-range',`bytes ${o.range.offset}-${o.range.offset+o.range.length-1}/${head.size}`);h.set('content-length',o.range.length);status=206}else h.set('content-length',head.size);
  return new Response(request.method==='HEAD'?null:o.body,{status,headers:h});
 }
 if(request.method==='GET'){if(u.searchParams.get('admin')==='1'&&!admin)return json({error:'Admin login required'},401);return json({items:(await records(env)).filter(p=>admin&&u.searchParams.get('admin')==='1'||p.published)})}
 if(!admin)return json({error:'Admin login required'},401);
 const origin=request.headers.get('origin');if(origin&&origin!==u.origin)return json({error:'Invalid origin'},403);
 if(request.method==='DELETE'){
  const id=u.searchParams.get('id');if(!valid(id||''))return json({error:'Invalid project'},400);
  const p=await record(env,id);if(!p)return json({error:'Project not found'},404);
  await env.PRODUCT_MEDIA.delete(prefix+id+'/record.json');for(const m of p.media)await env.PRODUCT_MEDIA.delete(prefix+id+'/'+m.id);return json({ok:true});
 }
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(Number(request.headers.get('content-length')||0)>100*1024*1024)return json({error:'Maximum upload is 100 MB per save'},413);
 const f=await request.formData(),id=String(f.get('id')||crypto.randomUUID());if(!valid(id))return json({error:'Invalid project'},400);
 const old=await record(env,id);if(f.get('id')&&!old)return json({error:'Project not found'},404);
 const text=(k,n)=>String(f.get(k)||'').trim().slice(0,n);
 const p={id,name:text('name',150),category:text('category',80),location:text('location',150),description:text('description',3000),doneBy:text('doneBy',150),firm:text('firm',150),published:f.get('published')==='true',updatedAt:new Date().toISOString(),media:[]};
 if(!p.name)return json({error:'Project name is required'},400);
 const keep=JSON.parse(String(f.get('keep')||'[]'));if(!Array.isArray(keep))return json({error:'Invalid media selection'},400);
 p.media=(old?.media||[]).filter(m=>keep.includes(m.id));
 const files=f.getAll('files').filter(x=>typeof x!=='string'&&x.size),allowed=new Set(['image/jpeg','image/png','image/webp','video/mp4','video/webm']);
 if(files.some(x=>!allowed.has(x.type)))return json({error:'Use JPG, PNG, WebP, MP4 or WebM files'},400);
 if(files.reduce((n,x)=>n+x.size,0)>95*1024*1024)return json({error:'Upload up to 95 MB per save'},413);
 if(p.media.length+files.length>30)return json({error:'Maximum 30 files per project'},400);
 const added=[];
 try{for(const file of files){const m={id:crypto.randomUUID(),name:file.name.slice(0,180),type:file.type};await env.PRODUCT_MEDIA.put(prefix+id+'/'+m.id,file.stream(),{httpMetadata:{contentType:m.type}});added.push(m);p.media.push(m)}await env.PRODUCT_MEDIA.put(prefix+id+'/record.json',JSON.stringify(p),{httpMetadata:{contentType:'application/json'}})}catch(e){for(const m of added)await env.PRODUCT_MEDIA.delete(prefix+id+'/'+m.id);throw e}
 for(const m of old?.media||[])if(!keep.includes(m.id))await env.PRODUCT_MEDIA.delete(prefix+id+'/'+m.id);
 return json({ok:true,project:p});
 }catch{return json({error:'Project could not be saved or loaded. Please retry.'},500)}
}
