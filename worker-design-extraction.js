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
function extractedRootFor(brand,category,catalogue){return `library/${slug(brand)}/${slug(category)}/${slug(catalogue)}-extracted`}
function item(o){const m=o.customMetadata||{};return{key:o.key,size:o.size,uploaded:o.uploaded,url:`/api/media?raw=1&key=${encodeURIComponent(o.key)}`,...m}}
function toBase64(buffer){const bytes=new Uint8Array(buffer);let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(out)}

async function suggestDesigns(request,env){
  if(!env.PRODUCT_MEDIA)return json({error:'Media storage is unavailable'},500);
  if(!await authorized(request,env))return json({error:'Admin login required'},401);
  if(!env.OPENAI_API_KEY)return json({error:'AI design detection is not configured.'},503);
  let body={};try{body=await request.json()}catch{return json({error:'Invalid request'},400)}
  const targetDesignNo=String(body.targetDesignNo||'').trim().toUpperCase();if(targetDesignNo&&!/^[A-Z0-9._-]{2,40}$/.test(targetDesignNo))return json({error:'Invalid target Design No.'},400);
  const sourceKey=String(body.sourceKey||'');if(!sourceKey.startsWith('library/')||!sourceKey.includes('/jpg/')||sourceKey.includes('..'))return json({error:'Choose a valid catalogue page.'},400);
  const object=await env.PRODUCT_MEDIA.get(sourceKey);if(!object)return json({error:'Catalogue page was not found.'},404);
  if(String((object.customMetadata||{}).type||'')!=='jpg-page')return json({error:'Selected file is not a catalogue page.'},400);
  const buffer=await object.arrayBuffer();if(!buffer.byteLength||buffer.byteLength>10*1024*1024)return json({error:'Catalogue page is too large for AI detection.'},413);
  const contentType=(object.httpMetadata&&object.httpMetadata.contentType)||'image/jpeg',dataUrl=`data:${contentType};base64,${toBase64(buffer)}`;
  const prompt=targetDesignNo?`You are performing a second-pass precision crop for exactly one building-material SKU: ${targetDesignNo}.
Find the clearly printed label ${targetDesignNo}, identify only the single material swatch paired with that exact label, and return exactly one result.

STRICT RULES:
1. The rectangle must be INSIDE that material surface boundary and contain only its texture.
2. Never include an adjacent swatch, a second design, the surrounding presentation card, black/white/gold frame, margin, label, logo, QR code, shadow or room/application photo.
3. If two swatches share one card, return only the swatch belonging to ${targetDesignNo}; never box the combined card.
4. If the pairing or exact inner boundary is uncertain, return no result. Never guess.
5. Set assetType exactly to "material-swatch" and confidence >= 0.9 only when the target and its single inner boundary are both clear.

Coordinates x,y,w,h are fractions from 0 to 1 from the full image top-left. Return ONLY JSON:
{"designs":[{"designNo":"${targetDesignNo}","assetType":"material-swatch","confidence":0.95,"x":0.1,"y":0.2,"w":0.3,"h":0.4}]}
If an exact single swatch is not clear, return {"designs":[]}.`:`You are extracting sellable building-material swatches from one catalogue page.
Return only a physical material sample/laminate swatch that can stand alone as an ecommerce or mood-board product image.

STRICT RULES:
1. Crop INSIDE the material surface boundary. The crop must contain the design texture only.
2. Exclude every surrounding black/white/gold frame, presentation card, margin, shadow, logo, QR code, caption and SKU label.
3. Never extract a room/application photo, cover page, decorative photo, page layout or a card containing a smaller swatch.
4. If a presentation card contains a swatch, box only the inner material/texture rectangle—not the card.
5. Return one clearly printed SKU per swatch. A combined reference such as FL-402/M181, two SKUs joined by /, &, + or comma, is an application reference and must be skipped.
6. Never invent or repair an unreadable SKU. Skip uncertain items.
7. Set assetType exactly to "material-swatch" and confidence from 0 to 1. Only use confidence >= 0.82 when both SKU and inner swatch boundary are clear.

Coordinates x,y,w,h are fractions from 0 to 1 from the full image top-left. Return ONLY JSON:
{"designs":[{"designNo":"FL-405","assetType":"material-swatch","confidence":0.95,"x":0.1,"y":0.2,"w":0.3,"h":0.4}]}
If no exact standalone swatch is clear, return {"designs":[]}.`;
  let api;try{api=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:'gpt-4.1',messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:dataUrl,detail:'high'}}]}],temperature:0,max_tokens:1600,response_format:{type:'json_object'}})})}catch{return json({error:'AI detection could not connect. Please retry.'},502)}
  const response=await api.json().catch(()=>({}));if(!api.ok)return json({error:(response.error&&response.error.message)||'AI detection failed.'},502);
  let parsed={};try{parsed=JSON.parse(response.choices&&response.choices[0]&&response.choices[0].message&&response.choices[0].message.content||'{}')}catch{return json({error:'AI returned an unreadable result. Please retry.'},502)}
  const seen=new Set(),designs=(Array.isArray(parsed.designs)?parsed.designs:[]).map(x=>({designNo:String(x&&x.designNo||'').trim().toUpperCase(),assetType:String(x&&x.assetType||'').trim().toLowerCase(),confidence:Number(x&&x.confidence),x:Number(x&&x.x),y:Number(x&&x.y),w:Number(x&&x.w),h:Number(x&&x.h)})).filter(x=>{const id=x.designNo.replace(/[^A-Z0-9]/g,'');if(x.assetType!=='material-swatch'||x.confidence<(targetDesignNo?0.9:0.82)||(targetDesignNo&&x.designNo!==targetDesignNo)||/[\/,&+]/.test(x.designNo)||id.length<2||id.length>40||!/[0-9]/.test(id)||seen.has(id)||![x.x,x.y,x.w,x.h].every(Number.isFinite)||x.x<0||x.y<0||x.w<.015||x.h<.015||x.x+x.w>1.001||x.y+x.h>1.001)return false;seen.add(id);return true}).slice(0,targetDesignNo?1:24);
  return json({ok:true,sourceKey,targetDesignNo:targetDesignNo||null,designs,mode:targetDesignNo?'ai-exact-sku-second-pass':'ai-page-discovery'});
}

async function listPilot(request,env){
  if(!env.PRODUCT_MEDIA)return json({error:'Media storage is unavailable'},500);
  if(!await authorized(request,env))return json({error:'Admin login required'},401);
  const q=new URL(request.url).searchParams;
  if(q.get('mode')==='folders'){
    const groups=new Map;let cursor;
    for(let loop=0;loop<200;loop++){const options={prefix:'library/',limit:1000,include:['customMetadata']};if(cursor)options.cursor=cursor;const listed=await env.PRODUCT_MEDIA.list(options);for(const o of listed.objects||[]){const m=o.customMetadata||{};if(m.type!=='jpg-page')continue;const brand=String(m.brand||''),category=String(m.category||''),catalogue=String(m.catalogue||m.title||'');if(!brand||!category||!catalogue)continue;const id=[brand,category,catalogue].join('|').toLowerCase(),g=groups.get(id)||{brand,category,catalogue,pageCount:0,folder:rootFor(brand,category,catalogue),extractedFolder:extractedRootFor(brand,category,catalogue)};g.pageCount++;groups.set(id,g)}if(!listed.truncated||!listed.cursor)break;cursor=listed.cursor}
    const folders=[...groups.values()].sort((a,b)=>a.brand.localeCompare(b.brand)||a.category.localeCompare(b.category)||a.catalogue.localeCompare(b.catalogue));return json({ok:true,folders});
  }
  const brand=String(q.get('brand')||'Woodline').trim(),category=String(q.get('category')||'Acrylic Laminates').trim(),catalogue=String(q.get('catalogue')||'Woodline Acrylic').trim(),root=rootFor(brand,category,catalogue),extractedRoot=extractedRootFor(brand,category,catalogue);
  const [pages,designs]=await Promise.all([
    env.PRODUCT_MEDIA.list({prefix:root+'/jpg/',limit:1000,include:['customMetadata','httpMetadata']}),
    env.PRODUCT_MEDIA.list({prefix:extractedRoot+'/designs/',limit:1000,include:['customMetadata','httpMetadata']})
  ]);
  const pageItems=(pages.objects||[]).map(item).filter(x=>x.type==='jpg-page').sort((a,b)=>Number(a.page||0)-Number(b.page||0));
  const designItems=(designs.objects||[]).map(item).filter(x=>x.type==='individual-design').sort((a,b)=>Number(a.page||0)-Number(b.page||0)||String(a.designNo||'').localeCompare(String(b.designNo||'')));
  return json({ok:true,brand,category,catalogue,folder:root,extractedFolder:extractedRoot,pages:pageItems,designs:designItems});
}

async function saveDesign(request,env){
  if(!env.PRODUCT_MEDIA)return json({error:'Media storage is unavailable'},500);
  if(!passwordOk(request,env))return json({error:'Correct admin password is required.'},401);
  let form;try{form=await request.formData()}catch{return json({error:'Invalid design upload'},400)}
  const file=form.get('file'),brand=String(form.get('brand')||'').trim(),category=String(form.get('category')||'').trim(),catalogue=String(form.get('catalogue')||'').trim(),designNo=String(form.get('designNo')||'').trim().toUpperCase(),page=String(form.get('page')||'').trim(),sourceKey=String(form.get('sourceKey')||'').trim(),approved=String(form.get('approved')||'')==='1',previousKey=String(form.get('previousKey')||'').trim(),generatedRaw=String(form.get('generatedBy')||'manual'),generatedBy=/^ai-v[23]$/.test(generatedRaw)?generatedRaw:'manual';
  const coords={x:safeNumber(form.get('x')),y:safeNumber(form.get('y')),w:safeNumber(form.get('w')),h:safeNumber(form.get('h'))};
  if(!file||typeof file.arrayBuffer!=='function'||!['image/webp','image/jpeg','image/png'].includes(file.type))return json({error:'A cropped JPG, PNG or WebP image is required.'},415);
  if(file.size>8*1024*1024)return json({error:'Design crop is too large.'},413);
  if(!brand||!category||!catalogue||!designNo||!page||!sourceKey||Object.values(coords).some(v=>v===null)||coords.w<=0||coords.h<=0)return json({error:'Catalogue, page, crop area and Design No. are required.'},400);
  const root=rootFor(brand,category,catalogue),extractedRoot=extractedRootFor(brand,category,catalogue);if(!sourceKey.startsWith(root+'/jpg/')||sourceKey.includes('..'))return json({error:'Invalid source catalogue page.'},400);
  const ext=file.type==='image/png'?'png':file.type==='image/jpeg'?'jpg':'webp',key=`${extractedRoot}/designs/${slug(designNo)}.${ext}`;
  const meta={library:'1',type:'individual-design',brand,category,catalogue,title:designNo,designNo,page,sourceKey,sourceFolder:root,extractedFolder:extractedRoot,approved:approved?'1':'0',generatedBy,x:String(coords.x),y:String(coords.y),w:String(coords.w),h:String(coords.h),updatedAt:new Date().toISOString(),originalName:file.name||`${designNo}.${ext}`};
  await env.PRODUCT_MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type},customMetadata:meta});
  if(previousKey&&previousKey!==key&&previousKey.startsWith(extractedRoot+'/designs/')&&!previousKey.includes('..'))await env.PRODUCT_MEDIA.delete(previousKey);
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
  if(request.method==='POST'&&url.pathname==='/api/admin-design-suggest')return suggestDesigns(request,env);
  let response=await app.fetch(request,env,ctx);
  if(request.method==='GET'&&url.pathname==='/api/media'&&String(url.searchParams.get('prefix')||'').startsWith('library/'))response=await exposeApprovedDesignsToMoodBoard(request,response);
  if(request.method==='GET'&&(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html')&&(response.headers.get('content-type')||'').includes('text/html')){const html=addAdminLink(await response.text()),h=new Headers(response.headers);h.delete('content-length');return new Response(html,{status:response.status,statusText:response.statusText,headers:h})}
  return response;
}};
