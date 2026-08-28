import base from './worker-hero.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clean=(v,max=1200)=>String(v||'').trim().slice(0,max);

function providerMessage(status,code,message=''){
  const c=String(code||'').toLowerCase();
  const m=String(message||'').toLowerCase();
  if(c.includes('insufficient_quota')||m.includes('quota')||m.includes('billing')) return 'OpenAI API credit or billing is not available for this request. Please check the API billing balance and try again.';
  if(c.includes('verification')||m.includes('verify')) return 'OpenAI requires account or organization verification before image generation can be used. Please complete verification in OpenAI Platform and try again.';
  if(c.includes('invalid_api_key')||status===401) return 'The OpenAI API key is not being accepted. Please replace OPENAI_API_KEY in Cloudflare with a valid active key.';
  if(status===429||c.includes('rate_limit')) return 'The AI service is temporarily rate-limited. Please wait a minute and try again.';
  if(status===400) return 'The AI service rejected this request. Please try again.';
  return 'The AI service could not complete this request. Please try again.';
}

async function handleVoiceTranscribe(request,env){
  try{
    if(!env.OPENAI_API_KEY) return json({ok:false,error:'Voice AI is not configured yet.'},503);
    if(request.method!=='POST') return json({ok:false,error:'Method not allowed'},405);
    const incoming=await request.formData();
    const audio=incoming.get('audio');
    if(!audio||typeof audio.arrayBuffer!=='function'||!audio.size) return json({ok:false,error:'No voice recording received.'},400);
    if(audio.size>20*1024*1024) return json({ok:false,error:'Voice recording is too large. Please keep it under one minute and try again.'},413);
    const fd=new FormData();
    fd.append('model','gpt-transcribe');
    fd.append('file',audio,audio.name||'woodrick-voice.m4a');
    fd.append('prompt','Woodrick Homes interior design request. The speaker may use Hindi, English or Hinglish and may say room dimensions in feet, door/window sizes, Design No., SKU, plywood, laminate, walnut, beige, wardrobe, TV unit, modular kitchen and furniture requirements. Preserve numbers and SKU codes accurately.');
    const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:fd});
    const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{};}catch(_){return json({ok:false,error:'Voice service returned an unreadable response.'},502);}
    if(!r.ok){const code=d?.error?.code||d?.error?.type||'';return json({ok:false,error:providerMessage(r.status,code,d?.error?.message||'')},502);}
    const text=clean(d.text,4000);if(!text)return json({ok:false,error:'Woodrick could not hear clear speech. Please try again closer to the microphone.'},422);
    return json({ok:true,text,model:'gpt-transcribe'});
  }catch(err){return json({ok:false,error:`Voice server error: ${err&&err.message?err.message:'Unknown error'}`},500);}
}

async function handleAiDesign(request,env){
  try{
    if(!env.OPENAI_API_KEY) return json({ok:false,code:'AI_NOT_CONFIGURED',error:'AI image generation is not configured yet.'},503);
    if(request.method==='GET') return json({ok:true,configured:true,feature:'Woodrick AI Room Design',route:'active-worker',model:'gpt-image-1',modes:['Improve My Current Design','Designs by Woodrick']});
    if(request.method!=='POST') return json({ok:false,error:'Method not allowed'},405);
    const incoming=await request.formData();
    const roomPhoto=incoming.get('image');
    if(!roomPhoto||typeof roomPhoto.arrayBuffer!=='function'||!roomPhoto.size) return json({ok:false,error:'Please upload a room photo before generating the AI design.'},400);
    if(roomPhoto.size>8*1024*1024) return json({ok:false,error:'Room photo is too large for AI processing. Please use a JPG or PNG under 8 MB.'},413);
    if(!String(roomPhoto.type||'').startsWith('image/')) return json({ok:false,error:'Please upload a valid room image.'},400);
    const mode=clean(incoming.get('designMode'),80)||'Improve My Current Design';
    const roomType=clean(incoming.get('roomType'),80)||'room';
    const length=clean(incoming.get('length'),20),width=clean(incoming.get('width'),20),height=clean(incoming.get('height'),20);
    const budget=clean(incoming.get('budget'),60)||'balanced premium';
    const style=clean(incoming.get('style'),500)||'warm contemporary neutral palette with natural wood accents';
    const openings=clean(incoming.get('openings'),700)||'preserve all visible doors, windows and fixed architectural openings';
    const preserve=clean(incoming.get('preserve'),700)||'preserve fixed architecture and useful existing elements';
    const change=clean(incoming.get('change'),800)||'improve furniture, storage, lighting, finishes and decor as appropriate';
    const furniture=clean(incoming.get('furniture'),500)||'appropriate furniture for the room type';
    const reference=clean(incoming.get('reference'),400)||'Woodrick recommended design direction';
    const concept=clean(incoming.get('concept'),900);
    const lockPrompt=mode==='Improve My Current Design'?`STRICT CURRENT-ROOM IMPROVEMENT MODE. This must remain unmistakably the same real room. Preserve the exact camera/viewpoint, wall positions, corners, ceiling and floor boundaries, doors, windows, columns, AC/fixed services, openings and all requested protected elements. Protected elements: ${preserve}. Only redesign or improve these requested elements: ${change}. Do not invent structural changes or move fixed openings.`:`DESIGNS BY WOODRICK MODE. Keep the actual room shell, camera/viewpoint, walls, ceiling/floor geometry, doors, windows, columns and fixed architectural openings true to the uploaded photo. Within that real shell, Woodrick has creative freedom to redesign furniture layout, storage, joinery, lighting, materials, finishes and decor. Customer direction: ${change}. Preserve where requested: ${preserve}.`;
    const prompt=`Photorealistic premium interior visualization for Woodrick Homes. ${lockPrompt} Space: ${roomType}. Room dimensions: ${length||'?'} ft x ${width||'?'} ft${height?` x ${height} ft`:''}. Furniture/elements: ${furniture}. Style/colours/materials: ${style}. Budget: ${budget}. Fixed points/openings: ${openings}. Woodrick design/SKU/catalogue reference: ${reference}. ${concept?`Planning direction: ${concept}.`:''} Keep believable scale, realistic construction, natural lighting and practical circulation. Do not add people, text, labels or logos.`;
    const fd=new FormData();fd.append('model','gpt-image-1');fd.append('image',roomPhoto,roomPhoto.name||'room.jpg');fd.append('prompt',prompt);fd.append('size','auto');fd.append('quality','low');fd.append('input_fidelity','high');fd.append('output_format','jpeg');
    const apiResponse=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:fd});
    const raw=await apiResponse.text();let result={};try{result=raw?JSON.parse(raw):{};}catch(_){return json({ok:false,code:'PROVIDER_UNREADABLE',error:'OpenAI returned an unexpected response. Please try again.',providerStatus:apiResponse.status},502);}
    if(!apiResponse.ok){const providerCode=result?.error?.code||result?.error?.type||'';const providerError=result?.error?.message||'';return json({ok:false,code:providerCode||'OPENAI_ERROR',error:providerMessage(apiResponse.status,providerCode,providerError),providerStatus:apiResponse.status},502);}
    const image=result?.data?.[0]?.b64_json;if(!image)return json({ok:false,code:'NO_IMAGE_RETURNED',error:'AI completed the request but did not return an image. Please try again.'},502);
    return json({ok:true,image:`data:image/jpeg;base64,${image}`,model:'gpt-image-1',mode});
  }catch(err){return json({ok:false,code:'AI_WORKER_ERROR',error:`AI server error: ${err&&err.message?err.message:'Unknown error'}`},500);}
}

const VOICE_WIDGET=`
<style id="hey-woodrick-global-style">
.hey-woodrick-float{position:fixed;left:18px;bottom:22px;z-index:9999;display:flex;align-items:center;gap:10px;padding:10px 15px 10px 10px;border:1px solid #d6aa4f;border-radius:999px;background:#090909;color:#f0c96b!important;text-decoration:none!important;font:800 12px/1 Arial,sans-serif;letter-spacing:.02em;box-shadow:0 12px 34px rgba(0,0,0,.28);transition:transform .2s ease,box-shadow .2s ease}.hey-woodrick-float:hover{transform:translateY(-2px);box-shadow:0 16px 38px rgba(0,0,0,.34)}.hey-woodrick-mic{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#d5a338,#f0c96b);color:#111;font-size:19px;box-shadow:0 0 0 5px rgba(240,201,107,.10)}.hey-woodrick-float small{display:block;margin-top:3px;color:#d9ccb0;font-size:9px;font-weight:600;letter-spacing:0}.voice-arrival{margin:0 0 18px;padding:12px 14px;border-left:3px solid #c59a58;background:#fff8e8;color:#5c4931;font:700 12px/1.5 Arial,sans-serif;border-radius:4px}@media(max-width:520px){.hey-woodrick-float{left:10px;right:auto;bottom:18px;padding:8px 11px 8px 8px}.hey-woodrick-mic{width:34px;height:34px;font-size:17px}.hey-woodrick-float small{display:none}}
</style>
<a class="hey-woodrick-float" href="/voice-design-assistant.html" aria-label="Open Hey Woodrick Voice Assistant"><span class="hey-woodrick-mic">🎙</span><span>HEY WOODRICK<small>Voice Design Assistant</small></span></a>`;

const DESIGN_PREFILL=`<script id="hey-woodrick-prefill">(function(){if(!location.pathname.endsWith('/design-your-space.html'))return;var p=new URLSearchParams(location.search);if(p.get('voice')!=='1')return;function set(name,key){var el=document.querySelector('[name="'+name+'"]');var v=p.get(key||name);if(el&&v)el.value=v;}set('roomType');set('length');set('width');set('height');set('openings');set('style');set('change');var ref=p.get('reference');if(ref){var ch=document.querySelector('[name="change"]');if(ch&&!ch.value.includes(ref))ch.value=(ch.value?ch.value+'\\n':'')+'Preferred Design No. / SKU: '+ref;}var form=document.getElementById('spaceForm');if(form){var note=document.createElement('div');note.className='voice-arrival';note.textContent='🎙 Hey Woodrick has filled the details it understood. Please verify dimensions, Design/SKU and openings, then add your room photo.';form.insertBefore(note,form.firstChild);form.scrollIntoView({behavior:'smooth',block:'start'});}})();<\/script>`;
async function withVoiceUi(response,url){const type=response.headers.get('content-type')||'';if(!response.ok||!type.includes('text/html'))return response;let html=await response.text();if(url.pathname!=='/voice-design-assistant.html'&&!html.includes('hey-woodrick-global-style'))html=html.replace(/<\/body>/i,VOICE_WIDGET+'\n</body>');if(url.pathname.endsWith('/design-your-space.html')&&!html.includes('hey-woodrick-prefill'))html=html.replace(/<\/body>/i,DESIGN_PREFILL+'\n</body>');const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-cache');return new Response(html,{status:response.status,statusText:response.statusText,headers});}

export default{async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname==='/api/voice-transcribe')return handleVoiceTranscribe(request,env);if(url.pathname==='/api/ai-design')return handleAiDesign(request,env);const response=await base.fetch(request,env,ctx);return withVoiceUi(response,url);}};