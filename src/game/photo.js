// SKYBOUND · photo mode — freeze the world, frame a shot, capture it.
import * as THREE from 'three';
import { $, clamp } from './util.js';
import { WORLD_SEED, aircraft, state } from './config.js';
import { camera, renderer, bokehPass } from './engine.js';
import { setHud, toast } from './ui.js';
import { mission } from './survey.js';
import { sfx } from './sfx.js';

const P={yaw:.6,pitch:.18,dist:26,drag:null,dof:true,capture:false,shots:0};
export function togglePhoto(){if(state.photo)exitPhoto();else enterPhoto();}
export function enterPhoto(){
  if(!state.started||state.crashed)return;
  state.photo=true;state.photoWasPaused=state.paused;state.paused=true;$('pauseMenu').style.display='none';
  const a=aircraft.position,c=camera.position;P.dist=clamp(c.distanceTo(a),10,120);P.yaw=Math.atan2(c.x-a.x,c.z-a.z);P.pitch=Math.asin(clamp((c.y-a.y)/P.dist,-.3,1.2));
  document.body.classList.add('photo');setHud();
  const near=mission.landmarks.filter(l=>mission.discovered.has(l.id)).sort((p,q)=>Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(q.x-a.x,q.z-a.z))[0];
  $('photoCaption').textContent=near&&Math.hypot(near.x-a.x,near.z-a.z)<6000?`${near.name} · World #${WORLD_SEED}`:`World #${WORLD_SEED}`;
  $('photoDof').classList.toggle('on',P.dof);
}
export function exitPhoto(){
  state.photo=false;state.paused=!!state.photoWasPaused;document.body.classList.remove('photo');
  if(bokehPass)bokehPass.enabled=false;setHud();
}
export function bindPhotoUi(){
  $('photoCapture').onclick=()=>{P.capture=true;};
  $('photoExit').onclick=exitPhoto;
  $('photoDof').onclick=()=>{P.dof=!P.dof;$('photoDof').classList.toggle('on',P.dof);};
  const sim=$('sim');
  sim.addEventListener('pointerdown',e=>{if(state.photo)P.drag={x:e.clientX,y:e.clientY};});
  window.addEventListener('pointermove',e=>{if(!state.photo||!P.drag)return;P.yaw-=(e.clientX-P.drag.x)*.006;P.pitch=clamp(P.pitch+(e.clientY-P.drag.y)*.005,-.25,1.35);P.drag={x:e.clientX,y:e.clientY};});
  window.addEventListener('pointerup',()=>{P.drag=null;});
  sim.addEventListener('wheel',e=>{if(!state.photo)return;e.preventDefault();P.dist=clamp(P.dist*(e.deltaY>0?1.1:.9),7,260);},{passive:false});
  window.addEventListener('keydown',e=>{if(state.photo&&e.code==='Escape'){exitPhoto();e.stopImmediatePropagation();}},true);
}
export function updatePhotoCamera(dt){
  if(!state.photo)return;
  const k=state.keys;if(k.KeyA||k.ArrowLeft)P.yaw+=dt*.8;if(k.KeyD||k.ArrowRight)P.yaw-=dt*.8;if(k.KeyW||k.ArrowUp)P.pitch=clamp(P.pitch+dt*.5,-.25,1.35);if(k.KeyS||k.ArrowDown)P.pitch=clamp(P.pitch-dt*.5,-.25,1.35);
  const a=aircraft.position;
  camera.position.set(a.x+Math.sin(P.yaw)*Math.cos(P.pitch)*P.dist,a.y+1+Math.sin(P.pitch)*P.dist,a.z+Math.cos(P.yaw)*Math.cos(P.pitch)*P.dist);
  camera.up.set(0,1,0);camera.lookAt(a.x,a.y+.8,a.z);
  if(camera.fov!==50){camera.fov=50;camera.updateProjectionMatrix();}
  if(bokehPass){bokehPass.enabled=P.dof;bokehPass.uniforms.focus.value=P.dist;bokehPass.uniforms.aperture.value=.00012*(30/Math.max(P.dist,8));bokehPass.uniforms.maxblur.value=.008;}
}
export function afterRender(){
  if(!P.capture)return;P.capture=false;sfx.shutter();
  renderer.domElement.toBlob(b=>{if(!b)return;const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`skybound-${WORLD_SEED}-${++P.shots}.png`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},800);},'image/png');
  const f=$('photoFlash');f.classList.remove('go');void f.offsetWidth;f.classList.add('go');toast('Photo saved to your downloads.');
}
