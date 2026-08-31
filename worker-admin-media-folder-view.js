import app from './worker-admin-media-hybrid.js';

const enc = new TextEncoder();
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate, max-age=0'}})}
function pageInfo(title){const s=String(title||'').trim();const m=s.match(/^(.*?)(?:\s+|[-_])page\s*0*(\d+)\s*$/i);return m?{base:m[1].trim(),page:Number(m[2])}:null}
function norm(v){return String(v||'').toLowerCase().replace(/\.(jpg|jpeg|png|webp|pdf)$/i,'').replace(/\b(catalogue|catalog|pdf|laminates?)\b/g,'').replace(/[^a-z0-9]+/g,'')}
function itemTitle(x){return String(x.title||x.catalogue||x.originalName||x.key||'').replace(/\.[a-z0-9]{2,5}$/i,'').trim()}
function groupAdminItems(items){
  const normal=[], groups=new Map();
  for(const x of items){const p=pageInfo(itemTitle(x));if(!p){normal.push(x);continue}const k=String(x.category||'').toLowerCase()+'|'+norm(p.base);if(!groups.has(k))groups.set(k,{base:p.base,items:[]});groups.get(k).items.push({...x,__page:p.page});}
  const normalKeys=normal.map(x=>({cat:String(x.category||'').toLowerCase(),n:norm(itemTitle(x))}));
  const out=[...normal];
  for(const [k,g] of groups){const cat=k.split('|')[0],bn=norm(g.base);const hasParent=normalKeys.some(p=>p.cat===cat&&p.n&&bn&&(p.n===bn||p.n.includes(bn)||bn.includes(p.n)));if(hasParent)continue;g.items.sort((a,b)=>a.__page-b.__page);const first={...g.items[0]};delete first.__page;first.title=g.base+' · '+g.items.length+' JPG pages';first.pageGroup='1';first.pageCount=String(g.items.length);out.push(first)}
  out.sort((a,b)=>String(b.syncedAt||b.uploadedAt||b.uploaded||'').localeCompare(String(a.syncedAt||a.uploadedAt||a.uploaded||'')));
  return out;
}
function cookieValue(request,name){const raw=request.headers.get('cookie')||'';for(const part of raw.split(';')){const [k,...rest]=part.trim().split('=');if(k===name)return rest.join('=')}return''}
async function sessionValue(secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,enc.encode('woodrick-admin-session-v1'));return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function authorized(request,env){if(!env.ADMIN_UPLOAD_TOKEN)return true;const auth=request.headers.get('authorization')||'';if(auth===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`)return true;return cookieValue(request,'woodrick_admin')===await sessionValue(env.ADMIN_UPLOAD_TOKEN)}
function explicitPasswordOk(request,env){if(!env.ADMIN_UPLOAD_TOKEN)return false;return (request.headers.get('authorization')||'')===`Bearer ${env.ADMIN_UPLOAD_TOKEN}`}
async function listAll(env){const out=[];let cursor;const seen=new Set();for(let i=0;i<200;i++){const opts={limit:1000,include:['customMetadata','httpMetadata']};if(cursor)opts.cursor=cursor;const r=await env.PRODUCT_MEDIA.list(opts);out.push(...r.objects);if(!r.truncated||!r.cursor||seen.has(r.cursor))break;seen.add(r.cursor);cursor=r.cursor}return out}
function objectTitle(o){const m=o.customMetadata||{};return String(m.title||m.catalogue||m.originalName||o.key||'').replace(/\.[a-z0-9]{2,5}$/i,'').trim()}
function objectCategory(o){const m=o.customMetadata||{};return String(m.category||'').trim().toLowerCase()}
async function deletePageGroup(env,key){const head=await env.PRODUCT_MEDIA.head(key);if(!head)return null;const p=pageInfo(objectTitle(head));if(!p)return null;const cat=objectCategory(head),bn=norm(p.base),all=await listAll(env);const targets=all.filter(o=>{const pi=pageInfo(objectTitle(o));return pi&&objectCategory(o)===cat&&norm(pi.base)===bn});if(targets.length<2)return null;for(let i=0;i<targets.length;i+=1000)await env.PRODUCT_MEDIA.delete(targets.slice(i,i+1000).map(o=>o.key));return{deleted:targets.length,scope:'jpg-folder'} }

export default{async fetch(request,env,ctx){const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/api/admin-media-list'){
    if(!await authorized(request,env))return json({error:'Admin login required'},401);
    const r=await app.fetch(request,env,ctx);let d={};try{d=await r.json()}catch{return r}if(!r.ok)return json(d,r.status);const items=Array.isArray(d.items)?d.items:[];return json({...d,items:groupAdminItems(items)});
  }
  if(request.method==='POST'&&url.pathname==='/api/admin-media-delete-smart'){
    if(!explicitPasswordOk(request,env))return json({error:'Correct admin password is required.'},401);
    let body={};try{body=await request.clone().json()}catch{}const key=String(body.key||'').trim();if(key&&env.PRODUCT_MEDIA){const grouped=await deletePageGroup(env,key);if(grouped)return json({ok:true,...grouped})}
  }
  const response=await app.fetch(request,env,ctx);
  if(request.method==='GET'&&(url.pathname==='/admin-products/'||url.pathname==='/admin-products'||url.pathname==='/admin-products/index.html')){const type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;let html=await response.text();html=html.replace('</body>','<style id="woodrick-folder-view-v1">.source-badge{vertical-align:middle}#mediaList .item span{line-height:1.5}</style></body>');const h=new Headers(response.headers);h.delete('content-length');h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');h.set('x-woodrick-version','folder-view-v1');return new Response(html,{status:response.status,statusText:response.statusText,headers:h})}
  return response;
}};
