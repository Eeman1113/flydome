// SKYBOUND · scenery
import * as THREE from 'three';
import { clamp } from './util.js';
import { RUNWAY_HALF_L, RUNWAY_HALF_W, SEA_LEVEL, SKY, WORLD_SEED, fx, glass, sky, state } from './config.js';
import { AIRPORT_H, terrain } from './world.js';
import { makePuffTexture, makeRunwayTexture } from './textures.js';
import { mats } from './materials.js';
import { _m4 } from './chunks.js';
import { scene } from './engine.js';

export function makeWater(){
  const g=new THREE.PlaneGeometry(1,1,1,1);g.rotateX(-Math.PI/2);
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
