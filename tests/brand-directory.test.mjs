import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBrandDirectory} from '../worker-brand-directory.js';
import {publicMediaList} from '../worker-product-media-sync.js';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('Published brands join the rail/category directory once and retain curated logos',()=>{
 const items=buildBrandDirectory([{key:'vendor-public/a/p/1/pdf.pdf',brand:'Royal Crown',category:'Laminates'},{key:'vendor-public/a/p/1/image.jpg',brand:'ROYAL CROWN',category:'Plywood'},{key:'old.pdf',brand:'Woodline Louvers',category:'Louvers'},{key:'private/kyc.pdf',brand:'Secret',category:'Plywood'}],[{brand:'Woodline',src:'/logo.svg'},{brand:'CenturyPly',src:'/century.svg'}]);
 assert.equal(items.filter(x=>x.brand.toLowerCase()==='royal crown').length,1);assert.equal(items.find(x=>x.brand==='Royal Crown').mediaCount,2);assert.deepEqual(items.find(x=>x.brand==='Royal Crown').categories,['Laminates','Plywood']);assert.equal(items.find(x=>x.brand==='Woodline').src,'/logo.svg');assert.equal(items.find(x=>x.brand==='Woodline').categoryCounts.Louvers,1);assert.deepEqual(items.find(x=>x.brand==='CenturyPly').categories,['Plywood']);assert.ok(!items.some(x=>x.brand==='Secret'));
});
test('Only published approved vendor copies can contribute a brand; suspension removes it',async()=>{
 let status='approved';const key='vendor-public/v/p/1/pdf.pdf',meta={vendorId:'v',productId:'p',brand:'Royal Crown',category:'Laminates',type:'pdf'};
 const env={PRODUCT_MEDIA:{list:async options=>options.delimiter?{objects:[],delimitedPrefixes:['vendor-public/'],truncated:false}:options.prefix==='vendor-public/'?{objects:[{key,customMetadata:meta}],truncated:false}:{objects:[],truncated:false},get:async path=>({json:async()=>path.includes('/records/')?{status}:{publicKeys:status==='pending'?[]:[key]}})}};
 for(const state of ['pending','approved','suspended']){status=state;const data=await publicMediaList(env).then(r=>r.json());const brands=buildBrandDirectory(data.items);assert.equal(brands.some(x=>x.brand==='Royal Crown'),state==='approved')}
});
test('Brand media stays within the selected category while including brand aliases',async()=>{
 const html=await readFile(new URL('../brands/index.html',import.meta.url),'utf8'),source=html.slice(html.indexOf('const norm='),html.indexOf('function pdfCover(')),ctx={requested:'Woodline',params:new URLSearchParams({category:'Louvers'}),title:{},document:{}};vm.runInNewContext(source+';this.matches=belongs',ctx);
 assert.equal(ctx.matches({brand:'Woodline Louvers',category:'Louvers',type:'pdf'}),true);assert.equal(ctx.matches({brand:'Woodline',category:'Laminates',type:'pdf'}),false);assert.equal(ctx.matches({brand:'Royal Crown',category:'Louvers',type:'pdf'}),false);
});

test('Saved brand categories survive a directory refresh without requiring uploaded media',()=>{
 const items=buildBrandDirectory([],[{brand:'Ambuja Cement',label:'Ambuja Cement',categories:['Cement','Tiles','Cement']}]);
 assert.deepEqual(items[0].categories,['Cement','Tiles']);
 const merged=buildBrandDirectory([{key:'ambuja.pdf',brand:'Ambuja Cement',category:'Plywood'}],[{brand:'Ambuja Cement',categories:['Cement']}]);
 assert.deepEqual(merged[0].categories,['Cement','Plywood']);
});
