import app from './worker-product-media-sync.js';

const CATEGORY_KEY='_config/product-categories.json';
const DEFAULT_CATEGORIES=['Plywood','Laminates','Louvers','Acrylic Laminates','Shuttering Plywood','Door Skin','HDHMR & MDF','WPC Board & Chaukhat','Cement','Tiles','Sanitaryware','Bath Fittings','uPVC Doors & Windows','Hardware','Furniture & Kitchen Hardware','Flooring','Wallpapers','Decorative Panels','More Products'];

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate, max-age=0'}})}
function norm(v=''){return String(v||'').trim().toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
function explicitAdminPassword(request,env){const h=request.headers.get('authorization')||'';return !!env.ADMIN_UPLOAD_TOKEN&&h===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`}
function cleanCategory(item){const title=String(item.catalogue||item.title||item.originalName||'');const c=String(item.category||'').trim();if(/door\s*skin/i.test(title)||/^door\s*skin(s)?$/i.test(c))return'Door Skin';return c}
function catalogueKey(v=''){return norm(String(v||'').replace(/\.(pdf|jpg|jpeg|png|webp)$/i,'').replace(/\s+page\s*\d+\s*$/i,'').replace(/\s+(catalogue|catalog|laminate|laminates)\s*$/i,''))}
function dedupeItems(items=[]){const map=new Map();for(const raw of items){const x={...raw,category:cleanCategory(raw)};const key=[norm(x.category),norm(x.type||''),catalogueKey(x.catalogue||x.title||x.originalName||x.key)].join('|');const prev=map.get(key);if(!prev){map.set(key,x);continue}const a=String(prev.key||'').startsWith('product-sync/'),b=String(x.key||'').startsWith('product-sync/');if(b&&!a)map.set(key,x);else if(a===b&&String(x.title||'').length<String(prev.title||'').length)map.set(key,x)}return [...map.values()]}
async function readCategories(env){if(!env.PRODUCT_MEDIA)return DEFAULT_CATEGORIES;try{const o=await env.PRODUCT_MEDIA.get(CATEGORY_KEY);if(!o)return DEFAULT_CATEGORIES;const d=await o.json();const a=Array.isArray(d.categories)?d.categories:[];return [...new Set([...DEFAULT_CATEGORIES,...a.map(x=>String(x||'').trim()).filter(Boolean)])]}catch{return DEFAULT_CATEGORIES}}
async function writeCategories(env,categories){const clean=[...new Set(categories.map(x=>String(x||'').trim()).filter(Boolean))];await env.PRODUCT_MEDIA.put(CATEGORY_KEY,JSON.stringify({categories:clean,updatedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json'}});return clean}

const adminPatch=`
<style id="woodrick-admin-stability-v1">
#mediaList .item{grid-template-columns:minmax(0,1fr) 96px 96px!important}
#mediaList .open-btn,#mediaList .admin-media-delete{width:96px!important;min-width:96px!important;height:36px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
</style>
<script id="woodrick-admin-stability-script-v1">(function(){
const DEFAULTS=${JSON.stringify(DEFAULT_CATEGORIES)};
function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
async function categories(){try{var r=await fetch('/api/categories',{cache:'no-store'}),d=await r.json();return Array.isArray(d.categories)?d.categories:DEFAULTS}catch(e){return DEFAULTS}}
async function refreshCategories(prefer){var list=await categories(),a=document.getElementById('category'),b=document.getElementById('libCategory');if(a){var cur=prefer||a.value;a.innerHTML='<option value="">Select category</option>'+list.map(function(x){return '<option>'+esc(x)+'</option>'}).join('');if(cur&&list.indexOf(cur)>=0)a.value=cur}if(b){var cur2=b.value;b.innerHTML=list.map(function(x){return '<option>'+esc(x)+'</option>'}).join('');if(cur2&&list.indexOf(cur2)>=0)b.value=cur2}}
function askPassword(action){var p=prompt('Admin password required to '+action+':');return p===null?'':p.trim()}
document.addEventListener('click',async function(e){
  var del=e.target.closest('.admin-media-delete');if(del){e.preventDefault();e.stopImmediatePropagation();var p=askPassword('delete this product media');if(!p)return;del.disabled=true;var old=del.textContent;del.textContent='DELETING…';try{var r=await fetch('/api/admin-media-delete',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+p},body:JSON.stringify({key:del.dataset.key})}),d=await r.json().catch(function(){return{}});if(!r.ok)throw Error(d.error||'Delete failed');var ref=document.getElementById('refreshBtn');if(ref)ref.click()}catch(err){alert(err.message)}finally{del.disabled=false;del.textContent=old}return}
  if(e.target.closest('#addCategoryBtn')){e.preventDefault();e.stopImmediatePropagation();var n=(document.getElementById('newCategory')||{}).value||'';n=n.trim();if(!n){alert('Enter a category name.');return}var p=askPassword('add category');if(!p)return;var r=await fetch('/api/categories',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+p},body:JSON.stringify({action:'add',category:n})}),d=await r.json().catch(function(){return{}});if(!r.ok){alert(d.error||'Could not add category');return}document.getElementById('newCategory').value='';await refreshCategories(n);alert('Category added and synced to Products.');return}
  if(e.target.closest('#removeCategoryBtn')){e.preventDefault();e.stopImmediatePropagation();var s=document.getElementById('category'),n=s?s.value:'';if(!n){alert('Select a category first.');return}var p=askPassword('remove category');if(!p)return;var r=await fetch('/api/categories',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+p},body:JSON.stringify({action:'remove',category:n})}),d=await r.json().catch(function(){return{}});if(!r.ok){alert(d.error||'Could not remove category');return}await refreshCategories();alert('Category removed.');return}
},true);
refreshCategories();
})();</script>`;

const productsPatch=`
<script id="woodrick-dynamic-categories-v1">(function(){
function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
async function addCategories(){try{var r=await fetch('/api/categories',{cache:'no-store'}),d=await r.json(),grid=document.querySelector('.category-grid');if(!grid||!Array.isArray(d.categories))return;var have={};grid.querySelectorAll('[data-category]').forEach(function(x){have[String(x.dataset.category||'').toLowerCase()]=1});d.categories.forEach(function(c){if(have[String(c).toLowerCase()])return;var el=document.createElement('article');el.className='card';el.dataset.category=c;el.innerHTML='<div class="card-top"><h3>'+esc(c)+'</h3><p>Explore '+esc(c)+' products and catalogues.</p></div><div class="card-body">Browse brands, catalogues, photos and videos.</div><div class="media-row"><a class="media-link dynamic-media" href="#media" data-type="image"><b>▧</b>PHOTOS</a><a class="media-link dynamic-media" href="#media" data-type="pdf"><b>▤</b>PDF</a><a class="media-link dynamic-media" href="#media" data-type="video"><b>▶</b>VIDEO</a></div>';grid.appendChild(el)});}catch(e){}}
document.addEventListener('click',function(e){var a=e.target.closest('.dynamic-media');if(!a)return;var card=a.closest('[data-category]');if(!card)return;try{activeCategory=card.dataset.category;activeType=a.dataset.type||'all';document.querySelectorAll('.filter-btn').forEach(function(x){x.classList.toggle('active',x.dataset.type===activeType)});renderMedia();setTimeout(function(){var m=document.getElementById('media');if(m)m.scrollIntoView({behavior:'smooth'})},20)}catch(err){}},true);
addCategories();
})();</script>`;

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/api/categories'){
    if(request.method==='GET')return json({categories:await readCategories(env)});
    if(request.method==='POST'){
      if(!explicitAdminPassword(request,env))return json({error:'Correct admin password is required.'},401);
      let body={};try{body=await request.json()}catch{}
      const category=String(body.category||'').trim();if(!category)return json({error:'Category is required.'},400);
      let cats=await readCategories(env);
      if(body.action==='remove'){
        if(DEFAULT_CATEGORIES.some(x=>norm(x)===norm(category)))return json({error:'Default categories cannot be removed.'},400);
        cats=cats.filter(x=>norm(x)!==norm(category));
      }else if(!cats.some(x=>norm(x)===norm(category)))cats.push(category);
      await writeCategories(env,cats.filter(x=>!DEFAULT_CATEGORIES.some(d=>norm(d)===norm(x))));
      return json({ok:true,categories:await readCategories(env)});
    }
    return json({error:'Method not allowed'},405);
  }
  if(request.method==='POST'&&url.pathname==='/api/admin-media-delete'){
    if(!explicitAdminPassword(request,env))return json({error:'Admin password is mandatory for every delete.'},401);
    let body={};try{body=await request.clone().json()}catch{}
    const key=String(body.key||'');if(!key)return json({error:'Media key is required.'},400);
    if(key.startsWith('product-sync/'))return json({error:'This catalogue is synced from Woodrick Home Library. Delete it from Library so it is removed everywhere.'},400);
    if(!env.PRODUCT_MEDIA)return json({error:'Media storage is unavailable.'},500);
    const head=await env.PRODUCT_MEDIA.head(key);if(!head)return json({error:'Media item not found.'},404);
    if(key.startsWith('library/'))return json({error:'Library catalogue must be deleted from Woodrick Home Library.'},400);
    await env.PRODUCT_MEDIA.delete(key);return json({ok:true,deleted:key});
  }
  let response=await app.fetch(request,env,ctx);
  if(request.method==='GET'&&url.pathname==='/api/media'&&!url.searchParams.get('key')&&!String(url.searchParams.get('prefix')||'').startsWith('library/')){
    const ct=response.headers.get('content-type')||'';if(ct.includes('application/json')){try{const d=await response.clone().json();if(Array.isArray(d.items)){d.items=dedupeItems(d.items);d.total=d.items.length;const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');return new Response(JSON.stringify(d),{status:response.status,statusText:response.statusText,headers:h})}}catch(e){}
  }
  if(request.method==='GET'&&(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html')){
    const ct=response.headers.get('content-type')||'';if(ct.includes('text/html')){let html=await response.text();if(!html.includes('woodrick-admin-stability-script-v1'))html=html.replace('</body>',adminPatch+'\n</body>');const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');return new Response(html,{status:response.status,statusText:response.statusText,headers:h})}
  }
  if(request.method==='GET'&&(url.pathname==='/products/'||url.pathname==='/products'||url.pathname==='/products/index.html')){
    const ct=response.headers.get('content-type')||'';if(ct.includes('text/html')){let html=await response.text();if(!html.includes('woodrick-dynamic-categories-v1'))html=html.replace('</body>',productsPatch+'\n</body>');const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');return new Response(html,{status:response.status,statusText:response.statusText,headers:h})}
  }
  return response;
}};
