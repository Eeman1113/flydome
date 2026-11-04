// SKYBOUND · survey — FIRST CHARTER gameplay.
// Each world is scanned for real landmarks; charters ask the pilot to survey three of them
// and land at any strip. Discoveries persist; crashes only cost the charter's landing bonus.
import { DEG, clamp } from './util.js';
import { AIRPORT_H, terrain } from './world.js';
import { DAILY_NUMBER, IS_DAILY, RUNWAY_HALF_L, RUNWAY_HALF_W, START_Z, WORLD_SEED, aircraft, state } from './config.js';
import { onRunway, worldScan } from './chunks.js';
import { aircraftGroundOffset } from './engine.js';
import { addXP, markWorldFlown, progress, rankInfo, recordLanding, saveProgress, worldEntry } from './progress.js';
import { TYPE_LABEL } from './icons.js';
import { hudBanner, hudLanding, hudCharterComplete, hudCharterUpdate, hudRevealTick } from './hud.js';

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
  mission.charters=buildCharters(mission.landmarks);
  mission.ready=true;saveProgress();
  return mission;
}

function envelope(l){
  const areaR=Math.sqrt(Math.max(l.area,.05))*1000*.5;
  switch(l.type){
    case 'peak':return {r:650,minAlt:l.y+15,maxAlt:l.y+650,hint:'Pass within 650 m of the summit'};
    case 'lake':return {r:Math.max(450,areaR),maxAGL:220,hint:'Fly low over the water, below 220 m'};
    case 'island':return {r:Math.max(420,areaR+150),maxAGL:260,hint:'Overfly the island below 260 m'};
    case 'forest':return {r:750,maxAGL:220,hint:'Skim the canopy, below 220 m'};
    case 'river':return {r:480,maxAGL:180,hint:'Follow the river below 180 m'};
    case 'pass':return {r:520,maxAlt:l.y+260,hint:'Thread the pass, under 260 m above the saddle'};
  }
  return {r:600,maxAGL:300,hint:'Overfly it'};
}

// ---------------------------------------------------------------- charters
const DIRS=['Northern','North-Eastern','Eastern','South-Eastern','Southern','South-Western','Western','North-Western'];
const THEME={peak:'Highlands',pass:'Highlands',lake:'Waters',river:'Waters',island:'Coast',forest:'Wilds'};
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
  // drop duplicates (same landmark set)
  const seen=new Set();return out.filter(c=>{const k=[...c.ids].sort().join(',');if(seen.has(k))return false;seen.add(k);return true;});
}
export function dailyCharter(){return mission.charters[mission.charters.length>1?1:0];}

// ---------------------------------------------------------------- flow
export function beginMission(mode,charterIndex=0){
  mission.mode=mode;mission.complete=false;mission.bonusLost=false;
  mission.charter=mode==='free'?null:(mode==='daily'?dailyCharter():mission.charters[charterIndex])||null;
  mission.charterStart=performance.now();mission.flightTime=0;mission.track=[];
  mission.respawn=null;mission.touchdown=null;mission.airborne=false;mission.airborneT=0;
  markWorldFlown(WORLD_SEED,{daily:IS_DAILY});
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
  mission.trackTimer+=dt;
  if(mission.trackTimer>1.2){mission.trackTimer=0;mission.track.push([p.x,p.z]);if(mission.track.length>1500)mission.track.shift();hudRevealTick(p.x,p.z);}
  // survey envelopes
  let best=null;
  for(const l of mission.landmarks){
    if(mission.discovered.has(l.id)){l.hold=0;continue;}
    const d=Math.hypot(p.x-l.x,p.z-l.z),e=l.env;
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
  trackLanding(dt);
}

function discover(l,clean){
  mission.discovered.add(l.id);
  const entry=worldEntry(WORLD_SEED);if(!entry.discovered.includes(l.id))entry.discovered.push(l.id);
  const pl=progress.pilot;pl.discoveries++;pl.stamps[l.type]=(pl.stamps[l.type]||0)+1;if(l.rare)pl.stamps.rare=(pl.stamps.rare||0)+1;
  const xp=80+(l.rare?60:0)+(l.highest?40:0)+(clean?30:0);
  const res=addXP(xp);
  const meta=l.type==='peak'||l.type==='pass'?`${l.highest?'HIGHEST PEAK':TYPE_LABEL[l.type].toUpperCase()} · ${Math.round(l.elev).toLocaleString()} M`:l.area?`${TYPE_LABEL[l.type].toUpperCase()} · ${l.area.toFixed(1)} KM²`:TYPE_LABEL[l.type].toUpperCase();
  hudBanner({type:l.type,name:l.name,meta,xp,clean,rare:l.rare,rankUp:res.rankUp?res.rank.name:null,charterLeft:mission.charter?charterTargets().filter(t=>!mission.discovered.has(t.id)).length:null});
  hudCharterUpdate();
}

// ---------------------------------------------------------------- landings
function siteAt(x,z){
  if(onRunway(x,z))return {kind:'runway',name:'Home Field',halfW:RUNWAY_HALF_W,cos:0,sin:1,x:0,z:0};
  const s=terrain.stripAt(x,z,6);if(s)return {kind:'strip',name:s.name,halfW:s.halfW,cos:s.cos,sin:s.sin,x:s.x,z:s.z,ref:s};
  return {kind:'field',name:'Open field'};
}
function trackLanding(dt){
  const a=aircraft,onGround=a.altAGL<aircraftGroundOffset+.25;
  mission.vyWindow.push(a.verticalSpeed);if(mission.vyWindow.length>20)mission.vyWindow.shift();
  if(!onGround){mission.airborneT+=dt;if(mission.airborneT>1.5)mission.airborne=true;return;}
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
    mission.airborne=false;
  }
  mission.airborneT=0;
  const td=mission.touchdown;
  if(td&&!td.done&&a.airspeed<4){
    // Where the aircraft comes to rest decides the site; the touchdown itself decides the grade.
    td.done=true;const rest=siteAt(a.position.x,a.position.z);
    if(td.site.kind==='field'&&rest.kind!=='field'){td.site=rest;td.offset=0;td.headingErr=0;td.shortTouchdown=true;}
    landed(td);
  }
}
function gradeLanding(td){
  const s=td.sink;let i=s<=.9?0:s<=1.6?1:s<=2.6?2:s<=4?3:4;
  if(td.site.kind!=='field'){if(td.offset>td.site.halfW*.55)i++;if(td.headingErr>10)i++;if(td.shortTouchdown)i++;}
  i+=Math.min(2,mission.bounces);
  if(td.site.kind==='field')i=Math.max(i,3);
  return ['S','A','B','C','D'][Math.min(4,i)];
}
function landed(td){
  const grade=gradeLanding(td);recordLanding(grade);
  const proper=td.site.kind!=='field';
  if(proper)mission.respawn=td.site.kind==='runway'?null:td.site.ref;
  const fpm=Math.round(td.sink*196.85);
  const label=td.site.kind==='field'?'BUSH LANDING':{S:'BUTTER',A:'SMOOTH',B:'GOOD',C:'FIRM',D:'HARD'}[grade];
  let xp=proper?{S:60,A:40,B:25,C:12,D:5}[grade]:20;
  if(mission.charter&&!mission.complete&&charterSurveyed()&&proper){
    mission.complete=true;
    const bonus=mission.bonusLost?0:{S:150,A:100,B:60,C:30,D:10}[grade];
    const total=200+bonus;const res=addXP(total+xp);
    progress.pilot.charters++;const entry=worldEntry(WORLD_SEED);if(!entry.charters.includes(mission.charter.id))entry.charters.push(mission.charter.id);
    const time=mission.flightTime;
    let share=null;
    if(mission.mode==='daily'){
      const r={grade,time:Math.round(time),found:mission.charter.ids.length,bonusLost:mission.bonusLost};
      const prev=progress.daily[DAILY_NUMBER];
      if(!prev||['S','A','B','C','D'].indexOf(grade)<['S','A','B','C','D'].indexOf(prev.grade)||(prev.grade===grade&&r.time<prev.time))progress.daily[DAILY_NUMBER]=r;
      share=`SKYBOUND Daily Charter #${DAILY_NUMBER} · ${r.found}/${r.found} charted · landing ${grade} · ${fmtTime(time)}${mission.bonusLost?' · 1 crash':''}`;
    }
    saveProgress();
    hudCharterComplete({grade,label,fpm,site:td.site.name,time,xp:total+xp,bonusLost:mission.bonusLost,rankUp:res.rankUp?res.rank.name:null,share});
  }else{
    const res=addXP(xp);
    hudLanding({grade,label,fpm,site:td.site.name,xp,rankUp:res.rankUp?res.rank.name:null,hint:mission.charter&&!mission.complete&&charterSurveyed()&&!proper?'Charters complete at a strip or the home field':null});
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
  const u=-s.halfL+45;
  return {x:s.x+s.cos*u,y:s.h+offset+.05,z:s.z+s.sin*u,yaw:Math.atan2(-s.cos,-s.sin)};
}
export { rankInfo };
