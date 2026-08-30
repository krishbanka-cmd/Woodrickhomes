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
  var searchMap={
    'UltraTech Cement':'UltraTech',
    'UltraTech Building Solutions':'UltraTech',
    'Birla Opus Paints':'Birla Opus',
    'Asian Paints':'Asian Paints',
    'Griham by Supreme':'Griham',
    'Varmora Tiles':'Varmora',
    'Senator':'Senator',
    'Thermax Steel':'Thermax',
    'CenturyPly':'CenturyPly',
    'Greenply':'Greenply',
    'Green HDHMR':'Green HDHMR',
    'Ristal Laminates':'Ristal',
    'Merino':'Merino',
    'Royale Touche':'Royale Touche',
    'Woodline':'Woodline',
    'MWUD':'MWUD',
    'Greenpanel':'Greenpanel',
    'Nilkamal':'Nilkamal',
    'Godrej Locks':'Godrej',
    'Hettich Hardware':'Hettich',
    'Ebco Hardware':'Ebco',
    'Philips Lighting':'Philips',
    'Supreme uPVC':'Supreme',
    'Birla Putty':'Birla',
    '550D Grade Steel':'550D'
  };
  function openLibrary(card){
    var name=(card.querySelector('.trusted-name')||{}).textContent||'';
    name=name.trim();
    var q=searchMap[name]||name;
    location.href='/woodrick-library.html?q='+encodeURIComponent(q);
  }
  document.querySelectorAll('.trusted-card').forEach(function(card){
    var name=(card.querySelector('.trusted-name')||{}).textContent||'';
    name=name.trim();
    if(!name)return;
    card.dataset.libraryBrand=searchMap[name]||name;
    card.setAttribute('role','link');
    card.setAttribute('tabindex','0');
    card.setAttribute('aria-label','View '+name+' designs and catalogues');
    card.addEventListener('click',function(){openLibrary(card)});
    card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openLibrary(card)}});
  });
})();
</script>`;

const libraryOcrEnhancement=`
<style id="woodrick-library-ocr-style">
.ocr-state{display:block;margin-top:7px;font-size:10px;color:#8a632f;font-weight:800}.ocr-state.working{color:#9a7430}.ocr-state.done{color:#2f6f3e}
</style>
<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
<script id="woodrick-library-ocr-script">
(function(){
  var cache=new Map(),busy=false,lastSrc='';
  function extract(text){
    var upper=String(text||'').toUpperCase().replace(/[|]/g,'I').replace(/\s+/g,' ');
    var raw=upper.match(/\b[A-Z]{1,6}[\s-]?\d{2,5}[A-Z]?\b/g)||[];
    var out=[];
    raw.forEach(function(x){
      var v=x.replace(/\s*[- ]\s*/g,' ').trim();
      if(/^PAGE\s?\d+$/i.test(v))return;
      if(/^ISO\s?\d+$/i.test(v))return;
      if(/^X\s?\d+$/i.test(v))return;
      if(!out.includes(v))out.push(v);
    });
    out.sort(function(a,b){var aw=/^WL\s?\d+/i.test(a)?0:1,bw=/^WL\s?\d+/i.test(b)?0:1;return aw-bw||a.localeCompare(b)});
    return out.slice(0,24);
  }
  function pageNumber(){var h=document.getElementById('viewerPage');var m=h&&h.textContent.match(/\d+/);return m?m[0]:''}
  function updatePageCard(page,designs){
    document.querySelectorAll('.page').forEach(function(card){
      var n=card.querySelector('.page-no');if(!n||n.textContent.trim()!=='PAGE '+page)return;
      var d=card.querySelector('.design-nos');if(d){d.classList.remove('muted');d.textContent=designs.length?'DESIGN: '+designs.join(' · '):'Design No. not found'}
    });
  }
  async function scanCurrent(){
    if(busy||!window.Tesseract)return;
    var viewer=document.getElementById('viewer'),img=document.getElementById('viewerImg'),out=document.getElementById('viewerDesigns');
    if(!viewer||!viewer.classList.contains('show')||!img||!img.src||!out)return;
    if(!/not detected/i.test(out.textContent))return;
    var src=img.src,page=pageNumber();
    if(cache.has(src)){var got=cache.get(src);out.textContent=got.length?'Design No.: '+got.join(' · '):'Design No. not found';updatePageCard(page,got);return}
    if(src===lastSrc&&busy)return;lastSrc=src;busy=true;
    out.textContent='Scanning design numbers from page image…';
    try{
      var result=await Tesseract.recognize(src,'eng',{logger:function(m){if(m.status==='recognizing text'&&out){out.textContent='Scanning design numbers… '+Math.round((m.progress||0)*100)+'%'}}});
      var designs=extract(result&&result.data&&result.data.text||'');
      cache.set(src,designs);
      out.textContent=designs.length?'Design No.: '+designs.join(' · '):'Design No. not found — enlarge page to verify';
      updatePageCard(page,designs);
    }catch(e){out.textContent='Design scan could not read this page';}
    finally{busy=false}
  }
  var observer=new MutationObserver(function(){setTimeout(scanCurrent,120)});
  var viewer=document.getElementById('viewer');if(viewer)observer.observe(viewer,{attributes:true,attributeFilter:['class']});
  document.addEventListener('click',function(e){if(e.target.closest('[data-page-open]'))setTimeout(scanCurrent,180)},true);
})();
</script>`;

function fresh(response,version){
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma','no-cache');
  headers.set('expires','0');
  if(version)headers.set('x-woodrick-version',version);
  headers.delete('content-length');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response=await app.fetch(request,env,ctx);
    if(request.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
      const type=response.headers.get('content-type')||'';
      if(type.includes('text/html')){
        let html=(await response.text()).split(oldCatalogue).join('/catalogues/');
        if(!html.includes('woodrick-brand-library-script')){
          html=html.includes('</body>')?html.replace('</body>',brandLibraryEnhancement+'\n</body>'):html+brandLibraryEnhancement;
        }
        const headers=new Headers(response.headers);
        headers.set('cache-control','no-store');
        headers.set('x-woodrick-version','brand-library-links-v1');
        headers.delete('content-length');
        return new Response(html,{status:response.status,statusText:response.statusText,headers});
      }
    }
    if(request.method==='GET'&&(url.pathname==='/woodrick-library.html'||url.pathname==='/woodrick-library')){
      const type=response.headers.get('content-type')||'';
      if(type.includes('text/html')){
        let html=await response.text();
        if(!html.includes('woodrick-library-ocr-script')){
          html=html.includes('</body>')?html.replace('</body>',libraryOcrEnhancement+'\n</body>'):html+libraryOcrEnhancement;
        }
        const headers=new Headers(response.headers);
        headers.set('cache-control','no-store');
        headers.set('x-woodrick-version','library-design-ocr-v1');
        headers.delete('content-length');
        return new Response(html,{status:response.status,statusText:response.statusText,headers});
      }
    }
    if(request.method==='GET'&&(url.pathname==='/3d-design-preview.html'||url.pathname==='/3d-design-preview'||url.pathname==='/auto-layout-result.html'||url.pathname==='/auto-layout-result')){
      response=fresh(response,'3d-ai-v3-project-sync');
    }
    return response;
  }
};
