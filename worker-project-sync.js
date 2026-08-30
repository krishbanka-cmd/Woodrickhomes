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
  // If fresh values already exist before session restore, never overwrite/attach an old Mood Board to them.
  html=html.replace(
    "var s=JSON.parse(raw);if(Array.isArray(s.exact))exact=s.exact.map(function(x){if(!Array.isArray(x.surfaces))x.surfaces=[];return x});var f=s.fields||{};Object.keys(f).forEach(function(id){var e=document.getElementById(id);if(e&&!e.value)e.value=f[id]||''})",
    "var s=JSON.parse(raw),f=s.fields||{},fresh=false;Object.keys(f).forEach(function(id){var e=document.getElementById(id),live=e?String(e.value||'').trim():'';if(live&&live!==String(f[id]||'').trim())fresh=true});if(fresh){exact=[];localStorage.removeItem(sessionKey);return}if(Array.isArray(s.exact))exact=s.exact.map(function(x){if(!Array.isArray(x.surfaces))x.surfaces=[];return x});Object.keys(f).forEach(function(id){var e=document.getElementById(id);if(e&&!e.value)e.value=f[id]||''})"
  );
  return html;
}

function layoutScript(){return `<script id="woodrick-project-layout-v1">(function(){function parse(s){try{return JSON.parse(s||'')}catch(_){return null}}function code(x){return String((x&&((x.designNo||x.sku)))||'').trim()}function mt(x){if(!x)return'';return [x.brand,x.category,code(x)?('Design No. '+code(x)):'',x.page?('Page '+x.page):''].filter(Boolean).join(' · ')}var q=new URLSearchParams(location.search),room=(q.get('roomType')||'Room').trim(),r=room.toLowerCase(),mapping=parse(q.get('materialMapping'))||{},requirements=q.get('requirements')||q.get('change')||'';var h=document.querySelector('.card h2');if(h)h.textContent='Suggested '+room+' Layout';var note=document.querySelector('.card .note');if(note)note.textContent='This layout follows the latest '+room+' brief, dimensions, openings and exact customer-approved material placements.';var zones=[document.querySelector('.zone.bed'),document.querySelector('.zone.wardrobe'),document.querySelector('.zone.tv'),document.querySelector('.zone.side')];if(/office|study|workspace/.test(r)){var names=['WORK DESK / WORKSTATION','OFFICE STORAGE / CABINETS','DISPLAY / FEATURE WALL','MEETING / VISITOR AREA'];zones.forEach(function(z,i){if(z)z.textContent=names[i]})}else if(/living|drawing|lounge/.test(r)){var names2=['SOFA / SEATING','STORAGE / CONSOLE','TV / MEDIA UNIT','SIDE / FEATURE AREA'];zones.forEach(function(z,i){if(z)z.textContent=names2[i]})}else if(/kitchen/.test(r)){var names3=['BASE + WALL CABINETS','TALL / PANTRY STORAGE','HOB / WORK ZONE','SINK / PREP ZONE'];zones.forEach(function(z,i){if(z)z.textContent=names3[i]})}var lines=[];Object.keys(mapping).forEach(function(s){var arr=Array.isArray(mapping[s])?mapping[s]:[mapping[s]];var vals=arr.map(mt).filter(Boolean);if(vals.length)lines.push(s+' → '+vals.join(' + '))});var m=document.getElementById('material');if(m)m.textContent=lines.length?lines.join(' | '):'No exact material placement selected';var req=document.getElementById('requirement');if(req)req.textContent=requirements||('Current '+room+' brief');})();<\/script>`}

function previewScript(){return `<script id="woodrick-project-preview-v1">(function(){function parse(s){try{return JSON.parse(s||'')}catch(_){return null}}function code(x){return String((x&&((x.designNo||x.sku)))||'').trim()}function mt(x){if(!x)return'';return [x.brand,x.category,code(x)?('Design No. '+code(x)):'',x.page?('Page '+x.page):''].filter(Boolean).join(' · ')}var q=new URLSearchParams(location.search),room=(q.get('roomType')||'Room').trim(),mapping=parse(q.get('materialMapping'))||{};var title=document.querySelector('.hero h1');if(title)title.textContent='Your '+room+' is ready for 3D design.';var list=document.getElementById('lockList');if(list){var rows=[];Object.keys(mapping).forEach(function(s){var arr=Array.isArray(mapping[s])?mapping[s]:[mapping[s]];var vals=arr.map(mt).filter(Boolean);if(vals.length)rows.push('<div><strong>'+s.replace(/[&<>]/g,'')+'</strong> → '+vals.join(' + ').replace(/[&<>]/g,'')+'</div>')});list.innerHTML=rows.join('')}var box=document.getElementById('locks');if(box&&Object.keys(mapping).length)box.style.display='block';})();<\/script>`}

async function patchHtml(response,url){
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(url.pathname==='/voice-design-assistant.html'||url.pathname==='/voice-design-assistant')html=patchVoiceWorkspace(html);
  if(url.pathname==='/auto-layout-result.html'||url.pathname==='/auto-layout-result')html=html.replace(/<\/body>/i,layoutScript()+'</body>');
  if(url.pathname==='/3d-design-preview.html'||url.pathname==='/3d-design-preview')html=html.replace(/<\/body>/i,previewScript()+'</body>');
  const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-project-sync','v1');
  return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
}

export default{async fetch(request,env,ctx){const url=new URL(request.url);if(request.method==='POST'&&url.pathname==='/api/ai-design')return normalizeAiRequest(request,env,ctx);let response=await app.fetch(request,env,ctx);if(request.method==='GET')response=await patchHtml(response,url);return response;}};
