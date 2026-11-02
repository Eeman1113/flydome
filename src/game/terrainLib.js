// SKYBOUND · terrainLib
export function createTerrainLib(seed){
  const clampT=(v,a,b)=>v<a?a:v>b?b:v;
  const sstep=(a,b,x)=>{const t=clampT((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const mix=(a,b,t)=>a+(b-a)*t;
  function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  const rnd=mulberry32((seed>>>0)||1);
  const perm=new Uint8Array(512);
  {const p=new Uint8Array(256);for(let i=0;i<256;i++)p[i]=i;for(let i=255;i>0;i--){const j=Math.floor(rnd()*(i+1));const t=p[i];p[i]=p[j];p[j]=t;}for(let i=0;i<512;i++)perm[i]=p[i&255];}
  const GX=[1,-1,1,-1,1,-1,0,0],GY=[1,1,-1,-1,0,0,1,-1];
  const F2=.5*(Math.sqrt(3)-1),G2=(3-Math.sqrt(3))/6;
  function noise2(xin,yin){
    const s=(xin+yin)*F2,i=Math.floor(xin+s),j=Math.floor(yin+s),t=(i+j)*G2;
    const x0=xin-(i-t),y0=yin-(j-t);let i1,j1;if(x0>y0){i1=1;j1=0;}else{i1=0;j1=1;}
    const x1=x0-i1+G2,y1=y0-j1+G2,x2=x0-1+2*G2,y2=y0-1+2*G2,ii=i&255,jj=j&255;let n=0;
    let t0=.5-x0*x0-y0*y0;if(t0>0){const g=perm[ii+perm[jj]]&7;t0*=t0;n+=t0*t0*(GX[g]*x0+GY[g]*y0);}
    let t1=.5-x1*x1-y1*y1;if(t1>0){const g=perm[ii+i1+perm[jj+j1]]&7;t1*=t1;n+=t1*t1*(GX[g]*x1+GY[g]*y1);}
    let t2=.5-x2*x2-y2*y2;if(t2>0){const g=perm[ii+1+perm[jj+1]]&7;t2*=t2;n+=t2*t2*(GX[g]*x2+GY[g]*y2);}
    return 70*n;
  }
  function fbm(x,y,oct){let s=0,a=.5,f=1,n=0;for(let i=0;i<oct;i++){s+=noise2(x*f,y*f)*a;n+=a;a*=.5;f*=2.02;}return s/n;}
  function ridged(x,y,oct){let s=0,f=1,a=.5,w=1;for(let i=0;i<oct;i++){let n=1-Math.abs(noise2(x*f+i*17.3,y*f-i*9.1));n*=n;n*=w;w=clampT(n*2.1,0,1);s+=n*a;f*=2.0;a*=.46;}return s;}
  function hashI(i,j,k){let h=(Math.imul(i|0,374761393)+Math.imul(j|0,668265263)+Math.imul((seed+k)|0,1442695041))|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}
  const P={
    warp:1600+rnd()*2400,landBias:.05+rnd()*.13,mountainH:900+rnd()*1500,mountainFreq:1/(6000+rnd()*3500),
    mountainCover:rnd()*.22,hillH:50+rnd()*100,riverFreq:1/(5200+rnd()*3800),lakeBias:rnd()*.08,
    tempBias:(rnd()-.5)*.34,moistBias:(rnd()-.5)*.3,autumn:rnd()<.3?1:0,
    o1:(rnd()-.5)*4000,o2:(rnd()-.5)*4000
  };
  let ox=0,oz=0,airportH=40;
  const AP={halfW:240,halfL:830,blend:540};
  function base(wx,wz,o){
    const x=wx+ox,z=wz+oz;
    const qx=fbm(x*.00009+P.o1,z*.00009,3),qz=fbm(x*.00009-P.o1,z*.00009+5.2,3);
    const px=x+qx*P.warp,pz=z+qz*P.warp;
    const cont=fbm(px/16000+P.o2,pz/16000,4)+P.landBias;
    const landT=sstep(-.02,.10,cont);
    const mmask=sstep(0,.35,fbm(px/26000+31.7,pz/26000-12.1,3)+cont*.6+P.mountainCover-.05)*sstep(0,.14,cont);
    const mtn=mmask>0.001?Math.pow(ridged(px*P.mountainFreq,pz*P.mountainFreq,7),1.45)*P.mountainH*mmask:0;
    const hills=(fbm(px/2100+7,pz/2100-3,4)*.5+.5)*P.hillH*landT;
    const detail=fbm(x/260,z/260,3)*7*landT;
    const landH=3+Math.max(cont,0)*380+hills+mtn+detail;
    const seaH=Math.min(cont,0)*1400-4+detail*.3;
    let h=mix(seaH,landH,landT);
    const inland=sstep(.04,.16,cont);
    const lk=fbm(px/3200+90,pz/3200-40,3)+P.lakeBias;
    if(lk>.36)h-=sstep(.36,.46,lk)*(Math.max(h,0)+7)*inland*(1-mmask)*(1-sstep(250,500,h));
    const rv=Math.abs(noise2(px*P.riverFreq+71.3,pz*P.riverFreq-19.1));
    const valley=(1-sstep(0,.2,rv))*inland*(1-sstep(500,1100,h));
    h-=valley*valley*valley*Math.min(Math.max(h,0)*.35,80);
    const channel=(1-sstep(.006,.022,rv))*inland*(1-sstep(30,95,h));
    h=mix(h,-4,channel);
    if(o){o.cont=cont;o.mtn=mmask;o.river=valley;o.px=px;o.pz=pz;}
    return h;
  }
  function flatten(wx,wz,h){
    const ax=Math.max(Math.abs(wx)-AP.halfW,0),az=Math.max(Math.abs(wz)-AP.halfL,0),ad=Math.hypot(ax,az);
    if(ad<AP.blend)h=mix(h,airportH-.06,1-sstep(0,AP.blend,ad));
    return h;
  }
  function heightAt(wx,wz){return flatten(wx,wz,base(wx,wz));}
  function airportZone(wx,wz,pad){return Math.abs(wx)<AP.halfW+pad&&Math.abs(wz)<AP.halfL+pad;}
  function climate(h,o){
    const temp=clampT(.6+P.tempBias*.8+fbm(o.px/38000+400,o.pz/38000,2)*.45-Math.max(h,0)/4200,0,1);
    const moist=clampT(.52+P.moistBias+fbm(o.px/11000-200,o.pz/11000+90,3)*.7+o.river*.28+(1-sstep(0,.2,o.cont))*.12-o.mtn*.08,0,1);
    return [temp,moist];
  }
  function forestAt(wx,wz,h,slope,temp,moist){
    const patch=fbm(wx/900+13,wz/900-7,3)*.5+.5;
    const treeLine=mix(1100,2500,temp);
    return sstep(.40,.64,moist+(patch-.5)*.55)*(1-sstep(.32,.52,slope))*sstep(2.5,8,h)*(1-sstep(treeLine-150,treeLine+100,h))*sstep(.06,.18,temp);
  }
  function init(){
    ox=0;oz=0;let best=null;
    const probes=[[0,-800],[0,800],[0,-400],[0,400],[-230,0],[230,0],[-230,-750],[230,750],[230,-750],[-230,750]];
    for(let ring=0;ring<30;ring++){
      const R=ring*1400,n=ring===0?1:Math.max(6,Math.floor(2*Math.PI*R/1400));
      for(let k=0;k<n;k++){
        const a=k/n*Math.PI*2+ring,cx=Math.cos(a)*R,cz=Math.sin(a)*R,h0=base(cx,cz);
        if(h0<14||h0>750)continue;
        let mn=h0,mx=h0;for(const [dx,dz] of probes){const hh=base(cx+dx,cz+dz);mn=Math.min(mn,hh);mx=Math.max(mx,hh);}
        if(mn<8)continue;
        const score=(mx-mn)+Math.abs(h0-180)*.025+R*.0004;
        if(!best||score<best.score)best={x:cx,z:cz,h:(mn+mx)*.5,score};
      }
      if(best&&best.score<20&&ring>2)break;
    }
    if(!best)best={x:0,z:0,h:Math.max(30,base(0,0))};
    ox=best.x;oz=best.z;airportH=Math.max(10,best.h);
    return {airportH,ox,oz};
  }
  return {P,AP,noise2,fbm,base,heightAt,climate,forestAt,init,airportZone,hashI,mulberry32,
    get airportH(){return airportH;},setFrame(o){ox=o.ox;oz=o.oz;airportH=o.airportH;}};
}

/* Chunk mesh + detail builder. Runs inside workers (stringified) or on main thread as fallback. */
export function buildChunkData(lib,req){
  const clampT=(v,a,b)=>v<a?a:v>b?b:v;
  const {cx,cz,seg,size,shadowSteps,sun}=req;
  const step=size/seg,x0=cx*size,z0=cz*size,G=seg+3,row=seg+1;
  const H=new Float32Array(G*G);
  for(let gz=0;gz<G;gz++)for(let gx=0;gx<G;gx++)H[gz*G+gx]=lib.heightAt(x0+(gx-1)*step,z0+(gz-1)*step);
  const nMain=row*row,nPer=4*seg,nV=nMain+nPer;
  const pos=new Float32Array(nV*3),nor=new Float32Array(nV*3),bio=new Float32Array(nV*4),ext=new Float32Array(nV*2);
  const o={};let minY=1e9,maxY=-1e9;
  const sh=Math.hypot(sun[0],sun[2])||1,sdx=sun[0]/sh,sdz=sun[2]/sh,tanE=sun[1]/sh;
  for(let iz=0;iz<=seg;iz++)for(let ix=0;ix<=seg;ix++){
    const v=iz*row+ix,x=x0+ix*step,z=z0+iz*step,gi=(iz+1)*G+ix+1,h=H[gi];
    const hl=H[gi-1],hr=H[gi+1],hd=H[gi-G],hu=H[gi+G];
    let nx=hl-hr,ny=2*step,nz=hd-hu;const inv=1/Math.hypot(nx,ny,nz);nx*=inv;ny*=inv;nz*=inv;
    pos[v*3]=x;pos[v*3+1]=h;pos[v*3+2]=z;nor[v*3]=nx;nor[v*3+1]=ny;nor[v*3+2]=nz;
    if(h<minY)minY=h;if(h>maxY)maxY=h;
    lib.base(x,z,o);const [temp,moist]=lib.climate(h,o),slope=1-ny;
    let forest=lib.forestAt(x,z,h,slope,temp,moist);
    if(lib.airportZone(x,z,180))forest=0;
    bio[v*4]=moist;bio[v*4+1]=temp;bio[v*4+2]=forest;bio[v*4+3]=0;
    const R1=45,c1=(lib.heightAt(x+R1,z)+lib.heightAt(x-R1,z)+lib.heightAt(x,z+R1)+lib.heightAt(x,z-R1))*.25-h;
    const ao=clampT(1-Math.max(c1,0)/R1*.9,.5,1)*(1-forest*.15);
    let vis=1;
    if(shadowSteps>0&&sun[1]<.97){
      let occ=0,d=22;
      for(let k=0;k<shadowSteps;k++){
        const th=lib.heightAt(x+sdx*d,z+sdz*d),diff=th-(h+1.5+tanE*d);
        if(diff>0){occ=Math.max(occ,Math.min(1,diff/(d*.05+5)));if(occ>=1)break;}
        d*=1.75;
      }
      vis=1-occ;
    }
    ext[v*2]=vis;ext[v*2+1]=ao;
  }
  // Skirts hide cracks between neighbouring LOD levels.
  const perim=[];
  for(let ix=0;ix<seg;ix++)perim.push(ix);
  for(let iz=0;iz<seg;iz++)perim.push(iz*row+seg);
  for(let ix=seg;ix>0;ix--)perim.push(seg*row+ix);
  for(let iz=seg;iz>0;iz--)perim.push(iz*row);
  const skirt=step*.8+18;
  for(let k=0;k<nPer;k++){
    const s=perim[k],v=nMain+k;
    pos[v*3]=pos[s*3];pos[v*3+1]=pos[s*3+1]-skirt;pos[v*3+2]=pos[s*3+2];
    nor[v*3]=nor[s*3];nor[v*3+1]=nor[s*3+1];nor[v*3+2]=nor[s*3+2];
    for(let c=0;c<4;c++)bio[v*4+c]=bio[s*4+c];ext[v*2]=ext[s*2];ext[v*2+1]=ext[s*2+1];
  }
  const idx=new Uint32Array(seg*seg*6+nPer*12);let k=0;
  for(let iz=0;iz<seg;iz++)for(let ix=0;ix<seg;ix++){const a=iz*row+ix,b=a+1,d=a+row,e=d+1;idx[k++]=a;idx[k++]=d;idx[k++]=b;idx[k++]=b;idx[k++]=d;idx[k++]=e;}
  for(let p=0;p<nPer;p++){
    const a=perim[p],b=perim[(p+1)%nPer],sa=nMain+p,sb=nMain+(p+1)%nPer;
    idx[k++]=a;idx[k++]=sa;idx[k++]=b;idx[k++]=b;idx[k++]=sa;idx[k++]=sb;
    idx[k++]=a;idx[k++]=b;idx[k++]=sa;idx[k++]=b;idx[k++]=sb;idx[k++]=sa;
  }
  const out={key:req.key,lod:req.lod,cx,cz,seg,pos,nor,bio,ext,idx,minY:minY-skirt,maxY,trees:null};
  if(req.detail){
    const rand=lib.mulberry32(((cx*73856093)^(cz*19349663)^(lib.P.o1*1e3|0))>>>0);
    const sp=req.detail.spacing,n=Math.floor(size/sp),tr=[];
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      const x=x0+(i+rand())*sp,z=z0+(j+rand())*sp,r1=rand(),r2=rand(),r3=rand();
      if(lib.airportZone(x,z,260))continue;
      const h=lib.heightAt(x,z);if(h<2.5)continue;
      const hx=lib.heightAt(x+5,z),hz=lib.heightAt(x,z+5),ny=5/Math.hypot(h-hx,5,h-hz),slope=1-ny;
      lib.base(x,z,o);const [temp,moist]=lib.climate(h,o);
      const f=lib.forestAt(x,z,h,slope,temp,moist);
      const p=f*.92+(moist>.38&&slope<.3?.018:0);
      if(r1>p)continue;
      const conifer=(temp<.42||h>900||r2<.22*(1-moist))?1:0;
      const s=(conifer?15:12)*(.65+r3*.75);
      tr.push(x,h,z,s,conifer,rand(),temp,moist);
    }
    out.trees=new Float32Array(tr);
  }
  return out;
}
