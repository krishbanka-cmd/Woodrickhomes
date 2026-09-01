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

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='POST'&&url.pathname==='/api/admin-media-edit')return editProductCatalogue(request,env);
  let response=await app.fetch(request,env,ctx);
  if(request.method==='GET'&&url.pathname==='/api/media'&&!url.searchParams.has('key'))response=await applyCatalogueEdits(response,env);
  const isAdmin=request.method==='GET'&&(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html');
  if(!isAdmin)return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  let html=await response.text();
  html=html.replace(/<script id="woodrick-edit-save-guard-v1">[\s\S]*?<\/script>/g,'').replace(/<script id="woodrick-edit-save-fast-v[0-9]+">[\s\S]*?<\/script>/g,'');
  if(!html.includes('woodrick-edit-save-fast-v4'))html=html.replace('</body>',uiPatch+'\n</body>');
  const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-version','edit-save-fast-v4-metadata-overlay');
  return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
}};
