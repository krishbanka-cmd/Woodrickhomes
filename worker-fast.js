import app from './worker-design-extraction.js';
import {backfillDesignIndex} from './worker-design-picker-click-fix.js';
import {PUBLIC_MEDIA_INDEX_KEY,refreshPublicMediaIndex,syncAndClean} from './worker-product-media-sync.js';

const BRAND_RAIL_KEY='_system/brand-rail-v1.json';
const BRAND_RAIL_DEFAULTS=[
  {brand:'UltraTech',label:'UltraTech Cement',alt:'UltraTech Cement logo',src:'https://www.ultratechcement.com/content/dam/ultratechcementwebsite/solutions/3d-corporate-logo-full.jpg',fallback:'assets/brand-logos/ultratech.svg'},
  {brand:'Birla Opus',label:'Birla Opus Paints',alt:'Birla Opus Paints logo',src:'https://assets.birlaopus.com/is/image/grasimindustries/footer-opus-logo-resize?dpr=off&ts=1740568574949',fallback:'assets/brand-logos/birla-opus.svg'},
  {brand:'Asian Paints',label:'Asian Paints',alt:'Asian Paints logo',src:'https://www.asianpaints.com/media_1c958864309c45699aabc2a96ceec44f7a9a6343d.avif?format=avif&optimize=medium&width=750',fallback:'assets/brand-logos/asian-paints.svg'},
  {brand:'Supreme',label:'Supreme',alt:'Supreme Industries logo',src:'assets/brand-logos/supreme-real.png'},
  {brand:'CenturyPly',label:'CenturyPly',alt:'CenturyPly logo',src:'https://upload.wikimedia.org/wikipedia/commons/1/16/Centuryply.png',fallback:'https://delhisales.in/brand_image/1396010809.jpg'},
  {brand:'Greenpanel',label:'Greenpanel',alt:'Greenpanel logo',src:'assets/brand-logos/greenpanel-real.svg'},
  {brand:'Nilkamal',label:'Nilkamal',alt:'Nilkamal logo',src:'assets/brand-logos/nilkamal-real.png'},
  {brand:'Godrej',label:'Godrej',alt:'Godrej logo',src:'assets/brand-logos/godrej-real.svg'},
  {brand:'Hettich',label:'Hettich',alt:'Hettich logo',src:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Logo_of_Hettich_%28company%29.svg/1280px-Logo_of_Hettich_%28company%29.svg.png',fallback:'https://upload.wikimedia.org/wikipedia/commons/1/15/Logo_of_Hettich_%28company%29.svg'},
  {brand:'Greenply',label:'Greenply',alt:'Greenply Plywood logo',src:'https://cdn.shopify.com/s/files/1/0634/6283/4312/files/plywood-suppliers-and-manufacturers-in-the-world-3.jpg?v=1748284691'},
  {brand:'Merino',label:'Merino',alt:'Merino Laminates logo',src:'https://3adeal.com/images/thumbnails/904/500/detailed/5/merino_logo.png?t=1736319929'},
  {brand:'Ristal',label:'Ristal',alt:'Ristal Laminates logo',src:'https://www.ristallam.com/ristal-img/logo.png'},
  {brand:'Woodline',label:'Woodline',alt:'Woodline Laminates logo',src:'https://qliqo.in/get_image_services.php?id=1845'},
  {brand:'MWUD',label:'MWUD',alt:'MWUD logo',src:'https://mwud.in/assets/images/resources/logo-1.png'},
  {brand:'EBCO',label:'EBCO',alt:'EBCO logo',src:'https://www.sainiworld.in/cdn/shop/collections/ebco_logo.jpg?v=1667629036'}
];
const BRAND_ENC=new TextEncoder();
function brandJson(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function brandCookie(request,name){const raw=request.headers.get('cookie')||'';for(const part of raw.split(';')){const [k,...rest]=part.trim().split('=');if(k===name)return rest.join('=')}return''}
async function brandSession(secret){const key=await crypto.subtle.importKey('raw',BRAND_ENC.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,BRAND_ENC.encode('woodrick-admin-session-v1'));return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function brandAuthorized(request,env){if(!env.ADMIN_UPLOAD_TOKEN)return false;const auth=request.headers.get('authorization')||'';if(auth===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`)return true;return brandCookie(request,'woodrick_admin')===await brandSession(env.ADMIN_UPLOAD_TOKEN)}
function cleanBrandItem(input={},existing={}){
  const brand=String(input.brand??existing.brand??'').trim().slice(0,80);
  const label=String(input.label??existing.label??brand).trim().slice(0,100)||brand;
  const src=String(input.src??existing.src??'').trim().slice(0,1200);
  const fallback=String(input.fallback??existing.fallback??'').trim().slice(0,1200);
  const alt=String(input.alt??existing.alt??(`${label} logo`)).trim().slice(0,140);
  return {brand,label,alt,src,...(fallback?{fallback}:{})};
}
async function loadBrandRail(env){
  if(!env.PRODUCT_MEDIA)return BRAND_RAIL_DEFAULTS.map(x=>({...x}));
  try{
    const obj=await env.PRODUCT_MEDIA.get(BRAND_RAIL_KEY);
    if(!obj)return BRAND_RAIL_DEFAULTS.map(x=>({...x}));
    const data=JSON.parse(await obj.text());
    if(!Array.isArray(data.items)||!data.items.length)return BRAND_RAIL_DEFAULTS.map(x=>({...x}));
    return data.items.map(x=>cleanBrandItem(x)).filter(x=>x.brand);
  }catch{return BRAND_RAIL_DEFAULTS.map(x=>({...x}))}
}
async function saveBrandRail(env,items){
  if(!env.PRODUCT_MEDIA)throw Error('PRODUCT_MEDIA R2 binding is missing');
  const body=JSON.stringify({version:1,updatedAt:new Date().toISOString(),items});
  await env.PRODUCT_MEDIA.put(BRAND_RAIL_KEY,body,{httpMetadata:{contentType:'application/json'}});
}
async function handleBrandRail(request,env){
  if(request.method==='GET')return brandJson({items:await loadBrandRail(env)});
  if(request.method!=='POST')return brandJson({error:'Method not allowed'},405);
  if(!await brandAuthorized(request,env))return brandJson({error:'Admin login required'},401);
  let data;try{data=await request.json()}catch{return brandJson({error:'Invalid JSON'},400)}
  const action=String(data&&data.action||'upsert');
  let items=await loadBrandRail(env);
  if(action==='delete'){
    const brand=String(data.brand||'').trim();
    if(!brand)return brandJson({error:'Brand is required'},400);
    items=items.filter(x=>x.brand.toLowerCase()!==brand.toLowerCase());
  }else if(action==='upsert'){
    const input=data.item||{},brand=String(input.brand||'').trim();
    if(!brand)return brandJson({error:'Brand is required'},400);
    const i=items.findIndex(x=>x.brand.toLowerCase()===brand.toLowerCase());
    const item=cleanBrandItem(input,i>=0?items[i]:{});
    if(i>=0)items[i]=item;else items.push(item);
  }else if(action==='replace'&&Array.isArray(data.items)){
    items=data.items.map(x=>cleanBrandItem(x)).filter(x=>x.brand);
  }else return brandJson({error:'Unsupported action'},400);
  await saveBrandRail(env,items);
  return brandJson({ok:true,items});
}

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
    if(url.pathname==='/api/brands'&&(request.method==='GET'||request.method==='POST'))return handleBrandRail(request,env);
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
          target.searchParams.set('return','/catalogues/');
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
      target.searchParams.set('return','/catalogues/');
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
      html=html.replace(/id="catalogueBack" href="[^"]*"/,'id="catalogueBack" href="/catalogues/"');
      const fixedBack='<script id="woodrick-fixed-catalogue-back">(function(){var b=document.getElementById("catalogueBack");if(!b)return;b.href="/catalogues/";b.addEventListener("click",function(e){e.preventDefault();location.href="/catalogues/";});})();<\\/script>';
      if(!html.includes('woodrick-fixed-catalogue-back'))html=html.replace('</body>',fixedBack+'\\n</body>');
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
