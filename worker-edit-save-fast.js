import app from './worker-edit-category-sync.js';

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate, max-age=0'}})}
function clean(v=''){return String(v||'').trim()}
function passwordOk(request,env){return !!env.ADMIN_UPLOAD_TOKEN&&(request.headers.get('authorization')||'')===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`}

async function editOverrideKey(sourceKey){
  const bytes=new TextEncoder().encode(sourceKey);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const hex=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return `_system/catalogue-edits/${hex}.json`;
}

async function editProductCatalogue(request,env){
  if(!passwordOk(request,env))return json({error:'Correct admin password is required.'},401);
  if(!env.PRODUCT_MEDIA)return json({error:'Media storage is not configured'},500);
  let body={};try{body=await request.json()}catch{return json({error:'Invalid request'},400)}
  const key=clean(body.key),category=clean(body.category),brand=clean(body.brand),catalogue=clean(body.catalogue);
  if(!key||!category||!brand||!catalogue)return json({error:'Catalogue key, category, brand and catalogue name are required.'},400);
  const head=await env.PRODUCT_MEDIA.head(key);if(!head)return json({error:'Catalogue was not found. Refresh the Product List and try again.'},404);
  const overrideKey=await editOverrideKey(key);
  const editedAt=new Date().toISOString();
  const payload={sourceKey:key,category,brand,catalogue,title:catalogue,editedAt};
  try{
    await env.PRODUCT_MEDIA.put(overrideKey,JSON.stringify(payload),{
      httpMetadata:{contentType:'application/json'},
      customMetadata:{system:'catalogue-edit',sourceKey:key,category,brand,catalogue,title:catalogue,editedAt}
    });
    return json({ok:true,key,scope:'product-media',edited:true,metadataOnly:true});
  }catch(err){return json({error:'Edit save failed',detail:String(err?.message||err)},500)}
}

async function applyCatalogueEdits(response,env){
  if(!env.PRODUCT_MEDIA||!response.ok)return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('application/json'))return response;
  let data;try{data=await response.clone().json()}catch{return response}
  if(!data||!Array.isArray(data.items))return response;
  let listed;try{listed=await env.PRODUCT_MEDIA.list({prefix:'_system/catalogue-edits/',limit:1000,include:['customMetadata']})}catch{return response}
  const edits=new Map();
  for(const o of listed.objects||[]){
    const m=o.customMetadata||{},sourceKey=clean(m.sourceKey);
    if(sourceKey)edits.set(sourceKey,m);
  }
  if(!edits.size)return response;
  data.items=data.items.filter(x=>!String(x.key||'').startsWith('_system/')).map(x=>{
    const e=edits.get(String(x.key||''));
    if(!e)return x;
    return {...x,category:e.category||x.category,brand:e.brand||x.brand,catalogue:e.catalogue||x.catalogue,title:e.title||e.catalogue||x.title,editedAt:e.editedAt||x.editedAt};
  });
  const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:h});
}

const uiPatch=`<script id="woodrick-edit-save-fast-v4">(function(){document.addEventListener('click',function(e){var b=e.target.closest('#woodrickEditSave');if(!b)return;setTimeout(function(){if(b.disabled&&String(b.textContent).indexOf('SAVING')>=0){var card=b.closest('.woodrick-edit-card');if(card&&!card.querySelector('.woodrick-save-note')){var n=document.createElement('div');n.className='woodrick-save-note';n.style.cssText='margin-top:10px;font-size:11px;color:#6d675e';n.textContent='Saving catalogue changes…';card.appendChild(n)} }},300)},true)})();</script>`;

const categoryFallback=`<style id="woodrick-category-fallback-style-v1">
#categoryManagerFallback{margin:18px 0 22px;padding:18px;border:1px solid #d8ccb8;background:#fffaf0}#categoryManagerFallback h3{margin:0 0 5px;font:600 20px Georgia,serif}#categoryManagerFallback p{margin:0 0 12px;color:#6d675e;font-size:12px}.cf-add{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}.cf-add input{min-width:0}.cf-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.cf-chip{display:inline-flex;align-items:center;gap:7px;padding:6px 7px 6px 10px;border:1px solid #d7c39c;background:#fff;font-size:10px;font-weight:800}.cf-delete{border:1px solid #9b2929;background:#fff;color:#9b2929;padding:4px 7px;font-size:9px;font-weight:900;cursor:pointer}.cf-msg{margin-top:10px;font-size:12px;color:#6d675e}.cf-msg.error{color:#9b2929}@media(max-width:620px){.cf-add{grid-template-columns:1fr}}
</style><script id="woodrick-category-fallback-v1">(function(){
var STATIC=['Plywood','Laminates','Louvers','Acrylic Laminates','Shuttering Plywood','Doors','HDHMR & MDF','WPC Board & Chaukhat','Cement','Tiles','Sanitaryware','Bath Fittings','uPVC Doors & Windows','Hardware','Furniture & Kitchen Hardware','Flooring','Wallpapers','Decorative Panels'];
function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function unique(a){var s={};return a.filter(function(x){var k=String(x||'').trim().toLowerCase();if(!k||s[k])return false;s[k]=1;return true})}
function token(){return ((document.getElementById('pToken')||{}).value||sessionStorage.getItem('woodrick_product_token')||'').trim()}
async function state(){try{var r=await fetch('/api/categories?_='+Date.now(),{cache:'no-store'}),d=await r.json();return r.ok?{custom:Array.isArray(d.categories)?d.categories:[],hidden:Array.isArray(d.hiddenCategories)?d.hiddenCategories:[]}:{custom:[],hidden:[]}}catch(_){return{custom:[],hidden:[]}}}
function setSelect(id,all){var s=document.getElementById(id);if(!s)return;var old=s.value;s.innerHTML=all.map(function(x){return'<option>'+esc(x)+'</option>'}).join('');if(all.indexOf(old)>=0)s.value=old}
async function refresh(){var st=await state(),hidden={};st.hidden.forEach(function(x){hidden[String(x).toLowerCase()]=1});var all=unique(STATIC.concat(st.custom)).filter(function(x){return !hidden[String(x).toLowerCase()]});setSelect('pCategory',all);setSelect('lCategory',all);setSelect('woodrickEditCategory',all);window.WOODRICK_ALL_CATEGORIES=all.slice();var chips=document.getElementById('cfChips');if(chips)chips.innerHTML=all.map(function(x){return'<span class="cf-chip"><span>'+esc(x)+'</span><button type="button" class="cf-delete" data-name="'+esc(x)+'">DELETE</button></span>'}).join('');}
async function add(){var input=document.getElementById('cfName'),msg=document.getElementById('cfMsg'),name=(input.value||'').trim(),pass=token();if(!name){msg.textContent='Enter a category name.';msg.className='cf-msg error';return}if(!pass)pass=(prompt('Enter admin upload code to add this category:')||'').trim();if(!pass)return;try{var r=await fetch('/api/categories',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+pass},body:JSON.stringify({name:name})}),d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||'Could not add category');try{sessionStorage.setItem('woodrick_product_token',pass)}catch(_){}input.value='';await refresh();msg.textContent='Category available: '+d.name;msg.className='cf-msg'}catch(e){msg.textContent='Category error: '+e.message;msg.className='cf-msg error'}}
async function del(name){var msg=document.getElementById('cfMsg'),pass=token();if(!confirm('Delete / hide category "'+name+'" from the customer website?\n\nUploaded PDFs and media will remain safe.'))return;if(!pass)pass=(prompt('Enter admin upload code to delete this category:')||'').trim();if(!pass)return;try{var r=await fetch('/api/categories',{method:'DELETE',headers:{'content-type':'application/json','authorization':'Bearer '+pass},body:JSON.stringify({name:name})}),d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||'Could not delete category');try{sessionStorage.setItem('woodrick_product_token',pass)}catch(_){}await refresh();msg.textContent=name+' removed from customer website. Media kept safe.';msg.className='cf-msg'}catch(e){msg.textContent='Delete category error: '+e.message;msg.className='cf-msg error'}}
function install(){if(document.getElementById('categoryManager')||document.getElementById('categoryManagerFallback'))return;var panel=document.querySelector('#products .panel');if(!panel)return;var box=document.createElement('div');box.id='categoryManagerFallback';box.innerHTML='<h3>Category Management</h3><p>Add a new category or hide an existing category from the customer website. Both actions require the admin upload code.</p><div class="cf-add"><input id="cfName" type="text" placeholder="Example: Paints"><button id="cfAdd" class="btn primary" type="button">ADD NEW CATEGORY</button></div><div id="cfMsg" class="cf-msg">Existing active categories are shown below.</div><div id="cfChips" class="cf-chips"></div>';var grid=panel.querySelector('.grid');panel.insertBefore(box,grid||panel.firstChild);document.getElementById('cfAdd').onclick=add;box.addEventListener('click',function(e){var b=e.target.closest('.cf-delete');if(b)del(b.dataset.name||'')});refresh()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,50)},{once:true});else setTimeout(install,50);
})();</script>`;

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='POST'&&url.pathname==='/api/admin-media-edit')return editProductCatalogue(request,env);
  let response=await app.fetch(request,env,ctx);
  if(request.method==='GET'&&url.pathname==='/api/media'&&!url.searchParams.has('key'))response=await applyCatalogueEdits(response,env);
  const isAdmin=request.method==='GET'&&(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html');
  if(!isAdmin)return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  let html=await response.text();
  html=html.replace(/<script id="woodrick-edit-save-guard-v1">[\s\S]*?<\/script>/g,'').replace(/<script id="woodrick-edit-save-fast-v[0-9]+">[\s\S]*?<\/script>/g,'').replace(/<script id="woodrick-category-fallback-v[0-9]+">[\s\S]*?<\/script>/g,'').replace(/<style id="woodrick-category-fallback-style-v[0-9]+">[\s\S]*?<\/style>/g,'');
  html=html.replace('</body>',uiPatch+'\n'+categoryFallback+'\n</body>');
  const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-version','edit-save-fast-v5-category-manager-fallback');
  return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
}};
