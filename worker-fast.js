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
    let changed=false;
    data.items=data.items.map(item=>{
      const source=String(item&&item.sourceKey||'');
      if(!source.startsWith('library/'))return item;
      const query=new URLSearchParams({source,brand:String(item.brand||''),category:String(item.category||''),catalogue:String(item.catalogue||item.title||'')});
      const coverUrl='/api/catalogue-cover?'+query.toString();
      if(item.coverUrl===coverUrl)return item;
      changed=true;return{...item,coverUrl};
    });
    if(changed)body=JSON.stringify(data);
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

async function rangedPdf(request,url,env){
  if(!env.PRODUCT_MEDIA)return null;
  const key=url.searchParams.get('key')||'';
  if(url.pathname!=='/api/media'||url.searchParams.get('raw')!=='1'||!/\.pdf$/i.test(key))return null;
  const head=await env.PRODUCT_MEDIA.head(key);
  if(!head)return new Response('Not found',{status:404});
  const headers=new Headers();head.writeHttpMetadata(headers);headers.set('etag',head.httpEtag);headers.set('accept-ranges','bytes');headers.set('cache-control','public, max-age=86400, stale-while-revalidate=604800');headers.set('x-content-type-options','nosniff');
  const range=request.headers.get('range');
  if(request.method==='HEAD'){headers.set('content-length',String(head.size));return new Response(null,{status:200,headers})}
  if(range){
    const match=/^bytes=(\d+)-(\d*)$/i.exec(range.trim());
    if(!match)return new Response('Invalid range',{status:416,headers:{'content-range':`bytes */${head.size}`}});
    const start=Number(match[1]),requestedEnd=match[2]?Number(match[2]):Math.min(start+262143,head.size-1),end=Math.min(requestedEnd,head.size-1);
    if(!Number.isFinite(start)||start<0||start>=head.size||end<start)return new Response('Range not satisfiable',{status:416,headers:{'content-range':`bytes */${head.size}`}});
    const object=await env.PRODUCT_MEDIA.get(key,{range:{offset:start,length:end-start+1}});
    if(!object)return new Response('Not found',{status:404});
    headers.set('content-range',`bytes ${start}-${end}/${head.size}`);headers.set('content-length',String(end-start+1));
    return new Response(object.body,{status:206,headers});
  }
  const object=await env.PRODUCT_MEDIA.get(key);
  if(!object)return new Response('Not found',{status:404});
  headers.set('content-length',String(head.size));return new Response(object.body,{status:200,headers});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if((request.method==='GET'||request.method==='HEAD')){
      const pdf=await rangedPdf(request,url,env);if(pdf)return pdf;
    }
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
      if(url.searchParams.get('return'))target.searchParams.set('return',url.searchParams.get('return'));else{const referer=request.headers.get('referer')||'';try{const back=new URL(referer);if(back.origin===url.origin&&(back.pathname.startsWith('/products')||back.pathname.startsWith('/woodrick-library')))target.searchParams.set('return',back.pathname+back.search+back.hash)}catch{}}
      return Response.redirect(target.href,302);
    }
    if((request.method==='GET'||request.method==='HEAD')&&url.pathname.startsWith('/products/presentation/')){
      const asset=await env.ASSETS.fetch(request);
      const headers=new Headers(asset.headers);
      headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
      headers.set('pragma','no-cache');
      headers.set('expires','0');
      if(request.method==='HEAD'||!(headers.get('content-type')||'').includes('text/html'))return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
      let html=await asset.text();
      html=html.replace('id="catalogueBack" href="/products/#media"','id="catalogueBack" href="/catalogues/"');
      headers.delete('content-length');
      return new Response(html,{status:asset.status,statusText:asset.statusText,headers});
    }
    if(request.method==='GET'&&url.pathname.startsWith('/catalogue-covers/')){
      const response=await cachedCatalogueCover(request,env);
      if(response)return response;
    }
    if(isPublicMediaList(request,url)){
      try{const response=await indexedMedia(env);if(response)return response}catch{}
    }
    let response=await app.fetch(request,env,ctx);
    if(request.method==='GET'&&(url.pathname==='/catalogues/'||url.pathname==='/catalogues'||url.pathname==='/catalogues/index.html')&&(response.headers.get('content-type')||'').includes('text/html')){
      let html=await response.text();
      const fix=`<script id="woodrick-catalogue-link-guard-v1">(function(){function repair(){document.querySelectorAll('#grid .card').forEach(function(card){var view=card.querySelector('.actions a.primary'),download=card.querySelector('.actions a[href*="download=1"]');if(!view||!download)return;try{var source=new URL(download.href,location.href),key=source.searchParams.get('key');if(!key)return;var title=((card.querySelector('h2')||{}).textContent||'Catalogue').trim(),target=new URL('/api/media',location.origin);target.searchParams.set('pdfviewer','1');target.searchParams.set('key',key);target.searchParams.set('title',title);target.searchParams.set('return','/catalogues/');view.href=target.pathname+target.search;view.target='_self';view.dataset.pdfGuard='1'}catch(e){}})}var grid=document.getElementById('grid');if(grid)new MutationObserver(repair).observe(grid,{childList:true,subtree:true});repair()})();</script>`;
      if(!html.includes('woodrick-catalogue-link-guard-v1'))html=html.replace('</body>',fix+'\\n</body>');
      const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');headers.set('x-woodrick-catalogue-links','pdf-guard-v1');
      response=new Response(html,{status:response.status,statusText:response.statusText,headers});
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    ctx.waitUntil(Promise.all([
      backfillDesignIndex(env,3),
      syncAndClean(env).then(()=>refreshPublicMediaIndex(env))
    ]));
  }
};
