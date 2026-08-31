import app from './worker-home.js';

const allowedTypes=new Set(['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm']);
const maxBytes=100*1024*1024;
const enc=new TextEncoder();
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache','expires':'0'}})}
function slug(v=''){return String(v||'').toLowerCase().trim().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'item'}
function norm(v=''){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}
function isLibraryType(v){return v==='original-pdf'||v==='jpg-page'}
function cookieValue(request,name){const raw=request.headers.get('cookie')||'';for(const part of raw.split(';')){const [k,...rest]=part.trim().split('=');if(k===name)return rest.join('=')}return''}
async function sessionValue(secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,enc.encode('woodrick-admin-session-v1'));return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function authorized(request,env){if(!env.ADMIN_UPLOAD_TOKEN)return false;const auth=request.headers.get('authorization')||'';if(auth===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`)return true;return cookieValue(request,'woodrick_admin')===await sessionValue(env.ADMIN_UPLOAD_TOKEN)}

async function listAll(env,prefix=''){
  const objects=[];let cursor;let loops=0;const seen=new Set();
  while(loops<200&&objects.length<100000){
    const opts={limit:1000,include:['customMetadata','httpMetadata']};if(prefix)opts.prefix=prefix;if(cursor)opts.cursor=cursor;
    const listed=await env.PRODUCT_MEDIA.list(opts);objects.push(...listed.objects);loops++;
    if(!listed.truncated||!listed.cursor||seen.has(listed.cursor))break;seen.add(listed.cursor);cursor=listed.cursor;
  }
  return objects;
}

function recoverItem(o){
  const m={...(o.customMetadata||{})};const key=o.key||'';const parts=key.split('/');
  if(key.startsWith('library/')){
    const brand=m.brand||parts[1]||'Unknown Brand',category=m.category||parts[2]||'Other',catalogue=m.catalogue||parts[3]||m.title||'Catalogue';
    let type=m.type||'';if(!type&&parts[4]==='original')type='original-pdf';if(!type&&parts[4]==='jpg')type='jpg-page';
    let page=m.page||'';if(!page&&type==='jpg-page'){const mm=(parts[5]||'').match(/page-(\d+)/i);if(mm)page=String(Number(mm[1]))}
    return {key,size:o.size,uploaded:o.uploaded,url:`/api/media?key=${encodeURIComponent(key)}`,library:'1',...m,brand,category,catalogue,type,page};
  }
  if(!isLibraryType(m.type))return null;
  let title=String(m.title||'').trim();let page=String(m.page||'').trim();
  if(m.type==='jpg-page'){
    const mm=title.match(/\s+page\s+(\d+)\s*$/i);if(mm){if(!page)page=mm[1];title=title.slice(0,mm.index).trim()}
    if(!page){const km=key.match(/page[-_ ]?(\d+)/i);if(km)page=km[1]}
  }
  const catalogue=String(m.catalogue||title||m.originalName||'Catalogue').replace(/\.pdf$/i,'').trim();
  const category=String(m.category||'Other').trim();
  const brand=String(m.brand||catalogue.split(/\s+/)[0]||'Unknown Brand').trim();
  return {key,size:o.size,uploaded:o.uploaded,url:`/api/media?key=${encodeURIComponent(key)}`,library:'1',...m,brand,category,catalogue,type:m.type,page};
}

async function libraryMedia(request,env){
  if(!env.PRODUCT_MEDIA)return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);
  const url=new URL(request.url);const key=url.searchParams.get('key');
  if(key)return app.fetch(request,env);
  const prefix=url.searchParams.get('prefix')||'';
  if(!prefix.startsWith('library/'))return app.fetch(request,env);
  try{
    const objects=await listAll(env,'');const items=objects.map(recoverItem).filter(Boolean).sort((a,b)=>String(b.uploadedAt||b.uploaded).localeCompare(String(a.uploadedAt||a.uploaded)));
    return json({items,truncated:false,cursor:null,total:items.length,mode:'library-recovery-v2'});
  }catch(err){return json({error:'Library media listing failed',detail:String(err&&err.message||err)},500)}
}

async function deleteLibrary(request,env,body){
  if(!env.PRODUCT_MEDIA)return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);
  if(!await authorized(request,env))return json({error:'Invalid admin access code'},401);
  const keys=[...new Set((Array.isArray(body&&body.keys)?body.keys:[]).filter(k=>typeof k==='string'&&k))];if(!keys.length)return json({error:'No library files selected'},400);
  let deleted=0,skipped=0;
  for(const key of keys){const head=await env.PRODUCT_MEDIA.head(key);const type=head&&head.customMetadata&&head.customMetadata.type;if(key.startsWith('library/')||isLibraryType(type)){await env.PRODUCT_MEDIA.delete(key);deleted++}else skipped++}
  return json({ok:true,deleted,skipped});
}

async function libraryUpload(request,env,form){
  if(!env.PRODUCT_MEDIA)return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);
  if(!await authorized(request,env))return json({error:'Invalid admin access code'},401);
  const file=form.get('file'),category=String(form.get('category')||'').trim(),type=String(form.get('type')||'').trim(),title=String(form.get('title')||'').trim(),brand=String(form.get('brand')||'Woodrick').trim(),catalogue=String(form.get('catalogue')||title).trim(),page=String(form.get('page')||'').trim(),overwrite=String(form.get('overwrite')||'')==='1';
  const designNumbers=String(form.get('designNumbers')||'').toUpperCase().split(/[\s,;|·]+/).map(x=>x.trim()).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).slice(0,60).join(',');
  if(!file||typeof file.arrayBuffer!=='function')return json({error:'Please select a file'},400);if(!category||!title||!brand||!catalogue)return json({error:'Brand, category and catalogue are required'},400);if(!allowedTypes.has(file.type))return json({error:'Unsupported file type'},415);if(file.size>maxBytes)return json({error:'File is too large. Maximum size is 100 MB.'},413);
  const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');const root=`library/${slug(brand)}/${slug(category)}/${slug(catalogue)}`;
  if(type==='original-pdf'){
    const existing=await listAll(env,root+'/');
    if(existing.length&&!overwrite)return json({duplicate:true,error:'Catalogue already uploaded',message:`${brand} → ${category} → ${catalogue} is already uploaded.\n\nOK = REPLACE EXISTING\nCancel = KEEP / ESCAPE`,existingCount:existing.length},409);
    if(existing.length&&overwrite){for(const o of existing)await env.PRODUCT_MEDIA.delete(o.key)}
  }
  let key;if(type==='original-pdf')key=`${root}/original/${slug(catalogue)}.pdf`;else if(type==='jpg-page')key=`${root}/jpg/page-${String(page||'1').padStart(3,'0')}.jpg`;else key=`${root}/${slug(type||'file')}/${Date.now()}-${slug(title)}.${ext}`;
  const meta={category,title,type,brand,catalogue,page,designNumbers,library:'1',originalName:file.name,uploadedAt:new Date().toISOString()};await env.PRODUCT_MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||'application/octet-stream'},customMetadata:meta});
  const verify=await env.PRODUCT_MEDIA.head(key);if(!verify)return json({error:'Upload verification failed after storage write'},500);
  return json({ok:true,key,category,title,type,brand,catalogue,page,designNumbers,url:`/api/media?key=${encodeURIComponent(key)}`,verified:true,replaced:overwrite},201);
}

async function productUpload(request,env,form){
  if(!env.PRODUCT_MEDIA)return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);
  if(!await authorized(request,env))return json({error:'Admin login required'},401);
  const file=form.get('file'),category=String(form.get('category')||'').trim(),type=String(form.get('type')||'').trim(),title=String(form.get('title')||'').trim(),overwrite=String(form.get('overwrite')||'')==='1';
  if(!file||typeof file.arrayBuffer!=='function')return json({error:'Please select a file'},400);if(!category||!title)return json({error:'Category and title are required'},400);if(!allowedTypes.has(file.type))return json({error:'Unsupported file type'},415);if(file.size>maxBytes)return json({error:'File is too large. Maximum size is 100 MB.'},413);
  const objects=await listAll(env,'');const dup=objects.filter(o=>{const m=o.customMetadata||{};if(m.library==='1'||isLibraryType(m.type)||o.key.startsWith('library/'))return false;const sameIdentity=norm(m.category)===norm(category)&&norm(m.type)===norm(type)&&norm(m.title)===norm(title);const sameFile=norm(m.category)===norm(category)&&norm(m.type)===norm(type)&&norm(m.originalName)===norm(file.name);return sameIdentity||sameFile});
  if(dup.length&&!overwrite)return json({duplicate:true,error:'Already uploaded',message:`${title} is already uploaded in ${category}.\n\nOK = REPLACE EXISTING\nCancel = KEEP / ESCAPE`,existingCount:dup.length},409);
  if(dup.length&&overwrite){for(const o of dup)await env.PRODUCT_MEDIA.delete(o.key)}
  const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');const key=`${slug(category)}/${slug(type||'file')}/${slug(title)}.${ext}`;const meta={category,title,type,originalName:file.name,uploadedAt:new Date().toISOString()};
  await env.PRODUCT_MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||'application/octet-stream'},customMetadata:meta});
  return json({ok:true,key,category,title,type,url:`/api/media?key=${encodeURIComponent(key)}`,replaced:overwrite},201);
}

const duplicateGuard=`<script id="woodrick-duplicate-upload-guard-v1">(function(){var originalFetch=window.fetch.bind(window);window.fetch=async function(input,init){var response=await originalFetch(input,init);try{if(String(input).indexOf('/api/upload')<0||response.status!==409||!init||!(init.body instanceof FormData))return response;var data=await response.clone().json();if(!data||!data.duplicate)return response;var ok=window.confirm(data.message||'This item is already uploaded.\n\nOK = REPLACE EXISTING\nCancel = KEEP / ESCAPE');if(!ok)return new Response(JSON.stringify({error:'Upload cancelled. Existing item kept.',cancelled:true}),{status:409,headers:{'content-type':'application/json'}});var fd=new FormData();for(var pair of init.body.entries())fd.append(pair[0],pair[1]);fd.set('overwrite','1');var next=Object.assign({},init,{body:fd});return originalFetch(input,next)}catch(e){return response}}})();<\/script>`;
async function injectDuplicateGuard(response,url){if(requestMethodSafe(url)&&response.headers.get('content-type')?.includes('text/html')){let html=await response.text();if(!html.includes('woodrick-duplicate-upload-guard-v1'))html=html.includes('</body>')?html.replace('</body>',duplicateGuard+'\n</body>'):html+duplicateGuard;const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-duplicate-guard','v1');return new Response(html,{status:response.status,statusText:response.statusText,headers:h})}return response}
function requestMethodSafe(url){return url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html'}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/api/media')return libraryMedia(request,env);
  if(request.method==='POST'&&url.pathname==='/api/upload'){
    const ct=(request.headers.get('content-type')||'').toLowerCase();
    if(ct.includes('application/json')){let body;try{body=await request.clone().json()}catch{return app.fetch(request,env,ctx)}if(body&&body.action==='delete-library')return deleteLibrary(request,env,body);return app.fetch(request,env,ctx)}
    if(ct.includes('multipart/form-data')){let form;try{form=await request.clone().formData()}catch{return app.fetch(request,env,ctx)}if(String(form.get('library')||'')==='1')return libraryUpload(request,env,form);return productUpload(request,env,form)}
  }
  let response=await app.fetch(request,env,ctx);if(request.method==='GET'&&requestMethodSafe(url))response=await injectDuplicateGuard(response,url);return response;
}};
