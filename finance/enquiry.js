const form=document.getElementById('financeForm'),status=document.getElementById('status'),submit=document.getElementById('submit'),whatsapp=document.getElementById('whatsapp');
document.querySelectorAll('[data-loan]').forEach(link=>link.addEventListener('click',()=>{document.getElementById('loan').value=link.dataset.loan}));
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const fields=new FormData(form),loan=String(fields.get('loan')||'');
  const payload={name:String(fields.get('name')||'').trim(),mobile:String(fields.get('mobile')||''),city:String(fields.get('city')||'').trim(),email:String(fields.get('email')||'').trim(),requirement:'Bank Finance · '+loan,message:String(fields.get('message')||'').trim(),website:String(fields.get('website')||''),source:'woodrickhomes.com/finance'};
  submit.disabled=true;whatsapp.hidden=true;status.textContent='Sending your finance enquiry…';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch('/api/enquiries',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    const saved=await response.json();if(!response.ok||!saved.id)throw Error(saved.error||'Unable to save your enquiry. Please retry.');
    // Match the existing website Sheet integration; website storage is authoritative.
    fetch('https://script.google.com/macros/s/AKfycbyaPA-H-vCttmE-mMWp4Bo_kPRdi2PoXl-7NLrPfCfOQ-3_HCREslXF8MvZSlT7qYrIVw/exec',{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({...payload,enquiry_id:saved.id}).toString()}).catch(()=>{});
    const lines=['New Easy Finance Enquiry – Woodrick Homes','Name: '+payload.name,'Mobile: '+payload.mobile,'City: '+payload.city,'Loan: '+loan,'Requirement: '+(payload.message||'Please contact me.'),'Reference: '+saved.id];
    whatsapp.href='https://wa.me/919415324839?text='+encodeURIComponent(lines.join('\n'));whatsapp.hidden=false;
    status.textContent='Enquiry received. Our team will contact you. Reference: '+saved.id;form.reset();
  }catch(error){status.textContent=error.name==='AbortError'?'The connection is taking too long. Please call us or retry.':error.message}
  finally{clearTimeout(timer);submit.disabled=false}
});
