const allowedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/webm'
]);
const maxBytes = 100 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function slug(v = '') {
  return v.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}

async function handleMedia(request, env) {
  if (!env.PRODUCT_MEDIA) return json({ error: 'PRODUCT_MEDIA R2 binding is missing' }, 500);
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (key) {
      const obj = await env.PRODUCT_MEDIA.get(key);
      if (!obj) return new Response('Not found', { status: 404 });
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set('etag', obj.httpEtag);
      headers.set('cache-control', 'public, max-age=3600');
      return new Response(obj.body, { headers });
    }
    const listed = await env.PRODUCT_MEDIA.list({ limit: 100 });
    const items = listed.objects
      .map((o) => ({ key:o.key,size:o.size,uploaded:o.uploaded,...(o.customMetadata||{}) }))
      .sort((a,b)=>String(b.uploadedAt||b.uploaded).localeCompare(String(a.uploadedAt||a.uploaded)));
    return json({ items, truncated: listed.truncated });
  } catch (err) {
    return json({ error: `Media API error: ${err && err.message ? err.message : 'Unknown error'}` }, 500);
  }
}

async function handleUpload(request, env) {
  if (!env.PRODUCT_MEDIA) return json({ error: 'PRODUCT_MEDIA R2 binding is missing' }, 500);
  if (!env.ADMIN_UPLOAD_TOKEN) return json({ error: 'ADMIN_UPLOAD_TOKEN secret is missing' }, 500);

  const auth = request.headers.get('authorization') || '';
  if (auth !== `Bearer ${env.ADMIN_UPLOAD_TOKEN}`) return json({ error: 'Invalid admin access code' }, 401);

  try {
    const form = await request.formData();
    const file = form.get('file');
    const category = String(form.get('category') || '').trim();
    const type = String(form.get('type') || '').trim();
    const title = String(form.get('title') || '').trim();

    if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'Please select a file' }, 400);
    if (!category || !title) return json({ error: 'Category and title are required' }, 400);
    if (!allowedTypes.has(file.type)) return json({ error: 'Unsupported file type' }, 415);
    if (file.size > maxBytes) return json({ error: 'File is too large. Maximum size is 100 MB.' }, 413);

    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${slug(category)}/${type}/${Date.now()}-${slug(title)}.${ext}`;
    const meta = {
      category,
      title,
      type,
      originalName: file.name,
      uploadedAt: new Date().toISOString()
    };

    const body = await file.arrayBuffer();
    await env.PRODUCT_MEDIA.put(key, body, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
      customMetadata: meta
    });

    return json({ ok:true,key,category,title,type,url:`/api/media?key=${encodeURIComponent(key)}` }, 201);
  } catch (err) {
    return json({ error: `Upload API error: ${err && err.message ? err.message : 'Unknown error'}` }, 500);
  }
}

async function serveAssetWithAppEnhancements(request, env, url) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    return json({ error: 'Static assets binding is unavailable' }, 500);
  }

  const response = await env.ASSETS.fetch(request);
  if (request.method !== 'GET') return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  const pwaHead = `
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0b0b0b">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Woodrick Homes">
<link rel="icon" href="/app-icon.svg" type="image/svg+xml">`;
  if (!html.includes('rel="manifest"')) {
    html = html.includes('</head>') ? html.replace('</head>', pwaHead + '\n</head>') : pwaHead + html;
  }

  const swRegistration = `
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
</script>`;
  if (!html.includes("navigator.serviceWorker.register('/sw.js')")) {
    html = html.includes('</body>') ? html.replace('</body>', swRegistration + '\n</body>') : html + swRegistration;
  }

  const isUploadEntryPage = url.pathname==='/' || url.pathname==='/index.html' || url.pathname==='/products' || url.pathname==='/products/' || url.pathname==='/products/index.html';
  if (isUploadEntryPage && !html.includes('aria-label="Upload product media"')) {
    const uploadButton=`\n<a href="/admin-products/" aria-label="Upload product media" style="position:fixed;left:18px;bottom:22px;right:auto;z-index:99999;background:#f0c96b;color:#111;border:2px solid #111;padding:13px 16px;font-family:Arial,sans-serif;font-size:12px;font-weight:900;letter-spacing:.04em;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.28)">UPLOAD PHOTO / PDF / VIDEO</a>`;
    html = html.includes('</body>') ? html.replace('</body>', uploadButton + '\n</body>') : html + uploadButton;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-cache');
  return new Response(html, { status:response.status,statusText:response.statusText,headers });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/media' && request.method === 'GET') return handleMedia(request, env);
      if (url.pathname === '/api/upload' && request.method === 'POST') return handleUpload(request, env);
      if (url.pathname === '/api/upload' && request.method === 'OPTIONS') {
        return new Response(null, { status:204,headers:{ allow:'POST, OPTIONS' } });
      }
      return serveAssetWithAppEnhancements(request, env, url);
    } catch (err) {
      return json({ error: `Worker error: ${err && err.message ? err.message : 'Unknown error'}` }, 500);
    }
  }
};
