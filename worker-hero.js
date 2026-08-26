import base from './worker.js';

const HERO_CSS = `
<style id="woodrick-dark-material-hero-2026">
.topbar{background:#11100e!important;color:#f2d18a!important;border-bottom:1px solid #2a251f!important}
.nav{background:#161512!important;color:#fff!important;border-bottom:1px solid #2c261d!important;box-shadow:0 10px 30px rgba(0,0,0,.28)!important}
.nav-inner{background:#161512!important;border:0!important}
.nav .logo,.nav .logo span{color:#fff!important}.nav .logo small{color:#d7b36a!important}.nav .logo-mark{color:#f0c96b!important;border:2px solid #c99636!important;background:#17130d!important}
.nav .menu a{color:#f4efe8!important;text-shadow:none!important}.nav .menu a:hover,.nav .menu a:focus-visible,.nav .menu a.active{color:#f0c96b!important}
.nav .btn-gold{background:#c88f25!important;color:#fff!important;border-color:#c88f25!important}
.mobile-menu{color:#f0c96b!important}
.hero{min-height:790px!important;color:#fff!important;background:linear-gradient(90deg,rgba(10,9,8,.95) 0%,rgba(16,14,11,.88) 35%,rgba(18,15,12,.52) 58%,rgba(18,15,12,.24) 100%),url('https://images.unsplash.com/photo-1723257890897-e8f748161c34?auto=format&fit=crop&fm=jpg&q=88&w=2400') center/cover!important;overflow:hidden!important}
.hero:after{content:""!important;position:absolute!important;inset:0!important;background:linear-gradient(180deg,rgba(0,0,0,.02) 55%,rgba(6,5,4,.58) 100%)!important;pointer-events:none!important}
.hero-content{padding-top:220px!important;max-width:670px!important;position:relative!important;z-index:2!important}
.hero .kicker{display:inline-flex!important;color:#f0c96b!important;background:rgba(16,13,9,.78)!important;border:1px solid #b8862e!important;padding:10px 14px!important;border-radius:3px!important;letter-spacing:1.7px!important;font-size:11px!important}
.hero h1{color:#fff!important;text-shadow:0 2px 12px rgba(0,0,0,.3)!important;font-size:clamp(50px,5.6vw,72px)!important;line-height:1.02!important;max-width:660px!important}
.hero h1 em{color:#d7a542!important}
.hero p{color:#eee7de!important;text-shadow:none!important;max-width:560px!important;font-size:16px!important;line-height:1.75!important}
.hero-actions{gap:10px!important;align-items:center!important}
.hero .btn{padding:13px 17px!important;font-size:11px!important;letter-spacing:.35px!important}
.hero .btn-gold{background:#c88f25!important;color:#fff!important;border-color:#c88f25!important}
.hero .btn-outline{background:rgba(13,11,9,.70)!important;color:#f4e7c7!important;border-color:#b8893b!important;backdrop-filter:blur(4px)!important}
.hero .btn-outline:hover{background:#c88f25!important;color:#fff!important}
.hero .trust{color:#e0d5c8!important}.hero .trust span::before{color:#e3ac43!important}
.hero-material-tags{position:absolute;right:5%;bottom:120px;z-index:3;display:flex;gap:8px;flex-wrap:wrap;max-width:46%;justify-content:flex-end;pointer-events:none}
.hero-material-tags span{background:rgba(13,12,10,.88);border:1px solid rgba(215,179,106,.35);color:#fff;padding:7px 10px;border-radius:3px;font-size:10px;font-weight:800;letter-spacing:.35px;box-shadow:0 5px 18px rgba(0,0,0,.22)}
@media(max-width:850px){.nav-inner{background:#161512!important}.nav .menu{background:#161512!important}.hero{min-height:760px!important;background:linear-gradient(90deg,rgba(10,9,8,.94) 0%,rgba(13,11,9,.82) 58%,rgba(18,15,12,.40) 100%),url('https://images.unsplash.com/photo-1723257890897-e8f748161c34?auto=format&fit=crop&fm=jpg&q=85&w=1600') 62% center/cover!important}.hero-content{padding-top:195px!important;max-width:590px!important}.hero h1{font-size:50px!important}.hero-material-tags{display:none!important}}
@media(max-width:520px){.hero{min-height:720px!important;background:linear-gradient(90deg,rgba(10,9,8,.95) 0%,rgba(12,10,8,.85) 72%,rgba(18,15,12,.48) 100%),url('https://images.unsplash.com/photo-1723257890897-e8f748161c34?auto=format&fit=crop&fm=jpg&q=84&w=1200') 68% center/cover!important}.hero-content{padding-top:175px!important}.hero h1{font-size:41px!important}.hero p{font-size:14px!important}.hero .btn{padding:12px 13px!important;font-size:10px!important}}
</style>`;

const HERO_JS = `
<script>
window.addEventListener('DOMContentLoaded',function(){
  var hero=document.querySelector('.hero'); if(!hero) return;
  var kicker=hero.querySelector('.kicker'); if(kicker) kicker.textContent='PREMIUM BUILDING MATERIALS & INTERIOR SOLUTIONS';
  var h1=hero.querySelector('h1'); if(h1) h1.innerHTML='Crafted Materials.<br><em>Exceptional Spaces.</em>';
  var p=hero.querySelector('p'); if(p) p.textContent='A curated destination for premium building materials, surfaces and interior solutions — chosen to make every home feel considered, refined and enduring.';
  var actions=hero.querySelector('.hero-actions');
  if(actions){
    actions.innerHTML='<a class="btn btn-gold" href="/products/">EXPLORE PRODUCTS</a><a class="btn btn-outline" href="#catalogue">VIEW CATALOGUE</a><a class="btn btn-outline" href="#modular">EXPLORE MODULAR KITCHEN →</a>';
  }
  if(!hero.querySelector('.hero-material-tags')){
    var tags=document.createElement('div'); tags.className='hero-material-tags';
    tags.innerHTML='<span>LOUVERS</span><span>PLYWOOD SAMPLES</span><span>ACRYLIC SHEETS</span><span>TILES</span><span>SANITARY & FAUCETS</span>';
    hero.appendChild(tags);
  }
});
</script>`;

export default {
  async fetch(request, env, ctx) {
    const response = await base.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method !== 'GET' || (url.pathname !== '/' && url.pathname !== '/index.html')) return response;
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;
    let html = await response.text();
    html = html.includes('</head>') ? html.replace('</head>', HERO_CSS + '\n</head>') : HERO_CSS + html;
    html = html.includes('</body>') ? html.replace('</body>', HERO_JS + '\n</body>') : html + HERO_JS;
    const headers = new Headers(response.headers); headers.delete('content-length'); headers.set('cache-control','no-cache');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
};
