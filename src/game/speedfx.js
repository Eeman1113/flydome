// SKYBOUND · speedfx: sense of speed at jet velocities: air streaks rushing past the camera
// and a radial edge blur in the grade pass. Both fade in above ~220 kt, so the Cessna never sees them.
import * as THREE from 'three';
import { aircraft, state } from './config.js';
import { smooth } from './util.js';
import { scene, camera, gradePass } from './engine.js';

const N=420,BOX=90;
let lines=null,seed=null,pos=null;
function init(){
  seed=new Float32Array(N*3);pos=new Float32Array(N*6);
  for(let i=0;i<N*3;i++)seed[i]=(Math.random()-.5)*BOX*2;
  const col=new Float32Array(N*8);for(let i=0;i<N;i++){const a=.35+Math.random()*.65;col.set([1,1,1,a,1,1,1,0],i*8);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('color',new THREE.BufferAttribute(col,4));
  lines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:0,depthWrite:false,fog:true}));
  lines.frustumCulled=false;lines.renderOrder=11;scene.add(lines);
}
export function updateSpeedFx(dt){
  const a=aircraft,k=state.started&&!state.crashed&&!state.photo?smooth(115,320,a.airspeed):0;
  if(gradePass?.uniforms.uSpeed)gradePass.uniforms.uSpeed.value=k*(state.camera===1?.28:1);
  if(!lines){if(k<=0)return;init();}
  lines.visible=k>.01;if(!lines.visible)return;
  // denser and brighter close to the ground, where speed reads best
  lines.material.opacity=k*(.18+.32*(1-smooth(60,900,a.altAGL)));
  const c=camera.position,v=a.velocity,len=.045;
  for(let i=0;i<N;i++){
    let x=seed[i*3]-v.x*dt,y=seed[i*3+1]-v.y*dt,z=seed[i*3+2]-v.z*dt;seed[i*3]=x;seed[i*3+1]=y;seed[i*3+2]=z;
    const wx=((x-c.x)%(BOX*2)+BOX*3)%(BOX*2)-BOX+c.x,wy=((y-c.y)%(BOX*2)+BOX*3)%(BOX*2)-BOX+c.y,wz=((z-c.z)%(BOX*2)+BOX*3)%(BOX*2)-BOX+c.z;
    const dx=wx-c.x,dy=wy-c.y,dz=wz-c.z,near=dx*dx+dy*dy+dz*dz<36?0:1,o=i*6;
    pos[o]=wx;pos[o+1]=wy;pos[o+2]=wz;pos[o+3]=wx+v.x*len*near;pos[o+4]=wy+v.y*len*near;pos[o+5]=wz+v.z*len*near;
  }
  lines.geometry.attributes.position.needsUpdate=true;
}
