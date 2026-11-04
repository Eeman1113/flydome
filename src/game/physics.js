import { triggerCrash } from './crash.js';
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
import { sfx } from './sfx.js';

export function crashAircraft(title,text,msg){
  // Fire/debris/crumple and a short crash-cam orbit before the menu appears.
  const water=/ditch/i.test(title);
  state.crashed=true;onCrash();triggerCrash(water?'water':'impact');sfx.crash(water,aircraft.position.clone());radioEvent('crash',{water});
  clearTimeout(crashAircraft.t);crashAircraft.t=setTimeout(()=>{if(!state.crashed)return;state.paused=true;$('pauseMenu').style.display='grid';setHud();},3400);
  $('pauseMenu').querySelector('h2').textContent=title;$('pauseMenu').querySelector('.kicker').textContent='AIRCRAFT LOST';$('resumeBtn').style.display='none';$('restartBtn').classList.add('primary');
  $('pauseMenu').querySelector('.intro').textContent=mission.charter&&!mission.complete?`${text.replace(' Restart the flight to try again.','')} Your discoveries are saved; this charter's landing bonus is lost. Restart to continue the charter.`:text;
  toast(msg);setHud();
}
export function stepPhysics(dt,ctrl){
  if(state.crashed)return;
  const a=aircraft;
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
  simAirVelocity.copy(a.velocity).sub(state.wind);
  const airspeed=Math.max(.05,simAirVelocity.length());
  const authority=clamp(.28+airspeed/34,.28,1.12)*(wasOnGround?0.62:1);
  const preSlipAngle=Math.atan2(simAirVelocity.dot(simRight),Math.max(airspeed,.1));

  const pitchRateTarget=a.controlPitch*(31*DEG)*authority;
  const bankLimit=65*DEG;
  const rollRateTarget=a.controlRoll*(62*DEG)*authority-(wasOnGround?0:Math.sin(a.roll)*state.rollStability*.34);
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
  a.pitch=clamp(a.pitch+a.pitchRate*dt,-.38,wasOnGround?11*DEG:.40);if(wasOnGround&&a.pitch>=11*DEG&&a.pitchRate>0)a.pitchRate=0;
  // Airborne the aircraft can roll freely through 360° (barrel/aileron rolls); on the ground bank stays limited.
  a.roll=wasOnGround?clamp(a.roll+a.rollRate*dt,-bankLimit,bankLimit):wrapAngle(a.roll+a.rollRate*dt);
  a.yaw=wrapAngle(a.yaw+a.yawRate*dt);

  simEuler.set(a.pitch,a.yaw,-a.roll,'YXZ');
  simQuaternion.setFromEuler(simEuler);
  simForward.set(0,0,-1).applyQuaternion(simQuaternion);
  simUp.set(0,1,0).applyQuaternion(simQuaternion);
  simRight.set(1,0,0).applyQuaternion(simQuaternion);

  simAirVelocity.copy(a.velocity).sub(state.wind);
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
  const stallBlend=wasOnGround?0:Math.max(stallAlphaBlend,lowSpeedStall);
  const cl=lerp(clLinear,.62,stallBlend);
  const heightAGL=Math.max(0,a.position.y-groundBefore);
  const groundEffect=1+(1-smooth(1,14,heightAGL))*.12;
  const lift=qbar*WING_AREA_M2*cl*groundEffect;
  a.stall=!wasOnGround&&stallBlend>.24;
  const cd=.024+.075*cl*cl+stallBlend*.42;
  const drag=qbar*WING_AREA_M2*cd;
  const lateralSpeed=simAirVelocity.dot(simRight);
  const sideDrag=.5*rho*airspeedNow*Math.abs(lateralSpeed)*WING_AREA_M2*.72;

  const spoolTau=state.throttle>a.enginePower?1.15:.72;
  a.enginePower+=(state.throttle-a.enginePower)*(1-Math.exp(-dt/spoolTau));
  // Thrust lapses gently with density (normally aspirated engine).
  // Propeller thrust falls with airspeed (fixed power), so the aircraft accelerates briskly,
  // climbs ~1,100 fpm at 80 kt and cruises ~140 kt at 75% like the real C182.
  const propLapse=clamp(1-.0048*airspeedNow,.35,1);
  const thrust=a.engineRunning?a.enginePower*MAX_ENGINE_THRUST_N*propLapse*(AIRCRAFT[aircraftState.variant].thrust||1)*(AIRCRAFT_MASS_KG/(AIRCRAFT_MASS_KG+(mission.cargoKg||0)*.9))*Math.pow(rho/1.225,.7):0;
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
    const rollingV=forwardV*Math.exp(-(paved?.028:onWater&&floats?.12:.16)*dt);
    const lateralAfter=lateralV*Math.exp(-1.35*dt);
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

  simAirVelocity.copy(a.velocity).sub(state.wind);
  a.airspeed=simAirVelocity.length();
  a.verticalSpeed=a.velocity.y;
  a.altAGL=Math.max(0,a.position.y-ground);
  a.gLoad=wasOnGround?1:lift/(AIRCRAFT_MASS_KG*9.81);
  a.slipAngle=Math.atan2(lateralSpeed,Math.max(airspeedNow,.1))/DEG;
  if(a.position.y<=ground+contactOffset+.35)a.stall=false;
  if(plane.userData.prop){plane.userData.prop.rotation[plane.userData.propAxis||'y']+=dt*(18+a.enginePower*205);const blur=a.enginePower>.58;if(plane.userData.propFast)plane.userData.propFast.visible=blur;if(plane.userData.propSlow)plane.userData.propSlow.visible=!blur;}
  syncPlaneTransform();
}
