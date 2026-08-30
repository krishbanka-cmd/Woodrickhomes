import app from './worker-project-sync.js';

const oldCatalogue='https://drive.google.com/drive/folders/1zf6WNeCcctv6Hm-zxAsyV6I1RVcqicj0';

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
        const html=(await response.text()).split(oldCatalogue).join('/catalogues/');
        const headers=new Headers(response.headers);
        headers.set('cache-control','no-store');
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
