const allowedTypes = new Set(['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm']);
const maxBytes = 100 * 1024 * 1024;

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function slug(v=''){return v.toLowerCase().trim().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'item'}

export async function onRequestPost({request,env}){
  if(!env.PRODUCT_MEDIA) return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);
  if(!env.ADMIN_UPLOAD_TOKEN) return json({error:'ADMIN_UPLOAD_TOKEN secret is missing'},500);
  const auth=request.headers.get('authorization')||'';
  if(auth!==`Bearer ${env.ADMIN_UPLOAD_TOKEN}`) return json({error:'Invalid admin access code'},401);
  let form;
  try{form=await request.formData()}catch{return json({error:'Invalid upload form'},400)}
  const file=form.get('file');
  const category=String(form.get('category')||'').trim();
  const type=String(form.get('type')||'').trim();
  const title=String(form.get('title')||'').trim();
  if(!file||typeof file.arrayBuffer!=='function') return json({error:'Please select a file'},400);
  if(!category||!title) return json({error:'Category and title are required'},400);
  if(!allowedTypes.has(file.type)) return json({error:'Unsupported file type'},415);
  if(file.size>maxBytes) return json({error:'File is too large. Maximum size is 100 MB.'},413);
  const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
  const key=`${slug(category)}/${type}/${Date.now()}-${slug(title)}.${ext}`;
  const meta={category,title,type,originalName:file.name,uploadedAt:new Date().toISOString()};
  await env.PRODUCT_MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type},customMetadata:meta});
  return json({ok:true,key,category,title,type,url:`/api/media?key=${encodeURIComponent(key)}`},201);
}

export async function onRequestOptions(){return new Response(null,{status:204,headers:{'allow':'POST, OPTIONS'}})}