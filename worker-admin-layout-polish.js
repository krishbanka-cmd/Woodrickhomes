import app from './worker-admin-alignment-fix.js';

const polishStyle=`
<style id="woodrick-admin-media-layout-polish-v1">
@media (min-width:681px){
  #mediaList .item{
    display:grid !important;
    grid-template-columns:minmax(0,1fr) 96px 96px !important;
    align-items:center !important;
    gap:14px !important;
    min-height:64px;
  }
  #mediaList .item>span:first-child{min-width:0;line-height:1.45}
  #mediaList .open-btn,
  #mediaList .admin-media-delete{
    width:96px !important;
    min-width:96px !important;
    height:36px !important;
    padding:0 10px !important;
    display:inline-flex !important;
    align-items:center !important;
    justify-content:center !important;
    margin:0 !important;
    line-height:1 !important;
    box-sizing:border-box !important;
  }
  #mediaList .open-btn{grid-column:2}
  #mediaList .admin-media-delete{grid-column:3}
}
@media (max-width:680px){
  #mediaList .item{display:grid !important;grid-template-columns:1fr 1fr !important;gap:10px !important}
  #mediaList .item>span:first-child{grid-column:1/-1}
  #mediaList .open-btn,#mediaList .admin-media-delete{width:100% !important;min-width:0 !important;height:40px !important;display:flex !important;align-items:center !important;justify-content:center !important;margin:0 !important}
}
</style>`;

export default{async fetch(request,env,ctx){
  const response=await app.fetch(request,env,ctx);
  const url=new URL(request.url);
  if(request.method!=='GET'||!(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html'))return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('woodrick-admin-media-layout-polish-v1'))html=html.includes('</head>')?html.replace('</head>',polishStyle+'\n</head>'):polishStyle+html;
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');headers.set('x-woodrick-version','admin-media-layout-polish-v1');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}};
