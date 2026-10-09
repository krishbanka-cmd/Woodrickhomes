import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('PDF range A/B is bounded and default stays safe for every catalogue',async()=>{
 const src=await readFile(new URL('../products/presentation/viewer.js',import.meta.url),'utf8');
 assert.match(src,/const requestedChunk=Number\(params\.get\('rangeChunk'\)\)/);
 assert.match(src,/\[262144,524288,1048576\]\.includes\(requestedChunk\)\?requestedChunk:262144/);
 assert.match(src,/getDocument\(\{url:rawUrl,rangeChunkSize,disableAutoFetch:true,disableStream:true\}\)/);
 assert.ok(!src.includes('disableAutoFetch:false'));
});
