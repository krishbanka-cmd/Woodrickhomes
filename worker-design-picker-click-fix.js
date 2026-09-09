import app from './worker-design-picker.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

const normalizeDesignNo=value=>String(value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const seededDesigns={
  FL405:{designNo:'FL-405',brand:'Woodline',category:'Acrylic Laminates',catalogue:'Woodline Acrylic',page:'10',key:'library/woodline/acrylic-laminates/woodline-acrylic/jpg/page-010.jpg',x:.629,y:.55,verified:true},
  WL141:{designNo:'WL-141',brand:'Woodline',category:'Louvers',catalogue:'Woodline Louvers 8x5',page:'6',key:'library/woodline-louvers/louvers/woodline-louvers-8x5/jpg/page-006.jpg',x:.63,y:.44,verified:true}
};

async function rememberDesign(env,item){
  const id=normalizeDesignNo(item&&item.designNo);if(!id||!env.PRODUCT_MEDIA)return;
  const value={...item,designNo:String(item.designNo).trim().toUpperCase(),verified:true,verifiedAt:new Date().toISOString()};
  try{
    const key=`_system/design-index/${id}.json`,stored=await env.PRODUCT_MEDIA.get(key);let previous=[];
    if(stored){const old=await stored.json();previous=Array.isArray(old.items)?old.items:[old]}
    const identity=x=>[String(x.key||''),String(x.page||''),String(x.brand||''),String(x.catalogue||'')].join('|').toLowerCase();
    const next=previous.filter(x=>x&&normalizeDesignNo(x.designNo)===id&&identity(x)!==identity(value));next.push(value);
    await env.PRODUCT_MEDIA.put(key,JSON.stringify({designNo:value.designNo,items:next.slice(-20),verified:true,verifiedAt:value.verifiedAt}),{httpMetadata:{contentType:'application/json'}});
  }catch(_){}
}

async function searchDesign(request,env){
  const raw=String(new URL(request.url).searchParams.get('q')||'').trim(),parts=(raw.toUpperCase().match(/[A-Z]+|[0-9]+/g)||[]);
  const candidates=[];for(let i=0;i<parts.length;i++){const id=normalizeDesignNo(parts.slice(i).join(''));if(id.length>=3&&/[0-9]/.test(id)&&!candidates.includes(id))candidates.push(id)}
  const whole=normalizeDesignNo(raw);if(whole.length>=3&&/[0-9]/.test(whole)&&!candidates.includes(whole))candidates.unshift(whole);
  if(!candidates.length)return json({ok:true,found:false});
  const context=normalizeDesignNo(raw),dedupe=items=>{const seen=new Set();return items.filter(x=>{const k=[x.key,x.page,x.brand,x.catalogue,normalizeDesignNo(x.designNo)].join('|').toLowerCase();if(seen.has(k))return false;seen.add(k);return true})};
  const choose=items=>{items=dedupe(items);if(items.length<2)return items;const scored=items.map(x=>{const words=[x.brand,x.category,x.catalogue].join(' ').toUpperCase().match(/[A-Z]+|[0-9]+/g)||[];return{x,s:words.filter(w=>w.length>1&&context.includes(normalizeDesignNo(w))).length}}),best=Math.max(...scored.map(r=>r.s));return best>0?scored.filter(r=>r.s===best).map(r=>r.x):items};
  let matches=[];
  for(const q of candidates){if(seededDesigns[q])matches.push(seededDesigns[q]);if(!env.PRODUCT_MEDIA)continue;try{const stored=await env.PRODUCT_MEDIA.get(`_system/design-index/${q}.json`);if(stored){const d=await stored.json();matches.push(...(Array.isArray(d.items)?d.items:[d]))}}catch(_){}if(matches.length)break}
  matches=choose(matches);let item=matches.length===1?matches[0]:null;
  if(matches.length>1)return json({ok:true,found:false,ambiguous:true,matches:matches.slice(0,12).map(x=>({...x,src:`/api/media?raw=1&key=${encodeURIComponent(x.key)}`}))});
  if(!item&&env.PRODUCT_MEDIA){
    try{
      let scanned=[];let cursor;
      for(let loop=0;loop<200;loop++){
        const options={limit:1000,prefix:'library/',include:['customMetadata']};if(cursor)options.cursor=cursor;
        const listed=await env.PRODUCT_MEDIA.list(options);
        for(const object of listed.objects||[]){
          const m=object.customMetadata||{};if(String(m.type||'')!=='jpg-page')continue;
          const codes=String(m.designNumbers||'').split(/[\s,;|·]+/).filter(Boolean);
          const code=codes.find(code=>candidates.includes(normalizeDesignNo(code)));if(!code)continue;
          scanned.push({designNo:code,brand:String(m.brand||''),category:String(m.category||''),catalogue:String(m.catalogue||m.title||''),page:String(m.page||''),key:object.key,verified:true,needsLocate:true});
        }
        if(!listed.truncated||!listed.cursor)break;cursor=listed.cursor;
      }
      scanned=choose(scanned);if(scanned.length===1)item=scanned[0];
      else if(scanned.length>1)return json({ok:true,found:false,ambiguous:true,matches:scanned.slice(0,12).map(x=>({...x,src:`/api/media?raw=1&key=${encodeURIComponent(x.key)}`}))});
    }catch(_){}
  }
  if(!item||!candidates.includes(normalizeDesignNo(item.designNo)))return json({ok:true,found:false});
  return json({ok:true,found:true,item:{...item,src:`/api/media?raw=1&key=${encodeURIComponent(item.key)}`}});
}

function toBase64(buffer){
  const bytes=new Uint8Array(buffer);let out='';const step=0x8000;
  for(let i=0;i<bytes.length;i+=step)out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+step,bytes.length)));
  return btoa(out);
}

async function catalogueImage(request,env,src,key){
  const safeKey=String(key||'');
  if(env.PRODUCT_MEDIA&&safeKey.startsWith('library/')&&!safeKey.includes('..')){
    const object=await env.PRODUCT_MEDIA.get(safeKey);if(!object)return null;
    const type=(object.httpMetadata&&object.httpMetadata.contentType)||'image/jpeg';
    return {type,buffer:await object.arrayBuffer()};
  }
  const pageUrl=new URL(src,new URL(request.url).origin),site=new URL(request.url);
  if(pageUrl.origin!==site.origin)return null;
  const response=await fetch(pageUrl.toString(),{headers:{accept:'image/*'}});if(!response.ok)return null;
  return {type:(response.headers.get('content-type')||'image/jpeg').split(';')[0],buffer:await response.arrayBuffer()};
}

const backfillStateKey='_system/design-backfill/state.json';
const pageMarkerKey=key=>`_system/design-backfill/pages/${encodeURIComponent(key)}.json`;

async function readAllDesignsOnPage(env,entry){
  const object=await env.PRODUCT_MEDIA.get(entry.key);if(!object)return[];
  const ab=await object.arrayBuffer();if(!ab.byteLength||ab.byteLength>7*1024*1024)return[];
  const type=(object.httpMetadata&&object.httpMetadata.contentType)||'image/jpeg',dataUrl=`data:${type};base64,${toBase64(ab)}`;
  const prompt='Read this building-material catalogue page and extract every clearly printed product Design No. / SKU that belongs to a visible material swatch. Include the normalized centre coordinates of that swatch, from 0 to 1. Ignore page numbers, dimensions, prices, phone numbers, QR codes, years and decorative text. Never invent a code. Return ONLY JSON: {"designs":[{"designNo":"FL-403","x":0.25,"y":0.45}]}. If there are no clearly readable product codes, return {"designs":[]}.';
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:dataUrl,detail:'high'}}]}],temperature:0,max_tokens:2200,response_format:{type:'json_object'}})});
  const response=await r.json();if(!r.ok)throw new Error((response&&response.error&&response.error.message)||'Catalogue OCR failed');
  let parsed={};try{parsed=JSON.parse(response&&response.choices&&response.choices[0]&&response.choices[0].message&&response.choices[0].message.content||'{}')}catch(_){}
  const seen=new Set();return (Array.isArray(parsed.designs)?parsed.designs:[]).map(x=>({designNo:String(x&&x.designNo||'').trim().toUpperCase().replace(/\s+/g,' '),x:Number(x&&x.x),y:Number(x&&x.y)})).filter(x=>{const id=normalizeDesignNo(x.designNo);if(id.length<3||id.length>40||!/[0-9]/.test(id)||seen.has(id)||!Number.isFinite(x.x)||!Number.isFinite(x.y)||x.x<0||x.x>1||x.y<0||x.y>1)return false;seen.add(id);return true}).slice(0,80);
}

export async function backfillDesignIndex(env,maxPages=2){
  if(!env.PRODUCT_MEDIA||!env.OPENAI_API_KEY)return{ok:false,reason:'not-configured'};
  let state={cursor:'',queue:[],cycles:0,processed:0,designs:0,complete:false,endReached:false};
  try{const saved=await env.PRODUCT_MEDIA.get(backfillStateKey);if(saved)state={...state,...await saved.json()}}catch(_){}
  if(state.complete&&Number(state.nextScanAt||0)>Date.now())return{ok:true,...state};
  if(state.complete){state.cursor='';state.queue=[];state.complete=false;state.endReached=false;state.cycles=0}
  let done=0;
  while(done<maxPages){
    if(!Array.isArray(state.queue)||!state.queue.length){
      if(state.endReached){state.complete=true;break}
      const options={prefix:'library/',limit:80,include:['customMetadata']};if(state.cursor)options.cursor=state.cursor;
      const listed=await env.PRODUCT_MEDIA.list(options);state.queue=(listed.objects||[]).filter(o=>String((o.customMetadata||{}).type||'')==='jpg-page').map(o=>({key:o.key,meta:o.customMetadata||{}}));state.cursor=listed.truncated&&listed.cursor?listed.cursor:'';state.endReached=!listed.truncated;state.cycles=Number(state.cycles||0)+1;if(!state.queue.length&&state.endReached){state.complete=true;break}if(!state.queue.length)continue;
    }
    const entry=state.queue.shift(),marker=await env.PRODUCT_MEDIA.get(pageMarkerKey(entry.key));if(marker){let prior={};try{prior=await marker.json()}catch(_){}if(!prior.error||Number(prior.retryAt||0)>Date.now())continue}
    let designs=[],error='';try{
      const metadataCodes=String(entry.meta.designNumbers||'').split(/[\s,;|·]+/).filter(Boolean);
      designs=metadataCodes.length?metadataCodes.map(designNo=>({designNo,needsLocate:true})):await readAllDesignsOnPage(env,entry);
      for(const x of designs)await rememberDesign(env,{...x,brand:String(entry.meta.brand||''),category:String(entry.meta.category||''),catalogue:String(entry.meta.catalogue||entry.meta.title||''),page:String(entry.meta.page||''),key:entry.key,source:metadataCodes.length?'pdf-text-backfill':'catalogue-ocr-backfill'});
    }catch(e){error=String(e&&e.message||e).slice(0,300)}
    await env.PRODUCT_MEDIA.put(pageMarkerKey(entry.key),JSON.stringify({key:entry.key,indexedAt:new Date().toISOString(),designCount:designs.length,error,retryAt:error?Date.now()+60*60*1000:0}),{httpMetadata:{contentType:'application/json'}});
    if(!error){state.processed=Number(state.processed||0)+1;state.designs=Number(state.designs||0)+designs.length}done++;
  }
  if(!state.queue.length&&state.endReached){state.complete=true;state.nextScanAt=Date.now()+24*60*60*1000}
  state.updatedAt=new Date().toISOString();await env.PRODUCT_MEDIA.put(backfillStateKey,JSON.stringify(state),{httpMetadata:{contentType:'application/json'}});return{ok:true,processedNow:done,...state};
}

async function readCatalogueDesignCode(request,env){
  try{
    if(request.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
    if(!env.OPENAI_API_KEY)return json({ok:false,error:'Design number reader is not configured.'},503);
    const body=await request.json();
    const src=String(body&&body.src||''),markedImage=String(body&&body.markedImage||'');const x=Number(body&&body.x),y=Number(body&&body.y);
    if(!src||!Number.isFinite(x)||!Number.isFinite(y))return json({ok:false,error:'Missing catalogue selection.'},400);
    let dataUrl='';
    if(/^data:image\/(?:jpeg|png);base64,/i.test(markedImage)&&markedImage.length<7*1024*1024){dataUrl=markedImage}else{
      const image=await catalogueImage(request,env,src,body.key);
      if(!image)return json({ok:false,error:'Catalogue page image could not be loaded.'},502);
      const type=image.type;
      if(!type.startsWith('image/'))return json({ok:false,error:'Catalogue page is not an image.'},422);
      const ab=image.buffer;
      if(ab.byteLength>7*1024*1024)return json({ok:false,error:'Catalogue page image is too large to read.'},413);
      dataUrl=`data:${type};base64,${toBase64(ab)}`;
    }
    const px=Math.round(Math.max(0,Math.min(1,x))*100),py=Math.round(Math.max(0,Math.min(1,y))*100);
    const prompt=`You are reading a building-material catalogue image. The exact customer-selected design is marked with a RED TARGET. The original click was around ${px}% from the left and ${py}% from the top. Read the printed SKU / Design No. / product code belonging to that marked design. Codes may look like FL-403, WL 141, WL-141, M-183 or MM-173. Use only the code actually printed below or clearly associated with the marked design. Do not return a page number, dimension, price, QR content, nearby design code or invented code. Return ONLY JSON in this exact form: {"designNo":"FL-403"}. If the correct code is not clearly readable, return {"designNo":""}.`;
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:dataUrl,detail:'high'}}]}],temperature:0,max_tokens:60,response_format:{type:'json_object'}})});
    const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch(_){return json({ok:false,error:'Design number reader returned an unreadable response.'},502)}
    if(!r.ok)return json({ok:false,error:(d&&d.error&&d.error.message)||'Design number reader failed.'},502);
    const text=d&&d.choices&&d.choices[0]&&d.choices[0].message?d.choices[0].message.content:'';let parsed={};try{parsed=JSON.parse(text||'{}')}catch(_){}
    let code=String(parsed.designNo||'').trim().replace(/\s+/g,' ');
    if(code.length>40)code='';
    if(code)await rememberDesign(env,{designNo:code,brand:String(body.brand||''),category:String(body.category||''),catalogue:String(body.catalogue||''),page:String(body.page||''),key:String(body.key||''),x,y});
    return json({ok:true,designNo:code});
  }catch(err){return json({ok:false,error:'Could not read actual design number.'},500)}
}

async function locateCatalogueDesignCode(request,env){
  try{
    if(request.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
    if(!env.OPENAI_API_KEY)return json({ok:false,error:'Voice design finder is not configured.'},503);
    const body=await request.json();
    const src=String(body&&body.src||''),wanted=String(body&&body.designNo||'').trim().toUpperCase();
    if(!src||!wanted||wanted.length>40)return json({ok:false,error:'Catalogue page and Design No. are required.'},400);
    const image=await catalogueImage(request,env,src,body.key);
    if(!image)return json({ok:false,error:'Catalogue page image could not be loaded.'},502);
    const type=image.type;
    if(!type.startsWith('image/'))return json({ok:false,error:'Catalogue page is not an image.'},422);
    const ab=image.buffer;
    if(ab.byteLength>7*1024*1024)return json({ok:false,error:'Catalogue page image is too large to search.'},413);
    const dataUrl=`data:${type};base64,${toBase64(ab)}`;
    const prompt=`Find the exact building-material Design No. / SKU "${wanted}" on this catalogue page. If it is clearly printed, identify the centre of the material swatch or design sample that belongs to that exact code (not the centre of the printed code text). Return normalized image coordinates from 0 to 1. Never use a nearby code and never guess. Return ONLY JSON: {"found":true,"designNo":"${wanted}","x":0.5,"y":0.5}. If the exact code is not clearly present, return {"found":false,"designNo":"","x":0,"y":0}.`;
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:dataUrl,detail:'high'}}]}],temperature:0,max_tokens:90,response_format:{type:'json_object'}})});
    const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch(_){return json({ok:false,error:'Voice design finder returned an unreadable response.'},502)}
    if(!r.ok)return json({ok:false,error:(d&&d.error&&d.error.message)||'Voice design finder failed.'},502);
    const text=d&&d.choices&&d.choices[0]&&d.choices[0].message?d.choices[0].message.content:'';let parsed={};try{parsed=JSON.parse(text||'{}')}catch(_){}
    const clean=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const x=Number(parsed.x),y=Number(parsed.y),same=clean(parsed.designNo)===clean(wanted);
    if(!parsed.found||!same||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)return json({ok:true,found:false,designNo:''});
    await rememberDesign(env,{designNo:wanted,brand:String(body.brand||''),category:String(body.category||''),catalogue:String(body.catalogue||''),page:String(body.page||''),key:String(body.key||''),x,y});
    return json({ok:true,found:true,designNo:wanted,x,y});
  }catch(err){return json({ok:false,error:'Could not find the spoken Design No. on this page.'},500)}
}

async function enhance(response,url){
  if(url.pathname!=='/voice-design-assistant.html'&&url.pathname!=='/voice-design-assistant')return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  let html=await response.text();

  // Keep the customer's room + Mood Board + surface mapping through refresh.
  // This code is injected inside the picker closure so it can safely restore `exact`.
  html=html.replace(
    "var exact=[],current=null,tempPoints=[],lastPoint=null,lastVoiceCommand='',surfaces=['TV Unit','Wardrobe','Back Wall','Dresser','Bed / Headboard'];",
    "var exact=[],current=null,tempPoints=[],lastPoint=null,lastVoiceCommand='',surfaces=['TV Unit','Wardrobe','Back Wall','Dresser','Bed / Headboard'],sessionKey='woodrickDesignWorkspaceV1';function saveSession(){try{var fields={};['room','sku','length','width','height','style','openings','requirements'].forEach(function(id){var e=document.getElementById(id);if(e)fields[id]=e.value});localStorage.setItem(sessionKey,JSON.stringify({exact:exact,fields:fields,savedAt:Date.now()}))}catch(_){}}function restoreSession(){try{var raw=localStorage.getItem(sessionKey);if(!raw)return;var s=JSON.parse(raw);if(Array.isArray(s.exact))exact=s.exact.map(function(x){if(!Array.isArray(x.surfaces))x.surfaces=[];return x});var f=s.fields||{};Object.keys(f).forEach(function(id){var e=document.getElementById(id);if(e&&!e.value)e.value=f[id]||''})}catch(_){}}"
  );
  html=html.replace("['room','sku','length','width','height','style','openings','requirements'].forEach(function(id){var e=document.getElementById(id);if(e)fields[id]=e.value})","['room','sku','length','width','style','openings','requirements'].forEach(function(id){var e=document.getElementById(id);if(e)fields[id]=e.value})");
  html=html.replace("var f=s.fields||{};Object.keys(f).forEach(function(id)","var f=s.fields||{};delete f.height;var heightField=document.getElementById('height');if(heightField)heightField.value='';Object.keys(f).forEach(function(id)");
  html=html.replace("catalogue:'',page:page,sku:sku", "catalogue:lines[2]||'',page:page,sku:sku");

  // Read the real printed SKU/design number from the selected point on the catalogue page.
  html=html.replace(
    "function near(a,b){return Math.abs(a.x-b.x)<.035&&Math.abs(a.y-b.y)<.035}",
    "function near(a,b){return Math.abs(a.x-b.x)<.035&&Math.abs(a.y-b.y)<.035}function markedCrop(p){try{var img=document.getElementById('wwPickerImg');if(!img||!img.complete||!img.naturalWidth)return'';var iw=img.naturalWidth,ih=img.naturalHeight,cw=Math.min(iw,Math.round(iw*.24)),ch=Math.min(ih,Math.round(ih*.62)),cx=p.x*iw,cy=p.y*ih,sx=Math.max(0,Math.min(iw-cw,cx-cw/2)),sy=Math.max(0,Math.min(ih-ch,cy-ch*.44)),canvas=document.createElement('canvas'),scale=Math.min(1,1200/cw,1200/ch);canvas.width=Math.max(1,Math.round(cw*scale));canvas.height=Math.max(1,Math.round(ch*scale));var ctx=canvas.getContext('2d');ctx.drawImage(img,sx,sy,cw,ch,0,0,canvas.width,canvas.height);var tx=(cx-sx)*scale,ty=(cy-sy)*scale,r=Math.max(18,Math.min(canvas.width,canvas.height)*.035);ctx.strokeStyle='#e00000';ctx.lineWidth=Math.max(7,r*.22);ctx.beginPath();ctx.arc(tx,ty,r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(tx-r*1.45,ty);ctx.lineTo(tx+r*1.45,ty);ctx.moveTo(tx,ty-r*1.45);ctx.lineTo(tx,ty+r*1.45);ctx.stroke();return canvas.toDataURL('image/jpeg',.9)}catch(_){return''}}function resolvePoint(p){if(!current||!p)return;p.reading=true;status('Reading actual design number from catalogue…');fetch('/api/catalogue-design-code',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({src:current.src,x:p.x,y:p.y,page:current.page,brand:current.brand,category:current.category,catalogue:current.catalogue,key:current.key,markedImage:markedCrop(p)})}).then(function(r){return r.json()}).then(function(d){p.reading=false;p.designNo=d&&d.designNo?String(d.designNo).trim():'';if(p.designNo)status('Design No. '+p.designNo+' identified. Add selected designs to Mood Board.');else status('Design No. साफ नहीं पढ़ा गया। उसी design के बीच में दोबारा click करें।');drawDots()}).catch(function(){p.reading=false;p.designNo='';status('Design No. नहीं पढ़ा गया। उसी design के बीच में दोबारा click करें।')})}"
  );

  // Connect spoken Brand + category + page + Design No. to the verified catalogue picker.
  // The exact SKU is located on the named page before it is added; nothing is guessed.
  html=html.replace(
    "function voiceText(){return ((((document.getElementById('heard')||{}).textContent)||'')+' '+(((document.getElementById('requirements')||{}).value)||'')).toLowerCase()}function applyVoiceCommand(){var t=voiceText();",
    "function voiceSelectFromCommand(t){if(!/(?:select|add|choose|open|show|mood board|kholo|dikhao|chuno|lagao|सेलेक्ट|ऐड|खोलो|दिखाओ|चुनो|लगाओ)/i.test(t))return false;var pm=t.match(/(?:page|pg|पेज)\\s*[:#-]?\\s*(\\d{1,4})/i),dm=t.match(/(?:sku|design(?:\\s*(?:no|number))?|डिजाइन(?:\\s*(?:नंबर|नं))?|डिज़ाइन(?:\\s*(?:नंबर|नं))?)\\s*(?:is|hai|है|number|no\\.?|#|नंबर|नं|को|ka|का)?\\s*([a-z]{1,5})[\\s-]*(\\d{2,8})/i),sku=document.getElementById('sku'),wanted=dm?(dm[1]+'-'+dm[2]).toUpperCase():((sku&&sku.value)||'').trim().toUpperCase(),page=pm?pm[1]:'',open=document.getElementById('wwExactPicker');if(!page&&!(open&&open.classList.contains('open')&&current)){if(wanted)status('Design No. '+wanted+' मिला। Voice selection के लिए Brand और Page No. भी बोलें।');return !!wanted}function words(s){return String(s||'').toLowerCase().split(/[^a-z0-9.]+/).filter(function(w){return w.length>2})}function score(x){var n=0;words(x.brand+' '+x.category+' '+x.catalogue).forEach(function(w){if(t.indexOf(w)>=0)n++});return n}function locate(){if(!wanted){status('Catalogue page opened. Exact design select करने के लिए Design No. भी बोलें।');return true}status('Design No. '+wanted+' को verified catalogue page पर खोज रहे हैं…');var img=document.getElementById('wwPickerImg'),run=function(){fetch('/api/catalogue-locate-design',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({src:current.src,designNo:wanted,page:current.page,brand:current.brand,category:current.category,catalogue:current.catalogue,key:current.key})}).then(function(r){return r.json()}).then(function(d){if(!d||!d.ok||!d.found){status('Design No. '+wanted+' इस page पर साफ नहीं मिला। कुछ भी select नहीं किया गया।');return}var p={x:Number(d.x),y:Number(d.y),reading:false,designNo:wanted};tempPoints=[p];lastPoint=p;drawDots();if(!addAllTemp())status('Design No. '+wanted+' select नहीं हुआ। Page खोलकर design verify करें।')}).catch(function(){status('Voice design search अभी complete नहीं हुआ। Page खोलकर design verify करें।')})};if(img&&img.complete)run();else if(img)img.addEventListener('load',run,{once:true});return true}if(open&&open.classList.contains('open')&&current&&!page)return locate();var candidates=designs.filter(function(x){return String(x.page||'')===String(page)});if(!candidates.length){status('Page '+page+' verified Woodrick Library में नहीं मिला।');return true}var ranked=candidates.map(function(x){return{x:x,s:score(x)}}).sort(function(a,b){return b.s-a.s}),top=ranked[0].s,best=ranked.filter(function(r){return r.s===top});if(best.length!==1){status('Page '+page+' एक से अधिक catalogues में है। Brand और category भी बोलें; कुछ भी select नहीं किया गया।');return true}active=best[0].x.category;renderFilters();renderCards();var card=Array.from(document.querySelectorAll('.ww-card')).find(function(c){return pageInfo(c).key===best[0].x.key});if(!card){card=document.createElement('div');card.className='ww-card';var im=document.createElement('img'),info=document.createElement('div');im.src='/api/media?raw=1&key='+encodeURIComponent(best[0].x.key);info.textContent=[best[0].x.category,best[0].x.brand,best[0].x.catalogue,'Page '+best[0].x.page].join('\\n');card.appendChild(im);card.appendChild(info)}openPick(card);return locate()}function voiceText(){return ((((document.getElementById('heard')||{}).textContent)||'')+' '+(((document.getElementById('requirements')||{}).value)||'')).toLowerCase()}function applyVoiceCommand(){var t=voiceText();if(voiceSelectFromCommand(t)){lastVoiceCommand=t;return}"
  );
  html=html.replace(
    "selection:'Pick '+n,designNo:current.sku||'',surfaces:[]",
    "selection:'Pick '+n,designNo:p.designNo||current.sku||'',surfaces:[]"
  );
  html=html.replace(
    "else{tempPoints.push(p);lastPoint=p;status('Design '+tempPoints.length+' marked. Select more, add to Mood Board, or use voice.')}drawDots()",
    "else{tempPoints.push(p);lastPoint=p;resolvePoint(p)}drawDots()"
  );
  html=html.replace(
    "function addAllTemp(){if(!current||!tempPoints.length){status('First click one or more designs on the catalogue page.');return false}",
    "function addAllTemp(){if(!current||!tempPoints.length){status('First click one or more designs on the catalogue page.');return false}if(tempPoints.some(function(p){return p.reading})){status('Please wait a moment — Woodrick is reading the actual design number.');return false}if(tempPoints.some(function(p){return !p.designNo&&!current.sku})){status('Design No. identify हुए बिना design Mood Board में add नहीं होगा। उसी design के बीच में दोबारा click करें।');return false}"
  );

  // Never show a temporary Pick number as the material identity. Keep page + verified design number together.
  html=html.replace(
    "esc(id?('Design No. '+id):('Page '+x.page+' · '+x.selection))",
    "esc(id?('Page '+x.page+' · Design No. '+id):('Page '+x.page+' · Design No. pending'))"
  );
  html=html.replace(
    "if(!exact.length){if(st)st.textContent='Please select at least one exact design from a catalogue page first.';return}",
    "if(!exact.length){if(st)st.textContent='Please select at least one exact design from a catalogue page first.';return}if(exact.some(function(x){return !designId(x)})){if(st)st.textContent='हर selected material का Design No. verify होने के बाद ही 3D Layout बनेगा।';return}"
  );

  html=html.replace(
    "function setAssigned(x,s,on){if(!Array.isArray(x.surfaces))x.surfaces=[];var i=x.surfaces.indexOf(s);if(on&&i<0)x.surfaces.push(s);if(!on&&i>=0)x.surfaces.splice(i,1)}",
    "function setAssigned(x,s,on){if(!Array.isArray(x.surfaces))x.surfaces=[];var i=x.surfaces.indexOf(s);if(on&&i<0)x.surfaces.push(s);if(!on&&i>=0)x.surfaces.splice(i,1);saveSession()}"
  );
  html=html.replace(
    "exact.push(pointRecord(p,n));render();markCards();status('Design added to Mood Board from Page '+current.page+'.');",
    "exact.push(pointRecord(p,n));saveSession();render();markCards();status('Design added to Mood Board from Page '+current.page+'.');"
  );
  html=html.replace(
    "b.onclick=function(){exact.splice(Number(b.dataset.i),1);render();markCards()}",
    "b.onclick=function(){exact.splice(Number(b.dataset.i),1);saveSession();render();markCards()}"
  );
  html=html.replace(
    "setTimeout(function(){upgrade();render();var create=document.getElementById('wwCreate');",
    "document.addEventListener('woodrickLibraryReady',function(){restoreSession();upgrade();render();markCards()});setTimeout(function(){restoreSession();upgrade();render();['room','sku','length','width','height','style','openings','requirements'].forEach(function(id){var e=document.getElementById(id);if(e)e.addEventListener('input',saveSession)});var create=document.getElementById('wwCreate');"
  );

  // Patch the real picker action itself. When one or more designs are added,
  // close the selector immediately and return the customer to the Mood Board.
  html=html.replace(
    "render();markCards();status(added+' selected design'+(added===1?'':'s')+' added to Mood Board from Page '+current.page+'.');return added>0}",
    "saveSession();render();markCards();var ok=added>0;if(ok){var picker=document.getElementById('wwExactPicker');if(picker)picker.classList.remove('open');tempPoints=[];lastPoint=null;status(added+' selected design'+(added===1?'':'s')+' added to Mood Board. You can now assign them to TV Unit, Wardrobe, Back Wall, Dresser or Headboard.');var tray=document.getElementById('wwExactTray');if(tray)setTimeout(function(){tray.scrollIntoView({behavior:'smooth',block:'center'})},80)}return ok}"
  );

  // Expose the same real action globally for click, touch and voice fallbacks.
  html=html.replace(
    "document.getElementById('wwUsePick').onclick=addAllTemp;",
    "window.woodrickAddSelectedDesigns=addAllTemp;document.getElementById('wwUsePick').onclick=function(e){if(e){e.preventDefault();e.stopPropagation()}return addAllTemp()};"
  );

  html=html.replace(
    "function designId(x){return x.designNo||x.sku||''}",
    "window.woodrickOpenIndexedDesign=function(item){if(!item||!item.key)return false;var card=Array.from(document.querySelectorAll('.ww-card')).find(function(c){return pageInfo(c).key===item.key});if(!card){card=document.createElement('div');card.className='ww-card';var im=document.createElement('img'),info=document.createElement('div');im.src=item.src||('/api/media?raw=1&key='+encodeURIComponent(item.key));info.textContent=[item.category,item.brand,item.catalogue,'Page '+item.page].filter(Boolean).join('\\n');card.appendChild(im);card.appendChild(info)}openPick(card);current.category=item.category||current.category;current.brand=item.brand||current.brand;current.catalogue=item.catalogue||current.catalogue;current.page=String(item.page||current.page);current.key=item.key;function mark(x,y){var p={x:Number(x),y:Number(y),reading:false,designNo:String(item.designNo||'')};tempPoints=[p];lastPoint=p;drawDots();status('Verified Design No. '+p.designNo+' · '+current.brand+' · Page '+current.page+'. Check the marker, then add it to Mood Board.')}function ready(){if(Number.isFinite(Number(item.x))&&Number.isFinite(Number(item.y)))return mark(item.x,item.y);status('Design No. '+item.designNo+' का exact marker verify कर रहे हैं…');fetch('/api/catalogue-locate-design',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({src:current.src,designNo:item.designNo,page:current.page,brand:current.brand,category:current.category,catalogue:current.catalogue,key:current.key})}).then(function(r){return r.json()}).then(function(d){if(d&&d.ok&&d.found)mark(d.x,d.y);else status('Design No. '+item.designNo+' इस catalogue page पर साफ नहीं मिला। कुछ भी select नहीं किया गया।')}).catch(function(){status('Exact marker अभी verify नहीं हुआ। Page पर design के बीच में click करें।')})}var image=document.getElementById('wwPickerImg');if(image&&image.complete)ready();else if(image)image.addEventListener('load',ready,{once:true});return true};function designId(x){return x.designNo||x.sku||''}"
  );

  if(html.includes('woodrick-moodboard-click-fix-v5'))return response;
  const css=`<style id="woodrick-moodboard-click-fix-v5">#wwExactPicker .ww-picker-actions{position:sticky;bottom:0;z-index:10080;background:#fff;padding:12px 0 4px;pointer-events:auto!important}#wwUsePick{position:relative;z-index:10081;pointer-events:auto!important;touch-action:manipulation;cursor:pointer!important;min-height:52px;display:block!important}#wwUsePick:active{transform:translateY(1px)}#wwSessionBar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0;padding:9px 11px;border:1px solid #d8c49a;border-radius:9px;background:#fffaf0;font-size:10px}#wwNewDesign{border:1px solid #111;background:#111;color:#f0c96b;padding:8px 10px;border-radius:7px;font-weight:900;cursor:pointer}</style>`;
  const js=`<script id="woodrick-moodboard-click-fix-v5">window.addEventListener('DOMContentLoaded',function(){var lock=false;function status(t){var s=document.getElementById('wwStatus');if(s)s.textContent=t}function execute(ev){if(lock)return;if(ev){ev.preventDefault();ev.stopPropagation()}if(typeof window.woodrickAddSelectedDesigns!=='function'){status('Mood Board action is still loading. Close this selector and open it again once.');return}lock=true;try{var ok=window.woodrickAddSelectedDesigns();if(!ok&&(!document.getElementById('wwStatus')||!/reading the actual design number/i.test(document.getElementById('wwStatus').textContent||'')))status('Please select at least one design first.');}catch(err){status('Could not add selected designs. Please try once more.')}setTimeout(function(){lock=false},300)}document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('#wwUsePick'):null;if(b)execute(e)},true);document.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&document.activeElement&&document.activeElement.id==='wwUsePick')execute(e)},true);var obs=new MutationObserver(function(){var b=document.getElementById('wwUsePick');if(b){b.type='button';b.setAttribute('role','button');b.setAttribute('tabindex','0');b.style.pointerEvents='auto';b.style.cursor='pointer'}});obs.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){var board=document.querySelector('.ww-board');if(!board||document.getElementById('wwSessionBar'))return;var bar=document.createElement('div');bar.id='wwSessionBar';bar.innerHTML='<span><b>AUTO-SAVED DESIGN SESSION</b><br>Refresh ke baad room, Mood Board aur assignments restore honge.</span><button id="wwNewDesign" type="button">START AGAIN / NEW DESIGN</button>';board.insertBefore(bar,board.firstChild);document.getElementById('wwNewDesign').onclick=function(){if(!confirm('Start a new design? Current room details and Mood Board selections will be cleared.'))return;try{localStorage.removeItem('woodrickDesignWorkspaceV1');sessionStorage.setItem('woodrickFreshDesignV2','1')}catch(_){}location.replace('/voice-design-assistant.html?new=1&fresh='+Date.now())};},700);});</script>`;
  html=html.replace('</head>',css+'</head>');
  html=html.includes('</body>')?html.replace('</body>',js+'</body>'):html+js;
  const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-picker-fix','v5-design-code-reader');return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
}

export default{async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname==='/api/catalogue-design-search'){if(ctx&&ctx.waitUntil)ctx.waitUntil(backfillDesignIndex(env,2));return searchDesign(request,env)}if(url.pathname==='/api/catalogue-design-code')return readCatalogueDesignCode(request,env);if(url.pathname==='/api/catalogue-locate-design')return locateCatalogueDesignCode(request,env);if(url.pathname==='/api/design-index-status'){let state={processed:0,designs:0,complete:false};try{const saved=await env.PRODUCT_MEDIA.get(backfillStateKey);if(saved)state={...state,...await saved.json()}}catch(_){}return json({ok:true,...state,queue:Array.isArray(state.queue)?state.queue.length:0})}if(request.method==='GET'&&(url.pathname==='/voice-design-assistant'||url.pathname==='/voice-design-assistant.html')&&ctx&&ctx.waitUntil)ctx.waitUntil(backfillDesignIndex(env,1));let response=await app.fetch(request,env,ctx);if(request.method==='GET')response=await enhance(response,url);return response;}};
