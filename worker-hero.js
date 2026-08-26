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
.hero .btn-outline{background:rgba(13,11,9,.50)!important;color:#f3e2b7!important;border-color:#b88939!important;backdrop-filter:blur(4px)!important}.hero .btn-outline:hover{background:#b9852d!important;color:#fff!important}
.hero .trust{color:#e5ddd1!important;margin-top:32px!important}.hero .trust span::before{color:#d6a13f!important}
.hero-material-tags{display:none!important}
@media(max-width:850px){.nav-inner{background:transparent!important}.nav .menu{background:#11100e!important}.hero{min-height:750px!important;background:linear-gradient(90deg,rgba(7,7,7,.90) 0%,rgba(10,10,10,.76) 58%,rgba(15,13,11,.34) 100%),url('https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1500&q=88') 62% center/cover!important}.hero-content{padding-top:190px!important;max-width:580px!important}.hero h1{font-size:47px!important}}
@media(max-width:520px){.hero{min-height:700px!important;background:linear-gradient(90deg,rgba(7,7,7,.92) 0%,rgba(10,10,10,.80) 68%,rgba(15,13,11,.42) 100%),url('https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1100&q=86') 66% center/cover!important}.hero-content{padding-top:170px!important}.hero h1{font-size:39px!important}.hero p{font-size:14px!important}.hero .btn{padding:11px 12px!important;font-size:9px!important}}
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
  if(actions){actions.innerHTML='<a class="btn btn-gold" href="/products/">EXPLORE PRODUCTS</a><a class="btn btn-outline" href="#modular">EXPLORE MODULAR KITCHEN</a><a class="btn btn-outline" href="#catalogue">VIEW CATALOGUE</a><a class="btn btn-outline" href="https://wa.me/919807988008" target="_blank" rel="noopener">WHATSAPP ENQUIRY</a>';}
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
