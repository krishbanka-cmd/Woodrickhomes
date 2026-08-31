import app from './worker-category-management.js';

const patch=`<script id="woodrick-edit-category-sync-v2">(function(){
function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function unique(list){var seen={};return list.filter(function(x){var k=String(x||'').trim().toLowerCase();if(!k||seen[k])return false;seen[k]=1;return true})}
var syncing=false;
async function syncEditCategories(preferred){
  var sel=document.getElementById('woodrickEditCategory');
  if(!sel||syncing)return;
  syncing=true;
  var current=preferred||sel.value||'';
  try{
    var r=await fetch('/api/categories?_='+Date.now(),{cache:'no-store',headers:{'cache-control':'no-cache','pragma':'no-cache'}});
    var d=await r.json().catch(function(){return{}});
    if(!r.ok||!Array.isArray(d.categories))return;
    var existing=Array.from(sel.options).map(function(o){return o.value||o.textContent||''});
    var all=unique(existing.concat(d.categories));
    var html=all.map(function(x){return '<option value="'+esc(x)+'">'+esc(x)+'</option>'}).join('');
    if(sel.innerHTML!==html)sel.innerHTML=html;
    var exact=all.find(function(x){return String(x).toLowerCase()===String(current).toLowerCase()});
    if(exact)sel.value=exact;
  }catch(_){
  }finally{syncing=false}
}
function install(){
  document.addEventListener('click',function(e){
    var b=e.target.closest('.woodrick-edit-btn');
    if(!b)return;
    setTimeout(function(){
      var sel=document.getElementById('woodrickEditCategory');
      var preferred=sel?sel.value:'';
      syncEditCategories(preferred);
    },80);
  },true);
  document.addEventListener('focusin',function(e){
    if(e.target&&e.target.id==='woodrickEditCategory')syncEditCategories(e.target.value);
  });
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
    html=html.replace(/<script id="woodrick-edit-category-sync-v1">[\s\S]*?<\/script>/g,'');
    if(!html.includes('woodrick-edit-category-sync-v2'))html=html.replace('</body>',patch+'\n</body>');
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
    headers.set('x-woodrick-version','edit-category-sync-v2');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
