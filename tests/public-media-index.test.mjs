import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshPublicMediaIndex,STATIC_PUBLIC_MEDIA} from '../worker-product-media-sync.js';

test('public media index excludes private customer records from both items and total',async()=>{
  const objects=[
    {key:'product-sync/laminates/ristal/catalogue.pdf',customMetadata:{category:'Laminates',brand:'Ristal',type:'pdf',title:'Catalogue'}},
    {key:'private/enquiries/records/customer.json',customMetadata:{category:'Laminates',title:'Customer record'}}
  ];
  let index='';const env={PRODUCT_MEDIA:{
    async list({prefix,delimiter}){
      if(delimiter)return {objects:[],delimitedPrefixes:['product-sync/','private/'],truncated:false};
      return {objects:objects.filter(x=>x.key.startsWith(prefix||'')),truncated:false};
    },
    async put(key,value){if(key==='_config/public-media-index-v1.json')index=String(value)}
  }};
  const body=JSON.parse(await refreshPublicMediaIndex(env));
  assert.equal(body.total,1+STATIC_PUBLIC_MEDIA.length);assert.equal(body.items.length,body.total);
  assert.ok(body.items.every(x=>!x.key.startsWith('private/')));
  for(const item of STATIC_PUBLIC_MEDIA)assert.ok(body.items.some(x=>x.key===item.key));
  assert.equal(body.items[0].key,objects[0].key);
  assert.deepEqual(JSON.parse(index),body);
});
