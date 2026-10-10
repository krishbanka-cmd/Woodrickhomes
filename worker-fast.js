import {canonicalCatalogueKey,dedupeCatalogueItems} from './worker-catalogue-identity.js';
import {buildBrandDirectory,buildCatalogMaster,canonicalBrowseCategory,canonicalBrand,brandKey,canonicalMediaCategory} from './worker-brand-directory.js';
import {consistentCustomerResponse} from './worker-ui-consistency.js';
import {handleListQuote} from './worker-list-quotes.js';
import {handleVendor} from './worker-vendors.js';
import {handleEnquiries} from './worker-enquiries.js';
import app from './worker-design-extraction.js';
import {backfillDesignIndex} from './worker-design-picker-click-fix.js';
import {PUBLIC_MEDIA_INDEX_KEY,refreshPublicMediaIndex,syncAndClean,STATIC_PUBLIC_MEDIA,publicMediaList} from './worker-product-media-sync.js';

const isHiddenMediaKey = key => /^(?:private|_system|_config)\//i.test(String(key||''));

const BRAND_RAIL_KEY='_system/brand-rail-v1.json';
// Charcoal denotes the Charcoal Moulding product, not a manufacturer brand.
// Keep existing product media and admin records intact; exclude only from public hero rail.
const PRODUCT_ONLY_RAIL_ENTRIES=new Set(['charcoal','charcoal moulding']);
const BRAND_RAIL_DEFAULTS=[
  {brand:'UltraTech',label:'UltraTech Cement',alt:'UltraTech Cement logo',src:'/assets/brand-logos/ultratech-hosted.jpg'},
  {brand:'Birla Opus',label:'Birla Opus Paints',alt:'Birla Opus Paints logo',src:'/assets/brand-logos/birla-opus-hosted.jpg'},
  {brand:'Asian Paints',label:'Asian Paints',alt:'Asian Paints logo',src:'/assets/brand-logos/asian-paints-hosted.png'},
  {brand:'Supreme',label:'Supreme',alt:'Supreme Industries logo',src:'/assets/brand-logos/supreme-real.png'},
  {brand:'CenturyPly',label:'CenturyPly',alt:'CenturyPly logo',src:'/assets/brand-logos/centuryply-hosted.png'},
  {brand:'Greenpanel',label:'Greenpanel',alt:'Greenpanel logo',src:'/assets/brand-logos/greenpanel-real.svg'},
  {brand:'Nilkamal',label:'Nilkamal',alt:'Nilkamal logo',src:'/assets/brand-logos/nilkamal-real.png'},
  {brand:'Godrej',label:'Godrej',alt:'Godrej logo',src:'/assets/brand-logos/godrej-real.svg'},
  {brand:'Hettich',label:'Hettich',alt:'Hettich logo',src:'/assets/brand-logos/hettich-hosted.png'},
  {brand:'Greenply',label:'Greenply',alt:'Greenply Plywood logo',src:'/assets/brand-logos/greenply-hosted.jpg'},
  {brand:'Merino',label:'Merino',alt:'Merino Laminates logo',src:'/assets/brand-logos/merino-hosted.png'},
  {brand:'Ristal',label:'Ristal',alt:'Ristal Laminates logo',src:'/assets/brand-logos/ristal-official.png'},
  {brand:'Woodline',label:'Woodline',alt:'Woodline Laminates logo',src:'/assets/brand-logos/woodline-official.svg'},
  {brand:'MWUD',label:'MWUD',alt:'MWUD logo',src:'/assets/brand-logos/mwud-hosted.png'},
  {brand:'EBCO',label:'EBCO',alt:'EBCO logo',src:'/assets/brand-logos/ebco-hosted.jpg'}
];
// Migrate legacy remote/embedded logos on read without changing admin names,
// categories, visibility, or custom uploads already stored on this website.
const HOSTED_BRAND_LOGOS=new Map(BRAND_RAIL_DEFAULTS.map(item=>[brandKey(item.brand),item.src]));
function hostedBrandLogo(brand,src){
  const hosted=HOSTED_BRAND_LOGOS.get(brandKey(brand));
  return hosted&&(!src||/^(?:https?:|\/\/|data:)/i.test(src))?hosted:src;
}
const BRAND_ENC=new TextEncoder();
function brandJson(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function brandCookie(request,name){const raw=request.headers.get('cookie')||'';for(const part of raw.split(';')){const [k,...rest]=part.trim().split('=');if(k===name)return rest.join('=')}return''}
async function brandSession(secret){const key=await crypto.subtle.importKey('raw',BRAND_ENC.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,BRAND_ENC.encode('woodrick-admin-session-v1'));return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function brandAuthorized(request,env){if(!env.ADMIN_UPLOAD_TOKEN)return false;const auth=request.headers.get('authorization')||'';if(auth===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`)return true;return brandCookie(request,'woodrick_admin')===await brandSession(env.ADMIN_UPLOAD_TOKEN)}
function cleanBrandItem(input={},existing={}){
  const brand=canonicalBrand(input.brand??existing.brand??'').slice(0,80);
  const label=String(input.label??existing.label??brand).trim().slice(0,100)||brand;
  const src=hostedBrandLogo(brand,String(input.src??existing.src??'').trim().slice(0,1200));
  const fallback=hostedBrandLogo(brand,String(input.fallback??existing.fallback??'').trim().slice(0,1200));
  const alt=String(input.alt??existing.alt??(`${label} logo`)).trim().slice(0,140);
  const categories=[...new Set((Array.isArray(input.categories)?input.categories:Array.isArray(existing.categories)?existing.categories:[]).map(v=>canonicalBrowseCategory(String(v).trim().slice(0,80))).filter(Boolean))].slice(0,40);
  return {brand,label,alt,src,categories,railEnabled:input.railEnabled??existing.railEnabled??true,...(fallback?{fallback}:{})};
}
async function loadBrandRail(env){
  if(!env.PRODUCT_MEDIA)return BRAND_RAIL_DEFAULTS.map(x=>({...x}));
  try{
    const obj=await env.PRODUCT_MEDIA.get(BRAND_RAIL_KEY);
    if(!obj)return BRAND_RAIL_DEFAULTS.map(x=>({...x}));
    const data=JSON.parse(await obj.text());
    if(!Array.isArray(data.items))return BRAND_RAIL_DEFAULTS.map(x=>({...x}));
    const unique=new Map();
    for(const raw of data.items){const item=cleanBrandItem(raw);if(item.brand)unique.set(brandKey(item.brand),item)}
    return [...unique.values()];
  }catch{return BRAND_RAIL_DEFAULTS.map(x=>({...x}))}
}
async function saveBrandRail(env,items){
  if(!env.PRODUCT_MEDIA)throw Error('PRODUCT_MEDIA R2 binding is missing');
  const body=JSON.stringify({version:1,updatedAt:new Date().toISOString(),items});
  await env.PRODUCT_MEDIA.put(BRAND_RAIL_KEY,body,{httpMetadata:{contentType:'application/json'}});
}
async function loadCatalogMaster(request,env,ctx){
 const url=new URL(request.url);
 // Category brand folders must not re-list thousands of R2 media objects.
 // Share the already validated public catalogue index with Products and Brands.
 const mediaPromise=indexedMedia(env,ctx).then(r=>r?r.json():publicMediaList(env).then(v=>v.json()));
 const [media,managed,state]=await Promise.all([mediaPromise,loadBrandRail(env),app.fetch(new Request(new URL('/api/categories',url)),env,ctx).then(r=>r.json())]);
 return buildCatalogMaster(media.items,managed,state);
}
async function handleBrandRail(request,env,ctx){
  if(request.method==='GET'){
    const managed=await loadBrandRail(env);
    if(new URL(request.url).searchParams.get('scope')==='managed')return brandJson({items:managed});
    const master=await loadCatalogMaster(request,env,ctx);
    return brandJson({...master,items:new URL(request.url).searchParams.get('scope')==='all'?master.items:master.items.filter(x=>x.railEnabled!==false&&!PRODUCT_ONLY_RAIL_ENTRIES.has(brandKey(x.brand)))});
  }
  if(request.method!=='POST')return brandJson({error:'Method not allowed'},405);
  if(!await brandAuthorized(request,env))return brandJson({error:'Admin login required'},401);
  let data;try{data=await request.json()}catch{return brandJson({error:'Invalid JSON'},400)}
  const action=String(data&&data.action||'upsert');
  let items=await loadBrandRail(env);
  if(action==='delete'){
    const brand=canonicalBrand(data.brand);
    if(!brand)return brandJson({error:'Brand is required'},400);
    items=items.filter(x=>brandKey(canonicalBrand(x.brand))!==brandKey(brand));
  }else if(action==='visibility'){
    const brand=canonicalBrand(data.brand);
    if(!brand||typeof data.railEnabled!=='boolean')return brandJson({error:'Brand and rail visibility are required'},400);
    const i=items.findIndex(x=>brandKey(canonicalBrand(x.brand))===brandKey(brand));
    const item=cleanBrandItem({brand,railEnabled:data.railEnabled},i>=0?items[i]:{});
    if(i>=0)items[i]=item;else items.push(item);
  }else if(action==='associate'){
    const brand=canonicalBrand(data.brand),category=canonicalBrowseCategory(data.category);
    if(!brand||!category)return brandJson({error:'Brand and category are required'},400);
    const i=items.findIndex(x=>brandKey(x.brand)===brandKey(brand));
    const existing=i>=0?items[i]:buildBrandDirectory([],items).find(x=>brandKey(x.brand)===brandKey(brand))||{};
    const item=cleanBrandItem({brand,categories:[...new Set([...(existing.categories||[]),category])]},existing);
    if(i>=0)items[i]=item;else items.push(item);
  }else if(action==='upsert'){
    const input=data.item||{},brand=canonicalBrand(input.brand);
    if(!brand)return brandJson({error:'Brand is required'},400);
    const i=items.findIndex(x=>brandKey(canonicalBrand(x.brand))===brandKey(brand));
    const item=cleanBrandItem({...input,brand},i>=0?items[i]:{});
    if(i>=0)items[i]=item;else items.push(item);
  }else if(action==='replace'&&Array.isArray(data.items)){
    items=data.items.map(x=>cleanBrandItem(x)).filter(x=>x.brand);
  }else return brandJson({error:'Unsupported action'},400);
  await saveBrandRail(env,items);
  return brandJson({ok:true,items});
}

function isPublicMediaList(request,url){
  // Customer catalogue requests are identical regardless of legacy cache-buster
  // query params (_attempt / _).  Never send those requests into the slow R2
  // object listing while a safe public index exists.
  return request.method==='GET'&&
    url.pathname==='/api/media'&&
    !url.searchParams.get('key')&&
    !url.searchParams.get('prefix')&&
    !url.searchParams.has('cursor')&&
    !url.searchParams.has('scope')&&
    !(request.headers.get('referer')||'').includes('/admin-products');
}

let lastCatalogueIndexRefreshAttempt = 0;
async function indexedMedia(env,ctx){
  if(!env.PRODUCT_MEDIA)return null;
  const index=await env.PRODUCT_MEDIA.get(PUBLIC_MEDIA_INDEX_KEY);
  if(!index)return null;
  const age=index.uploaded?Date.now()-new Date(index.uploaded).getTime():Infinity;
  // Scheduled refresh and upload/approval actions update this index. Keep the
  // most recent valid public copy usable for a bounded outage of R2 listing,
  // rather than re-enumerating every catalogue folder after only 2 minutes.
  if(!Number.isFinite(age)||age<0||age>60*60*1000)return null;
  // A failed/missed cron can self-heal without delaying the customer response.
  if(age>10*60*1000&&ctx&&typeof ctx.waitUntil==='function'&&
     Date.now()-lastCatalogueIndexRefreshAttempt>5*60*1000){
    lastCatalogueIndexRefreshAttempt=Date.now();
    ctx.waitUntil(refreshPublicMediaIndex(env).catch(()=>{}));
  }
  // Never serve an accidentally empty/corrupt fast index to customers.  Falling
  // through makes the canonical R2 listing rebuild the response instead.
  let body;
  try{
    body=await index.text();
    const data=JSON.parse(body);
    if(!Array.isArray(data.items)||data.items.length===0)return null;
    let changed=false;
    for(const item of STATIC_PUBLIC_MEDIA){if(!data.items.some(x=>x.key===item.key)){data.items.push({...item,url:'/api/media?key='+encodeURIComponent(item.key)});changed=true}}
    data.items=data.items.filter(item=>{
      const visible=!isHiddenMediaKey(item&&item.key)&&!isHiddenMediaKey(item&&item.sourceKey);
      if(!visible)changed=true;
      return visible;
    }).map(item=>{
      const category=canonicalMediaCategory(item);
      if(category!==item.category){item={...item,category};changed=true}
      const source=String(item&&item.sourceKey||'');
      if(!source.startsWith('library/'))return item;
      const query=new URLSearchParams({source,brand:String(item.brand||''),category:String(item.category||''),catalogue:String(item.catalogue||item.title||'')});
      const coverUrl='/api/catalogue-cover?'+query.toString();
      if(item.coverUrl===coverUrl)return item;
      changed=true;return{...item,coverUrl};
    });
    const unique=dedupeCatalogueItems(data.items);if(unique.length!==data.items.length){data.items=unique;changed=true}
    if(data.total!==data.items.length){data.total=data.items.length;changed=true}
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
  let key=url.searchParams.get('key')||'';
  if(url.pathname!=='/api/media'||url.searchParams.get('raw')!=='1'||!/\.pdf$/i.test(key))return null;
  let head=await env.PRODUCT_MEDIA.head(key);
  if(!head&&canonicalCatalogueKey(key)!==key){key=canonicalCatalogueKey(key);head=await env.PRODUCT_MEDIA.head(key);}
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
    // Finance is paused while its independent platform is completed.
    if(url.pathname==='/finance'||url.pathname.startsWith('/finance/'))return new Response(null,{status:302,headers:{location:'/','cache-control':'no-store','x-robots-tag':'noindex'}});
    if(request.method==='GET'&&['/products/','/products','/products/index.html'].includes(url.pathname)&&url.searchParams.get('category')){
      const target=new URL('/products/brands/',url);target.search=url.search;
      return Response.redirect(target.href,302);
    }
    if(request.method==='GET'&&['/api/brand-directory','/api/catalog-master','/api/categories'].includes(url.pathname))return brandJson(await loadCatalogMaster(request,env,ctx));
    if((request.method==='GET'||request.method==='HEAD')&&url.pathname==='/api/media'){
      const asset=STATIC_PUBLIC_MEDIA.find(item=>item.key===url.searchParams.get('key'));
      if(asset)return env.ASSETS.fetch(new Request(new URL(asset.staticUrl,url),request));
    }
    if(url.pathname==='/api/media'&&(url.searchParams.get('key')||'').startsWith('vendor-public/')){
      const key=url.searchParams.get('key'),parts=key.split('/');
      const [vendorObject,productObject]=await Promise.all([env.PRODUCT_MEDIA.get('private/vendors/records/'+parts[1]+'.json'),env.PRODUCT_MEDIA.get('private/vendors/products/'+parts[2]+'.json')]);
      const vendor=vendorObject?await vendorObject.json():null,product=productObject?await productObject.json():null;
      if(vendor?.status!=='approved'||product?.vendorId!==parts[1]||!product?.publicKeys?.includes(key))return brandJson({error:'Not found'},404);
    }
    if(url.pathname==='/api/list-quote'||url.pathname.startsWith('/api/list-quote/'))return handleListQuote(request,env);
    if(url.pathname==='/api/vendor-applications'||url.pathname.startsWith('/api/vendor-applications/')||url.pathname.startsWith('/api/vendor/')){
      const response=await handleVendor(request,env,ctx);
      if(request.method==='POST'&&response.ok&&['/api/vendor-applications/status','/api/vendor-applications/products/review','/api/vendor/products/archive'].includes(url.pathname)){try{await refreshPublicMediaIndex(env)}catch{try{await env.PRODUCT_MEDIA.delete(PUBLIC_MEDIA_INDEX_KEY)}catch{}}}
      return response;
    }
    if(['/vendor/','/vendor','/become-a-vendor/','/become-a-vendor','/admin-products/vendors/','/admin-products/vendors','/vendor/index.html','/become-a-vendor/index.html','/admin-products/vendors/index.html'].includes(url.pathname)){
      if(url.pathname.startsWith('/admin-products/')&&!await brandAuthorized(request,env))return Response.redirect(new URL('/admin-products/',url).href,302);
      const path=url.pathname.endsWith('index.html')?url.pathname:url.pathname.endsWith('/')?url.pathname:url.pathname+'/';
      const asset=await env.ASSETS.fetch(new Request(new URL(path,url),request));
      const headers=new Headers(asset.headers);headers.set('cache-control','private, no-store');headers.set('x-robots-tag','noindex');
      return new Response(asset.body,{status:asset.status,headers});
    }
    if(url.pathname==='/api/enquiries')return handleEnquiries(request,env);
    if(url.pathname==='/api/media'&&(isHiddenMediaKey(url.searchParams.get('key'))||isHiddenMediaKey(url.searchParams.get('prefix'))))return brandJson({error:'Not found'},404);
    // Previously rendered/bookmarked cards may refer to a retired sync copy.
    // Preserve their original/download links after scheduled cleanup too.
    if((request.method==='GET'||request.method==='HEAD')&&url.pathname==='/api/media'&&url.searchParams.get('download')==='1'){
      const key=url.searchParams.get('key')||'',canonical=canonicalCatalogueKey(key);
      if(canonical!==key&&!await env.PRODUCT_MEDIA.head(key)&&await env.PRODUCT_MEDIA.head(canonical)){
        url.searchParams.set('key',canonical);return Response.redirect(url.href,302);
      }
    }
    if(url.pathname==='/api/brands'&&(request.method==='GET'||request.method==='POST'))return handleBrandRail(request,env,ctx);
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
          const back=url.searchParams.get('return');
          target.searchParams.set('return',back&&back.startsWith('/')&&!back.startsWith('//')?back:'/catalogues/');
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
      if(url.searchParams.get('cover'))target.searchParams.set('cover',url.searchParams.get('cover'));
      const back=url.searchParams.get('return');
      target.searchParams.set('return',back&&back.startsWith('/')&&!back.startsWith('//')?back:'/catalogues/');
      return Response.redirect(target.href,302);
    }
    if((request.method==='GET'||request.method==='HEAD')&&url.pathname.startsWith('/products/presentation/')){
      const asset=await env.ASSETS.fetch(request);
      const headers=new Headers(asset.headers);
      // All catalogue folders use this one PDF viewer. It used to send no-store
      // for every 430KB PDF.js module and 1.2MB worker, forcing a cold download
      // on every catalogue opened. Cache *only* public static assets; the
      // dynamic viewer HTML still receives fresh no-store headers.
      const isHtml=(headers.get('content-type')||'').includes('text/html');
      if(asset.ok&&!isHtml){
        headers.set('cache-control','public, max-age=86400, s-maxage=86400');
        headers.delete('pragma');headers.delete('expires');
      }else{
        headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
        headers.set('pragma','no-cache');headers.set('expires','0');
      }
      if(request.method==='HEAD'||!isHtml)return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
      let html=await asset.text();
      const fixedBack='<script id="woodrick-fixed-catalogue-back">(function(){var b=document.getElementById("catalogueBack"),p=new URLSearchParams(location.search),back=p.get("return")||"/catalogues/";if(!b)return;b.href=back.startsWith("/")&&!back.startsWith("//")?back:"/catalogues/";})();</script>';
      if(!html.includes('woodrick-fixed-catalogue-back'))html=html.replace('</body>',fixedBack+'\n</body>');
      headers.delete('content-length');
      return new Response(html,{status:asset.status,statusText:asset.statusText,headers});
    }
    if(request.method==='GET'&&url.pathname.startsWith('/catalogue-covers/')){
      const response=await cachedCatalogueCover(request,env);
      if(response)return response;
    }
    if(isPublicMediaList(request,url)){
      try{const response=await indexedMedia(env,ctx);if(response)return response}catch{}
    }
    let response=await app.fetch(request,env,ctx);
    if(request.method==='POST'&&url.pathname==='/api/upload'&&response.ok){
      try{await refreshPublicMediaIndex(env)}catch{try{await env.PRODUCT_MEDIA.delete(PUBLIC_MEDIA_INDEX_KEY)}catch{}}
    }
    if(url.pathname==='/api/media'&&request.method==='GET'&&!url.searchParams.get('key')&&!url.searchParams.get('prefix')&&
    !url.searchParams.has('_')&&
    !url.searchParams.has('scope')&&response.ok){
      try{const data=await response.clone().json();if(Array.isArray(data.items)&&data.items.some(x=>String(x.key||'').startsWith('private/'))){data.items=data.items.filter(x=>!String(x.key||'').startsWith('private/'));data.total=data.items.length;return brandJson(data)}}catch{}
    }
    return request.method==='GET'?consistentCustomerResponse(response,url):response;
  },
  async scheduled(controller,env,ctx){
    ctx.waitUntil(Promise.all([
      backfillDesignIndex(env,3),
      syncAndClean(env).then(()=>refreshPublicMediaIndex(env))
    ]));
  }
};
