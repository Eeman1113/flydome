// SKYBOUND · survey — FIRST CHARTER gameplay.
// Each world is scanned for real landmarks; charters ask the pilot to survey three of them
// and land at any strip. Discoveries persist; crashes only cost the charter's landing bonus.
import { DEG, clamp } from './util.js';
import { achEvent } from './achievements.js';
import { haptic } from './haptics.js';
import { AIRPORT_H, terrain } from './world.js';
import { DAILY_NUMBER, IS_DAILY, RUNWAY_HALF_L, RUNWAY_HALF_W, START_Z, WORLD_SEED, aircraft, state } from './config.js';
import { onRunway, worldScan, isWaterAt } from './chunks.js';
import { AIRCRAFT, aircraftState } from './config.js';
import { aircraftGroundOffset } from './engine.js';
import { radioEvent } from './radio.js';
import { sfx } from './sfx.js';
import { addXP, markWorldFlown, progress, rankInfo, recordLanding, saveProgress, worldEntry } from './progress.js';
import { TYPE_LABEL } from './icons.js';
import { hudBanner, hudLanding, hudCharterComplete, hudCharterUpdate, hudRevealTick, hudEvents } from './hud.js';

const HOLD=1.6; // seconds inside a survey envelope
export const mission={
  ready:false,scan:null,landmarks:[],strips:[],charters:[],mode:'free',charter:null,
  discovered:new Set(),survey:null,track:[],trackTimer:0,airborneT:0,airborne:false,vyMin:0,vyWindow:[],
  touchdown:null,bounces:0,respawn:null,charterStart:0,bonusLost:false,complete:false,flightTime:0
};

export async function initSurvey(){
  const scan=await worldScan;
  mission.scan=scan;mission.strips=terrain.strips;
  const entry=worldEntry(WORLD_SEED);
  mission.landmarks=scan.landmarks.map(l=>({...l,env:envelope(l),hold:0,clean:0}));
  for(const id of entry.discovered)mission.discovered.add(id);
  mission.charters=buildCharters(mission.landmarks);if(waterCharter)mission.charters.push(waterCharter);
  mission.ready=true;saveProgress();
  return mission;
}

function envelope(l){
  const areaR=Math.sqrt(Math.max(l.area,.05))*1000*.5;
  switch(l.type){
    case 'peak':return {r:650,minAlt:l.y+15,maxAlt:l.y+650,hint:'Pass within 650 m of the summit'};
    case 'crater':{const m=Math.round(l.rimH*.85/10)*10;return {r:l.r*.8,maxAGL:m,hint:`Drop inside the rim, below ${m} m over the water`};}
    case 'lake':return {r:Math.max(450,areaR),maxAGL:220,hint:'Fly low over the water, below 220 m'};
    case 'island':return {r:Math.max(420,areaR+150),maxAGL:260,hint:'Overfly the island below 260 m'};
    case 'forest':return {r:750,maxAGL:220,hint:'Skim the canopy, below 220 m'};
    case 'river':return {r:480,maxAGL:180,hint:'Follow the river below 180 m'};
    case 'pass':return {r:520,maxAlt:l.y+260,hint:'Thread the pass, under 260 m above the saddle'};
    case 'gorge':return {r:900,run:true,maxAlt:l.y+220,hint:'Fly the gorge end to end, below the rims'};
    case 'falls':return {r:520,maxAGL:300,hint:'Pass the falls below 300 m'};
    case 'stacks':return {r:500,maxAGL:200,hint:'Fly low past the stacks, below 200 m'};
    case 'cape':return {r:650,maxAGL:250,hint:'Round the headland below 250 m'};
    case 'glacier':return {r:950,maxAGL:380,hint:'Cross the ice below 380 m'};
    case 'lighthouse':return {r:480,maxAGL:260,hint:'Pass the lighthouse below 260 m'};
    case 'wreck':return {r:360,maxAGL:170,hint:'Low pass over the wreck, below 170 m'};
    case 'arch':return {r:420,maxAGL:200,hint:'Fly past the arch below 200 m'};
    case 'spire':return {r:420,maxAlt:(l.top||l.y+100)+180,hint:'Circle the needle close in'};
  }
  return {r:600,maxAGL:300,hint:'Overfly it'};
}

// ---------------------------------------------------------------- charters
const DIRS=['Northern','North-Eastern','Eastern','South-Eastern','Southern','South-Western','Western','North-Western'];
const THEME={peak:'Highlands',pass:'Highlands',gorge:'Highlands',glacier:'Highlands',spire:'Wilds',lake:'Waters',crater:'Waters',river:'Waters',falls:'Waters',island:'Coast',stacks:'Coast',cape:'Coast',lighthouse:'Coast',forest:'Wilds',wreck:'Wilds',arch:'Wilds'};
function bearingOf(x,z){return ((Math.atan2(x,-z)/DEG)+360)%360;}
function routeLength(ls){let d=0,px=0,pz=START_Z;for(const l of ls){d+=Math.hypot(l.x-px,l.z-pz);px=l.x;pz=l.z;}return d+Math.hypot(px,pz);}
function orderRoute(ls){ // greedy nearest-neighbour from home
  const rest=[...ls],out=[];let px=0,pz=START_Z;
  while(rest.length){rest.sort((a,b)=>Math.hypot(a.x-px,a.z-pz)-Math.hypot(b.x-px,b.z-pz));const n=rest.shift();out.push(n);px=n.x;pz=n.z;}
  return out;
}
function makeCharter(id,title,ls){
  const route=orderRoute(ls),len=routeLength(route);
  return {id,title,ids:route.map(l=>l.id),km:len/1000,minutes:Math.max(4,Math.round(len/52/60+route.length*.6)),difficulty:len<24000?1:len<38000?2:3};
}
let waterCharter=null;
function buildCharters(L){
  if(L.length<3)return L.length?[makeCharter('c0','Local Survey',L)]:[];
  const byDist=[...L].sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z));
  const out=[makeCharter('c0','First Light Survey',byDist.slice(0,3))];
  // densest compass sector for a themed regional charter
  let best=null;
  for(let s=0;s<8;s++){
    const c=s*45,inS=L.filter(l=>{const d=((bearingOf(l.x,l.z)-c+540)%360)-180;return Math.abs(d)<=60;});
    if(inS.length>=3&&(!best||inS.length>best.list.length))best={s,list:inS};
  }
  if(best){
    const pick=best.list.sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z)).slice(0,3);
    const counts={};pick.forEach(l=>counts[THEME[l.type]]=(counts[THEME[l.type]]||0)+1);
    const theme=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
    out.push(makeCharter('c1',`${DIRS[best.s]} ${theme}`,pick));
  }
  const top=L.find(l=>l.highest)||byDist[byDist.length-1];
  const far=byDist.filter(l=>l!==top).slice(-2);
  out.push(makeCharter('c2',top.type==='peak'?`The ${top.name.replace(/^Mount /,'')} Expedition`:'Long-Range Expedition',[top,...far]));
  // Water strip charter (amphibian only): survey the waters, then alight on a charted lake.
  const lakes=L.filter(l=>l.type==='lake'||l.type==='crater');
  if(lakes.length){
    const WT=['lake','crater','river','falls','stacks','island','lighthouse','cape'];
    const alight=[...lakes].sort((a,b)=>(b.type==='crater')-(a.type==='crater')||Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0];
    const rest=L.filter(l=>l!==alight&&WT.includes(l.type)).sort((a,b)=>Math.hypot(a.x-alight.x,a.z-alight.z)-Math.hypot(b.x-alight.x,b.z-alight.z)).slice(0,2);
    const c=makeCharter('cw',alight.type==='crater'?`${alight.name.replace(/^The /,'')} Run`:`${alight.name.replace(/^Lake /,'')} Water Run`,[...rest,alight]);
    // the alighting lake is always the last leg
    c.ids=[...orderRoute(rest).map(l=>l.id),alight.id];c.water=true;c.alight=alight.id;
    waterCharter=c;
  }else waterCharter=null;
  // drop duplicates (same landmark set)
  const seen=new Set();return out.filter(c=>{const k=[...c.ids].sort().join(',');if(seen.has(k))return false;seen.add(k);return true;});
}
export function dailyCharter(){const c=mission.charters.filter(c=>!c.water);return c[c.length>1?1:0];}

// ---------------------------------------------------------------- flow
export function beginMission(mode,charterIndex=0){
  mission.mode=mode;mission.complete=false;mission.bonusLost=false;
  mission.charter=mode==='free'?null:(mode==='daily'?dailyCharter():mission.charters[charterIndex])||null;
  mission.charterStart=performance.now();mission.flightTime=0;mission.track=[];
  mission.respawn=null;mission.touchdown=null;mission.airborne=false;mission.airborneT=0;
  markWorldFlown(WORLD_SEED,{daily:IS_DAILY});
  // Hardcore: tank sized to the charter route (≈2.2× its flying time at cruise), refuel at strips.
  mission.hardcore=!!progress.pilot.hardcore&&!!mission.charter;
  mission.tankSec=mission.charter?Math.max(540,mission.charter.km*1000/48*2.2):900;mission.fuel=1;aircraft.engineRunning=true;
  // Daily ghost: record this run; replay the stored best one.
  mission.rec=[];mission.recT=0;mission.ghost=mode==='daily'?(progress.daily[DAILY_NUMBER]?.ghost||null):null;
  hudEvents.ghost?.(mission.ghost);
  mission.job=null;mission.cargoKg=0;
  if(mode==='cargo')hudEvents.jobBoard?.({jobs:generateJobs('home')});
  hudCharterUpdate();
}
export function landmarkById(id){return mission.landmarks.find(l=>l.id===id);}
export function charterTargets(){return mission.charter?mission.charter.ids.map(landmarkById).filter(Boolean):[];}
export function nextTarget(){
  const t=charterTargets().filter(l=>!mission.discovered.has(l.id));
  if(!t.length)return null;
  const a=aircraft.position;return t.sort((p,q)=>Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(q.x-a.x,q.z-a.z))[0];
}
export function charterSurveyed(){return mission.charter&&charterTargets().every(l=>mission.discovered.has(l.id));}

// ---------------------------------------------------------------- per-frame
export function surveyTick(dt){
  if(!mission.ready||!state.started||state.paused||state.crashed)return;
  const a=aircraft,p=a.position;mission.flightTime+=dt;progress.pilot.flightTime+=dt;
  if(mission.hardcore){
    const onGround=a.altAGL<aircraftGroundOffset+.3,site=onGround&&Math.hypot(a.velocity.x,a.velocity.z)<2?siteAt(p.x,p.z):null;
    if(site&&site.kind!=='field'){mission.fuel=Math.min(1,mission.fuel+dt*.06);if(mission.fuel>.02&&!a.engineRunning)a.engineRunning=true;}
    else mission.fuel=Math.max(0,mission.fuel-dt*(.22+.78*a.enginePower)/mission.tankSec);
    if(mission.fuel<=0&&a.engineRunning){a.engineRunning=false;hudEvents.fuelOut?.();}
  }
  if(mission.mode==='daily'&&!mission.complete){mission.recT+=dt;if(mission.recT>=.2){mission.recT=0;mission.rec.push(+p.x.toFixed(1),+p.y.toFixed(1),+p.z.toFixed(1),+a.yaw.toFixed(3),+a.pitch.toFixed(3),+a.roll.toFixed(3));}}
  mission.trackTimer+=dt;
  if(mission.trackTimer>1.2){mission.trackTimer=0;mission.track.push([p.x,p.z]);if(mission.track.length>1500)mission.track.shift();hudRevealTick(p.x,p.z);}
  // survey envelopes
  let best=null;
  for(const l of mission.landmarks){
    if(mission.discovered.has(l.id)){l.hold=0;continue;}
    const d=Math.hypot(p.x-l.x,p.z-l.z),e=l.env;
    if(e.run){gorgeRun(l,dt,d);const prog=l.runT!=null?clamp(l.runProg||0,0,1):0;if(d<e.r*1.6&&(!best||prog>best.prog))best={l,prog,why:l.runWhy||'',d,run:true};continue;}
    if(d>e.r*2.2){l.hold=Math.max(0,l.hold-dt);continue;}
    let why='';
    if(d>e.r)why='Get closer';
    else if(e.maxAGL!=null&&a.altAGL>e.maxAGL)why=`Descend below ${e.maxAGL} m`;
    else if(e.maxAlt!=null&&p.y>e.maxAlt)why=`Descend · ${Math.round(p.y-e.maxAlt)} m too high`;
    else if(e.minAlt!=null&&p.y<e.minAlt)why='Climb above the summit';
    else if(Math.abs(a.roll)>40*DEG)why='Level the wings';
    if(!why){l.hold+=dt;if(Math.abs(a.roll)<15*DEG)l.clean+=dt;}else l.hold=Math.max(0,l.hold-dt*.6);
    const prog=clamp(l.hold/HOLD,0,1);
    if(!best||prog>best.prog||(prog===best.prog&&d<best.d))best={l,prog,why,d};
    if(l.hold>=HOLD)discover(l,l.clean/l.hold>.8);
  }
  mission.survey=best&&(best.prog>0||best.d<best.l.env.r*1.6)?best:null;
  // solid rock: spires and sea stacks
  for(const l of mission.landmarks){
    if(l.type!=='spire'&&l.type!=='stacks')continue;
    const d=Math.hypot(p.x-l.x,p.z-l.z),R=l.type==='spire'?16:70,top=l.type==='spire'?l.top:l.top*.9;
    if(d<R&&p.y<top-2){hudEvents.crash?.('Rock strike',`The aircraft struck ${l.name}. Restart the flight to try again.`,'Rock strike.');return;}
  }
  trackLanding(dt);
}

// Gorge run: enter through one gate, stay below the rims, exit through the other within 60 s.
function gorgeRun(l,dt,d){
  const p=aircraft.position,g=520,gA=[l.x+l.ax*g,l.z+l.az*g],gB=[l.x-l.ax*g,l.z-l.az*g];
  const dA=Math.hypot(p.x-gA[0],p.z-gA[1]),dB=Math.hypot(p.x-gB[0],p.z-gB[1]),gate=180;
  if(l.runT==null){
    if(dA<gate&&p.y<l.env.maxAlt+40){l.runT=0;l.runFrom='A';}else if(dB<gate&&p.y<l.env.maxAlt+40){l.runT=0;l.runFrom='B';}
    l.runWhy=d<l.env.r*1.6?'Enter at either end of the gorge':'';l.runProg=0;return;
  }
  l.runT+=dt;const toEnd=l.runFrom==='A'?dB:dA;
  l.runProg=clamp(1-toEnd/(2*g),0,1);l.runWhy=`Gorge run · ${l.runT.toFixed(1)} s`;
  if(p.y>l.env.maxAlt+60||l.runT>60||d>g+500){l.runT=null;l.runWhy='Run broken — re-enter the gorge';return;}
  if(toEnd<gate){const t=l.runT;l.runT=null;l.runTime=t;discover(l,t<35);}
}
function discover(l,clean){
  mission.discovered.add(l.id);
  const entry=worldEntry(WORLD_SEED);if(!entry.discovered.includes(l.id))entry.discovered.push(l.id);
  const pl=progress.pilot;pl.discoveries++;pl.stamps[l.type]=(pl.stamps[l.type]||0)+1;if(l.rare)pl.stamps.rare=(pl.stamps.rare||0)+1;
  const xp=80+(l.rare?60:0)+(l.highest?40:0)+(clean?30:0);
  const res=addXP(xp);
  if(l.type==='gorge'&&l.runTime)radioEvent('gorge');
  radioEvent('discovery',{rare:l.rare,rankUp:res.rankUp?res.rank.index:null});
  if(l.type==='gorge'&&l.runTime)l.metaExtra=` · RUN ${l.runTime.toFixed(1)} S`;
  hudEvents.beacon?.(l);
  const meta=l.type==='peak'||l.type==='pass'||l.type==='gorge'||l.type==='spire'||l.type==='falls'?`${l.highest?'HIGHEST PEAK':TYPE_LABEL[l.type].toUpperCase()} · ${Math.round(l.type==='spire'?l.height:l.elev).toLocaleString()} M${l.metaExtra||''}`:l.area?`${TYPE_LABEL[l.type].toUpperCase()} · ${l.area.toFixed(1)} KM²`:TYPE_LABEL[l.type].toUpperCase();
  hudBanner({type:l.type,name:l.name,meta,xp,clean,rare:l.rare,rankUp:res.rankUp?res.rank.name:null,charterLeft:mission.charter?charterTargets().filter(t=>!mission.discovered.has(t.id)).length:null});
  hudCharterUpdate();
}

// ---------------------------------------------------------------- landings
function siteAt(x,z){
  if(onRunway(x,z))return {kind:'runway',name:'Home Field',halfW:RUNWAY_HALF_W,cos:0,sin:1,x:0,z:0};
  const s=terrain.stripAt(x,z,6);if(s)return {kind:'strip',name:s.name,halfW:s.halfW,cos:s.cos,sin:s.sin,x:s.x,z:s.z,ref:s};
  if(AIRCRAFT[aircraftState.variant].floats&&isWaterAt(x,z)){
    // Floatplane: lakes are landing sites. Name the water after the nearest charted lake.
    const lake=mission.landmarks.filter(l=>l.type==='lake'||l.type==='crater'||l.type==='stacks').sort((p,q)=>Math.hypot(p.x-x,p.z-z)-Math.hypot(q.x-x,q.z-z))[0];
    const near=lake&&Math.hypot(lake.x-x,lake.z-z)<2500;
    return {kind:'water',name:near&&mission.discovered.has(lake.id)?lake.name:'Open water',halfW:60,cos:0,sin:1,x,z,ref:{x,z,h:0,water:true,name:near?lake.name:'open water'}};
  }
  return {kind:'field',name:'Open field'};
}
function trackLanding(dt){
  const a=aircraft,onGround=a.altAGL<aircraftGroundOffset+.25;
  mission.vyWindow.push(a.verticalSpeed);if(mission.vyWindow.length>20)mission.vyWindow.shift();
  if(!onGround){mission.airborneT+=dt;if(mission.airborneT>.8)mission.airborne=true;return;}
  if(mission.airborne){
    // touchdown: worst sink rate over the last ~0.3 s (contact zeroes vertical speed)
    const sink=Math.max(0,-Math.min(...mission.vyWindow));
    const site=siteAt(a.position.x,a.position.z);
    let offset=0,headingErr=0;
    if(site.kind!=='field'){
      const dx=a.position.x-site.x,dz=a.position.z-site.z;offset=Math.abs(-dx*site.sin+dz*site.cos);
      const fx=-Math.sin(a.yaw),fz=-Math.cos(a.yaw),al=Math.abs(fx*site.cos+fz*site.sin);headingErr=Math.acos(clamp(al,0,1))/DEG;
    }
    if(mission.touchdown&&performance.now()-mission.touchdown.t<4000){mission.bounces++;mission.touchdown.sink=Math.max(mission.touchdown.sink,sink);}
    else{mission.bounces=0;mission.touchdown={sink,offset,headingErr,site,t:performance.now()};}
    sfx.touchdown(sink,site.kind);haptic.touchdown(sink,site.kind);
    mission.airborne=false;
  }
  mission.airborneT=0;
  const td=mission.touchdown;
  // stopped = ground speed (airspeed includes the wind)
  if(td&&!td.done&&Math.hypot(a.velocity.x,a.velocity.z)<2.5){
    // Where the aircraft comes to rest decides the site; the touchdown itself decides the grade.
    td.done=true;const rest=siteAt(a.position.x,a.position.z);
    if(td.site.kind==='field'&&rest.kind!=='field'){td.site=rest;td.offset=0;td.headingErr=0;td.shortTouchdown=true;}
    landed(td);
  }
}
function gradeLanding(td){
  const s=td.sink;let i=s<=.9?0:s<=1.6?1:s<=2.6?2:s<=4?3:4;
  if(td.site.kind==='strip'||td.site.kind==='runway'){if(td.offset>td.site.halfW*.55)i++;if(td.headingErr>10)i++;if(td.shortTouchdown)i++;}
  i+=Math.min(2,mission.bounces);
  if(td.site.kind==='field')i=Math.max(i,3);
  return ['S','A','B','C','D'][Math.min(4,i)];
}
function recordLandingOnly(){}
function landed(td){
  const grade=gradeLanding(td);recordLanding(grade);
  const proper=td.site.kind!=='field';if(td.site.kind==='water')achEvent('splashdown');mission.lastLandingT=performance.now();mission.lastLandingProper=proper;
  if(proper)mission.respawn=td.site.kind==='runway'?null:td.site.ref;
  const fpm=Math.round(td.sink*196.85);
  const label=td.site.kind==='field'?'BUSH LANDING':{S:'BUTTER',A:'SMOOTH',B:'GOOD',C:'FIRM',D:'HARD'}[grade];
  if(mission.mode==='cargo'&&mission.job&&proper&&Math.hypot(td.site.x-mission.job.to.x,td.site.z-mission.job.to.z)<(td.site.kind==='water'?2500:900)){recordLandingOnly(grade);radioEvent('landed',{grade,kind:td.site.kind});completeJob(td,grade);hudCharterUpdate();return;}
  let xp=proper?{S:60,A:40,B:25,C:12,D:5}[grade]:20;
  const alightOk=!mission.charter?.water||(td.site.kind==='water'&&(()=>{const l=landmarkById(mission.charter.alight);return l&&Math.hypot(td.site.x-l.x,td.site.z-l.z)<Math.max(1500,(l.r||0)*1.4,Math.sqrt(l.area||0)*1000);})());
  if(mission.charter&&!mission.complete&&charterSurveyed()&&proper&&alightOk){
    mission.complete=true;
    const bonus=mission.bonusLost?0:{S:150,A:100,B:60,C:30,D:10}[grade];
    const total=Math.round((200+bonus)*(mission.hardcore?1.5:1));const res=addXP(total+xp);
    progress.pilot.charters++;if(mission.hardcore)achEvent('hardcore');if(mission.mode==='daily')achEvent('daily');const entry=worldEntry(WORLD_SEED);if(!entry.charters.includes(mission.charter.id))entry.charters.push(mission.charter.id);
    const time=mission.flightTime;
    let share=null;
    if(mission.mode==='daily'){
      const r={grade,time:Math.round(time),found:mission.charter.ids.length,bonusLost:mission.bonusLost};
      const prev=progress.daily[DAILY_NUMBER];
      if(!prev||r.time<prev.time){r.ghost=mission.rec.slice(0,30000);progress.daily[DAILY_NUMBER]=r;}
      share=`SKYBOUND Daily Charter #${DAILY_NUMBER} · ${r.found}/${r.found} charted · landing ${grade} · ${fmtTime(time)}${mission.bonusLost?' · 1 crash':''}`;
    }
    saveProgress();
    radioEvent('landed',{grade,kind:td.site.kind,charterComplete:true,rankUp:res.rankUp?res.rank.index:null});if(res.rankUp)sfx.fanfare();
    hudCharterComplete({grade,label,fpm,site:td.site.name,time,xp:total+xp,bonusLost:mission.bonusLost,rankUp:res.rankUp?res.rank.name:null,share});
  }else{
    const res=addXP(xp);
    radioEvent('landed',{grade,kind:td.site.kind,rankUp:res.rankUp?res.rank.index:null});if(res.rankUp)sfx.fanfare();
    hudLanding({grade,label,fpm,site:td.site.name,xp,rankUp:res.rankUp?res.rank.name:null,hint:mission.charter&&!mission.complete&&charterSurveyed()&&!alightOk?`Alight on ${landmarkById(mission.charter.alight)?.name} to file this charter`:mission.charter&&!mission.complete&&charterSurveyed()&&!proper?'Charters complete at a strip or the home field':null});
  }
  hudCharterUpdate();
}
export function fmtTime(s){s=Math.round(s);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}

export function onCrash(){
  if(mission.charter&&!mission.complete&&!mission.bonusLost){mission.bonusLost=true;}
  mission.touchdown=null;mission.airborne=false;
}
// Where the aircraft restarts: the last strip it landed on, otherwise the home runway.
export function respawnPoint(offset){
  const s=mission.respawn;
  if(!s)return {x:0,y:AIRPORT_H+.06+offset,z:START_Z,yaw:0};
  if(s.water)return {x:s.x,y:offset+.05,z:s.z,yaw:aircraft.yaw};
  const u=-s.halfL+45;
  return {x:s.x+s.cos*u,y:s.h+offset+.05,z:s.z+s.sin*u,yaw:Math.atan2(-s.cos,-s.sin)};
}
export { rankInfo };

// ---------------------------------------------------------------- Bush Pilot cargo jobs
const CARGO=[
  {id:'medical',name:'Medical supplies',kg:[60,180],rate:1.6,timed:true},
  {id:'mail',name:'Mail & parcels',kg:[80,220],rate:1.0},
  {id:'fuel',name:'Fuel drums',kg:[300,520],rate:1.25},
  {id:'crew',name:'Survey crew',kg:[160,300],rate:1.15},
  {id:'supplies',name:'Fresh supplies',kg:[120,340],rate:1.05}
];
function cargoSites(){
  const s=[{key:'home',name:'Home Field',x:0,z:0,kind:'runway'}];
  for(const t of mission.strips)s.push({key:`s${t.id}`,name:t.name,x:t.x,z:t.z,kind:'strip'});
  if(AIRCRAFT[aircraftState.variant].floats)for(const l of mission.landmarks)if((l.type==='lake'||l.type==='crater')&&mission.discovered.has(l.id))s.push({key:`w${l.id}`,name:l.name,x:l.x,z:l.z,kind:'water'});
  return s;
}
let jobSerial=0;
export function generateJobs(fromKey='home'){
  const sites=cargoSites(),from=sites.find(s=>s.key===fromKey)||sites[0],r=terrain.mulberry32((WORLD_SEED*31+(++jobSerial)*7919)>>>0);
  const dests=sites.filter(s=>s.key!==from.key).sort(()=>r()-.5);
  const jobs=[];
  for(let i=0;i<3&&dests.length;i++){
    const to=dests[i%dests.length],c=CARGO[Math.floor(r()*CARGO.length)],kg=Math.round((c.kg[0]+r()*(c.kg[1]-c.kg[0]))/10)*10;
    const dist=Math.hypot(to.x-from.x,to.z-from.z),dir=['N','NE','E','SE','S','SW','W','NW'][Math.round(bearingOf(to.x-from.x,to.z-from.z)/45)%8];
    jobs.push({id:jobSerial*10+i,cargo:c.name,cargoId:c.id,kg,from,to,dist,dir,pay:Math.round((90+dist/1000*38+kg*.22)*c.rate/5)*5,limit:c.timed?Math.round(dist/44*1.5+75):null});
  }
  return jobs;
}
export function acceptJob(job){
  mission.job={...job,start:mission.flightTime};radioEvent('job',{cargoId:job.cargoId});mission.cargoKg=job.kg;mission.complete=false;hudCharterUpdate();
}
function completeJob(td,grade){
  const j=mission.job,elapsed=mission.flightTime-j.start,late=j.limit&&elapsed>j.limit;
  const gradeMul={S:1.3,A:1.15,B:1,C:.9,D:.75}[grade],timeBonus=j.limit&&!late?Math.round(j.pay*.25/5)*5:0;
  const pay=Math.round(j.pay*gradeMul*(late?.6:1)/5)*5+timeBonus,xp=Math.round(pay/3);
  progress.pilot.cash=(progress.pilot.cash||0)+pay;progress.pilot.deliveries=(progress.pilot.deliveries||0)+1;
  const res=addXP(xp);saveProgress();
  if(j.cargoId==='medical'&&j.limit&&!late)achEvent('lifesaver');
  radioEvent('delivered',{late,rankUp:res.rankUp?res.rank.index:null});sfx.cash();if(res.rankUp)sfx.fanfare();
  mission.job=null;mission.cargoKg=0;
  const next=generateJobs(td.site.kind==='runway'?'home':td.site.kind==='strip'?`s${td.site.ref.id}`:`w${td.site.ref?.id}`);
  hudEvents.jobBoard?.({delivered:{...j,elapsed,late,pay,timeBonus,grade,xp,rankUp:res.rankUp?res.rank.name:null},jobs:next});
}
