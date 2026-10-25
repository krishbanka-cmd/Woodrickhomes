// Derivatives stay behind the same visibility checks as their original PDF.
const manifests=new WeakMap();
export async function cataloguePages(request,env){
  const url=new URL(request.url),key=url.searchParams.get('key')||'';
  if(!key||/^(?:private|_system|_config)\//i.test(key)||!env.PRODUCT_MEDIA||!env.ASSETS)return new Response('Not found',{status:404});
  let pending=manifests.get(env.ASSETS);
  if(!pending){pending=env.ASSETS.fetch(new Request(new URL('/assets/catalogue-pages/index.json',url))).then(r=>r.ok?r.json():{}).catch(()=>({}));manifests.set(env.ASSETS,pending);}
  const manifest=await pending,entry=Object.hasOwn(manifest,key)?manifest[key]:null;
  if(!entry||!Array.isArray(entry.pages)||!entry.pages.length)return new Response('Not found',{status:404});
  const original=await env.PRODUCT_MEDIA.head(key);
  if(!original||original.httpEtag!==entry.etag)return new Response('Original changed',{status:404,headers:{'cache-control':'no-store'}});
  if(!url.searchParams.has('page'))return Response.json({pages:entry.pages.map((p,i)=>({width:p.width,height:p.height,url:'/api/catalogue-pages?'+new URLSearchParams({key,page:String(i+1),revision:entry.etag})}))},{headers:{'cache-control':'private, max-age=60'}});
  if(url.searchParams.has('revision')&&url.searchParams.get('revision')!==entry.etag)return new Response('Original changed',{status:404});
  const n=Number(url.searchParams.get('page'));
  if(!Number.isInteger(n)||n<1||n>entry.pages.length)return new Response('Not found',{status:404});
  const file=entry.pages[n-1].file;
  if(!/^[a-f0-9]{24}\/\d+\.webp$/.test(file))return new Response('Not found',{status:404});
  const asset=await env.ASSETS.fetch(new Request(new URL('/assets/catalogue-pages/'+file,url)));
  if(!asset.ok)return asset;
  return new Response(request.method==='HEAD'?null:asset.body,{status:200,headers:{'content-type':'image/webp','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
}
