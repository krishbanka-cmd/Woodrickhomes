// Both the public rail and category browser derive vendor brands from published media.
const aliases={'woodline louvers':'Woodline','woodline louver':'Woodline','ristal1mm':'Ristal','ristal 1 mm':'Ristal','ristal laminates':'Ristal','ebco hardware':'EBCO'};
const categories={centuryply:['Plywood'],greenply:['Plywood'],greenpanel:['HDHMR & MDF'],ultratech:['Cement'],'birla opus':['Paints'],'asian paints':['Paints'],supreme:['uPVC Doors & Windows'],hettich:['Furniture & Kitchen Hardware'],ebco:['Furniture & Kitchen Hardware'],godrej:['Hardware'],merino:['Laminates'],'royale touche':['Laminates'],ristal:['Laminates'],woodline:['Laminates','Louvers','Acrylic Laminates','Doors'],mwud:['Laminates'],nilkamal:['Furniture & Storage']};
export const brandKey=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function canonicalBrand(value){const clean=String(value||'').trim();return aliases[brandKey(clean)]||clean}
export function canonicalBrowseCategory(value){const clean=String(value||'').trim(),key=brandKey(clean);return ({laminate:'Laminates',laminates:'Laminates',louver:'Louvers',louvers:'Louvers',plywood:'Plywood',plywoods:'Plywood','door skin':'Doors',doors:'Doors',door:'Doors'})[key]||clean}
export function buildBrandDirectory(media=[],rail=[]){
 const brands=new Map();
 for(const item of rail){const brand=canonicalBrand(item.brand);if(!brand)continue;const key=brandKey(brand);brands.set(key,{...item,brand,categories:[...new Set([...(categories[key]||[]),...(Array.isArray(item.categories)?item.categories:[]).map(canonicalBrowseCategory)])],mediaCount:0,categoryCounts:{}})}
 for(const item of media){
  if(String(item.key||'').startsWith('private/')||String(item.sourceKey||'').startsWith('private/'))continue;
  const brand=canonicalBrand(item.brand);if(!brand||brandKey(brand)==='other')continue;
  const key=brandKey(brand),category=canonicalBrowseCategory(item.category);
  if(!brands.has(key))brands.set(key,{brand,label:brand,src:'',alt:brand,categories:[],mediaCount:0,categoryCounts:{},source:'published-media'});
  const entry=brands.get(key);entry.mediaCount++;
  if(category){if(!entry.categories.some(c=>brandKey(c)===brandKey(category)))entry.categories.push(category);entry.categoryCounts[category]=(entry.categoryCounts[category]||0)+1}
 }
 return [...brands.values()];
}
