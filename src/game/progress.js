// SKYBOUND · progress
// Pilot logbook persisted in localStorage. Worlds are disposable; the pilot carries over.
const KEY='skybound.v1';
export const RANKS=[[0,'Student Pilot'],[400,'Private Pilot'],[1200,'Bush Pilot'],[2600,'Survey Pilot'],[5000,'Senior Surveyor'],[9000,'Chief Cartographer']];
export const GRADES=['S','A','B','C','D'];

function fresh(){
  return {schema:1,pilot:{xp:0,flightTime:0,landings:0,grades:{S:0,A:0,B:0,C:0,D:0},best:null,discoveries:0,charters:0,worlds:0,stamps:{}},lastWorld:null,worldLog:{},daily:{}};
}
function load(){
  try{
    const d=JSON.parse(localStorage.getItem(KEY)||'null');
    if(d&&d.schema===1){const f=fresh();return {...f,...d,pilot:{...f.pilot,...d.pilot,grades:{...f.pilot.grades,...(d.pilot?.grades||{})}}};}
  }catch{}
  return fresh();
}
export const progress=load();
// The world the pilot flew most recently before this page load (offered as "Resume last world").
export const previousWorld=progress.lastWorld;

export function saveProgress(){try{localStorage.setItem(KEY,JSON.stringify(progress));}catch{}}

export function rankInfo(xp=progress.pilot.xp){
  let i=0;while(i<RANKS.length-1&&xp>=RANKS[i+1][0])i++;
  const floor=RANKS[i][0],next=RANKS[i+1]?.[0]??null;
  return {index:i,name:RANKS[i][1],floor,next,pct:next?(xp-floor)/(next-floor):1};
}
export function addXP(n){
  const before=rankInfo().index;progress.pilot.xp+=Math.round(n);saveProgress();
  const after=rankInfo();return {rankUp:after.index>before,rank:after};
}
// Per-world logs are keyed by generator version so old saves never mark the wrong landmarks.
const GEN='g2';
export function worldEntry(seed){
  seed=`${seed}:${GEN}`;const log=progress.worldLog;
  if(!log[seed]){
    log[seed]={discovered:[],charters:[],ts:Date.now()};
    const keys=Object.keys(log).sort((a,b)=>log[b].ts-log[a].ts);
    for(const k of keys.slice(25))delete log[k];
  }
  log[seed].ts=Date.now();
  return log[seed];
}
export function markWorldFlown(seed,meta){
  const isNew=!progress.lastWorld||progress.lastWorld.seed!==seed;
  if(isNew&&!progress.worldLog[`${seed}:${GEN}`]?.flown)progress.pilot.worlds++;
  progress.lastWorld={seed,ts:Date.now(),...meta};
  worldEntry(seed).flown=true;saveProgress();
}
export function recordLanding(grade){
  const p=progress.pilot;p.landings++;if(p.grades[grade]!=null)p.grades[grade]++;
  if(!p.best||GRADES.indexOf(grade)<GRADES.indexOf(p.best))p.best=grade;saveProgress();
}
export function averageGrade(){
  const g=progress.pilot.grades;let n=0,s=0;GRADES.forEach((k,i)=>{n+=g[k];s+=g[k]*i;});
  return n?GRADES[Math.round(s/n)]:'—';
}
