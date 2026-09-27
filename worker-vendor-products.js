// Product proposals remain private until an explicit publishing workflow is built.
const ROOT='private/vendor-products/';
const encoder=new TextEncoder();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const clean=(value,max=160)=>String(value||'').trim().slice(0,max);
const validId=value=>/^[a-f0-9-]{36}$/.test(value);
function cookie(req,name){for(const part of(req.headers.get('cookie')||'').split(';')){const [key,...value]=part.trim().split('=');if(key===name)return value.join('=')}return''}
function toBase64Url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function fromBase64Url(value){if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid token');return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0))}
async function signingKey(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}

// Only the future verified OTP endpoint should call this. There is no public token-issuance route.
export async function createVendorSession(vendorId,secret,now=Date.now()){
  if(!validId(vendorId)||!secret||secret.length<32)throw Error('Invalid vendor session configuration');
  const payload=toBase64Url(encoder.encode(JSON.stringify({vendorId,expires:now+8*60*60*1000})));
  const signature=await crypto.subtle.sign('HMAC',await signingKey(secret),encoder.encode(payload));
  return payload+'.'+toBase64Url(new Uint8Array(signature));
}
async function vendor(req,env){
  if(!env.VENDOR_SESSION_SECRET)return null;
  const token=cookie(req,'woodrick_vendor'),parts=token.split('.');
  if(parts.length!==2||token.length>1000)return null;
  try{
    const valid=await crypto.subtle.verify('HMAC',await signingKey(env.VENDOR_SESSION_SECRET),fromBase64Url(parts[1]),encoder.encode(parts[0]));
    if(!valid)return null;
    const data=JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
    if(!validId(data.vendorId)||!Number.isFinite(data.expires)||data.expires<Date.now())return null;
    const object=await env.PRODUCT_MEDIA.get('private/vendors/records/'+data.vendorId+'.json');
    if(!object)return null;
    const application=JSON.parse(await object.text());
    return application.status==='approved'?application:null;
  }catch{return null}
}
async function admin(req,env){
  if(!env.ADMIN_UPLOAD_TOKEN)return false;
  if(req.headers.get('authorization')==='Bearer '+env.ADMIN_UPLOAD_TOKEN)return true;
  const key=await signingKey(env.ADMIN_UPLOAD_TOKEN);
  const signature=await crypto.subtle.sign('HMAC',key,encoder.encode('woodrick-admin-session-v1'));
  return cookie(req,'woodrick_admin')===Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
}
function sameOrigin(req,url){const origin=req.headers.get('origin');return !origin||origin===url.origin}
async function list(env,prefix,cursor,vendorView=false){
  if(cursor.length>2048)return json({error:'Invalid cursor'},400);
  const page=await env.PRODUCT_MEDIA.list({prefix,limit:100,...(cursor?{cursor}:{})}),items=[];
  for(let index=0;index<page.objects.length;index+=10){
    const batch=await Promise.all(page.objects.slice(index,index+10).map(async entry=>{
      const object=await env.PRODUCT_MEDIA.get(entry.key);
      return object?JSON.parse(await object.text()):null;
    }));
    items.push(...batch.filter(Boolean));
  }
  const visible=vendorView?items.map(({reviewHistory,reviewNote,...item})=>({
    ...item,...(item.status==='correction_required'&&reviewNote?{correctionReason:reviewNote}:{})
  })):items;
  return json({items:visible,cursor:page.truncated?page.cursor:null,truncated:page.truncated});
}

export async function handleVendorProducts(req,env){
  if(!env.PRODUCT_MEDIA)return json({error:'Vendor storage unavailable'},503);
  const url=new URL(req.url),path=url.pathname;
  try{
    if(path==='/api/vendor-products/admin'||path==='/api/vendor-products/admin/status'){
      if(!await admin(req,env))return json({error:'Admin login required'},401);
      if(path==='/api/vendor-products/admin'&&req.method==='GET'){
        const vendorId=url.searchParams.get('vendorId');
        if(vendorId!==null&&!validId(vendorId))return json({error:'Invalid vendor reference'},400);
        return list(env,ROOT+(vendorId?vendorId+'/':''),url.searchParams.get('cursor')||'');
      }
      if(path==='/api/vendor-products/admin/status'&&req.method==='POST'){
        if(!sameOrigin(req,url))return json({error:'Invalid origin'},403);
        const body=await req.json(),vendorId=clean(body.vendorId,40),id=clean(body.id,40),status=clean(body.status,30),note=clean(body.note,500);
        if(!validId(vendorId)||!validId(id))return json({error:'Invalid product reference'},400);
        if(!['pending','correction_required','approved','rejected'].includes(status))return json({error:'Invalid status'},400);
        if(status==='correction_required'&&!note)return json({error:'Please describe the correction needed'},400);
        if(String(body.note||'').trim().length>500)return json({error:'Review note must be 500 characters or fewer'},400);
        const key=ROOT+vendorId+'/'+id+'.json',object=await env.PRODUCT_MEDIA.get(key);
        if(!object)return json({error:'Product proposal not found'},404);
        const item=JSON.parse(await object.text()),at=new Date().toISOString();
        item.status=status;item.reviewNote=note;item.reviewedAt=at;
        item.reviewHistory=[...(Array.isArray(item.reviewHistory)?item.reviewHistory:[]),{status,note,at}].slice(-30);
        await env.PRODUCT_MEDIA.put(key,JSON.stringify(item),{httpMetadata:{contentType:'application/json'}});
        return json({ok:true,status,public:false});
      }
      return json({error:'Method not allowed'},405);
    }
    if(path!=='/api/vendor-products'&&path!=='/api/vendor-products/resubmit')return json({error:'Not found'},404);
    const application=await vendor(req,env);
    if(!application)return json({error:'Approved vendor login required'},401);
    if(path==='/api/vendor-products'&&req.method==='GET')return list(env,ROOT+application.id+'/',url.searchParams.get('cursor')||'',true);
    if(req.method==='POST'){
      if(!sameOrigin(req,url))return json({error:'Invalid origin'},403);
      if(!(req.headers.get('content-type')||'').includes('application/json'))return json({error:'JSON required'},415);
      const body=await req.json(),title=clean(body.title,140),brand=clean(body.brand,100),category=clean(body.category,100),sku=clean(body.sku,80),description=clean(body.description,1000);
      if(title.length<2||!brand||!category||!sku)return json({error:'Title, brand, category and SKU are required'},400);
      if(String(body.description||'').length>1000)return json({error:'Description must be 1000 characters or fewer'},400);
      if(path==='/api/vendor-products/resubmit'){
        const id=clean(body.id,40);
        if(!validId(id))return json({error:'Invalid product reference'},400);
        const key=ROOT+application.id+'/'+id+'.json',object=await env.PRODUCT_MEDIA.get(key);
        if(!object)return json({error:'Product proposal not found'},404);
        const item=JSON.parse(await object.text());
        if(item.vendorId!==application.id||item.status!=='correction_required')return json({error:'Only your correction requests can be resubmitted'},409);
        Object.assign(item,{title,brand,category,sku,description,status:'pending',reviewNote:'',reviewedAt:null,updatedAt:new Date().toISOString(),revision:(item.revision||1)+1});
        item.reviewHistory=[...(Array.isArray(item.reviewHistory)?item.reviewHistory:[]),{status:'resubmitted',note:'',at:item.updatedAt}].slice(-30);
        await env.PRODUCT_MEDIA.put(key,JSON.stringify(item),{httpMetadata:{contentType:'application/json'}});
        return json({ok:true,id,status:'pending',public:false});
      }
      const id=crypto.randomUUID(),item={id,vendorId:application.id,title,brand,category,sku,description,status:'pending',createdAt:new Date().toISOString(),reviewedAt:null};
      await env.PRODUCT_MEDIA.put(ROOT+application.id+'/'+id+'.json',JSON.stringify(item),{httpMetadata:{contentType:'application/json'}});
      return json({ok:true,id,status:'pending',public:false},201);
    }
    return json({error:'Method not allowed'},405);
  }catch{return json({error:'Unable to process product proposal'},500)}
}
