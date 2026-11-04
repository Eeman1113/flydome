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
    mountainCover:rnd()*.22,hillH:50+rnd()*100,riverFreq:1/(4200+rnd()*3000),lakeBias:rnd()*.08,
    tempBias:(rnd()-.5)*.34,moistBias:(rnd()-.5)*.3,autumn:rnd()<.3?1:0,
    o1:(rnd()-.5)*4000,o2:(rnd()-.5)*4000
  };
  let ox=0,oz=0,airportH=40,strips=[],crater=null;
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
    if(lk>.36)h-=sstep(.36,.46,lk)*(Math.max(h,0)+7)*inland*(1-mmask)*(1-sstep(22,60,h));
    const rv=Math.abs(noise2(px*P.riverFreq+71.3,pz*P.riverFreq-19.1));
    const valley=(1-sstep(0,.2,rv))*inland*(1-sstep(500,1100,h));
    h-=valley*valley*Math.min(Math.max(h,0)*.5,120)*(1-sstep(350,700,h));
    const channel=(1-sstep(.007,.026,rv))*inland*(1-sstep(45,115,h));
    h=mix(h,-4,channel);
    // Steepen the ground across sea level so coasts never lie nearly flush with the water
    // (prevents shoreline z-fighting from altitude); monotonic, untouched beyond ±4 m.
    {const x=h/1.5;h+=1.2*h*Math.exp(-x*x);}
    if(o){o.cont=cont;o.mtn=mmask;o.river=valley;o.px=px;o.pz=pz;}
    return h;
  }
  function flatten(wx,wz,h){
    const ax=Math.max(Math.abs(wx)-AP.halfW,0),az=Math.max(Math.abs(wz)-AP.halfL,0),ad=Math.hypot(ax,az);
    if(ad<AP.blend)h=mix(h,airportH-.06,1-sstep(0,AP.blend,ad));
    for(let i=0;i<strips.length;i++){
      const s=strips[i],dx=wx-s.x,dz=wz-s.z;if(dx*dx+dz*dz>(s.halfL+280)*(s.halfL+280))continue;
      const u=dx*s.cos+dz*s.sin,v=-dx*s.sin+dz*s.cos;
      const d=Math.hypot(Math.max(Math.abs(u)-s.halfL-25,0),Math.max(Math.abs(v)-s.halfW-26,0));
      if(d<230)h=mix(h,s.h,1-sstep(0,230,d));
    }
    if(crater)h=craterShape(wx,wz,h);
    return h;
  }
  // Crater lake: a volcanic cone on lowland whose bowl dips below sea level, so the
  // world's water fills it. The rim is ragged (noise on radius and height).
  function craterShape(wx,wz,h){
    const c=crater,dx=wx-c.x,dz=wz-c.z,d2=dx*dx+dz*dz,reach=c.r*3.2;
    if(d2>reach*reach)return h;
    const d=Math.sqrt(d2),a=Math.atan2(dz,dx);
    const n=noise2(Math.cos(a)*1.7+c.x*.001,Math.sin(a)*1.7+c.z*.001),rr=c.r*(1+n*.1);
    const rim=c.rimH*(1+noise2(Math.cos(a)*3.1-9,Math.sin(a)*3.1+4)*.28)+fbm(wx/120,wz/120,2)*8;
    const t=d/rr;
    if(t>=1){const k=Math.pow(1-sstep(1,3.2,t),1.7);return h+rim*k;}
    // inner wall: steep from the rim, easing into a flat lake floor below sea level
    const top=h+rim,wall=sstep(.55,1,t);
    return mix(-14+fbm(wx/90,wz/90,2)*3,top,Math.pow(wall,1.35));
  }
  // Local strip coordinates: u along the strip, v across it.
  function stripLocal(s,wx,wz){const dx=wx-s.x,dz=wz-s.z;return [dx*s.cos+dz*s.sin,-dx*s.sin+dz*s.cos];}
  function stripClearing(wx,wz){
    let c=0;
    for(let i=0;i<strips.length;i++){
      const s=strips[i],dx=wx-s.x,dz=wz-s.z;if(dx*dx+dz*dz>(s.halfL+420)*(s.halfL+420))continue;
      const [u,v]=stripLocal(s,wx,wz),d=Math.hypot(Math.max(Math.abs(u)-s.halfL-50,0),Math.max(Math.abs(v)-s.halfW-34,0));
      c=Math.max(c,1-sstep(20,190,d+fbm(wx/130-4.1,wz/130+2.7,3)*90));
    }
    return c;
  }
  function stripAt(wx,wz,pad=0){
    for(let i=0;i<strips.length;i++){const s=strips[i],[u,v]=stripLocal(s,wx,wz);if(Math.abs(u)<=s.halfL+pad&&Math.abs(v)<=s.halfW+pad)return s;}
    return null;
  }
  function heightAt(wx,wz){return flatten(wx,wz,base(wx,wz));}
  function airportZone(wx,wz,pad){return Math.abs(wx)<AP.halfW+pad&&Math.abs(wz)<AP.halfL+pad;}
  // 1 inside the mown airfield, fading to 0 across a ragged, noise-shaped tree line.
  function airportClearing(wx,wz){const ax=Math.max(Math.abs(wx)-AP.halfW,0),az=Math.max(Math.abs(wz)-AP.halfL,0),d=Math.hypot(ax,az);if(d>520)return 0;return 1-sstep(90,330,d+fbm(wx/170+3.3,wz/170-8.1,3)*120);}
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
    strips=findStrips();
    crater=findCrater();
    return {airportH,ox,oz,strips,crater};
  }
  // Seeded crater site (≈70% of worlds): open lowland 3.5-11 km out, clear of the airfield,
  // the strips and rivers.
  function findCrater(){
    const cr=mulberry32((seed^0xC4A7E)>>>0);if(cr()>.7)return null;
    for(let t=0;t<500;t++){
      const R=3500+cr()*7500,a=cr()*6.283,x=Math.cos(a)*R,z=Math.sin(a)*R;
      if(airportZone(x,z,2600))continue;
      if(strips.some(s=>Math.hypot(s.x-x,s.z-z)<2900))continue;
      const o={},h0=base(x,z,o);if(h0<12||h0>160||o.river>.1||o.mtn>.2)continue;
      let mn=h0;for(let k=0;k<8;k++){const b=k/8*6.283;mn=Math.min(mn,base(x+Math.cos(b)*900,z+Math.sin(b)*900));}
      if(mn<6)continue;
      return {x,z,r:430+cr()*220,rimH:150+cr()*130};
    }
    return null;
  }
  // Grass bush strips: the flattest seeded sites 2.6-9.8 km out, tested at 8 headings.
  function findStrips(relax=0){
    const rr=mulberry32((seed^0xA1F3)>>>0),cands=[];
    for(let R=2600;R<=9800+relax*3000;R+=600){
      const n=Math.floor(2*Math.PI*R/800),off=rr()*6.283;
      for(let k=0;k<n;k++){
        const a=off+k/n*6.283,cx=Math.cos(a)*R,cz=Math.sin(a)*R;
        if(airportZone(cx,cz,1600))continue;
        const o={},h0=base(cx,cz,o);if(h0<14||h0>1100||o.river>.2)continue;
        let mn=h0,mx=h0;
        for(const [dx,dz] of [[230,0],[-230,0],[0,230],[0,-230]]){const hh=base(cx+dx,cz+dz);mn=Math.min(mn,hh);mx=Math.max(mx,hh);}
        if(mx-mn>18+relax*12||mn<10)continue;
        cands.push({cx,cz,R});
      }
    }
    const scored=[];
    for(const c of cands){
      let best=null;
      for(let hi=0;hi<8;hi++){
        const ang=hi/8*Math.PI,ca=Math.cos(ang),sa=Math.sin(ang);let mn=1e9,mx=-1e9,sum=0,n=0;
        for(const u of [-345,-172,0,172,345])for(const v of [-32,0,32]){const hh=base(c.cx+ca*u-sa*v,c.cz+sa*u+ca*v);mn=Math.min(mn,hh);mx=Math.max(mx,hh);sum+=hh;n++;}
        if(mn<8)continue;
        if(!best||mx-mn<best.rng)best={rng:mx-mn,ang,h:sum/n};
      }
      if(best&&best.rng<14+relax*10)scored.push({x:c.cx,z:c.cz,ang:best.ang,h:best.h,score:best.rng+c.R*.0006});
    }
    scored.sort((a,b)=>a.score-b.score);
    const out=[];
    for(const s of scored){
      if(out.length>=3)break;
      if(out.some(o=>Math.hypot(o.x-s.x,o.z-s.z)<3200))continue;
      out.push(s);
    }
    if(out.length<2&&relax<1)return findStrips(1);
    return out.map((s,i)=>({id:i,x:s.x,z:s.z,h:s.h,ang:s.ang,cos:Math.cos(s.ang),sin:Math.sin(s.ang),halfL:320,halfW:13,name:placeName(900+i)+' Strip'}));
  }
  // Deterministic, pronounceable place names.
  function placeName(k){
    const r=mulberry32(((seed*2654435761)^(k*40503+977))>>>0);
    const A=['Ka','Ver','Thal','Mor','Es','Ald','Brin','Cor','Dun','Fen','Gal','Har','Is','Jor','Kel','Lor','Mar','Nor','Os','Pen','Ros','Sel','Tor','Ul','Vel','Wyn','Yr','Zan','Ash','Bel','Cal','Eld','Hal','Ivr','Kes','Lun','Rav','Sor','Tam','Ves'];
    const M=['','','a','e','i','o','ar','en','is','or','un','ae','el'];
    const Z=['th','n','ra','ss','dale','wick','ford','holt','den','ia','on','ir','ek','ryn','mar','vik','set','wen','dor','loch'];
    const pick=l=>l[Math.floor(r()*l.length)];
    let s=pick(A)+pick(M)+pick(Z);if(s.length>9)s=s.slice(0,9);
    return s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();
  }
  // Survey of the region around the airfield: relief map for the chart plus named landmarks
  // detected from real terrain features (peaks, lakes, islands, forest, river, mountain pass).
  function scanWorld(R,step){
    const N=Math.round(2*R/step)+1,H=new Float32Array(N*N),TP=new Float32Array(N*N),MO=new Float32Array(N*N),RV=new Float32Array(N*N),FO=new Float32Array(N*N),o={};
    const X=i=>-R+i*step;
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){
      const x=X(i),z=X(j),k=j*N+i,h=flatten(x,z,base(x,z,o));H[k]=h;
      const [t,m]=climate(h,o);TP[k]=t;MO[k]=m;RV[k]=o.river*(o.cont>.06?1:0);
    }
    const at=(i,j)=>H[Math.min(N-1,Math.max(0,j))*N+Math.min(N-1,Math.max(0,i))];
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){
      const k=j*N+i,gx=(at(i+1,j)-at(i-1,j))/(2*step),gz=(at(i,j+1)-at(i,j-1))/(2*step),ny=1/Math.hypot(gx,1,gz);
      FO[k]=forestAt(X(i),X(j),H[k],1-ny,TP[k],MO[k])*(1-airportClearing(X(i),X(j)))*(1-stripClearing(X(i),X(j)));
    }
    // Cartographic relief: hypsometric tint, forest, snow, hillshade and 100 m contours.
    const rgba=new Uint8ClampedArray(N*N*4),L=[-.55,.62,-.56],ll=Math.hypot(...L);
    const lerp3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){
      const k=j*N+i,h=H[k];let c;
      if(h<-.3){c=lerp3([86,148,176],[22,58,86],sstep(0,70,-h));}
      else{
        c=lerp3([122,150,84],[168,156,104],sstep(.5,.2,MO[k]));
        c=lerp3(c,[176,166,128],sstep(300,1200,h)*.6);
        c=lerp3(c,[52,86,52],sstep(.15,.7,FO[k]));
        const gx=(at(i+1,j)-at(i-1,j))/(2*step),gz=(at(i,j+1)-at(i,j-1))/(2*step);
        c=lerp3(c,[140,132,122],sstep(.45,.9,Math.hypot(gx,gz)));
        c=lerp3(c,[236,240,244],sstep(mix(1500,3400,TP[k]),mix(1500,3400,TP[k])+250,h));
        if(h<2.5)c=lerp3(c,[204,190,146],.7);
        const nx=-gx,nz=-gz,nl=Math.hypot(nx,1,nz),sh=Math.max(0,(nx*L[0]+L[1]+nz*L[2])/(nl*ll));
        const s=.62+.55*sh;c=[c[0]*s,c[1]*s,c[2]*s];
        if(Math.floor(h/100)!==Math.floor(at(i+1,j)/100)||Math.floor(h/100)!==Math.floor(at(i,j+1)/100))c=[c[0]*.84,c[1]*.84,c[2]*.84];
      }
      rgba[k*4]=c[0];rgba[k*4+1]=c[1];rgba[k*4+2]=c[2];rgba[k*4+3]=255;
    }
    // Connected components on the grid.
    const comps=(test)=>{
      const lab=new Int32Array(N*N).fill(-1),out=[];const q=new Int32Array(N*N);
      for(let s=0;s<N*N;s++){
        if(lab[s]>=0||!test(s))continue;
        let qh=0,qt=0,size=0,sx=0,sz=0,border=false;q[qt++]=s;lab[s]=out.length;
        while(qh<qt){const c=q[qh++],ci=c%N,cj=(c/N)|0;size++;sx+=ci;sz+=cj;if(ci===0||cj===0||ci===N-1||cj===N-1)border=true;
          for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const ni=ci+di,nj=cj+dj;if(ni<0||nj<0||ni>=N||nj>=N)continue;const n=nj*N+ni;if(lab[n]<0&&test(n)){lab[n]=out.length;q[qt++]=n;}}}
        out.push({id:out.length,size,ci:sx/size,cj:sz/size,border});
      }
      // snap each centroid to a member cell
      for(const c of out){let best=1e9,bk=-1;const r=8;const i0=Math.round(c.ci),j0=Math.round(c.cj);
        for(let j=Math.max(0,j0-r*6);j<=Math.min(N-1,j0+r*6);j++)for(let i=Math.max(0,i0-r*6);i<=Math.min(N-1,i0+r*6);i++){const k=j*N+i;if(lab[k]!==c.id)continue;const d=(i-c.ci)**2+(j-c.cj)**2;if(d<best){best=d;bk=k;}}
        c.k=bk;}
      return out.filter(c=>c.k>=0);
    };
    const cand=[];const km2=step*step/1e6;
    const pos=k=>({x:X(k%N),z:X((k/N)|0)});
    // peaks
    const pr=Math.round(500/step),wr=Math.round(1400/step),peaks=[];
    for(let j=wr;j<N-wr;j+=1)for(let i=wr;i<N-wr;i+=1){
      const h=H[j*N+i];if(h<220)continue;let top=true;
      for(let dj=-pr;dj<=pr&&top;dj++)for(let di=-pr;di<=pr;di++){if((di||dj)&&H[(j+dj)*N+i+di]>h){top=false;break;}}
      if(!top)continue;let mn=h;
      for(let dj=-wr;dj<=wr;dj+=2)for(let di=-wr;di<=wr;di+=2)mn=Math.min(mn,H[(j+dj)*N+i+di]);
      if(h-mn>170)peaks.push({k:j*N+i,h,prom:h-mn});
    }
    peaks.sort((a,b)=>b.h-a.h);
    peaks.forEach((p,n)=>cand.push({type:'peak',k:p.k,score:p.h,elev:p.h,rank:n}));
    const inCrater=k=>{if(!crater)return false;const p=pos(k);return Math.hypot(p.x-crater.x,p.z-crater.z)<crater.r*1.3;};
    const water=comps(k=>H[k]<-.5).filter(c=>!c.border&&c.size>=8&&!inCrater(c.k));
    if(crater){const i=Math.round((crater.x+R)/step),j=Math.round((crater.z+R)/step);if(i>=0&&j>=0&&i<N&&j<N){const k=j*N+i;cand.push({type:'crater',k,score:1,rank:0,area:Math.PI*(crater.r*.6)**2/1e6,elev:crater.rimH});}}
    water.sort((a,b)=>b.size-a.size).forEach((c,n)=>cand.push({type:'lake',k:c.k,score:c.size,area:c.size*km2,rank:n}));
    const isl=comps(k=>H[k]>=-.5).filter(c=>!c.border&&c.size>=4&&c.size<6000);
    isl.sort((a,b)=>b.size-a.size).forEach((c,n)=>cand.push({type:'island',k:c.k,score:c.size,area:c.size*km2,rank:n}));
    const fo=comps(k=>FO[k]>.6&&H[k]>0).filter(c=>c.size>=60);
    fo.sort((a,b)=>b.size-a.size).forEach((c,n)=>cand.push({type:'forest',k:c.k,score:c.size,area:c.size*km2,rank:n}));
    const rv=comps(k=>RV[k]>.62&&H[k]<70&&H[k]>-8).filter(c=>c.size>=8);
    rv.sort((a,b)=>b.size-a.size).forEach((c,n)=>cand.push({type:'river',k:c.k,score:c.size,rank:n}));
    const sk=Math.round(650/step),passes=[];
    for(let j=sk;j<N-sk;j+=2)for(let i=sk;i<N-sk;i+=2){
      const h=H[j*N+i];if(h<280)continue;
      for(const [[ai,aj],[bi,bj]] of [[[1,0],[0,1]],[[0,1],[1,0]],[[1,1],[1,-1]],[[1,-1],[1,1]]]){
        const hi=Math.min(at(i+ai*sk,j+aj*sk),at(i-ai*sk,j-aj*sk)),lo=Math.max(at(i+bi*sk,j+bj*sk),at(i-bi*sk,j-bj*sk));
        if(hi>h+110&&lo<h-70){passes.push({k:j*N+i,h,score:(hi-h)+(h-lo)*.5,axis:[bi,bj]});break;}
      }
    }
    passes.sort((a,b)=>b.score-a.score);
    // the deepest, narrowest passes become gorge runs; the rest stay passes
    passes.forEach((p,n)=>cand.push({type:p.score>380&&n<2?'gorge':'pass',k:p.k,score:p.score,elev:p.h,rank:n,axis:p.axis}));
    // coastal waterfalls: high land within ~250 m of open water
    const falls=[];
    for(let j=3;j<N-3;j+=1)for(let i=3;i<N-3;i+=1){
      const h=H[j*N+i];if(h<35||h>700)continue;
      let best=null;
      for(let dj=-2;dj<=2;dj++)for(let di=-2;di<=2;di++){const k=(j+dj)*N+i+di;if(H[k]<-1){const d=Math.hypot(di,dj)*step;if(!best||d<best.d)best={d,k};}}
      if(best){const steep=h/best.d;if(steep>.22)falls.push({k:j*N+i,to:best.k,h,score:h*steep});}
    }
    const rare=mulberry32((seed^0xFA11)>>>0);if(rare()>.6)falls.length=0;const keepStacks=rare()<=.55;
    falls.sort((a,b)=>b.score-a.score);falls.forEach((c,n)=>cand.push({type:'falls',k:c.k,to:c.to,score:c.score,elev:c.h,rank:n}));
    // sea stacks: shallow water hard against a steep coast
    const stacks=[];
    for(let j=4;j<N-4;j+=2)for(let i=4;i<N-4;i+=2){
      const h=H[j*N+i];if(h>-2||h<-30)continue;let land=0,hi=0;
      for(let dj=-3;dj<=3;dj++)for(let di=-3;di<=3;di++){const hh=H[(j+dj)*N+i+di];if(hh>2){land++;hi=Math.max(hi,hh);}}
      if(land>=6&&land<=24&&hi>30)stacks.push({k:j*N+i,score:hi+land*2});
    }
    if(!keepStacks)stacks.length=0;
    stacks.sort((a,b)=>b.score-a.score);stacks.forEach((c,n)=>cand.push({type:'stacks',k:c.k,score:c.score,rank:n}));
    // capes: land tips mostly surrounded by water, on a large landmass
    const landC=comps(k=>H[k]>=-.5),labBig=new Uint8Array(N*N);
    {const big=landC.filter(c=>c.border||c.size>6000);const set=new Set(big.map(c=>c.id));const lab2=new Int32Array(N*N).fill(-1);}
    const capes=[],cr=6;
    for(let j=cr;j<N-cr;j+=2)for(let i=cr;i<N-cr;i+=2){
      const h=H[j*N+i];if(h<3||h>200)continue;let w=0,t=0;
      for(let dj=-cr;dj<=cr;dj+=2)for(let di=-cr;di<=cr;di+=2){if(di*di+dj*dj>cr*cr)continue;t++;if(H[(j+dj)*N+i+di]<-.5)w++;}
      const fr=w/t;if(fr>.6&&fr<.85)capes.push({k:j*N+i,score:fr});
    }
    capes.sort((a,b)=>b.score-a.score);
    // the best headland usually carries a lighthouse
    const lr=mulberry32((seed^0x11CE)>>>0);
    capes.forEach((c,n)=>cand.push({type:n===0&&lr()<.75?'lighthouse':'cape',k:c.k,score:c.score,rank:n}));
    // explorer finds: an old plane wreck and natural stone arches on open ground
    const er=mulberry32((seed^0xE4A1)>>>0),open=[];
    for(let t=0;t<600;t++){const i=4+Math.floor(er()*(N-8)),j=4+Math.floor(er()*(N-8)),k=j*N+i,h=H[k];if(h<15||h>1100)continue;const gx=(at(i+1,j)-at(i-1,j))/(2*step),gz=(at(i,j+1)-at(i,j-1))/(2*step);if(Math.hypot(gx,gz)>.18)continue;open.push({k,f:FO[k],m:MO[k]});}
    const wrecks=open.filter(o=>o.f<.35).slice(0,3);if(er()<.8)wrecks.forEach((c,n)=>cand.push({type:'wreck',k:c.k,score:1,rank:n}));
    const arches=open.filter(o=>o.f<.2).sort((a,b)=>a.m-b.m).slice(0,3);if(er()<.7)arches.forEach((c,n)=>cand.push({type:'arch',k:c.k,score:1,rank:n}));
    // glaciers: permanent snow above the local snowline
    const gl=comps(k=>H[k]>mix(1500,3400,TP[k])+150).filter(c=>c.size>=14);
    gl.sort((a,b)=>b.size-a.size).forEach((c,n)=>cand.push({type:'glacier',k:c.k,score:c.size,area:c.size*km2,rank:n}));
    // lone rock spire: open, gentle ground away from water and forest
    const sr=mulberry32((seed^0x51BE)>>>0);
    if(sr()<.75){
      const sp=[];
      for(let t=0;t<400;t++){const i=4+Math.floor(sr()*(N-8)),j=4+Math.floor(sr()*(N-8)),k=j*N+i,h=H[k];if(h<25||h>900||FO[k]>.3)continue;const gx=(at(i+1,j)-at(i-1,j))/(2*step),gz=(at(i,j+1)-at(i,j-1))/(2*step);if(Math.hypot(gx,gz)>.12)continue;sp.push({k,score:sr()});}
      sp.sort((a,b)=>b.score-a.score);sp.slice(0,3).forEach((c,n)=>cand.push({type:'spire',k:c.k,score:c.score,rank:n}));
    }
    // Choose up to 8: the best of each type first, then runners-up, spaced across the region.
    const chosen=[],order=['crater','peak','lake','island','forest','river','falls','lighthouse','wreck','stacks','gorge','arch','pass','cape','glacier','spire'],MAXL=12;
    const ok=c=>{const p=pos(c.k),d=Math.hypot(p.x,p.z);if(d<1500||d>R-1200)return false;return !chosen.some(o=>Math.hypot(o.x-p.x,o.z-p.z)<(o.type===c.type?2600:1600));};
    for(let round=0;round<3&&chosen.length<MAXL;round++)for(const t of order){
      if(chosen.length>=MAXL)break;
      const list=cand.filter(c=>c.type===t&&!c.used);
      for(const c of list){if(ok(c)){c.used=true;const p=pos(c.k);chosen.push({...c,x:p.x,z:p.z,y:Math.max(H[c.k],0)});break;}c.used=true;}
    }
    const TPL={peak:['Mount {N}','{N} Peak','{N} Fell'],lake:['Lake {N}','{N} Mere','{N} Water'],crater:['{N} Crater','The {N} Caldera','{N} Crater Lake'],island:['{N} Isle','Isle of {N}'],forest:['{N} Wood','{N} Forest','The {N} Weald'],river:['{N} River','River {N}'],pass:['{N} Pass','{N} Gap','{N} Saddle'],gorge:['{N} Gorge','The {N} Narrows'],falls:['{N} Falls','The {N} Cascade'],stacks:['The {N} Stacks','{N} Arch'],cape:['Cape {N}','{N} Head','{N} Point'],glacier:['{N} Glacier','The {N} Icefield'],spire:['The {N} Needle','{N} Spire'],lighthouse:['{N} Light','{N} Lighthouse'],wreck:['The {N} Wreck','Wreck of the {N}'],arch:['{N} Arch','The {N} Arches']};
    const highest=chosen.filter(c=>c.type==='peak').sort((a,b)=>b.elev-a.elev)[0];
    const landmarks=chosen.map((c,i)=>{
      const tpl=TPL[c.type],nm=placeName(i+1),t=(c===highest)?'Mount {N}':tpl[Math.floor(mulberry32((seed+i*7919)>>>0)()*tpl.length)];
      const L={id:i,type:c.type,name:t.replace('{N}',nm),x:c.x,z:c.z,y:c.y,elev:c.elev??c.y,area:c.area||0,highest:c===highest,
        rare:['crater','falls','stacks','glacier','spire','gorge','wreck','arch','lighthouse'].includes(c.type)||(c.type==='island'&&c.rank===0&&c.area<2)||(c===highest&&c.elev>2200)};
      if(c.type==='falls'){const tp=pos(c.to);L.toX=tp.x;L.toZ=tp.z;}
      if(c.type==='gorge'||c.type==='pass'){const ax=c.axis||[1,0],l=Math.hypot(ax[0],ax[1]);L.ax=ax[0]/l;L.az=ax[1]/l;}
      if(c.type==='crater'){L.r=crater.r;L.rimH=crater.rimH;L.y=0;L.elev=Math.round(crater.rimH);}
      if(c.type==='spire'){const r2=mulberry32((seed+i*131)>>>0);L.height=75+r2()*65;L.top=c.y+L.height;}
      if(c.type==='stacks'){const r2=mulberry32((seed+i*313)>>>0);L.top=40+r2()*40;}
      return L;
    });
    return {N,step,R,rgba,landmarks};
  }
  return {P,AP,noise2,fbm,base,heightAt,climate,forestAt,init,airportZone,airportClearing,stripClearing,stripAt,stripLocal,scanWorld,placeName,hashI,mulberry32,
    get airportH(){return airportH;},get strips(){return strips;},setFrame(o){ox=o.ox;oz=o.oz;airportH=o.airportH;strips=o.strips||[];crater=o.crater||null;},get crater(){return crater;}};
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
    forest*=(1-lib.airportClearing(x,z))*(1-lib.stripClearing(x,z));
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
      const clear=Math.max(lib.airportClearing(x,z),lib.stripClearing(x,z));if(lib.airportZone(x,z,40)||lib.stripAt(x,z,30)||r2<clear)continue;
      const h=lib.heightAt(x,z);if(h<2.5)continue;
      const hx=lib.heightAt(x+5,z),hz=lib.heightAt(x,z+5),ny=5/Math.hypot(h-hx,5,h-hz),slope=1-ny;
      lib.base(x,z,o);const [temp,moist]=lib.climate(h,o);
      const f=lib.forestAt(x,z,h,slope,temp,moist);
      const p=f*.92+(moist>.38&&slope<.3?.018:0);
      if(r1>p)continue;
      const conifer=(temp<.42||h>900||r2<.22*(1-moist))?1:0;
      const s=(conifer?15:13)*(.7+r3*.85);
      tr.push(x,h,z,s,conifer,rand(),temp,moist);
    }
    out.trees=new Float32Array(tr);
  }
  return out;
}
