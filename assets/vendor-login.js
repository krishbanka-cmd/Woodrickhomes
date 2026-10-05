'use strict';
(()=>{
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Vendor login');dialog.style.cssText='padding:0;border:1px solid #d7b36a;border-radius:16px;width:min(920px,94vw);max-height:90dvh;background:#fff';
 const close=document.createElement('button');close.textContent='Close ×';close.style.cssText='position:absolute;right:12px;top:10px;z-index:2;padding:8px 12px;background:white;border:1px solid #ddd;border-radius:8px';close.onclick=()=>dialog.close();
 const frame=document.createElement('iframe');frame.title='Woodrick Homes Vendor Login';frame.style.cssText='border:0;width:100%;height:min(720px,84dvh)';dialog.append(close,frame);document.body.append(dialog);
 document.addEventListener('click',event=>{const link=event.target.closest('[data-vendor-login],a[href="/vendor/"]');if(!link||event.ctrlKey||event.metaKey||event.shiftKey)return;event.preventDefault();frame.src='/vendor/';dialog.showModal()});
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='woodrick-vendor-signed-in')return;location.href='/vendor/'});
})();
