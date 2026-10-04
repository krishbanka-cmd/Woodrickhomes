// Identity follows the original file, not editable titles or sync filenames.
export const CATALOGUE_ALIASES = {
  'library/ristal/laminate/ristal-82mm/original/ristal-82mm.pdf': 'product-sync/laminates/ristal/ristal.pdf',
  'product-sync/laminates/ristal/ristal-82mm.pdf': 'product-sync/laminates/ristal/ristal.pdf',
  'library/ristal/laminate/ristal-solid-colour-92mm/original/ristal-solid-colour-92mm.pdf': 'product-sync/laminates/ristal/ristal-solid-colour.pdf',
  'product-sync/laminates/ristal/ristal-solid-colour-92mm.pdf': 'product-sync/laminates/ristal/ristal-solid-colour.pdf',
  'library/ristal/laminate/ristal-75mm/original/ristal-75mm.pdf': 'laminates/pdf/1787751962530-ristal-slim-75mm.pdf',
  'product-sync/laminates/ristal/ristal-75mm.pdf': 'laminates/pdf/1787751962530-ristal-slim-75mm.pdf',
  'laminate/original-pdf/1787901460624-ristal1mm.pdf': 'product-sync/laminates/ristal1mm/ristal1mm.pdf',
  'library/mwud/laminate/mwud-82mm/original/mwud-82mm.pdf': 'product-sync/laminates/mwud/mwud.pdf',
  'library/woodline/laminate/woodline-82mm/original/woodline-82mm.pdf': 'product-sync/laminates/woodline/woodline.pdf',
  'library/woodline/acrylic-laminates/woodline-acrylic/original/woodline-acrylic.pdf': 'product-sync/acrylic-laminates/woodline/woodline-acrylic.pdf',
  'library/woodline/door-skin/woodline-door-skin/original/woodline-door-skin.pdf': 'product-sync/doors/woodline/woodline-door-skin.pdf',
  'library/woodline-louvers/louvers/woodline-louvers-8x5/original/woodline-louvers-8x5.pdf': 'product-sync/louvers/woodline-louvers/woodline-louvers-8x5.pdf'
};
export function canonicalCatalogueKey(key='') { return CATALOGUE_ALIASES[key] || key; }
export function dedupeCatalogueItems(items=[]) {
  const unique=new Map();
  for(const item of items){
    const key=String(item.key||''),isPdf=/\.pdf$/i.test(key)||['pdf','original-pdf'].includes(item.type);
    const source=String(item.sourceKey||key);
    const id=isPdf?['pdf',item.vendorId||'',canonicalCatalogueKey(source)].join('|'):'file|'+key;
    const prior=unique.get(id);
    if(!prior){unique.set(id,item);continue;}
    const stamp=x=>String(x.sourceUploadedAt||'');
    // Prefer an updated original, then the existing stable public URL.
    if(stamp(item)>stamp(prior)||(stamp(item)===stamp(prior)&&key===canonicalCatalogueKey(source)))unique.set(id,item);
  }
  return [...unique.values()];
}
