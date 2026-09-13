import app from './worker-category-ui-hardfix.js';
import {backfillDesignIndex} from './worker-design-picker-click-fix.js';
import {PUBLIC_MEDIA_INDEX_KEY,refreshPublicMediaIndex,syncAndClean} from './worker-product-media-sync.js';

function isPublicMediaList(request,url){
  return request.method==='GET'&&
    url.pathname==='/api/media'&&
    !url.searchParams.get('key')&&
    !url.searchParams.get('prefix')&&
    !(request.headers.get('referer')||'').includes('/admin-products');
}

async function indexedMedia(env){
  if(!env.PRODUCT_MEDIA)return null;
  const index=await env.PRODUCT_MEDIA.get(PUBLIC_MEDIA_INDEX_KEY);
  if(!index)return null;
  // Never serve an accidentally empty/corrupt fast index to customers.  Falling
  // through makes the canonical R2 listing rebuild the response instead.
  let body;
  try{
    body=await index.text();
    const data=JSON.parse(body);
    if(!Array.isArray(data.items)||data.items.length===0)return null;
  }catch{return null}
  return new Response(body,{headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
    'x-woodrick-media-index':'fast-v1'
  }});
}

async function cachedCatalogueCover(request,env){
  if(!env.ASSETS||typeof env.ASSETS.fetch!=='function')return null;
  const response=await env.ASSETS.fetch(request);
  if(!response.ok)return response;
  const headers=new Headers(response.headers);
  headers.set('cache-control','public, max-age=604800, s-maxage=2592000, stale-while-revalidate=604800');
  headers.set('x-content-type-options','nosniff');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname.startsWith('/catalogue-covers/')){
      const response=await cachedCatalogueCover(request,env);
      if(response)return response;
    }
    if(isPublicMediaList(request,url)){
      try{const response=await indexedMedia(env);if(response)return response}catch{}
    }
    return app.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    ctx.waitUntil(Promise.all([
      backfillDesignIndex(env,3),
      syncAndClean(env).then(()=>refreshPublicMediaIndex(env))
    ]));
  }
};
