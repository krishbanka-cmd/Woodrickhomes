import app from './worker-voice-fix.js';

async function enhanceVoiceGreeting(response,url){
  if(url.pathname!=='/voice-design-assistant.html'&&url.pathname!=='/voice-design-assistant')return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('woodrick-greeting-v3')){
    const style=`<style id="woodrick-greeting-v3">#woodrickGreetingControl{display:flex;align-items:center;justify-content:center;gap:9px;margin:10px auto 0;font-size:11px;color:#d4c9b8}.woodrick-greeting-toggle{appearance:none;width:38px;height:21px;border-radius:999px;background:#5a5147;position:relative;cursor:pointer;vertical-align:middle;outline:none;border:1px solid #7a6c5c;transition:.2s}.woodrick-greeting-toggle:before{content:'';position:absolute;width:15px;height:15px;border-radius:50%;background:#fff;left:2px;top:2px;transition:.2s}.woodrick-greeting-toggle:checked{background:#f0c96b;border-color:#f0c96b}.woodrick-greeting-toggle:checked:before{transform:translateX(17px);background:#070707}.woodrick-greeting-state{color:#f0c96b;font-weight:900;min-width:20px}</style>`;
    const script=`<script id="woodrick-greeting-v3">window.addEventListener('DOMContentLoaded',function(){var mic=document.getElementById('mic'),label=document.getElementById('micLabel');if(!mic)return;var wrap=document.createElement('div');wrap.id='woodrickGreetingControl';wrap.innerHTML='<span>WELCOME GREETING</span><input class="woodrick-greeting-toggle" id="woodrickGreetingToggle" type="checkbox" aria-label="Welcome greeting on or off"><span class="woodrick-greeting-state" id="woodrickGreetingState"></span>';var anchor=label&&label.parentNode;if(anchor){var hint=anchor.querySelector('.hint');if(hint)anchor.insertBefore(wrap,hint);else anchor.appendChild(wrap)}var toggle=document.getElementById('woodrickGreetingToggle'),state=document.getElementById('woodrickGreetingState');var stored=localStorage.getItem('woodrickGreetingEnabled');toggle.checked=stored===null?true:stored==='1';function paint(){state.textContent=toggle.checked?'ON':'OFF'}paint();toggle.addEventListener('change',function(){localStorage.setItem('woodrickGreetingEnabled',toggle.checked?'1':'0');paint();});var greeted=false,bypass=false,currentUtterance=null;var greeting='Woodrick Homes me apka swagat hai. Welcome to Woodrick Homes, your one stop destination to build your dream home.';function continueToMic(){if(bypass)return;bypass=true;setTimeout(function(){mic.click()},80)}function femaleVoice(){var voices=speechSynthesis.getVoices();var femaleNames=/samantha|veena|rishi|karen|moira|tessa|zira|heera|female|woman|google.*(india|uk).*english/i;return voices.find(function(v){return /^en-IN$/i.test(v.lang)&&femaleNames.test(v.name)})||voices.find(function(v){return /^hi-IN$/i.test(v.lang)&&femaleNames.test(v.name)})||voices.find(function(v){return femaleNames.test(v.name)&&/^en/i.test(v.lang)})||voices.find(function(v){return /^en-IN$/i.test(v.lang)})||voices.find(function(v){return /^hi-IN$/i.test(v.lang)})||voices.find(function(v){return /^en/i.test(v.lang)})}function speakGreeting(){if(!('speechSynthesis'in window)){continueToMic();return}try{speechSynthesis.cancel();speechSynthesis.resume();currentUtterance=new SpeechSynthesisUtterance(greeting);currentUtterance.lang='en-IN';currentUtterance.rate=0.91;currentUtterance.pitch=1.08;var chosen=femaleVoice();if(chosen)currentUtterance.voice=chosen;var finished=false;function done(){if(finished)return;finished=true;currentUtterance=null;continueToMic()}currentUtterance.onend=done;currentUtterance.onerror=done;speechSynthesis.speak(currentUtterance);setTimeout(function(){if(!finished&&!speechSynthesis.speaking)done()},1200)}catch(err){continueToMic()}}if('speechSynthesis'in window)speechSynthesis.onvoiceschanged=function(){};mic.addEventListener('click',function(e){if(bypass){bypass=false;return}if(!toggle.checked||greeted)return;e.preventDefault();e.stopImmediatePropagation();greeted=true;if(label)label.textContent='WELCOME TO WOODRICK HOMES';speakGreeting()},true);});</script>`;
    html=html.replace('</head>',style+'</head>');
    html=html.includes('</body>')?html.replace('</body>',script+'</body>'):html+script;
  }
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma','no-cache');
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
