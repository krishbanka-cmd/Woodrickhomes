const params=new URLSearchParams(location.search),category=(params.get('category')||'').trim(),grid=document.getElementById('brandGrid'),status=document.getElementById('directoryStatus'),search=document.getElementById('brandSearch'),retry=document.getElementById('retry');let entries=[];
const key=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const cat=v=>({laminate:'laminates','door skin':'door skin','door skins':'door skin',doorskin:'door skin',doorskins:'door skin',louver:'louvers'})[key(v)]||key(v);
document.getElementById('categoryTitle').textContent=category||'All brands';document.getElementById('breadcrumb').textContent=category||'Brands';document.title=(category||'Product')+' Brands | Woodrick Homes';
function render(){const shown=entries.filter(x=>(!category||x.categories.some(c=>cat(c)===cat(category)))&&key(x.brand+' '+x.label).includes(key(search.value)));grid.replaceChildren();status.textContent=shown.length+' brand'+(shown.length===1?'':'s')+(category?' in '+category:'');for(const item of shown){const card=document.createElement('a');card.className='brand-card';const q=new URLSearchParams({brand:item.brand,return:location.pathname+location.search});if(category)q.set('category',category);card.href='/brands/?'+q;const identity=document.createElement('div');identity.className='brand-identity';const wordmark=document.createElement('span');wordmark.className='brand-wordmark';wordmark.textContent=item.label||item.brand;if(item.src){const img=document.createElement('img');const url=new URL(item.src,location.origin);if(['http:','https:'].includes(url.protocol)){img.src=url.href;img.alt=item.alt||item.brand;img.loading='lazy';img.addEventListener('error',()=>img.replaceWith(wordmark),{once:true});identity.append(img)}else identity.append(wordmark)}else identity.append(wordmark);const details=document.createElement('div');details.className='brand-details';const title=document.createElement('h2');title.textContent=item.label||item.brand;const info=document.createElement('p');const count=category?Object.entries(item.categoryCounts).filter(([c])=>cat(c)===cat(category)).reduce((sum,[,n])=>sum+n,0):item.mediaCount;info.textContent=count?count+' catalogue/photo/video item'+(count===1?'':'s'):'Enquire for product details';const action=document.createElement('span');action.className='brand-action';action.textContent=count?'View catalogues & media':'View brand & enquire';details.append(title,info,action);card.append(identity,details);grid.append(card)}if(!shown.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=search.value?'No brands match your search.':'Brand media is being added for this category. Contact Woodrick Homes for product availability.';grid.append(empty)}}

const DIRECTORY_CACHE_KEY='woodrick-public-brand-directory-v1';
const MEDIA_CACHE_KEY='woodrick-public-media-v1';
const FRESH_MS=90*1000,MAX_CACHE_MS=24*60*60*1000;
let displayedFingerprint='',loading=null,lastNetworkAttempt=0,mediaWarmupStarted=false;
function readDirectoryCache(){
  try{
    const saved=JSON.parse(localStorage.getItem(DIRECTORY_CACHE_KEY)||'null');
    if(saved&&Date.now()-saved.at<MAX_CACHE_MS&&Array.isArray(saved.data?.items)&&Array.isArray(saved.data?.categories))return saved;
  }catch{}
  return null;
}
function applyDirectory(data){
  if(!data||!Array.isArray(data.items)||!Array.isArray(data.categories))throw Error('Invalid brand directory');
  const fingerprint=JSON.stringify([data.items,data.categories]);
  if(fingerprint===displayedFingerprint)return;
  displayedFingerprint=fingerprint;
  entries=data.items;
  retry.hidden=true;
  const links=document.getElementById('categoryLinks');
  links.replaceChildren();
  for(const name of [...data.categories].sort((a,b)=>Number(cat(b)===cat(category))-Number(cat(a)===cat(category)))){
    const a=document.createElement('a');
    a.href='/products/brands/?category='+encodeURIComponent(name);
    a.textContent=name;
    if(cat(name)===cat(category))a.setAttribute('aria-current','page');
    links.append(a);
  }
  render();
}
// The next brand folder reuses the same customer media index already used by
// Products. Warming it here is optional and never blocks the visible directory.
function warmBrandMedia(){
  if(mediaWarmupStarted||navigator.connection?.saveData)return;
  mediaWarmupStarted=true;
  try{
    const saved=JSON.parse(localStorage.getItem(MEDIA_CACHE_KEY)||'null');
    if(saved&&Array.isArray(saved.items)&&Date.now()-saved.savedAt<FRESH_MS)return;
  }catch{}
  const warm=async()=>{
    try{
      const response=await fetch('/api/media?brand-page=1',{cache:'default'});
      if(!response.ok)return;
      const data=await response.json();
      if(!Array.isArray(data.items)||data.truncated)return;
      localStorage.setItem(MEDIA_CACHE_KEY,JSON.stringify({savedAt:Date.now(),items:data.items}));
    }catch{}
  };
  if(typeof window.requestIdleCallback==='function')window.requestIdleCallback(warm,{timeout:1600});
  else setTimeout(warm,250);
}
async function load(force=false){
  const saved=readDirectoryCache();
  if(saved&&!displayedFingerprint)applyDirectory(saved.data);
  if(!force&&saved&&Date.now()-saved.at<FRESH_MS){warmBrandMedia();return;}
  if(loading)return loading;
  lastNetworkAttempt=Date.now();
  if(!displayedFingerprint)status.textContent='Loading brands…';
  loading=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
    try{
      const response=await fetch('/api/brand-directory',{cache:'default',signal:controller.signal});
      if(!response.ok)throw Error('Brand directory unavailable');
      const data=await response.json();
      if(!Array.isArray(data.items)||!Array.isArray(data.categories))throw Error('Incomplete brand directory');
      applyDirectory(data);
      try{localStorage.setItem(DIRECTORY_CACHE_KEY,JSON.stringify({at:Date.now(),data}))}catch{}
      warmBrandMedia();
    }catch(e){
      if(!displayedFingerprint){status.textContent='Brands could not be loaded. Please try again.';retry.hidden=false}
      else console.warn('Using saved brand folders during network interruption',e);
    }finally{clearTimeout(timer);loading=null}
  })();
  return loading;
}
search.addEventListener('input',render);
retry.addEventListener('click',()=>load(true));
// Back/foreground must preserve visible cards rather than reload the page.
window.addEventListener('pageshow',e=>{if(e.persisted&&Date.now()-lastNetworkAttempt>FRESH_MS)load()});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&Date.now()-lastNetworkAttempt>5*60*1000)load();
});
load();

