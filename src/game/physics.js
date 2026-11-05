import { triggerCrash } from './crash.js';
import { progress, saveProgress } from './progress.js';
import { haptic } from './haptics.js';
import { onCrash, mission } from './survey.js';
import { AIRCRAFT, aircraftState } from './config.js';
// SKYBOUND · physics
import { $, DEG, clamp, lerp, smooth, wrapAngle } from './util.js';
import { AIRCRAFT_MASS_KG, MAX_ENGINE_THRUST_N, SEA_LEVEL, WING_AREA_M2, aircraft, fx, simAirVelocity, simDirection, simEuler, simForce, simForward, simGravity, simLiftDirection, simQuaternion, simRight, simUp, state } from './config.js';
import { terrain } from './world.js';
import { groundLevelAt, isWaterAt, onRunway } from './chunks.js';
import { aircraftGroundOffset, plane, syncPlaneTransform } from './engine.js';
import { setHud, toast } from './ui.js';
import { radioEvent } from './radio.js';
import * as THREE from 'three';
const simWind=new THREE.Vector3();
import { sfx } from './sfx.js';

export function crashAircraft(title,text,msg){
  // Fire/debris/crumple and a short crash-cam orbit before the menu appears.
  const water=/ditch/i.test(title);
  state.crashed=true;onCrash();triggerCrash(water?'water':'impact');sfx.crash(water,aircraft.position.clone());haptic.crash();progress.pilot.crashes=(progress.pilot.crashes||0)+1;saveProgress();radioEvent('crash',{water});
  clearTimeout(crashAircraft.t);crashAircraft.t=setTimeout(()=>{if(!state.crashed)return;state.paused=true;$('pauseMenu').style.display='grid';setHud();},3400);
  $('pauseMenu').querySelector('h2').textContent=title;$('pauseMenu').querySelector('.kicker').textContent='AIRCRAFT LOST';$('resumeBtn').style.display='none';$('restartBtn').classList.add('primary');
  $('pauseMenu').querySelector('.intro').textContent=mission.charter&&!mission.complete?`${text.replace(' Restart the flight to try again.','')} Your discoveries are saved; this charter's landing bonus is lost. Restart to continue the charter.`:text;
  toast(msg);setHud();
}
export function stepPhysics(dt,ctrl){
  if(state.crashed)return;
  const a=aircraft,V=AIRCRAFT[aircraftState.variant],jet=!!V.jet;
  // Forgiving flight (stall simulation off, the default) feels half the wind.
  const forgiving=!state.stallSim;simWind.copy(state.wind).multiplyScalar(forgiving?.5:1);
  const groundBefore=groundLevelAt(a.position.x,a.position.z);
  const contactOffset=aircraftGroundOffset;
  const wasOnGround=a.position.y<=groundBefore+contactOffset+.35;

  const inputTau=.105/Math.max(.45,state.controlResponse);
  const inputBlend=1-Math.exp(-dt/inputTau);
  a.controlPitch=lerp(a.controlPitch,ctrl.pitch,inputBlend);
  a.controlRoll=lerp(a.controlRoll,ctrl.roll,inputBlend);
  a.controlYaw=lerp(a.controlYaw,ctrl.yaw,inputBlend);

  simEuler.set(a.pitch,a.yaw,-a.roll,'YXZ');
  simQuaternion.setFromEuler(simEuler);
  simForward.set(0,0,-1).applyQuaternion(simQuaternion);
  simUp.set(0,1,0).applyQuaternion(simQuaternion);
  simRight.set(1,0,0).applyQuaternion(simQuaternion);
  simAirVelocity.copy(a.velocity).sub(simWind);
  const airspeed=Math.max(.05,simAirVelocity.length());
  const authority=clamp(.28+airspeed/34,.28,1.12)*(wasOnGround?0.62:1);
  const preSlipAngle=Math.atan2(simAirVelocity.dot(simRight),Math.max(airspeed,.1));

  const pitchRateTarget=a.controlPitch*((V.pitchRate||31)*DEG)*authority;
  const bankLimit=65*DEG;
  const rollRateTarget=a.controlRoll*((V.rollRate||62)*DEG)*authority-(wasOnGround?0:Math.sin(a.roll)*state.rollStability*.34);
  // Coordinated turn yaw from bank; fades out past knife-edge so rolls and inverted flight stay clean.
  const coordinatedYawRate=(!wasOnGround&&airspeed>7)?-9.81*Math.tan(clamp(a.roll,-bankLimit,bankLimit))*Math.max(Math.cos(a.roll),0)/Math.max(airspeed,12):0;
  const rudderAuthority=wasOnGround?clamp(airspeed/10,0,1):clamp(airspeed/24,.25,1.15);
  const slipDamper=wasOnGround?0:clamp(-preSlipAngle*.9,-.18,.18);
  const yawRateTarget=wasOnGround?a.controlYaw*.16*rudderAuthority:coordinatedYawRate+a.controlYaw*(22*DEG)*rudderAuthority+slipDamper;
  const pitchResponse=1-Math.exp(-dt*6.2*Math.max(.65,state.controlResponse));
  const rollResponse=1-Math.exp(-dt*7.2*Math.max(.65,state.controlResponse));
  const yawResponse=1-Math.exp(-dt*4.8);
  a.pitchRate=lerp(a.pitchRate,pitchRateTarget,pitchResponse);
  a.rollRate=lerp(a.rollRate,rollRateTarget,rollResponse);
  a.yawRate=lerp(a.yawRate,yawRateTarget,yawResponse);
  const pMax=jet?80*DEG:.40;a.pitch=clamp(a.pitch+a.pitchRate*dt,-(jet?80*DEG:.38),wasOnGround?11*DEG:pMax);if(wasOnGround&&a.pitch>=11*DEG&&a.pitchRate>0)a.pitchRate=0;
  // Airborne the aircraft can roll freely through 360° (barrel/aileron rolls); on the ground bank stays limited.
  a.roll=wasOnGround?clamp(a.roll+a.rollRate*dt,-bankLimit,bankLimit):wrapAngle(a.roll+a.rollRate*dt);
  a.yaw=wrapAngle(a.yaw+a.yawRate*dt);

  simEuler.set(a.pitch,a.yaw,-a.roll,'YXZ');
  simQuaternion.setFromEuler(simEuler);
  simForward.set(0,0,-1).applyQuaternion(simQuaternion);
  simUp.set(0,1,0).applyQuaternion(simQuaternion);
  simRight.set(1,0,0).applyQuaternion(simQuaternion);

  simAirVelocity.copy(a.velocity).sub(simWind);
  const airspeedNow=Math.max(.05,simAirVelocity.length());
  simDirection.copy(simAirVelocity).normalize();
  const alpha=-Math.asin(clamp(simDirection.dot(simUp),-1,1));
  a.alpha=alpha;
  // ISA-like density falloff with altitude above mean sea level.
  const altitude=Math.max(0,a.position.y-SEA_LEVEL);
  const rho=1.225*Math.exp(-altitude/8500);
  const qbar=.5*rho*airspeedNow*airspeedNow;
  const clLinear=clamp(.22+5.25*alpha,-.55,1.52);
  const stallAlphaBlend=smooth(14*DEG,22*DEG,alpha);
  const vs=Math.sqrt((2*AIRCRAFT_MASS_KG*9.81)/(rho*WING_AREA_M2*1.62));
  const lowSpeedStall=wasOnGround?0:1-smooth(vs*.82,vs*1.06,airspeedNow);
  // Stall simulation is optional (off by default): without it the wing never stalls, it just mushes and sinks.
  const stallBlend=wasOnGround||!state.stallSim?0:Math.max(stallAlphaBlend,lowSpeedStall);
  const cl=lerp(clLinear,.62,stallBlend);
  const heightAGL=Math.max(0,a.position.y-groundBefore);
  const groundEffect=1+(1-smooth(1,14,heightAGL))*.12;
  const lift=qbar*WING_AREA_M2*cl*groundEffect;
  a.stall=!wasOnGround&&stallBlend>.24;
  // Jets: a cleaner airframe, plus a transonic drag rise so the afterburner just breaks Mach 1 low down.
  const mach=airspeedNow/340;a.mach=mach;
  const cd=(.024+.075*cl*cl)*(V.cdMul||1)+stallBlend*.42+(jet?.003*smooth(.92,1.08,mach)+.0015*Math.max(0,mach-1.08):0);
  const drag=qbar*WING_AREA_M2*cd;
  const lateralSpeed=simAirVelocity.dot(simRight);
  const sideDrag=.5*rho*airspeedNow*Math.abs(lateralSpeed)*WING_AREA_M2*.72;

  const spoolTau=jet?(state.throttle>a.enginePower?2.1:1.4):state.throttle>a.enginePower?1.15:.72;
  a.enginePower+=(state.throttle-a.enginePower)*(1-Math.exp(-dt/spoolTau));
  // Thrust lapses gently with density (normally aspirated engine).
  // Propeller thrust falls with airspeed (fixed power), so the aircraft accelerates briskly,
  // climbs ~1,100 fpm at 80 kt and cruises ~140 kt at 75% like the real C182.
  const propLapse=jet?1:clamp(1-.0048*airspeedNow,.35,1);
  // Afterburner: throttle past 92% lights the reheat for a big kick in thrust.
  a.afterburner=jet&&a.engineRunning&&state.throttle>.92&&a.enginePower>.86;a.abLevel=(a.abLevel||0)+((a.afterburner?1:0)-(a.abLevel||0))*(1-Math.exp(-dt*(a.afterburner?6:3)));
  const thrust=a.engineRunning?(a.enginePower+(jet?a.abLevel*(V.ab||0):0))*MAX_ENGINE_THRUST_N*propLapse*(V.thrust||1)*(AIRCRAFT_MASS_KG/(AIRCRAFT_MASS_KG+(mission.cargoKg||0)*.9))*Math.pow(rho/1.225,.7):0;
  simLiftDirection.copy(simUp).addScaledVector(simDirection,-simUp.dot(simDirection));
  if(simLiftDirection.lengthSq()<1e-6)simLiftDirection.copy(simUp);
  simLiftDirection.normalize();
  simForce.copy(simForward).multiplyScalar(thrust)
    .addScaledVector(simLiftDirection,lift)
    .addScaledVector(simDirection,-drag)
    .addScaledVector(simRight,-Math.sign(lateralSpeed)*sideDrag)
    .add(simGravity);

  a.velocity.addScaledVector(simForce,dt/AIRCRAFT_MASS_KG);
  a.velocity.multiplyScalar(Math.exp(-.002*dt));
  // Forgiving flight: the aircraft never sinks unless the nose is pointed down. Below about 45 kt
  // the engine holds the speed up, and near the ground the help fades so landings still settle.
  if(forgiving&&!wasOnGround&&a.engineRunning){
    const help=smooth(3,22,heightAGL)*clamp(Math.cos(a.roll)*1.4,0,1);
    if(help>0){
      const hs=Math.hypot(a.velocity.x,a.velocity.z),target=Math.min(0,hs*Math.tan(a.pitch)*.9);
      if(a.velocity.y<target)a.velocity.y+=(target-a.velocity.y)*(1-Math.exp(-dt*30))*help;
      if(airspeedNow<23){const k=(23-airspeedNow)*dt*.9*help;a.velocity.addScaledVector(simForward,k);}
    }
  }
  a.position.addScaledVector(a.velocity,dt);
  if(a.stall&&!wasOnGround){
    a.velocity.y-=clamp(2.4+stallBlend*4.0,2.4,6.4)*dt;
    a.pitchRate-=.10*stallBlend*dt;
  }

  const ground=groundLevelAt(a.position.x,a.position.z);
  const contactY=ground+contactOffset;
  if(a.position.y<contactY){
    const impact=Math.abs(a.velocity.y);
    a.position.y=contactY;
    if(a.velocity.y<0)a.velocity.y=0;
    const fx=-Math.sin(a.yaw),fz=-Math.cos(a.yaw);
    const rx=Math.cos(a.yaw),rz=-Math.sin(a.yaw);
    const forwardV=a.velocity.x*fx+a.velocity.z*fz;
    const lateralV=a.velocity.x*rx+a.velocity.z*rz;
    const paved=onRunway(a.position.x,a.position.z),floats=AIRCRAFT[aircraftState.variant].floats,onWater=isWaterAt(a.position.x,a.position.z);
    // Floats plane water hard but hold more drag than tarmac; grass strips sit in between.
    const rollingV=forwardV*Math.exp(-(paved?.028:onWater&&floats?.12:.05)*dt); // grass rolls slower than tarmac but still allows takeoff
    // Tyres grip sideways (no sliding across the runway in a crosswind); floats slip more.
    const lateralAfter=lateralV*Math.exp(-(onWater&&floats?3:14)*dt);
    a.velocity.x=fx*rollingV+rx*lateralAfter;
    a.velocity.z=fz*rollingV+rz*lateralAfter;
    a.pitchRate*=Math.exp(-dt*1.1);
    a.rollRate*=Math.exp(-dt*2.4);
    if(onWater&&!floats&&a.airspeed>3){
      crashAircraft('Ditched in the water','The aircraft touched down on open water. Restart the flight to try again.','Ditched — the aircraft is in the water.');
    }else if(impact>13||Math.abs(a.roll)>.82){
      crashAircraft('Aircraft damaged','The landing impact exceeded the safe envelope. Restart the flight to try again.','Hard landing — aircraft damaged.');
    }else if(!paved&&!(onWater&&floats)&&Math.abs(forwardV)>42){
      crashAircraft('Terrain impact','The aircraft struck terrain at high speed. Restart the flight to try again.','Terrain impact.');
    }
  }

  simAirVelocity.copy(a.velocity).sub(simWind);
  a.airspeed=simAirVelocity.length();
  a.verticalSpeed=a.velocity.y;
  a.altAGL=Math.max(0,a.position.y-ground);
  a.gLoad=wasOnGround?1:lift/(AIRCRAFT_MASS_KG*9.81);
  a.slipAngle=Math.atan2(lateralSpeed,Math.max(airspeedNow,.1))/DEG;
  if(a.position.y<=ground+contactOffset+.35)a.stall=false;
  if(plane.userData.prop){plane.userData.prop.rotation[plane.userData.propAxis||'y']+=dt*(18+a.enginePower*205);const blur=a.enginePower>.58;if(plane.userData.propFast)plane.userData.propFast.visible=blur;if(plane.userData.propSlow)plane.userData.propSlow.visible=!blur;}
  syncPlaneTransform();
}
