#!/usr/bin/env python3
"""Build a self-hosted 30-second Woodrick Homes video; keeps source assets local to the deployed site."""
from pathlib import Path
import math, os, urllib.request, subprocess, wave, array
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.promo-build'; WORK.mkdir(exist_ok=True)
OUT=ROOT/'assets/media/woodrick-promo-30s.mp4'; OUT.parent.mkdir(parents=True,exist_ok=True)
W,H=1280,720
G=(226,190,118)
FACE='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
SCENES=[
 ('HOME, MADE EXCEPTIONAL','WOODRICK HOMES','Premium Interiors  /  Building Solutions','photo-1600210492486-724fe5c67fb0'),
 ('BUILD YOUR VISION','QUALITY MATERIALS','Plywood  /  MDF  /  HDHMR  /  WPC','photo-1600607687939-ce8a6c25118c'),
 ('THE FINISHING TOUCH','REFINED SURFACES','Laminates  /  Acrylics  /  Louvers','photo-1600607687920-4e2a09cf159d'),
 ('DESIGNED TO LIVE IN','MODULAR KITCHENS','Smart Design  /  Thoughtful Storage','photo-1556911220-bff31c812dba'),
 ('COMPLETELY CONSIDERED','BATH & INTERIORS','Tiles  /  Sanitaryware  /  Fittings','photo-1600566753190-17f0baa2a6c3'),
 ('MAKE IT WOODRICK','WOODRICK HOMES','woodrickhomes.com','photo-1600210492486-724fe5c67fb0'),
]
def f(n,b=False):return ImageFont.truetype(BOLD if b else FACE,n)
def bg(n,key):
 p=WORK/f'image{n}.jpg'
 if not p.exists():
  try:
   u=f'https://images.unsplash.com/{key}?auto=format&fit=crop&w=1600&q=82'
   q=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'})
   with urllib.request.urlopen(q,timeout=16) as r: p.write_bytes(r.read())
  except Exception as e: print('Remote image not available; branded fallback:',str(e)[:80])
 try:
  im=Image.open(p).convert('RGB')
  ratio=max(W/im.width,H/im.height); im=im.resize((int(im.width*ratio)+2,int(im.height*ratio)+2))
  x=(im.width-W)//2;y=(im.height-H)//2
  return im.crop((x,y,x+W,y+H))
 except Exception:
  im=Image.new('RGB',(W,H)); d=ImageDraw.Draw(im)
  for y in range(H):
   z=int(9+24*y/H)
   d.line((0,y,W,y),fill=(z+7,z+4,z))
  return im
def center(d,y,s,sz,color,b=False):
 font=f(sz,b); box=d.textbbox((0,0),s,font=font)
 d.text(((W-box[2]+box[0])//2,y),s,font=font,fill=color)
def make_scene(i,tup):
 top,title,sub,photo=tup
 im=bg(i,photo).convert('RGBA')
 veil=Image.new('RGBA',(W,H),(5,6,8,155))
 im=Image.alpha_composite(im,veil)
 d=ImageDraw.Draw(im)
 d.rectangle((54,45,W-54,H-45),outline=G,width=2)
 d.line((W//2-46,149,W//2+46,149),fill=G,width=3)
 center(d,94,'W  /  H',29,G,True)
 center(d,225,top,24,(240,212,161))
 center(d,293,title,60 if len(title)<18 else 51,(255,251,244),True)
 d.line((W//2-90,383,W//2+90,383),fill=G,width=2)
 center(d,420,sub,24,(249,237,218))
 if i==5:center(d,507,'EXPLORE PRODUCTS   /   REQUEST A QUOTE',18,G,True)
 else:center(d,575,'woodrickhomes.com',18,G,True)
 d.text((85,647),f'{i+1:02d} / 06',font=f(14),fill=G)
 d.text((997,647),'BETTER SPACES, BEAUTIFULLY',font=f(12),fill=G)
 im.convert('RGB').save(WORK/f'scene{i}.jpg',quality=92)
def make_audio():
 r=32000
 with wave.open(str(WORK/'ambient.wav'),'wb') as a:
  a.setnchannels(1);a.setsampwidth(2);a.setframerate(r)
  chords=[(220,261.63,329.63),(196,246.94,293.66),(174.61,220,261.63),(196,246.94,329.63),(164.81,196,246.94),(220,277.18,329.63)]
  for notes in chords:
   arr=array.array('h')
   for n in range(r*5):
    t=n/r;v=min(1,t/1.2,(5-t)/1.3)*0.13
    x=sum(math.sin(2*math.pi*k*t) for k in notes)/3
    arr.append(int(32767*v*x))
   a.writeframes(arr.tobytes())
def main():
 parts=[]
 for i,s in enumerate(SCENES):
  make_scene(i,s)
  vid=WORK/f'part{i}.mp4';parts.append(vid)
  filt="zoompan=z='min(zoom+0.00033,1.12)':d=120:s=1280x720:fps=24,format=yuv420p,fade=t=in:st=0:d=0.22,fade=t=out:st=4.75:d=0.25"
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-loop','1','-framerate','24','-i',str(WORK/f'scene{i}.jpg'),'-vf',filt,'-t','5','-r','24','-an','-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p',str(vid)],check=True)
 make_audio()
 manifest=WORK/'list.txt';manifest.write_text(''.join(f"file '{p}'\n" for p in parts))
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(manifest),'-i',str(WORK/'ambient.wav'),'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','96k','-t','30','-movflags','+faststart',str(OUT)],check=True)
 print('Video ready:',str(OUT),OUT.stat().st_size)
if __name__=='__main__':main()
