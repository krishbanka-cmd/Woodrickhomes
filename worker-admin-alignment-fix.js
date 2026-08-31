import app from './worker-library-storage-fix.js';

const enc=new TextEncoder();
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache','expires':'0'}})}
function norm(v=''){return String(v||'').trim().toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
function canonicalCategory(v=''){
  const n=norm(v);
  const map={
    'louver':'Louvers','louvers':'Louvers','louver panel':'Louvers','louver panels':'Louvers',
    'laminate':'Laminates','laminates':'Laminates',
    'door skin':'Doors','door skins':'Doors','door':'Doors','doors':'Doors',
    'acrylic':'Acrylic Laminates','acrylic laminate':'Acrylic Laminates','acrylic laminates':'Acrylic Laminates',
    'plywood':'Plywood','plywoods':'Plywood'
  };
  return map[n]||String(v||'').trim();
}
function inferBrand(x){
  if(String(x.brand||'').trim())return String(x.brand).trim();
  const title=String(x.catalogue||x.title||x.originalName||'').replace(/\.[a-z0-9]{2,5}$/i,'').trim();
  const clean=title.replace(/\s+page\s*\d+\s*$/i,'').trim();
  const first=(clean.match(/^[A-Za-z0-9&+-]+/)||[])[0];
  return first||'Other';
}
function inferCatalogue(x){return String(x.catalogue||x.title||x.originalName||'Catalogue').replace(/\.[a-z0-9]{2,5}$/i,'').replace(/\s+page\s*\d+\s*$/i,'').trim()||'Catalogue'}
function isInternal(x){const key=String(x.key||''),t=String(x.type||'').toLowerCase();return key.startsWith('library/')||String(x.library||'')==='1'||t==='original-pdf'||t==='jpg-page'}
function pageStem(x){const title=String(x.title||'').trim();const m=title.match(/^(.*?)\s+page\s*(\d+)\s*$/i);return m?norm((x.category||'')+'|'+m[1]):''}
function publicItems(items,{dedupe=true}={}){
  const raw=(Array.isArray(items)?items:[]).filter(x=>!isInternal(x));
  const stems={};for(const x of raw){const s=pageStem(x);if(s)stems[s]=(stems[s]||0)+1}
  const cleaned=raw.filter(x=>{const s=pageStem(x);return !(s&&stems[s]>1)}).map(x=>({...x,category:canonicalCategory(x.category||''),brand:inferBrand(x),catalogue:inferCatalogue(x)}));
  if(!dedupe)return cleaned;
  const seen=new Set(),out=[];
  for(const x of cleaned){const t=norm(x.type||''),id=[norm(x.category),t,norm(x.catalogue||x.title),norm(x.originalName||'')].join('|');const loose=[norm(x.category),t,norm(x.catalogue||x.title)].join('|');if(seen.has(id)||seen.has(loose))continue;seen.add(id);seen.add(loose);out.push(x)}
  return out;
}
function cookieValue(request,name){const raw=request.headers.get('cookie')||'';for(const part of raw.split(';')){const [k,...rest]=part.trim().split('=');if(k===name)return rest.join('=')}return''}
async function sessionValue(secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,enc.encode('woodrick-admin-session-v1'));return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function authorized(request,env){if(!env.ADMIN_UPLOAD_TOKEN)return false;const auth=request.headers.get('authorization')||'';if(auth===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`)return true;return cookieValue(request,'woodrick_admin')===await sessionValue(env.ADMIN_UPLOAD_TOKEN)}

const alignmentStyle=`
<style id="woodrick-library-action-alignment-v1">
@media (min-width:681px){
  #libraryList .item-actions{display:grid;grid-template-columns:max-content max-content max-content max-content;gap:9px;align-items:center;justify-content:end;min-width:max-content}
  #libraryList .show-catalogue-btn{grid-column:1}
  #libraryList .download-btn:not(.zip-btn){grid-column:2}
  #libraryList .zip-btn{grid-column:3}
  #libraryList .delete-catalogue-btn{grid-column:4}
}
@media (max-width:680px){#libraryList .item-actions{display:flex;width:100%;gap:9px;flex-wrap:wrap}}
.admin-media-delete{border:2px solid #a52a2a;background:#fff;color:#a52a2a;font-weight:900;font-size:11px;cursor:pointer;padding:8px 10px}
</style>`;

const adminMediaCleanup=`
<script id="woodrick-admin-media-cleanup-v1">(function(){
function addDelete(){document.querySelectorAll('#mediaList .item').forEach(function(row){if(row.querySelector('.admin-media-delete'))return;var open=row.querySelector('.open-btn[data-key]');if(!open)return;var b=document.createElement('button');b.type='button';b.className='admin-media-delete';b.textContent='DELETE';b.dataset.key=open.dataset.key;b.onclick=async function(){if(!confirm('Delete this product media item?'))return;b.disabled=true;b.textContent='DELETING…';try{var r=await fetch('/api/admin-media-delete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:b.dataset.key})});var d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||'Delete failed');var refresh=document.getElementById('refreshBtn');if(refresh)refresh.click()}catch(e){alert(e.message);b.disabled=false;b.textContent='DELETE'}};(row.querySelector('.item-actions')||row).appendChild(b)})}
var root=document.getElementById('mediaList');if(root)new MutationObserver(addDelete).observe(root,{childList:true,subtree:true});addDelete();
})();</script>`;

const productHierarchy=`
<style id="woodrick-product-hierarchy-v1">
.brand-choice{cursor:pointer}.brand-choice .media-preview{background:linear-gradient(135deg,#0c0c0c,#242018);color:#f0c96b;font-family:Georgia,serif;font-size:34px;font-weight:700;text-align:center;padding:24px}.brand-choice .media-title{margin-bottom:4px}.hierarchy-back{display:inline-flex;margin:0 0 18px;padding:10px 14px;border:1px solid #f0c96b;background:#171717;color:#f0c96b;font-size:11px;font-weight:900;cursor:pointer}.catalogue-media-label{font-size:10px;color:#aaa;margin-top:6px}.media-preview.clean-pdf{background:#0b0b0b;color:#f0c96b;font-size:56px}
</style>
<script id="woodrick-product-hierarchy-script-v1">(function(){
var selectedBrand='';
function n(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function brandOf(x){return String(x.brand||'Other').trim()||'Other'}
function catalogueOf(x){return String(x.catalogue||x.title||x.originalName||'Catalogue').replace(/\.[a-z0-9]{2,5}$/i,'').replace(/\s+page\s*\d+\s*$/i,'').trim()||'Catalogue'}
function typeLabel(t){return t==='pdf'?'PDF':t==='video'?'VIDEO':'PHOTO'}
function grouped(items){var g={};items.forEach(function(x){var k=n(x.category)+'|'+n(brandOf(x))+'|'+n(catalogueOf(x));if(!g[k])g[k]={category:x.category||'Uncategorised',brand:brandOf(x),catalogue:catalogueOf(x),items:[]};g[k].items.push(x)});return Object.values(g)}
function card(g){var image=g.items.find(function(x){return mediaType(x)==='image'}),pdf=g.items.find(function(x){return mediaType(x)==='pdf'}),video=g.items.find(function(x){return mediaType(x)==='video'}),preview=image?'<img loading="lazy" src="'+mediaUrl(image)+'" alt="'+esc(g.catalogue)+'">':pdf?'<div class="media-preview clean-pdf">▤</div>':'<div class="media-preview clean-pdf">▶</div>',acts='';if(pdf)acts+='<a class="open-media" href="'+mediaUrl(pdf)+'" target="_blank" rel="noopener">OPEN PDF</a>';if(image)acts+='<a class="open-media" href="'+mediaUrl(image)+'" target="_blank" rel="noopener">OPEN PHOTO</a>';if(video)acts+='<a class="open-media" href="'+mediaUrl(video)+'" target="_blank" rel="noopener">OPEN VIDEO</a>';return '<article class="media-card"><div class="media-preview">'+preview+'</div><div class="media-info"><div class="media-category">'+esc(g.category)+' · '+esc(g.brand)+'</div><div class="media-title">'+esc(g.catalogue)+'</div><div class="catalogue-media-label">'+g.items.map(function(x){return typeLabel(mediaType(x))}).filter(function(v,i,a){return a.indexOf(v)===i}).join(' · ')+'</div><div class="media-actions" style="margin-top:12px">'+acts+'</div></div></article>'}
var originalRender=renderMedia;
renderMedia=function(){
  var items=uploadedMedia.filter(function(x){return (activeCategory==='all'||n(x.category)===n(activeCategory))&&(activeType==='all'||mediaType(x)===activeType)});
  liveStatus.textContent=(activeCategory==='all'?'All categories':activeCategory)+' · '+(activeType==='all'?'All media':activeType.toUpperCase())+' · '+items.length+' item'+(items.length===1?'':'s');
  if(!items.length){mediaGrid.innerHTML='<div class="empty-media">No uploaded media is available for this selection yet.</div>';return}
  if(activeCategory==='all'){mediaGrid.innerHTML=grouped(items).map(card).join('');return}
  if(!selectedBrand){var brands={};items.forEach(function(x){var b=brandOf(x);(brands[b]||(brands[b]=[])).push(x)});mediaGrid.innerHTML=Object.keys(brands).sort().map(function(b){return '<article class="media-card brand-choice" data-brand="'+esc(b)+'"><div class="media-preview">'+esc(b)+'</div><div class="media-info"><div class="media-category">'+esc(activeCategory)+'</div><div class="media-title">'+esc(b)+'</div><div class="catalogue-media-label">'+grouped(brands[b]).length+' catalogue'+(grouped(brands[b]).length===1?'':'s')+'</div><div class="media-actions" style="margin-top:12px"><button class="open-media" type="button">VIEW CATALOGUES</button></div></div></article>'}).join('');return}
  var chosen=items.filter(function(x){return n(brandOf(x))===n(selectedBrand)});mediaGrid.innerHTML='<button class="hierarchy-back" type="button" id="brandBack">← ALL '+esc(activeCategory.toUpperCase())+' BRANDS</button>'+grouped(chosen).map(card).join('')
};
document.addEventListener('click',function(e){var bc=e.target.closest('.brand-choice');if(bc){selectedBrand=bc.dataset.brand||'';renderMedia();return}if(e.target.closest('#brandBack')){selectedBrand='';renderMedia()}},true);
document.querySelectorAll('.media-filter,.filter-btn').forEach(function(el){el.addEventListener('click',function(){selectedBrand=''},true)});
setTimeout(function(){try{renderMedia()}catch(e){}},500);
})();</script>`;

async function filterMediaResponse(request,response){
  const type=response.headers.get('content-type')||'';if(!type.includes('application/json'))return response;
  let data;try{data=await response.clone().json()}catch{return response}if(!data||!Array.isArray(data.items))return response;
  const admin=(request.headers.get('referer')||'').includes('/admin-products');data.items=publicItems(data.items,{dedupe:!admin});data.total=data.items.length;data.mode=admin?'admin-clean-media-v1':'customer-clean-media-v1';const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:h})
}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='POST'&&url.pathname==='/api/admin-media-delete'){
    if(!env.PRODUCT_MEDIA)return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);if(!await authorized(request,env))return json({error:'Admin login required'},401);let body={};try{body=await request.json()}catch{}const key=String(body.key||'');if(!key)return json({error:'Media key is required'},400);const head=await env.PRODUCT_MEDIA.head(key);if(!head)return json({error:'Media item not found'},404);const m=head.customMetadata||{};if(key.startsWith('library/')||String(m.library||'')==='1'||m.type==='original-pdf'||m.type==='jpg-page')return json({error:'Library files must be deleted from Woodrick Home Library'},400);await env.PRODUCT_MEDIA.delete(key);return json({ok:true,deleted:key})
  }
  let response=await app.fetch(request,env,ctx);
  if(request.method==='GET'&&url.pathname==='/api/media'&&!url.searchParams.get('key')&&!String(url.searchParams.get('prefix')||'').startsWith('library/'))return filterMediaResponse(request,response);
  if(request.method==='GET'&&(url.pathname==='/products/'||url.pathname==='/products'||url.pathname==='/products/index.html')){
    const type=response.headers.get('content-type')||'';if(type.includes('text/html')){let html=await response.text();if(!html.includes('woodrick-product-hierarchy-script-v1'))html=html.includes('</body>')?html.replace('</body>',productHierarchy+'\n</body>'):html+productHierarchy;const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-version','product-hierarchy-clean-v1');return new Response(html,{status:response.status,statusText:response.statusText,headers:h})}
  }
  if(request.method!=='GET'||!(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html'))return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;let html=await response.text();if(!html.includes('woodrick-library-action-alignment-v1'))html=html.includes('</head>')?html.replace('</head>',alignmentStyle+'\n</head>'):alignmentStyle+html;if(!html.includes('woodrick-admin-media-cleanup-v1'))html=html.includes('</body>')?html.replace('</body>',adminMediaCleanup+'\n</body>'):html+adminMediaCleanup;const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');headers.set('x-woodrick-version','admin-media-clean-v1');return new Response(html,{status:response.status,statusText:response.statusText,headers})
}};
