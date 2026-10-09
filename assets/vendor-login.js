'use strict';
(()=>{
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Vendor login');dialog.style.cssText='position:fixed;inset:auto;top:50%;left:50%;right:auto;bottom:auto;transform:translate(-50%,-50%);margin:0;box-sizing:border-box;padding:0;border:1px solid #dccda9;border-radius:16px;width:min(560px,calc(100vw - 28px));max-width:560px;max-height:calc(100dvh - 24px);overflow:hidden;background:#f6f7f3;box-shadow:0 22px 76px #0005';
 const header=document.createElement('div');header.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #e3e5df;background:#fff';
 const brand=document.createElement('strong');brand.textContent='WOODRICK HOMES · VENDOR LOGIN';brand.style.cssText='font:800 13px/1.4 Arial,sans-serif;letter-spacing:.8px;color:#263a2f';
 const close=document.createElement('button');close.textContent='Close ×';close.type='button';close.setAttribute('aria-label','Close vendor login');close.style.cssText='flex-shrink:0;padding:8px 11px;background:white;border:1px solid #ddd;border-radius:8px;cursor:pointer';close.onclick=()=>dialog.close();
 header.append(brand,close);
 const frame=document.createElement('iframe');frame.title='Woodrick Homes Vendor Login';frame.style.cssText='display:block;border:0;width:100%;height:min(570px,calc(100dvh - 92px));background:#f6f7f3';dialog.append(header,frame);document.body.append(dialog);
 function positionDialog(){
  // Keep the visible homepage navigation and lower brand rail/footer outside the dialog.
  const viewport=window.innerHeight||document.documentElement.clientHeight;
  const margin=12;
  let topLimit=margin,bottomLimit=viewport-margin;
  const nav=document.querySelector('header.nav');
  if(nav){
   const bounds=nav.getBoundingClientRect();
   if(bounds.bottom>0&&bounds.top<viewport&&bounds.bottom<viewport-190){
    topLimit=Math.max(topLimit,bounds.bottom+margin);
   }
  }
  for(const selector of ['.hero-brand-dock','footer.footer']){
   const area=document.querySelector(selector);
   if(!area)continue;
   const bounds=area.getBoundingClientRect();
   if(bounds.bottom>0&&bounds.top<viewport&&bounds.top>topLimit+180){
    bottomLimit=Math.min(bottomLimit,bounds.top-margin);
   }
  }
  // Smaller viewports keep the login scrollable inside the iframe rather than masking the site.
  const space=Math.max(0,bottomLimit-topLimit);
  if(space<190){topLimit=margin;bottomLimit=viewport-margin;}
  const available=Math.max(180,bottomLimit-topLimit);
  let preferredFrameHeight=null;
  try{
   const inner=frame.contentDocument;
   const main=inner&&inner.querySelector('main');
   if(main){
    const rect=main.getBoundingClientRect();
    const measured=Math.ceil(Math.max(main.scrollHeight+rect.top,rect.bottom)+4);
    if(Number.isFinite(measured)&&measured>0)preferredFrameHeight=measured;
   }
  }catch{}
  const headerHeight=header.offsetHeight||52;
  const height=Math.min(570,available,preferredFrameHeight===null?570:Math.max(220,preferredFrameHeight+headerHeight));
  dialog.style.top=(topLimit+(bottomLimit-topLimit)/2)+'px';
  dialog.style.maxHeight=height+'px';
  frame.style.height=Math.max(140,height-headerHeight)+'px';
 }
 let contentObserver=null;
 frame.onload=()=>{
  if(contentObserver){contentObserver.disconnect();contentObserver=null;}
  try{
   const inner=frame.contentDocument,main=inner&&inner.querySelector('main');
   if(main&&typeof ResizeObserver!=='undefined'){
    contentObserver=new ResizeObserver(()=>{if(dialog.open)window.requestAnimationFrame(positionDialog)});
    contentObserver.observe(main);
   }
  }catch{}
  if(dialog.open)positionDialog();
 };
 document.addEventListener('click',event=>{const link=event.target.closest('[data-vendor-login],a[href="/vendor/"]');if(!link||event.ctrlKey||event.metaKey||event.shiftKey)return;event.preventDefault();frame.src='/vendor/';dialog.showModal();positionDialog()});
 window.addEventListener('resize',()=>{if(dialog.open)positionDialog()});
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='woodrick-vendor-signed-in')return;location.href='/vendor/'});
})();
