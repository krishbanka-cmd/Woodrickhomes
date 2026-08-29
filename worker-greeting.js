import app from './worker-design-picker-click-fix.js';

const GREETING='Woodrick Homes में आपका स्वागत है। Welcome to Woodrick Homes. Your one stop destination to build your dream home.';

async function aiGreeting(env){
  if(!env.OPENAI_API_KEY)return new Response('Voice service unavailable',{status:503});
  const r=await fetch('https://api.openai.com/v1/audio/speech',{
    method:'POST',
    headers:{'authorization':`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},
    body:JSON.stringify({model:'gpt-4o-mini-tts',voice:'shimmer',input:GREETING,instructions:'Speak as a warm, polished, welcoming Indian female customer-care host. Natural human delivery, elegant and premium, not robotic. Pronounce the Hindi phrase आपका स्वागत है clearly and naturally. Keep Woodrick Homes clear. Use a gentle smile in the voice, medium-slow pace, with a short natural pause before the English sentence.',response_format:'mp3'})
  });
  if(!r.ok)return new Response('Voice generation failed',{status:502});
  return new Response(r.body,{headers:{'content-type':'audio/mpeg','cache-control':'public, max-age=86400'}});
}

async function enhanceVoiceGreeting(response,url){
  if(url.pathname!=='/voice-design-assistant.html'&&url.pathname!=='/voice-design-assistant')return response;
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('woodrick-greeting-v5')){
    const style=`<style id="woodrick-greeting-v5">#woodrickGreetingControl{display:flex;align-items:center;justify-content:center;gap:9px;margin:10px auto 0;font-size:11px;color:#d4c9b8}.woodrick-greeting-toggle{appearance:none;width:38px;height:21px;border-radius:999px;background:#5a5147;position:relative;cursor:pointer;vertical-align:middle;outline:none;border:1px solid #7a6c5c;transition:.2s}.woodrick-greeting-toggle:before{content:'';position:absolute;width:15px;height:15px;border-radius:50%;background:#fff;left:2px;top:2px;transition:.2s}.woodrick-greeting-toggle:checked{background:#f0c96b;border-color:#f0c96b}.woodrick-greeting-toggle:checked:before{transform:translateX(17px);background:#070707}.woodrick-greeting-state{color:#f0c96b;font-weight:900;min-width:20px}</style>`;
    const script=`<script id="woodrick-greeting-v5">window.addEventListener('DOMContentLoaded',function(){var mic=document.getElementById('mic'),label=document.getElementById('micLabel');if(!mic)return;var wrap=document.createElement('div');wrap.id='woodrickGreetingControl';wrap.innerHTML='<span>WELCOME GREETING</span><input class="woodrick-greeting-toggle" id="woodrickGreetingToggle" type="checkbox" aria-label="Welcome greeting on or off"><span class="woodrick-greeting-state" id="woodrickGreetingState"></span>';var anchor=label&&label.parentNode;if(anchor){var hint=anchor.querySelector('.hint');if(hint)anchor.insertBefore(wrap,hint);else anchor.appendChild(wrap)}var toggle=document.getElementById('woodrickGreetingToggle'),state=document.getElementById('woodrickGreetingState');var stored=localStorage.getItem('woodrickGreetingEnabled');toggle.checked=stored===null?true:stored==='1';function paint(){state.textContent=toggle.checked?'ON':'OFF'}paint();toggle.addEventListener('change',function(){localStorage.setItem('woodrickGreetingEnabled',toggle.checked?'1':'0');paint()});var greeted=false,bypass=false,audio=null;function continueToMic(){if(bypass)return;bypass=true;setTimeout(function(){mic.click()},120)}function playGreeting(){try{audio=new Audio('/api/welcome-greeting.mp3?v=5');audio.preload='auto';audio.onended=continueToMic;audio.onerror=continueToMic;var p=audio.play();if(p&&p.catch)p.catch(continueToMic)}catch(e){continueToMic()}}mic.addEventListener('click',function(e){if(bypass){bypass=false;return}if(!toggle.checked||greeted)return;e.preventDefault();e.stopImmediatePropagation();greeted=true;if(label)label.textContent='WELCOME TO WOODRICK HOMES';playGreeting()},true)});</script>`;
    html=html.replace('</head>',style+'</head>');html=html.includes('</body>')?html.replace('</body>',script+'</body>'):html+script;
  }
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');headers.set('pragma','no-cache');return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default{async fetch(request,env,ctx){const url=new URL(request.url);if(request.method==='GET'&&url.pathname==='/api/welcome-greeting.mp3')return aiGreeting(env);let response=await app.fetch(request,env,ctx);if(request.method==='GET')response=await enhanceVoiceGreeting(response,url);return response;}};