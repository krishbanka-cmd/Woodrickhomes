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
    if(request.method==='GET'&&(url.pathname==='/3d-design-preview.html'||url.pathname==='/3d-design-preview'||url.pathname==='/auto-layout-result.html'||url.pathname==='/auto-layout-result')){
      response=fresh(response,'3d-ai-v3-project-sync');
    }
    return response;
  }
};
