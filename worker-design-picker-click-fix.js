import app from './worker-design-picker.js';

async function enhance(response,url){
  if(url.pathname!=='/voice-design-assistant.html'&&url.pathname!=='/voice-design-assistant')return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  let html=await response.text();

  // Expose the picker closure action globally so the visible button can call the
  // real addAllTemp() function directly instead of depending on a fragile
  // copied onclick handler.
  html=html.replace(
    "document.getElementById('wwUsePick').onclick=addAllTemp;",
    "window.woodrickAddSelectedDesigns=addAllTemp;document.getElementById('wwUsePick').onclick=function(e){if(e){e.preventDefault();e.stopPropagation()}return window.woodrickAddSelectedDesigns()};"
  );

  if(html.includes('woodrick-moodboard-click-fix-v2'))return response;
  const css=`<style id="woodrick-moodboard-click-fix-v2">#wwExactPicker .ww-picker-actions{position:sticky;bottom:0;z-index:10080;background:#fff;padding:12px 0 4px;pointer-events:auto!important}#wwUsePick{position:relative;z-index:10081;pointer-events:auto!important;touch-action:manipulation;cursor:pointer!important;min-height:52px;display:block!important}#wwUsePick:active{transform:translateY(1px)}</style>`;
  const js=`<script id="woodrick-moodboard-click-fix-v2">window.addEventListener('DOMContentLoaded',function(){var lock=false;function status(t){var s=document.getElementById('wwStatus');if(s)s.textContent=t}function run(e){var b=e&&e.target&&e.target.closest?e.target.closest('#wwUsePick'):null;if(!b||lock)return;if(e){e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation()}if(typeof window.woodrickAddSelectedDesigns!=='function'){status('Mood Board action is loading. Please close this page selector and open it once again.');return}lock=true;try{var ok=window.woodrickAddSelectedDesigns();if(ok){var m=document.getElementById('wwExactPicker');if(m)m.classList.remove('open');status('Selected designs added to Mood Board.');}setTimeout(function(){lock=false},250)}catch(err){lock=false;status('Could not add selected designs. Please try again.')}}document.addEventListener('pointerdown',run,true);document.addEventListener('click',run,true);document.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&document.activeElement&&document.activeElement.id==='wwUsePick')run(e)},true);var obs=new MutationObserver(function(){var b=document.getElementById('wwUsePick');if(b){b.type='button';b.setAttribute('role','button');b.setAttribute('tabindex','0');b.style.pointerEvents='auto';b.style.cursor='pointer'}});obs.observe(document.documentElement,{childList:true,subtree:true});});</script>`;
  html=html.replace('</head>',css+'</head>');
  html=html.includes('</body>')?html.replace('</body>',js+'</body>'):html+js;
  const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-picker-fix','v2');return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
}

export default{async fetch(request,env,ctx){const url=new URL(request.url);let response=await app.fetch(request,env,ctx);if(request.method==='GET')response=await enhance(response,url);return response;}};