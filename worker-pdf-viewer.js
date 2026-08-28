import base from './worker-library.js';

function htmlEsc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function pdfViewer(key,obj){
  const meta=obj.customMetadata||{};
  const title=meta.catalogue||meta.title||meta.originalName||'Catalogue';
  const raw=`/api/media?raw=1&key=${encodeURIComponent(key)}`;
  const download=`/api/media?download=1&key=${encodeURIComponent(key)}`;
  const body=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEsc(title)} | Woodrick Homes</title><style>*{box-sizing:border-box}html,body{margin:0;height:100%;background:#090909;color:#fff;font-family:Arial,sans-serif}.top{height:58px;background:#050505;border-bottom:2px solid #f0c96b;display:flex;align-items:center;gap:12px;padding:8px 14px;position:sticky;top:0;z-index:10}.back,.download{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border:1px solid #f0c96b;color:#f0c96b;text-decoration:none;font-weight:900;font-size:12px;white-space:nowrap}.download{margin-left:auto;background:#f0c96b;color:#111}.title{font-family:Georgia,serif;font-size:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.frame{width:100%;height:calc(100vh - 58px);border:0;background:#fff}@media(max-width:620px){.top{height:auto;min-height:58px;flex-wrap:wrap}.title{order:-1;flex-basis:100%;text-align:center}.frame{height:calc(100vh - 100px)}}</style></head><body><div class="top"><a class="back" href="/products/#media">← BACK</a><div class="title">${htmlEsc(title)}</div><a class="download" href="${download}">DOWNLOAD CATALOGUE</a></div><iframe class="frame" src="${raw}" title="${htmlEsc(title)} PDF"></iframe></body></html>`;
  return new Response(body,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}

async function enhanceVoiceAssistant(response,url){
  if(url.pathname!=='/voice-design-assistant.html'&&url.pathname!=='/voice-design-assistant')return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('id="resetVoice"')){
    html=html.replace('<div class="actions"><button class="btn secondary" id="speakBack" type="button">', '<div class="actions"><button class="btn secondary" id="resetVoice" type="button">↻ START AGAIN / REFRESH</button><button class="btn secondary" id="speakBack" type="button">');
    const resetScript=`<script>window.addEventListener('DOMContentLoaded',function(){var b=document.getElementById('resetVoice');if(!b)return;b.addEventListener('click',function(){var hasData=['heard','room','sku','length','width','height','style','openings','requirements'].some(function(id){var e=document.getElementById(id);if(!e)return false;var v=('value'in e?e.value:e.textContent)||'';return v&&v!=='Select'&&!/^Example:/i.test(v)&&v!=='Listening…';});if(!hasData||confirm('Start again? Current voice details will be cleared.'))location.href='/voice-design-assistant.html';});});</script>`;
    html=html.includes('</body>')?html.replace('</body>',resetScript+'</body>'):html+resetScript;
  }
  if(!html.includes('woodrick-confirm-step-v1')){
    const confirmScript=`<script id="woodrick-confirm-step-v1">window.addEventListener('DOMContentLoaded',function(){var b=document.getElementById('continueBtn');if(!b)return;var q=new URLSearchParams(location.search);['room','sku','length','width','height','style','openings','requirements'].forEach(function(id){var e=document.getElementById(id),key=id==='room'?'roomType':id==='sku'?'reference':id==='requirements'?'change':id;if(e&&q.get(key)&&(!e.value||e.value==='Select'))e.value=q.get(key);});b.onclick=null;b.addEventListener('click',function(){var room=document.getElementById('room').value.trim(),length=document.getElementById('length').value.trim(),width=document.getElementById('width').value.trim(),height=document.getElementById('height').value.trim();var bad=[];if(!room)bad.push('Room / Space');if(!length)bad.push('Length');if(!width)bad.push('Width');[['Length',length],['Width',width],['Height',height]].forEach(function(x){if(x[1]){var n=Number(x[1]);if(!isFinite(n)||n<=0||n>60)bad.push(x[0]+' looks incorrect');}});if(bad.length){if(typeof setStatus==='function')setStatus('Please correct before continuing: '+bad.join(', ')+'.','warn');else alert('Please correct: '+bad.join(', '));return;}var p=new URLSearchParams();[['roomType','room'],['length','length'],['width','width'],['height','height'],['openings','openings'],['style','style'],['reference','sku'],['change','requirements']].forEach(function(a){var e=document.getElementById(a[1]);if(e&&e.value.trim())p.set(a[0],e.value.trim());});p.set('voice','1');location.href='/design-requirements-confirmed.html?'+p.toString();});});</script>`;
    html=html.includes('</body>')?html.replace('</body>',confirmScript+'</body>'):html+confirmScript;
  }
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function enhanceDesignPage(response,url){
  if(url.pathname!=='/design-your-space.html'&&url.pathname!=='/design-your-space')return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('woodrick-confirmed-prefill-v1')){
    const script=`<script id="woodrick-confirmed-prefill-v1">window.addEventListener('DOMContentLoaded',function(){var q=new URLSearchParams(location.search);if(q.get('confirmed')!=='1')return;var form=document.getElementById('spaceForm');if(!form)return;var map={roomType:'roomType',length:'length',width:'width',height:'height',openings:'openings',style:'style',change:'change'};Object.keys(map).forEach(function(k){var e=form.elements[map[k]];if(e&&q.get(k))e.value=q.get(k);});var ref=q.get('reference');var mode=q.get('selectionMode')||'auto';var note=document.createElement('div');note.style.cssText='margin:0 0 20px;padding:14px 16px;background:#fff8e8;border-left:3px solid #c59a58;color:#5d472f;font-size:13px;line-height:1.55';note.innerHTML=mode==='manual'?'<b>SELECT MYSELF MODE</b><br>Your confirmed room details are filled below. Please choose a Woodrick catalogue/material reference yourself before generating the space plan.':'<b>AI AUTO SELECT MODE</b><br>Your confirmed room details are filled below. Woodrick will continue with its recommended material/design direction; you can still review or change the catalogue reference before generation.';form.insertBefore(note,form.firstChild.nextSibling);if(ref){var refNote=document.createElement('div');refNote.style.cssText='margin:8px 0 0;font-size:12px;color:#6b5a4d';refNote.textContent='Voice reference / SKU: '+ref;note.appendChild(refNote);}if(mode==='manual'){var cat=document.getElementById('catalogueRef');if(cat)setTimeout(function(){cat.scrollIntoView({behavior:'smooth',block:'center'});cat.style.outline='2px solid #c59a58';setTimeout(function(){cat.style.outline=''},2500)},500);}});</script>`;
    html=html.includes('</body>')?html.replace('</body>',script+'</body>'):html+script;
  }
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/api/media'&&request.method==='GET'){
    const key=url.searchParams.get('key');
    if(key&&url.searchParams.get('raw')!=='1'&&url.searchParams.get('download')!=='1'){
      const fetchDest=(request.headers.get('sec-fetch-dest')||'').toLowerCase();
      const fetchMode=(request.headers.get('sec-fetch-mode')||'').toLowerCase();
      const explicit=url.searchParams.get('pdfviewer')==='1';
      const topLevel=fetchDest==='document'||(fetchMode==='navigate'&&fetchDest!=='iframe');
      if(explicit||topLevel){
        const obj=await env.PRODUCT_MEDIA.get(key);
        const contentType=(obj&&obj.httpMetadata&&obj.httpMetadata.contentType)||'';
        if(obj&&(contentType==='application/pdf'||/\.pdf$/i.test(key)))return pdfViewer(key,obj);
      }
    }
  }
  const response=await base.fetch(request,env,ctx);
  if(request.method==='GET'){
    const voice=await enhanceVoiceAssistant(response,url);
    if(voice!==response)return voice;
    return enhanceDesignPage(response,url);
  }
  return response;
}};
