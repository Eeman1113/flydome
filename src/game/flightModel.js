// SKYBOUND · flightModel: a pure, allocation-free copy of the game's flight dynamics (physics.js),
// used by AI aircraft and mirrored exactly in tools/ml/fm.py for training. Same equations,
// constants and order of operations; no globals, so any number of aircraft can be stepped.
//
// state s: {x,y,z, vx,vy,vz, pitch,yaw,roll, pr,rr,yr, cp,cr,cy, power, ab, onGround}
// ctrl  c: {pitch,roll,yaw in [-1,1], throttle in [0,1]}
// params P: {rollRate,pitchRate,thrust,cdMul,ab,jet, stall(bool), forgiving(bool), mass, rollStability, response}
// env   E: {ground(x,z)->y, paved(x,z)->bool, wind:[wx,wz], contact}
const DEG=Math.PI/180,MASS=1250,AREA=16.2,THRUST=3850;
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};
export const DEFAULT_PARAMS={rollRate:62,pitchRate:31,thrust:1,cdMul:1,ab:0,jet:false,stall:true,forgiving:false,mass:MASS,rollStability:.22,response:1};

// three.js Euler(pitch, yaw, -roll, 'YXZ') basis vectors, written out.
function basis(p,y,r,o){
  const ca=Math.cos(p),sa=Math.sin(p),cb=Math.cos(y),sb=Math.sin(y),cg=Math.cos(-r),sg=Math.sin(-r);
  o.fx=-sb*ca;o.fy=sa;o.fz=-cb*ca;                                   // forward (0,0,-1)
  o.ux=-cb*sg+sb*sa*cg;o.uy=ca*cg;o.uz=sb*sg+cb*sa*cg;                // up (0,1,0)
  o.rx=cb*cg+sb*sa*sg;o.ry=ca*sg;o.rz=-sb*cg+cb*sa*sg;                // right (1,0,0)
  return o;
}
const B={};
export function newState(x=0,y=0,z=0,yaw=0){return {x,y,z,vx:0,vy:0,vz:0,pitch:0,yaw,roll:0,pr:0,rr:0,yr:0,cp:0,cr:0,cy:0,power:0,ab:0,onGround:true,airspeed:0,alt:0,crashed:false};}

export function stepFM(s,c,P,E,dt){
  if(s.crashed)return s;
  const jet=P.jet,forgiving=P.forgiving,wf=forgiving?.5:1,wx=E.wind[0]*wf,wz=E.wind[1]*wf;
  const g0=E.ground(s.x,s.z),contact=E.contact,wasOnGround=s.y<=g0+contact+.35;
  const resp=P.response||1,blend=1-Math.exp(-dt/(.105/Math.max(.45,resp)));
  s.cp=lerp(s.cp,c.pitch,blend);s.cr=lerp(s.cr,c.roll,blend);s.cy=lerp(s.cy,c.yaw,blend);
  basis(s.pitch,s.yaw,s.roll,B);
  let ax=s.vx-wx,ay=s.vy,az=s.vz-wz;
  const airspeed=Math.max(.05,Math.hypot(ax,ay,az));
  const authority=clamp(.28+airspeed/34,.28,1.12)*(wasOnGround?.62:1);
  const preSlip=Math.atan2(ax*B.rx+ay*B.ry+az*B.rz,Math.max(airspeed,.1));
  const pitchRateT=s.cp*(P.pitchRate*DEG)*authority,bankLimit=65*DEG;
  const rollRateT=s.cr*(P.rollRate*DEG)*authority-(wasOnGround?0:Math.sin(s.roll)*P.rollStability*.34);
  const coord=(!wasOnGround&&airspeed>7)?-9.81*Math.tan(clamp(s.roll,-bankLimit,bankLimit))*Math.max(Math.cos(s.roll),0)/Math.max(airspeed,12):0;
  const rudAuth=wasOnGround?clamp(airspeed/10,0,1):clamp(airspeed/24,.25,1.15);
  const slipDamp=wasOnGround?0:clamp(-preSlip*.9,-.18,.18);
  const yawRateT=wasOnGround?s.cy*.16*rudAuth:coord+s.cy*(22*DEG)*rudAuth+slipDamp;
  s.pr=lerp(s.pr,pitchRateT,1-Math.exp(-dt*6.2*Math.max(.65,resp)));
  s.rr=lerp(s.rr,rollRateT,1-Math.exp(-dt*7.2*Math.max(.65,resp)));
  s.yr=lerp(s.yr,yawRateT,1-Math.exp(-dt*4.8));
  const pMax=jet?80*DEG:.40;s.pitch=clamp(s.pitch+s.pr*dt,-(jet?80*DEG:.38),wasOnGround?11*DEG:pMax);if(wasOnGround&&s.pitch>=11*DEG&&s.pr>0)s.pr=0;
  s.roll=wasOnGround?clamp(s.roll+s.rr*dt,-bankLimit,bankLimit):wrap(s.roll+s.rr*dt);
  s.yaw=wrap(s.yaw+s.yr*dt);
  basis(s.pitch,s.yaw,s.roll,B);
  ax=s.vx-wx;ay=s.vy;az=s.vz-wz;
  const asNow=Math.max(.05,Math.hypot(ax,ay,az)),dx=ax/asNow,dy=ay/asNow,dz=az/asNow;
  const alpha=-Math.asin(clamp(dx*B.ux+dy*B.uy+dz*B.uz,-1,1));
  const rho=1.225*Math.exp(-Math.max(0,s.y)/8500),qbar=.5*rho*asNow*asNow;
  const clLin=clamp(.22+5.25*alpha,-.55,1.52);
  const vs=Math.sqrt((2*MASS*9.81)/(rho*AREA*1.62));
  const stallBlend=wasOnGround||!P.stall?0:Math.max(smooth(14*DEG,22*DEG,alpha),1-smooth(vs*.82,vs*1.06,asNow));
  const cl=lerp(clLin,.62,stallBlend);
  const hAGL=Math.max(0,s.y-g0),gEff=1+(1-smooth(1,14,hAGL))*.12;
  const lift=qbar*AREA*cl*gEff;s.stall=!wasOnGround&&stallBlend>.24;
  const mach=asNow/340;
  const cd=(.024+.075*cl*cl)*P.cdMul+stallBlend*.42+(jet?.003*smooth(.92,1.08,mach)+.0015*Math.max(0,mach-1.08):0);
  const drag=qbar*AREA*cd,lat=ax*B.rx+ay*B.ry+az*B.rz,side=.5*rho*asNow*Math.abs(lat)*AREA*.72;
  const thr=clamp(c.throttle,0,1),tau=jet?(thr>s.power?2.1:1.4):thr>s.power?1.15:.72;
  s.power+=(thr-s.power)*(1-Math.exp(-dt/tau));
  const lapse=jet?1:clamp(1-.0048*asNow,.35,1),abOn=jet&&thr>.92&&s.power>.86;
  s.ab+=((abOn?1:0)-s.ab)*(1-Math.exp(-dt*(abOn?6:3)));
  const thrust=(s.power+(jet?s.ab*P.ab:0))*THRUST*lapse*P.thrust*(MASS/P.mass)*Math.pow(rho/1.225,.7);
  // lift direction: up projected perpendicular to the airflow
  const ud=B.ux*dx+B.uy*dy+B.uz*dz;let lx=B.ux-dx*ud,ly=B.uy-dy*ud,lz=B.uz-dz*ud;const ll=Math.hypot(lx,ly,lz);
  if(ll<1e-3){lx=B.ux;ly=B.uy;lz=B.uz;}else{lx/=ll;ly/=ll;lz/=ll;}
  const sg=-Math.sign(lat)*side;
  const Fx=B.fx*thrust+lx*lift-dx*drag+B.rx*sg,Fy=B.fy*thrust+ly*lift-dy*drag+B.ry*sg-9.81*MASS,Fz=B.fz*thrust+lz*lift-dz*drag+B.rz*sg;
  const k=dt/MASS,damp=Math.exp(-.002*dt);
  s.vx=(s.vx+Fx*k)*damp;s.vy=(s.vy+Fy*k)*damp;s.vz=(s.vz+Fz*k)*damp;
  if(forgiving&&!wasOnGround){
    const help=smooth(3,22,hAGL)*clamp(Math.cos(s.roll)*1.4,0,1);
    if(help>0){const hs=Math.hypot(s.vx,s.vz),t=Math.min(0,hs*Math.tan(s.pitch)*.9);if(s.vy<t)s.vy+=(t-s.vy)*(1-Math.exp(-dt*30))*help;
      if(asNow<23){const kk=(23-asNow)*dt*.9*help;s.vx+=B.fx*kk;s.vy+=B.fy*kk;s.vz+=B.fz*kk;}}
  }
  s.x+=s.vx*dt;s.y+=s.vy*dt;s.z+=s.vz*dt;
  if(s.stall&&!wasOnGround){s.vy-=clamp(2.4+stallBlend*4,2.4,6.4)*dt;s.pr-=.1*stallBlend*dt;}
  const g1=E.ground(s.x,s.z),cy=g1+contact;s.touch=0;
  if(s.y<cy){
    const impact=Math.abs(s.vy);s.y=cy;if(s.vy<0){s.touch=-s.vy;s.vy=0;}
    const fx=-Math.sin(s.yaw),fz=-Math.cos(s.yaw),rx=Math.cos(s.yaw),rz=-Math.sin(s.yaw);
    const fv=s.vx*fx+s.vz*fz,lv=s.vx*rx+s.vz*rz,paved=E.paved(s.x,s.z);
    const roll=fv*Math.exp(-(paved?.028:.16)*dt),la=lv*Math.exp(-14*dt);
    s.vx=fx*roll+rx*la;s.vz=fz*roll+rz*la;s.pr*=Math.exp(-dt*1.1);s.rr*=Math.exp(-dt*2.4);
    if(impact>13||Math.abs(s.roll)>.82||(!paved&&Math.abs(fv)>42))s.crashed=true;
  }
  ax=s.vx-wx;az=s.vz-wz;s.airspeed=Math.hypot(ax,s.vy,az);s.alt=Math.max(0,s.y-g1);s.onGround=s.y<=g1+contact+.35;s.mach=s.airspeed/340;
  return s;
}
