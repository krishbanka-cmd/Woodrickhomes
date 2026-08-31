import app from './worker-category-management.js';

const patch=`<script id="woodrick-edit-category-sync-v1">(function(){
function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function unique(list){var seen={};return list.filter(function(x){var k=String(x||'').trim().toLowerCase();if(!k||seen[k])return false;seen[k]=1;return true})}
async function syncEditCategories(){
  var sel=document.getElementById('woodrickEditCategory');
  if(!sel)return;
  var current=sel.value;
  try{
    var r=await fetch('/api/categories?_='+Date.now(),{cache:'no-store',headers:{'cache-control':'no-cache','pragma':'no-cache'}});
    var d=await r.json().catch(function(){return{}});
    if(!r.ok||!Array.isArray(d.categories))return;
    var existing=Array.from(sel.options).map(function(o){return o.value||o.textContent||''});
    var all=unique(existing.concat(d.categories));
    sel.innerHTML=all.map(function(x){return '<option value="'+esc(x)+'">'+esc(x)+'</option>'}).join('');
    if(current&&all.some(function(x){return x.toLowerCase()===String(current).toLowerCase()})){
      var exact=all.find(function(x){return x.toLowerCase()===String(current).toLowerCase()});
      sel.value=exact;
    }
  }catch(_){ }
}
function install(){
  syncEditCategories();
  var observer=new MutationObserver(function(){
    var modal=document.getElementById('woodrickEditModal');
    if(modal&&modal.classList.contains('show'))syncEditCategories();
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('click',function(e){if(e.target.closest('.woodrick-edit-btn'))setTimeout(syncEditCategories,30)},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();</script>`;

export default{
  async fetch(request,env,ctx){
    const response=await app.fetch(request,env,ctx);
    const url=new URL(request.url);
    const isAdmin=request.method==='GET'&&(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html');
    if(!isAdmin)return response;
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html'))return response;
    let html=await response.text();
    if(!html.includes('woodrick-edit-category-sync-v1'))html=html.replace('</body>',patch+'\n</body>');
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
    headers.set('x-woodrick-version','edit-category-sync-v1');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
