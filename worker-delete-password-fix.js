import app from './worker-product-media-sync.js';

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store, no-cache, must-revalidate, max-age=0'
    }
  });
}

function hasExplicitAdminPassword(request,env){
  if(!env.ADMIN_UPLOAD_TOKEN)return false;
  const auth=request.headers.get('authorization')||'';
  return auth===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`;
}

const deletePasswordPatch=`
<script id="woodrick-delete-password-v2">(function(){
  function askPassword(label){
    var p=prompt('Enter admin password to '+label+':');
    return p===null?'':p.trim();
  }

  document.addEventListener('click',async function(e){
    var btn=e.target.closest('.admin-media-delete');
    if(!btn)return;

    e.preventDefault();
    e.stopImmediatePropagation();

    var password=askPassword('delete this product');
    if(!password)return;
    if(!confirm('Delete this product media item?'))return;

    var old=btn.textContent;
    btn.disabled=true;
    btn.textContent='DELETING…';

    try{
      var r=await fetch('/api/admin-media-delete',{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'authorization':'Bearer '+password
        },
        body:JSON.stringify({key:btn.dataset.key})
      });
      var d=await r.json().catch(function(){return {}});
      if(!r.ok)throw new Error(d.error||'Delete failed');

      var refresh=document.getElementById('refreshBtn');
      if(refresh)refresh.click();
      else location.reload();
    }catch(err){
      alert(err.message);
    }finally{
      btn.disabled=false;
      btn.textContent=old;
    }
  },true);

  document.addEventListener('click',function(e){
    var btn=e.target.closest('.delete-catalogue-btn');
    if(!btn)return;

    var password=askPassword('delete this catalogue');
    if(!password){
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    var input=document.getElementById('libToken');
    if(input)input.value=password;
    try{sessionStorage.setItem('woodrick_library_token',password)}catch(_){}
  },true);
})();</script>`;

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(request.method==='POST'&&url.pathname==='/api/admin-media-delete'){
      if(!hasExplicitAdminPassword(request,env)){
        return json({error:'Correct admin password is required to delete.'},401);
      }
    }

    if(request.method==='POST'&&url.pathname==='/api/upload'){
      const ct=(request.headers.get('content-type')||'').toLowerCase();
      if(ct.includes('application/json')){
        let body={};try{body=await request.clone().json()}catch{}
        if(body.action==='delete-library'&&!hasExplicitAdminPassword(request,env)){
          return json({error:'Correct admin password is required to delete a catalogue.'},401);
        }
      }
    }

    const response=await app.fetch(request,env,ctx);

    if(request.method==='GET'&&(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html')){
      const type=response.headers.get('content-type')||'';
      if(!type.includes('text/html'))return response;

      let html=await response.text();
      html=html.replace(/<script id="woodrick-delete-password-v1">[\s\S]*?<\/script>/g,'');
      if(!html.includes('woodrick-delete-password-v2')){
        html=html.includes('</body>')?html.replace('</body>',deletePasswordPatch+'\n</body>'):html+deletePasswordPatch;
      }
      const headers=new Headers(response.headers);
      headers.delete('content-length');
      headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
      headers.set('x-woodrick-version','delete-password-v2');
      return new Response(html,{status:response.status,statusText:response.statusText,headers});
    }

    return response;
  }
};
