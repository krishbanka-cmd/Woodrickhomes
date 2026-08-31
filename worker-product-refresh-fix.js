import app from './worker-product-media-stability.js';

const refreshPatch=`
<script id="woodrick-product-refresh-fix-v1">(function(){
function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
async function refreshProductList(){
  var list=document.getElementById('mediaList'),btn=document.getElementById('refreshBtn');
  if(!list)return;
  var old=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='REFRESHING…'}
  list.innerHTML='<div class="item">Refreshing latest product list…</div>';
  try{
    var r=await fetch('/api/media?_refresh='+Date.now(),{cache:'no-store',headers:{'cache-control':'no-cache','pragma':'no-cache'}});
    var d=await r.json().catch(function(){return{}});
    if(!r.ok)throw new Error(d.error||'Refresh failed');
    var a=Array.isArray(d.items)?d.items:[];
    list.innerHTML=a.length?a.map(function(x){var title=x.title||x.catalogue||x.key;return '<div class="item"><span><b>'+esc(x.category||'Uncategorised')+'</b> · '+esc(title)+'</span><button class="open-btn" data-key="'+esc(x.key)+'" data-title="'+esc(title)+'">OPEN</button></div>'}).join(''):'<div class="item">No uploaded products yet.</div>';
  }catch(err){
    list.innerHTML='<div class="item">Could not refresh product list: '+esc(err.message||'Unknown error')+'</div>';
  }finally{
    if(btn){btn.disabled=false;btn.textContent=old||'REFRESH PRODUCT LIST'}
  }
}
document.addEventListener('click',function(e){
  var b=e.target.closest('#refreshBtn');
  if(!b)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  refreshProductList();
},true);
window.woodrickRefreshProductList=refreshProductList;
})();</script>`;

export default{async fetch(request,env,ctx){
  const response=await app.fetch(request,env,ctx);
  const url=new URL(request.url);
  if(request.method!=='GET'||!(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html'))return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('woodrick-product-refresh-fix-v1'))html=html.includes('</body>')?html.replace('</body>',refreshPatch+'\n</body>'):html+refreshPatch;
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');headers.set('x-woodrick-version','product-refresh-fix-v1');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}};
