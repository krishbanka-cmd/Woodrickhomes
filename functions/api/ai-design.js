const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store'}});

function clean(v,max=1200){return String(v||'').trim().slice(0,max)}

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
      if(roomPhoto.size>10*1024*1024) return json({ok:false,error:'Room photo is too large. Please use an image under 10 MB.'},413);
      if(!String(roomPhoto.type||'').startsWith('image/')) return json({ok:false,error:'Please upload an image file for the room photo.'},400);
      const fd=new FormData();
      fd.append('model','gpt-image-2');
      fd.append('image',roomPhoto,roomPhoto.name||'room.jpg');
      fd.append('prompt',prompt);
      fd.append('size','1536x1024');
      fd.append('quality','medium');
      fd.append('input_fidelity','high');
      fd.append('output_format','jpeg');
      apiResponse=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:fd});
    }else{
      apiResponse=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:'gpt-image-2',prompt,size:'1536x1024',quality:'medium',output_format:'jpeg'})});
    }

    const result=await apiResponse.json();
    if(!apiResponse.ok){
      console.error('OpenAI image error',apiResponse.status,result?.error?.code||'',result?.error?.message||'');
      return json({ok:false,error:'The AI design could not be generated right now. Please try again.',providerStatus:apiResponse.status},502);
    }
    const image=result?.data?.[0]?.b64_json;
    if(!image) return json({ok:false,error:'AI completed without returning an image. Please try again.'},502);
    return json({ok:true,image:`data:image/jpeg;base64,${image}`,model:'gpt-image-2'});
  }catch(err){
    console.error('AI design endpoint error',err);
    return json({ok:false,error:'Unexpected AI design error. Please try again.'},500);
  }
}

export async function onRequestGet({env}){
  return json({ok:true,configured:Boolean(env.OPENAI_API_KEY),feature:'Woodrick AI Room Design'});
}
