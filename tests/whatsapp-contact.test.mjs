import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {whatsappNumber,whatsappRedirect,whatsappContactResponse} from '../worker-whatsapp-contact.js';

test('WhatsApp enquiry number is centrally configurable with a valid fallback',()=>{
 assert.equal(whatsappNumber(), '918090781345');
 assert.equal(whatsappNumber({WHATSAPP_NUMBER:'9415324839'}),'919415324839');
 assert.equal(whatsappNumber({WHATSAPP_NUMBER:'+91 8090781347'}),'918090781347');
 assert.equal(whatsappNumber({WHATSAPP_NUMBER:'javascript:alert(1)'}),'918090781345');
});
test('Central WhatsApp route preserves enquiry details and uses latest number without caching',()=>{
 const text='Woodline 1mm / 1646HG — 10 sheets & delivery?';
 const request=new Request('https://woodrickhomes.com/whatsapp?text='+encodeURIComponent(text)+'&to=111&redirect=https://example.com');
 const response=whatsappRedirect(request,{WHATSAPP_NUMBER:'8090781347'});
 const target=new URL(response.headers.get('location'));
 assert.equal(response.status,302);assert.equal(target.origin,'https://wa.me');
 assert.equal(target.pathname,'/918090781347');assert.equal(target.searchParams.get('text'),'Woodrick Homes Website Enquiry\n\n'+text);
 assert.deepEqual([...target.searchParams.keys()],['text']);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(whatsappRedirect(new Request(request,{method:'POST'}),{}).status,405);
 const greeting=new URL(whatsappRedirect(new Request('https://woodrickhomes.com/whatsapp?text='+encodeURIComponent('Hello Woodrick Homes, I am interested in Woodline 1mm 1646HG, 10 sheets.')),{}).headers.get('location')).searchParams.get('text');
 assert.equal(greeting,'Woodrick Homes Website Enquiry\n\nI am interested in Woodline 1mm 1646HG, 10 sheets.');
 assert.match(new URL(whatsappRedirect(new Request('https://woodrickhomes.com/whatsapp'),{}).headers.get('location')).searchParams.get('text'),/^Woodrick Homes Website Enquiry/);
});
test('Homepage, product and design enquiry links use central route and retain call numbers',async()=>{
 for(const path of ['index.html','products/index.html','design-your-space.html','finance/enquiry.js']){
  const source=await readFile(new URL('../'+path,import.meta.url),'utf8');
  const type=path.endsWith('.js')?'application/javascript':'text/html';
  const result=await whatsappContactResponse(new Response(source,{headers:{'content-type':type}}),new URL('https://woodrickhomes.com/'+path),{});
  const body=await result.text();
  assert.ok(!body.includes('https://wa.me/919415324839'),path);
  assert.ok(body.includes('/whatsapp'),path);
  if(source.includes('tel:+919415324839'))assert.ok(body.includes('tel:+919415324839'),path);
 }
});
test('WhatsApp labels update while private records and media responses remain untouched',async()=>{
 const source='<a href="https://wa.me/919415324839?text=Woodline">+91 94153 24839</a><a href="tel:+919415324839">9415324839</a>';
 const response=await whatsappContactResponse(new Response(source,{headers:{'content-type':'text/html','content-length':'99','etag':'old'}}),new URL('https://woodrickhomes.com/'),{});
 const body=await response.text();
 assert.match(body,/href="\/whatsapp\?text=Woodline">\+91 8090781345/);
 assert.match(body,/href="tel:\+919415324839">9415324839/);
 assert.equal(response.headers.get('content-length'),null);assert.equal(response.headers.get('etag'),null);
 for(const [path,type] of [['/api/media','application/json'],['/admin-products/','text/html'],['/products/presentation/vendor/pdf.mjs','application/javascript']]){
  const original=new Response(source,{headers:{'content-type':type}});
  assert.equal(await whatsappContactResponse(original,new URL('https://woodrickhomes.com'+path),{}),original);
 }
});
