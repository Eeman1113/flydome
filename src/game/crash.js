// SKYBOUND · crash — fire, smoke, debris, crumpling and a shock distortion on impact.
// The wreck is rebuilt from the cached model on restart, so deformation is non-destructive.
import * as THREE from 'three';
import { clamp } from './util.js';
import { aircraft, state } from './config.js';
import { scene, plane, gradePass } from './engine.js';
import { groundLevelAt } from './chunks.js';

let fx=null;
function flameTexture(smoke=false){
  const S=128,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');
  for(let i=0;i<14;i++){
    const x=S/2+(Math.random()-.5)*S*.35,y=S/2+(Math.random()-.5)*S*.35,r=S*(.18+Math.random()*.22),gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,smoke?'rgba(255,255,255,.35)':'rgba(255,255,255,.9)');gr.addColorStop(.5,smoke?'rgba(255,255,255,.18)':'rgba(255,255,255,.35)');gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr;g.fillRect(0,0,S,S);
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
const tex={};
function sprite(map,color,additive){
  const m=new THREE.SpriteMaterial({map,color,transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,fog:true});
  const s=new THREE.Sprite(m);s.renderOrder=12;return s;
}
export function triggerCrash(kind){
  clearCrash();
  tex.fire=tex.fire||flameTexture(false);tex.smoke=tex.smoke||flameTexture(true);
  const p=aircraft.position.clone(),v=aircraft.velocity.clone(),water=kind==='water';
  const group=new THREE.Group();scene.add(group);
  fx={t:0,group,p,water,debris:[],particles:[],emitT:0,shock:1,light:null,camT:0};
  // fireball / splash burst
  for(let i=0;i<(water?40:26);i++){
    const s=sprite(water?tex.smoke:tex.fire,water?0xeaf3f8:0xffb050,!water);
    const dir=new THREE.Vector3(Math.random()-.5,Math.random()*.9+.2,Math.random()-.5).normalize();
    s.position.copy(p);group.add(s);
    fx.particles.push({s,vel:dir.multiplyScalar(water?8+Math.random()*16:5+Math.random()*12).add(v.clone().multiplyScalar(.15)),life:0,max:water?1.6+Math.random():0.9+Math.random()*.6,size:water?3+Math.random()*4:6+Math.random()*7,grow:water?3:9,kind:water?'spray':'burst'});
  }
  if(!water){fx.light=new THREE.PointLight(0xff7a2a,60,90,1.6);fx.light.position.copy(p).add(new THREE.Vector3(0,3,0));group.add(fx.light);}
  breakApart(v,water);
  // shards: torn metal and burning fragments flung from the impact
  const shardGeo=new THREE.TetrahedronGeometry(.35,0),shardMat=new THREE.MeshStandardMaterial({color:0xb9bec4,roughness:.45,metalness:.7,flatShading:true});
  const emberMat=new THREE.MeshStandardMaterial({color:0x221a14,emissive:0xff6a1a,emissiveIntensity:3,roughness:.8});
  for(let i=0;i<(water?10:34);i++){
    const m=new THREE.Mesh(shardGeo,i%4===0&&!water?emberMat:shardMat);m.position.copy(p);const s=.5+Math.random()*1.6;m.scale.set(s,s*.4,s*.8);m.castShadow=true;fx.group.add(m);
    const dir=new THREE.Vector3(Math.random()-.5,.35+Math.random()*.9,Math.random()-.5).normalize();
    fx.debris.push({m,vel:dir.multiplyScalar(6+Math.random()*16).add(v.clone().multiplyScalar(.3)),spin:new THREE.Vector3(Math.random()*14,Math.random()*14,Math.random()*14),rest:false});
  }
  fx.shock=1;
}
// Tear off a handful of parts and crumple what is left near the impact point.
function breakApart(v,water){
  if(!plane)return;
  const model=plane.userData.visualModel;model.updateMatrixWorld(true);
  const meshes=[];model.traverse(o=>{if(o.isMesh&&o.visible&&!o.material.transparent)meshes.push(o);});
  const sized=meshes.map(m=>{const b=new THREE.Box3().setFromObject(m),s=b.getSize(new THREE.Vector3());return {m,b,len:Math.max(s.x,s.y,s.z)};});
  const impact=aircraft.position.clone().add(v.clone().normalize().multiplyScalar(2)).add(new THREE.Vector3(0,-1,0));
  // tear off the biggest exterior pieces (tail surfaces, fairings, prop) plus a few random ones
  const ext=sized.filter(o=>o.len>.9&&o.len<7.5).sort((a,b)=>b.len-a.len);
  const parts=[...ext.slice(0,water?3:6),...ext.slice(6).sort(()=>Math.random()-.5).slice(0,water?1:4)];
  const prop=plane.userData.prop;if(prop&&!water)prop.traverse(o=>{if(o.isMesh&&!parts.some(p=>p.m===o))parts.push({m:o,b:new THREE.Box3().setFromObject(o),len:2});});
  for(const o of parts){
    scene.attach(o.m);
    const c=o.b.getCenter(new THREE.Vector3()),out=c.clone().sub(aircraft.position).setY(0).normalize();
    fx.debris.push({m:o.m,vel:v.clone().multiplyScalar(.35+Math.random()*.3).add(out.multiplyScalar(4+Math.random()*7)).add(new THREE.Vector3(0,5+Math.random()*9,0)),
      spin:new THREE.Vector3((Math.random()-.5)*8,(Math.random()-.5)*8,(Math.random()-.5)*8),rest:false});
  }
  // crumple: push vertices near the impact point back along the direction of travel
  const back=v.clone().normalize().multiplyScalar(-1),inv=new THREE.Matrix4(),W=new THREE.Vector3();
  for(const o of sized){
    if(fx.debris.some(d=>d.m===o.m))continue;
    if(o.b.distanceToPoint(impact)>5.5)continue;
    const m=o.m;m.geometry=m.geometry.clone();const pos=m.geometry.attributes.position;
    if(pos.normalized||!(pos.array instanceof Float32Array)){const f=new Float32Array(pos.count*3);for(let i=0;i<pos.count;i++){f[i*3]=pos.getX(i);f[i*3+1]=pos.getY(i);f[i*3+2]=pos.getZ(i);}m.geometry.setAttribute('position',new THREE.BufferAttribute(f,3));}
    const P=m.geometry.attributes.position;inv.copy(m.matrixWorld).invert();
    for(let i=0;i<P.count;i++){
      W.fromBufferAttribute(P,i).applyMatrix4(m.matrixWorld);const d=W.distanceTo(impact);if(d>4.4)continue;
      const k=Math.pow(1-d/4.4,1.3)*(.9+Math.sin(i*12.9898)*.35);
      W.addScaledVector(back,k*1.7).add(new THREE.Vector3(Math.sin(i*.7)*.18*k,-k*.35,Math.cos(i*1.3)*.18*k));
      W.applyMatrix4(inv);P.setXYZ(i,W.x,W.y,W.z);
    }
    P.needsUpdate=true;m.geometry.computeVertexNormals();
  }
}
export function updateCrash(dt){
  if(!fx)return;fx.t+=dt;
  const wind=state.wind;
  // shock distortion pulse in the grade pass
  fx.shock=Math.max(0,fx.shock-dt*1.6);if(gradePass?.uniforms.uShock)gradePass.uniforms.uShock.value=fx.shock;
  // sustained fire + smoke (or steam on water)
  fx.emitT-=dt;
  if(fx.emitT<0&&fx.t<45){
    fx.emitT=fx.water?.12:.035;
    const base=fx.p.clone();base.y=Math.max(groundLevelAt(base.x,base.z),0)+.6;
    if(!fx.water&&fx.t<38){const s=sprite(tex.fire,new THREE.Color().setHSL(.07+Math.random()*.04,1,.55),true);s.position.copy(base).add(new THREE.Vector3((Math.random()-.5)*4,0,(Math.random()-.5)*4));fx.group.add(s);fx.particles.push({s,vel:new THREE.Vector3((Math.random()-.5)*.8,3.5+Math.random()*3,(Math.random()-.5)*.8),life:0,max:.7+Math.random()*.5,size:2.5+Math.random()*2.5,grow:1.5,kind:'flame'});}
    if(Math.random()<(fx.water?1:.55)){const s=sprite(tex.smoke,fx.water?0xdfe7ec:new THREE.Color().setScalar(.08+Math.random()*.08),false);s.position.copy(base).add(new THREE.Vector3((Math.random()-.5)*3,2,(Math.random()-.5)*3));fx.group.add(s);fx.particles.push({s,vel:new THREE.Vector3(0,(fx.water?2:4)+Math.random()*2,0),life:0,max:fx.water?4:9+Math.random()*5,size:4+Math.random()*3,grow:fx.water?2.5:4.5,kind:'smoke'});}
  }
  for(let i=fx.particles.length-1;i>=0;i--){
    const q=fx.particles[i];q.life+=dt;const t=q.life/q.max;
    if(t>=1){fx.group.remove(q.s);q.s.material.dispose();fx.particles.splice(i,1);continue;}
    if(q.kind==='spray')q.vel.y-=9.8*dt;
    if(q.kind==='smoke'){q.vel.x+=(wind.x-q.vel.x)*dt*.4;q.vel.z+=(wind.z-q.vel.z)*dt*.4;}
    q.s.position.addScaledVector(q.vel,dt);
    const sz=q.size+q.grow*q.life*(q.kind==='burst'?3:1);q.s.scale.set(sz,sz,1);q.s.material.rotation+=dt*.4;
    const a=q.kind==='burst'?(1-t)*(1-t):q.kind==='flame'?Math.sin(t*Math.PI)*.9:q.kind==='spray'?(1-t)*.8:Math.sin(Math.min(1,t*4)*Math.PI/2)*(1-t)*.55;
    q.s.material.opacity=a;
    if(q.kind==='burst'||q.kind==='flame'){const c=q.s.material.color;c.setHSL(.09-t*.07,1,.6-t*.25);}
  }
  if(fx.light){fx.light.intensity=(fx.t<.4?180*(1-fx.t/.4)+40:40)*(.75+Math.random()*.5)*clamp(1-(fx.t-36)/8,0,1);}
  // debris physics
  for(const d of fx.debris){
    if(d.rest)continue;
    d.vel.y-=9.81*dt;d.m.position.addScaledVector(d.vel,dt);
    d.m.rotation.x+=d.spin.x*dt;d.m.rotation.y+=d.spin.y*dt;d.m.rotation.z+=d.spin.z*dt;
    const g=Math.max(groundLevelAt(d.m.position.x,d.m.position.z),fx.water?-1:-1e9)+.2;
    if(d.m.position.y<g){
      d.m.position.y=g;
      if(fx.water){d.vel.multiplyScalar(.2);d.vel.y=-.4;d.spin.multiplyScalar(.3);if(d.m.position.y<-.8)d.rest=true;}
      else{d.vel.y*=-.25;d.vel.x*=.55;d.vel.z*=.55;d.spin.multiplyScalar(.5);if(d.vel.length()<.6)d.rest=true;}
    }
  }
}
export function clearCrash(){
  if(!fx)return;
  for(const d of fx.debris){scene.remove(d.m);}
  for(const q of fx.particles)q.s.material.dispose();
  scene.remove(fx.group);fx=null;if(gradePass?.uniforms.uShock)gradePass.uniforms.uShock.value=0;
}
export function crashActive(){return !!fx;}
