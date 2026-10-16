import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {canonicalMediaCategory,canonicalBrand} from '../worker-brand-directory.js';
async function registry(){const context={window:{}};vm.runInNewContext(await readFile(new URL('../assets/catalogue-presentation.js',import.meta.url),'utf8'),context);return context.window.WoodrickCatalogue}
test('Listing classification matches server and respects an explicit vendor category',async()=>{
 const c=await registry();
 for(const item of [
  {category:'Doors',title:'Woodline Door Skin'},
  {category:'Laminates',title:'Door Skin Collection'},
  {category:'door-skins',title:'Range'},
  {category:'Doors',title:'Interior Doors'},
  {category:'louver',title:'Range'}
 ])assert.equal(c.mediaCategory(item),canonicalMediaCategory(item));
 assert.equal(c.mediaCategory({category:'Laminates',title:'Door Skin Collection'}),'Laminates');
 assert.equal(c.categoryLabel('Door Skin'),'Doorskin');
 for(const name of ['Woodline Louvers','ristal1mm','EBCO Hardware'])assert.equal(c.brand(name),canonicalBrand(name));
});
test('Generated vendor covers are tied to the exact PDF revision and uploaded covers win',async()=>{
 const c=await registry(),prefix='vendor-public/c1954a5d-75b1-4a0b-8dd7-1b8c0acfee9a/';
 for(const [id,name] of [['bb6ad925-625f-4c0b-851d-3903129a243d','royal-crown-1mm-r1'],['e28bab7d-addc-41bc-98d9-565a4f135a3e','senator-sanitary-r1']]){
  const key=prefix+id+'/1/pdf.pdf';assert.equal(c.cover({key}),'/catalogue-covers/'+name+'.webp');
  assert.equal(c.cover({key:key.replace('/1/','/2/')}),'');
  assert.equal(c.cover({key,coverUrl:'/api/media?key=new-cover'}),'/api/media?key=new-cover');
  const bytes=await readFile(new URL('../catalogue-covers/'+name+'.webp',import.meta.url));assert.equal(bytes.toString('ascii',8,12),'WEBP');
 }
});
