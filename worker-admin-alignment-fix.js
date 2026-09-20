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
function inferCatalogue(x){const value=String(x.catalogue||x.title||x.originalName||'Catalogue').replace(/\.[a-z0-9]{2,5}$/i,'').replace(/\s+page\s*\d+\s*$/i,'').trim()||'Catalogue';return norm(value)==='ris'?'Ristal':value}
function isLibraryJpg(x){const key=String(x.key||''),t=String(x.type||'').toLowerCase();return t==='jpg-page'||(key.startsWith('library/')&&t!=='original-pdf'&&!String(x.originalName||'').toLowerCase().endsWith('.pdf'))}
function isLibraryPdf(x){const key=String(x.key||''),t=String(x.type||'').toLowerCase();return t==='original-pdf'||(key.startsWith('library/')&&String(x.originalName||'').toLowerCase().endsWith('.pdf'))}
function pageStem(x){const title=String(x.title||'').trim();const m=title.match(/^(.*?)\s+page\s*(\d+)\s*$/i);return m?norm((x.category||'')+'|'+m[1]):''}
function publicItems(items,{dedupe=true}={}){
  const all=Array.isArray(items)?items:[],covers=new Map();
  for(const x of all){if(!isLibraryJpg(x))continue;const key=[norm(canonicalCategory(x.category||'')),norm(inferBrand(x)),norm(inferCatalogue(x))].join('|'),page=Number(x.page||String(x.key||'').match(/page-(\d+)/i)?.[1]||9999),prev=covers.get(key);if(!prev||page<prev.page)covers.set(key,{page,key:x.key})}
  const raw=all.filter(x=>!isLibraryJpg(x));
  const stems={};for(const x of raw){const s=pageStem(x);if(s)stems[s]=(stems[s]||0)+1}
  const cleaned=raw.filter(x=>{const s=pageStem(x);return !(s&&stems[s]>1)}).map(x=>{
    const libraryPdf=isLibraryPdf(x);
    const cover=covers.get([norm(canonicalCategory(x.category||'')),norm(inferBrand(x)),norm(inferCatalogue(x))].join('|'));
    return {...x,
      category:canonicalCategory(x.category||''),
      brand:inferBrand(x),
      catalogue:inferCatalogue(x),
      type:libraryPdf?'pdf':x.type,
      title:inferCatalogue(x),
      coverUrl:cover?`/api/media?raw=1&key=${encodeURIComponent(cover.key)}`:String(x.coverUrl||''),
      librarySource:libraryPdf?'1':String(x.librarySource||'')
    };
  });
  if(!dedupe)return cleaned;
  const map=new Map();
  for(const x of cleaned){
    const t=norm(x.type||''),key=[norm(x.category),norm(x.brand),norm(x.catalogue||x.title),t].join('|');
    const prev=map.get(key);
    if(!prev){map.set(key,x);continue}
    const prevIsLib=String(prev.librarySource||'')==='1',curIsLib=String(x.librarySource||'')==='1';
    if(curIsLib&&!prevIsLib)map.set(key,x);
  }
  return [...map.values()];
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
<style id="woodrick-product-hierarchy-v2">
.brand-choice{cursor:pointer}.brand-choice .media-preview{background:linear-gradient(135deg,#0c0c0c,#242018);color:#f0c96b;font-family:Georgia,serif;font-size:34px;font-weight:700;text-align:center;padding:0}.brand-choice .media-title{margin-bottom:4px}.hierarchy-back{display:inline-flex;margin:0 0 18px;padding:10px 14px;border:1px solid #f0c96b;background:#171717;color:#f0c96b;font-size:11px;font-weight:900;cursor:pointer}.catalogue-media-label{font-size:10px;color:#aaa;margin-top:6px}.pdf-cover{width:100%;height:100%;object-fit:contain!important;background:#f4f1eb}.pdf-cover-fallback{width:100%;height:100%;display:grid;place-items:center;background:linear-gradient(135deg,#171717,#30291d);color:#f0c96b;font:700 28px Georgia,serif}.media-preview{position:relative}.media-preview img{object-fit:contain!important;background:#f4f1eb}.cover-title{display:none!important}.media-title{line-height:1.25!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:break-word!important;word-break:normal!important;min-height:2.5em}

/* Shared presentation for product categories, brands and catalogue folders. */
#categories .card-top{background:#fff;color:#211b16;border-bottom:1px solid #ded4c3}
#categories .card-top p{color:#6a665f}
#categories .card-visual:after{display:none}
#categories .enquire{background:#f6f1e8;color:#684a23;border-color:#d8c9b1}
#media .live-grid{align-items:stretch}
#media .media-card{display:flex;flex-direction:column;background:#fff;border-color:#ded4c3}
#media .media-preview,#media .brand-choice .media-preview{
  position:relative;display:flex;align-items:center;justify-content:center;
  height:225px;min-height:225px;max-height:225px;flex:0 0 225px;
  aspect-ratio:auto;padding:10px;overflow:hidden;background:#ddd3c4;color:#684a23;
  border-bottom:1px solid #ded4c3
}
#media .media-preview img,#media .media-preview img.pdf-preview,
#media .media-preview img.pdf-cover{
  display:block;width:100%!important;height:100%!important;
  max-width:100%!important;max-height:100%!important;min-width:0;min-height:0;
  box-sizing:border-box;object-fit:contain!important;object-position:center;
  padding:4px;background:#fff!important;border:1px solid #cbbda8;
  box-shadow:0 6px 18px rgba(70,49,24,.18)
}
#media .media-preview img.pdf-cover{
  object-fit:cover!important;object-position:center;padding:0!important;
  background:transparent!important;transform:scale(1.035);transform-origin:center
}
#media .media-preview img.pdf-cover.spread-cover{
  object-fit:contain!important;transform:scale(1.02)
}
#media .media-preview img.pdf-cover.artwork-safe-cover{
  object-fit:contain!important;transform:scale(1.01)
}
#media .media-preview video{
  display:block;width:100%!important;height:100%!important;
  max-width:100%!important;max-height:100%!important;min-width:0;min-height:0;
  box-sizing:border-box;object-fit:contain!important;object-position:center;
  background:#171717;border:1px solid #cbbda8;box-shadow:0 6px 18px rgba(70,49,24,.18)
}
#media .pdf-cover-fallback{width:100%;height:100%;box-sizing:border-box;background:#fff;color:#684a23;border:1px solid #cbbda8;box-shadow:0 6px 18px rgba(70,49,24,.18);font:700 18px Arial,sans-serif}
#media .media-info{display:flex;flex:1;flex-direction:column;padding:14px}
#media .media-category{color:#805d2d;min-height:2.35em;line-height:1.2}
#media .media-title{color:#211b16;font-size:clamp(18px,1.55vw,22px);line-height:1.16!important;min-height:2.32em}
#media .catalogue-media-label{color:#6a665f}
#media .media-actions{margin-top:auto!important;padding-top:8px}
#media .media-actions .open-media{padding:10px 13px!important}
#media .hierarchy-back{grid-column:1/-1;background:#fff;color:#684a23;border-color:#cdbb9a;justify-self:start;align-self:start}
@media(max-width:620px){
 #media .media-preview,#media .brand-choice .media-preview{height:210px;min-height:210px;max-height:210px;flex-basis:210px}
 #media .media-info{padding:13px}
}
</style>
<script id="woodrick-product-hierarchy-script-v2">(function(){
var selectedBrand='';
function n(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function brandOf(x){return String(x.brand||'Other').trim()||'Other'}
function catalogueOf(x){if(typeof mediaTitle==='function')return mediaTitle(x);var value=String(x.catalogue||x.title||x.originalName||'Catalogue').replace(/\\.[a-z0-9]{2,5}$/i,'').replace(/\\s+page\\s*\\d+\\s*$/i,'').trim()||'Catalogue';return n(value)==='ris'?'Ristal':value}
function typeLabel(t){return t==='pdf'?'PDF':t==='video'?'VIDEO':'PHOTO'}
function fitPdfCover(img){
  if(!img||!img.naturalWidth||!img.naturalHeight)return;
  var ratio=img.naturalWidth/img.naturalHeight,src=String(img.getAttribute('src')||''),artworkSafe=/godrej|louvers/i.test(src),spread=ratio>=1.52&&!artworkSafe;
  img.classList.toggle('spread-cover',spread);
  img.classList.toggle('artwork-safe-cover',artworkSafe);
  img.dataset.fitMode=artworkSafe?'artwork-safe':spread?'spread-safe':'edge-fill';
  var stage=
    src.indexOf('woodline-acrylic')>=0?'#d5b28c':
    src.indexOf('/mwud.')>=0?'#b2b1a3':
    src.indexOf('ristal-08')>=0?'#18395d':
    src.indexOf('ristal1mm')>=0?'#245a50':
    src.indexOf('ristal-solid')>=0?'#c8c8c7':
    src.indexOf('woodline-08')>=0?'#f6a18f':
    src.indexOf('godrej')>=0?'#eee8f1':
    src.indexOf('louvers')>=0?'#d5b993':'';
  if((spread||artworkSafe)&&stage)img.style.setProperty('background-color',stage,'important');
}
function fitVisiblePdfCovers(root){(root||document).querySelectorAll('img.pdf-cover').forEach(function(img){if(img.complete)fitPdfCover(img);else img.addEventListener('load',function(){fitPdfCover(img)},{once:true})})}
var previewCoverByCatalogue={
  'woodline acrylic':'/catalogue-covers/woodline-acrylic.webp',
  'rainbow door skin':'/catalogue-covers/rainbow.webp',
  'woodline door skin':'/catalogue-covers/woodline-door.webp',
  'godrej lock catalogue price list':'/catalogue-covers/godrej.webp',
  'godrej lock price list':'/catalogue-covers/godrej.webp',
  'ipsa hardware catalogue price list':'/catalogue-covers/ipsa.webp',
  'ipsa catalogue price list':'/catalogue-covers/ipsa.webp',
  'woodrick kitchen catalogue':'/catalogue-covers/kitchen.webp',
  'mwud futura 0 8mm laminates':'/catalogue-covers/mwud.webp',
  'mwud':'/catalogue-covers/mwud.webp',
  'ristal 0 82mm premium laminates':'/catalogue-covers/ristal-08.webp',
  'ristal':'/catalogue-covers/ristal-08.webp',
  'ristal 1mm laminates':'/catalogue-covers/ristal1mm.webp',
  'ristal1mm':'/catalogue-covers/ristal1mm.webp',
  'ristal slim 0 75mm laminates':'/catalogue-covers/ristal-slim.webp',
  'ristal slim':'/catalogue-covers/ristal-slim.webp',
  'ristal solid colour 0 92mm':'/catalogue-covers/ristal-solid.webp',
  'ristal solid colour':'/catalogue-covers/ristal-solid.webp',
  'woodline 0 8mm laminates':'/catalogue-covers/woodline-08.webp',
  'woodline':'/catalogue-covers/woodline-08.webp',
  'woodline led louvers':'/catalogue-covers/woodline-led-louvers.webp',
  'woodline louvers 8x5':'/catalogue-covers/woodline-louvers-8x5.webp',
  'woodline louvers 9 5x6':'/catalogue-covers/woodline-louvers-9-5x6.webp',
  'woodrick shuttering plywood 25 kg mr':'/catalogue-covers/woodrick-25-kg-mr.webp'
};
var coverFallbacks={'shuttering-plywood/image/1787752234100-woodrick-25-kg-mr.pdf':'/catalogue-covers/woodrick-25-kg-mr.webp','louvers/image/1787636958432-woodline-led-louvers.pdf':'/catalogue-covers/woodline-led-louvers.webp','louvers/image/1787636923292-woodline-louvers-9-5x6.pdf':'/catalogue-covers/woodline-louvers-9-5x6.webp'};
function coverOf(x){var fixed=previewCoverByCatalogue[n(catalogueOf(x))],src=String(fixed||x.coverUrl||coverFallbacks[x.key]||'');return src.indexOf('/catalogue-covers/')===0?src.split('?')[0]+'?v=20260920-5':src}
function grouped(items){var g={};items.forEach(function(x){var k=n(x.category)+'|'+n(brandOf(x))+'|'+n(catalogueOf(x));if(!g[k])g[k]={category:x.category||'Uncategorised',brand:brandOf(x),catalogue:catalogueOf(x),items:[]};g[k].items.push(x)});return Object.values(g)}
function card(g){
  var image=g.items.find(function(x){return mediaType(x)==='image'}),pdf=g.items.find(function(x){return mediaType(x)==='pdf'}),video=g.items.find(function(x){return mediaType(x)==='video'}),preview='',cover=pdf?coverOf(pdf):'';
  if(image)preview='<img loading="eager" decoding="async" fetchpriority="high" src="'+mediaUrl(image)+'" alt="'+esc(g.catalogue)+'"><div class="cover-title">'+esc(g.catalogue)+'</div>';
  else if(pdf)preview=(cover?'<img class="pdf-cover" loading="eager" decoding="async" fetchpriority="high" src="'+esc(cover)+'" data-pdf="'+esc(mediaUrl(pdf))+'" alt="'+esc(g.catalogue)+' cover">':'<div class="pdf-cover-fallback">PDF CATALOGUE</div>')+'<div class="cover-title">'+esc(g.catalogue)+'</div>';
  else if(video)preview='<video preload="metadata" muted src="'+mediaUrl(video)+'"></video><div class="cover-title">'+esc(g.catalogue)+'</div>';
  var acts='';if(pdf)acts+='<a class="open-media" href="'+mediaUrl(pdf)+'" target="_blank" rel="noopener">OPEN PDF</a>';if(image)acts+='<a class="open-media" href="'+mediaUrl(image)+'" target="_blank" rel="noopener">OPEN PHOTO</a>';if(video)acts+='<a class="open-media" href="'+mediaUrl(video)+'" target="_blank" rel="noopener">OPEN VIDEO</a>';
  return '<article class="media-card"><div class="media-preview">'+preview+'</div><div class="media-info"><div class="media-category">'+esc(g.category)+' · '+esc(g.brand)+'</div><div class="media-title">'+esc(g.catalogue)+'</div><div class="catalogue-media-label">'+g.items.map(function(x){return typeLabel(mediaType(x))}).filter(function(v,i,a){return a.indexOf(v)===i}).join(' · ')+'</div><div class="media-actions" style="margin-top:12px">'+acts+'</div></div></article>'
}
renderMedia=function(){
  var items=uploadedMedia.filter(function(x){return (activeCategory==='all'||n(x.category)===n(activeCategory))&&(activeType==='all'||mediaType(x)===activeType)});
  var groups=grouped(items);
  var pdfCount=grouped(items.filter(function(x){return mediaType(x)==='pdf'})).length,photoCount=items.filter(function(x){return mediaType(x)==='image'}).length,videoCount=items.filter(function(x){return mediaType(x)==='video'}).length,count=activeType==='pdf'?groups.length:items.length,label=activeType==='pdf'?'catalogue':activeType==='image'?'photo':activeType==='video'?'video':'media item';liveStatus.textContent=(activeCategory==='all'?'All categories':activeCategory)+' · '+(activeType==='all'?(pdfCount+' catalogues · '+photoCount+' photos · '+videoCount+' video'+(videoCount===1?'':'s')+' · '+items.length+' total media'):(activeType.toUpperCase()+' · '+count+' '+label+(count===1?'':'s')));
  if(!items.length){
    if(uploadedMedia.length&&(activeCategory!=='all'||activeType!=='all')){activeCategory='all';activeType='all';selectedBrand='';document.querySelectorAll('.filter-btn').forEach(function(b){b.classList.toggle('active',b.dataset.filterType==='all')});return renderMedia()}
    liveStatus.textContent='Loading latest media…';mediaGrid.innerHTML='<div class="empty-media">Preparing Woodrick product media…</div>';return
  }
  if(activeCategory==='all'){mediaGrid.innerHTML=groups.map(card).join('');fitVisiblePdfCovers(mediaGrid);return}
  if(!selectedBrand){var brands={};items.forEach(function(x){var b=brandOf(x);(brands[b]||(brands[b]=[])).push(x)});mediaGrid.innerHTML=Object.keys(brands).sort().map(function(b){var bg=grouped(brands[b]);var first=bg[0],thumb='';if(first){var im=first.items.find(function(x){return mediaType(x)==='image'}),pd=first.items.find(function(x){return mediaType(x)==='pdf'}),pc=pd?coverOf(pd):'';if(im)thumb='<img loading="eager" decoding="async" fetchpriority="high" src="'+mediaUrl(im)+'" alt="'+esc(b)+'">';else if(pd&&pc)thumb='<img class="pdf-cover" loading="eager" decoding="async" fetchpriority="high" src="'+esc(pc)+'" data-pdf="'+esc(mediaUrl(pd))+'" alt="'+esc(b)+'">';else if(pd)thumb='<div class="pdf-cover-fallback">PDF</div>'}return '<article class="media-card brand-choice" data-brand="'+esc(b)+'"><div class="media-preview">'+(thumb||esc(b))+'<div class="cover-title">'+esc(b)+'</div></div><div class="media-info"><div class="media-category">'+esc(activeCategory)+'</div><div class="media-title">'+esc(b)+'</div><div class="catalogue-media-label">'+bg.length+' catalogue'+(bg.length===1?'':'s')+'</div><div class="media-actions" style="margin-top:12px"><button class="open-media" type="button">VIEW CATALOGUES</button></div></div></article>'}).join('');fitVisiblePdfCovers(mediaGrid);return}
  var chosen=items.filter(function(x){return n(brandOf(x))===n(selectedBrand)});mediaGrid.innerHTML='<button class="hierarchy-back" type="button" id="brandBack">← ALL '+esc(activeCategory.toUpperCase())+' BRANDS</button>'+grouped(chosen).map(card).join('')
  fitVisiblePdfCovers(mediaGrid)
};
document.addEventListener('click',function(e){var bc=e.target.closest('.brand-choice');if(bc){selectedBrand=bc.dataset.brand||'';renderMedia();return}if(e.target.closest('#brandBack')){selectedBrand='';renderMedia()}},true);
document.addEventListener('error',function(e){var img=e.target;if(!img||!img.matches||!img.matches('img.pdf-cover[data-pdf]'))return;var fallback=document.createElement('div');fallback.className='pdf-cover-fallback';fallback.textContent='PDF CATALOGUE';img.replaceWith(fallback)},true);
document.querySelectorAll('.media-filter,.filter-btn').forEach(function(el){el.addEventListener('click',function(){selectedBrand=''},true)});
setTimeout(function(){try{renderMedia()}catch(e){}},500);
})();</script>`;

async function filterMediaResponse(request,response){
  const type=response.headers.get('content-type')||'';if(!type.includes('application/json'))return response;
  let data;try{data=await response.clone().json()}catch{return response}if(!data||!Array.isArray(data.items))return response;
  const admin=(request.headers.get('referer')||'').includes('/admin-products');data.items=publicItems(data.items,{dedupe:!admin});data.total=data.items.length;data.mode=admin?'admin-clean-media-v2':'customer-clean-media-v3-fast';const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control',admin?'no-store, no-cache, must-revalidate, max-age=0':'public, max-age=30, s-maxage=120, stale-while-revalidate=300');return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:h})
}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='POST'&&url.pathname==='/api/admin-media-delete'){
    if(!env.PRODUCT_MEDIA)return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);if(!await authorized(request,env))return json({error:'Admin login required'},401);let body={};try{body=await request.json()}catch{}const key=String(body.key||'');if(!key)return json({error:'Media key is required'},400);const head=await env.PRODUCT_MEDIA.head(key);if(!head)return json({error:'Media item not found'},404);const m=head.customMetadata||{};if(key.startsWith('library/')||String(m.library||'')==='1'||m.type==='original-pdf'||m.type==='jpg-page')return json({error:'Library files must be deleted from Woodrick Home Library'},400);await env.PRODUCT_MEDIA.delete(key);return json({ok:true,deleted:key})
  }
  let response=await app.fetch(request,env,ctx);
  if(request.method==='GET'&&url.pathname==='/api/media'&&!url.searchParams.get('key')&&!String(url.searchParams.get('prefix')||'').startsWith('library/'))return filterMediaResponse(request,response);
  if(request.method==='GET'&&(url.pathname==='/products/'||url.pathname==='/products'||url.pathname==='/products/index.html')){
    const type=response.headers.get('content-type')||'';if(type.includes('text/html')){let html=await response.text();html=html.replace(/<style id="woodrick-product-hierarchy-v1">[\s\S]*?<\/script>/g,'');if(!html.includes('woodrick-product-hierarchy-script-v2'))html=html.includes('</body>')?html.replace('</body>',productHierarchy+'\n</body>'):html+productHierarchy;const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-version','product-hierarchy-clean-v2');return new Response(html,{status:response.status,statusText:response.statusText,headers:h})}
  }
  if(request.method!=='GET'||!(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html'))return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;let html=await response.text();if(!html.includes('woodrick-library-action-alignment-v1'))html=html.includes('</head>')?html.replace('</head>',alignmentStyle+'\n</head>'):alignmentStyle+html;if(!html.includes('woodrick-admin-media-cleanup-v1'))html=html.includes('</body>')?html.replace('</body>',adminMediaCleanup+'\n</body>'):html+adminMediaCleanup;const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');headers.set('x-woodrick-version','admin-media-clean-v2');return new Response(html,{status:response.status,statusText:response.statusText,headers})
}};
