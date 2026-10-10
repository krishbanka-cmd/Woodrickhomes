import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import worker from '../worker-fast.js';

const source=path=>readFile(new URL(path,import.meta.url),'utf8');

test('All three catalogue entry points provide a first-page preview without changing the public PDF key',async()=>{
  const [library,brands,products]=await Promise.all([
    source('../catalogues/index.html'),source('../brands/index.html'),source('../products/index.html')
  ]);
  assert.match(library,/cover='\+encodeURIComponent\(cover\)/);
  assert.match(brands,/cover='\+encodeURIComponent\(pdfCover\(x\)\)/);
  assert.match(products,/preview\?'&cover='\+encodeURIComponent\(preview\)/);
  for(const page of [library,brands,products]){
    assert.match(page,/pdfviewer=1/,'customer PDF must still use shared presentation');
  }
});

test('Quick preview loads before PDF.js and is never a remote image',async()=>{
  const [html,viewer]=await Promise.all([
    source('../products/presentation/index.html'),source('../products/presentation/viewer.js')
  ]);
  assert.match(html,/<img id="quickPreview" class="quick-preview"/);
  assert.match(html,/viewer.js\?v=20261010-quick-preview-v1/);
  assert.match(viewer,/stageTiming\('cover-preview-visible'\)/);
  assert.match(viewer,/quickPreview\.src=previewUrl/);
  assert.ok(viewer.indexOf('quickPreview.src=previewUrl')<viewer.indexOf('  async function start()'),
    'cover can begin downloading before the heavy PDF engine initialises');
  assert.match(viewer,/if\(quickPreview\)quickPreview.hidden=true/,'real PDF replaces the cover');

  const snippet=viewer.match(/function safePreviewUrl\(value\)\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(snippet,'safe preview URL allowlist must be defined');
  const context=vm.createContext({location:{origin:'https://woodrickhomes.com'},URL});
  vm.runInContext(snippet+';this.safePreviewUrl=safePreviewUrl;',context);
  const safe=context.safePreviewUrl;
  assert.equal(safe('/catalogue-covers/ristal-08.webp'),'/catalogue-covers/ristal-08.webp');
  assert.equal(safe('/api/catalogue-cover?brand=Ristal'),'/api/catalogue-cover?brand=Ristal');
  for(const unsafe of ['https://external.example/a.jpg','//external.example/a.jpg',
    '/private/kyc.png','/api/media?key=private/kyc.jpg','javascript:alert(1)']){
    assert.equal(safe(unsafe),'',unsafe);
  }
});

test('PDF viewer redirect preserves approved cover query and back navigation',async()=>{
  const url='https://woodrickhomes.com/api/media?pdfviewer=1&key='+encodeURIComponent('product-sync/laminates/ristal/ristal.pdf')+
    '&cover='+encodeURIComponent('/catalogue-covers/ristal-08.webp')+
    '&return='+encodeURIComponent('/catalogues/?category=Laminates');
  const res=await worker.fetch(new Request(url),{},{});
  assert.equal(res.status,302);
  const destination=new URL(res.headers.get('location'));
  assert.equal(destination.pathname,'/products/presentation/');
  assert.equal(destination.searchParams.get('cover'),'/catalogue-covers/ristal-08.webp');
  assert.equal(destination.searchParams.get('return'),'/catalogues/?category=Laminates');
});
