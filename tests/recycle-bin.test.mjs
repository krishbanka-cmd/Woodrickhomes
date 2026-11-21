import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import worker from '../worker-fast.js';
import {expireTrash, listTrash, saveTrash} from '../worker-recycle-bin.js';

class MemoryBucket {
  objects = new Map();

  async put(key, value, options = {}) {
    if (options.onlyIf?.etagDoesNotMatch === '*' && this.objects.has(key)) return null;
    const bytes = Buffer.from(await new Response(value).arrayBuffer());
    const etag = createHash('sha256').update(bytes).digest('hex');
    const object = {
      key, etag, size: bytes.length, uploaded: new Date(),
      customMetadata: options.customMetadata, httpMetadata: options.httpMetadata
    };
    this.objects.set(key, {object, bytes});
    return object;
  }

  async head(key) {
    return this.objects.get(key)?.object ?? null;
  }

  async get(key, options = {}) {
    const entry = this.objects.get(key);
    if (!entry) return null;
    if (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== entry.object.etag) return entry.object;
    const response = new Response(entry.bytes);
    return {...entry.object, body: response.body, text: () => response.text(), json: () => response.json()};
  }

  async delete(keys) {
    for (const key of [keys].flat()) this.objects.delete(key);
  }

  async list({prefix = '', delimiter}) {
    const objects = [];
    const delimitedPrefixes = new Set();
    for (const {object} of this.objects.values()) {
      if (!object.key.startsWith(prefix)) continue;
      const index = delimiter ? object.key.indexOf(delimiter, prefix.length) : -1;
      if (index < 0) objects.push(object);
      else delimitedPrefixes.add(object.key.slice(0, index + 1));
    }
    return {objects, delimitedPrefixes: [...delimitedPrefixes], truncated: false};
  }
}

function setup() {
  const bucket = new MemoryBucket();
  const env = {PRODUCT_MEDIA: bucket, ADMIN_UPLOAD_TOKEN: 'local-test-code'};
  const request = (path, body, authorized = true, method = body ? 'POST' : 'GET') => worker.fetch(
    new Request('https://preview.test' + path, {
      method,
      headers: {
        ...(authorized ? {authorization: 'Bearer ' + env.ADMIN_UPLOAD_TOKEN} : {}),
        ...(body ? {'content-type': 'application/json'} : {})
      },
      body: body ? JSON.stringify(body) : undefined
    }), env, {waitUntil() {}}
  );
  return {bucket, request};
}

test('admin reviews and restores a grouped Library PDF, pages and synced copy', async () => {
  const {bucket, request} = setup();
  const pdf = 'library/sample/laminates/collection/original/collection.pdf';
  const jpg = 'library/sample/laminates/collection/jpg/page-001.jpg';
  const synced = 'product-sync/laminates/sample/collection.pdf';
  const metadata = {brand: 'Sample', category: 'Laminates', catalogue: 'Collection'};
  await bucket.put(pdf, 'pdf content', {
    customMetadata: {...metadata, type: 'original-pdf'}, httpMetadata: {contentType: 'application/pdf'}
  });
  await bucket.put(jpg, 'jpg content', {customMetadata: {...metadata, type: 'jpg-page'}});
  await bucket.put(synced, 'pdf content', {customMetadata: {...metadata, type: 'pdf', sourceKey: pdf}});

  assert.equal((await request('/api/upload', {action: 'delete-library', keys: [pdf, jpg]}, false)).status, 401);
  assert.equal((await request('/api/upload', {action: 'delete-media', keys: [synced]})).status, 400);
  const response = await request('/api/upload', {action: 'delete-library', keys: [pdf, jpg]});
  assert.equal(response.status, 200);
  const {id, deleted} = await response.json();
  assert.equal(deleted, 3);
  for (const key of [pdf, jpg, synced]) assert.equal(await bucket.head(key), null);
  assert.equal((await request('/api/recycle-bin?id=' + id + '&file=0', undefined, false)).status, 401);
  const library = await (await request('/api/media?prefix=library/', undefined, false)).json();
  assert.deepEqual(library.items, []);
  const preview = await request('/api/recycle-bin?id=' + id + '&file=0');
  assert.equal(await preview.text(), 'pdf content');
  assert.equal(preview.headers.get('content-type'), 'application/pdf');
  const {items: [item]} = await (await request('/api/recycle-bin')).json();
  assert.equal(Date.parse(item.expiresAt) - Date.parse(item.deletedAt), 30 * 86400000);
  assert.equal((await request('/api/recycle-bin', {id})).status, 200);
  assert.equal((await bucket.head(pdf)).customMetadata.brand, 'Sample');
  assert.ok(await bucket.head(jpg));
  assert.ok(await bucket.head(synced));
  assert.deepEqual(await listTrash(bucket), []);
});

test('brand restore recovers the saved display name and category assignments', async () => {
  const {request} = setup();
  const brand = 'Preview Sample';
  assert.equal((await request('/api/brands', {
    item: {brand, label: 'Sample Display', categories: ['Plywood'], railEnabled: false}
  })).status, 200);
  assert.equal((await request('/api/brands', {action: 'delete', brand})).status, 200);
  const managed = async () => (await (await request('/api/brands?scope=managed')).json()).items;
  assert.equal((await managed()).some(item => item.brand === brand), false);
  const {items: [entry]} = await (await request('/api/recycle-bin')).json();
  assert.equal(entry.title, 'Sample Display');
  assert.equal((await request('/api/recycle-bin', {id: entry.id})).status, 200);
  const restored = (await managed()).find(item => item.brand === brand);
  assert.equal(restored.label, 'Sample Display');
  assert.deepEqual(restored.categories, ['Plywood']);
  assert.equal(restored.railEnabled, false);
});

test('restoring cannot overwrite a replacement upload, and expired files are purged', async () => {
  const {bucket, request} = setup();
  const key = 'products/catalogue.pdf';
  await bucket.put(key, 'old PDF');
  const {id} = await (await request('/api/upload', {action: 'delete-media', keys: [key]})).json();
  await bucket.put(key, 'new PDF');
  assert.equal((await request('/api/recycle-bin', {id})).status, 409);
  const [entry] = await listTrash(bucket);
  assert.ok(await bucket.head(entry.files[0].backup));
  await saveTrash(bucket, {...entry, expiresAt: new Date(0).toISOString()});
  assert.equal((await request('/api/recycle-bin', {id})).status, 404);
  await expireTrash(bucket);
  assert.equal(await bucket.head(entry.files[0].backup), null);
  assert.equal(await (await bucket.get(key)).text(), 'new PDF');
});

test('category can be restored until expiry while linked product files are kept', async () => {
  const {bucket, request} = setup();
  const name = 'Preview Category';
  const pdf = 'products/preview-category/catalogue.pdf';
  const categories = async () => (await (await request('/api/categories')).json()).categories;
  const deleteCategory = () => request('/api/categories', {name}, true, 'DELETE');
  await bucket.put(pdf, 'linked PDF', {customMetadata:{category:name}});
  assert.equal((await request('/api/categories', {name})).status, 200);
  assert.ok((await categories()).includes(name));
  assert.equal((await request('/api/categories', {name}, false, 'DELETE')).status, 401);
  const {id} = await (await deleteCategory()).json();
  assert.ok(id);
  assert.ok(!(await categories()).includes(name));
  assert.equal((await request('/api/categories', {name})).status, 409);
  const [entry] = await listTrash(bucket);
  assert.equal(entry.kind, 'category');
  assert.equal((await request('/api/recycle-bin', {id})).status, 200);
  assert.ok((await categories()).includes(name));

  const second = await (await deleteCategory()).json();
  const [expired] = await listTrash(bucket);
  await saveTrash(bucket, {...expired, expiresAt: new Date(0).toISOString()});
  await expireTrash(bucket);
  assert.equal((await request('/api/recycle-bin', {id:second.id})).status, 404);
  assert.ok(!(await categories()).includes(name));
  assert.ok(await bucket.head(pdf));
});

test('uploaded video can be reviewed and restored with its metadata', async () => {
  const {bucket, request} = setup();
  const key = 'products/preview.mp4';
  await bucket.put(key, 'video content', {httpMetadata:{contentType:'video/mp4'}});
  assert.equal((await request('/api/upload', {action:'delete-media', keys:[key]})).status, 200);
  const {items:[entry]} = await (await request('/api/recycle-bin')).json();
  assert.equal(entry.kind, 'video');
  const review = await request('/api/recycle-bin?id=' + entry.id + '&file=0');
  assert.equal(review.headers.get('content-type'), 'video/mp4');
  assert.equal(await review.text(), 'video content');
  assert.equal((await request('/api/recycle-bin', {id:entry.id})).status, 200);
  assert.equal((await bucket.head(key)).httpMetadata.contentType,'video/mp4');
});
