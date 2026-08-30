import app from './worker-project-sync.js';

const oldCatalogue='https://drive.google.com/drive/folders/1zf6WNeCcctv6Hm-zxAsyV6I1RVcqicj0';

const brandLibraryEnhancement=`
<style id="woodrick-brand-library-links">
.trusted-card[data-library-brand]{cursor:pointer;position:relative}
.trusted-card[data-library-brand]:focus-visible{outline:3px solid #f0c96b;outline-offset:3px}
.trusted-card[data-library-brand]::after{content:'VIEW DESIGNS →';font-size:10px;font-weight:900;letter-spacing:.08em;color:#8b5f16;margin-top:8px}
</style>
<script id="woodrick-brand-library-script">
(function(){
  var searchMap={'UltraTech Cement':'UltraTech','UltraTech Building Solutions':'UltraTech','Birla Opus Paints':'Birla Opus','Asian Paints':'Asian Paints','Griham by Supreme':'Griham','Varmora Tiles':'Varmora','Senator':'Senator','Thermax Steel':'Thermax','CenturyPly':'CenturyPly','Greenply':'Greenply','Green HDHMR':'Green HDHMR','Ristal Laminates':'Ristal','Merino':'Merino','Royale Touche':'Royale Touche','Woodline':'Woodline','MWUD':'MWUD','Greenpanel':'Greenpanel','Nilkamal':'Nilkamal','Godrej Locks':'Godrej','Hettich Hardware':'Hettich','Ebco Hardware':'Ebco','Philips Lighting':'Philips','Supreme uPVC':'Supreme','Birla Putty':'Birla','550D Grade Steel':'550D'};
  function openLibrary(card){var name=(card.querySelector('.trusted-name')||{}).textContent||'';name=name.trim();var q=searchMap[name]||name;location.href='/woodrick-library.html?q='+encodeURIComponent(q)}
  document.querySelectorAll('.trusted-card').forEach(function(card){var name=(card.querySelector('.trusted-name')||{}).textContent||'';name=name.trim();if(!name)return;card.dataset.libraryBrand=searchMap[name]||name;card.setAttribute('role','link');card.setAttribute('tabindex','0');card.setAttribute('aria-label','View '+name+' designs and catalogues');card.addEventListener('click',function(){openLibrary(card)});card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openLibrary(card)}})});
})();
</script>`;

const libraryOcrEnhancement=`
<style id="woodrick-library-ocr-style">
#viewerDesigns .sku-chip{display:inline-block;margin:4px 5px 0 0;padding:7px 9px;border:1px solid #f0c96b;border-radius:4px;color:#f0c96b;background:#17130c;font-size:15px;font-weight:900;letter-spacing:.04em}
#viewerDesigns .scan-state{display:block;font-size:12px;color:#d7c39b;font-weight:700;line-height:1.5}
</style>
<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
<script id="woodrick-library-ocr-script">
(function(){
  var cache=new Map(),running=new Set();
  function uniq(a){return a.filter(function(v,i){return v&&a.indexOf(v)===i})}
  function cleanCode(v){
    v=String(v||'').toUpperCase().replace(/[|]/g,'I').replace(/[^A-Z0-9]/g,'');
    v=v.replace(/^W[1I]/,'WL').replace(/^V[L1I]/,'WL').replace(/^WII/,'WL');
    var m=v.match(/^WL(\d{2,4})$/);if(m)return 'WL '+m[1];
    m=v.match(/^([A-Z]{2,6})(\d{2,5}[A-Z]?)$/);return m?m[1]+' '+m[2]:'';
  }
  function extract(text,woodline){
    var u=String(text||'').toUpperCase().replace(/[|]/g,'I');
    var out=[];
    var patterns=[/\bW\s*[L1I]\s*[-.:]?\s*\d{2,4}\b/g,/\bV\s*[L1I]\s*[-.:]?\s*\d{2,4}\b/g,/\bW\s*I\s*I\s*[-.:]?\s*\d{2,4}\b/g];
    patterns.forEach(function(re){(u.match(re)||[]).forEach(function(x){var c=cleanCode(x);if(c)out.push(c)})});
    if(woodline&&out.length)return uniq(out).sort(function(a,b){return parseInt(a.replace(/\D/g,''),10)-parseInt(b.replace(/\D/g,''),10)}).slice(0,30);
    (u.match(/\b[A-Z]{2,6}\s*[-.:]?\s*\d{2,5}[A-Z]?\b/g)||[]).forEach(function(x){var c=cleanCode(x);if(!c||/^PAGE /.test(c)||/^ISO /.test(c))return;out.push(c)});
    return uniq(out).slice(0,30);
  }
  function pageNumber(){var h=document.getElementById('viewerPage');var m=h&&h.textContent.match(/\d+/);return m?m[0]:''}
  function isWoodline(){var m=document.getElementById('viewerMeta');return !!(m&&/woodline/i.test(m.textContent))}
  function show(out,codes,msg){if(codes&&codes.length){out.innerHTML=codes.map(function(c){return '<span class="sku-chip">'+c+'</span>'}).join('')}else{out.innerHTML='<span class="scan-state">'+msg+'</span>'}}
  function updatePageCard(page,codes){document.querySelectorAll('.page').forEach(function(card){var n=card.querySelector('.page-no');if(!n||n.textContent.trim()!=='PAGE '+page)return;var d=card.querySelector('.design-nos');if(d){d.classList.toggle('muted',!codes.length);d.textContent=codes.length?'DESIGN: '+codes.join(' · '):'Design No. not found'}})}
  async function loadImage(src){var img=new Image();img.crossOrigin='anonymous';await new Promise(function(resolve,reject){img.onload=resolve;img.onerror=reject;img.src=src});return img}
  function cropCanvas(img,x,y,w,h,scale,threshold){
    var cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(w*scale));cv.height=Math.max(1,Math.round(h*scale));var cx=cv.getContext('2d',{willReadFrequently:true});cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';cx.drawImage(img,x,y,w,h,0,0,cv.width,cv.height);
    var id=cx.getImageData(0,0,cv.width,cv.height),d=id.data;for(var i=0;i<d.length;i+=4){var g=.299*d[i]+.587*d[i+1]+.114*d[i+2];if(threshold){var v=g>205?255:(g<100?0:Math.round((g-100)*255/105));d[i]=d[i+1]=d[i+2]=v}else{var c=(g-128)*1.55+128;c=Math.max(0,Math.min(255,c));d[i]=d[i+1]=d[i+2]=c}}cx.putImageData(id,0,0);return cv
  }
  async function recognize(input,out,label,woodline){var r=await Tesseract.recognize(input,'eng',{logger:function(m){if(m.status==='recognizing text')show(out,[],label+' '+Math.round((m.progress||0)*100)+'%')}});return extract(r&&r.data&&r.data.text||'',woodline)}
  async function segmentedScan(img,out,woodline){
    var W=img.naturalWidth,H=img.naturalHeight,all=[];
    var cols=3,rows=2;
    var left=.06,top=.18,right=.94,bottom=.88;
    var cellW=(right-left)*W/cols,cellH=(bottom-top)*H/rows;
    var jobs=[];
    for(var r=0;r<rows;r++)for(var c=0;c<cols;c++){
      var x=Math.max(0,(left*W+c*cellW)-cellW*.05),y=Math.max(0,(top*H+r*cellH)-cellH*.03),w=Math.min(W-x,cellW*1.10),h=Math.min(H-y,cellH*1.08);
      jobs.push([x,y,w,h]);
    }
    for(var i=0;i<jobs.length;i++){
      show(out,[],'Reading design label '+(i+1)+'/'+jobs.length+'…');
      var j=jobs[i],cv=cropCanvas(img,j[0],j[1],j[2],j[3],4.2,true);var got=await recognize(cv,out,'Label '+(i+1)+'/'+jobs.length+'…',woodline);all=all.concat(got);
    }
    return uniq(all);
  }
  async function scanCurrent(force){
    var viewer=document.getElementById('viewer'),imgEl=document.getElementById('viewerImg'),out=document.getElementById('viewerDesigns');if(!viewer||!viewer.classList.contains('show')||!imgEl||!imgEl.src||!out)return;
    if(!force&&!/not detected|not found|scanning|scan/i.test(out.textContent))return;
    var src=imgEl.src,page=pageNumber(),woodline=isWoodline();if(cache.has(src)){var cached=cache.get(src);show(out,cached,cached.length?'':'Design No. not found');updatePageCard(page,cached);return}
    if(running.has(src))return;running.add(src);show(out,[],'Scanning design numbers…');
    try{
      if(!window.Tesseract)throw new Error('OCR engine unavailable');
      var img=await loadImage(src);var codes=[];
      if(woodline)codes=await segmentedScan(img,out,true);
      if(!codes.length){var full=cropCanvas(img,0,0,img.naturalWidth,img.naturalHeight,Math.max(2.2,2600/Math.max(img.naturalWidth,1)),true);codes=await recognize(full,out,'Reading full page…',woodline)}
      cache.set(src,codes);show(out,codes,codes.length?'':'Design No. not found automatically. Please zoom page to verify.');updatePageCard(page,codes)
    }catch(e){show(out,[],'Design scan could not read this page. Please zoom page to verify.')}finally{running.delete(src)}
  }
  function addRescan(){var side=document.querySelector('.viewer-side');if(!side||document.getElementById('rescanDesigns'))return;var b=document.createElement('button');b.id='rescanDesigns';b.type='button';b.className='viewer-close';b.style.marginTop='8px';b.textContent='SCAN DESIGN NOS';b.addEventListener('click',function(){var img=document.getElementById('viewerImg');if(img)cache.delete(img.src);scanCurrent(true)});side.insertBefore(b,document.getElementById('viewerClose'))}
  addRescan();
  var viewer=document.getElementById('viewer');if(viewer)new MutationObserver(function(){setTimeout(function(){scanCurrent(false)},250)}).observe(viewer,{attributes:true,attributeFilter:['class']});
  document.addEventListener('click',function(e){if(e.target.closest('[data-page-open]'))setTimeout(function(){scanCurrent(false)},350)},true);
})();
</script>`;

function fresh(response,version){const headers=new Headers(response.headers);headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');headers.set('pragma','no-cache');headers.set('expires','0');if(version)headers.set('x-woodrick-version',version);headers.delete('content-length');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);let response=await app.fetch(request,env,ctx);
    if(request.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){const type=response.headers.get('content-type')||'';if(type.includes('text/html')){let html=(await response.text()).split(oldCatalogue).join('/catalogues/');if(!html.includes('woodrick-brand-library-script'))html=html.includes('</body>')?html.replace('</body>',brandLibraryEnhancement+'\n</body>'):html+brandLibraryEnhancement;const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-woodrick-version','brand-library-links-v1');headers.delete('content-length');return new Response(html,{status:response.status,statusText:response.statusText,headers})}}
    if(request.method==='GET'&&(url.pathname==='/woodrick-library.html'||url.pathname==='/woodrick-library')){const type=response.headers.get('content-type')||'';if(type.includes('text/html')){let html=await response.text();if(!html.includes('woodrick-library-ocr-script'))html=html.includes('</body>')?html.replace('</body>',libraryOcrEnhancement+'\n</body>'):html+libraryOcrEnhancement;const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-woodrick-version','library-design-ocr-v3');headers.delete('content-length');return new Response(html,{status:response.status,statusText:response.statusText,headers})}}
    if(request.method==='GET'&&(url.pathname==='/3d-design-preview.html'||url.pathname==='/3d-design-preview'||url.pathname==='/auto-layout-result.html'||url.pathname==='/auto-layout-result'))response=fresh(response,'3d-ai-v3-project-sync');
    return response;
  }
};
