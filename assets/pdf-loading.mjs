export async function withDeadline(promise, milliseconds, cancel=()=>{}) {
  let timer;
  try {
    return await Promise.race([promise,new Promise((_,reject)=>{
      timer=setTimeout(()=>{
        reject(new Error('Catalogue loading timed out'));
        try{Promise.resolve(cancel()).catch(()=>{});}catch{}
      },milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
