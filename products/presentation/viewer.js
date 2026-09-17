import * as pdfjsLib from './vendor/pdf.min.mjs';

(() => {
  'use strict';
  const workerReady = Promise.all([
    '/products/presentation/vendor/pdf.worker.part-1.js',
    '/products/presentation/vendor/pdf.worker.part-2.js',
    '/products/presentation/vendor/pdf.worker.part-3.js',
    '/products/presentation/vendor/pdf.worker.part-4.js'
  ].map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('PDF engine unavailable');
    return response.text();
  })).then(parts => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob(parts, {type: 'text/javascript'}));
  });
  const params = new URLSearchParams(location.search);
  const key = params.get('key') || 'product-sync/louvers/woodline-louvers/woodline-louvers-8x5.pdf';
  const inferred = decodeURIComponent(key.split('/').pop() || 'Catalogue').replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const catalogueTitle = params.get('title') || inferred;
  const rawUrl = '/api/media?raw=1&key=' + encodeURIComponent(key);
  const stage = document.getElementById('stage'), canvas = document.getElementById('page');
  const status = document.getElementById('status'), previous = document.getElementById('previous');
  const next = document.getElementById('next'), zoom = document.getElementById('zoom');
  const fullscreen = document.getElementById('fullscreen'), context = canvas.getContext('2d', {alpha: false});
  let pdf = null, current = 1, generation = 0, zoomed = false;

  document.title = catalogueTitle + ' | Woodrick Homes';
  document.getElementById('title').textContent = catalogueTitle;
  document.getElementById('download').href = '/api/media?download=1&key=' + encodeURIComponent(key);

  function setStatus(message, retry = false) {
    status.replaceChildren(document.createTextNode(message));
    if (retry) { const button = document.createElement('button'); button.textContent = 'Retry'; button.onclick = start; status.appendChild(button); }
    status.hidden = false;
  }
  function controls() {
    const total = pdf ? pdf.numPages : 0;
    previous.disabled = !pdf || current <= 1; next.disabled = !pdf || current >= total; zoom.disabled = !pdf;
    document.getElementById('count').textContent = pdf ? current + ' / ' + total : '– / –';
  }
  async function render(n, preserveZoom = false) {
    if (!pdf) return;
    current = Math.max(1, Math.min(pdf.numPages, n));
    const ticket = ++generation;
    if (!preserveZoom) zoomed = false;
    stage.classList.toggle('zoomed', zoomed); zoom.textContent = zoomed ? 'Fit page' : 'Zoom in';
    zoom.setAttribute('aria-pressed', String(zoomed)); controls(); setStatus('Loading page…'); canvas.hidden = true;
    try {
      const pdfPage = await pdf.getPage(current);
      if (ticket !== generation) return;
      const natural = pdfPage.getViewport({scale: 1});
      const fitScale = Math.min(Math.max(1, stage.clientWidth - 2) / natural.width, Math.max(1, stage.clientHeight - 2) / natural.height);
      const cssScale = fitScale * (zoomed ? 2 : 1), outputScale = Math.min(devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({scale: cssScale * outputScale});
      canvas.width = Math.max(1, Math.floor(viewport.width)); canvas.height = Math.max(1, Math.floor(viewport.height));
      canvas.style.width = Math.max(1, Math.floor(natural.width * cssScale)) + 'px';
      canvas.style.height = Math.max(1, Math.floor(natural.height * cssScale)) + 'px';
      await pdfPage.render({canvasContext: context, viewport}).promise;
      if (ticket !== generation) return;
      canvas.hidden = false; status.hidden = true; canvas.setAttribute('aria-label', catalogueTitle + ', page ' + current);
      if (!zoomed) { stage.scrollTop = 0; stage.scrollLeft = 0; }
      const neighbor = current < pdf.numPages ? current + 1 : current - 1;
      if (neighbor > 0) pdf.getPage(neighbor).catch(() => {});
    } catch (error) { if (ticket === generation) setStatus('This page could not load. Check your connection and retry. ', true); }
  }
  async function start() {
    generation++; pdf = null; current = 1; controls(); setStatus('Preparing catalogue…');
    const ticket=generation;
    const slowTimer=setTimeout(()=>{if(ticket===generation&&!pdf)setStatus('Opening the first page… Large catalogues may take a few moments.');},5000);
    try {
      await workerReady;
      const task=pdfjsLib.getDocument({url:rawUrl,rangeChunkSize:262144,disableAutoFetch:true,disableStream:false});
      task.onProgress=progress=>{if(ticket!==generation||pdf||!progress||!progress.total)return;const percent=Math.min(99,Math.round(progress.loaded/progress.total*100));setStatus('Preparing catalogue… '+percent+'%');};
      pdf=await task.promise;clearTimeout(slowTimer);await render(1);
    }
    catch (error) { clearTimeout(slowTimer);console.error('Catalogue load failed:', error); setStatus('This catalogue could not load. Check your connection and retry. ', true); }
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
