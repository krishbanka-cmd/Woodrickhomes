import app from './worker-design-picker.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

function toBase64(buffer){
  const bytes=new Uint8Array(buffer);let out='';const step=0x8000;
  for(let i=0;i<bytes.length;i+=step)out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+step,bytes.length)));
  return btoa(out);
}

async function readCatalogueDesignCode(request,env){
  try{
    if(request.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
    if(!env.OPENAI_API_KEY)return json({ok:false,error:'Design number reader is not configured.'},503);
    const body=await request.json();
    const src=String(body&&body.src||'');const x=Number(body&&body.x),y=Number(body&&body.y);
    if(!src||!Number.isFinite(x)||!Number.isFinite(y))return json({ok:false,error:'Missing catalogue selection.'},400);
    const pageUrl=new URL(src,new URL(request.url).origin),site=new URL(request.url);
    if(pageUrl.origin!==site.origin)return json({ok:false,error:'Only Woodrick catalogue images can be read.'},400);
    const imageResponse=await fetch(pageUrl.toString(),{headers:{accept:'image/*'}});
    if(!imageResponse.ok)return json({ok:false,error:'Catalogue page image could not be loaded.'},502);
    const type=(imageResponse.headers.get('content-type')||'image/jpeg').split(';')[0];
    if(!type.startsWith('image/'))return json({ok:false,error:'Catalogue page is not an image.'},422);
    const ab=await imageResponse.arrayBuffer();
    if(ab.byteLength>7*1024*1024)return json({ok:false,error:'Catalogue page image is too large to read.'},413);
    const dataUrl=`data:${type};base64,${toBase64(ab)}`;
    const px=Math.round(Math.max(0,Math.min(1,x))*100),py=Math.round(Math.max(0,Math.min(1,y))*100);
    const prompt=`You are reading a building-material catalogue page. The customer clicked a product/design located around ${px}% from the left and ${py}% from the top of this exact page image. Read the printed SKU / Design No. / product code that belongs to the clicked design. Codes may look like WL 141, WL-141, 141, WR 145, etc. Use the code actually printed nearest or clearly associated with that clicked design. Do not invent or infer a code. Ignore page number, dimensions, prices and unrelated numbers. Return ONLY JSON in this exact form: {"designNo":"WL 141"}. If the code is not clearly readable or cannot be confidently associated with the clicked design, return {"designNo":""}.`;
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:dataUrl,detail:'high'}}]}],temperature:0,max_tokens:60,response_format:{type:'json_object'}})});
    const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch(_){return json({ok:false,error:'Design number reader returned an unreadable response.'},502)}
    if(!r.ok)return json({ok:false,error:(d&&d.error&&d.error.message)||'Design number reader failed.'},502);
    const text=d&&d.choices&&d.choices[0]&&d.choices[0].message?d.choices[0].message.content:'';let parsed={};try{parsed=JSON.parse(text||'{}')}catch(_){}
    let code=String(parsed.designNo||'').trim().replace(/\s+/g,' ');
    if(code.length>40)code='';
    return json({ok:true,designNo:code});
  }catch(err){return json({ok:false,error:'Could not read actual design number.'},500)}
}

async function enhance(response,url){
  if(url.pathname!=='/voice-design-assistant.html'&&url.pathname!=='/voice-design-assistant')return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  let html=await response.text();

  // Keep the customer's room + Mood Board + surface mapping through refresh.
  // This code is injected inside the picker closure so it can safely restore `exact`.
  html=html.replace(
    "var exact=[],current=null,tempPoints=[],lastPoint=null,lastVoiceCommand='',surfaces=['TV Unit','Wardrobe','Back Wall','Dresser','Bed / Headboard'];",
    "var exact=[],current=null,tempPoints=[],lastPoint=null,lastVoiceCommand='',surfaces=['TV Unit','Wardrobe','Back Wall','Dresser','Bed / Headboard'],sessionKey='woodrickDesignWorkspaceV1';function saveSession(){try{var fields={};['room','length','width','height','style','openings','requirements'].forEach(function(id){var e=document.getElementById(id);if(e)fields[id]=e.value});localStorage.setItem(sessionKey,JSON.stringify({exact:exact,fields:fields,savedAt:Date.now()}))}catch(_){}}function restoreSession(){try{var raw=localStorage.getItem(sessionKey);if(!raw)return;var s=JSON.parse(raw);if(Array.isArray(s.exact))exact=s.exact.map(function(x){if(!Array.isArray(x.surfaces))x.surfaces=[];return x});var f=s.fields||{};Object.keys(f).forEach(function(id){var e=document.getElementById(id);if(e&&!e.value)e.value=f[id]||''})}catch(_){}}"
  );

  // Read the real printed SKU/design number from the selected point on the catalogue page.
  html=html.replace(
    "function near(a,b){return Math.abs(a.x-b.x)<.035&&Math.abs(a.y-b.y)<.035}",
    "function near(a,b){return Math.abs(a.x-b.x)<.035&&Math.abs(a.y-b.y)<.035}function resolvePoint(p){if(!current||!p)return;p.reading=true;status('Reading actual design number from catalogue…');fetch('/api/catalogue-design-code',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({src:current.src,x:p.x,y:p.y,page:current.page,brand:current.brand})}).then(function(r){return r.json()}).then(function(d){p.reading=false;p.designNo=d&&d.designNo?String(d.designNo).trim():'';if(p.designNo)status('Design No. '+p.designNo+' identified. Add selected designs to Mood Board.');else status('Design selected, but its printed design number was not clearly readable. Please click closer to the design/code and try again.');drawDots()}).catch(function(){p.reading=false;p.designNo='';status('Could not read the printed design number. Please click closer to the design/code and try again.')})}"
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
    "function addAllTemp(){if(!current||!tempPoints.length){status('First click one or more designs on the catalogue page.');return false}if(tempPoints.some(function(p){return p.reading})){status('Please wait a moment — Woodrick is reading the actual design number.');return false}"
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
    "setTimeout(function(){restoreSession();upgrade();render();['room','length','width','height','style','openings','requirements'].forEach(function(id){var e=document.getElementById(id);if(e)e.addEventListener('input',saveSession)});var create=document.getElementById('wwCreate');"
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

  if(html.includes('woodrick-moodboard-click-fix-v5'))return response;
  const css=`<style id="woodrick-moodboard-click-fix-v5">#wwExactPicker .ww-picker-actions{position:sticky;bottom:0;z-index:10080;background:#fff;padding:12px 0 4px;pointer-events:auto!important}#wwUsePick{position:relative;z-index:10081;pointer-events:auto!important;touch-action:manipulation;cursor:pointer!important;min-height:52px;display:block!important}#wwUsePick:active{transform:translateY(1px)}#wwSessionBar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0;padding:9px 11px;border:1px solid #d8c49a;border-radius:9px;background:#fffaf0;font-size:10px}#wwNewDesign{border:1px solid #111;background:#111;color:#f0c96b;padding:8px 10px;border-radius:7px;font-weight:900;cursor:pointer}</style>`;
  const js=`<script id="woodrick-moodboard-click-fix-v5">window.addEventListener('DOMContentLoaded',function(){var lock=false;function status(t){var s=document.getElementById('wwStatus');if(s)s.textContent=t}function execute(ev){if(lock)return;if(ev){ev.preventDefault();ev.stopPropagation()}if(typeof window.woodrickAddSelectedDesigns!=='function'){status('Mood Board action is still loading. Close this selector and open it again once.');return}lock=true;try{var ok=window.woodrickAddSelectedDesigns();if(!ok&&(!document.getElementById('wwStatus')||!/reading the actual design number/i.test(document.getElementById('wwStatus').textContent||'')))status('Please select at least one design first.');}catch(err){status('Could not add selected designs. Please try once more.')}setTimeout(function(){lock=false},300)}document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('#wwUsePick'):null;if(b)execute(e)},true);document.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&document.activeElement&&document.activeElement.id==='wwUsePick')execute(e)},true);var obs=new MutationObserver(function(){var b=document.getElementById('wwUsePick');if(b){b.type='button';b.setAttribute('role','button');b.setAttribute('tabindex','0');b.style.pointerEvents='auto';b.style.cursor='pointer'}});obs.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){var board=document.querySelector('.ww-board');if(!board||document.getElementById('wwSessionBar'))return;var bar=document.createElement('div');bar.id='wwSessionBar';bar.innerHTML='<span><b>AUTO-SAVED DESIGN SESSION</b><br>Refresh ke baad room, Mood Board aur assignments restore honge.</span><button id="wwNewDesign" type="button">START AGAIN / NEW DESIGN</button>';board.insertBefore(bar,board.firstChild);document.getElementById('wwNewDesign').onclick=function(){if(!confirm('Start a new design? Current room details and Mood Board selections will be cleared.'))return;localStorage.removeItem('woodrickDesignWorkspaceV1');['room','length','width','height','style','openings','requirements'].forEach(function(id){var e=document.getElementById(id);if(e)e.value=''});location.reload()};},700);});</script>`;
  html=html.replace('</head>',css+'</head>');
  html=html.includes('</body>')?html.replace('</body>',js+'</body>'):html+js;
  const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-picker-fix','v5-design-code-reader');return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
}

export default{async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname==='/api/catalogue-design-code')return readCatalogueDesignCode(request,env);let response=await app.fetch(request,env,ctx);if(request.method==='GET')response=await enhance(response,url);return response;}};