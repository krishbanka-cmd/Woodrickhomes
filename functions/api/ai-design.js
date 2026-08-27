const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store'}});

function clean(v,max=1200){return String(v||'').trim().slice(0,max)}

function providerMessage(status,code,message=''){
  const c=String(code||'').toLowerCase();
  const m=String(message||'').toLowerCase();
  if(c.includes('insufficient_quota')||m.includes('quota')||m.includes('billing')) return 'OpenAI API credit or billing is not available for this request. Please check the API billing balance and try again.';
  if(c.includes('verification')||m.includes('verify')||m.includes('verification')) return 'OpenAI requires account or organization verification before this image model can be used. Please complete verification in OpenAI Platform settings and try again.';
  if(c.includes('invalid_api_key')||status===401) return 'The OpenAI API key is not being accepted. Please replace OPENAI_API_KEY in Cloudflare with a valid active key.';
  if(status===429||c.includes('rate_limit')) return 'The AI image service is temporarily rate-limited. Please wait a minute and try again.';
  if(status===400) return 'The AI image service rejected this image request. Please try a smaller JPG/PNG room photo or different image.';
  return 'The AI design service could not complete this request. Please try again.';
}

export async function onRequestPost({request,env}){
  try{
    if(!env.OPENAI_API_KEY) return json({ok:false,code:'AI_NOT_CONFIGURED',error:'AI image generation is not configured yet.'},503);

    const incoming=await request.formData();
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
    const roomPhoto=incoming.get('image');

    const prompt=`Photorealistic premium interior design visualization for Woodrick Homes. Transform/design this ${roomType} while preserving the real room architecture, camera viewpoint, wall positions, ceiling geometry, doors, windows, columns and fixed openings. Room dimensions: ${length||'?'} ft x ${width||'?'} ft${height?` x ${height} ft`:''}. Required furniture/elements: ${furniture}. Preferred style/colours/materials: ${style}. Budget direction: ${budget}. Fixed points/openings notes: ${openings}. Reference direction: ${reference}. ${concept?`Space-planning concept: ${concept}.`:''} Make the result practical, buildable, elegant and premium, with realistic materials, believable scale, natural lighting and uncluttered styling. Do not add text, labels, logos, people or impossible architectural changes. Keep circulation clear and furniture proportions realistic.`;

    let apiResponse;
    if(roomPhoto instanceof File && roomPhoto.size>0){
      if(roomPhoto.size>8*1024*1024) return json({ok:false,error:'Room photo is too large for AI processing. Please use a JPG or PNG under 8 MB.'},413);
      if(!String(roomPhoto.type||'').startsWith('image/')) return json({ok:false,error:'Please upload an image file for the room photo.'},400);
      const fd=new FormData();
      fd.append('model','gpt-image-2');
      fd.append('image',roomPhoto,roomPhoto.name||'room.jpg');
      fd.append('prompt',prompt);
      // 1024 output + low quality keeps the first customer preview fast and avoids oversized edge responses.
      fd.append('size','1024x1024');
      fd.append('quality','low');
      fd.append('input_fidelity','high');
      fd.append('output_format','jpeg');
      apiResponse=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:fd});
    }else{
      apiResponse=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:'gpt-image-2',prompt,size:'1024x1024',quality:'low',output_format:'jpeg'})});
    }

    const raw=await apiResponse.text();
    let result;
    try{result=raw?JSON.parse(raw):{};}catch(_){
      console.error('OpenAI non-JSON image response',apiResponse.status,raw.slice(0,300));
      return json({ok:false,code:'PROVIDER_UNREADABLE',error:'The AI provider returned an unexpected response. Please try again in a moment.',providerStatus:apiResponse.status},502);
    }

    if(!apiResponse.ok){
      const providerCode=result?.error?.code||result?.error?.type||'';
      const providerError=result?.error?.message||'';
      console.error('OpenAI image error',apiResponse.status,providerCode,providerError);
      return json({ok:false,code:providerCode||'OPENAI_ERROR',error:providerMessage(apiResponse.status,providerCode,providerError),providerStatus:apiResponse.status},apiResponse.status===401?502:502);
    }

    const image=result?.data?.[0]?.b64_json;
    if(!image) return json({ok:false,code:'NO_IMAGE_RETURNED',error:'AI completed the request but did not return an image. Please try again.'},502);
    return json({ok:true,image:`data:image/jpeg;base64,${image}`,model:'gpt-image-2',previewQuality:'low'});
  }catch(err){
    console.error('AI design endpoint error',err?.name||'',err?.message||String(err));
    return json({ok:false,code:'AI_ENDPOINT_ERROR',error:'Unexpected AI design server error. Please try again with a smaller JPG/PNG room photo.'},500);
  }
}

export async function onRequestGet({env}){
  return json({ok:true,configured:Boolean(env.OPENAI_API_KEY),feature:'Woodrick AI Room Design',model:'gpt-image-2'});
}
