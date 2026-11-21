const ROOT = 'private/recycle-bin/';
const RECORDS = ROOT + 'records/';
const RETENTION = 30 * 24 * 60 * 60 * 1000;
const recordKey = id => RECORDS + id + '.json';
const backupKey = (id, index) => ROOT + 'files/' + id + '/' + index;

export async function listTrash(bucket) {
  const entries = [];
  let cursor;
  do {
    const page = await bucket.list({prefix: RECORDS, cursor});
    for (const item of page.objects) {
      const object = await bucket.get(item.key);
      if (object) entries.push(await object.json());
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return entries;
}

export function newTrashEntry(kind, title) {
  const now = Date.now();
  return {id: crypto.randomUUID(), kind, title, deletedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RETENTION).toISOString()};
}

export function saveTrash(bucket, entry) {
  return bucket.put(recordKey(entry.id), JSON.stringify(entry));
}

export async function moveMediaToTrash(bucket, keys, kind) {
  const sources = [];
  for (const key of keys) {
    const source = await bucket.head(key);
    if (!source) continue;
    sources.push(source);
  }
  if (!sources.length) return null;
  const metadata = sources[0].customMetadata || {};
  const mediaKind = metadata.type || (sources[0].httpMetadata?.contentType === 'application/pdf' ? 'pdf' : null) || sources[0].httpMetadata?.contentType?.split('/')[0];
  const entryKind = kind === 'product' && ['pdf','video'].includes(mediaKind) ? mediaKind : kind;
  const entry = {...newTrashEntry(entryKind, metadata.catalogue || metadata.title || sources[0].key),
    brand: metadata.brand, category: metadata.category, files: []};

  // Register pending copies so the scheduled cleanup can recover interrupted moves.
  entry.files = sources.map((source,index) => ({
    key: source.key, backup: backupKey(entry.id,index), etag: source.etag,
    httpMetadata: source.httpMetadata, customMetadata: source.customMetadata
  }));
  await saveTrash(bucket,{...entry,pending:true});
  try {
    for (const file of entry.files) {
      const object = await bucket.get(file.key,{onlyIf:{etagMatches:file.etag}});
      if (!object?.body) throw Error('Media changed while preparing the Recycle Bin. Refresh and try again.');
      await bucket.put(file.backup,object.body);
    }
    await saveTrash(bucket,entry);
  } catch (error) {
    await removeTrash(bucket,entry);
    throw error;
  }
  for (const file of entry.files) {
    const latest = await bucket.head(file.key);
    if (latest?.etag === file.etag) await bucket.delete(file.key);
  }
  return entry;
}

export async function readTrash(bucket, id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const object = await bucket.get(recordKey(id));
  return object ? object.json() : null;
}

export async function restoreTrashMedia(bucket, entry) {
  for (const file of entry.files) {
    const existing = await bucket.head(file.key);
    const backup = await bucket.head(file.backup);
    if (!backup) throw Error('A backup file is unavailable.');
    if (existing && existing.etag !== backup.etag && existing.etag !== file.etag) {
      throw Error('A newer file already uses this location. Resolve the conflict before restoring.');
    }
  }
  for (const file of entry.files) {
    const object = await bucket.get(file.backup);
    const result = await bucket.put(file.key, object.body, {
      httpMetadata: file.httpMetadata, customMetadata: file.customMetadata,
      onlyIf: {etagDoesNotMatch: '*'}
    });
    if (result) continue;
    const existing = await bucket.head(file.key);
    if (existing?.etag !== object.etag && existing?.etag !== file.etag) {
      throw Error('A file was uploaded during restore. Resolve the conflict before retrying.');
    }
  }
}

export async function removeTrash(bucket, entry) {
  if (entry.files?.length) {
    for (let index = 0; index < entry.files.length; index += 1000) {
      await bucket.delete(entry.files.slice(index, index + 1000).map(file => file.backup));
    }
  }
  await bucket.delete(recordKey(entry.id));
}

export async function expireTrash(bucket) {
  if (!bucket) return;
  for (const entry of await listTrash(bucket)) {
    if (Date.parse(entry.expiresAt) <= Date.now()) await removeTrash(bucket, entry);
  }
}
