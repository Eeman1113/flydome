// SKYBOUND · traffic: AI aircraft flown by the trained pilot network (aipilot.js) on the same flight model
// as the player (flightModel.js). Each plane runs a small mission loop: parked → take off → cruise to another
// strip clearing terrain → join a long final → land → park. In the F-16, a wingman flies formation on you.
import { trafficRadio } from './radio.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { BASE_PATH, AIRCRAFT, aircraftState, aircraft, state, FIXED_STEP } from './config.js';
import { scene } from './engine.js';
import { groundLevelAt, onRunway } from './chunks.js';
import { AIRPORT_H } from './world.js';
import { mission } from './survey.js';
import { stepFM, newState, DEFAULT_PARAMS } from './flightModel.js';
import { loadPilot, pilotReady, act, buildObs } from './aipilot.js';

const AI_DT=1/30; // must match train_pilot.py DT
const DEG=Math.PI/180,OBS=new Float32Array(32),CTRL={pitch:0,roll:0,yaw:0,throttle:0};
// traffic flies with stall simulation off (but without the forgiving "never sink" assist, which floats its flare): an AI recovering from a
// stall while a safety layer pulls the nose up only makes it worse
const AI_FM={stall:false,forgiving:false};
const TYPES={
  skylane:{file:'cessna_182_skylane.glb',scale:1.08,yaw:0,variant:0,P:{...DEFAULT_PARAMS,...AI_FM},contact:1.35,cruise:52},
  caravan:{file:'cessna_208_amphibian.glb',scale:1,yaw:-Math.PI/2,variant:1,P:{...DEFAULT_PARAMS,...AI_FM,thrust:1.3},contact:2.8,cruise:50},
  f16:{file:'f16_fighting_falcon.glb',lengthM:15.06,yaw:Math.PI/2,variant:2,P:{...DEFAULT_PARAMS,...AI_FM,rollRate:220,pitchRate:50,thrust:4,cdMul:.7,ab:1.6,jet:true},contact:1.9,cruise:150},
};
const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
const cache={};
function model(type,livery){
  const T=TYPES[type];
  if(!cache[type])cache[type]=loader.loadAsync(`${BASE_PATH}/models/${T.file}`).then(g=>{
    const m=g.scene;if(T.yaw)m.rotation.y=T.yaw;
    if(T.lengthM){m.updateMatrixWorld(true);const s=new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());m.scale.setScalar(T.lengthM/Math.max(s.x,s.z));
      m.updateMatrixWorld(true);const c=new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());m.position.x-=c.x;m.position.z-=c.z;}
    else m.scale.setScalar(T.scale);
    m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;if(o.material?.map)o.material.map.colorSpace=THREE.SRGBColorSpace;
      if(/landingOff/i.test(o.parent?.name||''))o.visible=false;}});
    return m;});
  return cache[type].then(m=>{const g=new THREE.Group(),inner=cloneSkinned(m);g.add(inner);
    // (SkeletonUtils clone: the Skylane is skinned with 50 skins, and a plain clone leaves its meshes bound to the original skeleton)
    // livery: tint the big painted exterior panels (wings, fuselage) so aircraft sharing a model look distinct
    if(livery){const col=new THREE.Color(...livery),box=new THREE.Box3(),sz=new THREE.Vector3();inner.updateMatrixWorld(true);
      inner.traverse(o=>{if(!o.isMesh||!o.material?.map||o.material.transparent||/int|gauge|glass|windshield|light|sign/i.test(o.material.name||''))return;
        box.setFromObject(o).getSize(sz);if(Math.max(sz.x,sz.y,sz.z)<1.6)return;o.material=o.material.clone();o.material.color.multiply(col);});}
    // contact height from the model's lowest point
    g.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(inner);T.contact=Math.max(.8,-b.min.y+.035);return g;});
}

// Runways and strips as landing sites, each with a landing heading.
function sites(){
  const S=[{name:'Home Field',x:0,z:0,h:AIRPORT_H,halfL:650,halfW:22,axis:[0,1]}];
  for(const s of mission.strips||[])S.push({name:s.name,x:s.x,z:s.z,h:s.h,halfL:s.halfL,halfW:s.halfW,axis:[s.cos,s.sin]});
  return S;
}
// Landing direction d (unit, in x/z) → runway descriptor in the frame aipilot expects.
function runway(site,dir){const yaw=Math.atan2(-dir[0],-dir[1]);return {x:site.x,z:site.z,yaw,halfL:site.halfL,halfW:site.halfW,h:site.h};}
// Pick the landing direction into the wind, then the final-approach entry 4.5 km out at ~260 m.
function plan(site){
  const w=state.wind,a=site.axis,into=(w.x*a[0]+w.z*a[1])>0?[-a[0],-a[1]]:[a[0],a[1]];
  const rw=runway(site,into),entry={x:site.x-into[0]*(site.halfL+4300),z:site.z-into[1]*(site.halfL+4300)};
  return {rw,entry};
}
function terrainClear(x0,z0,x1,z1){let m=-1e9;for(let i=0;i<=12;i++){const t=i/12;m=Math.max(m,groundLevelAt(x0+(x1-x0)*t,z0+(z1-z0)*t));}return m;}
// highest ground along a heading (forward = (-sin yaw, -cos yaw)) out to `dist` metres
function aheadMax(x,z,yaw,dist){return terrainClear(x,z,x-Math.sin(yaw)*dist,z-Math.cos(yaw)*dist);}

class AI{
  constructor(type,callsign){this.type=type;this.T=TYPES[type];this.callsign=callsign;this.s=null;this.g=null;this.phase='parked';this.t=0;this.wait=8+Math.random()*30;this.decT=0;this.touched=false;}
  async spawn(site){
    this.g=await model(this.type,this.livery);scene.add(this.g);
    const dir=site.axis,s=newState(site.x+dir[0]*(site.halfL-60),site.h+this.T.contact,site.z+dir[1]*(site.halfL-60),Math.atan2(dir[0],dir[1]));
    this.s=s;this.site=site;this.phase='parked';this.wait=6+Math.random()*25;this.sync();
  }
  sync(){const s=this.s;this.g.position.set(s.x,s.y,s.z);this.g.rotation.order='YXZ';this.g.rotation.set(s.pitch,s.yaw,-s.roll);}
  env(){return {ground:(x,z)=>groundLevelAt(x,z),paved:(x,z)=>onRunway(x,z),wind:[state.wind.x,state.wind.z],contact:this.T.contact};}
  decide(){
    const s=this.s,g=groundLevelAt(s.x,s.z),wind=[state.wind.x,state.wind.z],T=this.T;
    let task=0,opts={task:0,variant:T.variant,ground:g,contact:T.contact,wind};
    if(this.phase==='takeoff'){task=2;opts={...opts,task:2,rw:this.depart};if(s.alt>140)this.phase='cruise';}
    if(this.phase==='cruise'||this.phase==='formation'){
      let tx,tz,altAbs,spd=T.cruise;
      if(this.phase==='formation'){
        // slot: 60 m off the player's right wing, 25 m back, same height; close up with speed
        const a=aircraft,fx=-Math.sin(a.yaw),fz=-Math.cos(a.yaw),rx=Math.cos(a.yaw),rz=-Math.sin(a.yaw);
        const sx=a.position.x+rx*60-fx*25,sz=a.position.z+rz*60-fz*25;tx=sx+fx*400;tz=sz+fz*400;altAbs=a.position.y;
        const ahead=(sx-s.x)*fx+(sz-s.z)*fz;spd=Math.max(60,Math.min(260,a.airspeed+ahead*.25));
      }else{tx=this.plan.entry.x;tz=this.plan.entry.z;altAbs=Math.max(terrainClear(s.x,s.z,tx,tz)+260,this.plan.rw.h+260);
        if(Math.hypot(tx-s.x,tz-s.z)<900){this.phase='approach';this.touched=false;this.say('approach');}}
      const hdgT=Math.atan2(-(tx-s.x),-(tz-s.z));
      opts={...opts,task:0,hdgT,altT:altAbs-g,spdT:spd};task=0;
    }
    if(this.phase==='approach'){task=1;opts={...opts,task:1,rw:this.plan.rw,touched:this.touched};}
    const info=buildObs(s,OBS,opts);act(OBS,CTRL);this.ctrl={...CTRL};
    // envelope protection on top of the network: rotate if still rolling past rotation speed, and climb away
    // from terrain when low in cruise (the network was trained over flat ground)
    const kt=s.airspeed*1.944,c=this.ctrl;
    if(this.phase==='takeoff'&&s.onGround&&kt>(T.variant===2?75:57)){c.pitch=Math.max(c.pitch,.7);c.throttle=1;}
    // formation: hold the leader's height precisely (the network's altitude hold is too relaxed for close formation)
    if(this.phase==='formation'){const dyE=aircraft.position.y-s.y-s.vy*1.5;c.pitch=Math.max(-1,Math.min(1,c.pitch+Math.max(-.35,Math.min(.35,dyE*.012))));}
    // terrain escape (takeoff and cruise): if rising ground ahead is above the flight path, climb at best-climb
    // pitch with full power and turn towards the lowest terrain; the network was trained over flat ground
    if((this.phase==='takeoff'||this.phase==='cruise')&&!s.onGround&&s.alt>4&&T.variant!==2){
      // can the climb make it? compare the ground at several ranges against a conservative climb gradient
      let need=-1e9;for(const d of [500,1000,1800,2800])need=Math.max(need,aheadMax(s.x,s.z,s.yaw,d)+60-s.y-.09*d);
      if(need>0){
        let best=0,bm=1e9;for(const off of [0,-.5,.5,-1,1,-1.6,1.6]){const m=aheadMax(s.x,s.z,s.yaw+off,2000)+Math.abs(off)*20;if(m<bm){bm=m;best=off;}}
        const pT=kt<62?.05:kt<70?.14:.22;c.pitch=Math.max(-1,Math.min(1,(pT-s.pitch)*5-s.pr*.6));c.throttle=1;
        const bank=need>80?.62:.45,rollT=Math.max(-bank,Math.min(bank,-best*.9));c.roll=Math.max(-1,Math.min(1,(rollT-s.roll)*2.2));
      }
    }
    if(this.phase==='cruise'&&s.alt<80&&kt>62){const want=Math.max(-1,Math.min(1,(.14-s.pitch)*5-s.pr*.6));c.pitch=Math.max(c.pitch,want);c.throttle=1;c.roll=Math.max(-1,Math.min(1,-s.roll*2));}
    // approach: never dive at the runway (a high entry makes the network push over); cap the sink rate
    if(this.phase==='approach'&&!s.onGround){const lim=s.alt>40?-7:-4.5;if(s.vy<lim)c.pitch=Math.max(-1,Math.min(1,c.pitch+Math.min(.8,(lim-s.vy)*.12)));}
    if(this.phase==='approach'&&!s.onGround&&!this.touched){
      if(kt>92&&T.variant!==2){c.pitch=Math.max(c.pitch,Math.max(-1,Math.min(1,(.06-s.pitch)*4)));c.throttle=0;}   // too fast: trade speed for height
      if(s.alt<20&&info.along>400){c.throttle=1;c.pitch=Math.max(c.pitch,Math.max(-1,Math.min(1,(.15-s.pitch)*5-s.pr*.6)));}   // undershooting: power and climb
    }
    if(this.phase==='approach'){
      if(s.touch>0)this.touched=true;
      if(this.touched&&s.onGround&&s.airspeed<14){this.phase='parked';this.site=this.target;this.wait=25+Math.random()*40;this.say('landed');}
      if(!this.touched&&info.along<-this.plan.rw.halfL){this.phase='cruise';}   // went around
    }
  }
  update(dt){
    if(!this.s||!this.g)return;
    const s=this.s;
    if(this.phase==='parked'){
      const w0=this.wait;this.wait-=dt;s.vx*=.9;s.vz*=.9;s.power=0;if(w0>=20&&this.wait<20)this.say('ready');
      if(this.wait<0&&this.type!=='f16'){
        const all=sites().filter(x=>x!==this.site);if(!all.length)return;
        this.target=all[Math.floor(Math.random()*all.length)];this.plan=plan(this.target);
        const dep=plan(this.site);this.depart=dep.rw;
        // line up at the start of the departure runway, facing the departure direction
        const d=[-Math.sin(dep.rw.yaw),-Math.cos(dep.rw.yaw)];
        Object.assign(s,newState(this.site.x-d[0]*(this.site.halfL-40),this.site.h+this.T.contact,this.site.z-d[1]*(this.site.halfL-40),dep.rw.yaw));
        this.phase='takeoff';this.say('takeoff');
        if(!aircraft.onGround&&Math.hypot(s.x-aircraft.position.x,s.z-aircraft.position.z)<4000)this.say('takeoff_near');
      }
      this.sync();return;
    }
    // decide every 0.1 s of *simulated* time, inside the step loop, so a long frame (tab hitch, chunk build) can't
    // fly seconds of physics on one stale control input; catch-up is capped at a quarter second
    const E=this.env();
    this.acc=Math.min((this.acc||0)+dt,.25);
    while(this.acc>=AI_DT){this.decT-=AI_DT;if(this.decT<=0||!this.ctrl){this.decT=.1;this.decide();if(this.phase==="parked")break;}stepFM(s,this.ctrl,this.T.P,E,AI_DT);this.acc-=AI_DT;}
    if(s.crashed||!Number.isFinite(s.x)){if(typeof window!=='undefined'&&window.__trafficCrash)window.__trafficCrash(this);this.respawn();return;}
    this.spinProp(dt);this.sync();
  }
  spinProp(dt){if(!this.prop){this.prop=this.g.getObjectByName('prop_1_33')||null;this.prop&&(this.propAxis='y');}if(this.prop)this.prop.rotation[this.propAxis]+=dt*(18+this.s.power*205);}
  respawn(){const S=sites();this.spawnSite(S[Math.floor(Math.random()*S.length)]);}
  spawnSite(site){const dir=site.axis;Object.assign(this.s,newState(site.x+dir[0]*(site.halfL-60),site.h+this.T.contact,site.z+dir[1]*(site.halfL-60),Math.atan2(dir[0],dir[1])));this.site=site;this.phase='parked';this.wait=10+Math.random()*30;this.sync();}
  remove(){if(this.g)scene.remove(this.g);}
  // radio: only within ~25 km of the player, and only once a flight has started
  say(ev){if(!state.started||!this.s||this.type==='f16')return;const a=aircraft.position;if(Math.hypot(this.s.x-a.x,this.s.z-a.z)>25000)return;
    trafficRadio(this.callsign.split(' ')[0].toLowerCase(),ev);}
}

const fleet=[];let wingman=null,started=false;
export async function startTraffic(){
  if(started)return;started=true;
  await loadPilot();if(!pilotReady())return;
  const S=sites(),plan=[['caravan','Caravan niner kilo'],['skylane','Beaver one two zulu',[1,.8,.36]],['skylane','Otter five six',[.95,.36,.32]]];
  for(let i=0;i<plan.length;i++){const ai=new AI(plan[i][0],plan[i][1]);ai.livery=plan[i][2];fleet.push(ai);await ai.spawn(S[(i+1)%S.length]);ai.wait=4+i*18;}
}
export function updateTraffic(dt){
  if(!started||!pilotReady()||state.paused)return;
  for(const ai of fleet)ai.update(dt);
  // F-16 wingman: appears beside you when you fly the jet
  const jet=AIRCRAFT[aircraftState.variant]?.jet&&state.started&&!aircraft.onGround&&aircraft.altAGL>80;
  if(jet&&!wingman){wingman=new AI('f16','Viper two');model('f16').then(g=>{if(!wingman)return;wingman.g=g;scene.add(g);
    const a=aircraft,rx=Math.cos(a.yaw),rz=-Math.sin(a.yaw);const s=newState(a.position.x+rx*80,a.position.y,a.position.z+rz*80,a.yaw);
    s.vx=a.velocity.x;s.vy=a.velocity.y;s.vz=a.velocity.z;s.pitch=a.pitch;s.power=.8;s.onGround=false;wingman.s=s;wingman.phase='formation';});}
  if(!AIRCRAFT[aircraftState.variant]?.jet&&wingman){wingman.remove();wingman=null;}
  if(wingman?.s){wingman.update(dt);if(wingman.s.crashed){wingman.remove();wingman=null;}}
}
export function trafficList(){return [...fleet,...(wingman?[wingman]:[])].filter(a=>a.s).map(a=>({callsign:a.callsign,type:a.type,yaw:a.s.yaw,x:Math.round(a.s.x),y:Math.round(a.s.y),z:Math.round(a.s.z),alt:Math.round(a.s.alt||0),kt:Math.round((a.s.airspeed||0)*1.944),phase:a.phase,crashed:a.s.crashed,target:a.target?.name||null}));}
