import * as engine from '../products/presentation/vendor/pdf.min.mjs';
let ready;
export async function pdfEngine(){
  if(!ready)ready=Promise.all([1,2,3,4].map(async n=>{
    const r=await fetch('/products/presentation/vendor/pdf.worker.part-'+n+'.js');
    if(!r.ok)throw new Error('PDF engine unavailable');
    return r.text();
  })).then(parts=>{engine.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob(parts,{type:'text/javascript'}));return engine}).catch(e=>{ready=null;throw e});
  return ready;
}
