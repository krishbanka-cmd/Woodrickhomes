(() => {
  'use strict';
  const total = 8;
  const stage = document.getElementById('stage');
  const page = document.getElementById('page');
  const status = document.getElementById('status');
  const previous = document.getElementById('previous');
  const next = document.getElementById('next');
  const zoom = document.getElementById('zoom');
  const fullscreen = document.getElementById('fullscreen');
  const cache = new Map();
  let current = 1, generation = 0, zoomed = false, ready = false;
  function source(n) { return '/products/presentation/woodline-louvers-v1/page-' + n + '.webp'; }
  function load(n) {
    if (!cache.has(n)) {
      const job = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Page unavailable'));
        image.src = source(n);
      });
      cache.set(n, job);
      job.catch(() => { if (cache.get(n) === job) cache.delete(n); });
    }
    return cache.get(n);
  }
  function fit() {
    zoomed = false;
    stage.classList.remove('zoomed');
    // Size against BOTH available dimensions; percentage max-height alone
    // can resolve against an intrinsic grid row and crop portrait pages.
    const width = page.naturalWidth, height = page.naturalHeight;
    if (width && height) {
      const scale = Math.min(stage.clientWidth / width, stage.clientHeight / height);
      page.style.width = Math.max(1, Math.floor(width * scale)) + 'px';
      page.style.height = Math.max(1, Math.floor(height * scale)) + 'px';
    }
    stage.scrollTop = 0; stage.scrollLeft = 0;
    zoom.textContent = 'Zoom in'; zoom.setAttribute('aria-pressed', 'false');
  }
  function toggleZoom(event) {
    if (!ready) return;
    if (zoomed) { fit(); return; }
    const box = page.getBoundingClientRect();
    const x = event && event.type === 'click' && event.currentTarget === page ? (event.clientX - box.left) / box.width : .5;
    const y = event && event.type === 'click' && event.currentTarget === page ? (event.clientY - box.top) / box.height : .5;
    const scale = Math.max(2, Math.min(4, stage.clientWidth / box.width));
    page.style.width = Math.round(box.width * scale) + 'px';
    page.style.height = Math.round(box.height * scale) + 'px';
    zoomed = true; stage.classList.add('zoomed');
    stage.scrollLeft = x * box.width * scale - stage.clientWidth / 2;
    stage.scrollTop = y * box.height * scale - stage.clientHeight / 2;
    zoom.textContent = 'Fit page'; zoom.setAttribute('aria-pressed', 'true');
  }
  async function show(n) {
    current = Math.max(1, Math.min(total, n));
    const requested = current, ticket = ++generation;
    fit(); ready = false; zoom.disabled = true;
    page.hidden = true; page.style.visibility = 'hidden';
    previous.disabled = current === 1; next.disabled = current === total;
    document.getElementById('count').textContent = current + ' / ' + total;
    status.textContent = 'Loading page…'; status.hidden = false;
    try {
      await load(requested);
      if (ticket !== generation) return;
      page.src = source(requested);
      if (page.decode) await page.decode();
      if (ticket !== generation) return;
      fit();
      page.alt = 'Woodline Louvers, page ' + requested;
      page.hidden = false; page.style.visibility = '';
      status.hidden = true; ready = true; zoom.disabled = false;
      for (const neighbor of [requested + 1, requested - 1]) {
        if (neighbor > 0 && neighbor <= total) load(neighbor).catch(() => {});
      }
    } catch (error) {
      if (ticket !== generation) return;
      status.textContent = 'This page could not load. Check your connection and retry. ';
      const retry = document.createElement('button'); retry.textContent = 'Retry';
      retry.onclick = () => { cache.delete(requested); show(requested); };
      status.appendChild(retry);
    }
  }
  previous.onclick = () => show(current - 1);
  next.onclick = () => show(current + 1);
  zoom.onclick = toggleZoom; page.onclick = toggleZoom;
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === 'Escape') { fit(); return; }
    if (zoomed) return;
    if (['ArrowRight', 'PageDown', 'ArrowLeft', 'PageUp'].includes(event.key)) {
      event.preventDefault(); show(current + (['ArrowRight', 'PageDown'].includes(event.key) ? 1 : -1));
    }
  });
  let start = null, suppressClick = false;
  stage.addEventListener('pointerdown', e => { if (!zoomed && e.isPrimary) start = {x:e.clientX,y:e.clientY}; });
  stage.addEventListener('pointerup', e => {
    if (!start) return;
    const dx = e.clientX-start.x, dy = e.clientY-start.y; start=null;
    if (!zoomed && Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.5) {
      suppressClick=true; show(current+(dx<0?1:-1)); setTimeout(()=>{suppressClick=false;},400);
    }
  });
  stage.addEventListener('pointercancel',()=>{start=null;});
  stage.addEventListener('click',e=>{if(suppressClick){e.stopImmediatePropagation();e.preventDefault();suppressClick=false;}},true);
  fullscreen.hidden = !document.documentElement.requestFullscreen;
  fullscreen.onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { fullscreen.textContent='Full screen unavailable'; }
  };
  document.addEventListener('fullscreenchange',()=>{fullscreen.textContent=document.fullscreenElement?'Exit full screen':'Full screen';fit();});
  window.addEventListener('resize',fit);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { if (!zoomed) fit(); }).observe(stage);
  }
  show(1);
})();
