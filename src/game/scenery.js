// SKYBOUND · scenery
import * as THREE from 'three';
import { clamp } from './util.js';
import { RUNWAY_HALF_L, RUNWAY_HALF_W, SEA_LEVEL, SKY, WORLD_SEED, fx, glass, sky, state, shared } from './config.js';
import { AIRPORT_H, terrain } from './world.js';
import { makePuffTexture, makeRunwayTexture } from './textures.js';
import { mats } from './materials.js';
import { _m4 } from './chunks.js';
import { scene, plane } from './engine.js';

export function makeWater(){
  // A tessellated grid, dense under the camera (~5 m cells) and coarse at the horizon: one 40 km quad gets its depth
  // from far-off clipped vertices, too imprecise to resolve against near-flush shore terrain, so the coastline crawled.
  const n=128,g=new THREE.PlaneGeometry(1,1,n,n);g.rotateX(-Math.PI/2);const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i)*2,z=p.getZ(i)*2;p.setXYZ(i,Math.sign(x)*x*x*.5,0,Math.sign(z)*z*z*.5);}
  const m=new THREE.Mesh(g,mats.water);m.position.y=SEA_LEVEL;m.frustumCulled=false;m.receiveShadow=true;m.renderOrder=1;
  return m;
}
export function makeClouds(){
  const {cover,tile:TILE,base,thresh}=fx.cloud,A=mats.noiseTex.image.data,NS=mats.noiseTex.image.width;
  const coverage=(x,z)=>{const u=((x/TILE)%1+1)%1,v=((z/TILE)%1+1)%1;return A[((Math.floor(v*NS)%NS)*NS+Math.floor(u*NS)%NS)*4+3]/255;};
  const rnd=terrain.mulberry32(WORLD_SEED^0x5bd1e995);
  const puffs=[];
  const clusters=Math.round(clamp(cover,0,1.1)*190);
  for(let i=0;i<clusters;i++){
    let cx=0,cz=0;for(let t=0;t<60;t++){cx=(rnd()-.5)*TILE;cz=(rnd()-.5)*TILE;if(coverage(cx,cz)>thresh+.04)break;}
    const big=rnd(),rx=180+big*520,ry=90+big*260,cy=base+(rnd()-.5)*260,np=Math.round(10+big*26);
    for(let k=0;k<np;k++){
      const a=rnd()*Math.PI*2,r=Math.sqrt(rnd()),ox=Math.cos(a)*r*rx,oz=Math.sin(a)*r*rx*.75,oy=Math.pow(rnd(),1.3)*ry*(1-r*.6);
      const size=(210+rnd()*260)*(.55+big*.65)*(1-r*.3);
      const nx=ox/rx,ny=(oy/ry)*1.4+.15,nz=oz/rx,nl=Math.hypot(nx,ny,nz)||1;
      puffs.push({cx,cz,x:ox,y:cy+oy,z:oz,size,nx:nx/nl,ny:ny/nl,nz:nz/nl,rot:rnd()*6.283});
    }
  }
  const N=Math.max(1,puffs.length),base2=new THREE.PlaneGeometry(1,1);
  const geo=new THREE.InstancedBufferGeometry();geo.index=base2.index;geo.setAttribute('position',base2.attributes.position);geo.setAttribute('uv',base2.attributes.uv);
  const aPuff=new THREE.InstancedBufferAttribute(new Float32Array(N*4),4),aShade=new THREE.InstancedBufferAttribute(new Float32Array(N*4),4);
  aPuff.setUsage(THREE.DynamicDrawUsage);aShade.setUsage(THREE.DynamicDrawUsage);geo.setAttribute('aPuff',aPuff);geo.setAttribute('aShade',aShade);geo.instanceCount=N;
  const amb=sky.zenith.clone().lerp(sky.horizon,.5);
  const mat=new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{tPuff:{value:makePuffTexture()},uSunDir:{value:sky.sunDir},uSunCol:{value:sky.sunColor.clone().multiplyScalar(sky.sunIntensity*Math.max(sky.sunDir.y,.15)/Math.PI*.9)},uAmb:{value:amb.multiplyScalar(.9)},uShadow:{value:sky.horizon.clone().multiplyScalar(.5)},uOpacity:{value:1}}]),
    vertexShader:`attribute vec4 aPuff; attribute vec4 aShade; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec3 uShadow;
      varying vec2 vUv; varying vec3 vCol; varying float vFade;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vec3 camR=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]); vec3 camU=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
        float c=cos(aShade.w), s=sin(aShade.w); vec2 p=mat2(c,-s,s,c)*position.xy;
        vec3 wp=aPuff.xyz+(camR*p.x+camU*p.y)*aPuff.w;
        vec4 mvPosition=viewMatrix*vec4(wp,1.0); gl_Position=projectionMatrix*mvPosition;
        vUv=uv; vec3 n=aShade.xyz;
        float ndl=dot(n,uSunDir)*.5+.5; float up=n.y*.5+.5;
        vec3 v=normalize(wp-cameraPosition); float fwd=pow(max(dot(v,uSunDir),0.),6.);
        vCol=mix(uShadow,uAmb,up)+uSunCol*(ndl*ndl*.85+.15)+uSunCol*fwd*.35;
        float d=length(mvPosition.xyz); vFade=smoothstep(aPuff.w*.35,aPuff.w*1.6,d);
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader:`uniform sampler2D tPuff; uniform float uOpacity; varying vec2 vUv; varying vec3 vCol; varying float vFade;
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec4 t=texture2D(tPuff,vUv); float a=t.a*vFade*uOpacity; if(a<.004)discard;
        vec3 col=vCol*(.82+.3*t.r)*(.85+.15*t.g);
        gl_FragColor=vec4(col,a);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent:true,depthWrite:false,fog:true
  });
  const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;mesh.renderOrder=10;
  const order=new Int32Array(N),dist=new Float32Array(N),wx=new Float32Array(N),wz=new Float32Array(N);
  let timer=0,visibleN=N;
  const sys={mesh,base,
    setDensity(k){if(fx.cloudUniform)fx.cloudUniform.value.w=.6*Math.min(1,k);visibleN=Math.max(0,Math.min(N,Math.round(N*k)));geo.instanceCount=visibleN;timer=1;},
    update(dt,cam){
      timer-=dt;if(timer>0)return;timer=.18;
      const camX=cam.position.x,camZ=cam.position.z,cy=cam.position.y;
      for(let i=0;i<visibleN;i++){
        const p=puffs[i];
        let ccx=p.cx-camX;ccx-=Math.round(ccx/TILE)*TILE;let ccz=p.cz-camZ;ccz-=Math.round(ccz/TILE)*TILE;
        wx[i]=camX+ccx+p.x;wz[i]=camZ+ccz+p.z;const dy=p.y-cy;
        dist[i]=(wx[i]-camX)**2+dy*dy+(wz[i]-camZ)**2;order[i]=i;
      }
      const ord=Array.from(order.subarray(0,visibleN)).sort((a,b)=>dist[b]-dist[a]);
      const A=aPuff.array,S=aShade.array;
      for(let k=0;k<ord.length;k++){const i=ord[k],p=puffs[i];A[k*4]=wx[i];A[k*4+1]=p.y;A[k*4+2]=wz[i];A[k*4+3]=p.size;S[k*4]=p.nx;S[k*4+1]=p.ny;S[k*4+2]=p.nz;S[k*4+3]=p.rot;}
      aPuff.needsUpdate=true;aShade.needsUpdate=true;
    }};
  return sys;
}
export function buildAirport(){
  const g=new THREE.Group(),H=AIRPORT_H;
  const runwayMat=new THREE.MeshStandardMaterial({map:makeRunwayTexture(),roughness:.88,metalness:0});
  const runway=new THREE.Mesh(new THREE.BoxGeometry(RUNWAY_HALF_W*2,.3,RUNWAY_HALF_L*2),runwayMat);
  // Only the top face should carry the markings: remap side faces to the asphalt edge.
  runway.position.set(0,H+.06-.15,0);runway.receiveShadow=true;g.add(runway);
  const shoulder=new THREE.Mesh(new THREE.BoxGeometry(RUNWAY_HALF_W*2+10,.2,RUNWAY_HALF_L*2+40),new THREE.MeshStandardMaterial({color:0x5f5f58,roughness:.95}));shoulder.position.set(0,H-.07,0);shoulder.receiveShadow=true;g.add(shoulder);
  const concrete=new THREE.MeshStandardMaterial({color:0x8d8b84,roughness:.9});
  const taxi=new THREE.Mesh(new THREE.BoxGeometry(18,.2,RUNWAY_HALF_L*2-120),concrete);taxi.position.set(-75,H-.02,0);taxi.receiveShadow=true;g.add(taxi);
  for(const z of [-RUNWAY_HALF_L+70,0,RUNWAY_HALF_L-70]){const link=new THREE.Mesh(new THREE.BoxGeometry(56,.2,16),concrete);link.position.set(-48,H-.02,z);link.receiveShadow=true;g.add(link);}
  const apron=new THREE.Mesh(new THREE.BoxGeometry(110,.2,220),concrete);apron.position.set(-140,H-.02,-60);apron.receiveShadow=true;g.add(apron);
  const metal=new THREE.MeshStandardMaterial({color:0xb8bec2,roughness:.38,metalness:.75});
  const hangarGeo=new THREE.CylinderGeometry(16,16,40,24,1,false,0,Math.PI).rotateZ(Math.PI/2).rotateY(Math.PI/2);
  for(let i=0;i<3;i++){const h=new THREE.Mesh(hangarGeo,metal);h.position.set(-218,H,-150+i*62);h.rotation.y=Math.PI/2;h.castShadow=true;h.receiveShadow=true;g.add(h);
    const door=new THREE.Mesh(new THREE.PlaneGeometry(30,14),new THREE.MeshStandardMaterial({color:0x3d4448,roughness:.6,metalness:.4}));door.position.set(-198.2,H+7,-150+i*62);door.rotation.y=Math.PI/2;g.add(door);}
  const towerMat=new THREE.MeshStandardMaterial({color:0xd9d6cf,roughness:.8});
  const tower=new THREE.Mesh(new THREE.CylinderGeometry(3.2,4,24,12),towerMat);tower.position.set(-150,H+12,90);tower.castShadow=true;g.add(tower);
  const cab=new THREE.Mesh(new THREE.CylinderGeometry(6,5,5,8),glass);cab.position.set(-150,H+26.5,90);g.add(cab);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(6.8,6.8,.8,8),towerMat);cap.position.set(-150,H+29.4,90);g.add(cap);
  const term=new THREE.Mesh(new THREE.BoxGeometry(30,9,70),new THREE.MeshStandardMaterial({color:0xcfd2d0,roughness:.6}));term.position.set(-215,H+4.5,40);term.castShadow=true;g.add(term);
  // Windsock
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,8,6),metal);pole.position.set(40,H+4,-420);g.add(pole);
  const sock=new THREE.Mesh(new THREE.CylinderGeometry(.9,.35,5,12,1,true).rotateZ(Math.PI/2).translate(2.6,0,0),new THREE.MeshStandardMaterial({color:0xff6a1a,roughness:.7,side:THREE.DoubleSide}));
  sock.position.set(40,H+7.6,-420);sock.rotation.y=Math.atan2(state.wind.z,-state.wind.x);g.add(sock);
  // Runway edge, threshold and PAPI lights (bloom picks up their emissive cores).
  const lightGeo=new THREE.SphereGeometry(.28,8,6);
  const mk=(c,int)=>new THREE.MeshStandardMaterial({color:0x111111,emissive:c,emissiveIntensity:int});
  const edgePts=[],greenPts=[],redPts=[];
  for(let z=-RUNWAY_HALF_L;z<=RUNWAY_HALF_L;z+=60)for(const s of [-1,1])edgePts.push([s*(RUNWAY_HALF_W+1.2),z]);
  for(let x=-RUNWAY_HALF_W;x<=RUNWAY_HALF_W;x+=4){greenPts.push([x,RUNWAY_HALF_L+2]);redPts.push([x,-RUNWAY_HALF_L-2]);}
  for(const [pts,m] of [[edgePts,mk(0xfff2d0,6)],[greenPts,mk(0x3cff7a,6)],[redPts,mk(0xff3020,6)]]){
    const im=new THREE.InstancedMesh(lightGeo,m,pts.length);pts.forEach(([x,z],i)=>{_m4.makeTranslation(x,H+.35,z);im.setMatrixAt(i,_m4);});g.add(im);
  }
  for(let i=0;i<4;i++){const p=new THREE.Mesh(new THREE.BoxGeometry(1.2,.8,.6),mk(i<2?0xffffff:0xff2a1a,5));p.position.set(-RUNWAY_HALF_W-14-i*3,H+.5,RUNWAY_HALF_L-300);g.add(p);}
  scene.add(g);
}

// Bush strips: edge cones, threshold boards, windsock and a small cabin with fuel drums.
export function buildStrips(){
  const strips=terrain.strips;if(!strips.length)return;
  const g=new THREE.Group();
  const cone=new THREE.ConeGeometry(.32,.75,10).translate(0,.375,0);
  const coneMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.6});
  const board=new THREE.BoxGeometry(2.4,.12,.9).translate(0,.06,0);
  const boardMat=new THREE.MeshStandardMaterial({color:0xf2efe6,roughness:.7});
  let nCones=0,nBoards=0;for(const s of strips){nCones+=2*(Math.floor(2*s.halfL/64)+1);nBoards+=8;}
  const cones=new THREE.InstancedMesh(cone,coneMat,nCones),boards=new THREE.InstancedMesh(board,boardMat,nBoards);
  const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),V=new THREE.Vector3(),S1=new THREE.Vector3(1,1,1),C=new THREE.Color();
  const place=(s,u,v,y)=>V.set(s.x+s.cos*u-s.sin*v,y,s.z+s.sin*u+s.cos*v);
  let ci=0,bi=0;
  const wood=new THREE.MeshStandardMaterial({color:0x7a5a3c,roughness:.85});
  const tin=new THREE.MeshStandardMaterial({color:0x51695a,roughness:.45,metalness:.55});
  const drumMat=new THREE.MeshStandardMaterial({color:0xa8332a,roughness:.5,metalness:.4});
  const sockMat=new THREE.MeshStandardMaterial({color:0xff6a1a,roughness:.7,side:THREE.DoubleSide});
  const poleMat=new THREE.MeshStandardMaterial({color:0xd8d8d8,roughness:.4,metalness:.6});
  const roofShape=new THREE.Shape();roofShape.moveTo(-2.6,0);roofShape.lineTo(2.6,0);roofShape.lineTo(0,1.5);roofShape.lineTo(-2.6,0);
  const roofGeo=new THREE.ExtrudeGeometry(roofShape,{depth:5.6,bevelEnabled:false}).translate(0,0,-2.8);
  for(const s of strips){
    const rot=-s.ang;Q.setFromAxisAngle(new THREE.Vector3(0,1,0),rot);
    for(let u=-s.halfL;u<=s.halfL+.1;u+=64)for(const side of [-1,1]){
      place(s,u,side*(s.halfW+1.6),s.h);M.compose(V,Q,S1);cones.setMatrixAt(ci,M);
      C.set(((u/64)|0)%2?0xffffff:0xff6b1f);cones.setColorAt(ci++,C);
    }
    for(const end of [-1,1])for(let k=0;k<4;k++){
      place(s,end*(s.halfL-8),(k-1.5)*5.2,s.h+.02);M.compose(V,Q,S1);boards.setMatrixAt(bi++,M);
    }
    // cabin + roof + drums beside the strip
    const cab=new THREE.Group();place(s,s.halfL*.35,s.halfW+24,s.h);cab.position.copy(V);cab.rotation.y=rot;
    const hut=new THREE.Mesh(new THREE.BoxGeometry(4.6,3,5.2).translate(0,1.5,0),wood);hut.castShadow=true;hut.receiveShadow=true;cab.add(hut);
    const roof=new THREE.Mesh(roofGeo,tin);roof.position.y=3;roof.castShadow=true;cab.add(roof);
    const door=new THREE.Mesh(new THREE.PlaneGeometry(1.1,2),new THREE.MeshStandardMaterial({color:0x3b2a1c,roughness:.9}));door.position.set(0,1,-2.61);door.rotation.y=Math.PI;cab.add(door);
    const drum=new THREE.CylinderGeometry(.3,.3,.9,14).translate(0,.45,0);
    for(let k=0;k<3;k++){const d=new THREE.Mesh(drum,drumMat);d.position.set(3.2+(k%2)*.65,0,-1+k*.62);d.castShadow=true;cab.add(d);}
    g.add(cab);
    // windsock near the threshold
    place(s,-s.halfL+70,-(s.halfW+12),s.h);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,6.5,8).translate(0,3.25,0),poleMat);pole.position.copy(V);g.add(pole);
    const sock=new THREE.Mesh(new THREE.CylinderGeometry(.6,.25,3.4,12,1,true).rotateZ(Math.PI/2).translate(1.8,0,0),sockMat);
    sock.position.set(V.x,V.y+6.2,V.z);sock.rotation.y=Math.atan2(state.wind.z,-state.wind.x);g.add(sock);
  }
  for(const m of [cones,boards]){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();m.receiveShadow=true;g.add(m);}
  scene.add(g);
}

// ---------------------------------------------------------------- landmark set pieces
const rockMat=()=>new THREE.MeshStandardMaterial({vertexColors:true,roughness:.93,metalness:0});
// Tapered, jittered column with horizontal strata (vertex colours) — base for spires and stacks.
function rockColumn(h,r0,r1,seed,seg=14,rings=18){
  const g=new THREE.CylinderGeometry(r1,r0,h,seg,rings,false).translate(0,h/2,0),p=g.attributes.position,rnd=terrain.mulberry32(seed);
  const off=[];for(let i=0;i<rings+1;i++)off.push((rnd()-.5)*.35);
  const col=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){
    const y=p.getY(i),t=y/h,ring=Math.round(t*rings),ang=Math.atan2(p.getZ(i),p.getX(i));
    const bulge=1+off[ring]+Math.sin(ang*3+seed)*.12+Math.sin(ang*7+ring)*.05;
    p.setX(i,p.getX(i)*bulge);p.setZ(i,p.getZ(i)*bulge);
    const band=.78+.22*Math.sin(y*.55+seed)*Math.sin(y*.13),k=(.62+.38*t)*band;
    col[i*3]=.19*k;col[i*3+1]=.17*k;col[i*3+2]=.145*k;
    if(y<6){col[i*3]*=.55;col[i*3+1]*=.58;col[i*3+2]*=.6;}
  }
  g.setAttribute('color',new THREE.BufferAttribute(col,3));g.computeVertexNormals();
  return g;
}
export function buildLandmarkProps(landmarks){
  const group=new THREE.Group();
  for(const l of landmarks){
    if(l.type==='spire'){
      const base=terrain.heightAt(l.x,l.z),g=rockColumn(l.height,18,3.2,l.id*977+5,16,24);
      const m=new THREE.Mesh(g,rockMat());m.position.set(l.x,base-6,l.z);m.castShadow=true;m.receiveShadow=true;group.add(m);
      const scree=new THREE.Mesh(new THREE.ConeGeometry(34,14,18,2).translate(0,7,0),new THREE.MeshStandardMaterial({color:0x6d675e,roughness:1}));scree.position.set(l.x,base-9,l.z);group.add(scree);
      l.top=base-6+l.height;
    }
    if(l.type==='stacks'){
      const rnd=terrain.mulberry32(l.id*331+9),n=3+Math.floor(rnd()*3);
      for(let i=0;i<n;i++){
        const a=rnd()*6.28,r=rnd()*90,h=l.top*(.45+rnd()*.6),g=rockColumn(h+20,10+rnd()*9,4+rnd()*5,l.id*97+i,12,14);
        const m=new THREE.Mesh(g,rockMat());m.position.set(l.x+Math.cos(a)*r,-20,l.z+Math.sin(a)*r);m.rotation.y=rnd()*6;m.castShadow=true;group.add(m);
      }
      // a natural arch
      const arch=new THREE.TorusGeometry(26,8,10,26,Math.PI),ap=arch.attributes.position,rr=terrain.mulberry32(l.id*17);
      for(let i=0;i<ap.count;i++){ap.setX(i,ap.getX(i)*(1+(rr()-.5)*.08));ap.setY(i,ap.getY(i)*(1+(rr()-.5)*.08));}
      const ac=new Float32Array(ap.count*3);for(let i=0;i<ap.count;i++){const k=.6+.3*Math.sin(ap.getY(i)*.4);ac[i*3]=.19*k;ac[i*3+1]=.17*k;ac[i*3+2]=.145*k;}
      arch.setAttribute('color',new THREE.BufferAttribute(ac,3));arch.computeVertexNormals();
      const am=new THREE.Mesh(arch,rockMat());am.position.set(l.x+60,-4,l.z-40);am.rotation.y=rnd()*3;am.scale.set(1,1.15,1.2);am.castShadow=true;group.add(am);
    }
    if(l.type==='falls')group.add(buildWaterfall(l));
    if(l.type==='lighthouse')group.add(buildLighthouse(l));
    if(l.type==='wreck')group.add(buildWreck(l));
    if(l.type==='arch')group.add(buildArch(l));
  }
  scene.add(group);
}
// Lighthouse: banded tower, gallery, glowing lantern with a sweeping beam, keeper's cottage.
export const beams=[];
function buildLighthouse(l){
  const g=new THREE.Group(),y=Math.max(terrain.heightAt(l.x,l.z),0),H=24;
  const tower=new THREE.CylinderGeometry(2.1,3.2,H,20,12).translate(0,H/2,0),tp=tower.attributes.position,tc=new Float32Array(tp.count*3);
  for(let i=0;i<tp.count;i++){const band=Math.floor(tp.getY(i)/4)%2===1;const c=band?[.62,.08,.07]:[.93,.92,.88];tc.set(c,i*3);}
  tower.setAttribute('color',new THREE.BufferAttribute(tc,3));
  const t=new THREE.Mesh(tower,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.6}));t.castShadow=true;g.add(t);
  const dark=new THREE.MeshStandardMaterial({color:0x22272c,roughness:.5,metalness:.5});
  const gallery=new THREE.Mesh(new THREE.CylinderGeometry(3.1,3.1,.4,20).translate(0,H+.2,0),dark);g.add(gallery);
  const lantern=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.5,2.4,14).translate(0,H+1.6,0),new THREE.MeshStandardMaterial({color:0x111111,emissive:0xffd889,emissiveIntensity:4,transparent:true,opacity:.92}));g.add(lantern);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(1.9,1.8,14).translate(0,H+3.7,0),new THREE.MeshStandardMaterial({color:0x8a1a14,roughness:.5}));g.add(roof);
  // sweeping beam: two long soft cones, additive
  const bc=document.createElement('canvas');bc.width=8;bc.height=128;const bg=bc.getContext('2d'),gr=bg.createLinearGradient(0,0,0,128);gr.addColorStop(0,'rgba(255,240,200,0)');gr.addColorStop(1,'rgba(255,240,200,.55)');bg.fillStyle=gr;bg.fillRect(0,0,8,128);
  const dusk=1-Math.min(1,Math.max(0,(sky.sunDir.y-.04)/.3));
  const bm=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(bc),transparent:true,opacity:.08+.55*dusk,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:true});
  const beam=new THREE.Group();beam.position.y=H+1.6;
  for(const s of [1,-1]){const cone=new THREE.Mesh(new THREE.ConeGeometry(5,150,16,1,true).translate(0,-70,0).rotateZ(s*Math.PI/2),bm);beam.add(cone);}
  g.add(beam);beams.push(beam);
  // keeper's cottage
  const cot=new THREE.Group();cot.position.set(9,0,4);
  const walls=new THREE.Mesh(new THREE.BoxGeometry(7,3.2,5).translate(0,1.6,0),new THREE.MeshStandardMaterial({color:0xe9e4d8,roughness:.8}));walls.castShadow=true;cot.add(walls);
  const rs=new THREE.Shape();rs.moveTo(-3.8,0);rs.lineTo(3.8,0);rs.lineTo(0,2);rs.lineTo(-3.8,0);
  const rf=new THREE.Mesh(new THREE.ExtrudeGeometry(rs,{depth:5.6,bevelEnabled:false}).translate(0,3.2,-2.8),new THREE.MeshStandardMaterial({color:0x52331f,roughness:.8}));cot.add(rf);g.add(cot);
  g.position.set(l.x,y-.5,l.z);l.top=y+H+4;
  return g;
}
export function updateLandmarkFx(t){for(const b of beams)b.rotation.y=t*.7;}
// Old wreck: a long-abandoned high-wing single, nose-down in the grass, one wing torn away.
function buildWreck(l){
  const g=new THREE.Group(),y=terrain.heightAt(l.x,l.z),r=terrain.mulberry32(l.id*991+3);
  const paint=new THREE.MeshStandardMaterial({color:0x8b857a,roughness:.95,metalness:.15});
  const rust=new THREE.MeshStandardMaterial({color:0x6e4a33,roughness:1,metalness:.15});
  const stripe=new THREE.MeshStandardMaterial({color:0x6b2a22,roughness:.95});
  const dark=new THREE.MeshStandardMaterial({color:0x2a2622,roughness:.9});
  const jit=(geo,a)=>{const p=geo.attributes.position;for(let i=0;i<p.count;i++){p.setXYZ(i,p.getX(i)+(r()-.5)*a,p.getY(i)+(r()-.5)*a,p.getZ(i)+(r()-.5)*a);}geo.computeVertexNormals();return geo;};
  const plane=new THREE.Group();
  const fus=new THREE.Mesh(jit(new THREE.CylinderGeometry(.55,.95,6.5,12,6).rotateZ(Math.PI/2),.12),paint);plane.add(fus);
  const tailBoom=new THREE.Mesh(jit(new THREE.CylinderGeometry(.18,.55,3.2,10,3).rotateZ(Math.PI/2).translate(4.8,.15,0),.06),paint);plane.add(tailBoom);
  const band=new THREE.Mesh(new THREE.CylinderGeometry(.97,.97,.5,12).rotateZ(Math.PI/2).translate(-.8,0,0),stripe);plane.add(band);
  const fin=new THREE.Mesh(jit(new THREE.BoxGeometry(1.4,1.6,.1).translate(6,1,0),.05),paint);fin.rotation.z=-.15;plane.add(fin);
  const stab=new THREE.Mesh(jit(new THREE.BoxGeometry(1.1,.08,3.4).translate(6.1,.25,0),.05),rust);plane.add(stab);
  const wing=new THREE.Mesh(jit(new THREE.BoxGeometry(1.6,.14,5.2,4,1,8).translate(-.4,1.05,2.9),.12),paint);wing.rotation.x=.12;plane.add(wing);
  const stump=new THREE.Mesh(jit(new THREE.BoxGeometry(1.6,.14,1.3,2,1,2).translate(-.4,1.05,-1.2),.15),rust);plane.add(stump);
  const cowl=new THREE.Mesh(jit(new THREE.CylinderGeometry(.62,.55,.9,12).rotateZ(Math.PI/2).translate(-3.6,0,0),.1),rust);plane.add(cowl);
  for(let k=0;k<2;k++){const b=new THREE.Mesh(new THREE.BoxGeometry(.06,1.6,.18).translate(0,.8,0),dark);b.position.set(-4.1,0,0);b.rotation.set(k?2.9:.4,0,k?.6:-.9);plane.add(b);}
  const gear=new THREE.Mesh(new THREE.TorusGeometry(.32,.12,8,14),dark);gear.position.set(-1.2,-.9,.9);gear.rotation.y=1.4;plane.add(gear);
  plane.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  plane.rotation.set(.32+r()*.1,r()*6.28,-.28-r()*.1);plane.position.set(l.x,y+.55,l.z);g.add(plane);
  // the torn-off wing lies a little way off, upside down
  const lost=new THREE.Mesh(jit(new THREE.BoxGeometry(1.6,.14,5,4,1,8),.1),paint);lost.castShadow=true;
  const a=r()*6.28;lost.position.set(l.x+Math.cos(a)*14,terrain.heightAt(l.x+Math.cos(a)*14,l.z+Math.sin(a)*14)+.25,l.z+Math.sin(a)*14);lost.rotation.set(Math.PI-.08,r()*6.28,.12);g.add(lost);
  // scattered panels and grass tufts growing through
  const panel=new THREE.BoxGeometry(1.4,.05,.8);
  for(let k=0;k<9;k++){const m=new THREE.Mesh(panel,k%3?rust:paint);const b=r()*6.28,d=4+r()*12;m.position.set(l.x+Math.cos(b)*d,terrain.heightAt(l.x+Math.cos(b)*d,l.z+Math.sin(b)*d)+.06,l.z+Math.sin(b)*d);m.rotation.set(r()*.5,r()*6.28,r()*.5);m.scale.setScalar(.5+r()*1.2);m.receiveShadow=true;g.add(m);}
  const tuftMat=new THREE.MeshStandardMaterial({color:0x4f6a2c,roughness:1});
  for(let k=0;k<14;k++){const t=new THREE.Mesh(new THREE.ConeGeometry(.25,.9+r()*.8,5).translate(0,.45,0),tuftMat);const b=r()*6.28,d=r()*4;t.position.set(l.x+Math.cos(b)*d,terrain.heightAt(l.x+Math.cos(b)*d,l.z+Math.sin(b)*d),l.z+Math.sin(b)*d);g.add(t);}
  return g;
}
// Natural sandstone arch: noisy, uneven thickness, layered strata and rubble at the feet.
function buildArch(l){
  const g=new THREE.Group(),r=terrain.mulberry32(l.id*577+11),R=24+r()*14,tube=6.5+r()*3,y=terrain.heightAt(l.x,l.z);
  const geo=new THREE.TorusGeometry(R,tube,16,64,Math.PI),p=geo.attributes.position,c=new Float32Array(p.count*3),ph=r()*10;
  const n3=(x,y,z)=>Math.sin(x*.19+ph)*Math.sin(y*.23)*Math.sin(z*.31+ph)+.5*Math.sin(x*.47+y*.41)*Math.sin(z*.53-ph)+.25*Math.sin(x*1.1+z*.9+y*.7);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),yy=p.getY(i),z=p.getZ(i),ang=Math.atan2(yy,x),thick=.75+.4*Math.abs(Math.cos(ang))+.15*Math.sin(ang*5+ph);
    const cx=Math.cos(ang)*R,cy=Math.sin(ang)*R,dx=x-cx,dy=yy-cy,k=thick*(1+.22*n3(x,yy,z));
    p.setXYZ(i,cx+dx*k,cy+dy*k,z*k*(1.15+.2*Math.sin(ang*3)));
    const band=.8+.2*Math.sin((cy+dy*k)*.55+n3(x,yy,z)*1.5),dk=.7+.3*(dy>0?1:.8);
    c.set([.36*band*dk,.13*band*dk,.055*band*dk],i*3);
  }
  geo.setAttribute('color',new THREE.BufferAttribute(c,3));geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,rockMat());m.castShadow=true;m.receiveShadow=true;m.position.set(0,-tube*.5,0);g.add(m);
  const rub=new THREE.DodecahedronGeometry(2.2,0),rm=new THREE.MeshStandardMaterial({color:0x7a4a2e,roughness:1,flatShading:true});
  for(let k=0;k<16;k++){const b=new THREE.Mesh(rub,rm);const side=k%2?1:-1;b.position.set(side*R+(r()-.5)*14,(r()-.2)*2,(r()-.5)*16);b.scale.set(.6+r()*1.6,.4+r()*1,.6+r()*1.4);b.rotation.set(r()*3,r()*3,r()*3);b.castShadow=true;g.add(b);}
  g.position.set(l.x,y,l.z);g.rotation.y=r()*3;l.top=y+R+tube;
  return g;
}
// Waterfall: a ribbon that follows the cliff face from the lip to the sea, with streaking
// water in the shader and a mist plume at the foot.
let fallsMat=null;
function buildWaterfall(l){
  const g=new THREE.Group(),N=28,W=24,dx=l.toX-l.x,dz=l.toZ-l.z,len=Math.hypot(dx,dz)||1,ux=dx/len,uz=dz/len,px=-uz,pz=ux;
  const pos=[],uv=[],idx=[];
  for(let i=0;i<=N;i++){
    const t=i/N,x=l.x+dx*t*1.05,z=l.z+dz*t*1.05,y=Math.max(terrain.heightAt(x,z),0)+2.2+t*1.5,w=W*(.7+t*.5);
    for(const s of [-1,1]){pos.push(x+px*w*s/2,y,z+pz*w*s/2);uv.push((s+1)/2,t);}
    if(i<N){const a=i*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
  fallsMat=fallsMat||new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uTime:shared.time}]),
    vertexShader:`varying vec2 vUv;
      #include <common>
      #include <fog_pars_vertex>
      void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader:`uniform float uTime;varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      float h1(float x){return fract(sin(x*127.1)*43758.5453);}
      void main(){
        float col=floor(vUv.x*38.);float sp=.6+h1(col)*.8;
        float s=fract(vUv.y*6.-uTime*sp*1.4+h1(col+3.)*7.);
        float streak=smoothstep(.0,.25,s)*smoothstep(1.,.55,s);
        float edge=smoothstep(0.,.18,vUv.x)*smoothstep(1.,.82,vUv.x);
        float a=edge*(.55+.45*streak)*smoothstep(0.,.04,vUv.y);
        vec3 c=mix(vec3(.62,.74,.8),vec3(.97,.99,1.),streak*.8+vUv.y*.2);
        gl_FragColor=vec4(c*1.25,a*.92);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:true
  });
  const ribbon=new THREE.Mesh(geo,fallsMat);ribbon.renderOrder=5;g.add(ribbon);
  // mist at the foot
  const tex=makePuffTexture(),mist=new THREE.SpriteMaterial({map:tex,color:0xf2f7fb,transparent:true,opacity:.5,depthWrite:false,fog:true});
  for(let i=0;i<7;i++){const s=new THREE.Sprite(mist);const t=.9+Math.random()*.15;s.position.set(l.x+dx*t+(Math.random()-.5)*40,4+Math.random()*16,l.z+dz*t+(Math.random()-.5)*40);const k=34+Math.random()*30;s.scale.set(k,k*.7,1);g.add(s);}
  return g;
}
// Survey beacon left at every charted landmark: a cairn with a pennant (or a buoy on water).
let beaconMats=null;
export function addBeacon(l){
  if(!beaconMats){
    beaconMats={stone:new THREE.MeshStandardMaterial({color:0x8a857c,roughness:.95,flatShading:true}),pole:new THREE.MeshStandardMaterial({color:0xece6d6,roughness:.5}),
      light:new THREE.MeshStandardMaterial({color:0x111111,emissive:0x71d8ee,emissiveIntensity:5}),buoy:new THREE.MeshStandardMaterial({color:0xe2552e,roughness:.45}),
      flag:new THREE.MeshStandardMaterial({color:0xf3e7c9,roughness:.8,side:THREE.DoubleSide})};
    beaconMats.flag.onBeforeCompile=sh=>{sh.uniforms.uTime=shared.time;sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform float uTime;').replace('#include <begin_vertex>','#include <begin_vertex>\nfloat w=uv.x;transformed.z+=sin(uTime*6.+uv.x*5.)*.35*w;transformed.y+=sin(uTime*4.+uv.x*3.)*.12*w;');};
  }
  const M=beaconMats,g=new THREE.Group(),water=['lake','crater','river','stacks'].includes(l.type);
  let y,x=l.x,z=l.z;
  if(l.type==='spire'){y=l.top;}
  else if(l.type==='falls'){y=terrain.heightAt(x,z);}
  else{y=Math.max(terrain.heightAt(x,z),0);}
  if(water&&y<=.5){
    const buoy=new THREE.Mesh(new THREE.SphereGeometry(1.6,16,12),M.buoy);buoy.scale.y=.8;g.add(buoy);
    const mast=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,4.5,6).translate(0,2.3,0),M.pole);g.add(mast);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.35,10,8),M.light);lamp.position.y=4.7;g.add(lamp);
    g.userData.bob=true;y=0;
  }else{
    const rnd=terrain.mulberry32(l.id*71+3);
    for(let i=0;i<6;i++){const s=new THREE.Mesh(new THREE.DodecahedronGeometry(1.5-i*.18,0),M.stone);s.position.set((rnd()-.5)*.6,i*1.25+.6,(rnd()-.5)*.6);s.rotation.set(rnd()*3,rnd()*3,rnd()*3);s.castShadow=true;g.add(s);}
    const poleH=l.type==='forest'?28:9;
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.1,.12,poleH,6).translate(0,poleH/2+2,0),M.pole);g.add(pole);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(3.2,1.6,8,2).translate(1.6,0,0),M.flag);flag.position.y=poleH+1.2;g.add(flag);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.32,10,8),M.light);lamp.position.y=poleH+2.3;g.add(lamp);
  }
  g.position.set(x,y,z);g.userData.landmark=l.id;beacons.push(g);scene.add(g);
}
export const beacons=[];
export function updateBeacons(t){for(const b of beacons)if(b.userData.bob){b.position.y=Math.sin(t*1.3+b.userData.landmark)*.25;b.rotation.z=Math.sin(t*.9+b.userData.landmark)*.06;}}
