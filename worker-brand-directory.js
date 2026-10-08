// Both the public rail and category browser derive vendor brands from published media.
const aliases={'ambuja':'Ambuja Cement','woodline louvers':'Woodline','woodline louver':'Woodline','ristal1mm':'Ristal','ristal 1 mm':'Ristal','ristal laminates':'Ristal','ebco hardware':'EBCO'};
const categories={'ambuja cement':['Cement'],centuryply:['Plywood'],greenply:['Plywood'],greenpanel:['HDHMR & MDF'],ultratech:['Cement'],'birla opus':['Paints'],'asian paints':['Paints'],supreme:['uPVC Doors & Windows'],hettich:['Furniture & Kitchen Hardware'],ebco:['Furniture & Kitchen Hardware'],godrej:['Hardware'],merino:['Laminates'],'royale touche':['Laminates'],ristal:['Laminates'],woodline:['Laminates','Louvers','Acrylic Laminates','Door Skin'],mwud:['Laminates'],nilkamal:['Furniture & Storage']};
export const brandKey=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function canonicalBrand(value){const clean=String(value||'').trim();return aliases[brandKey(clean)]||clean}
export function canonicalBrowseCategory(value){const clean=String(value||'').trim(),key=brandKey(clean);return ({laminate:'Laminates',laminates:'Laminates',louver:'Louvers',louvers:'Louvers',plywood:'Plywood',plywoods:'Plywood','door skin':'Door Skin','door skins':'Door Skin',doorskin:'Door Skin',doorskins:'Door Skin',doors:'Doors',door:'Doors'})[key]||clean}
// Historical sync records classified explicit Door Skin catalogues as Doors.
// Correct the public classification while keeping original file URLs intact.
export function canonicalMediaCategory(item={}){
 const category=canonicalBrowseCategory(item.category);
 const title=[item.catalogue,item.title,item.originalName,item.key,item.sourceKey].filter(Boolean).join(' ');
 return category==='Doors'&&/\bdoor[\s_-]*skins?\b/i.test(title)?'Door Skin':category;
}
export function buildBrandDirectory(media=[],rail=[]){
 const brands=new Map();
 for(const item of rail){const brand=canonicalBrand(item.brand);if(!brand)continue;const key=brandKey(brand);brands.set(key,{...item,brand,categories:[...new Set([...(Array.isArray(item.categories)?item.categories:(categories[key]||[])).map(canonicalBrowseCategory)])],mediaCount:0,categoryCounts:{}})}
 for(const item of media){
  if(String(item.key||'').startsWith('private/')||String(item.sourceKey||'').startsWith('private/'))continue;
  const brand=canonicalBrand(item.brand);if(!brand||brandKey(brand)==='other')continue;
  const key=brandKey(brand),category=canonicalMediaCategory(item);
  if(!brands.has(key))brands.set(key,{brand,label:brand,src:'',alt:brand,categories:[],mediaCount:0,categoryCounts:{},source:'published-media'});
  const entry=brands.get(key);entry.mediaCount++;
  if(category){if(!entry.categories.some(c=>brandKey(c)===brandKey(category)))entry.categories.push(category);entry.categoryCounts[category]=(entry.categoryCounts[category]||0)+1}
 }
 // Charcoal Moulding is a product, never a brand-rail entry; preserve its media/category association.
 for(const entry of brands.values())if(/^charcoal(?: mouldings?| moldings?)?$/i.test(entry.brand.trim()))entry.railEnabled=false;
 // Confirmed store range remains discoverable before a catalogue is uploaded.
 if(!brands.has('ambuja cement'))brands.set('ambuja cement',{brand:'Ambuja Cement',label:'Ambuja Cement',src:'',alt:'Ambuja Cement',categories:['Cement'],mediaCount:0,categoryCounts:{},source:'business-range',railEnabled:false});
 return [...brands.values()];
}

// The admin list, category navigation and customer directory share this result.
export function buildCatalogMaster(media=[],managed=[],state={}){
 const hidden=new Set((state.hiddenCategories||[]).map(c=>brandKey(canonicalBrowseCategory(c))));
 const entries=buildBrandDirectory(media,managed);
 const items=entries.map(item=>({...item,assignedCategories:item.categories,categories:item.categories.filter(c=>!hidden.has(brandKey(canonicalBrowseCategory(c))))}));
 const categoryMap=new Map();
 for(const raw of [...(state.categories||[]),...items.flatMap(item=>item.categories)]){
  const category=canonicalBrowseCategory(raw),key=brandKey(category);
  if(category&&key!=='more products'&&!hidden.has(key))categoryMap.set(key,category);
 }
 const missingBrands=[],missingAssociations=[],hiddenAssociations=[];
 for(const saved of managed){
  const brand=canonicalBrand(saved.brand),entry=items.find(item=>brandKey(item.brand)===brandKey(brand));
  if(!entry){missingBrands.push(brand);continue}
  for(const raw of saved.categories||[]){
   const category=canonicalBrowseCategory(raw),key=brandKey(category);
   if(hidden.has(key)){hiddenAssociations.push({brand,category});continue}
   if(!entry.categories.some(c=>brandKey(c)===key))missingAssociations.push({brand,category});
  }
 }
 return {items,categories:[...categoryMap.values()].sort((a,b)=>a.localeCompare(b)),customCategories:state.customCategories||[],hiddenCategories:state.hiddenCategories||[],integrity:{ok:!missingBrands.length&&!missingAssociations.length,missingBrands,missingAssociations,hiddenAssociations}};
}
