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
      const key=String(item&&item.key||'').toLowerCase();
      for(const [suffix,name] of Object.entries(covers))if(key.endsWith('/'+suffix))return '/catalogue-covers/'+name+'.webp';
      return String(item&&item.coverUrl||'');
    }
  };
})();
