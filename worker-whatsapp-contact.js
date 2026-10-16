// Public enquiry destination. Change WHATSAPP_NUMBER in Cloudflare Worker
// Variables to switch numbers without editing individual pages or redeploying.
const DEFAULT_NUMBER='918090781345';
export function whatsappNumber(env={}){
 const value=String(env.WHATSAPP_NUMBER||'').replace(/\D/g,'');
 if(/^[6-9]\d{9}$/.test(value))return '91'+value;
 return /^91[6-9]\d{9}$/.test(value)?value:DEFAULT_NUMBER;
}
export function whatsappRedirect(request,env){
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD'}});
 const input=new URL(request.url),target=new URL('https://wa.me/'+whatsappNumber(env));
 // Route website enquiries through the tested Woodrick keyword, avoiding the
 // shared account's generic greeting trigger while retaining product details.
 const details=(input.searchParams.get('text')||'').replace(/^\s*(?:hello|hi)\b[\s,!:.\-]*/i,'').replace(/^Woodrick Homes\b[\s,!:.\-]*/i,'').trim();
 target.searchParams.set('text','Woodrick Homes Website Enquiry'+(details?'\n\n'+details:': Mujhe products ki jaankari chahiye.'));
 return new Response(null,{status:302,headers:{location:target.href,'cache-control':'no-store'}});
}
export async function whatsappContactResponse(response,url,env){
 const type=response.headers.get('content-type')||'';
 // Never rewrite customer/vendor records, private replies, media or PDF engines.
 if(!response.ok||/^\/(?:api|admin-products|vendor|become-a-vendor)(?:\/|$)/.test(url.pathname)||url.pathname.startsWith('/products/presentation/vendor/'))return response;
 if(!/text\/html|(?:application|text)\/javascript/.test(type))return response;
 const original=await response.text();let body=original;
 // Keep per-product enquiry text, including dynamically generated links.
 body=body.replace(/https:\/\/wa\.me\/919415324839\b/g,'/whatsapp');
 if(type.includes('text/html')){
  body=body.replace(/(<a\b[^>]*href=["']\/whatsapp(?:\?[^"']*)?["'][^>]*>)([^<]*)(<\/a>)/gi,(all,open,label,close)=>
   /(?:\+?91\s*)?94153\s*24839/.test(label)?open+label.replace(/(?:\+?91\s*)?94153\s*24839/,'+91 '+whatsappNumber(env).slice(2))+close:all);
 }
 const headers=new Headers(response.headers);
 if(body!==original){
  headers.delete('content-length');headers.delete('etag');headers.delete('content-encoding');
  headers.set('cache-control','no-store');
 }
 return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
