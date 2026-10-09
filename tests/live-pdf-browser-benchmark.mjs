// Diagnostic only: measure the first visible PDF page in a real headless Chrome.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const base='https://woodrickhomes.com';
let chrome,ws,dir;
async function main(){
 const result=await fetch(base+'/api/media?catalogue=1',{signal:AbortSignal.timeout(12000)});
 if(!result.ok)throw Error('Catalogue index: '+result.status);
 const {items=[]}=await result.json();
 const selected=items.filter(x=>/\.pdf$/i.test(x.key||'')&&(x.type==='pdf'||x.type==='original-pdf'||x.key.includes('/pdf')));
 const senator=selected.find(x=>/senator/i.test(x.brand||''));
 const other=selected.find(x=>/ristal/i.test(x.brand||''));
 if(!selected.length)throw Error('No catalogue PDFs found');
 dir=await mkdtemp(join(tmpdir(),'woodrick-live-browser-'));
 const binary=process.env.CHROME_BIN||'google-chrome';
 chrome=spawn(binary,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9229','--user-data-dir='+dir,'--window-size=1300,900','about:blank'],{stdio:'ignore'});
 chrome.on('error',error=>console.log('BROWSER Chrome binary error:',String(error)));
 let pages;
 for(let tries=0;tries<65;tries++){
  try {const response=await fetch('http://127.0.0.1:9229/json/list',{signal:AbortSignal.timeout(1000)});if(response.ok){pages=await response.json();if(pages.find(p=>p.type==='page'&&p.webSocketDebuggerUrl))break}}catch{}
  await delay(250);
 }
 const tab=pages?.find(p=>p.type==='page'&&p.url==='about:blank')||pages?.find(p=>p.type==='page');
 if(!tab?.webSocketDebuggerUrl)throw Error('Headless Chrome did not open a site tab.');
 console.log('BROWSER TARGET '+JSON.stringify({type:tab.type,url:tab.url}));
 ws=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 let serial=0;
 const pending=new Map(),failures=[],r2Responses=[],allResponses=[],exceptions=[];
 ws.onmessage=event=>{
  const p=JSON.parse(event.data);
  if(p.id){const entry=pending.get(p.id);if(entry){pending.delete(p.id);if(p.error)entry.reject(Error(JSON.stringify(p.error)));else entry.resolve(p.result)}return}
  if(p.method==='Network.loadingFailed'&&p.params?.errorText)failures.push({error:p.params.errorText,blocked:p.params.blockedReason,type:p.params.type});
  if(p.method==='Runtime.exceptionThrown')exceptions.push(p.params.exceptionDetails?.text);
  if(p.method==='Network.responseReceived'){
   const response=p.params?.response;
   if(response?.url)allResponses.push({status:response.status,url:response.url.slice(0,110)});
   if(response?.url?.includes('/api/media?'))r2Responses.push({status:response.status,url:response.url.split('&key=')[0]});
  }
 };
 function call(method,params={}){
  return new Promise((resolve,reject)=>{
   const id=++serial;pending.set(id,{resolve,reject});
   ws.send(JSON.stringify({id,method,params}));
   setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('CDP timeout: '+method))}},7500).unref?.();
  });
 }
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
 const expression="(()=>{const p=document.getElementById('page'),s=document.getElementById('status'),c=document.getElementById('count');return {ready:!!p&&!p.hidden&&!!s&&s.hidden,url:location.href,title:document.title,readyState:document.readyState,bodyText:document.body?.innerText?.slice(0,150)||'',count:c?.textContent||'',status:s?.textContent||'',resources:performance.getEntriesByType('resource').filter(r=>/pdf|worker/.test(r.name)).length};})()";
 const cases=selected.map(item=>({item,chunk:0,label:String(item.category||'Other')+' / '+String(item.brand||'Unknown')}));
 const results=[];
 for(const {item,chunk,label} of cases){
  failures.length=0;r2Responses.length=0;allResponses.length=0;exceptions.length=0;
  const url=base+'/products/presentation/?key='+encodeURIComponent(item.key)+'&title='+encodeURIComponent(item.title||item.catalogue||item.brand)+(chunk?'&rangeChunk='+chunk:'');
  const started=performance.now();
  const navigation=await call('Page.navigate',{url});
  console.log('BROWSER NAV '+JSON.stringify(navigation));
  let check={status:'No viewer content'},elapsed=0;
  const deadline=Date.now()+22000;
  while(Date.now()<deadline){
   try{
    const r=await call('Runtime.evaluate',{expression,returnByValue:true});
    check=r.result?.value||check;
    if(check.ready||/could not load|retry/i.test(check.status))break;
   }catch(e){check={error:String(e)}}
   await delay(350);
  }
  elapsed=Math.round(performance.now()-started);
  results.push({category:item.category,brand:item.brand,title:item.title||item.catalogue||'',firstPageVisible:!!check.ready,firstPageMs:check.ready?elapsed:null,elapsedMs:elapsed});
  console.log('BROWSER RESULT '+JSON.stringify({variant:label,rangeChunk:chunk,brand:item.brand,name:item.title||item.catalogue||'',pdfSize:item.size,firstPageVisible:!!check.ready,firstPageMs:check.ready?elapsed:null,elapsedMs:elapsed,viewerStatus:check.status,pageCount:check.count,requestStatuses:r2Responses.slice(0,12).map(x=>x.status),failedRequests:failures.slice(0,6),allResponses:allResponses.slice(0,20),exceptions:exceptions.slice(0,5),url:check.url,title:check.title,bodyText:check.bodyText,readyState:check.readyState,resources:check.resources}));
 }
 console.log('BROWSER SCAN SUMMARY '+JSON.stringify({total:results.length,successful:results.filter(x=>x.firstPageVisible).length,failed:results.filter(x=>!x.firstPageVisible),slowest:results.filter(x=>x.firstPageVisible).sort((a,b)=>b.firstPageMs-a.firstPageMs).slice(0,10),medianFirstPageMs:(()=>{const times=results.filter(x=>x.firstPageVisible).map(x=>x.firstPageMs).sort((a,b)=>a-b);return times.length?times[Math.floor(times.length/2)]:null})()}));
}
try{await main()}catch(e){console.log('BROWSER FAILED '+String(e.stack||e).slice(0,1800));process.exitCode=1}
finally{try{ws?.close()}catch{}try{chrome?.kill('SIGTERM')}catch{}if(dir)await rm(dir,{recursive:true,force:true}).catch(()=>{})}
