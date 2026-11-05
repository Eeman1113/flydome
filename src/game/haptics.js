// SKYBOUND · haptics: DualSense / gamepad rumble through the Gamepad API (Chrome/Edge).
// One-shots for touchdowns, gear, afterburner light-up, sonic boom and crashes; a low continuous
// texture for grass strips, afterburner roar and the stall buffet. Toggle in Settings.
import { aircraft, state, AIRCRAFT, aircraftState } from './config.js';
import { clamp } from './util.js';

const KEY='skybound.rumble';
export const haptics={on:(()=>{try{return localStorage.getItem(KEY)!=='0';}catch{return true;}})()};
export function setRumble(on){haptics.on=on;try{localStorage.setItem(KEY,on?'1':'0');}catch{}}

function pads(){try{return Array.from(navigator.getGamepads?.()||[]).filter(p=>p&&p.connected&&p.vibrationActuator);}catch{return [];}}
let busyUntil=0;
// strong = low-frequency motor, weak = high-frequency motor (0..1)
export function rumble(strong,weak,ms,force=false){
  if(!haptics.on||!state.started)return;
  const now=performance.now();if(!force&&now<busyUntil)return;busyUntil=now+ms*.85;
  for(const p of pads()){try{p.vibrationActuator.playEffect('dual-rumble',{startDelay:0,duration:ms,strongMagnitude:clamp(strong,0,1),weakMagnitude:clamp(weak,0,1)});}catch{}}
}
export const haptic={
  touchdown(sink,surface){const k=clamp(sink/3,.15,1);rumble(.35+.6*k,surface==='water'?.6:.25+.3*k,surface==='water'?320:180+120*k,true);},
  gear(){rumble(.25,.1,120,true);},
  afterburner(){rumble(.9,.5,420,true);},
  boom(){rumble(1,1,600,true);},
  crash(){rumble(1,1,900,true);},
  cheat(){rumble(.4,.8,250,true);},
};
// Continuous textures, re-triggered in short pulses each frame window.
let pulseT=0,abWas=false;
export function updateHaptics(dt,{onGround,surface}={}){
  if(!haptics.on||!state.started||state.paused||state.crashed)return;
  pulseT-=dt;if(pulseT>0)return;pulseT=.12;
  const a=aircraft,gs=Math.hypot(a.velocity.x,a.velocity.z),kt=a.airspeed*1.94384;
  const ab=AIRCRAFT[aircraftState.variant]?.jet?(a.abLevel||0):0;
  if(ab>.3&&!abWas)haptic.afterburner();abWas=ab>.3;
  let s=0,w=0;
  if(onGround&&gs>2){const k=clamp(gs/35,0,1);if(surface==='strip'||surface==='field'){s+=.18*k;w+=.22*k;}else if(surface==='water'){w+=.2*k;}else{w+=.06*k;}}
  if(ab>0){s+=.22*ab;w+=.12*ab;}
  if(!onGround&&state.stallSim&&a.stall){s+=.35;w+=.25;}
  const trans=Math.max(0,1-Math.abs((a.mach||0)-1)/.06);if(trans>0){s+=.3*trans;w+=.4*trans;}
  if(!onGround&&kt>300){w+=.05*clamp((kt-300)/300,0,1);}
  if(s+w>.02)rumble(s,w,140);
}
