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

/* Premium product cards – products tab only */
#products-services{background:#f7f3ec!important}
#products-services #ws-products .ws-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:14px!important}
#products-services #ws-products .ws-card{position:relative!important;min-height:245px!important;padding:19px 18px 16px!important;border:1px solid #e6dccb!important;border-radius:4px!important;background:linear-gradient(180deg,#fff 0%,#fffdf9 100%)!important;box-shadow:0 9px 24px rgba(46,35,18,.07)!important;overflow:hidden!important;transition:transform .25s ease,box-shadow .25s ease,border-color .25s ease!important}
#products-services #ws-products .ws-card:hover{transform:translateY(-4px)!important;box-shadow:0 18px 38px rgba(46,35,18,.11)!important;border-color:#cda95d!important}
#products-services #ws-products .ws-card .tag{position:relative!important;z-index:2!important;display:block!important;margin:0 0 7px!important;color:#a87929!important;font-size:9px!important;font-weight:800!important;letter-spacing:1.4px!important;text-transform:uppercase!important;padding-left:21px!important}
#products-services #ws-products .ws-card h3{position:relative!important;z-index:2!important;max-width:58%!important;margin:0 0 9px!important;font-family:Georgia,'Times New Roman',serif!important;font-size:20px!important;line-height:1.08!important;color:#171512!important;font-weight:500!important}
#products-services #ws-products .ws-card p{position:relative!important;z-index:2!important;max-width:55%!important;margin:0!important;color:#5f5a52!important;font-size:11px!important;line-height:1.55!important}
#products-services #ws-products .ws-product-img{position:absolute!important;right:8px!important;bottom:8px!important;width:46%!important;height:62%!important;object-fit:contain!important;object-position:center!important;border-radius:2px!important;filter:saturate(.96) contrast(1.02)!important;background:#fff!important}
#products-services #ws-products .ws-card:before{content:'✧'!important;position:absolute!important;left:17px!important;top:15px!important;color:#c49235!important;font-size:15px!important;opacity:.9!important;transform:translateY(-2px)!important}
#products-services .ws-tabs{max-width:520px!important;margin-bottom:28px!important}
#products-services .ws-tab{border-radius:3px!important}
#products-services .ws-tab.active{background:#171717!important;color:#e1bd68!important;border-color:#171717!important}
#products-services .ws-product-benefits{display:grid!important;grid-template-columns:repeat(4,1fr)!important;margin-top:18px!important;padding:20px 18px!important;background:#efe6d8!important;border:1px solid #e1d3bd!important;border-radius:4px!important}
#products-services .ws-product-benefits div{padding:0 22px!important;border-right:1px solid #d7c4a3!important}
#products-services .ws-product-benefits div:last-child{border-right:0!important}
#products-services .ws-product-benefits strong{display:block!important;color:#221d16!important;font-size:12px!important}.ws-product-benefits small{display:block!important;color:#6d6253!important;font-size:10px!important;margin-top:3px!important}

@media(max-width:1050px){#products-services #ws-products .ws-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
@media(max-width:850px){.nav-inner{background:transparent!important}.nav .menu{background:#11100e!important}.hero{min-height:750px!important;background:linear-gradient(90deg,rgba(7,7,7,.90) 0%,rgba(10,10,10,.76) 58%,rgba(15,13,11,.34) 100%),url('https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1500&q=88') 62% center/cover!important}.hero-content{padding-top:190px!important;max-width:580px!important}.hero h1{font-size:47px!important}.hero .premium-proof strong{font-size:17px!important}#products-services #ws-products .ws-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ws-product-benefits{grid-template-columns:repeat(2,1fr)!important}.ws-product-benefits div:nth-child(2){border-right:0!important}.ws-product-benefits div{padding:10px 16px!important}}
@media(max-width:520px){.hero{min-height:700px!important;background:linear-gradient(90deg,rgba(7,7,7,.92) 0%,rgba(10,10,10,.80) 68%,rgba(15,13,11,.42) 100%),url('https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1100&q=86') 66% center/cover!important}.hero-content{padding-top:170px!important}.hero h1{font-size:39px!important}.hero p{font-size:14px!important}.hero .btn{padding:11px 12px!important;font-size:9px!important}.hero .trust{gap:10px!important;padding:10px!important}.hero .premium-proof{grid-template-columns:1fr!important;padding:8px 12px!important}.hero .premium-proof div{border-right:0!important;border-bottom:1px solid rgba(255,255,255,.15)!important;padding:10px 0!important}.hero .premium-proof div:last-child{border-bottom:0!important}.hero .premium-proof strong{font-size:17px!important}.hero .premium-proof small{font-size:9px!important}#products-services #ws-products .ws-grid{grid-template-columns:1fr!important}#products-services #ws-products .ws-card{min-height:225px!important}.ws-product-benefits{grid-template-columns:1fr!important}.ws-product-benefits div{border-right:0!important;border-bottom:1px solid #d7c4a3!important}.ws-product-benefits div:last-child{border-bottom:0!important}}
</style>`;

const HERO_JS = `
<script>
window.addEventListener('DOMContentLoaded',function(){
  var hero=document.querySelector('.hero');
  if(hero){
    hero.querySelectorAll('.hero-material-tags').forEach(function(el){el.remove();});
    var kicker=hero.querySelector('.kicker'); if(kicker) kicker.textContent='PREMIUM BUILDING MATERIALS & INTERIOR SOLUTIONS';
    var h1=hero.querySelector('h1'); if(h1) h1.innerHTML='Crafted Materials.<br><em>Exceptional Spaces.</em>';
    var p=hero.querySelector('p'); if(p) p.textContent='Premium building materials and complete interior solutions — thoughtfully selected to bring quality, style and lasting value to every space.';
    var actions=hero.querySelector('.hero-actions');
    if(actions){actions.innerHTML='<a class="btn btn-gold" href="#products-services">EXPLORE PRODUCTS</a><a class="btn btn-outline" href="#modular-kitchen-showcase">EXPLORE MODULAR KITCHEN</a><a class="btn btn-outline" href="https://drive.google.com/drive/folders/1zf6WNeCcctv6Hm-zxAsyV6I1RVcqicj0" target="_blank" rel="noopener">VIEW CATALOGUE</a><a class="btn btn-outline" href="https://wa.me/919415324839?text=Hello%20Woodrick%20Homes%2C%20I%20am%20interested%20in%20your%20products%20and%20would%20like%20more%20details." target="_blank" rel="noopener">WHATSAPP ENQUIRY</a>';}
  }

  var productPanel=document.querySelector('#ws-products');
  if(productPanel){
    var cards=Array.from(productPanel.querySelectorAll('.ws-card'));
    var imgs=[
      'https://www.ultratechcement.com/content/ultratechcement/in/ta/home/for-homebuilders/products/_jcr_content/root/container/container/container_267731970__2023425555/teaser.coreimg.png/1707274353185/cement-card.png',
      'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=700&q=82',
      'https://assets.bldnxt.in/catalog/product/cache/1/image/a77c1558d860704591e3027d1ebed402/v/t/vtch000008_nonb000008_5ae682f2215ad.jpg',
      'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=700&q=82',
      'https://www.pngkey.com/png/detail/137-1377356_white-paint-can-png-illustration.png',
      'https://seller.materialworld.pk/public/storage/products/WallPuttyOld1.jpg',
      'https://98eda87788a287f6d084.cdn6.editmysite.com/uploads/b/98eda87788a287f6d0840d09cd1bee28c3a25ecfec22000db28f2dee86413fc2/2025-09-25_15-38-37_1758829147.png?optimize=medium&width=2400',
      'https://mahgoubceramic.storage.googleapis.com/wp-content/uploads/2025/8/mahgoub-Toilet-and-basin-set-Roca-siza-white.jpg',
      'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?auto=format&fit=crop&w=700&q=82',
      'https://s.alicdn.com/%40sc04/kf/H4575e8defa7d4f1c85ab4e5045f75efaK/Different-Size-Available-3x7-4x8-6x8-5x9-5x8-Plywood.jpg',
      'https://img.waimaoniu.net/2566/2566-202109021542458992.jpg',
      'https://s.alicdn.com/%40sc04/kf/H45cf4937e66442cc89a56ff3ae5e7735Y/12mm-Hpl-Panel-6-mm-Hpl-Hpl-18mm-Thickness.jpg',
      'https://cortecarosi.com/cdn/shop/products/36505007_4b8c39a1-46f2-4ee3-a395-efd272abbda4.png?v=1684618980&width=3840',
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=700&q=82',
      'https://images.unsplash.com/photo-1556912167-f556f1f39fdf?auto=format&fit=crop&w=700&q=82'
    ];
    cards.forEach(function(card,i){
      var im=card.querySelector('.ws-product-img');
      if(!im){im=document.createElement('img');im.className='ws-product-img';card.appendChild(im);}
      im.src=imgs[i%imgs.length];
      im.alt=(card.querySelector('h3')?card.querySelector('h3').textContent:'Woodrick product');
      im.loading='lazy';
    });
    if(!productPanel.querySelector('.ws-product-benefits')){
      var benefits=document.createElement('div');
      benefits.className='ws-product-benefits';
      benefits.innerHTML='<div><strong>Premium Quality</strong><small>Trusted Brands</small></div><div><strong>Wide Range</strong><small>All Under One Roof</small></div><div><strong>Expert Guidance</strong><small>Right Solutions</small></div><div><strong>On-time Delivery</strong><small>Reliable & Fast</small></div>';
      productPanel.appendChild(benefits);
    }
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
