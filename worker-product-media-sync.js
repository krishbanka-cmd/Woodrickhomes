import app from './worker-admin-layout-polish.js';

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate, max-age=0'}})}
function norm(v=''){return String(v||'').trim().toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
function slug(v=''){return String(v||'').toLowerCase().trim().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'item'}
function canonicalCategory(v=''){
  const n=norm(v),map={
    'louver':'Louvers','louvers':'Louvers','louver panel':'Louvers','louver panels':'Louvers',
    'laminate':'Laminates','laminates':'Laminates',
    'door skin':'Doors','door skins':'Doors','door':'Doors','doors':'Doors',
    'acrylic':'Acrylic Laminates','acrylic laminate':'Acrylic Laminates','acrylic laminates':'Acrylic Laminates',
    'plywood':'Plywood','plywoods':'Plywood'
  };
  return map[n]||String(v||'').trim();
}
function isLibrary(o){const m=o.customMetadata||{};return String(o.key||'').startsWith('library/')||String(m.library||'')==='1'||m.type==='original-pdf'||m.type==='jpg-page'}
function isLibraryPdf(o){const m=o.customMetadata||{};return String(o.key||'').startsWith('library/')&&(m.type==='original-pdf'||String(m.originalName||'').toLowerCase().endsWith('.pdf'))||m.type==='original-pdf'}
function typeOf(o){const m=o.customMetadata||{},name=String(m.originalName||o.key||'').toLowerCase(),t=String(m.type||'').toLowerCase();if(t==='original-pdf'||t==='pdf'||name.endsWith('.pdf'))return'pdf';if(t==='video'||/\.(mp4|webm)$/.test(name))return'video';return'image'}
function catalogueOf(o){const m=o.customMetadata||{};return String(m.catalogue||m.title||m.originalName||'Catalogue').replace(/\.[a-z0-9]{2,5}$/i,'').replace(/\s+page\s*\d+\s*$/i,'').trim()||'Catalogue'}
function brandOf(o){const m=o.customMetadata||{};if(String(m.brand||'').trim())return String(m.brand).trim();const c=catalogueOf(o),first=(c.match(/^[A-Za-z0-9&+-]+/)||[])[0];return first||'Other'}
function identity(o){const m=o.customMetadata||{};return [norm(canonicalCategory(m.category||'')),typeOf(o),norm(catalogueOf(o))].join('|')}
function syncKeyFor(o){const m=o.customMetadata||{},brand=brandOf(o),category=canonicalCategory(m.category||'Other'),catalogue=catalogueOf(o);return `product-sync/${slug(category)}/${slug(brand)}/${slug(catalogue)}.pdf`}

async function listAll(env,prefix=''){
  const out=[];let cursor;const seen=new Set();
  for(let i=0;i<200;i++){
    const opts={limit:1000,include:['customMetadata','httpMetadata']};if(prefix)opts.prefix=prefix;if(cursor)opts.cursor=cursor;
    const r=await env.PRODUCT_MEDIA.list(opts);out.push(...r.objects);
    if(!r.truncated||!r.cursor||seen.has(r.cursor))break;seen.add(r.cursor);cursor=r.cursor;
  }
  return out;
}

async function listCustomerMedia(env){
  const synced=await listAll(env,'product-sync/'),root=await env.PRODUCT_MEDIA.list({limit:1000,delimiter:'/',include:['customMetadata','httpMetadata']}),skip=new Set(['library/','product-sync/','_system/','_config/']);
  const prefixes=(root.delimitedPrefixes||[]).filter(prefix=>!skip.has(prefix));
  const legacy=(await Promise.all(prefixes.map(prefix=>listAll(env,prefix)))).flat().filter(o=>!isLibrary(o));
  return [...synced,...legacy,...(root.objects||[]).filter(o=>!isLibrary(o))];
}

async function putSyncedPdf(env,lib){
  const m=lib.customMetadata||{},key=syncKeyFor(lib),existing=await env.PRODUCT_MEDIA.head(key);
  const stamp=String(m.uploadedAt||lib.uploaded||''),same=existing&&String((existing.customMetadata||{}).sourceKey||'')===String(lib.key)&&String((existing.customMetadata||{}).sourceUploadedAt||'')===stamp&&Number(existing.size||0)===Number(lib.size||0);
  if(same)return key;
  const obj=await env.PRODUCT_MEDIA.get(lib.key);if(!obj)return null;
  const category=canonicalCategory(m.category||'Other'),brand=brandOf(lib),catalogue=catalogueOf(lib);
  const meta={category,brand,catalogue,title:catalogue,type:'pdf',originalName:m.originalName||`${catalogue}.pdf`,source:'library-sync',sourceKey:lib.key,sourceUploadedAt:stamp,syncedAt:new Date().toISOString()};
  await env.PRODUCT_MEDIA.put(key,obj.body,{httpMetadata:{contentType:'application/pdf'},customMetadata:meta});
  return key;
}

async function syncAndClean(env){
  if(!env.PRODUCT_MEDIA)return {synced:0,deleted:0};
  let objects=await listAll(env);const libraries=objects.filter(isLibraryPdf);let synced=0,deleted=0;
  const libIds=new Map();
  for(const lib of libraries){const m=lib.customMetadata||{},id=[norm(canonicalCategory(m.category||'')),'pdf',norm(catalogueOf(lib))].join('|');libIds.set(id,lib);const before=await env.PRODUCT_MEDIA.head(syncKeyFor(lib));await putSyncedPdf(env,lib);if(!before)synced++}
  objects=await listAll(env);
  const publicObjects=objects.filter(o=>!isLibrary(o));
  const byId=new Map();
  for(const o of publicObjects){
    const m=o.customMetadata||{},id=identity(o),title=String(m.title||'').trim(),page=title.match(/^(.*?)\s+page\s*(\d+)\s*$/i);
    if(page){const stem=[norm(canonicalCategory(m.category||'')),'pdf',norm(page[1])].join('|');if(libIds.has(stem)){await env.PRODUCT_MEDIA.delete(o.key);deleted++;continue}}
    const arr=byId.get(id)||[];arr.push(o);byId.set(id,arr);
  }
  for(const [id,arr] of byId){
    if(arr.length<2&&!libIds.has(id))continue;
    const preferred=arr.find(o=>String(o.key||'').startsWith('product-sync/'))||arr.slice().sort((a,b)=>String(b.uploaded||'').localeCompare(String(a.uploaded||'')))[0];
    for(const o of arr){if(o.key===preferred.key)continue;await env.PRODUCT_MEDIA.delete(o.key);deleted++}
  }
  return {synced,deleted};
}

async function publicMediaList(env){
  const objects=await listCustomerMedia(env),items=[];
  for(const o of objects){const m=o.customMetadata||{},title=String(m.title||'').trim();if(/\s+page\s*\d+\s*$/i.test(title))continue;const category=canonicalCategory(m.category||''),brand=m.brand||brandOf(o),catalogue=m.catalogue||catalogueOf(o),coverQuery=new URLSearchParams({source:String(m.sourceKey||''),brand,category,catalogue});items.push({key:o.key,size:o.size,uploaded:o.uploaded,url:`/api/media?key=${encodeURIComponent(o.key)}`,...m,category,brand,catalogue,coverUrl:'/api/catalogue-cover?'+coverQuery.toString()})}
  items.sort((a,b)=>String(b.syncedAt||b.uploadedAt||b.uploaded||'').localeCompare(String(a.syncedAt||a.uploadedAt||a.uploaded||'')));
  return json({items,total:items.length,truncated:false,cursor:null,mode:'library-canonical-product-media-v1'});
}

async function catalogueCover(request,env){
  if(!env.PRODUCT_MEDIA)return new Response('Not found',{status:404});const q=new URL(request.url).searchParams,source=String(q.get('source')||''),brand=String(q.get('brand')||''),category=canonicalCategory(q.get('category')||''),catalogue=String(q.get('catalogue')||''),roots=[];
  if(source.includes('/original/'))roots.push(source.split('/original/')[0]);if(brand&&category&&catalogue)roots.push(`library/${slug(brand)}/${slug(category)}/${slug(catalogue)}`);
  for(const root of [...new Set(roots)]){const listed=await env.PRODUCT_MEDIA.list({prefix:root+'/jpg/',limit:1,include:['httpMetadata']});const first=listed.objects&&listed.objects[0];if(!first)continue;const object=await env.PRODUCT_MEDIA.get(first.key);if(!object)continue;const headers=new Headers();object.writeHttpMetadata(headers);headers.set('cache-control','public, max-age=86400, stale-while-revalidate=604800');return new Response(object.body,{headers})}
  return new Response('Not found',{status:404,headers:{'cache-control':'public, max-age=300'}});
}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/api/catalogue-cover')return catalogueCover(request,env);
  if(request.method==='GET'&&url.pathname==='/api/media'&&!url.searchParams.get('key')&&!String(url.searchParams.get('prefix')||'').startsWith('library/'))return publicMediaList(env);
  if(request.method==='POST'&&url.pathname==='/api/admin-media-delete'){
    let body={};try{body=await request.clone().json()}catch{}
    if(String(body.key||'').startsWith('product-sync/'))return json({error:'This PDF is synced from Woodrick Home Library. Delete the catalogue from Library to remove it everywhere.'},400);
  }
  let libraryOriginal=false;
  if(request.method==='POST'&&url.pathname==='/api/upload'){
    const ct=(request.headers.get('content-type')||'').toLowerCase();
    if(ct.includes('multipart/form-data')){try{const f=await request.clone().formData();libraryOriginal=String(f.get('library')||'')==='1'&&String(f.get('type')||'')==='original-pdf'}catch{}}
  }
  const response=await app.fetch(request,env,ctx);
  if(libraryOriginal&&response.ok){try{await syncAndClean(env)}catch{}}
  if(request.method==='GET'&&(url.pathname==='/products/'||url.pathname==='/products'||url.pathname==='/admin-products/'||url.pathname==='/admin-products')){ctx&&ctx.waitUntil&&ctx.waitUntil(syncAndClean(env).catch(()=>{}))}
  return response;
}};
