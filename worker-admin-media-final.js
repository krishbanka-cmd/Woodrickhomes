import app from './worker-admin-media-hierarchy.js';

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store, no-cache, must-revalidate, max-age=0'
    }
  });
}

function explicitPasswordOk(request,env){
  if(!env.ADMIN_UPLOAD_TOKEN)return false;
  return (request.headers.get('authorization')||'')===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`;
}

function slug(v=''){
  return String(v||'').toLowerCase().trim().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'item';
}

async function deleteKeys(env,keys,{libraryOnly=false}={}){
  if(!env.PRODUCT_MEDIA)return json({error:'Media storage is not configured'},500);
  const safe=[...new Set((Array.isArray(keys)?keys:[]).filter(k=>{
    if(typeof k!=='string'||!k||k.includes('..'))return false;
    if(libraryOnly&&!k.startsWith('library/'))return false;
    return true;
  }))];
  if(!safe.length)return json({error:'No valid catalogue files selected'},400);
  if(safe.length>500)return json({error:'Too many files selected'},400);
  for(let i=0;i<safe.length;i+=1000)await env.PRODUCT_MEDIA.delete(safe.slice(i,i+1000));
  return json({ok:true,deleted:safe.length});
}

async function listAll(env){
  const out=[];let cursor;const seen=new Set();
  for(let i=0;i<200;i++){
    const opts={limit:1000,include:['customMetadata','httpMetadata']};if(cursor)opts.cursor=cursor;
    const r=await env.PRODUCT_MEDIA.list(opts);out.push(...r.objects);
    if(!r.truncated||!r.cursor||seen.has(r.cursor))break;seen.add(r.cursor);cursor=r.cursor;
  }
  return out;
}

function sameCatalogueMeta(meta,old){
  const n=v=>String(v||'').trim().toLowerCase();
  return n(meta.brand)===n(old.brand)&&n(meta.category)===n(old.category)&&n(meta.catalogue||meta.title)===n(old.catalogue||old.title);
}

async function moveLibraryCatalogue(env,sourceKey,category,brand,catalogue){
  const sourceHead=await env.PRODUCT_MEDIA.head(sourceKey);
  if(!sourceHead)throw new Error('Library source catalogue was not found');
  const old=sourceHead.customMetadata||{};
  const all=await listAll(env);
  const targets=all.filter(o=>String(o.key||'').startsWith('library/')&&sameCatalogueMeta(o.customMetadata||{},old));
  if(!targets.length)throw new Error('Library catalogue files were not found');
  const newRoot=`library/${slug(brand)}/${slug(category)}/${slug(catalogue)}`;
  let newSourceKey='';
  const written=[];
  for(const o of targets){
    const obj=await env.PRODUCT_MEDIA.get(o.key);if(!obj)continue;
    const m=o.customMetadata||{},type=String(m.type||'').toLowerCase(),page=String(m.page||'').trim();
    let newKey;
    if(type==='original-pdf')newKey=`${newRoot}/original/${slug(catalogue)}.pdf`;
    else if(type==='jpg-page')newKey=`${newRoot}/jpg/page-${String(page||'1').padStart(3,'0')}.jpg`;
    else newKey=`${newRoot}/${slug(type||'file')}/${o.key.split('/').pop()}`;
    const meta={...m,category,brand,catalogue,title:type==='jpg-page'?`${catalogue} page ${page||'1'}`:catalogue,editedAt:new Date().toISOString()};
    await env.PRODUCT_MEDIA.put(newKey,obj.body,{httpMetadata:o.httpMetadata||obj.httpMetadata,customMetadata:meta});
    written.push(newKey);if(type==='original-pdf')newSourceKey=newKey;
  }
  if(!newSourceKey)throw new Error('Original library PDF could not be moved');
  await env.PRODUCT_MEDIA.delete(targets.map(o=>o.key));
  return {newSourceKey,written};
}

async function editCatalogue(env,key,category,brand,catalogue){
  if(!env.PRODUCT_MEDIA)throw new Error('Media storage is not configured');
  const head=await env.PRODUCT_MEDIA.head(key);if(!head)throw new Error('Catalogue was not found');
  const old=head.customMetadata||{};
  const isSynced=String(key).startsWith('product-sync/')&&String(old.sourceKey||'').startsWith('library/');
  if(isSynced){
    const moved=await moveLibraryCatalogue(env,old.sourceKey,category,brand,catalogue);
    const source=await env.PRODUCT_MEDIA.get(moved.newSourceKey);if(!source)throw new Error('Updated library PDF could not be read');
    const newKey=`product-sync/${slug(category)}/${slug(brand)}/${slug(catalogue)}.pdf`;
    const meta={...old,category,brand,catalogue,title:catalogue,source:'library-sync',sourceKey:moved.newSourceKey,sourceUploadedAt:new Date().toISOString(),editedAt:new Date().toISOString()};
    await env.PRODUCT_MEDIA.put(newKey,source.body,{httpMetadata:{contentType:'application/pdf'},customMetadata:meta});
    if(key!==newKey)await env.PRODUCT_MEDIA.delete(key);
    return {key:newKey,scope:'library-and-product'};
  }
  if(String(key).startsWith('library/'))throw new Error('Please edit this catalogue from the Products list or Library workflow');
  const obj=await env.PRODUCT_MEDIA.get(key);if(!obj)throw new Error('Catalogue file could not be read');
  const type=String(old.type||'pdf').toLowerCase()||'pdf';
  const ext=String(old.originalName||key).toLowerCase().endsWith('.pdf')?'pdf':((key.split('.').pop()||'pdf').replace(/[^a-z0-9]/g,'')||'pdf');
  const newKey=`${slug(category)}/${slug(brand)}/${slug(catalogue)}/${slug(type)}/${Date.now()}-${slug(catalogue)}.${ext}`;
  const meta={...old,category,brand,catalogue,title:catalogue,editedAt:new Date().toISOString()};
  await env.PRODUCT_MEDIA.put(newKey,obj.body,{httpMetadata:head.httpMetadata||obj.httpMetadata,customMetadata:meta});
  if(key!==newKey)await env.PRODUCT_MEDIA.delete(key);
  return {key:newKey,scope:'product-media'};
}

const editPatch=`<style id="woodrick-edit-catalogue-style-v1">
.woodrick-edit-btn{border:1px solid #b88b42;background:#fff8e3;color:#6e501a}.woodrick-edit-modal{position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:10050;display:none;align-items:center;justify-content:center;padding:18px}.woodrick-edit-modal.show{display:flex}.woodrick-edit-card{width:min(560px,96vw);background:#fff;border:2px solid #f0c96b;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.35)}.woodrick-edit-card h3{margin:0 0 16px;font:500 28px Georgia,serif}.woodrick-edit-grid{display:grid;gap:12px}.woodrick-edit-grid label{display:grid;gap:6px;font-size:11px;font-weight:900}.woodrick-edit-grid input,.woodrick-edit-grid select{padding:12px;border:1px solid #cfc4b2;background:#fff}.woodrick-edit-actions{display:flex;gap:10px;margin-top:16px;justify-content:flex-end}.woodrick-edit-save{background:#f0c96b;color:#111;border:1px solid #b88b42}.woodrick-edit-cancel{background:#111;color:#f0c96b;border:1px solid #f0c96b}
</style><script id="woodrick-edit-catalogue-v1">(function(){
var CATS=['Plywood','Laminates','Louvers','Acrylic Laminates','Shuttering Plywood','Doors','HDHMR & MDF','WPC Board & Chaukhat','Cement','Tiles','Sanitaryware','Bath Fittings','uPVC Doors & Windows','Hardware','Furniture & Kitchen Hardware','Flooring','Wallpapers','Decorative Panels','More Products'];
var active=null;
function ensureModal(){if(document.getElementById('woodrickEditModal'))return;var m=document.createElement('div');m.id='woodrickEditModal';m.className='woodrick-edit-modal';m.innerHTML='<div class="woodrick-edit-card"><h3>Edit Catalogue</h3><div class="woodrick-edit-grid"><label>CATEGORY<select id="woodrickEditCategory"></select></label><label>BRAND<input id="woodrickEditBrand" type="text"></label><label>CATALOGUE / VARIANT NAME<input id="woodrickEditCatalogue" type="text"></label><label>ADMIN PASSWORD<input id="woodrickEditPassword" type="password" placeholder="Required to save"></label></div><div class="woodrick-edit-actions"><button type="button" class="rowbtn woodrick-edit-cancel" id="woodrickEditCancel">CANCEL</button><button type="button" class="rowbtn woodrick-edit-save" id="woodrickEditSave">SAVE CHANGES</button></div></div>';document.body.appendChild(m);var s=document.getElementById('woodrickEditCategory');s.innerHTML=CATS.map(function(x){return '<option>'+x+'</option>'}).join('');document.getElementById('woodrickEditCancel').onclick=function(){m.classList.remove('show');active=null};document.getElementById('woodrickEditSave').onclick=saveEdit;}
function parseRow(btn){var item=btn.closest('.item'),b=item&&item.querySelector('.meta b'),parts=(b?b.textContent:'').split('→').map(function(x){return x.trim()});return {category:parts[0]||'',brand:parts[1]||'',catalogue:parts.slice(2).join(' → ')||btn.dataset.title||''};}
function openEdit(btn){ensureModal();var p=parseRow(btn);active={key:btn.dataset.key,title:btn.dataset.title||p.catalogue};var sel=document.getElementById('woodrickEditCategory');if(!CATS.includes(p.category)){var o=document.createElement('option');o.textContent=p.category;o.value=p.category;sel.prepend(o)}sel.value=p.category;document.getElementById('woodrickEditBrand').value=p.brand;document.getElementById('woodrickEditCatalogue').value=p.catalogue;document.getElementById('woodrickEditPassword').value='';document.getElementById('woodrickEditModal').classList.add('show');}
async function saveEdit(){if(!active)return;var category=document.getElementById('woodrickEditCategory').value.trim(),brand=document.getElementById('woodrickEditBrand').value.trim(),catalogue=document.getElementById('woodrickEditCatalogue').value.trim(),password=document.getElementById('woodrickEditPassword').value.trim(),save=document.getElementById('woodrickEditSave');if(!category||!brand||!catalogue||!password){alert('Category, brand, catalogue name and admin password are required.');return}save.disabled=true;save.textContent='SAVING…';try{var r=await fetch('/api/admin-media-edit',{method:'POST',cache:'no-store',headers:{'content-type':'application/json','authorization':'Bearer '+password},body:JSON.stringify({key:active.key,category:category,brand:brand,catalogue:catalogue})}),d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||'Edit failed');document.getElementById('woodrickEditModal').classList.remove('show');active=null;if(window.loadProducts)await window.loadProducts();else{var refresh=document.getElementById('pRefresh');if(refresh)refresh.click();else location.reload()}}catch(e){alert('Edit error: '+e.message)}finally{save.disabled=false;save.textContent='SAVE CHANGES'}}
function addButtons(){document.querySelectorAll('#pList .item-actions').forEach(function(a){if(a.querySelector('.woodrick-edit-btn'))return;var d=a.querySelector('.pdelete');if(!d)return;var b=document.createElement('button');b.type='button';b.className='rowbtn woodrick-edit-btn';b.textContent='EDIT CATALOGUE';b.dataset.key=d.dataset.key||'';b.dataset.title=d.dataset.title||'';b.onclick=function(e){e.preventDefault();e.stopPropagation();openEdit(b)};a.insertBefore(b,d)});}
function init(){ensureModal();addButtons();var list=document.getElementById('pList');if(list)new MutationObserver(addButtons).observe(list,{childList:true,subtree:true});setInterval(addButtons,1200)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();</script>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if(request.method==='POST'&&url.pathname==='/api/admin-media-edit'){
      if(!explicitPasswordOk(request,env))return json({error:'Correct admin password is required.'},401);
      let body={};try{body=await request.json()}catch{return json({error:'Invalid request'},400)}
      const key=String(body.key||'').trim(),category=String(body.category||'').trim(),brand=String(body.brand||'').trim(),catalogue=String(body.catalogue||'').trim();
      if(!key||!category||!brand||!catalogue)return json({error:'Catalogue key, category, brand and catalogue name are required.'},400);
      try{return json({ok:true,...await editCatalogue(env,key,category,brand,catalogue)})}catch(err){return json({error:String(err?.message||err)},500)}
    }

    if(request.method==='POST'&&url.pathname==='/api/upload'){
      const ct=(request.headers.get('content-type')||'').toLowerCase();
      if(ct.includes('application/json')){
        let body={};try{body=await request.clone().json()}catch{return json({error:'Invalid request'},400)}
        if(body?.action==='delete-media'||body?.action==='delete-library'){
          if(!explicitPasswordOk(request,env))return json({error:'Correct admin password is required.'},401);
          const keys=Array.isArray(body.keys)?body.keys:[];
          if(body.action==='delete-media'&&keys.some(k=>String(k||'').startsWith('product-sync/')))return json({error:'This catalogue is synced from Woodrick Home Library. Delete it from the Library tab.'},400);
          try{return await deleteKeys(env,keys,{libraryOnly:body.action==='delete-library'})}catch(err){return json({error:'Delete failed',detail:String(err?.message||err)},500)}
        }
      }
    }

    const response = await app.fetch(request, env, ctx);
    const isAdmin = request.method === 'GET' && (url.pathname === '/admin-products/' || url.pathname === '/admin-products' || url.pathname === '/admin-products/index.html');
    if (!isAdmin) return response;
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;
    let html = await response.text();
    html = html.replace('renderCategories();loadMedia();loadLibrary();','renderCategories();loadLibrary();');
    html = html.replace(/<script id="woodrick-admin-refresh-stable-v[0-9]+">[\s\S]*?<\/script>/g, '').replace(/<style id="woodrick-admin-refresh-stable-style-v[0-9]+">[\s\S]*?<\/style>/g, '').replace(/<script id="woodrick-admin-media-hybrid-v[0-9]+">[\s\S]*?<\/script>/g, '').replace(/<style id="woodrick-admin-media-hybrid-style-v[0-9]+">[\s\S]*?<\/style>/g, '');
    if(!html.includes('woodrick-edit-catalogue-v1'))html=html.replace('</body>',editPatch+'\n</body>');
    const headers = new Headers(response.headers);headers.delete('content-length');headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');headers.set('x-woodrick-version', 'admin-media-final-v3-edit');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
