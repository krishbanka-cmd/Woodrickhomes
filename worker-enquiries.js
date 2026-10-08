// First-party record for website enquiries. The Google Sheet remains a separate, best-effort integration.
const ROOT='private/enquiries/';
const enc=new TextEncoder();
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const clean=(value,max)=>String(value||'').trim().slice(0,max);
function cookie(req,name){for(const part of(req.headers.get('cookie')||'').split(';')){const [key,...value]=part.trim().split('=');if(key===name)return value.join('=')}return''}
async function admin(req,env){
  if(!env.ADMIN_UPLOAD_TOKEN)return false;
  if(req.headers.get('authorization')==='Bearer '+env.ADMIN_UPLOAD_TOKEN)return true;
  const key=await crypto.subtle.importKey('raw',enc.encode(env.ADMIN_UPLOAD_TOKEN),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,enc.encode('woodrick-admin-session-v1'));
  return cookie(req,'woodrick_admin')===Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
}
async function rateKey(req,env){
  const key=await crypto.subtle.importKey('raw',enc.encode(env.ADMIN_UPLOAD_TOKEN||'woodrick-enquiries'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,enc.encode(req.headers.get('cf-connecting-ip')||'unknown'));
  return ROOT+'rate/'+new Date().toISOString().slice(0,13)+'/'+Array.from(new Uint8Array(signature).slice(0,12),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function handleEnquiries(req,env){
  if(!env.PRODUCT_MEDIA)return reply({error:'Enquiry service is unavailable'},503);
  const url=new URL(req.url);
  try{
    if(req.method==='POST'){
      const origin=req.headers.get('origin');if(origin&&origin!==url.origin)return reply({error:'Invalid origin'},403);
      if(!(req.headers.get('content-type')||'').includes('application/json'))return reply({error:'JSON required'},415);
      if(Number(req.headers.get('content-length')||0)>8192)return reply({error:'Request too large'},413);
      const body=await req.json();if(clean(body.website,100))return reply({error:'Unable to submit'},400);
      const name=clean(body.name,100),mobile=clean(body.mobile,30).replace(/\D/g,''),email=clean(body.email,150),city=clean(body.city,120),requirement=clean(body.requirement,120),message=clean(body.message,1000);
      if(name.length<2||!/^\d{10}$/.test(mobile))return reply({error:'Name and 10-digit mobile are required'},400);
      if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:'Please check the email address'},400);
      if(String(body.message||'').length>1000)return reply({error:'Message must be 1000 characters or fewer'},400);
      const rate=await rateKey(req,env),previous=await env.PRODUCT_MEDIA.get(rate),count=previous?Number(await previous.text()):0;
      if(count>=10)return reply({error:'Too many enquiries. Please call us directly.'},429);
      const id=crypto.randomUUID(),attachmentId=clean(body.attachment_request_id,40);
      const item={id,name,mobile,email,city,requirement,message,attachmentId:/^[a-f0-9-]{36}$/.test(attachmentId)?attachmentId:'',source:body.source==='woodrickhomes.com/finance'?'woodrickhomes.com/finance':'woodrickhomes.com',status:'new',createdAt:new Date().toISOString()};
      await env.PRODUCT_MEDIA.put(ROOT+'records/'+id+'.json',JSON.stringify(item),{httpMetadata:{contentType:'application/json'}});
      await env.PRODUCT_MEDIA.put(rate,String(count+1));
      return reply({ok:true,id,message:'Your enquiry has been received.'},201);
    }
    if(req.method==='GET'){
      if(!await admin(req,env))return reply({error:'Admin login required'},401);
      const cursor=url.searchParams.get('cursor')||'';if(cursor.length>2048)return reply({error:'Invalid cursor'},400);
      const page=await env.PRODUCT_MEDIA.list({prefix:ROOT+'records/',limit:100,...(cursor?{cursor}:{})});
      const items=[];for(let i=0;i<page.objects.length;i+=10){
        const batch=await Promise.all(page.objects.slice(i,i+10).map(o=>env.PRODUCT_MEDIA.get(o.key)));
        for(const object of batch)if(object)items.push(JSON.parse(await object.text()));
      }
      items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      return reply({items,cursor:page.truncated?page.cursor:null,truncated:page.truncated});
    }
    return reply({error:'Method not allowed'},405);
  }catch{return reply({error:'Unable to process enquiry'},500)}
}
