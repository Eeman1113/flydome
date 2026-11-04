// SKYBOUND · cheats. Type "fly" anywhere (menu or in flight) to swap into the F-16 and back.
import { AIRCRAFT, aircraft, aircraftState, state } from './config.js';
import { $ } from './util.js';
import { makeAircraft, swapAircraft, aircraftGroundOffset } from './engine.js';
import { groundLevelAt } from './chunks.js';
import { sfx } from './sfx.js';
import { radioEvent } from './radio.js';

const CHEATS={fly:toggleJet};
let typed='',before='skylane',busy=false;
window.addEventListener('keydown',e=>{
  if(e.target?.closest?.('input,textarea,select'))return;
  if(e.key.length!==1)return;
  typed=(typed+e.key.toLowerCase()).slice(-12);
  for(const [code,fn] of Object.entries(CHEATS))if(typed.endsWith(code)){typed='';fn();}
});
function banner(text,sub){
  const el=$('cheatBanner');if(!el)return;
  el.innerHTML=`<b>${text}</b>${sub?`<span>${sub}</span>`:''}`;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');
  clearTimeout(banner.t);banner.t=setTimeout(()=>el.classList.remove('show'),3200);
}
async function toggleJet(){
  if(busy)return;busy=true;
  const toJet=!AIRCRAFT[aircraftState.variant]?.jet;
  if(toJet)before=aircraftState.variant;
  const id=toJet?'f16':before||'skylane';
  banner('CHEAT ACTIVATED',toJet?'F-16 FIGHTING FALCON':AIRCRAFT[id].name.toUpperCase());
  sfx.cheat?.();
  try{
    const onGround=!state.started||aircraft.altAGL<aircraftGroundOffset+.5;
    if(onGround)await swapAircraft(id);
    else await makeAircraft(id); // mid-air: keep position, speed and attitude
    if(onGround)aircraft.position.y=groundLevelAt(aircraft.position.x,aircraft.position.z)+aircraftGroundOffset;
    if(state.started)radioEvent(toJet?'jet':'jetOff');
  }finally{busy=false;}
}
