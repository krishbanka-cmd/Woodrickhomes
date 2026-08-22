function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function safeName(name='file'){return name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)||'file'}
function assetUrl(key){return '/api/products?asset='+encodeURIComponent(key)}

export async function onRequestGet({request,env}){
  if(!env.PRODUCT_MEDIA)return json({error:'PRODUCT_MEDIA R2 binding is not configured.'},503);
  const url=new URL(request.url);const asset=url.searchParams.get('asset');
  if(asset){const obj=await env.PRODUCT_MEDIA.get(asset);if(!obj)return new Response('Not found',{status:404});const h=new Headers();obj.writeHttpMetadata(h);h.set('etag',obj.httpEtag);h.set('cache-control','public, max-age=3600');return new Response(obj.body,{headers:h});}
  const listed=await env.PRODUCT_MEDIA.list({prefix:'products/'});const metas=listed.objects.filter(o=>o.key.endsWith('/meta.json')).slice(-100).reverse();const products=[];
  for(const item of metas){const obj=await env.PRODUCT_MEDIA.get(item.key);if(!obj)continue;try{const p=JSON.parse(await obj.text());p.images=(p.images||[]).map(k=>assetUrl(k));if(p.videoKey)p.video=assetUrl(p.videoKey);if(p.pdfKey)p.pdf=assetUrl(p.pdfKey);delete p.videoKey;delete p.pdfKey;products.push(p)}catch{}}
  return json({products});
}

export async function onRequestPost({request,env}){
  if(!env.PRODUCT_MEDIA)return json({error:'PRODUCT_MEDIA R2 binding is not configured.'},503);
  if(!env.ADMIN_PASSWORD)return json({error:'ADMIN_PASSWORD secret is not configured.'},503);
  if(request.headers.get('x-admin-password')!==env.ADMIN_PASSWORD)return json({error:'Invalid admin password.'},401);
  const form=await request.formData();const name=String(form.get('name')||'').trim();const category=String(form.get('category')||'').trim();const description=String(form.get('description')||'').trim();const videoUrl=String(form.get('videoUrl')||'').trim();
  if(!name||!category)return json({error:'Product name and category are required.'},400);
  const id=Date.now().toString(36)+'-'+crypto.randomUUID().slice(0,8);const base=`products/${id}`;const images=[];
  for(const file of form.getAll('images')){if(!(file instanceof File)||!file.size)continue;if(!['image/jpeg','image/png','image/webp'].includes(file.type))return json({error:'Only JPG, PNG and WebP images are allowed.'},400);const key=`${base}/images/${crypto.randomUUID().slice(0,8)}-${safeName(file.name)}`;await env.PRODUCT_MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type}});images.push(key)}
  let videoKey=null;const video=form.get('video');if(video instanceof File&&video.size){if(!['video/mp4','video/webm','video/quicktime'].includes(video.type))return json({error:'Unsupported video format.'},400);videoKey=`${base}/video/${crypto.randomUUID().slice(0,8)}-${safeName(video.name)}`;await env.PRODUCT_MEDIA.put(videoKey,video.stream(),{httpMetadata:{contentType:video.type}})}
  let pdfKey=null;const pdf=form.get('pdf');if(pdf instanceof File&&pdf.size){if(pdf.type!=='application/pdf')return json({error:'Only PDF files are allowed for catalogues.'},400);pdfKey=`${base}/pdf/${crypto.randomUUID().slice(0,8)}-${safeName(pdf.name)}`;await env.PRODUCT_MEDIA.put(pdfKey,pdf.stream(),{httpMetadata:{contentType:'application/pdf'}})}
  const meta={id,name,category,description,videoUrl,images,videoKey,pdfKey,createdAt:new Date().toISOString()};await env.PRODUCT_MEDIA.put(`${base}/meta.json`,JSON.stringify(meta),{httpMetadata:{contentType:'application/json'}});return json({ok:true,id},201);
}