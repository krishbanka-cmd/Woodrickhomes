import app from './worker-admin-media-hierarchy.js';

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    const url = new URL(request.url);
    const isAdmin = request.method === 'GET' && (
      url.pathname === '/admin-products/' ||
      url.pathname === '/admin-products' ||
      url.pathname === '/admin-products/index.html'
    );
    if (!isAdmin) return response;
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;

    let html = await response.text();

    // The original admin page starts its old flat Product Media loader on page load.
    // That request can finish after the hierarchy loader and overwrite the clean tree.
    // Disable only that automatic flat load; Library loading remains unchanged.
    html = html.replace(
      'renderCategories();loadMedia();loadLibrary();',
      'renderCategories();loadLibrary();'
    );

    // Remove older injected Product Media UI scripts/styles so only the final
    // Category → Brand → Catalogue hierarchy controls the product list.
    html = html
      .replace(/<script id="woodrick-admin-refresh-stable-v[0-9]+">[\s\S]*?<\/script>/g, '')
      .replace(/<style id="woodrick-admin-refresh-stable-style-v[0-9]+">[\s\S]*?<\/style>/g, '')
      .replace(/<script id="woodrick-admin-media-hybrid-v[0-9]+">[\s\S]*?<\/script>/g, '')
      .replace(/<style id="woodrick-admin-media-hybrid-style-v[0-9]+">[\s\S]*?<\/style>/g, '');

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
    headers.set('x-woodrick-version', 'admin-media-final-v1');
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
