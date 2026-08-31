import app from './worker-admin-media-folder-view.js';

const enc = new TextEncoder();
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate, max-age=0'}})}
function clean(v){return String(v||'').trim()}
function normCategory(v){const s=clean(v);if(/^laminate$/i.test(s))return 'Laminates';if(/^door\s*skin(s)?$/i.test(s))return 'Door Skin';return s||'Uncategorised'}
function titleOf(x){return clean(x.catalogue||x.title||x.originalName||x.key||'Untitled').replace(/\.(jpg|jpeg|png|webp|pdf)$/i,'').trim()}
function deriveBrand(x){
  const explicit=clean(x.brand);
  if(explicit && !/^woodrick$/i.test(explicit))return explicit;
  const t=titleOf(x).replace(/\s*·\s*\d+\s+JPG\s+pages$/i,'').trim();
  const first=t.split(/\s+/)[0]||'Unbranded';
  return first.replace(/([._-]?\d+(?:\.\d+)?\s*mm.*)$/i,'').trim()||first;
}
function variantOf(x){
  const cat=clean(x.catalogue);
  if(cat)return cat;
  let t=titleOf(x).replace(/\s*·\s*\d+\s+JPG\s+pages$/i,'').trim();
  const b=deriveBrand(x);
  if(b && t.toLowerCase().startsWith(b.toLowerCase())){
    let rest=t.slice(b.length).replace(/^\s*[-–—:·|]\s*/,'').trim();
    if(rest)return rest;
  }
  return t||'Catalogue';
}
function sourceOf(x){return String(x.librarySource||'')==='1'||String(x.library||'')==='1'||String(x.key||'').startsWith('library/')?'library':'direct'}
function mediaTypeOf(x){const t=clean(x.type).toLowerCase();if(t==='original-pdf'||t==='pdf')return 'PDF';if(t==='image'||t==='jpg-page')return 'IMAGE';if(t==='video')return 'VIDEO';return t.toUpperCase()||'MEDIA'}
function shape(items){
  return items.map(x=>({
    ...x,
    category: normCategory(x.category),
    brand: deriveBrand(x),
    variant: variantOf(x),
    source: sourceOf(x),
    mediaTypeLabel: mediaTypeOf(x)
  })).sort((a,b)=>a.category.localeCompare(b.category)||a.brand.localeCompare(b.brand)||a.variant.localeCompare(b.variant));
}

const patch = `<script id="woodrick-admin-hierarchy-v1">(function(){
function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function status(msg,isError){var s=document.getElementById('status');if(!s)return;s.textContent=msg;s.className='status show'+(isError?' error':'')}
function ensureBrandField(){
  if(document.getElementById('productBrand'))return;
  var title=document.getElementById('title');if(!title)return;
  var titleField=title.closest('.field');if(!titleField)return;
  var wrap=document.createElement('div');wrap.className='field';wrap.innerHTML='<label for="productBrand">BRAND</label><input id="productBrand" type="text" placeholder="Example: Ristal, Woodline, Merino" required />';
  titleField.classList.remove('full');titleField.parentNode.insertBefore(wrap,titleField);
  titleField.querySelector('label').textContent='CATALOGUE / PRODUCT NAME';
  title.placeholder='Example: .75mm, .82mm, Solid Colour, 1mm';
}
function leaf(x){
  var isLib=x.source==='library';
  var badge=isLib?'<span class="hier-badge library">LIBRARY</span>':'<span class="hier-badge direct">DIRECT UPLOAD</span>';
  var action=isLib?'<a class="hier-manage" href="/admin-products/#library">MANAGE IN LIBRARY</a>':'<button type="button" class="hier-delete" data-key="'+esc(x.key)+'" data-title="'+esc(x.variant)+'">DELETE</button>';
  var pages=x.pageCount?'<span class="hier-pages">'+esc(x.pageCount)+' JPG pages</span>':'';
  return '<div class="hier-leaf"><div><b>'+esc(x.variant)+'</b> '+badge+' <span class="hier-type">'+esc(x.mediaTypeLabel||'MEDIA')+'</span> '+pages+'</div><div class="hier-actions"><button type="button" class="open-btn" data-key="'+esc(x.key)+'" data-title="'+esc(x.brand+' → '+x.variant)+'">OPEN</button>'+action+'</div></div>';
}
function render(items){
  var list=document.getElementById('mediaList');if(!list)return;
  var tree={};items.forEach(function(x){(tree[x.category]||(tree[x.category]={}));(tree[x.category][x.brand]||(tree[x.category][x.brand]=[])).push(x)});
  var cats=Object.keys(tree).sort();
  list.innerHTML=cats.length?cats.map(function(cat){
    var brands=Object.keys(tree[cat]).sort();
    return '<details class="hier-category" open><summary><span>'+esc(cat)+'</span><small>'+brands.length+' brand'+(brands.length===1?'':'s')+'</small></summary><div class="hier-category-body">'+brands.map(function(brand){var arr=tree[cat][brand];return '<details class="hier-brand" open><summary><span>'+esc(brand)+'</span><small>'+arr.length+' catalogue/item'+(arr.length===1?'':'s')+'</small></summary><div class="hier-brand-body">'+arr.map(leaf).join('')+'</div></details>'}).join('')+'</div></details>';
  }).join(''):'<div class="item">No product media found.</div>';
}
async function loadHierarchy(){
  var list=document.getElementById('mediaList'),btn=document.getElementById('refreshBtn');if(!list)return;
  if(btn){btn.disabled=true;btn.textContent='REFRESHING…'}list.innerHTML='<div class="item"><b>Loading Category → Brand → Catalogue…</b></div>';
  try{var r=await fetch('/api/admin-media-hierarchy?_='+Date.now(),{cache:'no-store',credentials:'same-origin',headers:{'cache-control':'no-cache'}}),d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||('Refresh failed ('+r.status+')'));var a=Array.isArray(d.items)?d.items:[];render(a);status('Product list refreshed. '+a.length+' catalogue/item(s) loaded.',false)}catch(e){list.innerHTML='<div class="item">Could not refresh product list: '+esc(e.message)+'</div>';status('Refresh error: '+e.message,true)}finally{if(btn){btn.disabled=false;btn.textContent='REFRESH PRODUCT LIST'}}
}
async function deleteDirect(btn){
  var password=prompt('Enter admin password to delete this direct upload:');if(password===null||!password.trim())return;
  var title=btn.dataset.title||'this item';if(!confirm('Delete '+title+' permanently?'))return;
  var old=btn.textContent;btn.disabled=true;btn.textContent='DELETING…';
  try{var r=await fetch('/api/admin-media-delete-smart',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json','authorization':'Bearer '+password.trim(),'cache-control':'no-cache'},body:JSON.stringify({key:btn.dataset.key})}),d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||('Delete failed ('+r.status+')'));status('Deleted '+title+'. Refreshing…',false);await loadHierarchy()}catch(e){status('Delete error: '+e.message,true);alert(e.message)}finally{btn.disabled=false;btn.textContent=old}
}
function installUpload(){
  var form=document.getElementById('uploadForm');if(!form)return;
  form.onsubmit=async function(e){e.preventDefault();var f=document.getElementById('file').files[0],cat=document.getElementById('category').value,type=document.getElementById('type').value,title=document.getElementById('title').value.trim(),brand=document.getElementById('productBrand').value.trim();if(!f||!cat||!title||!brand){status('Category, brand, catalogue/product name and file are required.',true);return false}var fd=new FormData();fd.append('category',cat);fd.append('type',type);fd.append('title',title);fd.append('brand',brand);fd.append('catalogue',title);fd.append('file',f);try{status('Uploading '+brand+' → '+title+'…',false);var r=await fetch('/api/upload',{method:'POST',body:fd}),d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||'Upload failed');status('Uploaded successfully: '+cat+' → '+brand+' → '+title,false);form.reset();if(window.renderCategories)window.renderCategories();await loadHierarchy()}catch(err){status(err.message,true)}return false};
}
function bind(){ensureBrandField();installUpload();var refresh=document.getElementById('refreshBtn');if(refresh)refresh.onclick=function(e){e.preventDefault();e.stopPropagation();loadHierarchy();return false};var list=document.getElementById('mediaList');if(list)list.addEventListener('click',function(e){var b=e.target.closest('.hier-delete');if(!b)return;e.preventDefault();e.stopPropagation();deleteDirect(b)});setTimeout(loadHierarchy,220)}
window.woodrickHierarchyLoad=loadHierarchy;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(bind,0)},{once:true});else setTimeout(bind,0);
})();</script>
<style id="woodrick-admin-hierarchy-style-v1">
#mediaList{gap:14px}.hier-category,.hier-brand{border:1px solid #d8ccb8;background:#fff}.hier-category>summary,.hier-brand>summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px}.hier-category>summary::-webkit-details-marker,.hier-brand>summary::-webkit-details-marker{display:none}.hier-category>summary{padding:15px 17px;background:#111;color:#f0c96b;font-weight:900;font-size:14px}.hier-category>summary small{color:#fff;font-size:10px}.hier-category-body{padding:12px;display:grid;gap:10px}.hier-brand>summary{padding:12px 14px;background:#f4efe5;color:#171717;font-weight:900}.hier-brand>summary small{color:#6d675e;font-size:10px}.hier-brand-body{padding:8px 12px 12px;display:grid;gap:8px}.hier-leaf{border:1px solid #e2d8c8;background:#fff;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px}.hier-actions{display:flex;gap:8px;align-items:center}.hier-badge{display:inline-block;padding:3px 7px;border-radius:999px;font-size:9px;font-weight:900;letter-spacing:.06em;margin-left:6px}.hier-badge.library{background:#f3e3ae;color:#5d4710}.hier-badge.direct{background:#e8f2e8;color:#245b24}.hier-type,.hier-pages{font-size:9px;color:#6d675e;font-weight:800;margin-left:6px}.hier-delete,.hier-manage{height:36px;min-width:118px;padding:0 11px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;text-decoration:none}.hier-delete{border:2px solid #a52a2a;background:#fff;color:#a52a2a;cursor:pointer}.hier-manage{border:1px solid #b88b42;background:#fff8e3;color:#6e501a}@media(max-width:680px){.hier-leaf{grid-template-columns:1fr}.hier-actions{width:100%}.hier-actions>*{flex:1}.hier-category>summary,.hier-brand>summary{align-items:flex-start;flex-direction:column}}
</style>`;

export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/api/admin-media-hierarchy'){
    const req=new Request(new URL('/api/admin-media-list',url.origin),{method:'GET',headers:request.headers});
    const r=await app.fetch(req,env,ctx);let d={};try{d=await r.json()}catch{return r}if(!r.ok)return json(d,r.status);return json({...d,items:shape(Array.isArray(d.items)?d.items:[])});
  }
  const response=await app.fetch(request,env,ctx);
  if(request.method==='GET'&&(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html')){
    const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;let html=await response.text();if(!html.includes('woodrick-admin-hierarchy-v1'))html=html.replace('</body>',patch+'\n</body>');const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-version','admin-hierarchy-v1');return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
  }
  return response;
}};
