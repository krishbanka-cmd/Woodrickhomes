import base from './worker.js';

const HERO_CSS = `
<style id="woodrick-dark-material-hero-2026">
.topbar{background:#0b0b0a!important;color:#e8c46d!important;border-bottom:1px solid #3a2c13!important}
.nav{background:rgba(12,12,11,.96)!important;color:#f0c96b!important;border-bottom:1px solid #6d5120!important;box-shadow:0 10px 30px rgba(0,0,0,.24)!important}
.nav-inner{background:transparent!important;border:0!important}
.nav .logo,.nav .logo span{color:#fff!important}.nav .logo small{color:#d7b36a!important}.nav .logo-mark{color:#f0c96b!important;border:2px solid #d5a33c!important;background:#15120c!important}
.nav .menu a{color:#e7bd5c!important;text-shadow:none!important;font-weight:800!important}.nav .menu a:hover,.nav .menu a:focus-visible,.nav .menu a.active,.nav .menu a[aria-current="page"]{color:#ffd978!important}
.nav .btn-gold{background:#c99228!important;color:#fff!important;border-color:#d7aa4a!important}.mobile-menu{color:#f0c96b!important}
.hero{min-height:790px!important;color:#fff!important;background:linear-gradient(90deg,rgba(8,8,7,.78) 0%,rgba(12,11,9,.57) 31%,rgba(18,15,12,.12) 58%,rgba(18,15,12,.02) 100%),url('/hero-first-approved-clean.webp') center/cover!important;overflow:hidden!important}
.hero:after{content:""!important;position:absolute!important;inset:0!important;background:linear-gradient(180deg,rgba(0,0,0,0) 62%,rgba(6,5,4,.20) 100%)!important;pointer-events:none!important}
.hero-content{padding-top:220px!important;max-width:650px!important;position:relative!important;z-index:2!important}
.hero .kicker{display:inline-flex!important;color:#f4ca68!important;background:rgba(12,10,7,.58)!important;border:1px solid #c79432!important;padding:9px 13px!important;border-radius:3px!important;letter-spacing:1.7px!important;font-size:11px!important}
.hero h1{color:#fff!important;text-shadow:0 2px 12px rgba(0,0,0,.28)!important;font-size:clamp(46px,5vw,66px)!important;line-height:1.03!important;max-width:640px!important}.hero h1 em{color:#e0aa42!important}
.hero p{color:#f1ece4!important;max-width:520px!important;font-size:15px!important;line-height:1.75!important;text-shadow:0 1px 4px rgba(0,0,0,.28)!important}
.hero-actions{gap:10px!important;align-items:center!important}.hero .btn{padding:13px 17px!important;font-size:11px!important;letter-spacing:.35px!important}
.hero .btn-gold{background:linear-gradient(135deg,#d7a43b,#b77c18)!important;color:#fff!important;border-color:#e3b95c!important;box-shadow:0 8px 24px rgba(180,120,20,.22)!important}
.hero .btn-outline{background:rgba(12,11,9,.55)!important;color:#f7e6b6!important;border-color:#c99738!important;backdrop-filter:blur(4px)!important}.hero .btn-outline:hover{background:#c88f25!important;color:#fff!important}
.hero .trust{color:#eadfce!important}.hero .trust span::before{color:#e3ac43!important}
.hero-material-tags{position:absolute;left:4.5%;bottom:105px;z-index:3;display:flex;gap:8px;flex-wrap:wrap;max-width:48%;pointer-events:none}.hero-material-tags span{background:rgba(13,12,10,.78);border:1px solid rgba(224,170,66,.48);color:#f8e9c2;padding:7px 10px;border-radius:3px;font-size:10px;font-weight:800;letter-spacing:.35px;box-shadow:0 5px 18px rgba(0,0,0,.18)}
@media(max-width:850px){.nav-inner{background:transparent!important}.nav .menu{background:#11100e!important}.hero{min-height:760px!important;background:linear-gradient(90deg,rgba(8,8,7,.84) 0%,rgba(12,10,8,.62) 52%,rgba(18,15,12,.14) 100%),url('/hero-first-approved-clean.webp') 64% center/cover!important}.hero-content{padding-top:195px!important;max-width:560px!important}.hero h1{font-size:47px!important}.hero-material-tags{display:none!important}}
@media(max-width:520px){.hero{min-height:720px!important;background:linear-gradient(90deg,rgba(8,8,7,.86) 0%,rgba(12,10,8,.68) 68%,rgba(18,15,12,.20) 100%),url('/hero-first-approved-clean.webp') 68% center/cover!important}.hero-content{padding-top:175px!important}.hero h1{font-size:39px!important}.hero p{font-size:14px!important}.hero .btn{padding:12px 13px!important;font-size:10px!important}}
</style>`;

const HERO_JS = `
<script>
window.addEventListener('DOMContentLoaded',function(){
  var hero=document.querySelector('.hero'); if(!hero) return;
  var kicker=hero.querySelector('.kicker'); if(kicker) kicker.textContent='PREMIUM BUILDING MATERIALS & INTERIOR SOLUTIONS';
  var h1=hero.querySelector('h1'); if(h1) h1.innerHTML='Crafted Materials.<br><em>Exceptional Spaces.</em>';
  var p=hero.querySelector('p'); if(p) p.textContent='Explore premium building materials and interior solutions that bring quality, style and durability to every space.';
  var actions=hero.querySelector('.hero-actions');
  if(actions){actions.innerHTML='<a class="btn btn-gold" href="/products/">EXPLORE PRODUCTS</a><a class="btn btn-outline" href="#catalogue">VIEW CATALOGUE</a><a class="btn btn-outline" href="#modular">EXPLORE MODULAR KITCHEN →</a>';}
  if(!hero.querySelector('.hero-material-tags')){var tags=document.createElement('div');tags.className='hero-material-tags';tags.innerHTML='<span>PLYWOOD</span><span>LOUVERS</span><span>ACRYLIC</span><span>TILES</span><span>SANITARY</span>';hero.appendChild(tags);}
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
