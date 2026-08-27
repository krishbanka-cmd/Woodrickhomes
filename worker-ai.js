import base from './worker-hero.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clean=(v,max=1200)=>String(v||'').trim().slice(0,max);

function providerMessage(status,code,message=''){
  const c=String(code||'').toLowerCase();
  const m=String(message||'').toLowerCase();
  if(c.includes('insufficient_quota')||m.includes('quota')||m.includes('billing')) return 'OpenAI API credit or billing is not available for this request. Please check the API billing balance and try again.';
  if(c.includes('verification')||m.includes('verify')) return 'OpenAI requires account or organization verification before image generation can be used. Please complete verification in OpenAI Platform and try again.';
  if(c.includes('invalid_api_key')||status===401) return 'The OpenAI API key is not being accepted. Please replace OPENAI_API_KEY in Cloudflare with a valid active key.';
  if(status===429||c.includes('rate_limit')) return 'The AI image service is temporarily rate-limited. Please wait a minute and try again.';
  if(status===400) return 'The AI image service rejected this image request. Please try a clear JPG or PNG room photo.';
  return 'The AI design service could not complete this request. Please try again.';
}

async function handleAiDesign(request,env){
  try{
    if(!env.OPENAI_API_KEY) return json({ok:false,code:'AI_NOT_CONFIGURED',error:'AI image generation is not configured yet.'},503);
    if(request.method==='GET') return json({ok:true,configured:true,feature:'Woodrick AI Room Design',route:'active-worker',model:'gpt-image-1-mini'});
    if(request.method!=='POST') return json({ok:false,error:'Method not allowed'},405);

    const incoming=await request.formData();
    const roomPhoto=incoming.get('image');
    if(!roomPhoto||typeof roomPhoto.arrayBuffer!=='function'||!roomPhoto.size) return json({ok:false,error:'Please upload a room photo before generating the AI design.'},400);
    if(roomPhoto.size>8*1024*1024) return json({ok:false,error:'Room photo is too large for AI processing. Please use a JPG or PNG under 8 MB.'},413);
    if(!String(roomPhoto.type||'').startsWith('image/')) return json({ok:false,error:'Please upload a valid room image.'},400);

    const roomType=clean(incoming.get('roomType'),80)||'room';
    const length=clean(incoming.get('length'),20);
    const width=clean(incoming.get('width'),20);
    const height=clean(incoming.get('height'),20);
    const budget=clean(incoming.get('budget'),60)||'balanced premium';
    const style=clean(incoming.get('style'),500)||'warm contemporary neutral palette with natural wood accents';
    const openings=clean(incoming.get('openings'),700)||'preserve all visible doors, windows and fixed architectural openings';
    const furniture=clean(incoming.get('furniture'),500)||'appropriate furniture for the room type';
    const reference=clean(incoming.get('reference'),300)||'Woodrick recommended design direction';
    const concept=clean(incoming.get('concept'),900);

    const prompt=`Photorealistic premium interior design visualization for Woodrick Homes. Redesign this real ${roomType} while preserving the camera viewpoint, wall positions, ceiling geometry, doors, windows, columns and fixed openings. Room dimensions: ${length||'?'} ft x ${width||'?'} ft${height?` x ${height} ft`:''}. Furniture/elements: ${furniture}. Style/colours/materials: ${style}. Budget: ${budget}. Fixed points/openings: ${openings}. Reference: ${reference}. ${concept?`Planning direction: ${concept}.`:''} Make the result practical, buildable, elegant and realistic with believable scale and natural lighting. Do not add people, text, labels, logos or impossible structural changes.`;

    const fd=new FormData();
    fd.append('model','gpt-image-1-mini');
    fd.append('image',roomPhoto,roomPhoto.name||'room.jpg');
    fd.append('prompt',prompt);
    fd.append('size','1024x1024');
    fd.append('quality','low');

    const apiResponse=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:fd});
    const raw=await apiResponse.text();
    let result={};
    try{result=raw?JSON.parse(raw):{};}catch(_){return json({ok:false,code:'PROVIDER_UNREADABLE',error:'OpenAI returned an unexpected response. Please try again.',providerStatus:apiResponse.status},502);}

    if(!apiResponse.ok){
      const providerCode=result?.error?.code||result?.error?.type||'';
      const providerError=result?.error?.message||'';
      return json({ok:false,code:providerCode||'OPENAI_ERROR',error:providerMessage(apiResponse.status,providerCode,providerError),providerStatus:apiResponse.status},502);
    }

    const image=result?.data?.[0]?.b64_json;
    if(!image) return json({ok:false,code:'NO_IMAGE_RETURNED',error:'AI completed the request but did not return an image. Please try again.'},502);
    return json({ok:true,image:`data:image/png;base64,${image}`,model:'gpt-image-1-mini'});
  }catch(err){
    return json({ok:false,code:'AI_WORKER_ERROR',error:`AI server error: ${err&&err.message?err.message:'Unknown error'}`},500);
  }
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/ai-design') return handleAiDesign(request,env);
    return base.fetch(request,env,ctx);
  }
};
