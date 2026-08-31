import app from './worker-edit-save-fast.js';

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate, max-age=0'}})}
function clean(v=''){return String(v||'').trim()}
function slug(v=''){return clean(v).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'item'}
function passwordOk(request,env){return !!env.ADMIN_UPLOAD_TOKEN&&(request.headers.get('authorization')||'')===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`}

async function orphanFallback(request,env){
  if(!env.PRODUCT_MEDIA)return null;
  let body={};try{body=await request.clone().json()}catch{return null}
  const key=clean(body.key),category=clean(body.category),brand=clean(body.brand),catalogue=clean(body.catalogue);
  if(!key||!category||!brand||!catalogue)return null;
  const head=await env.PRODUCT_MEDIA.head(key);if(!head)return null;
  const old=head.customMetadata||{};
  const synced=String(key).startsWith('product-sync/')||String(old.source||'')==='library-sync'||String(old.sourceKey||'').startsWith('library/');
  if(!synced)return null;
  const sourceKey=clean(old.sourceKey);
  if(sourceKey){const source=await env.PRODUCT_MEDIA.head(sourceKey);if(source)return null;}
  if(!passwordOk(request,env))return json({error:'Correct admin password is required.'},401);
  const obj=await env.PRODUCT_MEDIA.get(key);if(!obj)return json({error:'Catalogue file could not be read'},500);
  const newKey=`${slug(category)}/${slug(brand)}/${slug(catalogue)}/pdf/${Date.now()}-${slug(catalogue)}.pdf`;
  const meta={...old,category,brand,catalogue,title:catalogue,type:'pdf',library:'0',source:'edited-direct',sourceKey:'',editedAt:new Date().toISOString()};
  await env.PRODUCT_MEDIA.put(newKey,obj.body,{httpMetadata:head.httpMetadata||obj.httpMetadata||{contentType:'application/pdf'},customMetadata:meta});
  if(key!==newKey)await env.PRODUCT_MEDIA.delete(key);
  return json({ok:true,key:newKey,scope:'product-media',recoveredFromMissingLibrarySource:true});
}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='POST'&&url.pathname==='/api/admin-media-edit'){
    try{const fallback=await orphanFallback(request,env);if(fallback)return fallback}catch(err){return json({error:'Edit recovery failed',detail:String(err?.message||err)},500)}
  }
  const response=await app.fetch(request,env,ctx);
  if(request.method!=='GET')return response;
  const isAdmin=url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html';
  if(!isAdmin)return response;
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');headers.set('x-woodrick-version','edit-orphan-fallback-v1');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}};
