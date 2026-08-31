import app from './worker-edit-category-sync.js';

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate, max-age=0'}})}
function clean(v=''){return String(v||'').trim()}
function slug(v=''){return clean(v).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'item'}
function passwordOk(request,env){return !!env.ADMIN_UPLOAD_TOKEN&&(request.headers.get('authorization')||'')===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`}

async function editProductCatalogue(request,env){
  if(!passwordOk(request,env))return json({error:'Correct admin password is required.'},401);
  if(!env.PRODUCT_MEDIA)return json({error:'Media storage is not configured'},500);
  let body={};try{body=await request.json()}catch{return json({error:'Invalid request'},400)}
  const key=clean(body.key),category=clean(body.category),brand=clean(body.brand),catalogue=clean(body.catalogue);
  if(!key||!category||!brand||!catalogue)return json({error:'Catalogue key, category, brand and catalogue name are required.'},400);
  const head=await env.PRODUCT_MEDIA.head(key);if(!head)return json({error:'Catalogue was not found. Refresh the Product List and try again.'},404);
  const obj=await env.PRODUCT_MEDIA.get(key);if(!obj)return json({error:'Catalogue file could not be read'},500);
  const old=head.customMetadata||{};
  const newKey=`${slug(category)}/${slug(brand)}/${slug(catalogue)}/pdf/${Date.now()}-${slug(catalogue)}.pdf`;
  const meta={...old,category,brand,catalogue,title:catalogue,type:'pdf',library:'0',source:'admin-edit',sourceKey:'',editedAt:new Date().toISOString()};
  try{
    await env.PRODUCT_MEDIA.put(newKey,obj.body,{httpMetadata:head.httpMetadata||obj.httpMetadata||{contentType:'application/pdf'},customMetadata:meta});
    if(key!==newKey)await env.PRODUCT_MEDIA.delete(key);
    return json({ok:true,key:newKey,scope:'product-media',edited:true});
  }catch(err){return json({error:'Edit save failed',detail:String(err?.message||err)},500)}
}

const uiPatch=`<script id="woodrick-edit-save-fast-v3">(function(){document.addEventListener('click',function(e){var b=e.target.closest('#woodrickEditSave');if(!b)return;setTimeout(function(){if(b.disabled&&String(b.textContent).indexOf('SAVING')>=0){var card=b.closest('.woodrick-edit-card');if(card&&!card.querySelector('.woodrick-save-note')){var n=document.createElement('div');n.className='woodrick-save-note';n.style.cssText='margin-top:10px;font-size:11px;color:#6d675e';n.textContent='Saving catalogue changes…';card.appendChild(n)} }},500)},true)})();</script>`;

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='POST'&&url.pathname==='/api/admin-media-edit')return editProductCatalogue(request,env);
  const response=await app.fetch(request,env,ctx);
  const isAdmin=request.method==='GET'&&(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html');
  if(!isAdmin)return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  let html=await response.text();
  html=html.replace(/<script id="woodrick-edit-save-guard-v1">[\s\S]*?<\/script>/g,'');
  if(!html.includes('woodrick-edit-save-fast-v3'))html=html.replace('</body>',uiPatch+'\n</body>');
  const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-version','edit-save-fast-v3-direct-product-edit');
  return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
}};
