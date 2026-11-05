// SKYBOUND · coach: the landing-coach network (tools/ml/train_coach.py). On final it predicts the landing grade
// you are heading for and, for each of 7 corrections (hold, power ±, nose ±, left/right), the grade that
// correction would give. If one is clearly better, Skybound Ground says it. Plain-JS MLP, ~20k MACs per call.
import { BASE_PATH, aircraft, state, AIRCRAFT, aircraftState } from './config.js';
import { aircraftGroundOffset } from './engine.js';
import { $ } from './util.js';

const DEG=Math.PI/180;let NET=null,loading=null;
export function loadCoach(){
  if(loading)return loading;
  loading=fetch(`${BASE_PATH}/models/coach.json`).then(r=>r.ok?r.json():null).then(j=>{
    if(!j)return;NET={j,mean:Float32Array.from(j.mean),std:Float32Array.from(j.std),
      layers:j.layers.map(l=>({W:Float32Array.from(l.w.flat()),b:Float32Array.from(l.b),out:l.b.length,inp:l.w[0].length}))};
    NET.buf=NET.layers.map(l=>new Float32Array(l.out));NET.x=new Float32Array(j.feat);
  }).catch(()=>{});
  return loading;
}
export function coachReady(){return !!NET;}
// true while the coach has spoken recently (the radio's generic high/low/fast calls stay quiet meanwhile)
export function coachActive(){return !!NET&&performance.now()/1000-lastAdviceT<12;}
function forward(f){
  const n=NET,x=n.x;for(let i=0;i<x.length;i++)x[i]=(f[i]-n.mean[i])/n.std[i];
  let inp=x;n.layers.forEach((l,L)=>{const o=n.buf[L],last=L===n.layers.length-1;
    for(let j=0;j<l.out;j++){let s=l.b[j];const r=j*l.inp;for(let i=0;i<l.inp;i++)s+=l.W[r+i]*inp[i];o[j]=last?s:Math.tanh(s);}inp=o;});
  return inp;   // K×6: grade, sink, offset fraction, heading err, bounces, logit(off/crash)
}
const F=new Float32Array(21);
// Features exactly as coach_features() in training; `site` is the runway being approached.
function features(site){
  const a=aircraft,c=Math.cos(site.yaw),sn=Math.sin(site.yaw),dx=a.position.x-site.x,dz=a.position.z-site.z;
  const lx=dx*c-dz*sn,lz=dx*sn+dz*c,along=lz-(site.halfL-150),cross=lx;
  const alt=a.altAGL-aircraftGroundOffset;
  const gsd=(a.position.y-site.h-aircraftGroundOffset)-Math.max(0,along)*Math.tan(3*DEG);
  let rh=a.yaw-site.yaw;while(rh>Math.PI)rh-=2*Math.PI;while(rh<-Math.PI)rh+=2*Math.PI;
  const w=state.wind,fx=-Math.sin(a.yaw),fz=-Math.cos(a.yaw),hw=-(w.x*fx+w.z*fz),xw=w.x*Math.cos(a.yaw)-w.z*Math.sin(a.yaw);
  const V=AIRCRAFT[aircraftState.variant],v=V.jet?2:V.floats?1:0,cl=(x,lo,hi)=>x<lo?lo:x>hi?hi:x;
  const vals=[a.airspeed/50,a.verticalSpeed/10,a.pitch*2,Math.sin(a.roll),Math.cos(a.roll),a.enginePower,cl(alt/100,0,4),cl(along/2000,-1,2),cl(cross/50,-4,4),cl(gsd/30,-4,4),
    Math.sin(rh),Math.cos(rh),hw/10,xw/10,v===0?1:0,v===1?1:0,v===2?1:0,site.halfW/22,state.stallSim?0:1,a.pitchRate,a.rollRate];
  for(let i=0;i<21;i++)F[i]=vals[i];return {along,alt,cross,gsd,rh,kt:a.airspeed*1.944};
}
// The network learned from an AI pilot's approaches, so it inherits that pilot's habits (e.g. it favours
// "left"). Only corrections that point the right way for the player's actual state may be spoken.
const ok=new Array(7);
function plausible({alt,cross,gsd,rh,kt}){
  const fast=kt>85,slow=kt<60,high=gsd>6,low=gsd<-6,lat=cross-100*Math.sin(rh);   // lat: where you'll be in ~3 s (+ = right)
  ok[0]=true;ok[1]=low||slow;ok[2]=high||fast;ok[3]=alt<10||(low&&!slow);ok[4]=alt>10&&high&&!fast;ok[5]=lat>4;ok[6]=lat<-4;
  return ok;
}
// rule of thumb, most important first: height (power if fast or low, else pitch), then speed, then centreline
function ruleFix({alt,cross,gsd,rh,kt}){
  const lat=cross-100*Math.sin(rh);
  if(gsd>12)return kt>85?2:4; if(gsd<-10)return 1;
  if(kt>88)return 2; if(kt<58&&alt>10)return 4;
  if(lat>8)return 5; if(lat<-8)return 6;
  return 0;
}
const LETTER=['S','A','B','C','D','OFF','CRASH'];
let t=0,lastAdvice='',lastAdviceT=0,lastGoodT=0;
// approach: {site:{x,z,yaw,halfL,halfW,h}} from the HUD's approach guide, or null. say(group) queues a radio call.
export function updateCoach(dt,approach,say){
  const chip=$('apCoach');
  if(!NET||!approach||!state.started||state.paused||state.crashed){if(chip)chip.textContent='';return;}
  t-=dt;if(t>0)return;t=1;
  const f=features(approach.site),{along,alt}=f;
  if(along>2300||alt<2.5){if(chip)chip.textContent='';return;}
  const out=forward(F),K=7,g=k=>out[k*6];
  const hold=g(0),ok=plausible(f);let best=0;for(let k=1;k<K;k++)if(ok[k]&&g(k)<g(best))best=k;
  // poor approach but the network sees no sensible fix: fall back to the instructor's rule of thumb
  let rule=false;
  if(best===0&&hold>=2.5){const r=ruleFix(f);if(r){best=r;rule=true;}}
  const pred=Math.max(0,Math.min(6,Math.round(hold)));
  if(chip){chip.textContent=`PREDICTED ${LETTER[pred]}`;chip.dataset.g=LETTER[pred];}
  const now=performance.now()/1000,name=NET.j.corr[best];
  // speak when a correction clearly helps, or on a poor approach (C or worse) when any sensible one helps at all
  if(best!==0&&(rule||hold-g(best)>.35||(hold>=2.5&&hold-g(best)>.05))&&(name!==lastAdvice||now-lastAdviceT>7)&&now-lastAdviceT>4.5){
    lastAdvice=name;lastAdviceT=now;say(`coach_${name}`);
  }else if(best===0&&hold<1.3&&along<1500&&now-lastGoodT>25&&now-lastAdviceT>6){lastGoodT=now;say('coach_good');}
}
