// Read-only catalogue inventory: HEAD-check every public PDF in all categories.
// Execute separately from PR tests; never access private vendor files.
const timeout=12000;
const response=await fetch('https://woodrickhomes.com/api/media?catalogue=1',{signal:AbortSignal.timeout(timeout)});
if(!response.ok)throw new Error('Catalogue index unavailable: '+response.status);
const json=await response.json();if(!Array.isArray(json.items))throw Error('Invalid public catalogue index');
const pdfs=json.items.filter(i=>i&&(/\.pdf$/i.test(i.key||'')||i.type==='pdf'||i.type==='original-pdf')).filter(i=>!String(i.key).startsWith('private/'));
const groups=new Map();
for(const p of pdfs){const name=String(p.category||'Uncategorized');if(!groups.has(name))groups.set(name,[]);groups.get(name).push(p)}
console.log('INVENTORY Total index items '+json.items.length+' PDF catalogue files '+pdfs.length+' categories '+groups.size);
console.log('INVENTORY By category '+JSON.stringify([...groups.entries()].map(([c,ps])=>({category:c,count:ps.length,brands:[...new Set(ps.map(x=>x.brand).filter(Boolean))]})).sort((a,b)=>a.category.localeCompare(b.category))));
let next=0;const results=[];
async function check(){
 while(next<pdfs.length){
  const p=pdfs[next++],url='https://woodrickhomes.com/api/media?raw=1&key='+encodeURIComponent(p.key),start=performance.now();
  try{
   const response=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(timeout)});
   results.push({brand:p.brand,category:p.category,title:p.title||p.catalogue,status:response.status,ms:Math.round(performance.now()-start),size:Number(response.headers.get('content-length'))||null,ranges:response.headers.get('accept-ranges')});
  }catch(error){results.push({brand:p.brand,category:p.category,title:p.title||p.catalogue,status:'ERROR',ms:Math.round(performance.now()-start),error:String(error).slice(0,90)})}
 }
}
await Promise.all(Array.from({length:Math.min(7,pdfs.length)},check));
const errors=results.filter(x=>x.status!==200||x.ranges!=='bytes');
const slow=results.slice().sort((a,b)=>b.ms-a.ms).slice(0,12);
const byCategory=[...groups.keys()].sort().map(c=>({category:c,files:results.filter(x=>x.category===c).length,failures:errors.filter(x=>x.category===c).length,maxMs:Math.max(...results.filter(x=>x.category===c).map(x=>x.ms))}));
console.log('INVENTORY All categories '+JSON.stringify(byCategory));
console.log('INVENTORY Slowest PDF HEAD responses '+JSON.stringify(slow));
console.log('INVENTORY Failed or nonrange PDFs '+JSON.stringify(errors));
if(json.truncated){console.log('INVENTORY WARNING index reports truncation');process.exitCode=1}
if(errors.length>0)process.exitCode=1;
