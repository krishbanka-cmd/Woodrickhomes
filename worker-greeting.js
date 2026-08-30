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
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('woodrick-greeting-v6')){
    const style=`<style id="woodrick-greeting-v6">#woodrickGreetingControl{display:flex;align-items:center;justify-content:center;gap:9px;margin:10px auto 0;font-size:11px;color:#d4c9b8}.woodrick-greeting-toggle{appearance:none;width:38px;height:21px;border-radius:999px;background:#5a5147;position:relative;cursor:pointer;vertical-align:middle;outline:none;border:1px solid #7a6c5c;transition:.2s}.woodrick-greeting-toggle:before{content:'';position:absolute;width:15px;height:15px;border-radius:50%;background:#fff;left:2px;top:2px;transition:.2s}.woodrick-greeting-toggle:checked{background:#f0c96b;border-color:#f0c96b}.woodrick-greeting-toggle:checked:before{transform:translateX(17px);background:#070707}.woodrick-greeting-state{color:#f0c96b;font-weight:900;min-width:20px}.woodrick-welcome-note{margin-top:6px;text-align:center;color:#b8ab98;font-size:10px;letter-spacing:.2px}</style>`;
    const script=`<script id="woodrick-greeting-v6">window.addEventListener('DOMContentLoaded',function(){var mic=document.getElementById('mic'),label=document.getElementById('micLabel');if(!mic)return;var wrap=document.createElement('div');wrap.id='woodrickGreetingControl';wrap.innerHTML='<span>WELCOME GREETING</span><input class="woodrick-greeting-toggle" id="woodrickGreetingToggle" type="checkbox" aria-label="Welcome greeting on or off"><span class="woodrick-greeting-state" id="woodrickGreetingState"></span>';var anchor=label&&label.parentNode;if(anchor){var hint=anchor.querySelector('.hint');if(hint)anchor.insertBefore(wrap,hint);else anchor.appendChild(wrap);var note=document.createElement('div');note.className='woodrick-welcome-note';note.id='woodrickWelcomeNote';anchor.insertBefore(note,wrap.nextSibling)}var toggle=document.getElementById('woodrickGreetingToggle'),state=document.getElementById('woodrickGreetingState'),note=document.getElementById('woodrickWelcomeNote');var stored=localStorage.getItem('woodrickGreetingEnabled');toggle.checked=stored===null?true:stored==='1';var greeted=false,playing=false,audio=new Audio('/api/welcome-greeting.mp3?v=6'),resumeMic=false,doneTimer=null;audio.preload='auto';try{audio.load()}catch(e){}function paint(){state.textContent=toggle.checked?'ON':'OFF';if(note)note.textContent=toggle.checked?(greeted?'Welcome played':'Tap once anywhere to hear your welcome'):'Welcome greeting is off'}paint();function finish(){if(!playing)return;playing=false;clearTimeout(doneTimer);if(note)note.textContent='Welcome complete';if(resumeMic){resumeMic=false;setTimeout(function(){mic.click()},100)}}function playGreeting(shouldResumeMic){if(!toggle.checked||greeted||playing)return false;greeted=true;playing=true;resumeMic=!!shouldResumeMic;if(label)label.textContent='WELCOME TO WOODRICK HOMES';if(note)note.textContent='Welcoming you to Woodrick Homes…';audio.currentTime=0;audio.onended=finish;audio.onerror=finish;doneTimer=setTimeout(finish,12000);try{var p=audio.play();if(p&&p.catch)p.catch(function(){finish()})}catch(e){finish()}return true}toggle.addEventListener('change',function(){localStorage.setItem('woodrickGreetingEnabled',toggle.checked?'1':'0');if(!toggle.checked&&playing){try{audio.pause()}catch(e){}playing=false;resumeMic=false;clearTimeout(doneTimer)}paint()});document.addEventListener('pointerdown',function(e){if(!toggle.checked||greeted||playing)return;var onMic=e.target===mic||mic.contains(e.target);if(onMic)return;playGreeting(false)},{capture:true,once:false});mic.addEventListener('click',function(e){if(!toggle.checked||greeted||playing)return;if(playGreeting(true)){e.preventDefault();e.stopImmediatePropagation()}},true)});</script>`;
    html=html.replace('</head>',style+'</head>');
    html=html.includes('</body>')?html.replace('</body>',script+'</body>'):html+script;
  }
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma','no-cache');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default{async fetch(request,env,ctx){const url=new URL(request.url);if(request.method==='GET'&&url.pathname==='/api/welcome-greeting.mp3')return aiGreeting(env);let response=await app.fetch(request,env,ctx);if(request.method==='GET')response=await enhanceVoiceGreeting(response,url);return response;}};