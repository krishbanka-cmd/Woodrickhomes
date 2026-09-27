const ROOT = 'private/list-quotes/';
const MAX_FILE = 8 * 1024 * 1024;
const TYPES = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};
const encoder = new TextEncoder();
function reply(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
function cookie(req,name){for(const pair of (req.headers.get('cookie')||'').split(';')){const [key,...value]=pair.trim().split('=');if(key===name)return value.join('=')}return''}
async function admin(req,env){if(!env.ADMIN_UPLOAD_TOKEN)return false;if(req.headers.get('authorization')===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`)return true;const key=await crypto.subtle.importKey('raw',encoder.encode(env.ADMIN_UPLOAD_TOKEN),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,encoder.encode('woodrick-admin-session-v1'));const value=Array.from(new Uint8Array(sig),b=>b.toString(16).padStart(2,'0')).join('');return cookie(req,'woodrick_admin')===value}
function clean(v,max=160){return String(v||'').trim().slice(0,max)}
function safeMobile(v){return /^\d{10}$/.test(String(v||'').replace(/\D/g,''))?String(v).replace(/\D/g,''):''}
async function rateKey(req,env){const ip=req.headers.get('cf-connecting-ip')||'unknown';const key=await crypto.subtle.importKey('raw',encoder.encode(env.ADMIN_UPLOAD_TOKEN||'woodrick-list-quotes'),{name:'HMAC',hash:'SHA-256'},false,['sign']);const h=await crypto.subtle.sign('HMAC',key,encoder.encode(ip));return ROOT+'rate/'+new Date().toISOString().slice(0,13)+'/'+Array.from(new Uint8Array(h).slice(0,12),b=>b.toString(16).padStart(2,'0')).join('')}
function originalUrl(id){return `/api/list-quote/file?id=${encodeURIComponent(id)}&kind=original`}
async function record(env,id){const item=await env.PRODUCT_MEDIA.get(ROOT+'records/'+id+'.json');return item?JSON.parse(await item.text()):null}
async function save(env,item){await env.PRODUCT_MEDIA.put(ROOT+'records/'+item.id+'.json',JSON.stringify(item),{httpMetadata:{contentType:'application/json'}})}
async function fileResponse(env,key,download=false){const obj=await env.PRODUCT_MEDIA.get(key);if(!obj)return new Response('File not found',{status:404});const headers=new Headers({'content-type':obj.httpMetadata?.contentType||'application/octet-stream','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':'sandbox'});headers.set('content-disposition',`${download?'attachment':'inline'}; filename="${key.endsWith('.pdf')?'quotation.pdf':'requirement.'+key.split('.').pop()}"`);return new Response(obj.body,{headers})}
export async function handleListQuote(request,env){
 if(!env.PRODUCT_MEDIA)return reply({error:'File storage is unavailable'},503);
 const url=new URL(request.url),path=url.pathname,isAdmin=await admin(request,env);
 try{
  if(path==='/api/list-quote'&&request.method==='POST'){
   const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return reply({error:'Invalid request origin'},403);
   const type=request.headers.get('content-type')||'';if(!type.includes('multipart/form-data'))return reply({error:'Please attach a photo or PDF'},415);
   const size=Number(request.headers.get('content-length')||0);if(size>MAX_FILE+32768)return reply({error:'Maximum file size is 8 MB'},413);
   const form=await request.formData();if(clean(form.get('website'),200))return reply({error:'Unable to submit'},400);
   const name=clean(form.get('name'),100),mobile=safeMobile(form.get('mobile')),city=clean(form.get('city'),120),note=clean(form.get('note'),500),file=form.get('file');
   if(name.length<2||!mobile||!city)return reply({error:'Enter your name, 10-digit phone number and city'},400);
   if(!file||typeof file.arrayBuffer!=='function'||!TYPES[file.type])return reply({error:'Upload a JPG, PNG, WebP photo or PDF'},415);
   if(!file.size||file.size>MAX_FILE)return reply({error:'File must be 8 MB or smaller'},413);
   const rate=await rateKey(request,env),existing=await env.PRODUCT_MEDIA.get(rate);let count=existing?Number(await existing.text()):0;if(count>=10)return reply({error:'Too many requests. Please contact us by phone.'},429);
   const id=crypto.randomUUID(),ext=TYPES[file.type],key=ROOT+'files/'+id+'/original.'+ext;
   await env.PRODUCT_MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});
   const item={id,name,mobile,city,note,createdAt:new Date().toISOString(),status:'new',originalKey:key,quoteKey:null,shareToken:null};
   await save(env,item);await env.PRODUCT_MEDIA.put(rate,String(count+1));return reply({ok:true,id,message:'Your list has been received. Our team will review it and contact you.'},201);
  }
  if(path==='/api/list-quote'&&request.method==='GET'){
   if(!isAdmin)return reply({error:'Admin login required'},401);
   const listed=await env.PRODUCT_MEDIA.list({prefix:ROOT+'records/',limit:100});const items=[];for(const obj of listed.objects){const id=obj.key.slice((ROOT+'records/').length).replace(/\.json$/,'');const entry=await record(env,id);if(entry)items.push({id:entry.id,name:entry.name,mobile:entry.mobile,city:entry.city,note:entry.note,createdAt:entry.createdAt,status:entry.status,hasQuote:!!entry.quoteKey,originalUrl:originalUrl(id),quoteUrl:entry.quoteKey?`/api/list-quote/file?id=${encodeURIComponent(id)}&kind=quote`:null,shareUrl:entry.shareToken?`${url.origin}/api/list-quote/share?id=${encodeURIComponent(id)}&token=${encodeURIComponent(entry.shareToken)}`:null})}items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return reply({items,truncated:listed.truncated});
  }
  if(path==='/api/list-quote/quote'&&request.method==='POST'){
   if(!isAdmin)return reply({error:'Admin login required'},401);
   const form=await request.formData(),id=clean(form.get('id'),80),item=await record(env,id),file=form.get('file');if(!item)return reply({error:'Request not found'},404);if(!file||file.type!=='application/pdf'||!file.size||file.size>MAX_FILE)return reply({error:'Attach a quotation PDF up to 8 MB'},400);
   const key=ROOT+'files/'+id+'/quotation.pdf';await env.PRODUCT_MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:'application/pdf'}});
   item.quoteKey=key;item.shareToken=crypto.randomUUID()+crypto.randomUUID();item.status='quoted';item.quotedAt=new Date().toISOString();await save(env,item);
   return reply({ok:true,shareUrl:`${url.origin}/api/list-quote/share?id=${encodeURIComponent(id)}&token=${encodeURIComponent(item.shareToken)}`});
  }
  if(path==='/api/list-quote/file'&&request.method==='GET'){
   if(!isAdmin)return reply({error:'Admin login required'},401);const item=await record(env,clean(url.searchParams.get('id'),80));if(!item)return reply({error:'Request not found'},404);const key=url.searchParams.get('kind')==='quote'?item.quoteKey:item.originalKey;return key?fileResponse(env,key):reply({error:'File not found'},404);
  }
  if(path==='/api/list-quote/share'&&request.method==='GET'){
   const item=await record(env,clean(url.searchParams.get('id'),80));if(!item||!item.quoteKey||!item.shareToken||url.searchParams.get('token')!==item.shareToken)return new Response('Quotation link not found',{status:404});return fileResponse(env,item.quoteKey);
  }
  return reply({error:'Method not allowed'},405);
 }catch(err){console.error('List quote error',err);return reply({error:'Unable to process this request right now'},500)}
}
