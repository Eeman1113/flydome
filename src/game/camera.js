// SKYBOUND · camera
import * as THREE from 'three';
import { clamp, lerp, smooth } from './util.js';
import { aircraft, camForward, camRight, camUp, cockpitEyeLocal, state } from './config.js';
import { groundLevelAt } from './chunks.js';
import { aircraftGroundOffset, camera, plane, worldTime } from './engine.js';

export const camTarget=new THREE.Vector3(),camPos=new THREE.Vector3(),camShake=new THREE.Vector3();let lastCameraMode=0,camFov=66;
export function updateCamera(dt,ctrl){const a=aircraft,q=plane.quaternion;camForward.set(0,0,-1).applyQuaternion(q);camUp.set(0,1,0).applyQuaternion(q);camRight.set(1,0,0).applyQuaternion(q);
  const speedK=smooth(20,75,a.airspeed);
  const targetFov=(state.camera===1?72:state.camera===2?62:state.camera===3?60:70)+speedK*5;
  camFov=lerp(camFov,targetFov,1-Math.exp(-dt*2));
  if(lastCameraMode!==state.camera||Math.abs(camera.fov-camFov)>.01){camera.fov=camFov;camera.updateProjectionMatrix();lastCameraMode=state.camera;}
  const onGround=a.altAGL<aircraftGroundOffset+.4;
  // Gentle runway rumble only (low frequency, a few millimetres); none in flight so the
  // cockpit stays steady at any airspeed and frame rate.
  const shakeAmt=onGround?smooth(3,30,a.airspeed)*(state.camera===1?.006:.012):0;
  const t=worldTime;camShake.set(Math.sin(t*11.3)*Math.sin(t*2.1),Math.sin(t*13.7+1.3)*Math.sin(t*1.7),0).multiplyScalar(shakeAmt);
  if(state.camera===1){
    camPos.copy(cockpitEyeLocal).applyQuaternion(q).add(a.position).addScaledVector(camUp,camShake.y).addScaledVector(camRight,camShake.x);
    camTarget.copy(camPos).addScaledVector(camForward,100).addScaledVector(camUp,-7.0);
    camera.position.copy(camPos);camera.up.copy(camUp);camera.lookAt(camTarget);
  }
  else if(state.camera===2){
    camera.up.set(0,1,0);
    const flatF=new THREE.Vector3(camForward.x,0,camForward.z).normalize();
    camPos.copy(a.position).addScaledVector(camForward,-17).addScaledVector(flatF,-3).addScaledVector(camUp,4.6*Math.max(camUp.y,0)).add(new THREE.Vector3(0,1.2+4.6*(1-Math.max(camUp.y,0)),0));
    const gmin=groundLevelAt(camPos.x,camPos.z)+2;if(camPos.y<gmin)camPos.y=gmin;
    camTarget.copy(a.position).addScaledVector(camForward,18).add(new THREE.Vector3(0,1.2,0));
    camera.position.lerp(camPos,1-Math.exp(-dt*7.5));camera.position.add(camShake);camera.lookAt(camTarget);
  }
  else{camera.up.set(0,1,0);state.orbitYaw-=ctrl.camX*dt*1.8;state.orbitPitch=clamp(state.orbitPitch-ctrl.camY*dt*1.4,-.2,1.1);if(state.mouseDown){state.orbitYaw-=state.mouseDx*.004;state.orbitPitch=clamp(state.orbitPitch-state.mouseDy*.004,-.2,1.1);state.mouseDx=state.mouseDy=0;}const radius=state.camera===3?32:70,ox=Math.sin(state.orbitYaw)*Math.cos(state.orbitPitch)*radius,oy=Math.sin(state.orbitPitch)*radius+5,oz=Math.cos(state.orbitYaw)*Math.cos(state.orbitPitch)*radius;camPos.set(a.position.x+ox,a.position.y+oy,a.position.z+oz);const gmin=groundLevelAt(camPos.x,camPos.z)+1.5;if(camPos.y<gmin)camPos.y=gmin;camera.position.lerp(camPos,1-Math.exp(-dt*3));camera.lookAt(a.position);}
}
export let menuT=0;
export function updateMenuCamera(dt){
  // Slow cinematic orbit around the parked aircraft, framed right of the menu card.
  menuT+=dt;
  const a=aircraft.position,ang=menuT*.045+2.2,r=21+Math.sin(menuT*.07)*3;
  if(camera.fov!==45){camera.fov=45;camera.updateProjectionMatrix();}
  if(!camera.view||!camera.view.enabled||camera.view.offsetX!==-innerWidth*.27)camera.setViewOffset(innerWidth,innerHeight,-innerWidth*.27,0,innerWidth,innerHeight);
  camera.up.set(0,1,0);
  camera.position.set(a.x+Math.cos(ang)*r,a.y+1.6+Math.sin(menuT*.09)*.8,a.z+Math.sin(ang)*r);
  camera.lookAt(a.x,a.y+1.2,a.z);
}
