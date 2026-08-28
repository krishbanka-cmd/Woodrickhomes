import app from './worker-library.js';

const oldCatalogue='https://drive.google.com/drive/folders/1zf6WNeCcctv6Hm-zxAsyV6I1RVcqicj0';

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const response=await app.fetch(request,env,ctx);
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
    return response;
  }
};
