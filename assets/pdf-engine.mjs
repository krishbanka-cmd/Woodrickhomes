import * as engine from '../products/presentation/vendor/pdf.min.mjs';
import {withDeadline} from './pdf-loading.mjs';
let ready;
export async function pdfEngine(){
  if(!ready)ready=Promise.all([1,2,3,4].map(async n=>{
    const controller=new AbortController();
    return withDeadline((async()=>{
      const r=await fetch('/products/presentation/vendor/pdf.worker.part-'+n+'.js',{signal:controller.signal,cache:'default'});
      if(!r.ok)throw new Error('PDF engine unavailable');
      return r.text();
    })(),15000,()=>controller.abort());
  })).then(parts=>{engine.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob(parts,{type:'text/javascript'}));return engine}).catch(e=>{ready=null;throw e});
  return ready;
}
