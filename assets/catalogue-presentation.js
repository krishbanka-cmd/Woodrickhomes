// One cover registry for the same PDF across Products, Catalogues and Brands.
(function(){
  const covers={
    'ristal.pdf':'ristal-08','ristal-solid-colour.pdf':'ristal-solid','ristal1mm.pdf':'ristal1mm',
    'ristal-slim-75mm.pdf':'ristal-slim','mwud.pdf':'mwud','woodline.pdf':'woodline-08',
    'woodline-door-skin.pdf':'woodline-door','woodline-acrylic.pdf':'woodline-acrylic',
    'woodline-louvers-8x5.pdf':'woodline-louvers-8x5','woodline-led-louvers.pdf':'woodline-led-louvers',
    'woodline-louvers-9-5x6.pdf':'woodline-louvers-9-5x6','rainbow-door-skin.pdf':'rainbow',
    'woodrick-25-kg-mr.pdf':'woodrick-25-kg-mr','woodrick-kitchen-catalogue.pdf':'kitchen',
    'godrej-lock-price-list.pdf':'godrej','ipsa-catalogue-and-price-list.pdf':'ipsa'
  };
  window.WoodrickCatalogue={
    cover(item){
      const key=String(item&&item.key||'').toLowerCase();
      for(const [suffix,name] of Object.entries(covers))if(key.endsWith('/'+suffix))return '/catalogue-covers/'+name+'.webp';
      return String(item&&item.coverUrl||'');
    }
  };
})();
