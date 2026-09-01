import app from './worker-admin-media-final.js';

const STATIC_CATEGORIES=['Plywood','Laminates','Louvers','Acrylic Laminates','Shuttering Plywood','Doors','HDHMR & MDF','WPC Board & Chaukhat','Cement','Tiles','Sanitaryware','Bath Fittings','uPVC Doors & Windows','Hardware','Furniture & Kitchen Hardware','Flooring','Wallpapers','Decorative Panels'];
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate, max-age=0'}})}
function clean(v=''){return String(v||'').trim().replace(/\s+/g,' ')}
function slug(v=''){return clean(v).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'category'}
function explicitPasswordOk(request,env){return !!env.ADMIN_UPLOAD_TOKEN&&(request.headers.get('authorization')||'')===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`}
async function hiddenCategories(env){
  if(!env.PRODUCT_MEDIA)return[];
  const r=await env.PRODUCT_MEDIA.list({prefix:'_system/categories-hidden/',limit:1000,include:['customMetadata']});
  return r.objects.map(o=>clean((o.customMetadata||{}).categoryName)).filter(Boolean).filter(x=>x.toLowerCase()!=='more products').sort((a,b)=>a.localeCompare(b));
}
async function customCategories(env){
  if(!env.PRODUCT_MEDIA)return[];
  const [r,hidden]=await Promise.all([
    env.PRODUCT_MEDIA.list({prefix:'_system/categories/',limit:1000,include:['customMetadata']}),
    hiddenCategories(env)
  ]);
  const hiddenSet=new Set(hidden.map(x=>x.toLowerCase()));
  return r.objects.map(o=>clean((o.customMetadata||{}).categoryName)).filter(Boolean).filter(x=>x.toLowerCase()!=='more products'&&!hiddenSet.has(x.toLowerCase())).sort((a,b)=>a.localeCompare(b));
}
async function addCategory(request,env){
  if(!explicitPasswordOk(request,env))return json({error:'Correct admin password is required.'},401);
  if(!env.PRODUCT_MEDIA)return json({error:'Media storage is not configured'},500);
  let body={};try{body=await request.json()}catch{return json({error:'Invalid request'},400)}
  const name=clean(body.name);if(name.length<2)return json({error:'Please enter a valid category name'},400);if(name.length>70)return json({error:'Category name is too long'},400);
  const hiddenKey=`_system/categories-hidden/${slug(name)}.json`;
  const wasHidden=!!(await env.PRODUCT_MEDIA.head(hiddenKey));
  if(wasHidden)await env.PRODUCT_MEDIA.delete(hiddenKey);
  const isStatic=STATIC_CATEGORIES.some(x=>x.toLowerCase()===name.toLowerCase());
  if(isStatic)return json({ok:true,name,reactivated:wasHidden,alreadyExists:!wasHidden});
  const existing=await customCategories(env);if(existing.some(x=>x.toLowerCase()===name.toLowerCase()))return json({ok:true,name,alreadyExists:true});
  const key=`_system/categories/${slug(name)}.json`;
  await env.PRODUCT_MEDIA.put(key,JSON.stringify({name,createdAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json'},customMetadata:{categoryName:name,system:'category'}});
  return json({ok:true,name,reactivated:wasHidden});
}
async function deleteCategory(request,env){
  if(!explicitPasswordOk(request,env))return json({error:'Correct admin password is required.'},401);
  if(!env.PRODUCT_MEDIA)return json({error:'Media storage is not configured'},500);
  let body={};try{body=await request.json()}catch{return json({error:'Invalid request'},400)}
  const name=clean(body.name);if(name.length<2)return json({error:'Please choose a valid category.'},400);if(name.toLowerCase()==='more products')return json({error:'This category cannot be managed here.'},400);
  const hiddenKey=`_system/categories-hidden/${slug(name)}.json`;
  await env.PRODUCT_MEDIA.put(hiddenKey,JSON.stringify({name,hiddenAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json'},customMetadata:{categoryName:name,system:'hidden-category'}});
  const customKey=`_system/categories/${slug(name)}.json`;
  if(await env.PRODUCT_MEDIA.head(customKey))await env.PRODUCT_MEDIA.delete(customKey);
  return json({ok:true,name,hidden:true,mediaPreserved:true});
}

const adminPatch=`<style id="woodrick-category-manager-style-v3">
.category-manager{margin:18px 0 22px;padding:18px;border:1px solid #d8ccb8;background:#fffaf0}.category-manager h3{margin:0 0 5px;font:600 20px Georgia,serif}.category-manager p{margin:0 0 12px;color:#6d675e;font-size:12px}.category-add-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}.category-add-row input{min-width:0}.category-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.category-chip{display:inline-flex;align-items:center;gap:7px;padding:6px 7px 6px 10px;border:1px solid #d7c39c;background:#fff;font-size:10px;font-weight:800}.category-chip.custom{background:#f3df9d}.category-delete{border:1px solid #9b2929;background:#fff;color:#9b2929;padding:4px 7px;font-size:9px;font-weight:900;cursor:pointer}.category-delete:hover{background:#9b2929;color:#fff}.category-msg{margin-top:10px;font-size:12px;color:#6d675e}.category-msg.error{color:#9b2929}@media(max-width:620px){.category-add-row{grid-template-columns:1fr}}
</style>
<script id="woodrick-category-manager-v3">(function(){
var STATIC=${JSON.stringify(STATIC_CATEGORIES)};
function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function unique(a){var seen={};return a.filter(function(x){var k=String(x).trim().toLowerCase();if(!k||seen[k])return false;seen[k]=1;return true})}
async function getState(){try{var r=await fetch('/api/categories?_='+Date.now(),{cache:'no-store'}),d=await r.json();return r.ok?{custom:Array.isArray(d.categories)?d.categories:[],hidden:Array.isArray(d.hiddenCategories)?d.hiddenCategories:[]}:{custom:[],hidden:[]}}catch(_){return{custom:[],hidden:[]}}}
function setSelect(id,all,current){var s=document.getElementById(id);if(!s)return;var old=current||s.value;s.innerHTML=all.map(function(x){return'<option>'+esc(x)+'</option>'}).join('');if(all.indexOf(old)>=0)s.value=old}
async function deleteCategory(name){var msg=document.getElementById('categoryMsg'),pass=(document.getElementById('pToken')||{}).value||sessionStorage.getItem('woodrick_product_token')||'';if(!confirm('Delete / hide category "'+name+'" from the customer website?\n\nUploaded PDFs and media will be kept safely and can be reused later.'))return;if(!pass)pass=prompt('Enter admin upload code to delete this category:')||'';if(!pass)return;msg.textContent='Removing '+name+' from website…';msg.className='category-msg';try{var r=await fetch('/api/categories',{method:'DELETE',headers:{'content-type':'application/json','authorization':'Bearer '+pass.trim()},body:JSON.stringify({name:name})}),d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||'Could not delete category');try{sessionStorage.setItem('woodrick_product_token',pass.trim())}catch(_){}await refreshCategories();msg.textContent=name+' removed from customer website. Existing PDFs/media were kept safely.';msg.className='category-msg'}catch(e){msg.textContent='Delete category error: '+e.message;msg.className='category-msg error'}}
async function refreshCategories(){var state=await getState(),hidden={};state.hidden.forEach(function(x){hidden[String(x).toLowerCase()]=1});var all=unique(STATIC.concat(state.custom)).filter(function(x){return String(x).toLowerCase()!=='more products'&&!hidden[String(x).toLowerCase()]});setSelect('pCategory',all);setSelect('lCategory',all);setSelect('woodrickEditCategory',all);window.WOODRICK_ALL_CATEGORIES=all.slice();var chips=document.getElementById('categoryChips');if(chips)chips.innerHTML=all.map(function(x){var isCustom=state.custom.some(function(c){return c.toLowerCase()===x.toLowerCase()});return'<span class="category-chip '+(isCustom?'custom':'')+'"><span>'+esc(x)+'</span><button type="button" class="category-delete" data-name="'+esc(x)+'">DELETE</button></span>'}).join('');return all}
function syncEditDropdown(){var s=document.getElementById('woodrickEditCategory'),all=window.WOODRICK_ALL_CATEGORIES||[];if(!s||!all.length)return;setSelect('woodrickEditCategory',all,s.value)}
function install(){var products=document.querySelector('#products .panel');if(!products||document.getElementById('categoryManager'))return;var box=document.createElement('div');box.id='categoryManager';box.className='category-manager';box.innerHTML='<h3>Category Management</h3><p>Create or remove categories here. DELETE is password-protected and removes the category from the customer website without deleting its uploaded PDFs/media.</p><div class="category-add-row"><input id="newCategoryName" type="text" placeholder="Example: Paints"><button id="addCategoryBtn" class="btn primary" type="button">ADD NEW CATEGORY</button></div><div id="categoryMsg" class="category-msg">Existing active categories are shown below.</div><div id="categoryChips" class="category-chips"></div>';products.insertBefore(box,products.querySelector('.grid'));box.addEventListener('click',function(e){var b=e.target.closest('.category-delete');if(b)deleteCategory(b.dataset.name||'')});document.getElementById('addCategoryBtn').onclick=async function(){var name=document.getElementById('newCategoryName').value.trim(),msg=document.getElementById('categoryMsg'),pass=(document.getElementById('pToken')||{}).value||sessionStorage.getItem('woodrick_product_token')||'';if(!name){msg.textContent='Enter a category name.';msg.className='category-msg error';return}if(!pass){pass=prompt('Enter admin upload code to create / restore this category:')||''}if(!pass)return;this.disabled=true;this.textContent='ADDING…';try{var r=await fetch('/api/categories',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+pass.trim()},body:JSON.stringify({name:name})}),d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||'Could not create category');try{sessionStorage.setItem('woodrick_product_token',pass.trim())}catch(_){}document.getElementById('newCategoryName').value='';await refreshCategories();var p=document.getElementById('pCategory'),l=document.getElementById('lCategory'),e=document.getElementById('woodrickEditCategory');if(p)p.value=d.name;if(l)l.value=d.name;if(e)e.value=d.name;msg.textContent=(d.reactivated?'Category restored: ':d.alreadyExists?'Category already exists: ':'Category created: ')+d.name+' — it is available in admin and on the website.';msg.className='category-msg'}catch(e){msg.textContent='Category error: '+e.message;msg.className='category-msg error'}finally{this.disabled=false;this.textContent='ADD NEW CATEGORY'}};refreshCategories();var editModal=document.getElementById('woodrickEditModal');if(editModal)new MutationObserver(syncEditDropdown).observe(editModal,{attributes:true,attributeFilter:['class']});setInterval(syncEditDropdown,1200)}
window.woodrickRefreshCategories=refreshCategories;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();</script>`;

const productPatch=`<script id="woodrick-public-dynamic-categories-v2">(function(){
function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function card(name){var q=encodeURIComponent('Hello Woodrick Homes, I want details for '+name+'.');return '<article class="card dynamic-category" data-category="'+esc(name)+'"><div class="card-top"><h3>'+esc(name)+'</h3><p>Explore available brands, catalogues and product options.</p></div><div class="card-body">Latest uploaded catalogues and product media for '+esc(name)+'.</div><div class="media-row"><a class="media-link dynamic-filter" href="#media" data-type="image"><b>▧</b>PHOTOS</a><a class="media-link dynamic-filter" href="#media" data-type="pdf"><b>▤</b>PDF</a><a class="media-link dynamic-filter" href="#media" data-type="video"><b>▶</b>VIDEO</a></div><a class="enquire" href="https://wa.me/919415324839?text='+q+'" target="_blank">WHATSAPP ENQUIRY</a></article>'}
function pruneHiddenMedia(hidden){var set={};hidden.forEach(function(x){set[String(x).trim().toLowerCase()]=1});document.querySelectorAll('.media-card').forEach(function(card){var c=card.querySelector('.media-category'),name=c?String(c.textContent||'').trim().toLowerCase():'';if(name&&set[name])card.remove()})}
async function load(){try{var r=await fetch('/api/categories?_='+Date.now(),{cache:'no-store'}),d=await r.json();if(!r.ok||!Array.isArray(d.categories))return;var hidden=Array.isArray(d.hiddenCategories)?d.hiddenCategories:[],hiddenSet={};hidden.forEach(function(x){hiddenSet[String(x).trim().toLowerCase()]=1});var grid=document.querySelector('.category-grid');if(!grid)return;grid.querySelectorAll('[data-category]').forEach(function(x){var n=String(x.dataset.category||'').trim().toLowerCase();if(n==='more products'||hiddenSet[n])x.remove()});var existing={};grid.querySelectorAll('[data-category]').forEach(function(x){existing[String(x.dataset.category||'').toLowerCase()]=1});d.categories.filter(function(name){var n=String(name).toLowerCase();return n!=='more products'&&!hiddenSet[n]}).forEach(function(name){if(existing[String(name).toLowerCase()])return;grid.insertAdjacentHTML('beforeend',card(name));existing[String(name).toLowerCase()]=1});if(window.applyCategoryVisuals)window.applyCategoryVisuals();grid.addEventListener('click',function(e){var link=e.target.closest('.dynamic-filter');if(!link)return;var c=link.closest('.card');if(typeof activeCategory!=='undefined')activeCategory=c?c.dataset.category:'all';if(typeof activeType!=='undefined')activeType=link.dataset.type||'all';document.querySelectorAll('.filter-btn').forEach(function(b){b.classList.toggle('active',b.dataset.filterType===activeType)});if(typeof renderMedia==='function')renderMedia();setTimeout(function(){pruneHiddenMedia(hidden)},0)});var live=document.querySelector('.live-grid');if(live)new MutationObserver(function(){pruneHiddenMedia(hidden)}).observe(live,{childList:true,subtree:true});pruneHiddenMedia(hidden)}catch(_){}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();</script>`;

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/api/categories'){
    if(request.method==='GET'){
      const [categories,hidden]=await Promise.all([customCategories(env),hiddenCategories(env)]);
      return json({categories,hiddenCategories:hidden});
    }
    if(request.method==='POST')return addCategory(request,env);
    if(request.method==='DELETE')return deleteCategory(request,env);
    return json({error:'Method not allowed'},405);
  }
  const response=await app.fetch(request,env,ctx);
  const isAdmin=request.method==='GET'&&(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html');
  const isProducts=request.method==='GET'&&(url.pathname==='/products/'||url.pathname==='/products'||url.pathname==='/products/index.html');
  if(!isAdmin&&!isProducts)return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(isAdmin){html=html.replace(/<script id="woodrick-category-manager-v[0-9]+">[\s\S]*?<\/script>/g,'').replace(/<style id="woodrick-category-manager-style-v[0-9]+">[\s\S]*?<\/style>/g,'');if(!html.includes('woodrick-category-manager-v3'))html=html.replace('</body>',adminPatch+'\n</body>')}
  if(isProducts){html=html.replace(/<script id="woodrick-public-dynamic-categories-v[0-9]+">[\s\S]*?<\/script>/g,'');if(!html.includes('woodrick-public-dynamic-categories-v2'))html=html.replace('</body>',productPatch+'\n</body>')}
  const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-version','dynamic-category-manager-v4-password-delete-hide');return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
}};
