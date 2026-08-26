import base from './worker.js';

const HERO_CSS = `
<style id="woodrick-classic-premium-hero-2026">
.topbar{background:#090909!important;color:#d8c18b!important;border-bottom:1px solid #26211a!important}
.nav{background:rgba(10,10,10,.96)!important;color:#fff!important;border-bottom:1px solid #3b3020!important;box-shadow:0 10px 30px rgba(0,0,0,.26)!important}
.nav-inner{background:transparent!important;border:0!important}
.nav .logo,.nav .logo span{color:#fff!important}.nav .logo small{color:#d7b36a!important}.nav .logo-mark{color:#f0c96b!important;border:2px solid #c99738!important;background:#15120c!important}
.nav .menu a{color:#d7b36a!important;text-shadow:none!important;font-weight:800!important}.nav .menu a:hover,.nav .menu a:focus-visible,.nav .menu a.active,.nav .menu a[aria-current="page"]{color:#f0c96b!important}
.nav .btn-gold{background:#c9912e!important;color:#fff!important;border-color:#d7aa4a!important}.mobile-menu{color:#f0c96b!important}
.hero{min-height:780px!important;color:#fff!important;background:linear-gradient(90deg,rgba(7,7,7,.86) 0%,rgba(10,10,10,.73) 34%,rgba(15,13,11,.45) 56%,rgba(15,13,11,.20) 100%),url('https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=2200&q=90') center/cover!important;overflow:hidden!important}
.hero:after{content:""!important;position:absolute!important;inset:0!important;background:linear-gradient(180deg,rgba(0,0,0,0) 62%,rgba(5,5,5,.24) 100%)!important;pointer-events:none!important}
.hero-content{padding-top:215px!important;max-width:690px!important;position:relative!important;z-index:2!important}
.hero .kicker{display:inline-flex!important;color:#f0c96b!important;background:rgba(13,11,8,.46)!important;border:1px solid #a87929!important;padding:8px 12px!important;border-radius:3px!important;letter-spacing:1.8px!important;font-size:11px!important}
.hero h1{color:#fff!important;text-shadow:0 2px 12px rgba(0,0,0,.30)!important;font-size:clamp(46px,5vw,68px)!important;line-height:1.03!important;max-width:660px!important}.hero h1 em{color:#d5a13c!important}
.hero p{color:#eee8df!important;max-width:560px!important;font-size:15px!important;line-height:1.75!important;text-shadow:0 1px 4px rgba(0,0,0,.25)!important}
.hero-actions{gap:10px!important;align-items:center!important;max-width:650px!important}.hero .btn{padding:13px 16px!important;font-size:10px!important;letter-spacing:.45px!important}
.hero .btn-gold{background:linear-gradient(135deg,#d7a43b,#b77c18)!important;color:#fff!important;border-color:#e3b95c!important;box-shadow:0 8px 24px rgba(180,120,20,.20)!important}
.hero .btn-outline{background:rgba(13,11,9,.68)!important;color:#fff4cf!important;border-color:#c99a43!important;backdrop-filter:blur(5px)!important}.hero .btn-outline:hover{background:#b9852d!important;color:#fff!important}
.hero .trust{display:flex!important;gap:24px!important;flex-wrap:wrap!important;margin-top:28px!important;padding:12px 16px!important;background:rgba(8,8,8,.72)!important;border:1px solid rgba(201,154,67,.34)!important;border-radius:3px!important;color:#fff4dc!important;backdrop-filter:blur(5px)!important}.hero .trust span{color:#fff4dc!important;font-weight:700!important;text-shadow:0 1px 4px rgba(0,0,0,.55)!important}.hero .trust span::before{color:#e0aa42!important}
.hero .premium-proof{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:0!important;max-width:690px!important;margin-top:14px!important;padding:14px 16px!important;background:rgba(8,8,8,.78)!important;border:1px solid rgba(201,154,67,.42)!important;border-radius:3px!important;backdrop-filter:blur(6px)!important;box-shadow:0 10px 28px rgba(0,0,0,.24)!important}.hero .premium-proof div{padding:8px 18px!important;border-right:1px solid rgba(255,255,255,.18)!important}.hero .premium-proof div:first-child{padding-left:0!important}.hero .premium-proof div:last-child{border-right:0!important;padding-right:0!important}.hero .premium-proof strong{display:block!important;color:#fff!important;font-size:20px!important;line-height:1.15!important;text-shadow:0 1px 5px rgba(0,0,0,.65)!important}.hero .premium-proof small{display:block!important;margin-top:5px!important;color:#f0c96b!important;font-size:10px!important;font-weight:700!important;letter-spacing:.10em!important;text-transform:uppercase!important;text-shadow:0 1px 4px rgba(0,0,0,.65)!important}
.hero-material-tags{display:none!important}
@media(max-width:850px){.nav-inner{background:transparent!important}.nav .menu{background:#11100e!important}.hero{min-height:750px!important;background:linear-gradient(90deg,rgba(7,7,7,.90) 0%,rgba(10,10,10,.76) 58%,rgba(15,13,11,.34) 100%),url('https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1500&q=88') 62% center/cover!important}.hero-content{padding-top:190px!important;max-width:580px!important}.hero h1{font-size:47px!important}.hero .premium-proof strong{font-size:17px!important}}
@media(max-width:520px){.hero{min-height:700px!important;background:linear-gradient(90deg,rgba(7,7,7,.92) 0%,rgba(10,10,10,.80) 68%,rgba(15,13,11,.42) 100%),url('https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1100&q=86') 66% center/cover!important}.hero-content{padding-top:170px!important}.hero h1{font-size:39px!important}.hero p{font-size:14px!important}.hero .btn{padding:11px 12px!important;font-size:9px!important}.hero .trust{gap:10px!important;padding:10px!important}.hero .premium-proof{grid-template-columns:1fr!important;padding:8px 12px!important}.hero .premium-proof div{border-right:0!important;border-bottom:1px solid rgba(255,255,255,.15)!important;padding:10px 0!important}.hero .premium-proof div:last-child{border-bottom:0!important}.hero .premium-proof strong{font-size:17px!important}.hero .premium-proof small{font-size:9px!important}}
</style>`;

const HERO_JS = `
<script>
window.addEventListener('DOMContentLoaded',function(){
  var hero=document.querySelector('.hero'); if(!hero) return;
  hero.querySelectorAll('.hero-material-tags').forEach(function(el){el.remove();});
  var kicker=hero.querySelector('.kicker'); if(kicker) kicker.textContent='PREMIUM BUILDING MATERIALS & INTERIOR SOLUTIONS';
  var h1=hero.querySelector('h1'); if(h1) h1.innerHTML='Crafted Materials.<br><em>Exceptional Spaces.</em>';
  var p=hero.querySelector('p'); if(p) p.textContent='Premium building materials and complete interior solutions — thoughtfully selected to bring quality, style and lasting value to every space.';
  var actions=hero.querySelector('.hero-actions');
  if(actions){actions.innerHTML='<a class="btn btn-gold" href="#products-services">EXPLORE PRODUCTS</a><a class="btn btn-outline" href="#modular-kitchen-showcase">EXPLORE MODULAR KITCHEN</a><a class="btn btn-outline" href="https://drive.google.com/drive/folders/1zf6WNeCcctv6Hm-zxAsyV6I1RVcqicj0" target="_blank" rel="noopener">VIEW CATALOGUE</a><a class="btn btn-outline" href="https://wa.me/919415324839?text=Hello%20Woodrick%20Homes%2C%20I%20am%20interested%20in%20your%20products%20and%20would%20like%20more%20details." target="_blank" rel="noopener">WHATSAPP ENQUIRY</a>';}
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
