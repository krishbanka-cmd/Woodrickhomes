import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('Every PDF catalogue chooses bigger chunks on fast networks and smaller ones for data saving',async()=>{
 const src=await readFile(new URL('../products/presentation/viewer.js',import.meta.url),'utf8');
 const fn=src.match(/function chooseRangeChunk\(connection\)\{[\s\S]*?\n  \}/)?.[0];
 assert.ok(fn,'adaptive range function present');
 const ctx=vm.createContext({});
 vm.runInContext(fn+';this.chooseRangeChunk=chooseRangeChunk;',ctx);
 const pick=ctx.chooseRangeChunk;
 assert.equal(pick(),1048576,'desktop/wifi default');
 assert.equal(pick({effectiveType:'4g',downlink:12}),1048576,'fast mobile');
 assert.equal(pick({effectiveType:'3g'}),524288,'3G avoids 1 MB download chunks');
 assert.equal(pick({effectiveType:'4g',downlink:2.5}),524288,'slow 4G');
 assert.equal(pick({effectiveType:'2g'}),262144);
 assert.equal(pick({effectiveType:'slow-2g'}),262144);
 assert.equal(pick({effectiveType:'4g',saveData:true}),262144);
 assert.equal(pick({effectiveType:'4g',downlink:0.8}),262144);
 assert.match(src,/\[262144,524288,1048576\]\.includes\(requestedChunk\)/,'diagnostics bounded to supported sizes');
 assert.match(src,/getDocument\(\{url:rawUrl,rangeChunkSize,disableAutoFetch:true,disableStream:true\}\)/);
 assert.ok(src.includes('withDeadline(task.promise,30000'));
});
