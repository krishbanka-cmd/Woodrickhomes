// Server-side vendor alerts. Private settings and durable pending deliveries live in R2.
const P='private/vendors/', SETTINGS=P+'settings/notifications.json', EVENTS=P+'notification-events/', RECENT=P+'notification-recent/';
const DEFAULTS={emails:['woodrickhomes@gmail.com','deepakplygkp@gmail.com'],whatsapps:['8090781345','8090781347','9415324839'],enabled:{registration:true,product:true},channels:{email:true,whatsapp:true}};
const short=(value,max=160)=>String(value??'').trim().slice(0,max);
const phone=value=>{const n=String(value||'').replace(/\D/g,'');return n.startsWith('91')&&n.length===12?n.slice(2):n};
const bad=message=>{throw Object.assign(new Error(message),{status:400})};
export async function getVendorNotificationSettings(env){
 const row=await env.PRODUCT_MEDIA.get(SETTINGS),saved=row?JSON.parse(await row.text()):{};
 return {emails:saved.emails||[...DEFAULTS.emails],whatsapps:saved.whatsapps||[...DEFAULTS.whatsapps],enabled:{...DEFAULTS.enabled,...saved.enabled},channels:{...DEFAULTS.channels,...saved.channels}};
}
export async function saveVendorNotificationSettings(env,input){
 if(!input||!Array.isArray(input.emails)||!Array.isArray(input.whatsapps)||input.emails.length>10||input.whatsapps.length>10)bad('Enter up to 10 email and WhatsApp recipients each.');
 const emails=input.emails.map(x=>String(x||'').trim().toLowerCase()),whatsapps=input.whatsapps.map(phone);
 if(emails.some(x=>!x||x.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))bad('Check email addresses.');
 if(whatsapps.some(x=>!/^[6-9]\d{9}$/.test(x)))bad('Enter Indian 10-digit WhatsApp numbers.');
 if(new Set(emails).size!==emails.length||new Set(whatsapps).size!==whatsapps.length)bad('Remove duplicate recipients.');
 if(!input.enabled||!input.channels||['registration','product'].some(x=>typeof input.enabled[x]!=='boolean')||['email','whatsapp'].some(x=>typeof input.channels[x]!=='boolean'))bad('Invalid notification options.');
 const settings={emails,whatsapps,enabled:{registration:input.enabled.registration,product:input.enabled.product},channels:{email:input.channels.email,whatsapp:input.channels.whatsapp},updatedAt:new Date().toISOString()};
 await env.PRODUCT_MEDIA.put(SETTINGS,JSON.stringify(settings),{httpMetadata:{contentType:'application/json'}});return settings;
}
export function vendorNotificationProviders(env,sheet){return {emailConfigured:!!(sheet?.url&&sheet?.token),whatsAppConfigured:!!(env.VENDOR_WHATSAPP_WEBHOOK_URL&&env.VENDOR_WHATSAPP_WEBHOOK_TOKEN)}}
function template(kind,record){
 if(kind==='registration')return {subject:'New vendor registration: '+short(record.business,100),body:[
 'New vendor registration on Woodrick Homes','Firm: '+short(record.business),'Contact: '+short(record.contact),'Mobile: '+short(record.mobile),
 'WhatsApp: '+short(record.whatsapp||record.mobile),'Email: '+short(record.email||'Not provided'),'City: '+short(record.city),
 'Categories: '+short(record.category,220),'Status: Pending review','Admin: https://woodrickhomes.com/admin-products/vendors/'].join('\n')};
 const p=record.product,v=record.vendor;return {subject:'Vendor product submitted: '+short(p.title,100),body:[
 'New product submitted for review on Woodrick Homes','Vendor: '+short(v.business),'Contact: '+short(v.contact),'Vendor mobile: '+short(v.mobile),
 'Product: '+short(p.title),'Brand: '+short(p.brand),'Category: '+short(p.category),
 'Price: '+(p.price==null?'Not specified':'INR '+p.price),'Description: '+short(p.description,500),
 'Files: '+(p.files||[]).map(f=>({image:'Photo',pdf:'Catalogue PDF',video:'Video'}[f.kind]||f.kind)).join(', '),
 'Revision: '+p.revision,'Status: Pending review','Admin: https://woodrickhomes.com/admin-products/vendors/'].join('\n')};
}
async function emailApiReady(url){try{const r=await fetch(url,{method:'GET',signal:AbortSignal.timeout(6500)}),d=await r.json().catch(()=>({}));return r.ok&&d.version>=3&&d.supportsVendorNotificationEmail===true}catch{return false}}
async function deliver(env,job,sheet){
 if(job.channel==='email'){
  if(!sheet?.url||!sheet?.token||!await emailApiReady(sheet.url))return 'Google Apps Script notification email v3 is not connected.';
  const r=await fetch(sheet.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:sheet.token,kind:'notification-email',notification:{id:job.id,to:job.to,subject:job.subject,body:job.body}}),signal:AbortSignal.timeout(12000)});
  const d=await r.json().catch(()=>({}));if(!r.ok||d.ok!==true)throw new Error('Email API did not confirm sending.');return '';
 }
 if(!env.VENDOR_WHATSAPP_WEBHOOK_URL||!env.VENDOR_WHATSAPP_WEBHOOK_TOKEN)return 'WhatsApp outbound delivery webhook is not configured.';
 if(!/^https:\/\//.test(env.VENDOR_WHATSAPP_WEBHOOK_URL))throw new Error('WhatsApp webhook must use HTTPS.');
 const r=await fetch(env.VENDOR_WHATSAPP_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+env.VENDOR_WHATSAPP_WEBHOOK_TOKEN},body:JSON.stringify({id:job.id,channel:'whatsapp',to:'91'+job.to,subject:job.subject,message:job.body,eventType:job.kind}),signal:AbortSignal.timeout(12000)});
 const d=await r.json().catch(()=>({}));if(!r.ok||d.ok!==true)throw new Error('WhatsApp provider did not confirm sending.');return '';
}
async function processEvent(env,key,getSheet){
 const lockKey=P+'notification-locks/'+key.slice(EVENTS.length);
 const current=await env.PRODUCT_MEDIA.get(lockKey);
 if(current&&Number(await current.text())>Date.now())return;
 const lock=await env.PRODUCT_MEDIA.put(lockKey,String(Date.now()+240000),{onlyIf:current?{etagMatches:current.etag}:{etagDoesNotMatch:'*'}});
 if(!lock)return;
 try{const row=await env.PRODUCT_MEDIA.get(key);if(!row)return;const event=JSON.parse(await row.text()),sheet=await getSheet();
  for(const job of event.deliveries){if(job.status==='sent')continue;
   try{const pending=await deliver(env,job,sheet);job.status=pending?'pending':'sent';job.lastError=pending||''}
   catch(e){job.status='failed';job.lastError=short(e.message)}
   job.attempts=(job.attempts||0)+1;job.updatedAt=new Date().toISOString();
   await env.PRODUCT_MEDIA.put(key,JSON.stringify(event),{httpMetadata:{contentType:'application/json'}});
  }
 }finally{await env.PRODUCT_MEDIA.delete(lockKey)}
}
export async function enqueueVendorNotification(env,ctx,kind,record,getSheet){
 try{const settings=await getVendorNotificationSettings(env);if(!settings.enabled[kind])return;
  const id=kind+'-'+record.id+'-'+(record.revision||1),key=EVENTS+id+'.json',content=template(kind,record),deliveries=[];
  for(const channel of ['email','whatsapp'])if(settings.channels[channel])for(const to of (channel==='email'?settings.emails:settings.whatsapps))deliveries.push({id:id+':'+channel+':'+to,kind,channel,to,...content,status:'pending',attempts:0});
  if(!deliveries.length)return;
  const event={id,kind,name:kind==='registration'?short(record.business):short(record.product.title),vendor:kind==='registration'?short(record.business):short(record.vendor.business),createdAt:new Date().toISOString(),deliveries};
  const saved=await env.PRODUCT_MEDIA.put(key,JSON.stringify(event),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});if(!saved)return;
  // Reverse timestamp makes newest notifications available without scanning every vendor event.
  const newest=String(9999999999999-Date.now()).padStart(13,'0');
  try{await env.PRODUCT_MEDIA.put(RECENT+newest+'-'+event.id+'.json',JSON.stringify({key}),{httpMetadata:{contentType:'application/json'}})}
  catch(e){console.error('Vendor notification index:',e)}
  const task=processEvent(env,key,getSheet).catch(e=>console.error('Vendor notification task:',e));if(ctx?.waitUntil)ctx.waitUntil(task);else await task;
 }catch(e){console.error('Vendor notification queue:',e)}
}
export async function listVendorNotifications(env){
 const page=await env.PRODUCT_MEDIA.list({prefix:RECENT,limit:30});
 const items=(await Promise.all(page.objects.map(async o=>{
  const index=await env.PRODUCT_MEDIA.get(o.key);if(!index)return null;
  const row=await env.PRODUCT_MEDIA.get((await index.json()).key);
  return row?JSON.parse(await row.text()):null;
 }))).filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 return items.map(e=>({id:e.id,kind:e.kind,name:e.name,vendor:e.vendor,createdAt:e.createdAt,
  sent:e.deliveries.filter(x=>x.status==='sent').length,pending:e.deliveries.filter(x=>x.status==='pending').length,failed:e.deliveries.filter(x=>x.status==='failed').length,
  errors:[...new Set(e.deliveries.filter(x=>x.status!=='sent').map(x=>x.lastError).filter(Boolean))].slice(0,2)}));
}
export async function retryVendorNotification(env,id,getSheet){
 if(!/^(registration|product)-[a-f0-9-]{36}-\d{1,10}$/.test(id))bad('Invalid notification ID.');
 const key=EVENTS+id+'.json';if(!await env.PRODUCT_MEDIA.head(key))bad('Notification not found.');await processEvent(env,key,getSheet);return {ok:true};
}
