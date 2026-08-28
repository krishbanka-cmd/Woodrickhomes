const allowedTypes = new Set(['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm']);
const maxBytes = 100 * 1024 * 1024;

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function slug(v=''){return v.toLowerCase().trim().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'item'}

export async function onRequestPost({request,env}){
  if(!env.PRODUCT_MEDIA) return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);
  if(!env.ADMIN_UPLOAD_TOKEN) return json({error:'ADMIN_UPLOAD_TOKEN secret is missing'},500);
  const auth=request.headers.get('authorization')||'';
  if(auth!==`Bearer ${env.ADMIN_UPLOAD_TOKEN}`) return json({error:'Invalid admin access code'},401);

  const contentType=request.headers.get('content-type')||'';
  if(contentType.includes('application/json')){
    let body;
    try{body=await request.json()}catch{return json({error:'Invalid request'},400)}
    if(body?.action!=='delete-library') return json({error:'Unsupported action'},400);
    const keys=Array.isArray(body?.keys)?[...new Set(body.keys.filter(k=>typeof k==='string'&&k.startsWith('library/')))]:[];
    if(!keys.length) return json({error:'No library files selected'},400);
    if(keys.length>500) return json({error:'Too many files in one delete request'},400);
    let deleted=0;
    try{
      for(const key of keys){await env.PRODUCT_MEDIA.delete(key);deleted++}
    }catch(err){return json({error:'R2 delete failed',detail:String(err?.message||err),deleted},500)}
    return json({ok:true,deleted});
  }

  let form;
  try{form=await request.formData()}catch{return json({error:'Invalid upload form'},400)}
  const file=form.get('file');
  const category=String(form.get('category')||'').trim();
  const type=String(form.get('type')||'').trim();
  const title=String(form.get('title')||'').trim();
  const isLibrary=String(form.get('library')||'')==='1';
  const brand=String(form.get('brand')||'Woodrick').trim();
  const catalogue=String(form.get('catalogue')||title).trim();
  const page=String(form.get('page')||'').trim();
  if(!file||typeof file.arrayBuffer!=='function') return json({error:'Please select a file'},400);
  if(!category||!title) return json({error:'Category and title are required'},400);
  if(!allowedTypes.has(file.type)) return json({error:'Unsupported file type'},415);
  if(file.size>maxBytes) return json({error:'File is too large. Maximum size is 100 MB.'},413);
  const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
  let key;
  if(isLibrary){
    const root=`library/${slug(brand)}/${slug(category)}/${slug(catalogue)}`;
    if(type==='original-pdf') key=`${root}/original/${slug(catalogue)}.pdf`;
    else if(type==='jpg-page') key=`${root}/jpg/page-${String(page||'1').padStart(3,'0')}.jpg`;
    else key=`${root}/${slug(type||'file')}/${Date.now()}-${slug(title)}.${ext}`;
  } else {
    key=`${slug(category)}/${type}/${Date.now()}-${slug(title)}.${ext}`;
  }
  const meta={category,title,type,brand,catalogue,page,library:isLibrary?'1':'0',originalName:file.name,uploadedAt:new Date().toISOString()};
  await env.PRODUCT_MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type},customMetadata:meta});
  return json({ok:true,key,category,title,type,brand,catalogue,page,url:`/api/media?key=${encodeURIComponent(key)}`},201);
}

export async function onRequestOptions(){return new Response(null,{status:204,headers:{'allow':'POST, OPTIONS'}})}