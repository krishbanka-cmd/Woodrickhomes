import app from './worker-admin-media-hierarchy.js';

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store, no-cache, must-revalidate, max-age=0'
    }
  });
}

function explicitPasswordOk(request,env){
  if(!env.ADMIN_UPLOAD_TOKEN)return false;
  return (request.headers.get('authorization')||'')===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`;
}

async function deleteKeys(env,keys,{libraryOnly=false}={}){
  if(!env.PRODUCT_MEDIA)return json({error:'Media storage is not configured'},500);
  const safe=[...new Set((Array.isArray(keys)?keys:[]).filter(k=>{
    if(typeof k!=='string'||!k||k.includes('..'))return false;
    if(libraryOnly&&!k.startsWith('library/'))return false;
    return true;
  }))];
  if(!safe.length)return json({error:'No valid catalogue files selected'},400);
  if(safe.length>500)return json({error:'Too many files selected'},400);
  for(let i=0;i<safe.length;i+=1000){
    await env.PRODUCT_MEDIA.delete(safe.slice(i,i+1000));
  }
  return json({ok:true,deleted:safe.length});
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Guarantee Product/Library delete support at the top-level worker so older
    // wrapper layers cannot return "Unsupported action" before the request reaches
    // the upload function.
    if(request.method==='POST'&&url.pathname==='/api/upload'){
      const ct=(request.headers.get('content-type')||'').toLowerCase();
      if(ct.includes('application/json')){
        let body={};
        try{body=await request.clone().json()}catch{return json({error:'Invalid request'},400)}
        if(body?.action==='delete-media'||body?.action==='delete-library'){
          if(!explicitPasswordOk(request,env))return json({error:'Correct admin password is required.'},401);
          const keys=Array.isArray(body.keys)?body.keys:[];
          if(body.action==='delete-media'&&keys.some(k=>String(k||'').startsWith('product-sync/'))){
            return json({error:'This catalogue is synced from Woodrick Home Library. Delete it from the Library tab.'},400);
          }
          try{
            return await deleteKeys(env,keys,{libraryOnly:body.action==='delete-library'});
          }catch(err){
            return json({error:'Delete failed',detail:String(err?.message||err)},500);
          }
        }
      }
    }

    const response = await app.fetch(request, env, ctx);
    const isAdmin = request.method === 'GET' && (
      url.pathname === '/admin-products/' ||
      url.pathname === '/admin-products' ||
      url.pathname === '/admin-products/index.html'
    );
    if (!isAdmin) return response;
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;

    let html = await response.text();

    html = html.replace(
      'renderCategories();loadMedia();loadLibrary();',
      'renderCategories();loadLibrary();'
    );

    html = html
      .replace(/<script id="woodrick-admin-refresh-stable-v[0-9]+">[\s\S]*?<\/script>/g, '')
      .replace(/<style id="woodrick-admin-refresh-stable-style-v[0-9]+">[\s\S]*?<\/style>/g, '')
      .replace(/<script id="woodrick-admin-media-hybrid-v[0-9]+">[\s\S]*?<\/script>/g, '')
      .replace(/<style id="woodrick-admin-media-hybrid-style-v[0-9]+">[\s\S]*?<\/style>/g, '');

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
    headers.set('x-woodrick-version', 'admin-media-final-v2-delete-fix');
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
