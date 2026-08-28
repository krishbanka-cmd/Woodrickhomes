function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}

export async function onRequestGet({request,env}){
  if(!env.PRODUCT_MEDIA) return json({error:'PRODUCT_MEDIA R2 binding is missing'},500);
  const url=new URL(request.url);
  const key=url.searchParams.get('key');
  if(key){
    const obj=await env.PRODUCT_MEDIA.get(key);
    if(!obj) return new Response('Not found',{status:404});
    const headers=new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag',obj.httpEtag);
    headers.set('cache-control','public, max-age=3600');
    if(url.searchParams.get('download')==='1'){
      const name=(obj.customMetadata&&obj.customMetadata.originalName)||key.split('/').pop()||'download';
      headers.set('content-disposition',`attachment; filename="${String(name).replace(/"/g,'')}"`);
    }
    return new Response(obj.body,{headers});
  }
  const prefix=url.searchParams.get('prefix')||'';
  const cursor=url.searchParams.get('cursor')||undefined;
  const listed=await env.PRODUCT_MEDIA.list({limit:500,prefix,cursor,include:['customMetadata','httpMetadata']});
  const items=listed.objects.map(o=>({key:o.key,size:o.size,uploaded:o.uploaded,url:`/api/media?key=${encodeURIComponent(o.key)}`,...(o.customMetadata||{})})).sort((a,b)=>String(b.uploadedAt||b.uploaded).localeCompare(String(a.uploadedAt||a.uploaded)));
  return json({items,truncated:listed.truncated,cursor:listed.cursor||null});
}