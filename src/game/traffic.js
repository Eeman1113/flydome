// SKYBOUND · traffic: AI aircraft flown by the trained pilot network (aipilot.js) on the same flight model
// as the player (flightModel.js). Each plane runs a small mission loop: parked → take off → cruise to another
// strip clearing terrain → join a long final → land → park. In the F-16, a wingman flies formation on you.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { BASE_PATH, AIRCRAFT, aircraftState, aircraft, state, FIXED_STEP } from './config.js';
import { scene } from './engine.js';
import { groundLevelAt, onRunway } from './chunks.js';
import { AIRPORT_H } from './world.js';
import { mission } from './survey.js';
import { stepFM, newState, DEFAULT_PARAMS } from './flightModel.js';
import { loadPilot, pilotReady, act, buildObs } from './aipilot.js';

const AI_DT=1/30; // must match train_pilot.py DT
const DEG=Math.PI/180,OBS=new Float32Array(32),CTRL={pitch:0,roll:0,yaw:0,throttle:0};
const TYPES={
  skylane:{file:'cessna_182_skylane.glb',scale:1.08,yaw:0,variant:0,P:{...DEFAULT_PARAMS},contact:1.35,cruise:52},
  caravan:{file:'cessna_208_amphibian.glb',scale:1,yaw:-Math.PI/2,variant:1,P:{...DEFAULT_PARAMS,thrust:1.3},contact:2.8,cruise:50},
  f16:{file:'f16_fighting_falcon.glb',lengthM:15.06,yaw:Math.PI/2,variant:2,P:{...DEFAULT_PARAMS,rollRate:220,pitchRate:50,thrust:4,cdMul:.7,ab:1.6,jet:true},contact:1.9,cruise:150},
};
const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
const cache={};
function model(type){
  const T=TYPES[type];
  if(!cache[type])cache[type]=loader.loadAsync(`${BASE_PATH}/models/${T.file}`).then(g=>{
    const m=g.scene;if(T.yaw)m.rotation.y=T.yaw;
    if(T.lengthM){m.updateMatrixWorld(true);const s=new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());m.scale.setScalar(T.lengthM/Math.max(s.x,s.z));
      m.updateMatrixWorld(true);const c=new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());m.position.x-=c.x;m.position.z-=c.z;}
    else m.scale.setScalar(T.scale);
    m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;if(o.material?.map)o.material.map.colorSpace=THREE.SRGBColorSpace;
      if(/landingOff/i.test(o.parent?.name||''))o.visible=false;}});
    return m;});
  return cache[type].then(m=>{const g=new THREE.Group(),inner=m.clone(true);g.add(inner);
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

class AI{
  constructor(type,callsign){this.type=type;this.T=TYPES[type];this.callsign=callsign;this.s=null;this.g=null;this.phase='parked';this.t=0;this.wait=8+Math.random()*30;this.decT=0;this.touched=false;}
  async spawn(site){
    this.g=await model(this.type);scene.add(this.g);
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
        if(Math.hypot(tx-s.x,tz-s.z)<900){this.phase='approach';this.touched=false;}}
      const hdgT=Math.atan2(-(tx-s.x),-(tz-s.z));
      opts={...opts,task:0,hdgT,altT:altAbs-g,spdT:spd};task=0;
    }
    if(this.phase==='approach'){task=1;opts={...opts,task:1,rw:this.plan.rw,touched:this.touched};}
    const info=buildObs(s,OBS,opts);act(OBS,CTRL);this.ctrl={...CTRL};
    // envelope protection on top of the network: rotate if still rolling past rotation speed, and climb away
    // from terrain when low in cruise (the network was trained over flat ground)
    const kt=s.airspeed*1.944,c=this.ctrl;
    if(this.phase==='takeoff'&&s.onGround&&kt>(T.variant===2?75:57)){c.pitch=Math.max(c.pitch,.7);c.throttle=1;}
    if(this.phase==='cruise'&&s.alt<80&&kt>62){const want=Math.max(-1,Math.min(1,(.14-s.pitch)*5-s.pr*.6));c.pitch=Math.max(c.pitch,want);c.throttle=1;c.roll=Math.max(-1,Math.min(1,-s.roll*2));}
    if(this.phase==='approach'){
      if(s.touch>0)this.touched=true;
      if(this.touched&&s.onGround&&s.airspeed<14){this.phase='parked';this.site=this.target;this.wait=15+Math.random()*40;}
      if(!this.touched&&info.along<-this.plan.rw.halfL){this.phase='cruise';}   // went around
    }
  }
  update(dt){
    if(!this.s||!this.g)return;
    const s=this.s;
    if(this.phase==='parked'){
      this.wait-=dt;s.vx*=.9;s.vz*=.9;s.power=0;
      if(this.wait<0&&this.type!=='f16'){
        const all=sites().filter(x=>x!==this.site);if(!all.length)return;
        this.target=all[Math.floor(Math.random()*all.length)];this.plan=plan(this.target);
        const dep=plan(this.site);this.depart=dep.rw;
        // line up at the start of the departure runway, facing the departure direction
        const d=[-Math.sin(dep.rw.yaw),-Math.cos(dep.rw.yaw)];
        Object.assign(s,newState(this.site.x-d[0]*(this.site.halfL-40),this.site.h+this.T.contact,this.site.z-d[1]*(this.site.halfL-40),dep.rw.yaw));
        this.phase='takeoff';
      }
      this.sync();return;
    }
    this.decT-=dt;if(this.decT<=0){this.decT=.1;this.decide();}
    const E=this.env();
    this.acc=(this.acc||0)+dt;while(this.acc>=AI_DT){stepFM(s,this.ctrl,this.T.P,E,AI_DT);this.acc-=AI_DT;}
    if(s.crashed||!Number.isFinite(s.x)){this.respawn();return;}
    this.spinProp(dt);this.sync();
  }
  spinProp(dt){if(!this.prop){this.prop=this.g.getObjectByName('prop_1_33')||null;this.prop&&(this.propAxis='y');}if(this.prop)this.prop.rotation[this.propAxis]+=dt*(18+this.s.power*205);}
  respawn(){const S=sites();this.spawnSite(S[Math.floor(Math.random()*S.length)]);}
  spawnSite(site){const dir=site.axis;Object.assign(this.s,newState(site.x+dir[0]*(site.halfL-60),site.h+this.T.contact,site.z+dir[1]*(site.halfL-60),Math.atan2(dir[0],dir[1])));this.site=site;this.phase='parked';this.wait=10+Math.random()*30;this.sync();}
  remove(){if(this.g)scene.remove(this.g);}
}

const fleet=[];let wingman=null,started=false;
export async function startTraffic(){
  if(started)return;started=true;
  await loadPilot();if(!pilotReady())return;
  const S=sites(),plan=[['caravan','Caravan niner kilo'],['skylane','Beaver one two zulu'],['skylane','Otter five six']];
  for(let i=0;i<plan.length;i++){const ai=new AI(plan[i][0],plan[i][1]);fleet.push(ai);await ai.spawn(S[(i+1)%S.length]);ai.wait=4+i*18;}
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
export function trafficList(){return fleet.filter(a=>a.s).map(a=>({callsign:a.callsign,x:Math.round(a.s.x),y:Math.round(a.s.y),z:Math.round(a.s.z),alt:Math.round(a.s.alt||0),kt:Math.round((a.s.airspeed||0)*1.944),phase:a.phase,crashed:a.s.crashed,target:a.target?.name||null}));}
