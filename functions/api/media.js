function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache','expires':'0'}})}

function toItem(o){return {key:o.key,size:o.size,uploaded:o.uploaded,url:`/api/media?key=${encodeURIComponent(o.key)}`,...(o.customMetadata||{})}}

async function listAll(env,prefix=''){
  const objects=[];
  let cursor=undefined;
  let page=0;
  const seen=new Set();
  const MAX_OBJECTS=100000;
  while(objects.length<MAX_OBJECTS){
    const opts={limit:1000,prefix,include:['customMetadata','httpMetadata']};
    if(cursor) opts.cursor=cursor;
    const listed=await env.PRODUCT_MEDIA.list(opts);
    objects.push(...listed.objects);
    page++;
    if(!listed.truncated) break;
    const next=listed.cursor;
    if(!next||seen.has(next)) break;
    seen.add(next);
    cursor=next;
  }
  return {objects,pages:page,truncated:objects.length>=MAX_OBJECTS,cursor:cursor||null};
}

export async function onRequestGet({request,env}){
  if(!env.PRODUCT_MEDIA) return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);
  const url=new URL(request.url);
  const key=url.searchParams.get('key');
  if(key){
    const obj=await env.PRODUCT_MEDIA.get(key);
    if(!obj) return new Response('Not found',{status:404});
    const headers=new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag',obj.httpEtag);
    headers.set('cache-control','public, max-age=3600');
    if(url.searchParams.get('download')==='1'){
      const name=(obj.customMetadata&&obj.customMetadata.originalName)||key.split('/').pop()||'download';
      headers.set('content-disposition',`attachment; filename="${String(name).replace(/"/g,'')}"`);
    }
    return new Response(obj.body,{headers});
  }

  const prefix=url.searchParams.get('prefix')||'';
  const requestedCursor=url.searchParams.get('cursor')||undefined;

  // Library listings must never stop at one R2 page. Every catalogue PDF can
  // generate dozens or hundreds of JPG objects, so aggregate all pages here.
  if(prefix.startsWith('library/')&&!requestedCursor){
    const all=await listAll(env,prefix);
    const items=all.objects.map(toItem).sort((a,b)=>String(b.uploadedAt||b.uploaded).localeCompare(String(a.uploadedAt||a.uploaded)));
    return json({items,truncated:all.truncated,cursor:all.cursor,pages:all.pages,total:items.length,mode:'full-library'});
  }

  const opts={limit:500,prefix,include:['customMetadata','httpMetadata']};
  if(requestedCursor) opts.cursor=requestedCursor;
  const listed=await env.PRODUCT_MEDIA.list(opts);
  const items=listed.objects.map(toItem).sort((a,b)=>String(b.uploadedAt||b.uploaded).localeCompare(String(a.uploadedAt||a.uploaded)));
  return json({items,truncated:listed.truncated,cursor:listed.cursor||null,total:items.length,mode:'paged'});
}

async function deleteLibrary(request,env){
  if(!env.PRODUCT_MEDIA) return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);
  if(!env.ADMIN_UPLOAD_TOKEN) return json({error:'ADMIN_UPLOAD_TOKEN secret is missing'},500);
  const auth=request.headers.get('authorization')||'';
  if(auth!==`Bearer ${env.ADMIN_UPLOAD_TOKEN}`) return json({error:'Invalid admin access code'},401);
  let body;
  try{body=await request.json()}catch{return json({error:'Invalid delete request'},400)}
  const keys=Array.isArray(body?.keys)?[...new Set(body.keys.filter(k=>typeof k==='string'&&k.startsWith('library/')))]:[];
  if(!keys.length) return json({error:'No library files selected'},400);
  if(keys.length>5000) return json({error:'Too many files in one delete request'},400);
  let deleted=0;
  try{
    for(const key of keys){await env.PRODUCT_MEDIA.delete(key);deleted++}
  }catch(err){return json({error:'R2 delete failed',detail:String(err?.message||err),deleted},500)}
  return json({ok:true,deleted});
}

export async function onRequestPost({request,env}){
  let body;
  try{body=await request.clone().json()}catch{return json({error:'Invalid request'},400)}
  if(body?.action!=='delete-library') return json({error:'Unsupported action'},400);
  return deleteLibrary(request,env);
}

export async function onRequestDelete({request,env}){
  return deleteLibrary(request,env);
}
