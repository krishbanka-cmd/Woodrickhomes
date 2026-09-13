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
  return new Response(index.body,{headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
    'x-woodrick-media-index':'fast-v1'
  }});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
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
