'use strict';
(()=>{
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Vendor login');dialog.style.cssText='padding:0;border:1px solid #dccda9;border-radius:16px;width:min(560px,calc(100vw - 28px));max-width:560px;max-height:calc(100dvh - 24px);overflow:hidden;background:#f6f7f3;box-shadow:0 22px 76px #0005';
 const header=document.createElement('div');header.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #e3e5df;background:#fff';
 const brand=document.createElement('strong');brand.textContent='WOODRICK HOMES · VENDOR LOGIN';brand.style.cssText='font:800 13px/1.4 Arial,sans-serif;letter-spacing:.8px;color:#263a2f';
 const close=document.createElement('button');close.textContent='Close ×';close.type='button';close.setAttribute('aria-label','Close vendor login');close.style.cssText='flex-shrink:0;padding:8px 11px;background:white;border:1px solid #ddd;border-radius:8px;cursor:pointer';close.onclick=()=>dialog.close();
 header.append(brand,close);
 const frame=document.createElement('iframe');frame.title='Woodrick Homes Vendor Login';frame.style.cssText='display:block;border:0;width:100%;height:min(570px,calc(100dvh - 92px));background:#f6f7f3';dialog.append(header,frame);document.body.append(dialog);
 document.addEventListener('click',event=>{const link=event.target.closest('[data-vendor-login],a[href="/vendor/"]');if(!link||event.ctrlKey||event.metaKey||event.shiftKey)return;event.preventDefault();frame.src='/vendor/';dialog.showModal()});
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='woodrick-vendor-signed-in')return;location.href='/vendor/'});
})();
