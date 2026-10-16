// One cover registry for the same PDF across Products, Catalogues and Brands.
(function(){
  const revisionCovers={"vendor-public/c1954a5d-75b1-4a0b-8dd7-1b8c0acfee9a/bb6ad925-625f-4c0b-851d-3903129a243d/1/pdf.pdf": "/catalogue-covers/royal-crown-1mm-r1.webp", "vendor-public/c1954a5d-75b1-4a0b-8dd7-1b8c0acfee9a/e28bab7d-addc-41bc-98d9-565a4f135a3e/1/pdf.pdf": "/catalogue-covers/senator-sanitary-r1.webp"};
  const brandKey=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function category(value){const clean=String(value||'').trim(),key=brandKey(clean);return ({laminate:'Laminates',laminates:'Laminates',louver:'Louvers',louvers:'Louvers',plywood:'Plywood',plywoods:'Plywood','door skin':'Door Skin','door skins':'Door Skin',doorskin:'Door Skin',doorskins:'Door Skin',doors:'Doors',door:'Doors',acrylic:'Acrylic Laminates','acrylic laminate':'Acrylic Laminates','acrylic laminates':'Acrylic Laminates',hdhmr:'HDHMR',mdf:'MDF','wpc board':'WPC Board & Chaukhat','wpc boards':'WPC Board & Chaukhat','shuttering plywood':'Shuttering Plywood',tile:'Tiles',tiles:'Tiles','bath fittings':'Bath Fittings',sanitary:'Sanitaryware',sanitaryware:'Sanitaryware'})[key]||clean}
  function mediaCategory(item={}){const saved=category(item.category),text=[item.catalogue,item.title,item.originalName,item.key,item.sourceKey].filter(Boolean).join(' ');return saved==='Doors'&&/\bdoor[\s_-]*skins?\b/i.test(text)?'Door Skin':saved}
  function categoryLabel(value){return category(value)==='Door Skin'?'Doorskin':String(value||'')}
  function brand(value){const name=String(value||'').trim();return {'ambuja':'Ambuja Cement','woodline louvers':'Woodline','woodline louver':'Woodline','ristal1mm':'Ristal','ristal 1 mm':'Ristal','ristal laminates':'Ristal','ebco hardware':'EBCO'}[brandKey(name)]||({'mwud':'MWUD','ipsa':'IPSA'})[brandKey(name)]||name}
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
    'product-sync/laminates/ristal/ristal-82mm.pdf':'product-sync/laminates/ristal/ristal.pdf',
    'product-sync/laminates/ristal/ristal-solid-colour-92mm.pdf':'product-sync/laminates/ristal/ristal-solid-colour.pdf',
    'product-sync/laminates/ristal/ristal-75mm.pdf':'laminates/pdf/1787751962530-ristal-slim-75mm.pdf',
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
  const titles={
    'ristal-08':'Ristal 0.82mm Premium Laminates','ristal-solid':'Ristal Solid Colour 0.92mm','ristal1mm':'Ristal 1mm Laminates','ristal-slim':'Ristal Slim 0.75mm Laminates',
    'mwud':'MWUD Futura 0.8mm Laminates','woodline-08':'Woodline 0.8mm Laminates','woodline-door':'Woodline Door Skin','woodline-acrylic':'Woodline Acrylic',
    'woodline-louvers-8x5':"Woodline Louvers 8x5''",'woodline-led-louvers':'Woodline LED Louvers','woodline-louvers-9-5x6':'Woodline Louvers 9.5x6',
    'rainbow':'Rainbow Door Skin','woodrick-25-kg-mr':'Woodrick Shuttering Plywood 25 KG MR','kitchen':'Woodrick Kitchen Catalogue','godrej':'Godrej Lock Catalogue & Price List','ipsa':'IPSA Hardware Catalogue & Price List'
  };
  window.WoodrickCatalogue={category,mediaCategory,categoryLabel,brand,
    title(item){const original=String(item&&item.key||'').toLowerCase(),sibling=original.replace(/\/([^/]+)\/jpg\/[^/]+$/, '/$1/original/$1.pdf'),key=String(aliases[sibling]||sibling).toLowerCase();for(const [suffix,name] of Object.entries(covers))if(key.endsWith(suffix))return titles[name];return String(item&&(item.catalogue||item.title||item.originalName)||'Catalogue').replace(/\.(?:pdf|jpe?g|png|webp|mp4|webm)$/i,'')},
    pdfKey(item){const key=String(item&&item.key||'');return key.startsWith('product-sync/')?key:(aliases[key.toLowerCase()]||key)},
    cover(item){
      const original=String(item&&item.key||'').toLowerCase(),key=String(aliases[original]||original).toLowerCase();
      for(const [suffix,name] of Object.entries(covers))if(key.endsWith(suffix))return '/catalogue-covers/'+name+'.webp';
      return String(item&&item.coverUrl||revisionCovers[original]||'');
    }
  };
})();

// Shared catalogue-cover rendering: show a useful cover instantly.
// Never fetch large vendor PDFs simply to paint the listing card.
(function(){
  const previews=new Map(),queued=new WeakSet(),observed=new WeakMap();
  const MAX_PREVIEW_MS=7000;
  let observer,queue=[],active=0,engineModule;
  function fallback(el){
    const card=document.createElement('div');
    card.className='cover-fallback';
    const heading=document.createElement('strong');
    heading.textContent=el.dataset.catalogueTitle||'Product catalogue';
    const label=document.createElement('span');
    label.textContent='PDF CATALOGUE';
    label.style.cssText='display:block;margin-top:8px;font:700 11px Arial,sans-serif;letter-spacing:1.5px;color:#846b48';
    card.append(heading,label);
    el.replaceChildren(card);
  }
  async function firstPage(url){
    if(previews.has(url))return previews.get(url);
    const pending=(async()=>{
      let task,timer;
      try{
        const work=(async()=>{
          engineModule=engineModule||import('/assets/pdf-engine.mjs?v=20261013-parallel-loader');
          const {pdfEngine}=await engineModule,engine=await pdfEngine();
          task=engine.getDocument({url,disableAutoFetch:true,rangeChunkSize:65536});
          const pdf=await task.promise,page=await pdf.getPage(1),base=page.getViewport({scale:1});
          const view=page.getViewport({scale:Math.min(1,700/base.width)}),canvas=document.createElement('canvas');
          canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
          await page.render({canvasContext:canvas.getContext('2d'),viewport:view,background:'#fff'}).promise;
          return canvas.toDataURL('image/jpeg',.75);
        })();
        return await Promise.race([work,new Promise((_,reject)=>{
          timer=setTimeout(()=>reject(new Error('Catalogue cover preview timed out')),MAX_PREVIEW_MS);
        })]);
      }finally{
        clearTimeout(timer);
        if(task)Promise.resolve().then(()=>task.destroy()).catch(()=>{});
      }
    })();
    previews.set(url,pending);
    pending.catch(()=>previews.delete(url));
    return pending;
  }
  function drain(){
    while(active<2&&queue.length){
      const el=queue.shift();
      if(!el.isConnected)continue;
      active++;
      const url=el.dataset.cataloguePdf,original=observed.get(el);
      const current=()=>el.isConnected&&observed.get(el)===original&&!(original&&original.complete&&original.naturalWidth);
      firstPage(url).then(src=>{
        if(!current())return;
        const img=document.createElement('img');
        img.alt=el.dataset.catalogueTitle||'Catalogue cover';
        img.src=src;
        el.replaceChildren(img);
      }).catch(()=>{if(current())fallback(el)}).finally(()=>{active--;drain()});
    }
  }
  function schedule(el){
    if(queued.has(el))return;
    queued.add(el);
    fallback(el);
    // Preview only explicitly marked small PDF files (<=4 MB).
    // All other catalogues render their brand/title immediately, without downloads.
    if(el.dataset.cataloguePreview!=='small')return;
    queue.push(el);
    drain();
  }
  function watch(el){
    if(el.dataset.cataloguePreview!=='small'){schedule(el);return}
    if(!observer&&'IntersectionObserver' in window){
      observer=new IntersectionObserver(entries=>{
        entries.forEach(entry=>{if(entry.isIntersecting){observer.unobserve(entry.target);schedule(entry.target)}})
      },{rootMargin:'160px'});
    }
    if(observer)observer.observe(el);else schedule(el);
  }
  window.WoodrickCatalogue.observe=function(root=document){
    root.querySelectorAll('[data-catalogue-pdf]').forEach(el=>{
      const image=el.querySelector('img');
      if(!image){observed.delete(el);watch(el);return}
      if(observed.get(el)===image)return;
      observed.set(el,image);
      let settled=false;
      const done=()=>{settled=true;clearTimeout(watchdog)};
      const fail=()=>{if(settled||!el.isConnected||observed.get(el)!==image)return;done();el.replaceChildren();watch(el)};
      const watchdog=setTimeout(()=>{if(!settled&&!image.complete)fail()},7000);
      image.addEventListener('load',()=>{
        done();
        if(image.naturalWidth&&el.isConnected&&observed.get(el)===image)el.replaceChildren(image);
      },{once:true});
      image.addEventListener('error',fail,{once:true});
      if(image.complete){if(image.naturalWidth)done();else fail()}
    });
  };
})();
