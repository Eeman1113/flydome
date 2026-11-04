// SKYBOUND · config
import * as THREE from 'three';
import { camera, frame } from './engine.js';

// Prefix for files in public/ (empty locally, '/flydome' on GitHub Pages).
export const BASE_PATH=process.env.NEXT_PUBLIC_BASE_PATH||'';
export const urlParams=new URLSearchParams(typeof location!=='undefined'?location.search:'');
// World selection. A plain refresh always rolls a brand-new world; a shared ?seed link,
// back/forward navigation or "Resume last world" reopens that exact world. ?daily uses the
// day's shared seed (UTC). The URL always carries the active seed so it can be shared.
export const DAILY_EPOCH=Date.UTC(2026,10,1);
export const DAILY_NUMBER=Math.floor((Date.now()-DAILY_EPOCH)/86400000)+1;
export const IS_DAILY=urlParams.has('daily');
export const WORLD_SEED=(()=>{
  if(IS_DAILY){let h=2166136261;for(const c of `skybound-daily-${DAILY_NUMBER}`){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return 1+((h>>>0)%999999);}
  let reload=false;try{reload=performance.getEntriesByType('navigation')[0]?.type==='reload';}catch{}
  const s=parseInt(urlParams.get('seed')||'',10);
  return !reload&&Number.isFinite(s)&&s>0?s:(1+Math.floor(Math.random()*999999));
})();
if(typeof window!=='undefined'&&!IS_DAILY){
  try{const u=new URL(location.href);if(u.searchParams.get('seed')!==String(WORLD_SEED)){u.searchParams.set('seed',String(WORLD_SEED));history.replaceState(history.state,'',u);}}catch{}
}
export const SKIES=[
  {id:'kloofendal_48d_partly_cloudy_puresky',name:'Partly cloudy · midday',clouds:.55,haze:1},
  {id:'qwantani_noon_puresky',name:'Clear · noon',clouds:.22,haze:.8},
  {id:'qwantani_late_afternoon_puresky',name:'Late afternoon',clouds:.35,haze:1.1},
  {id:'belfast_sunset_puresky',name:'Golden sunset',clouds:.4,haze:1.35},
  {id:'qwantani_dawn_puresky',name:'Dawn',clouds:.3,haze:1.5},
  {id:'kloofendal_overcast_puresky',name:'Overcast',clouds:1.05,haze:1.7,overcast:true,rain:.65},
  {id:'qwantani_dusk_2_puresky',name:'Dusk',clouds:.3,haze:1.4}
];
export const SKY=(()=>{const q=urlParams.get('sky');const byName=SKIES.find(s=>s.id.startsWith(q||'#'));if(byName)return byName;const n=parseInt(q||'',10);if(Number.isFinite(n)&&SKIES[n])return SKIES[n];return SKIES[WORLD_SEED%SKIES.length];})();

export const state={started:false,paused:false,hud:true,camera:2,gear:true,throttle:0,worldSeed:WORLD_SEED,quality:'Auto',gyroEnabled:true,gyroPitch:false,gyroSensitivity:1.0,gyroDeadzone:2.5,stickSensitivity:1.0,deadzone:.08,controlResponse:1.0,inputExpo:.38,rollStability:.22,gamepad:null,gamepadName:'',gyroDevice:null,gyroRaw:{x:0,y:0,z:0},gyroBias:{x:0,y:0,z:0},gyroCalibrating:false,gyroCalibrationStart:0,gyroSamples:[],gyroCalibrated:false,keys:{},mouseDown:false,mouseX:0,mouseY:0,mouseDx:0,mouseDy:0,mouseFlightActive:false,mouseFlightX:0,mouseFlightY:0,mouseFlightDx:0,mouseFlightDy:0,mouseButton:-1,dpadUpLatch:false,dpadDownLatch:false,dpadLeftLatch:false,dpadRightLatch:false,triangleLatch:false,orbitYaw:0,orbitPitch:.2,flightTime:0,crashed:false,lastFrame:0,fps:60,fpsAccum:0,fpsCount:0,showDiag:false,audioEnabled:true,audioVolume:.68,effectVolume:.62,tutorial:{active:false,index:0,mode:'keyboardMouse',inputMode:'keyboardMouse',readySince:0,lastStep:-1,lastMode:'',lastUiUpdate:0,startedAt:0},wind:new THREE.Vector3(2.2,0,-1.1)};
export const aircraft={position:new THREE.Vector3(0,10,0),velocity:new THREE.Vector3(0,0,0),pitch:0,roll:0,yaw:0,pitchRate:0,rollRate:0,yawRate:0,controlPitch:0,controlRoll:0,controlYaw:0,airspeed:0,verticalSpeed:0,altAGL:1.8,alpha:0,stall:false,engineRunning:true,enginePower:0,gLoad:1,slipAngle:0,damage:0};
export const CHUNK=1000, SEA_LEVEL=0;
export const RUNWAY_HALF_W=22, RUNWAY_HALF_L=650, START_Z=590;
export const AIRCRAFT_VISUAL_SCALE=1.08;
export const FIXED_STEP=1/60;
// Tuned light-aircraft parameters. Keep rolling resistance time-based (per second),
// never as a fixed multiplier per rendered/physics frame.
export const AIRCRAFT_MASS_KG=1250, WING_AREA_M2=16.2, MAX_ENGINE_THRUST_N=3850, TAKEOFF_ROTATE_KTS=58;
export const simEuler=new THREE.Euler(0,0,0,'YXZ'),simQuaternion=new THREE.Quaternion();
export const simForward=new THREE.Vector3(),simUp=new THREE.Vector3(),simRight=new THREE.Vector3(),simLiftDirection=new THREE.Vector3(),simAirVelocity=new THREE.Vector3(),simDirection=new THREE.Vector3(),simForce=new THREE.Vector3(),simGravity=new THREE.Vector3(0,-AIRCRAFT_MASS_KG*9.81,0);
export const camForward=new THREE.Vector3(),camUp=new THREE.Vector3(),camRight=new THREE.Vector3();
export const cockpitEyeLocal=new THREE.Vector3(-.24,.53,-.34);
export const glass=new THREE.MeshPhysicalMaterial({color:0x9fc6d4,metalness:.1,roughness:.06,transparent:true,opacity:.55,clearcoat:1});
export const sky={sunDir:new THREE.Vector3(.4,.6,-.5).normalize(),sunColor:new THREE.Color(1,.95,.85),sunIntensity:3,horizon:new THREE.Color(.6,.7,.8),zenith:new THREE.Color(.3,.45,.7),exposure:1,texture:null,env:null,name:SKY.name};
export const fx={time:0,visibility:30000};
export const shared={time:{value:0}};

// Airframes and paint schemes (unlocked by rank / stamps; see menu.js).
export const AIRCRAFT={
  skylane:{id:'skylane',name:'Cessna 182 Skylane',short:'Skylane',file:'cessna_182_skylane.glb',scale:1.08,yaw:0,floats:false,rank:0},
  floats:{id:'floats',name:'Cessna 208 Caravan Amphibian',short:'Caravan Amphib',file:'cessna_208_amphibian.glb',scale:1,yaw:-Math.PI/2,floats:true,rank:2,thrust:1.3,
    objFrame:'caravan',eye:[-3.0,-.38,1.12],propCut:-5.84,propZMin:-1.3,
    credit:'“CaravanA” (Cessna 208 Caravan Amphibian) by helijah, CC BY 4.0'}
};
export const LIVERIES=[
  {id:'factory',name:'Factory',tint:0xffffff,rank:0},
  {id:'glacier',name:'Glacier',tint:0xcfe6ff,rank:1},
  {id:'sage',name:'Sage',tint:0xc9dcc0,rank:1},
  {id:'ember',name:'Ember',tint:0xffd2b0,rank:2},
  {id:'dusk',name:'Dusk',tint:0x9aa4c4,rank:3},
  {id:'gold',name:'Cartographer Gold',tint:0xffe2a0,rank:5}
];
export const aircraftState={variant:'skylane',livery:'factory'};

// Per-world weather, derived from the seed: wind from a direction (degrees, 0 = north),
// steady speed and gust strength in knots, rain on some overcast days, and low cloud.
export const WEATHER=(()=>{
  let a=(WORLD_SEED*2654435761)>>>0;const r=()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
  const calm=r()<.22,dir=Math.round(r()*36)*10||360;
  const kt=calm?2+r()*4:6+r()*(SKY.overcast?16:12),gust=calm?0:r()<.55?kt*(.3+r()*.5):0;
  const rain=!!SKY.rain&&r()<SKY.rain;
  return {dir,kt,gust,rain,lowCloud:!!SKY.overcast};
})();
export const WIND_BASE=new THREE.Vector3(-Math.sin(WEATHER.dir*Math.PI/180),0,Math.cos(WEATHER.dir*Math.PI/180)).multiplyScalar(WEATHER.kt/1.94384);
state.wind.copy(WIND_BASE);
