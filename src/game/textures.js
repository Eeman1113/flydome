// SKYBOUND · textures
import * as THREE from 'three';
import { $, clamp, lerp } from './util.js';
import { RUNWAY_HALF_L, RUNWAY_HALF_W, WORLD_SEED, fx } from './config.js';
import { terrain } from './world.js';

export function periodicNoiseField(size,period,octaves,seedOff){
  const rnd=terrain.mulberry32(WORLD_SEED*31+seedOff);
  const out=new Float32Array(size*size);
  for(let o=0;o<octaves;o++){
    const p=period<<o,g=new Float32Array(p*p);for(let i=0;i<g.length;i++)g[i]=rnd();
    const amp=Math.pow(.5,o);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const fx=x/size*p,fy=y/size*p,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy;
      const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
      const a=g[(iy%p)*p+ix%p],b=g[(iy%p)*p+(ix+1)%p],c=g[((iy+1)%p)*p+ix%p],d=g[((iy+1)%p)*p+(ix+1)%p];
      out[y*size+x]+=lerp(lerp(a,b,sx),lerp(c,d,sx),sy)*amp;
    }
  }
  let mn=1e9,mx=-1e9;for(const v of out){mn=Math.min(mn,v);mx=Math.max(mx,v);}
  for(let i=0;i<out.length;i++)out[i]=(out[i]-mn)/(mx-mn);
  return out;
}
export function makeNoiseTexture(){
  const S=256,a=periodicNoiseField(S,4,5,1),b=periodicNoiseField(S,8,4,2),c=periodicNoiseField(S,16,4,3),d=periodicNoiseField(S,32,3,4);
  const data=new Uint8Array(S*S*4);
  for(let i=0;i<S*S;i++){data[i*4]=a[i]*255;data[i*4+1]=b[i]*255;data[i*4+2]=c[i]*255;data[i*4+3]=d[i]*255;}
  const t=new THREE.DataTexture(data,S,S,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=8;t.needsUpdate=true;
  return t;
}
export function makeWaterNormalTexture(){
  const S=256,h=periodicNoiseField(S,8,5,7),h2=periodicNoiseField(S,16,3,8),data=new Uint8Array(S*S*4);
  const H=(x,y)=>{x=(x+S)%S;y=(y+S)%S;const i=y*S+x;return h[i]*.7+h2[i]*.3;};
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const dx=(H(x+1,y)-H(x-1,y))*5,dy=(H(x,y+1)-H(x,y-1))*5,l=Math.hypot(dx,dy,1),i=(y*S+x)*4;
    data[i]=(-dx/l*.5+.5)*255;data[i+1]=(-dy/l*.5+.5)*255;data[i+2]=(1/l*.5+.5)*255;data[i+3]=255;
  }
  const t=new THREE.DataTexture(data,S,S,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.anisotropy=8;t.needsUpdate=true;
  return t;
}
export function makePuffTexture(){
  const S=128,n=periodicNoiseField(S,4,4,9),data=new Uint8Array(S*S*4);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const dx=(x+.5)/S*2-1,dy=(y+.5)/S*2-1,r=Math.hypot(dx,dy),i=y*S+x;
    const fall=Math.pow(clamp(1-r,0,1),1.8),a=clamp(fall*(.45+n[i]*.9)*.95-.03,0,1);
    data[i*4]=n[i]*255;data[i*4+1]=clamp(1-dy*.5-.25,0,1)*255;data[i*4+2]=255;data[i*4+3]=a*255;
  }
  const t=new THREE.DataTexture(data,S,S,THREE.RGBAFormat);t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.needsUpdate=true;
  return t;
}
export function makeRunwayTexture(){
  const W=256,H=4096,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  const mx=W/(RUNWAY_HALF_W*2),mz=H/(RUNWAY_HALF_L*2); // px per metre
  g.fillStyle='#2b2d2f';g.fillRect(0,0,W,H);
  const rnd=terrain.mulberry32(77);
  for(let i=0;i<26000;i++){const v=30+rnd()*34|0;g.fillStyle=`rgba(${v},${v},${v+2},${.25+rnd()*.35})`;g.fillRect(rnd()*W,rnd()*H,1+rnd()*2,1+rnd()*3);}
  for(let i=0;i<70;i++){const y=rnd()*H;g.fillStyle=`rgba(${48+rnd()*20|0},${48+rnd()*20|0},50,.35)`;g.fillRect(0,y,W,2+rnd()*30);}
  for(const end of [0,1]){ // tyre rubber in the touchdown zones
    for(let i=0;i<260;i++){const y=(end?H-1:0)+(end?-1:1)*(140+rnd()*620)*mz/2.4;g.fillStyle=`rgba(8,8,8,${.06+rnd()*.12})`;g.fillRect(W/2+(rnd()-.5)*10*mx-4,y,3+rnd()*6,6+rnd()*90);}
  }
  g.fillStyle='#e9e6dc';
  const lineW=.9*mx;g.fillRect(1.2*mx,0,lineW,H);g.fillRect(W-1.2*mx-lineW,0,lineW,H);
  for(let z=60;z<RUNWAY_HALF_L*2-60;z+=50){if(z<75||z>RUNWAY_HALF_L*2-75)continue;g.fillRect(W/2-.45*mx,z*mz,.9*mx,30*mz);}
  for(const end of [0,1]){
    const y0=end?H-(6+30)*mz:6*mz;
    for(let k=0;k<8;k++){const off=(k<4?-1:1)*(3+(k%4)*4.2)*mx;g.fillRect(W/2+off-(k<4?1.8*mx:0),y0,1.8*mx,30*mz);}
    for(const dz of [150,300,450]){const y=end?H-(dz+22)*mz:dz*mz;for(const s of [-1,1])g.fillRect(W/2+s*6*mx-(s<0?3*mx:0),y,3*mx,22*mz);}
    g.save();g.translate(W/2,end?H-50*mz:50*mz);if(!end)g.rotate(Math.PI);g.scale(1,mz/mx);g.font=`bold ${Math.round(16*mx)}px Helvetica,Arial,sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(end?'36':'18',0,0);g.restore();
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=16;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;
  return t;
}
