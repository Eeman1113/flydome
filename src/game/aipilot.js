// SKYBOUND · aipilot: runs the PPO-trained pilot network (tools/ml/train_pilot.py) in plain JS.
// No ML runtime: a 32→128→128→4 tanh MLP is ~21k multiply-adds per decision at 10 Hz, so dozens of AI
// aircraft cost well under a millisecond. Observations are built exactly as in training.
import { BASE_PATH } from './config.js';

const DEG=Math.PI/180;
let NET=null,loading=null;
export function loadPilot(){
  if(loading)return loading;
  loading=fetch(`${BASE_PATH}/models/pilot.json`).then(r=>r.ok?r.json():null).then(j=>{
    if(!j)return null;
    NET={mean:Float32Array.from(j.obs_mean),std:Float32Array.from(j.obs_std),layers:j.layers.map(l=>({W:Float32Array.from(l.w.flat()),b:Float32Array.from(l.b),out:l.b.length,inp:l.w[0].length}))};
    NET.buf=NET.layers.map(l=>new Float32Array(l.out));NET.x=new Float32Array(j.obs);return NET;
  }).catch(()=>null);
  return loading;
}
export function pilotReady(){return !!NET;}
// Deterministic policy: mean action, tanh hidden layers, linear output, clipped to [-1,1].
export function act(obs,out){
  const n=NET,x=n.x;for(let i=0;i<x.length;i++){const v=(obs[i]-n.mean[i])/n.std[i];x[i]=v<-8?-8:v>8?8:v;}
  let inp=x;
  for(let L=0;L<n.layers.length;L++){const l=n.layers[L],o=n.buf[L],last=L===n.layers.length-1;
    for(let j=0;j<l.out;j++){let s=l.b[j];const row=j*l.inp;for(let i=0;i<l.inp;i++)s+=l.W[row+i]*inp[i];o[j]=last?(s<-1?-1:s>1?1:s):Math.tanh(s);}
    inp=o;}
  out.pitch=inp[0];out.roll=inp[1];out.yaw=inp[2];out.throttle=(inp[3]+1)/2;return out;
}
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};
const cl=(v,a,b)=>v<a?a:v>b?b:v;
// Build the 32 training observations. task: 0 navigate, 1 land, 2 takeoff.
// For runway tasks, `rw` is the runway in its own frame: {x,z,cos,sin,halfL,halfW,h} where landing runs toward
// local -u (yaw = rwyYaw). Positions are converted to the training frame (runway along z, landing toward -z).
export function buildObs(s,o,{task,variant,ground,contact,wind,hdgT=0,altT=300,spdT=50,rw=null,touched=false}){
  const yaw=s.yaw,fwdx=-Math.sin(yaw),fwdz=-Math.cos(yaw);
  const hw=-(wind[0]*fwdx+wind[1]*fwdz),xw=wind[0]*Math.cos(yaw)-wind[1]*Math.sin(yaw);
  const altG=s.y-ground;
  const nav=task===0?1:0,land=task===1?1:0,tko=task===2?1:0,guide=land+tko;
  let along=0,cross=0,gsd=0,rh=0,onRwy=0,hwid=0;
  if(rw){
    // runway frame: training runway points along -z for landing; rotate world into it
    const dx=s.x-rw.x,dz=s.z-rw.z,c=Math.cos(rw.yaw),sn=Math.sin(rw.yaw);
    const lx=dx*c-dz*sn,lz=dx*sn+dz*c;           // rotate by +yaw so the landing direction becomes -z
    const aim=rw.halfL-150;along=lz-aim;cross=lx;
    gsd=(s.y-rw.h-contact)-Math.max(0,along)*Math.tan(3*DEG);rh=wrap(yaw-rw.yaw);
    onRwy=Math.abs(lx)<rw.halfW&&Math.abs(lz)<rw.halfL?1:0;hwid=rw.halfW/22;
  }
  const he=wrap(hdgT-yaw),ae=cl((altT-altG)/200,-3,3),se=cl((spdT-s.airspeed)/20,-3,3);
  let i=0;const P=v=>{o[i++]=v;};
  P(s.airspeed/50);P(s.vy/10);P(s.pitch*2);P(Math.sin(s.roll));P(Math.cos(s.roll));P(s.pr);P(s.rr);P(s.yr);P(s.power);P(s.ab);P(s.onGround?1:0);
  P(cl(altG/300,0,4));P(variant===0?1:0);P(variant===1?1:0);P(variant===2?1:0);P(hw/10);P(xw/10);
  P(nav);P(land);P(tko);
  P(Math.sin(he)*nav);P(Math.cos(he)*nav);P(ae*nav);P(se*nav);
  P(cl(along/2000,-1,4)*guide);P(cl(cross/200,-3,3)*guide);P(cl(gsd/50,-3,3)*land);P(Math.sin(rh)*guide);P(Math.cos(rh)*guide);
  P(onRwy*guide);P(touched?1:0);P(hwid*guide);
  return {along,cross,gsd,rh,onRwy};
}
