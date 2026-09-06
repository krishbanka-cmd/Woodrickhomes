import app from './worker-greeting.js';

function parseJson(v,fallback){try{const x=JSON.parse(String(v||''));return x==null?fallback:x}catch(_){return fallback}}
function codeOf(x){return String((x&&((x.designNo||x.sku)))||'').trim()}
function materialText(x){if(!x||typeof x!=='object')return'';const code=codeOf(x);return [x.brand,x.category,code?`Design No. ${code}`:'',x.page?`Page ${x.page}`:''].filter(Boolean).join(' · ')}

async function normalizeAiRequest(request,env,ctx){
  const fd=await request.formData();
  const mapping=parseJson(fd.get('materialMapping'),{});
  const selected=parseJson(fd.get('selectedMaterials'),[]);
  const roomType=String(fd.get('roomType')||'room').trim();
  const normalizedMapping={};
  const lockLines=[];
  Object.keys(mapping&&typeof mapping==='object'?mapping:{}).forEach(surface=>{
    const items=(Array.isArray(mapping[surface])?mapping[surface]:[mapping[surface]]).filter(Boolean);
    if(!items.length)return;
    const descriptions=items.map(materialText).filter(Boolean);
    if(!descriptions.length)return;
    lockLines.push(`${surface} => ${descriptions.join(' + ')}`);
    const first=items[0]||{};
    normalizedMapping[surface]={
      category:descriptions.join(' + '),
      brand:'Woodrick verified selection',
      catalogue:first.catalogue||'',
      page:first.page||'',
      sku:items.length===1?codeOf(first):''
    };
  });
  const normalizedSelected=Array.isArray(selected)?selected.map(x=>x&&typeof x==='object'?{...x,sku:codeOf(x)||x.sku||''}:x):[];
  fd.set('materialMapping',JSON.stringify(normalizedMapping));
  fd.set('selectedMaterials',JSON.stringify(normalizedSelected));
  const existingReference=String(fd.get('reference')||'').trim();
  const existingConcept=String(fd.get('concept')||'').trim();
  const roomRule=`SPACE TYPE LOCK: This project is a ${roomType}. Design it specifically as a ${roomType}. Do not silently turn it into a bedroom or another room type. Only include furniture/elements appropriate to the customer's current brief.`;
  const placementRule=lockLines.length?`EXACT CUSTOMER MATERIAL PLACEMENT: ${lockLines.join('; ')}. Every Design No./SKU must be used on the exact named surface/element and nowhere else unless the customer assigned it to more than one place. Do not substitute, approximate, recolour, invent, or move these materials.`:'No material placement is locked yet.';
  fd.set('reference',[existingReference,lockLines.length?`Verified placements: ${lockLines.join('; ')}`:''].filter(Boolean).join(' | '));
  fd.set('concept',[existingConcept,roomRule,placementRule,'Treat the latest brief in this request as authoritative; ignore any older-room assumptions. Produce the layout/sketch and final visual around the current dimensions, openings, requirements and verified Woodrick selections.'].filter(Boolean).join(' '));
  const headers=new Headers(request.headers);headers.delete('content-type');headers.delete('content-length');
  const next=new Request(request.url,{method:'POST',headers,body:fd});
  return app.fetch(next,env,ctx);
}

function patchVoiceWorkspace(html){
  // Keep every verified catalogue page available to brand/thickness search.
  html=html.replace(".slice(0,120),groups={}",",groups={}");
  // Explicit New Design entry points always start clean; an ordinary refresh still restores ongoing work.
  if(!html.includes('woodrick-new-design-reset-v2')){
    const reset=`<script id="woodrick-new-design-reset-v2">(function(){var q=new URLSearchParams(location.search),fresh=q.get('new')==='1',freshKey='woodrickFreshDesignV2';function forget(){try{localStorage.removeItem('woodrickDesignWorkspaceV1')}catch(_){}}function markFresh(){try{sessionStorage.setItem(freshKey,'1')}catch(_){}}if(fresh){forget();markFresh()}window.addEventListener('DOMContentLoaded',function(){var shouldClear=fresh;try{shouldClear=shouldClear||sessionStorage.getItem(freshKey)==='1'}catch(_){}if(shouldClear){forget();['room','sku','length','width','height','style','openings','requirements'].forEach(function(id){var e=document.getElementById(id);if(e){e.value='';e.classList.remove('invalid')}});var heard=document.getElementById('heard'),status=document.getElementById('status'),label=document.getElementById('micLabel');if(heard)heard.textContent='Tap the microphone and start speaking.';if(status){status.textContent='Fresh start ready. Tap the microphone and start speaking.';status.className='status'}if(label)label.textContent='TAP TO START';try{sessionStorage.removeItem(freshKey)}catch(_){}if(fresh)history.replaceState({},'',location.pathname+location.hash);setTimeout(function(){window.scrollTo(0,0)},0)}var b=document.getElementById('resetVoice');if(b)b.addEventListener('click',forget,true)})})();<\/script>`;
    html=html.replace('</head>',reset+'</head>');
  }
  // Add office-appropriate placement targets while keeping existing bedroom targets.
  html=html.replace(
    "surfaces=['TV Unit','Wardrobe','Back Wall','Dresser','Bed / Headboard']",
    "surfaces=['TV Unit','Wardrobe','Back Wall','Dresser','Bed / Headboard','Work Desk / Workstation','Office Storage / Cabinets','Meeting / Visitor Area','Reception / Side Wall']"
  );
  html=html.replace(
    "function surfaceFromVoice(t){if(/tv unit|\\btv\\b/.test(t))return'TV Unit';",
    "function surfaceFromVoice(t){if(/work desk|workstation|office desk|\\bdesk\\b/.test(t))return'Work Desk / Workstation';if(/office storage|storage cabinet|cabinets|cabinet/.test(t))return'Office Storage / Cabinets';if(/meeting area|visitor area|meeting wall|visitor wall/.test(t))return'Meeting / Visitor Area';if(/reception|side wall/.test(t))return'Reception / Side Wall';if(/tv unit|\\btv\\b/.test(t))return'TV Unit';"
  );
  // A changed room type or changed brief is a new project context: clear old Mood Board selections before saving the new brief.
  html=html.replace(
    "if(e)e.addEventListener('input',saveSession)",
    "if(e)e.addEventListener('input',function(){if(exact.length&&(id==='room'||id==='requirements')){var old='';try{var rr=localStorage.getItem(sessionKey);old=rr?((JSON.parse(rr).fields||{})[id]||''):''}catch(_){old=''}var nv=String(e.value||'').trim();if(String(old||'').trim()!==nv){exact=[];render();markCards();status('New room/requirement detected — old Mood Board cleared. Please select materials for this fresh brief.')}}saveSession()})"
  );
  // Restore the current in-progress session on an ordinary browser refresh. Explicit
  // New Design entry points are cleared earlier by woodrick-new-design-reset-v1.
  html=html.replace(
    "var s=JSON.parse(raw);if(Array.isArray(s.exact))exact=s.exact.map(function(x){if(!Array.isArray(x.surfaces))x.surfaces=[];return x});var f=s.fields||{};Object.keys(f).forEach(function(id){var e=document.getElementById(id);if(e&&!e.value)e.value=f[id]||''})",
    "var s=JSON.parse(raw),f=s.fields||{};if(Array.isArray(s.exact))exact=s.exact.map(function(x){if(!Array.isArray(x.surfaces))x.surfaces=[];return x});Object.keys(f).forEach(function(id){var e=document.getElementById(id);if(e)e.value=f[id]||''})"
  );
  // Keep the customer-facing library focused: search first, show at most five relevant pages.
  if(!html.includes('woodrick-library-search-v2')){
    const searchUi=`<style id="woodrick-library-search-v2">.ww-library-search{width:100%;margin:0 0 10px;padding:12px 13px;border:1px solid #cdbb9d;border-radius:9px;background:#fff;font:600 14px/1.3 Arial,sans-serif}.ww-library-search:focus{outline:2px solid #d2a64e;outline-offset:1px}.ww-design-result{display:none;margin:0 0 12px;padding:12px;border:2px solid #d2a64e;border-radius:10px;background:#fffaf0}.ww-design-result.show{display:flex;align-items:center;justify-content:space-between;gap:12px}.ww-design-result b{display:block;font-size:14px}.ww-design-result span{display:block;margin-top:3px;font-size:11px}.ww-design-result button{border:0;border-radius:8px;background:#111;color:#f0c96b;padding:10px 12px;font-weight:900;cursor:pointer;white-space:nowrap}</style><script id="woodrick-library-search-v2">window.addEventListener('DOMContentLoaded',function(){function install(){var cards=document.getElementById('wwCards'),filters=document.getElementById('wwFilters');if(!cards||!filters||document.getElementById('wwLibrarySearch'))return false;var input=document.createElement('input'),result=document.createElement('div');input.id='wwLibrarySearch';input.className='ww-library-search';input.type='search';input.placeholder='Search brand, category, catalogue, page or Design No.';input.setAttribute('aria-label','Search verified Woodrick designs');result.id='wwDesignSearchResult';result.className='ww-design-result';filters.parentNode.insertBefore(input,filters);filters.parentNode.insertBefore(result,filters);var busy=false,timer=0,requestNo=0;function exactLookup(q){clearTimeout(timer);result.className='ww-design-result';result.innerHTML='';if(!/[a-z]/i.test(q)||!/[0-9]/.test(q))return;timer=setTimeout(function(){var n=++requestNo;fetch('/api/catalogue-design-search?q='+encodeURIComponent(q),{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){if(n!==requestNo||!d||!d.found)return;var x=d.item;result.innerHTML='<div><b>Design No. '+String(x.designNo)+'</b><span>'+[x.brand,x.category,x.catalogue,'Page '+x.page].filter(Boolean).join(' · ')+'</span></div><button type="button">OPEN EXACT DESIGN</button>';result.className='ww-design-result show';result.querySelector('button').onclick=function(){if(typeof window.woodrickOpenIndexedDesign==='function')window.woodrickOpenIndexedDesign(x)};var status=document.getElementById('wwLibraryStatus');if(status)status.textContent='Exact verified design found with catalogue page and marker.'}).catch(function(){})},220)}function apply(){if(busy)return;busy=true;requestAnimationFrame(function(){var q=String(input.value||'').trim().toLowerCase(),shown=0,total=0;cards.querySelectorAll('.ww-card').forEach(function(card){var match=!q||String(card.innerText||'').toLowerCase().indexOf(q)>=0,show=match&&(!q||shown<5);if(match)total++;card.style.display=show?'':'none';if(show)shown++});cards.querySelectorAll('.ww-thickness-group,.ww-brand-group').forEach(function(group){group.style.display=group.querySelector('.ww-card:not([style*="display: none"])')?'':'none'});var status=document.getElementById('wwLibraryStatus');if(status)status.textContent=total?(q?(shown+' of '+total+' verified matches shown. Search the exact brand, page or Design No. to refine.'):(total+' verified catalogue pages. Scroll to browse all pages.')):'Searching verified Design No. index…';exactLookup(q);busy=false})}input.addEventListener('input',apply);new MutationObserver(apply).observe(cards,{childList:true,subtree:true});apply();return true}if(!install()){var tries=0,t=setInterval(function(){tries++;if(install()||tries>30)clearInterval(t)},200)}});<\/script>`;
    const restoreSignal=`<script id="woodrick-library-ready-v1">window.addEventListener('DOMContentLoaded',function(){var sent=false;function watch(){var cards=document.getElementById('wwCards');if(!cards)return false;function ready(){if(!sent&&cards.querySelector('.ww-card')){sent=true;document.dispatchEvent(new Event('woodrickLibraryReady'))}}new MutationObserver(ready).observe(cards,{childList:true,subtree:true});ready();return true}if(!watch()){var tries=0,t=setInterval(function(){tries++;if(watch()||tries>30)clearInterval(t)},200)}});<\/script>`;
    html=html.replace('</head>',searchUi+restoreSignal+'</head>');
  }
  if(!html.includes('woodrick-library-browse-all-v1')){
    const browseAll=`<script id="woodrick-library-browse-all-v1">window.addEventListener('DOMContentLoaded',function(){function install(){var input=document.getElementById('wwLibrarySearch'),cards=document.getElementById('wwCards');if(!input||!cards)return false;function showAll(){setTimeout(function(){var q=String(input.value||'').trim().toLowerCase(),shown=0;cards.querySelectorAll('.ww-card').forEach(function(card){var match=!q||String(card.innerText||'').toLowerCase().indexOf(q)>=0;card.style.display=match?'':'none';if(match)shown++});cards.querySelectorAll('.ww-thickness-group,.ww-brand-group').forEach(function(group){group.style.display=group.querySelector('.ww-card:not([style*="display: none"])')?'':'none'});var status=document.getElementById('wwLibraryStatus');if(status&&shown)status.textContent=shown+' verified catalogue page'+(shown===1?'':'s')+'. Scroll to browse all matching pages.'},0)}input.addEventListener('input',showAll);new MutationObserver(showAll).observe(cards,{childList:true,subtree:true});showAll();return true}if(!install()){var tries=0,t=setInterval(function(){tries++;if(install()||tries>30)clearInterval(t)},200)}});<\/script>`;
    html=html.replace('</head>',browseAll+'</head>');
  }
  if(!html.includes('woodrick-library-flex-search-v2')){
    const flexibleSearch=`<script id="woodrick-library-flex-search-v2">window.addEventListener('DOMContentLoaded',function(){function install(){var input=document.getElementById('wwLibrarySearch'),cards=document.getElementById('wwCards');if(!input||!cards)return false;function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'')}function search(){setTimeout(function(){var q=norm(input.value),shown=0;cards.querySelectorAll('.ww-card').forEach(function(card){var match=!q||norm(card.innerText).indexOf(q)>=0;card.style.display=match?'':'none';if(match)shown++});cards.querySelectorAll('.ww-thickness-group,.ww-brand-group').forEach(function(group){group.style.display=group.querySelector('.ww-card:not([style*="display: none"])')?'':'none'});var status=document.getElementById('wwLibraryStatus');if(status&&shown)status.textContent=shown+' matching catalogue page'+(shown===1?'':'s')+'. Scroll to browse all results.'},0)}input.addEventListener('input',search);new MutationObserver(search).observe(cards,{childList:true,subtree:true});search();return true}if(!install()){var tries=0,t=setInterval(function(){tries++;if(install()||tries>30)clearInterval(t)},200)}});<\/script>`;
    html=html.replace('</head>',flexibleSearch+'</head>');
  }
  if(!html.includes('woodrick-library-token-search-v3')){
    const tokenSearch=`<script id="woodrick-library-token-search-v3">window.addEventListener('DOMContentLoaded',function(){function install(){var input=document.getElementById('wwLibrarySearch'),cards=document.getElementById('wwCards');if(!input||!cards)return false;function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'')}function run(){setTimeout(function(){var raw=String(input.value||'').toLowerCase(),tokens=raw.split(/[^a-z0-9]+/).filter(function(x){return x&&x!=='0'}),shown=0;cards.querySelectorAll('.ww-card').forEach(function(card){var hay=norm(card.innerText),match=!tokens.length||tokens.every(function(token){return hay.indexOf(norm(token))>=0});card.style.display=match?'':'none';if(match)shown++});cards.querySelectorAll('.ww-thickness-group,.ww-brand-group').forEach(function(group){group.style.display=group.querySelector('.ww-card:not([style*="display: none"])')?'':'none'});var status=document.getElementById('wwLibraryStatus');if(status)status.textContent=shown?(shown+' matching catalogue page'+(shown===1?'':'s')+'. Scroll to browse all results.'):'No matching brand, thickness, catalogue, page or verified Design No. found.'},0)}input.addEventListener('input',run);new MutationObserver(run).observe(cards,{childList:true,subtree:true});run();return true}if(!install()){var tries=0,t=setInterval(function(){tries++;if(install()||tries>30)clearInterval(t)},200)}});<\/script>`;
    html=html.replace('</head>',tokenSearch+'</head>');
  }
  if(!html.includes('woodrick-library-search-final-v4')){
    const finalSearch=`<script id="woodrick-library-search-final-v4">window.addEventListener('DOMContentLoaded',function(){function install(){var input=document.getElementById('wwLibrarySearch'),cards=document.getElementById('wwCards');if(!input||!cards)return false;function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'')}function filter(){setTimeout(function(){var tokens=String(input.value||'').toLowerCase().split(/[^a-z0-9]+/).filter(function(x){return x&&x!=='0'}),shown=0;cards.querySelectorAll('.ww-card').forEach(function(card){var hay=norm(card.innerText),match=!tokens.length||tokens.every(function(t){return hay.indexOf(t)>=0});card.style.display=match?'':'none';if(match)shown++});cards.querySelectorAll('.ww-thickness-group,.ww-brand-group').forEach(function(group){group.style.display=group.querySelector('.ww-card:not([style*="display: none"])')?'':'none'});var status=document.getElementById('wwLibraryStatus');if(status)status.textContent=shown?(shown+' matching catalogue page'+(shown===1?'':'s')+'. Scroll to browse all results.'):'No matching brand, thickness, catalogue, page or verified Design No. found.'},80)}input.addEventListener('input',filter);new MutationObserver(filter).observe(cards,{childList:true,subtree:true});filter();return true}if(!install()){var tries=0,t=setInterval(function(){tries++;if(install()||tries>30)clearInterval(t)},200)}});<\/script>`;
    html=html.replace('</head>',finalSearch+'</head>');
  }
  return html;
}

function layoutScript(){return `<script id="woodrick-project-layout-v1">(function(){function parse(s){try{return JSON.parse(s||'')}catch(_){return null}}function code(x){return String((x&&((x.designNo||x.sku)))||'').trim()}function mt(x){if(!x)return'';return [x.brand,x.category,code(x)?('Design No. '+code(x)):'',x.page?('Page '+x.page):''].filter(Boolean).join(' · ')}var q=new URLSearchParams(location.search),room=(q.get('roomType')||'Room').trim(),r=room.toLowerCase(),mapping=parse(q.get('materialMapping'))||{},requirements=q.get('requirements')||q.get('change')||'';var h=document.querySelector('.card h2');if(h)h.textContent='Suggested '+room+' Layout';var note=document.querySelector('.card .note');if(note)note.textContent='This layout follows the latest '+room+' brief, dimensions, openings and exact customer-approved material placements.';var zones=[document.querySelector('.zone.bed'),document.querySelector('.zone.wardrobe'),document.querySelector('.zone.tv'),document.querySelector('.zone.side')];if(/office|study|workspace/.test(r)){var names=['WORK DESK / WORKSTATION','OFFICE STORAGE / CABINETS','DISPLAY / FEATURE WALL','MEETING / VISITOR AREA'];zones.forEach(function(z,i){if(z)z.textContent=names[i]})}else if(/living|drawing|lounge/.test(r)){var names2=['SOFA / SEATING','STORAGE / CONSOLE','TV / MEDIA UNIT','SIDE / FEATURE AREA'];zones.forEach(function(z,i){if(z)z.textContent=names2[i]})}else if(/kitchen/.test(r)){var names3=['BASE + WALL CABINETS','TALL / PANTRY STORAGE','HOB / WORK ZONE','SINK / PREP ZONE'];zones.forEach(function(z,i){if(z)z.textContent=names3[i]})}var lines=[];Object.keys(mapping).forEach(function(s){var arr=Array.isArray(mapping[s])?mapping[s]:[mapping[s]];var vals=arr.map(mt).filter(Boolean);if(vals.length)lines.push(s+' → '+vals.join(' + '))});var m=document.getElementById('material');if(m)m.textContent=lines.length?lines.join(' | '):'No exact material placement selected';var req=document.getElementById('requirement');if(req)req.textContent=requirements||('Current '+room+' brief');})();<\/script>`}

function previewScript(){return `<script id="woodrick-project-preview-v1">(function(){function parse(s){try{return JSON.parse(s||'')}catch(_){return null}}function code(x){return String((x&&((x.designNo||x.sku)))||'').trim()}function mt(x){if(!x)return'';return [x.brand,x.category,code(x)?('Design No. '+code(x)):'',x.page?('Page '+x.page):''].filter(Boolean).join(' · ')}var q=new URLSearchParams(location.search),room=(q.get('roomType')||'Room').trim(),mapping=parse(q.get('materialMapping'))||{};var title=document.querySelector('.hero h1');if(title)title.textContent='Your '+room+' is ready for 3D design.';var list=document.getElementById('lockList');if(list){var rows=[];Object.keys(mapping).forEach(function(s){var arr=Array.isArray(mapping[s])?mapping[s]:[mapping[s]];var vals=arr.map(mt).filter(Boolean);if(vals.length)rows.push('<div><strong>'+s.replace(/[&<>]/g,'')+'</strong> → '+vals.join(' + ').replace(/[&<>]/g,'')+'</div>')});list.innerHTML=rows.join('')}var box=document.getElementById('locks');if(box&&Object.keys(mapping).length)box.style.display='block';})();<\/script>`}

function autoSummaryScript(){return `<script id="woodrick-auto-summary-v1">(function(){function parse(s){try{return JSON.parse(s||'')}catch(_){return null}}function code(x){return String((x&&((x.designNo||x.sku)))||'').trim()}var q=new URLSearchParams(location.search),items=parse(q.get('selectedMaterials'))||[];if(!Array.isArray(items)||!items.length)return;var names=items.map(function(x){return [x.brand,x.category,x.catalogue,code(x)?('Design No. '+code(x)):'',x.page?('Page '+x.page):''].filter(Boolean).join(' · ')}).filter(Boolean),values=document.querySelectorAll('#summary .value');if(values[3]&&names.length)values[3].textContent=names.join(' + ');})();<\/script>`}

async function patchHtml(response,url){
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(url.pathname==='/voice-design-assistant.html'||url.pathname==='/voice-design-assistant')html=patchVoiceWorkspace(html);
  if(url.pathname==='/auto-layout.html'||url.pathname==='/auto-layout')html=html.replace(/<\/body>/i,autoSummaryScript()+'</body>');
  if(url.pathname==='/auto-layout-result.html'||url.pathname==='/auto-layout-result')html=html.replace(/<\/body>/i,layoutScript()+'</body>');
  if(url.pathname==='/3d-design-preview.html'||url.pathname==='/3d-design-preview')html=html.replace(/<\/body>/i,previewScript()+'</body>');
  const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-project-sync','v1');
  return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
}

export default{async fetch(request,env,ctx){const url=new URL(request.url);if(request.method==='POST'&&url.pathname==='/api/ai-design')return normalizeAiRequest(request,env,ctx);let response=await app.fetch(request,env,ctx);if(request.method==='GET')response=await patchHtml(response,url);return response;}};
