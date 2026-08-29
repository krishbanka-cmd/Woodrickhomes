import app from './worker-design-picker.js';

async function enhance(response,url){
  if(url.pathname!=='/voice-design-assistant.html'&&url.pathname!=='/voice-design-assistant')return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  let html=await response.text();

  // Patch the real picker action itself. When one or more designs are added,
  // close the selector immediately and return the customer to the Mood Board.
  html=html.replace(
    "render();markCards();status(added+' selected design'+(added===1?'':'s')+' added to Mood Board from Page '+current.page+'.');return added>0}",
    "render();markCards();var ok=added>0;if(ok){var picker=document.getElementById('wwExactPicker');if(picker)picker.classList.remove('open');tempPoints=[];lastPoint=null;status(added+' selected design'+(added===1?'':'s')+' added to Mood Board. You can now assign them to TV Unit, Wardrobe, Back Wall, Dresser or Headboard.');var tray=document.getElementById('wwExactTray');if(tray)setTimeout(function(){tray.scrollIntoView({behavior:'smooth',block:'center'})},80)}return ok}"
  );

  // Expose the same real action globally for click, touch and voice fallbacks.
  html=html.replace(
    "document.getElementById('wwUsePick').onclick=addAllTemp;",
    "window.woodrickAddSelectedDesigns=addAllTemp;document.getElementById('wwUsePick').onclick=function(e){if(e){e.preventDefault();e.stopPropagation()}return addAllTemp()};"
  );

  if(html.includes('woodrick-moodboard-click-fix-v3'))return response;
  const css=`<style id="woodrick-moodboard-click-fix-v3">#wwExactPicker .ww-picker-actions{position:sticky;bottom:0;z-index:10080;background:#fff;padding:12px 0 4px;pointer-events:auto!important}#wwUsePick{position:relative;z-index:10081;pointer-events:auto!important;touch-action:manipulation;cursor:pointer!important;min-height:52px;display:block!important}#wwUsePick:active{transform:translateY(1px)}</style>`;
  const js=`<script id="woodrick-moodboard-click-fix-v3">window.addEventListener('DOMContentLoaded',function(){var lock=false;function status(t){var s=document.getElementById('wwStatus');if(s)s.textContent=t}function execute(ev){if(lock)return;if(ev){ev.preventDefault();ev.stopPropagation()}if(typeof window.woodrickAddSelectedDesigns!=='function'){status('Mood Board action is still loading. Close this selector and open it again once.');return}lock=true;try{var ok=window.woodrickAddSelectedDesigns();if(!ok)status('Please select at least one design first.');}catch(err){status('Could not add selected designs. Please try once more.')}setTimeout(function(){lock=false},300)}document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('#wwUsePick'):null;if(b)execute(e)},true);document.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&document.activeElement&&document.activeElement.id==='wwUsePick')execute(e)},true);var obs=new MutationObserver(function(){var b=document.getElementById('wwUsePick');if(b){b.type='button';b.setAttribute('role','button');b.setAttribute('tabindex','0');b.style.pointerEvents='auto';b.style.cursor='pointer'}});obs.observe(document.documentElement,{childList:true,subtree:true});});</script>`;
  html=html.replace('</head>',css+'</head>');
  html=html.includes('</body>')?html.replace('</body>',js+'</body>'):html+js;
  const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-picker-fix','v3');return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
}

export default{async fetch(request,env,ctx){const url=new URL(request.url);let response=await app.fetch(request,env,ctx);if(request.method==='GET')response=await enhance(response,url);return response;}};