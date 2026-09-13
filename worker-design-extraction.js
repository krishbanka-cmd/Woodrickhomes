import app from './worker-category-ui-hardfix.js';

const enc=new TextEncoder();
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate, max-age=0'}})}
function slug(v=''){return String(v||'').toLowerCase().trim().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'item'}
function cookieValue(request,name){const raw=request.headers.get('cookie')||'';for(const part of raw.split(';')){const [k,...rest]=part.trim().split('=');if(k===name)return rest.join('=')}return''}
async function sessionValue(secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,enc.encode('woodrick-admin-session-v1'));return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function authorized(request,env){if(!env.ADMIN_UPLOAD_TOKEN)return false;const auth=request.headers.get('authorization')||'';if(auth===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`)return true;return cookieValue(request,'woodrick_admin')===await sessionValue(env.ADMIN_UPLOAD_TOKEN)}
function passwordOk(request,env){return !!env.ADMIN_UPLOAD_TOKEN&&(request.headers.get('authorization')||'')===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`}
function safeNumber(v){const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=1?n:null}
function rootFor(brand,category,catalogue){return `library/${slug(brand)}/${slug(category)}/${slug(catalogue)}`}
function item(o){const m=o.customMetadata||{};return{key:o.key,size:o.size,uploaded:o.uploaded,url:`/api/media?raw=1&key=${encodeURIComponent(o.key)}`,...m}}

async function listPilot(request,env){
  if(!env.PRODUCT_MEDIA)return json({error:'Media storage is unavailable'},500);
  if(!await authorized(request,env))return json({error:'Admin login required'},401);
  const q=new URL(request.url).searchParams,brand=String(q.get('brand')||'Woodline').trim(),category=String(q.get('category')||'Acrylic Laminates').trim(),catalogue=String(q.get('catalogue')||'Woodline Acrylic').trim(),root=rootFor(brand,category,catalogue);
  const [pages,designs]=await Promise.all([
    env.PRODUCT_MEDIA.list({prefix:root+'/jpg/',limit:1000,include:['customMetadata','httpMetadata']}),
    env.PRODUCT_MEDIA.list({prefix:root+'/designs/',limit:1000,include:['customMetadata','httpMetadata']})
  ]);
  const pageItems=(pages.objects||[]).map(item).filter(x=>x.type==='jpg-page').sort((a,b)=>Number(a.page||0)-Number(b.page||0));
  const designItems=(designs.objects||[]).map(item).filter(x=>x.type==='individual-design').sort((a,b)=>Number(a.page||0)-Number(b.page||0)||String(a.designNo||'').localeCompare(String(b.designNo||'')));
  return json({ok:true,brand,category,catalogue,pages:pageItems,designs:designItems});
}

async function saveDesign(request,env){
  if(!env.PRODUCT_MEDIA)return json({error:'Media storage is unavailable'},500);
  if(!passwordOk(request,env))return json({error:'Correct admin password is required.'},401);
  let form;try{form=await request.formData()}catch{return json({error:'Invalid design upload'},400)}
  const file=form.get('file'),brand=String(form.get('brand')||'').trim(),category=String(form.get('category')||'').trim(),catalogue=String(form.get('catalogue')||'').trim(),designNo=String(form.get('designNo')||'').trim().toUpperCase(),page=String(form.get('page')||'').trim(),sourceKey=String(form.get('sourceKey')||'').trim(),approved=String(form.get('approved')||'')==='1',previousKey=String(form.get('previousKey')||'').trim();
  const coords={x:safeNumber(form.get('x')),y:safeNumber(form.get('y')),w:safeNumber(form.get('w')),h:safeNumber(form.get('h'))};
  if(!file||typeof file.arrayBuffer!=='function'||!['image/webp','image/jpeg','image/png'].includes(file.type))return json({error:'A cropped JPG, PNG or WebP image is required.'},415);
  if(file.size>8*1024*1024)return json({error:'Design crop is too large.'},413);
  if(!brand||!category||!catalogue||!designNo||!page||!sourceKey||Object.values(coords).some(v=>v===null)||coords.w<=0||coords.h<=0)return json({error:'Catalogue, page, crop area and Design No. are required.'},400);
  const root=rootFor(brand,category,catalogue);if(!sourceKey.startsWith(root+'/jpg/')||sourceKey.includes('..'))return json({error:'Invalid source catalogue page.'},400);
  const ext=file.type==='image/png'?'png':file.type==='image/jpeg'?'jpg':'webp',key=`${root}/designs/${slug(designNo)}.${ext}`;
  const meta={library:'1',type:'individual-design',brand,category,catalogue,title:designNo,designNo,page,sourceKey,approved:approved?'1':'0',x:String(coords.x),y:String(coords.y),w:String(coords.w),h:String(coords.h),updatedAt:new Date().toISOString(),originalName:file.name||`${designNo}.${ext}`};
  await env.PRODUCT_MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type},customMetadata:meta});
  if(previousKey&&previousKey!==key&&previousKey.startsWith(root+'/designs/')&&!previousKey.includes('..'))await env.PRODUCT_MEDIA.delete(previousKey);
  return json({ok:true,key,url:`/api/media?raw=1&key=${encodeURIComponent(key)}`,...meta},201);
}

async function deleteDesign(request,env){
  if(!env.PRODUCT_MEDIA)return json({error:'Media storage is unavailable'},500);
  if(!passwordOk(request,env))return json({error:'Correct admin password is required.'},401);
  let body={};try{body=await request.json()}catch{return json({error:'Invalid request'},400)}
  const key=String(body.key||'');if(!key.startsWith('library/')||!key.includes('/designs/')||key.includes('..'))return json({error:'Invalid individual design key.'},400);
  if(!await env.PRODUCT_MEDIA.head(key))return json({error:'Design not found.'},404);await env.PRODUCT_MEDIA.delete(key);return json({ok:true,deleted:key});
}

async function adminPage(request,env){
  if(!await authorized(request,env))return Response.redirect(new URL('/admin-products/',request.url).toString(),302);
  const assetUrl=new URL('/admin-design-extraction.html',request.url),response=await env.ASSETS.fetch(new Request(assetUrl.toString(),{method:'GET',headers:request.headers}));
  const h=new Headers(response.headers);h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
}

function addAdminLink(html){if(html.includes('href="/admin-design-extraction"'))return html;return html.replace('BACK TO PRODUCTS</a>','BACK TO PRODUCTS</a><a href="/admin-design-extraction">EXTRACT DESIGNS</a>')}

async function exposeApprovedDesignsToMoodBoard(request,response){
  const referer=request.headers.get('referer')||'';
  if(!referer.includes('/voice-design-assistant')&&!referer.includes('/ai-auto-select'))return response;
  if(!(response.headers.get('content-type')||'').includes('application/json'))return response;
  try{
    const data=await response.clone().json();if(!Array.isArray(data.items))return response;
    data.items=data.items.map(x=>x&&x.type==='individual-design'&&x.approved==='1'?{...x,type:'jpg-page',individualDesign:'1',sku:x.designNo||x.sku||''}:x);
    const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store');return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:h});
  }catch{return response}
}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='GET'&&(url.pathname==='/admin-design-extraction'||url.pathname==='/admin-design-extraction/'))return adminPage(request,env);
  if(url.pathname==='/api/admin-design-extraction'){
    if(request.method==='GET')return listPilot(request,env);
    if(request.method==='POST')return saveDesign(request,env);
    if(request.method==='DELETE')return deleteDesign(request,env);
    return json({error:'Method not allowed'},405);
  }
  let response=await app.fetch(request,env,ctx);
  if(request.method==='GET'&&url.pathname==='/api/media'&&String(url.searchParams.get('prefix')||'').startsWith('library/'))response=await exposeApprovedDesignsToMoodBoard(request,response);
  if(request.method==='GET'&&(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html')&&(response.headers.get('content-type')||'').includes('text/html')){const html=addAdminLink(await response.text()),h=new Headers(response.headers);h.delete('content-length');return new Response(html,{status:response.status,statusText:response.statusText,headers:h})}
  return response;
}};
