import app from './worker-admin-media-final.js';

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate, max-age=0'}})}
function clean(v=''){return String(v||'').trim().replace(/\s+/g,' ')}
function slug(v=''){return clean(v).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'category'}
function explicitPasswordOk(request,env){return !!env.ADMIN_UPLOAD_TOKEN&&(request.headers.get('authorization')||'')===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`}
async function customCategories(env){
  if(!env.PRODUCT_MEDIA)return[];
  const r=await env.PRODUCT_MEDIA.list({prefix:'_system/categories/',limit:1000,include:['customMetadata']});
  return r.objects.map(o=>clean((o.customMetadata||{}).categoryName)).filter(Boolean).filter(x=>x.toLowerCase()!=='more products').sort((a,b)=>a.localeCompare(b));
}
async function addCategory(request,env){
  if(!explicitPasswordOk(request,env))return json({error:'Correct admin password is required.'},401);
  if(!env.PRODUCT_MEDIA)return json({error:'Media storage is not configured'},500);
  let body={};try{body=await request.json()}catch{return json({error:'Invalid request'},400)}
  const name=clean(body.name);if(name.length<2)return json({error:'Please enter a valid category name'},400);if(name.length>70)return json({error:'Category name is too long'},400);
  const existing=await customCategories(env);if(existing.some(x=>x.toLowerCase()===name.toLowerCase()))return json({ok:true,name,alreadyExists:true});
  const key=`_system/categories/${slug(name)}.json`;
  await env.PRODUCT_MEDIA.put(key,JSON.stringify({name,createdAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json'},customMetadata:{categoryName:name,system:'category'}});
  return json({ok:true,name});
}

const adminPatch=`<style id="woodrick-category-manager-style-v2">
.category-manager{margin:18px 0 22px;padding:18px;border:1px solid #d8ccb8;background:#fffaf0}.category-manager h3{margin:0 0 5px;font:600 20px Georgia,serif}.category-manager p{margin:0 0 12px;color:#6d675e;font-size:12px}.category-add-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}.category-add-row input{min-width:0}.category-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.category-chip{padding:6px 9px;border:1px solid #d7c39c;background:#fff;font-size:10px;font-weight:800}.category-chip.custom{background:#f3df9d}.category-msg{margin-top:10px;font-size:12px;color:#6d675e}.category-msg.error{color:#9b2929}@media(max-width:620px){.category-add-row{grid-template-columns:1fr}}
</style>
<script id="woodrick-category-manager-v2">(function(){
var STATIC=['Plywood','Laminates','Louvers','Acrylic Laminates','Shuttering Plywood','Doors','HDHMR & MDF','WPC Board & Chaukhat','Cement','Tiles','Sanitaryware','Bath Fittings','uPVC Doors & Windows','Hardware','Furniture & Kitchen Hardware','Flooring','Wallpapers','Decorative Panels'];
function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function unique(a){var seen={};return a.filter(function(x){var k=String(x).toLowerCase();if(seen[k])return false;seen[k]=1;return true})}
async function getCustom(){try{var r=await fetch('/api/categories?_='+Date.now(),{cache:'no-store'}),d=await r.json();return r.ok&&Array.isArray(d.categories)?d.categories:[]}catch(_){return[]}}
function setSelect(id,all,current){var s=document.getElementById(id);if(!s)return;var old=current||s.value;s.innerHTML=all.map(function(x){return'<option>'+esc(x)+'</option>'}).join('');if(all.indexOf(old)>=0)s.value=old}
async function refreshCategories(){var custom=await getCustom(),all=unique(STATIC.concat(custom)).filter(function(x){return String(x).toLowerCase()!=='more products'});setSelect('pCategory',all);setSelect('lCategory',all);setSelect('woodrickEditCategory',all);window.WOODRICK_ALL_CATEGORIES=all.slice();var chips=document.getElementById('categoryChips');if(chips)chips.innerHTML=all.map(function(x){return'<span class="category-chip '+(custom.some(function(c){return c.toLowerCase()===x.toLowerCase()})?'custom':'')+'">'+esc(x)+'</span>'}).join('');return all}
function syncEditDropdown(){var s=document.getElementById('woodrickEditCategory'),all=window.WOODRICK_ALL_CATEGORIES||[];if(!s||!all.length)return;setSelect('woodrickEditCategory',all,s.value)}
function install(){var products=document.querySelector('#products .panel');if(!products||document.getElementById('categoryManager'))return;var box=document.createElement('div');box.id='categoryManager';box.className='category-manager';box.innerHTML='<h3>Category Management</h3><p>Create a new category once. It will appear in admin dropdowns and automatically create a new category box on the website Products page.</p><div class="category-add-row"><input id="newCategoryName" type="text" placeholder="Example: Paints"><button id="addCategoryBtn" class="btn primary" type="button">ADD NEW CATEGORY</button></div><div id="categoryMsg" class="category-msg">Existing categories are shown below.</div><div id="categoryChips" class="category-chips"></div>';products.insertBefore(box,products.querySelector('.grid'));document.getElementById('addCategoryBtn').onclick=async function(){var name=document.getElementById('newCategoryName').value.trim(),msg=document.getElementById('categoryMsg'),pass=(document.getElementById('pToken')||{}).value||sessionStorage.getItem('woodrick_product_token')||'';if(!name){msg.textContent='Enter a category name.';msg.className='category-msg error';return}if(!pass){pass=prompt('Enter admin upload code to create this category:')||''}if(!pass)return;this.disabled=true;this.textContent='ADDING…';try{var r=await fetch('/api/categories',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+pass.trim()},body:JSON.stringify({name:name})}),d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||'Could not create category');try{sessionStorage.setItem('woodrick_product_token',pass.trim())}catch(_){}document.getElementById('newCategoryName').value='';await refreshCategories();var p=document.getElementById('pCategory'),l=document.getElementById('lCategory'),e=document.getElementById('woodrickEditCategory');if(p)p.value=d.name;if(l)l.value=d.name;if(e)e.value=d.name;msg.textContent=(d.alreadyExists?'Category already exists: ':'Category created: ')+d.name+' — it is now available in upload, edit and website Products categories.';msg.className='category-msg'}catch(e){msg.textContent='Category error: '+e.message;msg.className='category-msg error'}finally{this.disabled=false;this.textContent='ADD NEW CATEGORY'}};refreshCategories();var editModal=document.getElementById('woodrickEditModal');if(editModal)new MutationObserver(syncEditDropdown).observe(editModal,{attributes:true,attributeFilter:['class']});setInterval(syncEditDropdown,1200)}
window.woodrickRefreshCategories=refreshCategories;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();</script>`;

const productPatch=`<script id="woodrick-public-dynamic-categories-v1">(function(){
function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function card(name){var q=encodeURIComponent('Hello Woodrick Homes, I want details for '+name+'.');return '<article class="card dynamic-category" data-category="'+esc(name)+'"><div class="card-top"><h3>'+esc(name)+'</h3><p>Explore available brands, catalogues and product options.</p></div><div class="card-body">Latest uploaded catalogues and product media for '+esc(name)+'.</div><div class="media-row"><a class="media-link dynamic-filter" href="#media" data-type="image"><b>▧</b>PHOTOS</a><a class="media-link dynamic-filter" href="#media" data-type="pdf"><b>▤</b>PDF</a><a class="media-link dynamic-filter" href="#media" data-type="video"><b>▶</b>VIDEO</a></div><a class="enquire" href="https://wa.me/919415324839?text='+q+'" target="_blank">WHATSAPP ENQUIRY</a></article>'}
async function load(){try{var r=await fetch('/api/categories?_='+Date.now(),{cache:'no-store'}),d=await r.json();if(!r.ok||!Array.isArray(d.categories))return;var grid=document.querySelector('.category-grid');if(!grid)return;grid.querySelectorAll('[data-category]').forEach(function(x){if(String(x.dataset.category||'').toLowerCase()==='more products')x.remove()});var existing={};grid.querySelectorAll('[data-category]').forEach(function(x){existing[String(x.dataset.category||'').toLowerCase()]=1});d.categories.filter(function(name){return String(name).toLowerCase()!=='more products'}).forEach(function(name){if(existing[String(name).toLowerCase()])return;grid.insertAdjacentHTML('beforeend',card(name));existing[String(name).toLowerCase()]=1});if(window.applyCategoryVisuals)window.applyCategoryVisuals();grid.addEventListener('click',function(e){var link=e.target.closest('.dynamic-filter');if(!link)return;var c=link.closest('.card');if(typeof activeCategory!=='undefined')activeCategory=c?c.dataset.category:'all';if(typeof activeType!=='undefined')activeType=link.dataset.type||'all';document.querySelectorAll('.filter-btn').forEach(function(b){b.classList.toggle('active',b.dataset.filterType===activeType)});if(typeof renderMedia==='function')renderMedia()})}catch(_){}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();</script>`;

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/api/categories'){
    if(request.method==='GET')return json({categories:await customCategories(env)});
    if(request.method==='POST')return addCategory(request,env);
    return json({error:'Method not allowed'},405);
  }
  const response=await app.fetch(request,env,ctx);
  const isAdmin=request.method==='GET'&&(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html');
  const isProducts=request.method==='GET'&&(url.pathname==='/products/'||url.pathname==='/products'||url.pathname==='/products/index.html');
  if(!isAdmin&&!isProducts)return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(isAdmin){html=html.replace(/<script id="woodrick-category-manager-v1">[\s\S]*?<\/script>/g,'').replace(/<style id="woodrick-category-manager-style-v1">[\s\S]*?<\/style>/g,'');if(!html.includes('woodrick-category-manager-v2'))html=html.replace('</body>',adminPatch+'\n</body>')}
  if(isProducts&&!html.includes('woodrick-public-dynamic-categories-v1'))html=html.replace('</body>',productPatch+'\n</body>');
  const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-version','dynamic-category-manager-v3-no-more-products');return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
}};
