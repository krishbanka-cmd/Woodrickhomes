// PDF-compatible page adapter: existing navigation, zoom, retries and page cache
// can use small prepared images while Original PDF retains the source document.
export async function preparedCatalogue(key,{fetcher=fetch,makeImage=()=>document.createElement('img')}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2500);
  let data;
  try{const r=await fetcher('/api/catalogue-pages?'+new URLSearchParams({key}),{signal:controller.signal});if(!r.ok)return null;data=await r.json();}
  catch{return null}finally{clearTimeout(timer)}
  if(!Array.isArray(data?.pages)||!data.pages.length||!data.pages.every(p=>Number.isFinite(p.width)&&p.width>0&&Number.isFinite(p.height)&&p.height>0&&String(p.url).startsWith('/api/catalogue-pages?')))return null;
  const images=new Map();let destroyed=false;
  return {_preparedImages:true,numPages:data.pages.length,
    async getPage(n){
      if(destroyed||!Number.isInteger(n)||n<1||n>data.pages.length)throw Error('Invalid catalogue page');
      const page=data.pages[n-1];let pending=images.get(n);
      if(!pending){
        const img=makeImage();img.decoding='async';
        pending=new Promise((resolve,reject)=>{img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Prepared page unavailable'));img.src=page.url;});
        images.set(n,pending);pending.catch(()=>images.delete(n));
        while(images.size>4)images.delete(images.keys().next().value);
      }
      const img=await pending;
      return {getViewport:({scale})=>({width:page.width*scale,height:page.height*scale}),
        render({canvasContext,viewport}){let cancelled=false;return{promise:Promise.resolve().then(()=>{if(cancelled||destroyed)throw Error('Rendering cancelled');canvasContext.drawImage(img,0,0,viewport.width,viewport.height)}),cancel(){cancelled=true}}}
      };
    },async destroy(){destroyed=true;images.clear();}
  };
}
