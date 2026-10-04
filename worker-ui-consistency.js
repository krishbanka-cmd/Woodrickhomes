const revision='20261004-catalogue-reliability';
const browse=/^\/(?:products(?:\/|$)|brands(?:\/|$)|catalogues(?:\/|$)|woodrick-library(?:\.html)?$)/;
const workflow=/^\/(?:design-your-space|voice-design-assistant|design-requirements-confirmed|ai-auto-select|material-placement|auto-layout|auto-layout-result|3d-design-preview)(?:\.html)?$/;

// Apply the same final presentation after the legacy page enhancements.
export async function consistentCustomerResponse(response,url){
  if(!response.ok||!(response.headers.get('content-type')||'').includes('text/html'))return response;
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/admin')||url.pathname.startsWith('/vendor')||url.pathname.startsWith('/become-a-vendor')||url.pathname.startsWith('/products/presentation/'))return response;
  let html=await response.text();
  html=html.replace(/(\/assets\/catalogue-presentation\.(?:css|js))\?v=[^"'<>\s]+/g,'$1?v='+revision);
  html=html.replace(/(<a\b[^>]*href=)(["'])#products-services\2([^>]*>\s*(?:EXPLORE\s+)?PRODUCTS\s*<\/a>)/gi,'$1$2/products/$2$3');
  const pageClass=workflow.test(url.pathname)?'woodrick-workflow-page':browse.test(url.pathname)?'woodrick-browse-page':'';
  if(pageClass)html=html.replace(/<body([^>]*)>/i,(all,attrs)=>/\bclass=/.test(attrs)?'<body'+attrs.replace(/class=(['"])(.*?)\1/,(m,q,c)=>'class='+q+c+' '+pageClass+q)+'>':'<body'+attrs+' class="'+pageClass+'">');
  if(pageClass)html=html.replace('</body>','<link rel="stylesheet" href="/assets/customer-ui.css?v='+revision+'">\n</body>');
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
