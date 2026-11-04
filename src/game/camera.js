// SKYBOUND · camera
import * as THREE from 'three';
import { clamp, lerp, smooth } from './util.js';
import { aircraft, camForward, camRight, camUp, cockpitEyeLocal, state, AIRCRAFT, aircraftState } from './config.js';
import { groundLevelAt } from './chunks.js';
import { aircraftGroundOffset, camera, plane, worldTime } from './engine.js';

export const camTarget=new THREE.Vector3(),camPos=new THREE.Vector3(),camShake=new THREE.Vector3();let lastCameraMode=0,camFov=66;
export function updateCamera(dt,ctrl){
  if(state.crashed){ // slow orbit around the wreck
    const a=aircraft.position;state.orbitYaw+=dt*.32;const r=30,h=9;camera.up.set(0,1,0);
    camPos.set(a.x+Math.sin(state.orbitYaw)*r,a.y+h,a.z+Math.cos(state.orbitYaw)*r);const gmin=groundLevelAt(camPos.x,camPos.z)+2;if(camPos.y<gmin)camPos.y=gmin;
    camera.position.lerp(camPos,1-Math.exp(-dt*2.5));camera.lookAt(a.x,a.y+1,a.z);return;
  }const a=aircraft,q=plane.quaternion;camForward.set(0,0,-1).applyQuaternion(q);camUp.set(0,1,0).applyQuaternion(q);camRight.set(1,0,0).applyQuaternion(q);
  const speedK=smooth(20,75,a.airspeed);
  // sense of speed: the view widens hard at jet speeds
  const fast=smooth(90,330,a.airspeed);
  const targetFov=(state.camera===1?72:state.camera===2?62:state.camera===3?60:70)+speedK*5+fast*16;
  camFov=lerp(camFov,targetFov,1-Math.exp(-dt*2));
  if(lastCameraMode!==state.camera||Math.abs(camera.fov-camFov)>.01){camera.fov=camFov;camera.updateProjectionMatrix();lastCameraMode=state.camera;}
  const onGround=a.altAGL<aircraftGroundOffset+.4;
  // Gentle runway rumble only (low frequency, a few millimetres); none in flight so the
  // cockpit stays steady at any airspeed and frame rate.
  // high-speed buffet (jet only: never felt below ~290 kt), stronger through the transonic band
  const trans=Math.max(0,1-Math.abs((a.mach||0)-1)/.08);
  const shakeAmt=onGround?smooth(3,30,a.airspeed)*(state.camera===1?.006:.012):(smooth(150,330,a.airspeed)*.035+trans*.05+(a.abLevel||0)*.012)*(state.camera===1?.6:1);
  const t=worldTime;camShake.set(Math.sin(t*11.3)*Math.sin(t*2.1)+Math.sin(t*37.1)*.4,Math.sin(t*13.7+1.3)*Math.sin(t*1.7)+Math.sin(t*41.3)*.4,0).multiplyScalar(shakeAmt);
  // afterburner kick: the chase camera falls back as the jet surges ahead
  const acc=(a.airspeed-(lastSpd??a.airspeed))/Math.max(dt,1e-3);lastSpd=a.airspeed;pull=lerp(pull,clamp(acc/12,0,1)+fast*.35,1-Math.exp(-dt*1.5));
  if(state.camera===1){
    camPos.copy(cockpitEyeLocal).applyQuaternion(q).add(a.position).addScaledVector(camUp,camShake.y).addScaledVector(camRight,camShake.x);
    camTarget.copy(camPos).addScaledVector(camForward,100).addScaledVector(camUp,-7.0);
    camera.position.copy(camPos);camera.up.copy(camUp);camera.lookAt(camTarget);
  }
  else if(state.camera===2){
    camera.up.set(0,1,0);
    const flatF=new THREE.Vector3(camForward.x,0,camForward.z).normalize();
    const cs=AIRCRAFT[aircraftState.variant]?.camScale||1;
    camPos.copy(a.position).addScaledVector(camForward,-17*cs*(1+pull*.45)).addScaledVector(flatF,-3*cs).addScaledVector(camUp,4.6*cs*Math.max(camUp.y,0)).add(new THREE.Vector3(0,1.2+4.6*cs*(1-Math.max(camUp.y,0)),0));
    const gmin=groundLevelAt(camPos.x,camPos.z)+2;if(camPos.y<gmin)camPos.y=gmin;
    camTarget.copy(a.position).addScaledVector(camForward,18).add(new THREE.Vector3(0,1.2,0));
    // smooth the offset from the aircraft, not the absolute position, so the camera keeps up at jet speeds
    chaseOff.lerp(camPos.sub(a.position),1-Math.exp(-dt*7.5));camera.position.copy(a.position).add(chaseOff).add(camShake);camera.lookAt(camTarget);
  }
  else{camera.up.set(0,1,0);state.orbitYaw-=ctrl.camX*dt*1.8;state.orbitPitch=clamp(state.orbitPitch-ctrl.camY*dt*1.4,-.2,1.1);if(state.mouseDown){state.orbitYaw-=state.mouseDx*.004;state.orbitPitch=clamp(state.orbitPitch-state.mouseDy*.004,-.2,1.1);state.mouseDx=state.mouseDy=0;}const radius=(state.camera===3?32:70)*(AIRCRAFT[aircraftState.variant]?.camScale||1),ox=Math.sin(state.orbitYaw)*Math.cos(state.orbitPitch)*radius,oy=Math.sin(state.orbitPitch)*radius+5,oz=Math.cos(state.orbitYaw)*Math.cos(state.orbitPitch)*radius;camPos.set(a.position.x+ox,a.position.y+oy,a.position.z+oz);const gmin=groundLevelAt(camPos.x,camPos.z)+1.5;if(camPos.y<gmin)camPos.y=gmin;orbitOff.lerp(camPos.sub(a.position),1-Math.exp(-dt*3));camera.position.copy(a.position).add(orbitOff);camera.lookAt(a.position);}
}
let lastSpd=null,pull=0;
const chaseOff=new THREE.Vector3(0,5,18),orbitOff=new THREE.Vector3(20,8,20);
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
