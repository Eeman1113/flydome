// SKYBOUND · ghost — replays your best Daily Charter run as a translucent aircraft.
import * as THREE from 'three';
import { scene, plane } from './engine.js';
import { mission } from './survey.js';
import { state } from './config.js';

let ghost=null,data=null;
export function setGhost(rec){
  if(ghost){scene.remove(ghost);ghost=null;}
  data=rec&&rec.length>12?rec:null;if(!data||!plane)return;
  ghost=plane.userData.visualModel.clone(true);
  const mat=new THREE.MeshStandardMaterial({color:0x9fe8f6,emissive:0x2a6f7d,emissiveIntensity:.6,transparent:true,opacity:.32,depthWrite:false,roughness:.4});
  ghost.traverse(o=>{if(o.isMesh){o.material=mat;o.castShadow=false;o.receiveShadow=false;}o.layers.set(0);});
  const holder=new THREE.Group();holder.add(ghost);holder.rotation.order='YXZ';ghost=holder;scene.add(ghost);
}
export function updateGhost(){
  if(!ghost||!data||!state.started)return;
  const f=mission.flightTime/.2,n=data.length/6,i=Math.min(n-2,Math.floor(f)),t=Math.min(1,f-i);
  if(i<0)return;const A=i*6,B=A+6,L=(k)=>data[A+k]+(data[B+k]-data[A+k])*t;
  ghost.visible=f<n;
  ghost.position.set(L(0),L(1),L(2));
  let dy=data[B+3]-data[A+3];if(dy>Math.PI)dy-=2*Math.PI;if(dy<-Math.PI)dy+=2*Math.PI;
  ghost.rotation.set(L(4),data[A+3]+dy*t,-L(5));
}
