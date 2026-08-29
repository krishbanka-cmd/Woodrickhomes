import app from './worker-voice-fix.js';

async function enhanceVoiceGreeting(response,url){
  if(url.pathname!=='/voice-design-assistant.html'&&url.pathname!=='/voice-design-assistant')return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('woodrick-greeting-v1')){
    const style=`<style id="woodrick-greeting-v1">#woodrickGreetingControl{display:flex;align-items:center;justify-content:center;gap:9px;margin:10px auto 0;font-size:11px;color:#d4c9b8}.woodrick-greeting-toggle{appearance:none;width:38px;height:21px;border-radius:999px;background:#5a5147;position:relative;cursor:pointer;vertical-align:middle;outline:none;border:1px solid #7a6c5c;transition:.2s}.woodrick-greeting-toggle:before{content:'';position:absolute;width:15px;height:15px;border-radius:50%;background:#fff;left:2px;top:2px;transition:.2s}.woodrick-greeting-toggle:checked{background:#f0c96b;border-color:#f0c96b}.woodrick-greeting-toggle:checked:before{transform:translateX(17px);background:#070707}.woodrick-greeting-state{color:#f0c96b;font-weight:900;min-width:20px}</style>`;
    const script=`<script id="woodrick-greeting-v1">window.addEventListener('DOMContentLoaded',function(){var mic=document.getElementById('mic'),label=document.getElementById('micLabel');if(!mic)return;var wrap=document.createElement('div');wrap.id='woodrickGreetingControl';wrap.innerHTML='<span>WELCOME GREETING</span><input class="woodrick-greeting-toggle" id="woodrickGreetingToggle" type="checkbox" aria-label="Welcome greeting on or off"><span class="woodrick-greeting-state" id="woodrickGreetingState"></span>';var anchor=label&&label.parentNode;if(anchor){var hint=anchor.querySelector('.hint');if(hint)anchor.insertBefore(wrap,hint);else anchor.appendChild(wrap)}var toggle=document.getElementById('woodrickGreetingToggle'),state=document.getElementById('woodrickGreetingState');var stored=localStorage.getItem('woodrickGreetingEnabled');toggle.checked=stored===null?true:stored==='1';function paint(){state.textContent=toggle.checked?'ON':'OFF'}paint();toggle.addEventListener('change',function(){localStorage.setItem('woodrickGreetingEnabled',toggle.checked?'1':'0');paint();});var greeted=false,bypass=false;var greeting='Woodrick Homes me apka swagat hai. Welcome to Woodrick Homes, your one stop destination to build your dream home.';mic.addEventListener('click',function(e){if(bypass){bypass=false;return}if(!toggle.checked||greeted||!('speechSynthesis'in window))return;e.preventDefault();e.stopImmediatePropagation();greeted=true;if(label)label.textContent='WELCOME TO WOODRICK HOMES';try{speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(greeting);u.lang='en-IN';u.rate=0.94;u.pitch=1;u.onend=function(){bypass=true;mic.click()};u.onerror=function(){bypass=true;mic.click()};speechSynthesis.speak(u)}catch(err){bypass=true;mic.click()}},true);});</script>`;
    html=html.replace('</head>',style+'</head>');
    html=html.includes('</body>')?html.replace('</body>',script+'</body>'):html+script;
  }
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control','no-store');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response=await app.fetch(request,env,ctx);
    if(request.method==='GET')response=await enhanceVoiceGreeting(response,url);
    return response;
  }
};
