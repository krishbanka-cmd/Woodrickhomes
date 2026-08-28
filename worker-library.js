import base from './worker-ai.js';

const allowedTypes = new Set(['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm']);
const maxBytes = 100 * 1024 * 1024;

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
function slug(v=''){return String(v||'').toLowerCase().trim().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'item';}
function bearerAuthorized(request,env){const auth=request.headers.get('authorization')||'';return !!env.ADMIN_UPLOAD_TOKEN&&auth===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`;}

async function deleteLibrary(keys,env){
  const safeKeys=[...new Set((Array.isArray(keys)?keys:[]).filter(k=>typeof k==='string'&&k.startsWith('library/')))];
  if(!safeKeys.length)return json({error:'No library files selected'},400);
  if(safeKeys.length>500)return json({error:'Too many files in one delete request'},400);
  let deleted=0;
  try{for(const key of safeKeys){await env.PRODUCT_MEDIA.delete(key);deleted++;}}
  catch(err){return json({error:'R2 delete failed',detail:String(err?.message||err),deleted},500);}
  return json({ok:true,deleted});
}

async function handleLibraryUpload(request,env,form){
  if(!env.PRODUCT_MEDIA)return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);
  if(!bearerAuthorized(request,env))return json({error:'Invalid admin access code'},401);
  const file=form.get('file');
  const category=String(form.get('category')||'').trim();
  const type=String(form.get('type')||'').trim();
  const title=String(form.get('title')||'').trim();
  const brand=String(form.get('brand')||'').trim();
  const catalogue=String(form.get('catalogue')||title).trim();
  const page=String(form.get('page')||'').trim();
  if(!file||typeof file.arrayBuffer!=='function')return json({error:'Please select a file'},400);
  if(!category||!title||!brand||!catalogue)return json({error:'Brand, category, catalogue and title are required'},400);
  if(!allowedTypes.has(file.type))return json({error:'Unsupported file type'},415);
  if(file.size>maxBytes)return json({error:'File is too large. Maximum size is 100 MB.'},413);
  const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
  const root=`library/${slug(brand)}/${slug(category)}/${slug(catalogue)}`;
  let key;
  if(type==='original-pdf')key=`${root}/original/${slug(catalogue)}.pdf`;
  else if(type==='jpg-page')key=`${root}/jpg/page-${String(page||'1').padStart(3,'0')}.jpg`;
  else key=`${root}/${slug(type||'file')}/${Date.now()}-${slug(title)}.${ext}`;
  const meta={category,title,type,brand,catalogue,page,library:'1',originalName:file.name,uploadedAt:new Date().toISOString()};
  await env.PRODUCT_MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||'application/octet-stream'},customMetadata:meta});
  return json({ok:true,key,category,title,type,brand,catalogue,page,url:`/api/media?key=${encodeURIComponent(key)}`},201);
}

function mediaItem(o){return {key:o.key,size:o.size,uploaded:o.uploaded,url:`/api/media?key=${encodeURIComponent(o.key)}`,...(o.customMetadata||{})};}
function isLegacyLibraryItem(item){return item.key.startsWith('library/')||item.library==='1'||item.type==='original-pdf'||item.type==='jpg-page';}
function normalizeLegacyLibraryItem(item){
  if(!item.key.startsWith('library/')&&!String(item.brand||'').trim()){
    return {...item,brand:'Unknown Brand',legacyBrandMissing:'1'};
  }
  return item;
}

async function handleMedia(request,env){
  if(!env.PRODUCT_MEDIA)return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);
  try{
    const url=new URL(request.url),key=url.searchParams.get('key');
    if(key){
      const obj=await env.PRODUCT_MEDIA.get(key);if(!obj)return new Response('Not found',{status:404});
      const headers=new Headers();obj.writeHttpMetadata(headers);headers.set('etag',obj.httpEtag);headers.set('cache-control','public, max-age=3600');
      if(url.searchParams.get('download')==='1'){const name=(obj.customMetadata&&obj.customMetadata.originalName)||key.split('/').pop()||'download';headers.set('content-disposition',`attachment; filename="${String(name).replace(/"/g,'')}"`);}
      return new Response(obj.body,{headers});
    }
    const prefix=url.searchParams.get('prefix')||'',cursor=url.searchParams.get('cursor')||undefined;
    if(prefix==='library/'){
      const [modern,all]=await Promise.all([
        env.PRODUCT_MEDIA.list({limit:500,prefix:'library/',include:['customMetadata','httpMetadata']}),
        env.PRODUCT_MEDIA.list({limit:500,include:['customMetadata','httpMetadata']})
      ]);
      const byKey=new Map();
      for(const o of modern.objects)byKey.set(o.key,mediaItem(o));
      for(const o of all.objects){let item=mediaItem(o);if(isLegacyLibraryItem(item)){item=normalizeLegacyLibraryItem(item);byKey.set(item.key,item);}}
      const items=[...byKey.values()].sort((a,b)=>String(b.uploadedAt||b.uploaded).localeCompare(String(a.uploadedAt||a.uploaded)));
      return json({items,truncated:false,cursor:null,legacyCompatible:true});
    }
    const listed=await env.PRODUCT_MEDIA.list({limit:500,prefix,cursor,include:['customMetadata','httpMetadata']});
    const items=listed.objects.map(mediaItem).sort((a,b)=>String(b.uploadedAt||b.uploaded).localeCompare(String(a.uploadedAt||a.uploaded)));
    return json({items,truncated:listed.truncated,cursor:listed.cursor||null});
  }catch(err){return json({error:`Media API error: ${err&&err.message?err.message:'Unknown error'}`},500);}
}

export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/api/media'&&request.method==='GET')return handleMedia(request,env);
  if(url.pathname==='/api/upload'&&request.method==='POST'){
    const contentType=(request.headers.get('content-type')||'').toLowerCase();
    if(contentType.includes('application/json')){
      if(!env.PRODUCT_MEDIA)return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);
      if(!bearerAuthorized(request,env))return json({error:'Invalid admin access code'},401);
      let body;try{body=await request.json();}catch{return json({error:'Invalid request'},400);}
      if(body?.action!=='delete-library')return json({error:'Unsupported action'},400);
      return deleteLibrary(body.keys,env);
    }
    if(contentType.includes('multipart/form-data')||contentType.includes('application/x-www-form-urlencoded')){
      let form;try{form=await request.clone().formData();}catch{return base.fetch(request,env,ctx);}
      if(String(form.get('action')||'')==='delete-library'){
        if(!bearerAuthorized(request,env))return json({error:'Invalid admin access code'},401);
        let keys=[];const raw=String(form.get('keys')||'').trim();
        if(raw){try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))keys=parsed;}catch{return json({error:'Invalid delete keys'},400);}}
        return deleteLibrary(keys,env);
      }
      if(String(form.get('library')||'')==='1')return handleLibraryUpload(request,env,form);
    }
  }
  return base.fetch(request,env,ctx);
}};
