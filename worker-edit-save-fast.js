import app from './worker-edit-category-sync.js';

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate, max-age=0'}})}
function clean(v=''){return String(v||'').trim()}
function slug(v=''){return clean(v).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'item'}
function passwordOk(request,env){return !!env.ADMIN_UPLOAD_TOKEN&&(request.headers.get('authorization')||'')===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`}
function norm(v=''){return clean(v).toLowerCase()}
function sameCatalogue(meta,old){return norm(meta.brand)===norm(old.brand)&&norm(meta.category)===norm(old.category)&&norm(meta.catalogue||meta.title)===norm(old.catalogue||old.title)}
async function listAll(env){const out=[];let cursor;const seen=new Set();for(let i=0;i<200;i++){const opts={limit:1000,include:['customMetadata','httpMetadata']};if(cursor)opts.cursor=cursor;const r=await env.PRODUCT_MEDIA.list(opts);out.push(...r.objects);if(!r.truncated||!r.cursor||seen.has(r.cursor))break;seen.add(r.cursor);cursor=r.cursor}return out}
async function mapLimit(items,limit,fn){for(let i=0;i<items.length;i+=limit)await Promise.all(items.slice(i,i+limit).map(fn))}
function findLibrarySource(all,sourceKey,old){
  let source=all.find(o=>o.key===sourceKey);
  if(source)return source;
  const wantedBrand=norm(old.brand),wantedCatalogue=norm(old.catalogue||old.title);
  source=all.find(o=>String(o.key||'').startsWith('library/')&&norm((o.customMetadata||{}).type)==='original-pdf'&&norm((o.customMetadata||{}).brand)===wantedBrand&&norm((o.customMetadata||{}).catalogue||(o.customMetadata||{}).title)===wantedCatalogue);
  return source||null;
}
async function migrateLibrary(env,sourceKey,category,brand,catalogue,syncMeta){
  const all=await listAll(env);
  const source=findLibrarySource(all,sourceKey,syncMeta||{});
  if(!source)throw new Error('Library source catalogue was not found. Refresh the Product List and try again.');
  const old=source.customMetadata||{};
  let targets=all.filter(o=>String(o.key||'').startsWith('library/')&&sameCatalogue(o.customMetadata||{},old));
  if(!targets.length){const root=String(source.key).split('/original/')[0]+'/';targets=all.filter(o=>String(o.key||'').startsWith(root))}
  if(!targets.length)throw new Error('Library catalogue files were not found');
  const root=`library/${slug(brand)}/${slug(category)}/${slug(catalogue)}`;let newSourceKey='';const written=[];
  await mapLimit(targets,8,async o=>{const obj=await env.PRODUCT_MEDIA.get(o.key);if(!obj)return;const m=o.customMetadata||{},type=norm(m.type),page=clean(m.page);let newKey;if(type==='original-pdf')newKey=`${root}/original/${slug(catalogue)}.pdf`;else if(type==='jpg-page')newKey=`${root}/jpg/page-${String(page||'1').padStart(3,'0')}.jpg`;else newKey=`${root}/${slug(type||'file')}/${String(o.key).split('/').pop()}`;const meta={...m,category,brand,catalogue,title:type==='jpg-page'?`${catalogue} page ${page||'1'}`:catalogue,editedAt:new Date().toISOString()};await env.PRODUCT_MEDIA.put(newKey,obj.body,{httpMetadata:o.httpMetadata||obj.httpMetadata,customMetadata:meta});written.push(newKey);if(type==='original-pdf')newSourceKey=newKey});
  if(!newSourceKey)throw new Error('Original library PDF could not be moved');
  await mapLimit(targets,250,async o=>{if(!written.includes(o.key))await env.PRODUCT_MEDIA.delete(o.key)});
  return {newSourceKey,written};
}
async function fastEdit(env,key,category,brand,catalogue){
  if(!env.PRODUCT_MEDIA)throw new Error('Media storage is not configured');
  const head=await env.PRODUCT_MEDIA.head(key);if(!head)throw new Error('Catalogue was not found. Refresh the Product List and try again.');const old=head.customMetadata||{};
  const synced=String(key).startsWith('product-sync/')||String(old.source||'')==='library-sync'||String(old.sourceKey||'').startsWith('library/');
  if(synced){const moved=await migrateLibrary(env,old.sourceKey||'',category,brand,catalogue,old);const source=await env.PRODUCT_MEDIA.get(moved.newSourceKey);if(!source)throw new Error('Updated library PDF could not be read');const newKey=`product-sync/${slug(category)}/${slug(brand)}/${slug(catalogue)}.pdf`;const meta={...old,category,brand,catalogue,title:catalogue,source:'library-sync',sourceKey:moved.newSourceKey,sourceUploadedAt:new Date().toISOString(),editedAt:new Date().toISOString()};await env.PRODUCT_MEDIA.put(newKey,source.body,{httpMetadata:{contentType:'application/pdf'},customMetadata:meta});if(key!==newKey)await env.PRODUCT_MEDIA.delete(key);return{key:newKey,scope:'library-and-product',migrated:moved.written.length}}
  if(String(key).startsWith('library/'))throw new Error('Please edit this catalogue from the Products list.');
  const obj=await env.PRODUCT_MEDIA.get(key);if(!obj)throw new Error('Catalogue file could not be read');const type=norm(old.type)||'pdf',ext=String(old.originalName||key).toLowerCase().endsWith('.pdf')?'pdf':((String(key).split('.').pop()||'pdf').replace(/[^a-z0-9]/g,'')||'pdf');const newKey=`${slug(category)}/${slug(brand)}/${slug(catalogue)}/${slug(type)}/${Date.now()}-${slug(catalogue)}.${ext}`;const meta={...old,category,brand,catalogue,title:catalogue,editedAt:new Date().toISOString()};await env.PRODUCT_MEDIA.put(newKey,obj.body,{httpMetadata:head.httpMetadata||obj.httpMetadata,customMetadata:meta});if(key!==newKey)await env.PRODUCT_MEDIA.delete(key);return{key:newKey,scope:'product-media'}
}

const uiPatch=`<script id="woodrick-edit-save-guard-v1">(function(){document.addEventListener('click',function(e){var b=e.target.closest('#woodrickEditSave');if(!b)return;setTimeout(function(){if(b.disabled&&b.textContent.indexOf('SAVING')>=0){var card=b.closest('.woodrick-edit-card');if(card&&!card.querySelector('.woodrick-save-note')){var n=document.createElement('div');n.className='woodrick-save-note';n.style.cssText='margin-top:10px;font-size:11px;color:#6d675e';n.textContent='Updating catalogue and category. Large Library catalogues may take a few seconds.';card.appendChild(n)} }},700)},true)})();</script>`;

export default{async fetch(request,env,ctx){const url=new URL(request.url);if(request.method==='POST'&&url.pathname==='/api/admin-media-edit'){if(!passwordOk(request,env))return json({error:'Correct admin password is required.'},401);let body={};try{body=await request.json()}catch{return json({error:'Invalid request'},400)}const key=clean(body.key),category=clean(body.category),brand=clean(body.brand),catalogue=clean(body.catalogue);if(!key||!category||!brand||!catalogue)return json({error:'Catalogue key, category, brand and catalogue name are required.'},400);try{return json({ok:true,...await fastEdit(env,key,category,brand,catalogue)})}catch(err){return json({error:String(err?.message||err)},500)}}const response=await app.fetch(request,env,ctx);const isAdmin=request.method==='GET'&&(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html');if(!isAdmin)return response;const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;let html=await response.text();if(!html.includes('woodrick-edit-save-guard-v1'))html=html.replace('</body>',uiPatch+'\n</body>');const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-version','edit-save-fast-v2-stale-source-recovery');return new Response(html,{status:response.status,statusText:response.statusText,headers:h})}};
