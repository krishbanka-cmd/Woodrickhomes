// Private vendor onboarding, sessions and moderated product submissions.
const ROOT='private/vendors/';
const ENC=new TextEncoder();
const DOC_TYPES={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const MEDIA_TYPES={...DOC_TYPES,'video/mp4':'mp4','video/webm':'webm'};
const SESSION_SECONDS=8*60*60;
const UUID=/^[a-f0-9-]{36}$/;
function reply(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff',...headers}})}
function fail(message,status=400){const error=new Error(message);error.status=status;throw error}
function clean(value,max=160){return String(value||'').trim().slice(0,max)}
function mobile(value){const value2=String(value||'').replace(/\D/g,'');return /^91[6-9]\d{9}$/.test(value2)?value2.slice(2):value2}
function vendorCoverage(body){const get=key=>body instanceof FormData?body.get(key):body[key];const result={};for(const key of ['brands','supplyLocations']){const value=get(key);if(value!=null&&typeof value!=='string')fail('Invalid brands or supply locations.');if(String(value||'').trim().length>500)fail('Brands and supply locations must be within 500 characters each.');result[key]=clean(value,500)}return result}
function businessCategories(form){const raw=form.getAll('category');if(!raw.length)fail('Select at least one product or service category.');if(raw.length>40)fail('Select up to 40 categories.');const values=[];for(const value of raw){if(typeof value!=='string'||!value.trim()||value.trim().length>100)fail('Invalid product or service category.');const category=value.trim();if(!values.includes(category))values.push(category)}return values}
function validMobile(value){return /^[6-9]\d{9}$/.test(value)}
function cookie(req,name){for(const part of(req.headers.get('cookie')||'').split(';')){const [key,...value]=part.trim().split('=');if(key===name)return value.join('=')}return''}
function originOK(req){const origin=req.headers.get('origin');return !origin||origin===new URL(req.url).origin}
function b64(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function unb64(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
async function hmac(env,value){const secret=env.VENDOR_SESSION_SECRET||env.ADMIN_UPLOAD_TOKEN;if(!secret)fail('Vendor authentication is not configured.',503);const key=await crypto.subtle.importKey('raw',ENC.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',key,ENC.encode(value)))}
async function hash(value){return b64(await crypto.subtle.digest('SHA-256',ENC.encode(value)))}
async function admin(req,env){if(!env.ADMIN_UPLOAD_TOKEN)return false;if(req.headers.get('authorization')==='Bearer '+env.ADMIN_UPLOAD_TOKEN)return true;const key=await crypto.subtle.importKey('raw',ENC.encode(env.ADMIN_UPLOAD_TOKEN),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,ENC.encode('woodrick-admin-session-v1')));return cookie(req,'woodrick_admin')===Array.from(signature,b=>b.toString(16).padStart(2,'0')).join('')}
async function signedCookie(env,claims){const body=b64(ENC.encode(JSON.stringify({...claims,exp:Date.now()+SESSION_SECONDS*1000}))),signature=b64(await hmac(env,'vendor-session-v1:'+body));return 'woodrick_vendor='+body+'.'+signature+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age='+SESSION_SECONDS}
async function session(req,env){try{const raw=cookie(req,'woodrick_vendor');if(raw.length>2048)return null;const [body,signature,...extra]=raw.split('.');if(!body||!signature||extra.length)return null;const expected=await hmac(env,'vendor-session-v1:'+body),provided=unb64(signature);if(expected.length!==provided.length)return null;let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=expected[i]^provided[i];if(mismatch)return null;const claims=JSON.parse(new TextDecoder().decode(unb64(body)));return validMobile(claims.mobile)&&claims.exp>Date.now()?claims:null}catch{return null}}
async function read(env,key){const o=await env.PRODUCT_MEDIA.get(key);return o?JSON.parse(await o.text()):null}
async function write(env,key,data,onlyIf){return env.PRODUCT_MEDIA.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'},...(onlyIf?{onlyIf}:{})})}
const vendorKey=id=>ROOT+'records/'+id+'.json';
const productKey=id=>ROOT+'products/'+id+'.json';
async function vendor(env,id){return UUID.test(id||'')?read(env,vendorKey(id)):null}
async function phoneKey(env,number){return ROOT+'phones/'+b64(await hmac(env,'vendor-mobile-v1:'+number))+'.json'}
async function findVendor(env,number){const key=await phoneKey(env,number),link=await read(env,key);if(link?.id)return vendor(env,link.id);let cursor;do{const page=await env.PRODUCT_MEDIA.list({prefix:ROOT+'records/',limit:100,...(cursor?{cursor}:{})});const batch=await Promise.all(page.objects.map(o=>read(env,o.key)));const found=batch.find(x=>x?.mobile===number);if(found){await write(env,key,{id:found.id});return found}cursor=page.truncated?page.cursor:null}while(cursor);return null}
async function ownVendor(req,env){const claims=await session(req,env);if(!claims)fail('Please sign in to your vendor account.',401);const v=claims.vendorId?await vendor(env,claims.vendorId):await findVendor(env,claims.mobile);if(!v||v.mobile!==claims.mobile)fail('Complete your vendor application first.',409);return v}
async function rateLimit(req,env,action,identity,max,windowMs){const key=ROOT+'rate-v2/'+action+'/'+b64(await hmac(env,identity)),now=Date.now();for(let attempt=0;attempt<4;attempt++){const object=await env.PRODUCT_MEDIA.get(key),current=object?JSON.parse(await object.text()):null,active=current&&current.until>now,next=active?{...current,count:current.count+1}:{count:1,until:now+windowMs};if(active&&current.count>=max)fail('Too many attempts. Please try again later.',429);const result=await write(env,key,next,object?{etagMatches:object.etag}:{etagDoesNotMatch:'*'});if(result)return}fail('Please try again shortly.',429)}
function otpReady(env){return !!(env.TWILIO_ACCOUNT_SID&&env.TWILIO_AUTH_TOKEN&&env.TWILIO_VERIFY_SERVICE_SID)}
async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',ENC.encode(password),'PBKDF2',false,['deriveBits']);return b64(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unb64(salt),iterations:100000},key,256))}
function passwordValid(value){return typeof value==='string'&&value.length>=12&&value.length<=128}
function equalHash(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
async function twilio(env,action,values){const url='https://verify.twilio.com/v2/Services/'+encodeURIComponent(env.TWILIO_VERIFY_SERVICE_SID)+'/'+action;const response=await fetch(url,{method:'POST',headers:{authorization:'Basic '+btoa(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN),'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values),signal:AbortSignal.timeout(12000)});const data=await response.json().catch(()=>({}));if(!response.ok)fail(action==='VerificationCheck'?'OTP is invalid or expired. Request a new code.':'OTP could not be sent. Please try again or contact Woodrick Homes.',response.status===429?429:400);return data}
async function listPage(env,prefix,url,predicate=()=>true){let cursor=clean(url.searchParams.get('cursor'),2048)||undefined;const items=[];let more=false;for(let loop=0;loop<20;loop++){const page=await env.PRODUCT_MEDIA.list({prefix,limit:50,...(cursor?{cursor}:{})});const objects=await Promise.all(page.objects.map(o=>read(env,o.key)));items.push(...objects.filter(x=>x&&predicate(x)));cursor=page.truncated?page.cursor:undefined;more=!!cursor;if(items.length>=50||!more)break}return {items,cursor:more?cursor:null,truncated:more}}
async function audit(env,kind,id,details){await write(env,ROOT+'audit/'+id+'/'+Date.now()+'-'+crypto.randomUUID()+'.json',{kind,id,at:new Date().toISOString(),...details})}
// Separate login records avoid overwriting concurrent vendor reviews.
async function recordLogin(env,v,method){const at=new Date().toISOString(),id=crypto.randomUUID(),order=String(9999999999999-Date.parse(at)).padStart(13,'0');await write(env,ROOT+'logins/'+v.id+'/'+order+'-'+id+'.json',{id,at,method})}
async function lastLogin(env,id){const page=await env.PRODUCT_MEDIA.list({prefix:ROOT+'logins/'+id+'/',limit:1});return page.objects.length?read(env,page.objects[0].key):null}
async function sheetConfig(env){if(env.VENDOR_SHEET_URL&&env.VENDOR_SHEET_TOKEN)return {url:env.VENDOR_SHEET_URL,token:env.VENDOR_SHEET_TOKEN};return read(env,ROOT+'settings/sheet-backup.json')}
async function backup(env,item,ctx){const queueKey=ROOT+'backup/'+item.id+'.json',event={id:item.id,business:item.business,contact:item.contact,mobile:item.mobile,city:item.city,category:item.category,brands:item.brands||'',supplyLocations:item.supplyLocations||'',gst:item.gst,status:item.status,createdAt:item.createdAt,updatedAt:item.updatedAt||item.reviewedAt||item.createdAt};await write(env,queueKey,{event,state:'pending',updatedAt:new Date().toISOString()});const run=async()=>{const config=await sheetConfig(env);if(!config?.url||!config?.token)return;try{const response=await fetch(config.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:config.token,event}),signal:AbortSignal.timeout(10000)});const data=await response.json().catch(()=>({}));if(response.ok&&data.ok===true)await write(env,queueKey,{event,state:'synced',updatedAt:new Date().toISOString()})}catch{}};if(ctx?.waitUntil)ctx.waitUntil(run());else await run()}
function publicVendor(v){const {documentKey,aadhaarKey,panKey,...rest}=v;return {...rest,hasDocument:!!documentKey,hasAadhaar:!!aadhaarKey,hasPan:!!panKey}}
async function checkFile(file,kind,max){if(!file||typeof file.arrayBuffer!=='function'||!file.size)return null;if(file.size>max)fail(kind+' is too large.');const types=kind==='Video'?{'video/mp4':'mp4','video/webm':'webm'}:kind==='Photo'?{'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}:DOC_TYPES;const ext=types[file.type];if(!ext)fail('Unsupported '+kind.toLowerCase()+' format.');const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer()),start=new TextDecoder().decode(bytes);const valid=ext==='pdf'?start.startsWith('%PDF-'):ext==='jpg'?bytes[0]===255&&bytes[1]===216:ext==='png'?bytes[0]===137&&start.slice(1,4)==='PNG':ext==='webp'?start.startsWith('RIFF')&&start.slice(8,12)==='WEBP':ext==='mp4'?start.slice(4,8)==='ftyp':bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163;if(!valid)fail('The '+kind.toLowerCase()+' file content does not match its format.');return {file,ext,type:file.type}}
async function optionalKYC(form){const files=[];for(const kind of ['aadhaar','pan']){const file=await checkFile(form.get(kind),kind==='pan'?'PAN document':'Aadhaar document',5*1024*1024);if(file)files.push({kind,...file})}return files}
async function storeKYC(env,id,files){const keys={},saved=[];try{for(const file of files){const key=ROOT+'files/'+id+'/'+file.kind+'-'+crypto.randomUUID()+'.'+file.ext;await env.PRODUCT_MEDIA.put(key,file.file.stream(),{httpMetadata:{contentType:file.type}});saved.push(key);keys[file.kind+'Key']=key}return keys}catch(error){if(saved.length)await env.PRODUCT_MEDIA.delete(saved);throw error}}
function kycKey(v,kind){if(!kind||kind==='1'||kind==='business')return v?.documentKey;if(kind==='aadhaar')return v?.aadhaarKey;if(kind==='pan')return v?.panKey;fail('Invalid document type.')}
async function documentResponse(env,key){const o=await env.PRODUCT_MEDIA.get(key);if(!o)return reply({error:'File not found'},404);return new Response(o.body,{headers:{'content-type':o.httpMetadata?.contentType||'application/octet-stream','content-disposition':'attachment; filename="document.'+key.split('.').pop()+'"','cache-control':'private, no-store','x-content-type-options':'nosniff'}})}
async function productLock(env,id,work){const key=ROOT+'locks/'+id+'.json',now=Date.now(),object=await env.PRODUCT_MEDIA.get(key),old=object?JSON.parse(await object.text()):null;if(old&&old.until>now)fail('This product is being updated. Please retry shortly.',409);const owner=crypto.randomUUID(),lock=await write(env,key,{owner,until:now+180000},object?{etagMatches:object.etag}:{etagDoesNotMatch:'*'});if(!lock)fail('This product is being updated. Please retry shortly.',409);try{return await work()}finally{await write(env,key,{owner,until:0},{etagMatches:lock.etag})}}
async function saveProduct(env,p,etag){const saved=await write(env,productKey(p.id),p,etag?{etagMatches:etag}:undefined);if(!saved)fail('This product changed. Refresh and try again.',409);await write(env,ROOT+'product-index/'+p.vendorId+'/'+p.id+'.json',{id:p.id,vendorId:p.vendorId});return p}
async function unpublish(env,p){if(p.publicKeys?.length)await env.PRODUCT_MEDIA.delete(p.publicKeys);p.publicKeys=[]}
async function publish(env,p,v){const keys=[];for(const f of p.files||[]){const o=await env.PRODUCT_MEDIA.get(f.key);if(!o)fail('A product file is missing. Ask the vendor to upload it again.',409);const key='vendor-public/'+v.id+'/'+p.id+'/'+p.revision+'/'+f.kind+'.'+f.ext;const meta={vendorId:v.id,productId:p.id,supplier:v.business,brand:p.brand,category:p.category,title:p.title,catalogue:p.title,type:f.kind,originalName:f.name,uploadedAt:new Date().toISOString(),source:'vendor-approved'};await env.PRODUCT_MEDIA.put(key,o.body,{httpMetadata:{contentType:f.contentType},customMetadata:meta});keys.push(key)}const old=p.publicKeys||[];p.publicKeys=keys;for(const key of old)if(!keys.includes(key))await env.PRODUCT_MEDIA.delete(key)}
async function createApplication(req,env,ctx,isAdmin){const claims=await session(req,env);if(!isAdmin&&!claims&&otpReady(env))fail('Verify your mobile number before applying.',401);if(!(req.headers.get('content-type')||'').includes('multipart/form-data'))fail('Upload form required.',415);const form=await req.formData();if(clean(form.get('website')))fail('Unable to submit.');const number=mobile(form.get('mobile'));if(!validMobile(number))fail('Enter a valid Indian mobile number.');if(!isAdmin&&claims&&number!==claims.mobile)fail('Mobile number does not match verification.',403);const business=clean(form.get('business'),120),contact=clean(form.get('contact'),100),city=clean(form.get('city'),100),categories=businessCategories(form),category=categories.join(', '),coverage=vendorCoverage(form),gst=clean(form.get('gst'),15).toUpperCase();if(business.length<2||contact.length<2||city.length<2||!category)fail('Business, contact person, city and category are required.');if(gst&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst))fail('Please check GSTIN.');const file=await checkFile(form.get('file'),'Business document',5*1024*1024);if(!file)fail('Upload a business registration or GST document (PDF/photo, max 5 MB).');const identityFiles=await optionalKYC(form);const existing=await findVendor(env,number);if(existing)fail('This mobile already has a vendor application. Sign in to view it.',409);await rateLimit(req,env,'applications',req.headers.get('cf-connecting-ip')||'unknown',isAdmin?100:5,3600000);const id=crypto.randomUUID(),key=ROOT+'files/'+id+'/business.'+file.ext;await env.PRODUCT_MEDIA.put(key,file.file.stream(),{httpMetadata:{contentType:file.type}});const now=new Date().toISOString(),item={id,business,contact,mobile:number,city,category,categories,...coverage,gst,note:clean(form.get('note'),500),documentKey:key,status:'pending',mobileVerified:!!(claims&&claims.mobile===number),createdBy:isAdmin?'admin':'vendor',createdAt:now,reviewedAt:null,reviewNote:''};const indexKey=await phoneKey(env,number);const reserved=await write(env,indexKey,{id},{etagDoesNotMatch:'*'});if(!reserved){await env.PRODUCT_MEDIA.delete(key);fail('An application for this mobile is already being created.',409)}try{Object.assign(item,await storeKYC(env,id,identityFiles));await write(env,vendorKey(id),item)}catch(error){await env.PRODUCT_MEDIA.delete([indexKey,key,...[item.aadhaarKey,item.panKey].filter(Boolean)]);throw error};await audit(env,'application',id,{actor:isAdmin?'admin':'vendor'});await backup(env,item,ctx);return reply({ok:true,vendor:publicVendor(item),id},201,!isAdmin&&claims?{'set-cookie':await signedCookie(env,{mobile:number,vendorId:id})}:{})}

const CATALOGUE_MAX=500*1024*1024, CATALOGUE_PART=8*1024*1024;
const catalogueUploadKey=id=>ROOT+'catalogue-uploads/'+id+'.json';
async function catalogueUpload(req,env,url){
 const v=await ownVendor(req,env);if(v.status!=='approved')fail('Catalogue upload is available after vendor approval.',403);
 const action=url.pathname.split('/').pop();
 if(action==='start'){
  const data=await req.json(),size=Number(data.size),productId=clean(data.productId,40),baseRevision=Number(data.revision||0);
  if(!Number.isSafeInteger(size)||size<5||size>CATALOGUE_MAX)fail('PDF catalogue must be within 500 MB.');
  if(data.contentType!=='application/pdf'||!String(data.name||'').toLowerCase().endsWith('.pdf'))fail('Catalogue must be a PDF.');
  if(!UUID.test(productId)||!Number.isSafeInteger(baseRevision)||baseRevision<0)fail('Invalid product.');
  const p=await read(env,productKey(productId));if(p&&(p.vendorId!==v.id||p.revision!==baseRevision))fail('Product changed. Refresh before uploading.',409);if(!p&&baseRevision!==0)fail('Product not found.',404);
  await rateLimit(req,env,'catalogue-start',v.id,20,3600000);
  const id=crypto.randomUUID(),key=ROOT+'product-files/'+v.id+'/'+productId+'/'+(baseRevision+1)+'/'+id+'/catalogue.pdf';
  const multipart=await env.PRODUCT_MEDIA.createMultipartUpload(key,{httpMetadata:{contentType:'application/pdf'}});
  try{await write(env,catalogueUploadKey(id),{id,vendorId:v.id,productId,revision:baseRevision+1,key,uploadId:multipart.uploadId,name:clean(data.name,160),size,partSize:CATALOGUE_PART,total:Math.ceil(size/CATALOGUE_PART),state:'uploading',expires:Date.now()+24*3600000})}catch(e){await multipart.abort();throw e}
  return reply({ok:true,id,partSize:CATALOGUE_PART,total:Math.ceil(size/CATALOGUE_PART)},201);
 }
 const id=clean(url.searchParams.get('id'),40);if(!UUID.test(id))fail('Upload not found.',404);
 const upload=await read(env,catalogueUploadKey(id));if(!upload||upload.vendorId!==v.id)fail('Upload not found.',404);
 if(action==='part'){
  if(upload.state!=='uploading'||upload.expires<Date.now())fail('Upload expired. Please upload the PDF again.',409);
  const part=Number(url.searchParams.get('part'));if(!Number.isInteger(part)||part<1||part>upload.total)fail('Invalid upload part.');
  const expected=part===upload.total?upload.size-(part-1)*upload.partSize:upload.partSize;
  const declared=req.headers.get('content-length');if(declared&&Number(declared)!==expected)fail('Upload part has the wrong size.',413);
  // Bound every request even when Content-Length is absent or incorrect.
  const reader=req.body?.getReader();if(!reader)fail('Upload part is empty.');const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>expected){await reader.cancel();fail('Upload part is too large.',413)}chunks.push(value)}
  if(size!==expected)fail('Upload part has the wrong size.');const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  if(part===1&&!new TextDecoder().decode(bytes.subarray(0,5)).startsWith('%PDF-'))fail('The PDF file content does not match its format.');
  const result=await env.PRODUCT_MEDIA.resumeMultipartUpload(upload.key,upload.uploadId).uploadPart(part,bytes);
  await write(env,ROOT+'catalogue-parts/'+id+'/'+part+'.json',{partNumber:result.partNumber,etag:result.etag,size});
  return reply({ok:true,part});
 }
 if(action==='complete'||action==='abort')return productLock(env,'catalogue-'+id,async()=>{
  const current=await read(env,catalogueUploadKey(id));
  if(action==='abort')return productLock(env,current.productId,async()=>{
   const product=await read(env,productKey(current.productId));if(product?.files?.some(f=>f.key===current.key))return reply({ok:true});
   if(current.state==='uploading')await env.PRODUCT_MEDIA.resumeMultipartUpload(current.key,current.uploadId).abort();
   if(current.state==='complete')await env.PRODUCT_MEDIA.delete(current.key);
   await write(env,catalogueUploadKey(id),{...current,state:'aborted'});return reply({ok:true});
  });
  if(current.state==='complete')return reply({ok:true,id});
  if(current.state!=='uploading'||current.expires<Date.now())fail('Upload expired. Please upload the PDF again.',409);
  const parts=await Promise.all(Array.from({length:current.total},(_,i)=>read(env,ROOT+'catalogue-parts/'+id+'/'+(i+1)+'.json')));
  if(parts.some((p,i)=>!p||p.partNumber!==i+1||p.size!==(i===current.total-1?current.size-i*current.partSize:current.partSize)))fail('PDF upload is incomplete. Retry the missing part.',409);
  const completed=await env.PRODUCT_MEDIA.resumeMultipartUpload(current.key,current.uploadId).complete(parts.map(({partNumber,etag})=>({partNumber,etag})));
  if(completed.size!==current.size){await env.PRODUCT_MEDIA.delete(current.key);fail('PDF upload size did not match. Please try again.',409)}
  await write(env,catalogueUploadKey(id),{...current,state:'complete'});return reply({ok:true,id});
 });
 fail('Not found.',404);
}

export async function handleVendor(req,env,ctx){
 if(!env.PRODUCT_MEDIA)return reply({error:'Vendor service is unavailable.'},503);
 const url=new URL(req.url),path=url.pathname;
 try{
  if(!['GET','HEAD','POST'].includes(req.method))return reply({error:'Method not allowed'},405);
  if(req.method==='POST'&&!originOK(req))return reply({error:'Invalid origin'},403);
  if(Number(req.headers.get('content-length')||0)>120*1024*1024)fail('Request is too large.',413);
  if(path.startsWith('/api/vendor/catalogue-upload/')&&req.method==='POST')return await catalogueUpload(req,env,url);
  if(path==='/api/vendor/config'&&req.method==='GET')return reply({otpAvailable:otpReady(env),sessionAvailable:!!(env.VENDOR_SESSION_SECRET||env.ADMIN_UPLOAD_TOKEN)});
  if(path==='/api/vendor/password'&&req.method==='POST'){
   const v=await ownVendor(req,env);if(v.status!=='approved'||!v.mobileVerified)fail('Your business and mobile must be approved before setting a password.',403);
   await rateLimit(req,env,'password-set',v.id,5,3600000);const body=await req.json();if(!passwordValid(body.password))fail('Use a password of 12 to 128 characters.');
   const claims=await session(req,env);if(!claims.recovery)fail('Verify by OTP or a new admin access link before setting or resetting your password.',403);
   const salt=b64(crypto.getRandomValues(new Uint8Array(16)));await write(env,ROOT+'credentials/'+v.id+'.json',{salt,hash:await passwordHash(body.password,salt)});
   return reply({ok:true},200,{'set-cookie':await signedCookie(env,{mobile:v.mobile,vendorId:v.id})});
  }
  if(path==='/api/vendor/password/login'&&req.method==='POST'){
   const body=await req.json(),number=mobile(body.mobile),password=body.password;if(!validMobile(number)||!passwordValid(password))fail('Mobile number or password is incorrect.',401);
   await rateLimit(req,env,'password-ip',req.headers.get('cf-connecting-ip')||'unknown',30,900000);await rateLimit(req,env,'password-mobile',number,10,900000);
   const v=await findVendor(env,number),cred=v?await read(env,ROOT+'credentials/'+v.id+'.json'):null;
   const actual=await passwordHash(password,cred?.salt||b64(new Uint8Array(16)));if(!cred||!equalHash(actual,cred.hash)||v.status!=='approved'||!v.mobileVerified)fail('Mobile number or password is incorrect.',401);
   await recordLogin(env,v,'password');return reply({ok:true},200,{'set-cookie':await signedCookie(env,{mobile:v.mobile,vendorId:v.id})});
  }
  if(path==='/api/vendor/logout'&&req.method==='POST')return reply({ok:true},200,{'set-cookie':'woodrick_vendor=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
  if(path==='/api/vendor/otp/start'&&req.method==='POST'){
   if(!otpReady(env))fail('Mobile OTP is awaiting activation. Please contact Woodrick Homes for vendor onboarding.',503);const body=await req.json(),number=mobile(body.mobile);if(!validMobile(number))fail('Enter a valid 10-digit mobile number.');const ip=req.headers.get('cf-connecting-ip')||'unknown';await rateLimit(req,env,'otp-ip',ip,10,3600000);await rateLimit(req,env,'otp-mobile-hour',number,5,3600000);await rateLimit(req,env,'otp-resend',number,1,60000);const data=await twilio(env,'Verifications',{To:'+91'+number,Channel:env.VENDOR_OTP_CHANNEL==='whatsapp'?'whatsapp':'sms'});if(data.status!=='pending')fail('OTP could not be sent.',502);return reply({ok:true,retryAfter:60});
  }
  if(path==='/api/vendor/otp/check'&&req.method==='POST'){
   if(!otpReady(env))fail('OTP is not activated yet.',503);const body=await req.json(),number=mobile(body.mobile),code=clean(body.code,10);if(!validMobile(number)||!/^\d{4,8}$/.test(code))fail('Enter your mobile and OTP.');await rateLimit(req,env,'otp-check',number,10,600000);const checked=await twilio(env,'VerificationCheck',{To:'+91'+number,Code:code});if(checked.status!=='approved')fail('OTP is incorrect or expired.');const v=await findVendor(env,number);if(v&&!v.mobileVerified){v.mobileVerified=true;await write(env,vendorKey(v.id),v)}const loginCookie=await signedCookie(env,{mobile:number,recovery:true,...(v?{vendorId:v.id}:{})});if(v)await recordLogin(env,v,'otp');return reply({ok:true,registered:!!v},200,{'set-cookie':loginCookie});
  }
  if(path==='/api/vendor/activate'&&req.method==='POST'){
   const body=await req.json(),token=clean(body.token,160);if(!/^[A-Za-z0-9_-]{40,100}$/.test(token))fail('Invalid access link.',401);await rateLimit(req,env,'activation',req.headers.get('cf-connecting-ip')||'unknown',30,3600000);const key=ROOT+'access/'+await hash(token)+'.json',object=await env.PRODUCT_MEDIA.get(key),grant=object?JSON.parse(await object.text()):null;if(!grant||grant.usedAt||grant.expiresAt<Date.now())fail('Access link has expired or was used. Ask Woodrick Homes for a new link.',401);const v=await vendor(env,grant.vendorId);if(!v||v.status==='suspended')fail('Vendor access is unavailable.',403);const used=await write(env,key,{...grant,usedAt:new Date().toISOString()},{etagMatches:object.etag});if(!used)fail('This access link has already been used.',401);const loginCookie=await signedCookie(env,{mobile:v.mobile,vendorId:v.id,recovery:true});await recordLogin(env,v,'access-link');return reply({ok:true},200,{'set-cookie':loginCookie});
  }
  const isAdmin=await admin(req,env);
  if(path==='/api/vendor-applications'&&req.method==='POST')return await createApplication(req,env,ctx,isAdmin);
  if(path==='/api/vendor/session'&&req.method==='GET'){
   const claims=await session(req,env);if(!claims)return reply({authenticated:false});const v=claims.vendorId?await vendor(env,claims.vendorId):await findVendor(env,claims.mobile);return reply({authenticated:true,mobile:claims.mobile,canSetPassword:!!claims.recovery,vendor:v?publicVendor(v):null});
  }
  if(path==='/api/vendor/coverage'&&req.method==='POST'){
   const owner=await ownVendor(req,env);if(owner.status==='suspended')fail('Your account is suspended. Contact Woodrick Homes.',403);const object=await env.PRODUCT_MEDIA.get(vendorKey(owner.id));if(!object)fail('Vendor not found.',404);const v=JSON.parse(await object.text());if(v.status==='suspended')fail('Your account is suspended. Contact Woodrick Homes.',403);const coverage=vendorCoverage(await req.json());if(!coverage.brands&&!coverage.supplyLocations)fail('Enter your actual brands or supply locations before saving.');Object.assign(v,coverage,{updatedAt:new Date().toISOString()});if(!await write(env,vendorKey(v.id),v,{etagMatches:object.etag}))fail('Vendor details changed. Refresh and try again.',409);await audit(env,'vendor-coverage-updated',v.id,{actor:'vendor'});await backup(env,v,ctx);return reply({ok:true,vendor:publicVendor(v)});
  }
  if(path==='/api/vendor/profile'&&req.method==='POST'){
   const v=await ownVendor(req,env);if(v.status==='approved'||v.status==='suspended')fail('Contact Woodrick Homes to change an approved or suspended account.',403);const form=await req.formData();const business=clean(form.get('business'),120),contact=clean(form.get('contact'),100),city=clean(form.get('city'),100),categories=businessCategories(form),category=categories.join(', '),coverage=vendorCoverage(form),gst=clean(form.get('gst'),15).toUpperCase();if(business.length<2||contact.length<2||city.length<2||!category)fail('Complete all business details.');if(gst&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst))fail('Please check GSTIN.');const identityFiles=await optionalKYC(form);const f=await checkFile(form.get('file'),'Business document',5*1024*1024);if(f){v.documentKey=ROOT+'files/'+v.id+'/'+crypto.randomUUID()+'.'+f.ext;await env.PRODUCT_MEDIA.put(v.documentKey,f.file.stream(),{httpMetadata:{contentType:f.type}})}if(!v.documentKey)fail('Attach your business document.');Object.assign(v,await storeKYC(env,v.id,identityFiles));Object.assign(v,{business,contact,city,category,categories,...coverage,gst,note:form.has('note')?clean(form.get('note'),500):(v.note||''),status:'pending',reviewNote:'',updatedAt:new Date().toISOString()});await write(env,vendorKey(v.id),v);await audit(env,'application-resubmitted',v.id,{actor:'vendor'});await backup(env,v,ctx);return reply({ok:true,vendor:publicVendor(v)});
  }
  if(path==='/api/vendor/products'&&req.method==='GET'){
   const v=await ownVendor(req,env),page=await listPage(env,ROOT+'product-index/'+v.id+'/',url);const items=(await Promise.all(page.items.map(x=>read(env,productKey(x.id))))).filter(Boolean);return reply({...page,items});
  }
  if(path==='/api/vendor/file'&&req.method==='GET'){
   const v=await ownVendor(req,env);if(url.searchParams.has('document')){const key=kycKey(v,url.searchParams.get('document'));return key?documentResponse(env,key):reply({error:'No document'},404);}const p=await read(env,productKey(clean(url.searchParams.get('productId'),40)));if(!p||p.vendorId!==v.id)fail('File not found.',404);const f=p.files.find(x=>x.kind===url.searchParams.get('kind'));if(!f)fail('File not found.',404);return documentResponse(env,f.key);
  }
  if(path==='/api/vendor/products'&&req.method==='POST'){
   const v=await ownVendor(req,env);if(v.status!=='approved')fail('Product submission is available after vendor approval.',403);
   if(!(req.headers.get('content-type')||'').includes('multipart/form-data'))fail('Upload form required.',415);const form=await req.formData(),id=clean(form.get('id'),40)||crypto.randomUUID();if(!UUID.test(id))fail('Invalid product.');return await productLock(env,id,async()=>{const object=await env.PRODUCT_MEDIA.get(productKey(id)),old=object?JSON.parse(await object.text()):null;if(old&&old.vendorId!==v.id)fail('Product not found.',404);if(old&&Number(form.get('revision'))!==old.revision)fail('Product changed. Refresh before editing.',409);const title=clean(form.get('title'),120),brand=clean(form.get('brand'),100),category=clean(form.get('category'),100),description=clean(form.get('description'),1500),priceText=clean(form.get('price'),30),price=priceText===''?null:Number(priceText);if(title.length<2||brand.length<2||!category)fail('Product name, brand and category are required.');if(price!==null&&(!Number.isFinite(price)||price<0||price>1e9))fail('Enter a valid price.');const revision=(old?.revision||0)+1,files=[...(old?.files||[])];
   for(const [name,kind,label,max] of [['photo','image','Photo',5*1024*1024],['catalogue','pdf','Catalogue',CATALOGUE_MAX],['video','video','Video',100*1024*1024]]){const checked=await checkFile(form.get(name),label,max);if(!checked)continue;if(kind==='pdf'&&checked.type!=='application/pdf')fail('Catalogue must be a PDF.');const key=ROOT+'product-files/'+v.id+'/'+id+'/'+revision+'/'+crypto.randomUUID()+'/'+name+'.'+checked.ext;await env.PRODUCT_MEDIA.put(key,checked.file.stream(),{httpMetadata:{contentType:checked.type}});const f={key,kind,ext:checked.ext,name:clean(checked.file.name,160),contentType:checked.type,size:checked.file.size};const i=files.findIndex(x=>x.kind===kind);if(i>=0)files[i]=f;else files.push(f)}
   const uploadId=clean(form.get('catalogueUpload'),40);let staged;
   if(uploadId){if(!UUID.test(uploadId))fail('Invalid catalogue upload.');staged=await read(env,catalogueUploadKey(uploadId));if(!staged||staged.vendorId!==v.id||staged.productId!==id||staged.revision!==revision||staged.state!=='complete'||staged.expires<Date.now())fail('Catalogue upload expired or belongs to a different product. Please upload again.',409);const head=await env.PRODUCT_MEDIA.head(staged.key);if(!head||head.size!==staged.size||head.size>CATALOGUE_MAX)fail('Catalogue upload is incomplete.',409);const file={key:staged.key,kind:'pdf',ext:'pdf',name:staged.name,contentType:'application/pdf',size:staged.size};const index=files.findIndex(x=>x.kind==='pdf');if(index>=0)files[index]=file;else files.push(file)}
   if(!files.length)fail('Attach at least one product photo, PDF or video.');const p={...(old||{}),id,vendorId:v.id,supplier:v.business,title,brand,category,description,price,files,revision,status:'pending',publicKeys:old?.publicKeys||[],createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),reviewNote:''};await saveProduct(env,p,object?.etag);if(staged)await write(env,catalogueUploadKey(staged.id),{...staged,state:'consumed'});await audit(env,'product-submitted',id,{vendorId:v.id,revision});return reply({ok:true,product:p},old?200:201);});
  }
  if(path==='/api/vendor/products/archive'&&req.method==='POST'){
   const v=await ownVendor(req,env),body=await req.json();if(!UUID.test(body.id||''))fail('Invalid product.');return await productLock(env,body.id,async()=>{const p=await read(env,productKey(body.id));if(!p||p.vendorId!==v.id)fail('Product not found.',404);await unpublish(env,p);p.status='archived';p.updatedAt=new Date().toISOString();await saveProduct(env,p);await audit(env,'product-archived',p.id,{actor:'vendor',vendorId:v.id});return reply({ok:true});});
  }
  if(path.startsWith('/api/vendor-applications')){
   if(!isAdmin)fail('Admin login required.',401);
   if(path==='/api/vendor-applications/config'&&req.method==='GET')return reply({otpAvailable:otpReady(env),sheetBackupAvailable:!!(await sheetConfig(env))});
   if(path==='/api/vendor-applications/backup-settings'&&req.method==='POST'){
    const body=await req.json(),url=String(body.url||'').trim(),token=String(body.token||'').trim();
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/.test(url))fail('Enter the Google Apps Script deployment URL ending in /exec.');
    if(!/^[A-Za-z0-9_-]{40,200}$/.test(token))fail('Enter a valid backup token (40–200 characters).');
    if(env.VENDOR_SHEET_URL&&env.VENDOR_SHEET_TOKEN)fail('Backup is managed through server settings.',409);
    await write(env,ROOT+'settings/sheet-backup.json',{url,token,updatedAt:new Date().toISOString()});
    await audit(env,'sheet-backup-configured','settings',{});return reply({ok:true});
   }
   if(path==='/api/vendor-applications'&&req.method==='GET'){
    const search=clean(url.searchParams.get('search'),100).toLowerCase(),status=clean(url.searchParams.get('status'),30);const page=await listPage(env,ROOT+'records/',url,x=>(!status||x.status===status)&&(!search||[x.business,x.contact,x.mobile,x.city,x.gst].join(' ').toLowerCase().includes(search)));page.items=await Promise.all(page.items.map(async v=>({...v,lastLogin:await lastLogin(env,v.id)})));return reply(page);
   }
   if(path==='/api/vendor-applications/login-history'&&req.method==='GET'){
    const id=clean(url.searchParams.get('id'),40);if(!UUID.test(id))fail('Invalid vendor.');if(!await vendor(env,id))fail('Vendor not found.',404);return reply(await listPage(env,ROOT+'logins/'+id+'/',url));
   }
   if(path==='/api/vendor-applications/coverage'&&req.method==='POST'){
    const body=await req.json(),id=clean(body.id,40);if(!UUID.test(id))fail('Invalid vendor.');const object=await env.PRODUCT_MEDIA.get(vendorKey(id));if(!object)fail('Vendor not found.',404);const v=JSON.parse(await object.text()),coverage=vendorCoverage(body);if(!coverage.brands&&!coverage.supplyLocations)fail('Enter your actual brands or supply locations before saving.');Object.assign(v,coverage,{updatedAt:new Date().toISOString()});if(!await write(env,vendorKey(id),v,{etagMatches:object.etag}))fail('Vendor details changed. Refresh and try again.',409);await audit(env,'vendor-coverage-updated',id,{actor:'admin'});await backup(env,v,ctx);return reply({ok:true,vendor:publicVendor(v)});
   }
   if(path==='/api/vendor-applications/status'&&req.method==='POST'){
    const body=await req.json(),v=await vendor(env,clean(body.id,40)),status=clean(body.status,30),note=clean(body.note,500);if(!v)fail('Vendor not found.',404);if(!['pending','approved','rejected','suspended'].includes(status))fail('Invalid status.');if(status==='approved'&&body.manualVerified===true){v.mobileVerified=true;v.mobileVerificationMethod='admin-confirmed'}if(status==='approved'&&!v.mobileVerified)fail('Verify the mobile by OTP or confirm that your team has verified it.');if(status==='approved'&&!v.documentKey)fail('Business KYC document is required before approval.');if(['rejected','suspended'].includes(status)&&!note)fail('Add a review note for the vendor.');const previous=v.status;v.status=status;v.reviewNote=note;v.reviewedAt=new Date().toISOString();await write(env,vendorKey(v.id),v);if(status!=='approved'){let cursor;do{const page=await env.PRODUCT_MEDIA.list({prefix:ROOT+'product-index/'+v.id+'/',limit:100,...(cursor?{cursor}:{})});for(const entry of page.objects){const index=await read(env,entry.key),p=await read(env,productKey(index.id));if(p?.publicKeys?.length){await unpublish(env,p);p.status='pending';await saveProduct(env,p)}}cursor=page.truncated?page.cursor:null}while(cursor)}await audit(env,'vendor-reviewed',v.id,{actor:'admin',previous,status,note});await backup(env,v,ctx);return reply({ok:true,vendor:publicVendor(v)});
   }
   if(path==='/api/vendor-applications/login-link'&&req.method==='POST'){
    const body=await req.json(),v=await vendor(env,clean(body.id,40));if(!v||v.status==='suspended')fail('Vendor access is unavailable.',404);const token=b64(crypto.getRandomValues(new Uint8Array(32))),expiresAt=Date.now()+86400000;await write(env,ROOT+'access/'+await hash(token)+'.json',{vendorId:v.id,expiresAt,usedAt:null});await audit(env,'vendor-access-link',v.id,{actor:'admin',expiresAt});return reply({ok:true,url:url.origin+'/vendor/#activate='+token,expiresAt});
   }
   if(path==='/api/vendor-applications/file'&&req.method==='GET'){const v=await vendor(env,clean(url.searchParams.get('id'),40));const key=kycKey(v,url.searchParams.get('kind'));if(!key)fail('Document not found.',404);return documentResponse(env,key)}
   if(path==='/api/vendor-applications/products'&&req.method==='GET'){const status=clean(url.searchParams.get('status'),30);return reply(await listPage(env,ROOT+'products/',url,p=>!status||p.status===status))}
   if(path==='/api/vendor-applications/product-file'&&req.method==='GET'){const p=await read(env,productKey(clean(url.searchParams.get('id'),40))),f=p?.files?.find(x=>x.kind===url.searchParams.get('kind'));if(!f)fail('File not found.',404);return documentResponse(env,f.key)}
   if(path==='/api/vendor-applications/products/review'&&req.method==='POST'){
    const body=await req.json();if(!UUID.test(body.id||''))fail('Invalid product.');return await productLock(env,body.id,async()=>{const p=await read(env,productKey(body.id));if(!p)fail('Product not found.',404);if(body.revision!==p.revision)fail('This product changed. Refresh before review.',409);if(!['approved','rejected'].includes(body.status))fail('Invalid product status.');const v=await vendor(env,p.vendorId);if(body.status==='approved'){if(v?.status!=='approved')fail('Approve the vendor first.');await publish(env,p,v)}else{if(!clean(body.note,500))fail('Add a rejection reason.');await unpublish(env,p)}p.status=body.status;p.reviewNote=clean(body.note,500);p.reviewedAt=new Date().toISOString();await saveProduct(env,p);await audit(env,'product-reviewed',p.id,{actor:'admin',status:p.status,revision:p.revision});return reply({ok:true,product:p});});
   }
   if(path==='/api/vendor-applications/backup-retry'&&req.method==='POST'){const body=await req.json(),v=await vendor(env,clean(body.id,40));if(!v)fail('Vendor not found.',404);await backup(env,v,null);const delivery=await read(env,ROOT+'backup/'+v.id+'.json');return reply({ok:true,configured:!!(await sheetConfig(env)),synced:delivery?.state==='synced'})}
  }
  return reply({error:'Not found'},404);
 }catch(error){return reply({error:error.status?error.message:'Unable to process request. Please retry.'},error.status||500)}
}

