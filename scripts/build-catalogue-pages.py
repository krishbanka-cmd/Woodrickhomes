"""Build public catalogue page derivatives; originals remain untouched."""
import concurrent.futures, hashlib, json, pathlib, subprocess, tempfile
import fitz
from PIL import Image
BASE='https://woodrickhomes.com'
OUT=pathlib.Path('assets/catalogue-pages'); OUT.mkdir(parents=True,exist_ok=True)
def get(url,path,headers=None):
 args=['curl','--fail','--silent','--show-error','--location','--retry','2','--max-time','180']
 if headers:args+=['-D',str(headers)]
 subprocess.run(args+[url,'-o',str(path)],check=True)
def build(item):
 key=item['key'];identity=hashlib.sha256(key.encode()).hexdigest()[:24]
 with tempfile.TemporaryDirectory() as tmp:
  pdf=pathlib.Path(tmp)/'original.pdf';hdr=pathlib.Path(tmp)/'headers'
  from urllib.parse import urlencode
  get(BASE+'/api/media?'+urlencode({'raw':'1','key':key}),pdf,hdr)
  etags=[line.split(':',1)[1].strip() for line in hdr.read_text().splitlines() if line.lower().startswith('etag:')]
  if not etags:raise RuntimeError('Missing source ETag: '+key)
  revision=hashlib.sha256((key+etags[-1]).encode()).hexdigest()[:24]
  folder=OUT/revision;folder.mkdir(exist_ok=True);pages=[]
  with fitz.open(pdf) as doc:
   for n,page in enumerate(doc):
    rect=page.rect;scale=2400/max(rect.width,rect.height)
    pix=page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False)
    img=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
    name=f'{n+1}.webp';img.save(folder/name,'WEBP',quality=88,method=4)
    pages.append({'width':pix.width,'height':pix.height,'file':revision+'/'+name})
  print(json.dumps({'catalogue':item.get('title',key),'pages':len(pages),'bytes':sum((OUT/p['file']).stat().st_size for p in pages)}),flush=True)
  return key,{'etag':etags[-1],'pages':pages}
with tempfile.TemporaryDirectory() as tmp:
 index=pathlib.Path(tmp)/'index.json';get(BASE+'/api/media?catalogue=1',index)
 items=[x for x in json.loads(index.read_text())['items'] if x['key'].lower().endswith('.pdf')]
 if not items:raise RuntimeError('No catalogues found')
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:manifest=dict(pool.map(build,items))
(OUT/'index.json').write_text(json.dumps(manifest,separators=(',',':')))
print('Prepared',len(manifest),'catalogues;',sum(len(x['pages']) for x in manifest.values()),'pages',flush=True)
