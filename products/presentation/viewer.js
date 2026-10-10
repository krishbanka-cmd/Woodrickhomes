import {withDeadline} from '/assets/pdf-loading.mjs?v=20261004-catalogue-reliability';

(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const key = params.get('key') || '';
  const inferred = decodeURIComponent(key.split('/').pop() || 'Catalogue').replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const catalogueTitle = params.get('title') || inferred;
  const rawUrl = '/api/media?raw=1&key=' + encodeURIComponent(key);
  const stage = document.getElementById('stage'), frame = document.getElementById('pageFrame'), canvas = document.getElementById('page');
  const quickPreview = document.getElementById('quickPreview');
  const status = document.getElementById('status'), previous = document.getElementById('previous');
  const next = document.getElementById('next'), zoom = document.getElementById('zoom');
  const fullscreen = document.getElementById('fullscreen'), context = canvas.getContext('2d', {alpha: false});
  if (!key) {
    document.title = 'Choose a Catalogue | Woodrick Homes';
    document.getElementById('title').textContent = 'Choose a Catalogue';
    document.getElementById('download').hidden = true;
    canvas.hidden = true; previous.disabled = true; next.disabled = true; zoom.disabled = true; fullscreen.hidden = true;
    status.hidden = false; status.textContent = 'No catalogue was selected. Use Back to choose one from the catalogue library.';
    document.getElementById('count').textContent = '– / –';
    return;
  }
  let pdf = null, current = 1, generation = 0, zoomed = false, referenceAspect = 0, activeRender = null, loadingTask=null;

  // Customer-supplied query parameters must never load an external preview.
  // Existing static covers and our R2-generated first page thumbnails are safe.
  function safePreviewUrl(value){
    if(!value||!value.startsWith('/')||value.startsWith('//'))return '';
    try {
      const url=new URL(value,location.origin);
      if(url.origin!==location.origin)return '';
      const isStatic=/^\/catalogue-covers\/[a-z0-9._/-]+\.(?:webp|png|jpe?g)$/i.test(url.pathname);
      if(!isStatic&&url.pathname!=='/api/catalogue-cover')return '';
      return url.pathname+url.search;
    } catch { return ''; }
  }
  const previewUrl=safePreviewUrl(params.get('cover')||'');
  if(quickPreview&&previewUrl){
    quickPreview.alt=catalogueTitle+' cover preview (full pages loading)';
    quickPreview.onload=()=>{
      quickPreview.dataset.ready='1';
      if(!pdf){
        referenceAspect=quickPreview.naturalWidth&&quickPreview.naturalHeight
          ?quickPreview.naturalWidth/quickPreview.naturalHeight:.75;
        sizeFrame();quickPreview.hidden=false;frame.hidden=false;
        stage.classList.add('has-preview');
        stageTiming('cover-preview-visible');
      }
    };
    quickPreview.onerror=()=>{
      quickPreview.dataset.ready='0';
      quickPreview.hidden=true;
      stage.classList.remove('has-preview');
      if(!pdf)frame.hidden=true;
    };
    quickPreview.src=previewUrl;
  }

  document.title = catalogueTitle + ' | Woodrick Homes';
  document.getElementById('title').textContent = catalogueTitle;
  document.getElementById('download').href = '/api/media?download=1&key=' + encodeURIComponent(key);

  function chooseRangeChunk(connection){
    if(connection?.saveData||/^(?:slow-2g|2g)$/.test(connection?.effectiveType||'')||(typeof connection?.downlink==='number'&&connection.downlink<1.5))return 262144;
    if(connection?.effectiveType==='3g'||(typeof connection?.downlink==='number'&&connection.downlink<3))return 524288;
    return 1048576;
  }
  // Local browser performance markers help audit every brand/category via
  // Performance panel; never send catalogue keys or account data anywhere.
  function stageTiming(stageName) {
    try { performance.mark('woodrick-pdf-'+stageName); } catch {}
  }
  function setStatus(message, retry = false) {
    status.replaceChildren(document.createTextNode(message));
    if (retry) {
      const button = document.createElement('button'); button.textContent = 'Retry'; button.onclick = start; status.appendChild(button);
    }
    // Never trap visitors behind a spinner: the original file is accessible
    // immediately, including on very slow mobile connections.
    if(retry||!pdf){
      const original=document.createElement('a');original.className='link';original.textContent='Open original PDF';original.href=rawUrl;original.target='_blank';original.rel='noopener';status.appendChild(original);
    }
    status.hidden = false;
  }
  function controls() {
    const total = pdf ? pdf.numPages : 0;
    previous.disabled = !pdf || current <= 1; next.disabled = !pdf || current >= total; zoom.disabled = !pdf;
    document.getElementById('count').textContent = pdf ? current + ' / ' + total : '– / –';
  }
  function sizeFrame() {
    const aspect = referenceAspect || .75;
    const availableWidth = Math.max(1, stage.clientWidth - 2), availableHeight = Math.max(1, stage.clientHeight - 2);
    let width = Math.min(availableWidth, availableHeight * aspect), height = width / aspect;
    if (height > availableHeight) { height = availableHeight; width = height * aspect; }
    frame.style.width = Math.max(1, Math.floor(width)) + 'px';
    frame.style.height = Math.max(1, Math.floor(height)) + 'px';
    return {width, height};
  }
  async function render(n, preserveZoom = false) {
    if (!pdf) return;
    current = Math.max(1, Math.min(pdf.numPages, n));
    const ticket = ++generation;
    if (!preserveZoom) zoomed = false;
    stage.classList.toggle('zoomed', zoomed); zoom.textContent = zoomed ? 'Fit page' : 'Zoom in';
    zoom.setAttribute('aria-pressed', String(zoomed)); controls(); setStatus('Loading page…'); canvas.hidden = true;
    try {
      // Wheel, resize and Next can overlap. Finish cancellation before reusing
      // the canvas, and discard superseded requests.
      if (activeRender) {
        const previousRender = activeRender;
        previousRender.cancel();
        try { await previousRender.promise; } catch (_) {}
      }
      if (ticket !== generation) return;
      const pdfPage = await withDeadline(pdf.getPage(current),20000);
      if (ticket !== generation) return;
      const natural = pdfPage.getViewport({scale: 1});
      referenceAspect = natural.width / natural.height;
      const frameSize = sizeFrame();
      const fitScale = Math.min(frameSize.width / natural.width, frameSize.height / natural.height);
      const cssScale = fitScale * (zoomed ? 2 : 1), outputScale = Math.min(devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({scale: cssScale * outputScale});
      canvas.width = Math.max(1, Math.floor(viewport.width)); canvas.height = Math.max(1, Math.floor(viewport.height));
      canvas.style.width = Math.max(1, Math.floor(natural.width * cssScale)) + 'px';
      canvas.style.height = Math.max(1, Math.floor(natural.height * cssScale)) + 'px';
      const task = pdfPage.render({canvasContext: context, viewport});
      activeRender = task;
      try { await withDeadline(task.promise,20000,()=>task.cancel()); } finally { if (activeRender === task) activeRender = null; }
      if (ticket !== generation) return;
      frame.hidden = false; canvas.hidden = false; if(quickPreview)quickPreview.hidden=true;stage.classList.remove('has-preview'); status.hidden = true; canvas.setAttribute('aria-label', catalogueTitle + ', page ' + current);
      if(current===1)stageTiming('first-page-visible');
      if (!zoomed) { stage.scrollTop = 0; stage.scrollLeft = 0; }
      const neighbor = current < pdf.numPages ? current + 1 : current - 1;
      if (neighbor > 0) pdf.getPage(neighbor).catch(() => {});
    } catch (error) { if (ticket === generation) setStatus('This page could not load. Check your connection and retry. ', true); }
  }
  async function start() {
    generation++;
    if(activeRender){activeRender.cancel();try{await activeRender.promise}catch{}activeRender=null;}
    if(loadingTask){const old=loadingTask;loadingTask=null;old.destroy().catch(()=>{});}
    pdf = null; current = 1; referenceAspect = 0;
    const hasCover=!!quickPreview&&quickPreview.dataset.ready==='1';
    if(quickPreview)quickPreview.hidden=!hasCover;
    frame.hidden=!hasCover;stage.classList.toggle('has-preview',hasCover);
    controls(); setStatus(hasCover?'Cover preview ready · loading full catalogue…':'Preparing catalogue…');
    const ticket=generation;
    const slowTimer=setTimeout(()=>{if(ticket===generation&&!pdf)setStatus('Opening the first page… Large catalogues may take a few moments.');},5000);
    try {
      const {pdfEngine}=await withDeadline(import('/assets/pdf-engine.mjs?v=20261010-shared-cache'),15000);
      const pdfjsLib=await withDeadline(pdfEngine(),15000);
      if(ticket!==generation)return;
      // Streaming keeps downloading the entire catalogue while range reads also
      // run. Disable it so first-page reads use bounded byte ranges instead.
      // Real-browser benchmark: on fast connections 1MB ranges reduced
      // Senator's 256KB cold first page 10.8s -> 7.1s and Ristal 7.4s -> 3.6s.
      // Adapt to lower-bandwidth / data-saver connections to avoid excess bytes.
      const requestedChunk=Number(params.get('rangeChunk'));
      const rangeChunkSize=[262144,524288,1048576].includes(requestedChunk)
        ?requestedChunk:chooseRangeChunk(navigator.connection||navigator.mozConnection||navigator.webkitConnection);
      const task=pdfjsLib.getDocument({url:rawUrl,rangeChunkSize,disableAutoFetch:true,disableStream:true});
      loadingTask=task;
      task.onProgress=progress=>{if(ticket!==generation||pdf||!progress||!progress.total)return;const percent=Math.min(99,Math.round(progress.loaded/progress.total*100));setStatus('Preparing catalogue… '+percent+'%');};
      const loaded=await withDeadline(task.promise,30000,()=>task.destroy());
      if(ticket!==generation){await loaded.destroy();return;}
      pdf=loaded;clearTimeout(slowTimer);stageTiming('document-ready');await render(1);
    }
    catch (error) { clearTimeout(slowTimer);if(ticket!==generation)return;console.error('Catalogue load failed:', error); setStatus('This catalogue could not load. Check your connection and retry. ', true); }
  }
  function toggleZoom(event) {
    if (!pdf) return;
    const box = canvas.getBoundingClientRect();
    const x = event && event.currentTarget === canvas ? (event.clientX - box.left) / box.width : .5;
    const y = event && event.currentTarget === canvas ? (event.clientY - box.top) / box.height : .5;
    zoomed = !zoomed;
    render(current, true).then(() => { if (zoomed) { stage.scrollLeft = x * canvas.clientWidth - stage.clientWidth / 2; stage.scrollTop = y * canvas.clientHeight - stage.clientHeight / 2; } });
  }
  previous.onclick = () => render(current - 1); next.onclick = () => render(current + 1);
  zoom.onclick = toggleZoom; canvas.onclick = toggleZoom;
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === 'Escape' && zoomed) { toggleZoom(); return; }
    if (!zoomed && ['ArrowRight', 'PageDown', 'ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); render(current + (['ArrowRight', 'PageDown'].includes(event.key) ? 1 : -1)); }
  });
  // A deliberate mouse-wheel or trackpad scroll moves one page in the fitted
  // presentation. Let the browser scroll normally while zoomed in.
  let wheelAmount = 0, wheelReset, lastWheelPage = 0;
  stage.addEventListener('wheel', event => {
    if (!pdf || zoomed || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();
    if (Date.now() - lastWheelPage < 450) return;
    wheelAmount += event.deltaY;
    clearTimeout(wheelReset);
    wheelReset = setTimeout(() => { wheelAmount = 0; }, 220);
    if (Math.abs(wheelAmount) < 75) return;
    const direction = wheelAmount > 0 ? 1 : -1;
    wheelAmount = 0;
    if (current + direction < 1 || current + direction > pdf.numPages) return;
    lastWheelPage = Date.now();
    render(current + direction);
  }, {passive: false});
  let startPoint = null, suppressClick = false;
  stage.addEventListener('pointerdown', event => { if (!zoomed && event.isPrimary) startPoint = {x:event.clientX,y:event.clientY}; });
  stage.addEventListener('pointerup', event => {
    if (!startPoint) return;
    const dx = event.clientX - startPoint.x, dy = event.clientY - startPoint.y; startPoint = null;
    if (!zoomed && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) { suppressClick = true; render(current + (dx < 0 ? 1 : -1)); setTimeout(() => { suppressClick = false; }, 400); }
  });
  stage.addEventListener('pointercancel', () => { startPoint = null; });
  stage.addEventListener('click', event => { if (suppressClick) { event.stopImmediatePropagation(); event.preventDefault(); suppressClick = false; } }, true);
  fullscreen.hidden = !document.documentElement.requestFullscreen;
  fullscreen.onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { fullscreen.textContent = 'Full screen unavailable'; } };
  document.addEventListener('fullscreenchange', () => { fullscreen.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; if (pdf) render(current); });
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (pdf && !zoomed) render(current); }, 120); });
  start();
})();
