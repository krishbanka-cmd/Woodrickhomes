import app from './worker-pdf-viewer.js';

async function enhanceVoice(response,url){
  if(url.pathname!=='/voice-design-assistant.html'&&url.pathname!=='/voice-design-assistant')return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('woodrick-voice-field-fix-v1')){
    const script=`<script id="woodrick-voice-field-fix-v1">window.addEventListener('DOMContentLoaded',function(){
      function text(){var h=document.getElementById('heard'),r=document.getElementById('requirements');return ((h&&h.textContent)||'')+' '+((r&&r.value)||'');}
      function fix(){var t=text().toLowerCase(),room=document.getElementById('room'),height=document.getElementById('height');
        if(room&&(!room.value||room.value==='Select')){
          var v='';
          if(/bedroom|bed room|बेडरूम/.test(t))v='Bedroom';
          else if(/living room|drawing room|लिविंग रूम|ड्राइंग रूम/.test(t))v='Living Room';
          else if(/kitchen|किचन/.test(t))v='Modular Kitchen';
          else if(/kids room|किड्स रूम/.test(t))v='Kids Room';
          else if(/home office/.test(t))v='Home Office';
          else if(/dining|डाइनिंग/.test(t))v='Dining Area';
          else if(/wardrobe|dressing/.test(t))v='Wardrobe / Dressing';
          else if(/bathroom|बाथरूम/.test(t))v='Bathroom';
          else if(/office|ऑफिस|दफ्तर/.test(t))v='Commercial / Office';
          else if(/\broom\b|रूम|कमरा|कमरे/.test(t))v='Other';
          if(v)room.value=v;
        }
        if(height&&!height.value){var m=t.match(/(?:height|हाइट|ऊंचाई|ऊँचाई|उंचाई)[^0-9०-९]{0,15}([0-9०-९]{1,2}(?:\.[0-9]+)?)/i);if(m)height.value=m[1].replace(/[०-९]/g,function(d){return '०१२३४५६७८९'.indexOf(d)});}
      }
      fix();
      var heard=document.getElementById('heard');if(heard)new MutationObserver(fix).observe(heard,{childList:true,subtree:true,characterData:true});
      var req=document.getElementById('requirements');if(req)req.addEventListener('input',fix);
      var btn=document.getElementById('continueBtn');if(btn)btn.addEventListener('click',function(){fix();var room=document.getElementById('room');if(room&&(!room.value||room.value==='Select')){alert('Please select Room / Space before continuing.');room.scrollIntoView({behavior:'smooth',block:'center'});room.focus();}},true);
    });</script>`;
    html=html.includes('</body>')?html.replace('</body>',script+'</body>'):html+script;
  }
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  const response=await app.fetch(request,env,ctx);
  if(request.method==='GET')return enhanceVoice(response,url);
  return response;
}};
