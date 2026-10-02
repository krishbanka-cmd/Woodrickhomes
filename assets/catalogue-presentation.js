// One cover registry for the same PDF across Products, Catalogues and Brands.
(function(){
  const covers={
    'ristal.pdf':'ristal-08','ristal-solid-colour.pdf':'ristal-solid','ristal1mm.pdf':'ristal1mm',
    'ristal-slim-75mm.pdf':'ristal-slim','mwud.pdf':'mwud','woodline.pdf':'woodline-08',
    'ristal-82mm.pdf':'ristal-08','ristal-solid-colour-92mm.pdf':'ristal-solid',
    'mwud-82mm.pdf':'mwud','woodline-82mm.pdf':'woodline-08',
    'woodline-door-skin.pdf':'woodline-door','woodline-acrylic.pdf':'woodline-acrylic',
    'woodline-louvers-8x5.pdf':'woodline-louvers-8x5','woodline-led-louvers.pdf':'woodline-led-louvers',
    'woodline-louvers-9-5x6.pdf':'woodline-louvers-9-5x6','rainbow-door-skin.pdf':'rainbow',
    'woodrick-25-kg-mr.pdf':'woodrick-25-kg-mr','woodrick-kitchen-catalogue.pdf':'kitchen',
    'godrej-lock-price-list.pdf':'godrej','ipsa-catalogue-and-price-list.pdf':'ipsa'
  };
  // Older Library originals duplicate PDFs already listed in the product gallery.
  // Send every customer entry point to the product record for these exact files.
  const aliases={
    'library/mwud/laminate/mwud-82mm/original/mwud-82mm.pdf':'product-sync/laminates/mwud/mwud.pdf',
    'library/ristal/laminate/ristal-82mm/original/ristal-82mm.pdf':'product-sync/laminates/ristal/ristal.pdf',
    'laminate/original-pdf/1787901460624-ristal1mm.pdf':'product-sync/laminates/ristal1mm/ristal1mm.pdf',
    'library/ristal/laminate/ristal-75mm/original/ristal-75mm.pdf':'laminates/pdf/1787751962530-ristal-slim-75mm.pdf',
    'library/ristal/laminate/ristal-solid-colour-92mm/original/ristal-solid-colour-92mm.pdf':'product-sync/laminates/ristal/ristal-solid-colour.pdf',
    'library/woodline/laminate/woodline-82mm/original/woodline-82mm.pdf':'product-sync/laminates/woodline/woodline.pdf',
    'library/woodline/acrylic-laminates/woodline-acrylic/original/woodline-acrylic.pdf':'product-sync/acrylic-laminates/woodline/woodline-acrylic.pdf',
    'library/woodline/door-skin/woodline-door-skin/original/woodline-door-skin.pdf':'product-sync/doors/woodline/woodline-door-skin.pdf',
    'library/woodline-louvers/louvers/woodline-louvers-8x5/original/woodline-louvers-8x5.pdf':'product-sync/louvers/woodline-louvers/woodline-louvers-8x5.pdf'
  };
  window.WoodrickCatalogue={
    pdfKey(item){const key=String(item&&item.key||'');return aliases[key.toLowerCase()]||key},
    cover(item){
      const original=String(item&&item.key||'').toLowerCase(),key=String(aliases[original]||original).toLowerCase();
      for(const [suffix,name] of Object.entries(covers))if(key.endsWith(suffix))return '/catalogue-covers/'+name+'.webp';
      return String(item&&item.coverUrl||'');
    }
  };
})();

// Shared, lazy first-page preview for new catalogues without a saved cover.
(function(){
  const previews=new Map(),queued=new WeakSet();let observer,queue=[],active=0,engineModule;
  async function firstPage(url){
    if(previews.has(url))return previews.get(url);
    const pending=(async()=>{let task;try{
      engineModule=engineModule||import('/assets/pdf-engine.mjs?v=20261002-audit1');
      const {pdfEngine}=await engineModule,engine=await pdfEngine();
      task=engine.getDocument({url});const pdf=await task.promise,page=await pdf.getPage(1),base=page.getViewport({scale:1}),view=page.getViewport({scale:Math.min(1.5,900/base.width)}),canvas=document.createElement('canvas');
      canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport:view,background:'#fff'}).promise;
      return canvas.toDataURL('image/jpeg',.88);
    }finally{if(task)await task.destroy()}})();
    previews.set(url,pending);pending.catch(()=>previews.delete(url));return pending;
  }
  function drain(){while(active<2&&queue.length){const el=queue.shift();if(!el.isConnected)continue;active++;
    const url=el.dataset.cataloguePdf;firstPage(url).then(src=>{if(!el.isConnected)return;const img=document.createElement('img');img.src=src;img.alt=el.dataset.catalogueTitle||'Catalogue cover';el.replaceChildren(img)}).catch(()=>{if(el.isConnected)el.textContent='Preview unavailable · Open catalogue to view';queued.delete(el)}).finally(()=>{active--;drain()});
  }}
  function schedule(el){if(queued.has(el))return;queued.add(el);el.textContent='Loading cover…';queue.push(el);drain()}
  function watch(el){if(!observer&&'IntersectionObserver' in window)observer=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){observer.unobserve(e.target);schedule(e.target)}})},{rootMargin:'160px'});if(observer)observer.observe(el);else schedule(el)}
  window.WoodrickCatalogue.observe=function(root=document){root.querySelectorAll('[data-catalogue-pdf]').forEach(el=>{
    const image=el.querySelector('img');if(!image){watch(el);return}
    image.addEventListener('error',()=>{el.replaceChildren();watch(el)},{once:true});
    if(image.complete&&!image.naturalWidth){el.replaceChildren();watch(el)}
  })};
})();
