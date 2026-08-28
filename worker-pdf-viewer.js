import base from './worker-library.js';

function htmlEsc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function pdfViewer(key,obj){
  const meta=obj.customMetadata||{};
  const title=meta.catalogue||meta.title||meta.originalName||'Catalogue';
  const raw=`/api/media?raw=1&key=${encodeURIComponent(key)}`;
  const download=`/api/media?download=1&key=${encodeURIComponent(key)}`;
  const body=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEsc(title)} | Woodrick Homes</title><style>*{box-sizing:border-box}html,body{margin:0;height:100%;background:#090909;color:#fff;font-family:Arial,sans-serif}.top{height:58px;background:#050505;border-bottom:2px solid #f0c96b;display:flex;align-items:center;gap:12px;padding:8px 14px;position:sticky;top:0;z-index:10}.back,.download{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border:1px solid #f0c96b;color:#f0c96b;text-decoration:none;font-weight:900;font-size:12px;white-space:nowrap}.download{margin-left:auto;background:#f0c96b;color:#111}.title{font-family:Georgia,serif;font-size:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.frame{width:100%;height:calc(100vh - 58px);border:0;background:#fff}@media(max-width:620px){.top{height:auto;min-height:58px;flex-wrap:wrap}.title{order:-1;flex-basis:100%;text-align:center}.frame{height:calc(100vh - 100px)}}</style></head><body><div class="top"><a class="back" href="/products/#media">← BACK</a><div class="title">${htmlEsc(title)}</div><a class="download" href="${download}">DOWNLOAD CATALOGUE</a></div><iframe class="frame" src="${raw}" title="${htmlEsc(title)} PDF"></iframe></body></html>`;
  return new Response(body,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}

function freshResponse(response){
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma','no-cache');
  headers.set('expires','0');
  headers.set('x-woodrick-voice-version','2026-08-28-v5');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/media'&&request.method==='GET'){
      const key=url.searchParams.get('key');
      if(key&&url.searchParams.get('raw')!=='1'&&url.searchParams.get('download')!=='1'){
        const fetchDest=(request.headers.get('sec-fetch-dest')||'').toLowerCase();
        const fetchMode=(request.headers.get('sec-fetch-mode')||'').toLowerCase();
        const explicit=url.searchParams.get('pdfviewer')==='1';
        const topLevel=fetchDest==='document'||(fetchMode==='navigate'&&fetchDest!=='iframe');
        if(explicit||topLevel){
          const obj=await env.PRODUCT_MEDIA.get(key);
          const contentType=(obj&&obj.httpMetadata&&obj.httpMetadata.contentType)||'';
          if(obj&&(contentType==='application/pdf'||/\.pdf$/i.test(key)))return pdfViewer(key,obj);
        }
      }
    }
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&(url.pathname==='/voice-design-assistant.html'||url.pathname==='/voice-design-assistant'))return freshResponse(response);
    return response;
  }
};
