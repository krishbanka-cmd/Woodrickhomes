const ROOT='private/vendors/';const enc=new TextEncoder();const TYPES={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};const MAX=5*1024*1024;
function json(o,s=200){return new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
function clean(x,n=160){return String(x||'').trim().slice(0,n)}
function cookie(req,name){for(const item of(req.headers.get('cookie')||'').split(';')){const [k,...v]=item.trim().split('=');if(k===name)return v.join('=')}return''}
async function admin(req,env){if(!env.ADMIN_UPLOAD_TOKEN)return false;if(req.headers.get('authorization')==='Bearer '+env.ADMIN_UPLOAD_TOKEN)return true;const k=await crypto.subtle.importKey('raw',enc.encode(env.ADMIN_UPLOAD_TOKEN),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',k,enc.encode('woodrick-admin-session-v1'));return cookie(req,'woodrick_admin')===Array.from(new Uint8Array(sig),b=>b.toString(16).padStart(2,'0')).join('')}
async function ipKey(req,env){const k=await crypto.subtle.importKey('raw',enc.encode(env.ADMIN_UPLOAD_TOKEN||'vendor-limit'),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',k,enc.encode(req.headers.get('cf-connecting-ip')||'unknown'));return ROOT+'rate/'+new Date().toISOString().slice(0,13)+'/'+Array.from(new Uint8Array(sig).slice(0,12),b=>b.toString(16).padStart(2,'0')).join('')}
async function get(env,id){if(!/^[a-f0-9-]{36}$/.test(id))return null;const o=await env.PRODUCT_MEDIA.get(ROOT+'records/'+id+'.json');return o?JSON.parse(await o.text()):null}
async function save(env,o){await env.PRODUCT_MEDIA.put(ROOT+'records/'+o.id+'.json',JSON.stringify(o),{httpMetadata:{contentType:'application/json'}})}
function sameOrigin(req,url){const origin=req.headers.get('origin');return !origin||origin===url.origin}
export async function handleVendor(req,env){
 if(!env.PRODUCT_MEDIA)return json({error:'Vendor storage unavailable'},503);
 const url=new URL(req.url),path=url.pathname;
 try{
  if(path==='/api/vendor-applications'&&req.method==='POST'){
   if(!sameOrigin(req,url))return json({error:'Invalid origin'},403);
   if(!(req.headers.get('content-type')||'').includes('multipart/form-data'))return json({error:'Form data required'},415);
   const n=Number(req.headers.get('content-length')||0);if(n>MAX+150000)return json({error:'Maximum file size 5 MB'},413);
   const f=await req.formData();if(clean(f.get('website')))return json({error:'Unable to submit'},400);
   const business=clean(f.get('business'),120),contact=clean(f.get('contact'),100),mobile=clean(f.get('mobile'),30).replace(/\D/g,''),city=clean(f.get('city'),100),category=clean(f.get('category'),100),gst=clean(f.get('gst'),20).toUpperCase(),note=clean(f.get('note'),500),file=f.get('file');
   if(business.length<2||contact.length<2||!/^\d{10}$/.test(mobile)||city.length<2||!category)return json({error:'Business, contact person, 10-digit mobile, city and category required'},400);
   if(gst&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst))return json({error:'Please check GSTIN'},400);
   if(file&&typeof file.arrayBuffer==='function'&&file.size&&(!TYPES[file.type]||file.size>MAX))return json({error:'Document must be JPG, PNG, WebP or PDF up to 5 MB'},400);
   const rk=await ipKey(req,env),prev=await env.PRODUCT_MEDIA.get(rk),count=prev?Number(await prev.text()):0;if(count>=5)return json({error:'Too many applications. Please try later.'},429);
   const id=crypto.randomUUID(),key=file&&file.size?ROOT+'files/'+id+'/document.'+TYPES[file.type]:null;
   if(key)await env.PRODUCT_MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});
   const item={id,business,contact,mobile,city,category,gst,note,documentKey:key,status:'pending',createdAt:new Date().toISOString(),reviewedAt:null};
   await save(env,item);await env.PRODUCT_MEDIA.put(rk,String(count+1));return json({ok:true,id,message:'Application received. Our team will contact you after review.'},201)
  }
  if(!await admin(req,env))return json({error:'Admin login required'},401);
  if(path==='/api/vendor-applications'&&req.method==='GET'){
   const cursor=url.searchParams.get('cursor')||'';
   if(cursor.length>2048)return json({error:'Invalid cursor'},400);
   const page=await env.PRODUCT_MEDIA.list({prefix:ROOT+'records/',limit:100,...(cursor?{cursor}:{})});const items=[];
   for(const o of page.objects){const item=await get(env,o.key.slice((ROOT+'records/').length).replace(/\.json$/,''));if(item)items.push(item)}
   items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return json({items,truncated:page.truncated,cursor:page.truncated?page.cursor:null});
  }
  if(path==='/api/vendor-applications/status'&&req.method==='POST'){
   if(!sameOrigin(req,url))return json({error:'Invalid origin'},403);
   const body=await req.json(),item=await get(env,clean(body.id,40)),status=clean(body.status,30),note=clean(body.note,500);
   if(!item)return json({error:'Application not found'},404);
   if(!['pending','correction_required','approved','rejected'].includes(status))return json({error:'Invalid status'},400);
   if(status==='correction_required'&&!note)return json({error:'Please describe the correction needed'},400);
   if(String(body.note||'').trim().length>500)return json({error:'Review note must be 500 characters or fewer'},400);
   const at=new Date().toISOString();
   item.status=status;item.reviewNote=note;item.reviewedAt=at;
   item.reviewHistory=[...(Array.isArray(item.reviewHistory)?item.reviewHistory:[]),{status,note,at}].slice(-30);
   await save(env,item);return json({ok:true,status});
  }
  if(path==='/api/vendor-applications/file'&&req.method==='GET'){
   const item=await get(env,clean(url.searchParams.get('id'),40));if(!item||!item.documentKey)return json({error:'Document not found'},404);
   const o=await env.PRODUCT_MEDIA.get(item.documentKey);if(!o)return json({error:'Document not found'},404);
   return new Response(o.body,{headers:{'content-type':o.httpMetadata?.contentType||'application/octet-stream','content-disposition':'attachment; filename="vendor-document.'+item.documentKey.split('.').pop()+'"','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }
  return json({error:'Not found'},404);
 }catch(e){return json({error:'Unable to process request'},500)}
}
