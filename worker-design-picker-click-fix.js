import app from './worker-design-picker.js';

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

  if(html.includes('woodrick-moodboard-click-fix-v4'))return response;
  const css=`<style id="woodrick-moodboard-click-fix-v4">#wwExactPicker .ww-picker-actions{position:sticky;bottom:0;z-index:10080;background:#fff;padding:12px 0 4px;pointer-events:auto!important}#wwUsePick{position:relative;z-index:10081;pointer-events:auto!important;touch-action:manipulation;cursor:pointer!important;min-height:52px;display:block!important}#wwUsePick:active{transform:translateY(1px)}#wwSessionBar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0;padding:9px 11px;border:1px solid #d8c49a;border-radius:9px;background:#fffaf0;font-size:10px}#wwNewDesign{border:1px solid #111;background:#111;color:#f0c96b;padding:8px 10px;border-radius:7px;font-weight:900;cursor:pointer}</style>`;
  const js=`<script id="woodrick-moodboard-click-fix-v4">window.addEventListener('DOMContentLoaded',function(){var lock=false;function status(t){var s=document.getElementById('wwStatus');if(s)s.textContent=t}function execute(ev){if(lock)return;if(ev){ev.preventDefault();ev.stopPropagation()}if(typeof window.woodrickAddSelectedDesigns!=='function'){status('Mood Board action is still loading. Close this selector and open it again once.');return}lock=true;try{var ok=window.woodrickAddSelectedDesigns();if(!ok)status('Please select at least one design first.');}catch(err){status('Could not add selected designs. Please try once more.')}setTimeout(function(){lock=false},300)}document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('#wwUsePick'):null;if(b)execute(e)},true);document.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&document.activeElement&&document.activeElement.id==='wwUsePick')execute(e)},true);var obs=new MutationObserver(function(){var b=document.getElementById('wwUsePick');if(b){b.type='button';b.setAttribute('role','button');b.setAttribute('tabindex','0');b.style.pointerEvents='auto';b.style.cursor='pointer'}});obs.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){var board=document.querySelector('.ww-board');if(!board||document.getElementById('wwSessionBar'))return;var bar=document.createElement('div');bar.id='wwSessionBar';bar.innerHTML='<span><b>AUTO-SAVED DESIGN SESSION</b><br>Refresh ke baad room, Mood Board aur assignments restore honge.</span><button id="wwNewDesign" type="button">START AGAIN / NEW DESIGN</button>';board.insertBefore(bar,board.firstChild);document.getElementById('wwNewDesign').onclick=function(){if(!confirm('Start a new design? Current room details and Mood Board selections will be cleared.'))return;localStorage.removeItem('woodrickDesignWorkspaceV1');['room','length','width','height','style','openings','requirements'].forEach(function(id){var e=document.getElementById(id);if(e)e.value=''});location.reload()};},700);});</script>`;
  html=html.replace('</head>',css+'</head>');
  html=html.includes('</body>')?html.replace('</body>',js+'</body>'):html+js;
  const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-picker-fix','v4-session');return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
}

export default{async fetch(request,env,ctx){const url=new URL(request.url);let response=await app.fetch(request,env,ctx);if(request.method==='GET')response=await enhance(response,url);return response;}};