import app from './worker-admin-media-refresh-stable.js';

const patch = `<script id="woodrick-admin-media-hybrid-v1">(function(){
function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function status(msg,isError){var s=document.getElementById('status');if(!s)return;s.textContent=msg;s.className='status show'+(isError?' error':'')}
async function loadHybrid(){
  var list=document.getElementById('mediaList'),btn=document.getElementById('refreshBtn');
  if(!list)return;
  if(btn){btn.disabled=true;btn.textContent='REFRESHING…'}
  list.innerHTML='<div class="item hybrid-loading">Loading product media…</div>';
  try{
    var r=await fetch('/api/admin-media-list?_='+Date.now(),{cache:'no-store',credentials:'same-origin',headers:{'cache-control':'no-cache'}});
    var d=await r.json().catch(function(){return{}});
    if(!r.ok)throw new Error(d.error||('Refresh failed ('+r.status+')'));
    var a=Array.isArray(d.items)?d.items:[];
    list.innerHTML=a.length?a.map(function(x){
      var isLib=String(x.librarySource||'')==='1';
      var source=isLib?'LIBRARY':'DIRECT UPLOAD';
      var action=isLib
        ? '<a class="hybrid-library-btn" href="/admin-products/#library">MANAGE IN LIBRARY</a>'
        : '<button type="button" class="hybrid-delete-btn" data-key="'+esc(x.key)+'" data-title="'+esc(x.title||x.key)+'">DELETE</button>';
      return '<div class="item hybrid-item"><span><b>'+esc(x.category||'Uncategorised')+'</b> · '+esc(x.title||x.key)+' <em class="source-badge '+(isLib?'is-library':'is-direct')+'">'+source+'</em></span><button type="button" class="open-btn" data-key="'+esc(x.key)+'" data-title="'+esc(x.title||x.key)+'">OPEN</button>'+action+'</div>';
    }).join(''):'<div class="item">No media loaded yet.</div>';
    status(a.length?'Product list refreshed. '+a.length+' item(s) loaded.':'No product media found.',false);
  }catch(e){list.innerHTML='<div class="item">Could not refresh product list: '+esc(e.message)+'</div>';status('Refresh error: '+e.message,true)}
  finally{if(btn){btn.disabled=false;btn.textContent='REFRESH PRODUCT LIST'}}
}
async function deleteDirect(btn){
  var password=prompt('Enter admin password to delete this direct upload:');
  if(password===null||!password.trim())return;
  var title=btn.dataset.title||'this item';
  if(!confirm('Delete '+title+' permanently?'))return;
  var old=btn.textContent;btn.disabled=true;btn.textContent='DELETING…';
  try{
    var r=await fetch('/api/admin-media-delete-smart',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json','authorization':'Bearer '+password.trim(),'cache-control':'no-cache'},body:JSON.stringify({key:btn.dataset.key})});
    var d=await r.json().catch(function(){return{}});
    if(!r.ok)throw new Error(d.error||('Delete failed ('+r.status+')'));
    status('Deleted '+title+'. Refreshing product list…',false);
    await loadHybrid();
  }catch(e){status('Delete error: '+e.message,true);alert(e.message)}
  finally{btn.disabled=false;btn.textContent=old}
}
function bind(){
  var refresh=document.getElementById('refreshBtn');
  if(refresh)refresh.onclick=function(e){e.preventDefault();e.stopPropagation();loadHybrid();return false};
  var list=document.getElementById('mediaList');
  if(list)list.addEventListener('click',function(e){var b=e.target.closest('.hybrid-delete-btn');if(!b)return;e.preventDefault();e.stopPropagation();deleteDirect(b)});
  setTimeout(loadHybrid,80);
}
window.woodrickStableLoad=loadHybrid;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();</script>
<style id="woodrick-admin-media-hybrid-style-v1">
.source-badge{display:inline-block;margin-left:8px;padding:3px 7px;border-radius:999px;font-style:normal;font-size:9px;font-weight:900;letter-spacing:.06em}.source-badge.is-library{background:#f3e3ae;color:#5d4710}.source-badge.is-direct{background:#e8f2e8;color:#245b24}.hybrid-library-btn,.hybrid-delete-btn{width:132px;min-width:132px;height:36px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;text-decoration:none}.hybrid-library-btn{border:1px solid #b28a2c;color:#7b5c11;background:#fff8e3}.hybrid-delete-btn{border:2px solid #a52a2a;color:#a52a2a;background:#fff;cursor:pointer}.hybrid-loading{font-weight:800;color:#8a6a18}@media(min-width:681px){#mediaList .hybrid-item{grid-template-columns:minmax(0,1fr) 96px 132px!important}}@media(max-width:680px){.hybrid-library-btn,.hybrid-delete-btn{width:100%;min-width:0}.source-badge{display:block;width:max-content;margin:6px 0 0}}
</style>`;

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/admin-products/' || url.pathname === '/admin-products' || url.pathname === '/admin-products/index.html')) {
      const type = response.headers.get('content-type') || '';
      if (!type.includes('text/html')) return response;
      let html = await response.text();
      if (!html.includes('woodrick-admin-media-hybrid-v1')) html = html.replace('</body>', patch + '\n</body>');
      const h = new Headers(response.headers);
      h.delete('content-length');
      h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
      h.set('x-woodrick-version','admin-media-hybrid-v1');
      return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
    }
    return response;
  }
};
