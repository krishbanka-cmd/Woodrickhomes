function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}

export async function onRequestPost({request,env}){
  if(!env.PRODUCT_MEDIA) return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);
  if(!env.ADMIN_UPLOAD_TOKEN) return json({error:'ADMIN_UPLOAD_TOKEN secret is missing'},500);
  const auth=request.headers.get('authorization')||'';
  if(auth!==`Bearer ${env.ADMIN_UPLOAD_TOKEN}`) return json({error:'Invalid admin access code'},401);
  let body;
  try{body=await request.json()}catch{return json({error:'Invalid delete request'},400)}
  const keys=Array.isArray(body&&body.keys)?body.keys.filter(k=>typeof k==='string'&&k.startsWith('library/')):[];
  if(!keys.length) return json({error:'No library files selected'},400);
  if(keys.length>500) return json({error:'Too many files in one delete request'},400);
  let deleted=0;
  const failed=[];
  for(const key of keys){
    try{
      await env.PRODUCT_MEDIA.delete(key);
      deleted++;
    }catch(err){failed.push({key,error:String(err&&err.message||err)})}
  }
  if(failed.length) return json({error:`Deleted ${deleted} file(s), but ${failed.length} failed`,deleted,failed},500);
  return json({ok:true,deleted});
}

export async function onRequestOptions(){return new Response(null,{status:204,headers:{allow:'POST, OPTIONS'}})}