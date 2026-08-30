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

const libraryDesignMapEnhancement=`
<style id="woodrick-library-design-map-style">
#viewerDesigns .sku-chip{display:inline-block;margin:5px 6px 0 0;padding:7px 9px;border:1px solid #f0c96b;border-radius:4px;color:#f0c96b;background:#17130c;font-size:15px;font-weight:900;letter-spacing:.04em}
#viewerDesigns .verified-label{display:block;margin-bottom:6px;color:#f0c96b;font-size:11px;font-weight:900;letter-spacing:.08em}
.design-nos.verified-designs{color:#7b5410;font-weight:900}
</style>
<script id="woodrick-library-design-map-script">
(function(){
  var verifiedMaps=[
    {brand:'woodline',category:'louvers',pages:{2:['WL-147','WL-150','WL-151','WL-152']}}
  ];
  function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
  function pageNo(el){var p=el&&el.querySelector('.page-no');var m=p&&p.textContent.match(/\d+/);return m?Number(m[0]):0}
  function cardInfo(card){
    var title=norm((card&&card.querySelector('h3')||{}).textContent||'');
    var meta=norm((card&&card.querySelector('.meta')||{}).textContent||'');
    return {title:title,meta:meta};
  }
  function findCodes(card,page){
    var info=cardInfo(card);
    for(var i=0;i<verifiedMaps.length;i++){
      var m=verifiedMaps[i];
      if(info.meta.indexOf(m.brand)<0||info.meta.indexOf(m.category)<0)continue;
      return (m.pages[page]||[]).slice();
    }
    return [];
  }
  function renderViewer(codes){
    var out=document.getElementById('viewerDesigns');if(!out||!codes.length)return;
    out.innerHTML='<span class="verified-label">VERIFIED DESIGN NOS</span>'+codes.map(function(c){return '<span class="sku-chip">'+c+'</span>'}).join('');
    var old=document.getElementById('rescanDesigns');if(old)old.remove();
  }
  function applyCards(){
    document.querySelectorAll('.card').forEach(function(card){
      card.querySelectorAll('.page').forEach(function(page){
        var codes=findCodes(card,pageNo(page));if(!codes.length)return;
        var d=page.querySelector('.design-nos');if(!d)return;
        d.classList.remove('muted');d.classList.add('verified-designs');d.textContent='DESIGN: '+codes.join(' · ');
        page.dataset.verifiedDesigns=codes.join(',');
      });
    });
  }
  document.addEventListener('click',function(e){
    var page=e.target.closest('[data-page-open]');if(!page)return;
    var card=page.closest('.card');var codes=findCodes(card,pageNo(page));if(codes.length)setTimeout(function(){renderViewer(codes)},180);
  },true);
  var catalogueRoot=document.getElementById('catalogues')||document.body;
  new MutationObserver(function(){applyCards()}).observe(catalogueRoot,{childList:true,subtree:true});
  var viewer=document.getElementById('viewer');if(viewer)new MutationObserver(function(){
    if(!viewer.classList.contains('show'))return;
    var pageText=(document.getElementById('viewerPage')||{}).textContent||'';var pm=pageText.match(/\d+/);if(!pm)return;
    var meta=norm((document.getElementById('viewerMeta')||{}).textContent||'');
    if(meta.indexOf('woodline')<0||meta.indexOf('louvers')<0)return;
    var page=Number(pm[0]);var codes=verifiedMaps[0].pages[page]||[];if(codes.length)setTimeout(function(){renderViewer(codes)},80);
  }).observe(viewer,{attributes:true,attributeFilter:['class']});
  applyCards();
  setTimeout(applyCards,500);
  setTimeout(applyCards,1500);
})();
</script>`;

function fresh(response,version){const headers=new Headers(response.headers);headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');headers.set('pragma','no-cache');headers.set('expires','0');if(version)headers.set('x-woodrick-version',version);headers.delete('content-length');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);let response=await app.fetch(request,env,ctx);
    if(request.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){const type=response.headers.get('content-type')||'';if(type.includes('text/html')){let html=(await response.text()).split(oldCatalogue).join('/catalogues/');if(!html.includes('woodrick-brand-library-script'))html=html.includes('</body>')?html.replace('</body>',brandLibraryEnhancement+'\n</body>'):html+brandLibraryEnhancement;const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-woodrick-version','brand-library-links-v1');headers.delete('content-length');return new Response(html,{status:response.status,statusText:response.statusText,headers})}}
    if(request.method==='GET'&&(url.pathname==='/woodrick-library.html'||url.pathname==='/woodrick-library')){const type=response.headers.get('content-type')||'';if(type.includes('text/html')){let html=await response.text();if(!html.includes('woodrick-library-design-map-script'))html=html.includes('</body>')?html.replace('</body>',libraryDesignMapEnhancement+'\n</body>'):html+libraryDesignMapEnhancement;const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-woodrick-version','library-design-map-v2');headers.delete('content-length');return new Response(html,{status:response.status,statusText:response.statusText,headers})}}
    if(request.method==='GET'&&(url.pathname==='/3d-design-preview.html'||url.pathname==='/3d-design-preview'||url.pathname==='/auto-layout-result.html'||url.pathname==='/auto-layout-result'))response=fresh(response,'3d-ai-v3-project-sync');
    return response;
  }
};
