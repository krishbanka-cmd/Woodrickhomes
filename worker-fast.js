import app from './worker-design-extraction.js';
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
    // A catalogue thumbnail/page must never become a dead-end raw image.
    // For top-level navigation only, resolve its parent original PDF and open
    // the proper presentation viewer. Normal <img> thumbnail requests stay raw.
    if(request.method==='GET'&&url.pathname==='/api/media'&&
      url.searchParams.get('raw')==='1'&&
      /^library\/.+\/jpg\/.+\.(?:jpe?g|png|webp)$/i.test(url.searchParams.get('key')||'')&&
      request.headers.get('sec-fetch-dest')==='document'&&env.PRODUCT_MEDIA){
      try{
        const pageKey=url.searchParams.get('key'),root=pageKey.split('/jpg/')[0];
        const listed=await env.PRODUCT_MEDIA.list({prefix:root+'/original/',limit:20,include:['customMetadata']});
        const original=(listed.objects||[]).find(o=>/\.pdf$/i.test(o.key)||String((o.customMetadata||{}).type||'')==='original-pdf');
        if(original){
          const meta=original.customMetadata||{},target=new URL('/products/presentation/',url);
          target.searchParams.set('key',original.key);
          target.searchParams.set('title',meta.catalogue||meta.title||'Catalogue');
          const referer=request.headers.get('referer')||'';
          try{const back=new URL(referer);if(back.origin===url.origin&&(back.pathname.startsWith('/products')||back.pathname.startsWith('/woodrick-library')))target.searchParams.set('return',back.pathname+back.search+back.hash)}catch{}
          return Response.redirect(target.href,302);
        }
      }catch{}
    }
    // Send every customer-opened PDF through the page-at-a-time presentation.
    // Raw reads, downloads, thumbnails and extraction requests stay intact.
    if(request.method==='GET'&&url.pathname==='/api/media'&&
      /\.pdf$/i.test(url.searchParams.get('key')||'')&&
      url.searchParams.get('raw')!=='1'&&url.searchParams.get('download')!=='1'&&
      (request.headers.get('sec-fetch-dest')==='document'||url.searchParams.get('pdfviewer')==='1')){
      const target=new URL('/products/presentation/',url);
      target.searchParams.set('key',url.searchParams.get('key'));
      if(url.searchParams.get('title'))target.searchParams.set('title',url.searchParams.get('title'));
      return Response.redirect(target.href,302);
    }
    if((request.method==='GET'||request.method==='HEAD')&&url.pathname.startsWith('/products/presentation/')){
      return env.ASSETS.fetch(request);
    }
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
