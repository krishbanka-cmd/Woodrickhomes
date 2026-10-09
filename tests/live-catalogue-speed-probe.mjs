// Read-only live performance probe. Intended for GitHub Actions runners.
const base='https://woodrickhomes.com';
const ts=()=>Number(performance.now().toFixed(0));
async function timed(path,{method='GET',headers={},maxBytes=131072,parseJSON=false,timeout=15000}={}){
 const start=performance.now();let response,bytes=0,buffer=[],last;
 try{
  response=await fetch(base+path,{method,headers,signal:AbortSignal.timeout(timeout),redirect:'follow',cache:'no-store'});
  const ttfb=ts()-Math.round(start);
  if(method!=='HEAD'&&response.body){
   const stream=response.body.getReader();
   while(bytes<maxBytes){
    const part=await stream.read();
    if(part.done)break;
    const body=part.value||new Uint8Array();
    const trimmed=body.subarray(0,Math.min(body.length,maxBytes-bytes));
    buffer.push(trimmed);bytes+=trimmed.length;
    if(bytes>=maxBytes)break;
   }
   await stream.cancel().catch(()=>{});
  }
  let json=null;
  if(parseJSON){const combined=Buffer.concat(buffer.map(x=>Buffer.from(x)));try{json=JSON.parse(combined.toString('utf8'))}catch{last='JSON incomplete or invalid'}}
  return {name:path.split('?')[0],status:response.status,ttfbMs:ttfb,elapsedMs:Math.round(performance.now()-start),receivedBytes:bytes,contentLength:response.headers.get('content-length'),contentRange:response.headers.get('content-range'),acceptRanges:response.headers.get('accept-ranges'),cacheControl:response.headers.get('cache-control'),error:last||null,data:json};
 }catch(e){return {name:path.split('?')[0],status:null,elapsedMs:Math.round(performance.now()-start),error:String(e).slice(0,200)}}
}
function report(title,p){const {data,...metrics}=p;console.log('SPEED '+title+' '+JSON.stringify(metrics));return data;}
console.log('SPEED Environment Github Actions runner; approximate UTC:',new Date().toISOString());
for(let pass=1;pass<=2;pass++){
 const a=await timed('/catalogues/',{maxBytes:250000});
 report('catalogues-html-'+pass,a);
 const b=await timed('/api/media?catalogue=1',{maxBytes:5*1024*1024,parseJSON:true});
 const data=report('catalogue-index-'+pass,b);
 if(pass===1){
  const hits=(data?.items||[]).filter(x=>/senator/i.test([x.brand,x.title,x.catalogue,x.key].join(' '))&&(/pdf/i.test(x.type)||/\.pdf$/i.test(x.key||'')));
  console.log('SPEED Senator PDF candidates '+JSON.stringify(hits.map(x=>({name:x.title||x.catalogue,category:x.category,brand:x.brand,size:x.size,mediaKey:x.key})).slice(0,5)));
  const other=(data?.items||[]).find(x=>/ristal|woodline/i.test(x.brand||'')&&/\.pdf$/i.test(x.key||''));
  const selected=[hits[0],other].filter(Boolean);
  if(!selected.length)console.log('SPEED WARNING: No public PDF catalogue candidates located');
  for(const item of selected){
   const prefix=/senator/i.test(item.brand||'')?'Senator':'comparison';
   const path='/api/media?key='+encodeURIComponent(item.key)+'&raw=1';
   report(prefix+'-pdf-head',await timed(path,{method:'HEAD',timeout:17000}));
   report(prefix+'-pdf-range-first-64KB',await timed(path,{headers:{Range:'bytes=0-65535'},maxBytes:65536,timeout:18000}));
   report(prefix+'-pdf-range-second-64KB',await timed(path,{headers:{Range:'bytes=65536-131071'},maxBytes:65536,timeout:18000}));
  }
 }
}
const assets=[
 '/products/presentation/',
 '/products/presentation/viewer.js?v=20261004-catalogue-reliability',
 '/assets/pdf-engine.mjs?v=20261002-audit1',
 '/products/presentation/vendor/pdf.min.mjs',
 '/products/presentation/vendor/pdf.worker.part-1.js',
 '/products/presentation/vendor/pdf.worker.part-2.js',
 '/products/presentation/vendor/pdf.worker.part-3.js',
 '/products/presentation/vendor/pdf.worker.part-4.js'
];
for(const asset of assets){
 const result=await timed(asset,{headers:{Range:'bytes=0-16383'},maxBytes:16384,timeout:16000});
 report('viewer-asset',result);
}
console.log('SPEED Completed read-only probe. TTFB is server response from GitHub runner, not first page visual render on Indian mobile.');
