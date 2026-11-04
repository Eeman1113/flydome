// SKYBOUND · weather — gusting wind, rain streaks, windshield droplets and ambience
// (rain hiss, birdsong low over forests). Everything is seeded per world via WEATHER.
import * as THREE from 'three';
import { $, clamp } from './util.js';
import { WEATHER, WIND_BASE, aircraft, state } from './config.js';
import { terrain } from './world.js';
import { scene, camera, worldTime } from './engine.js';

let rain=null,rainPos=null,rainSeed=null,drops=[],dctx=null,dw=0,dh=0,amb=null,forestT=0,overForest=0,birdT=0;
const RAIN_N=3600,BOX=80;

export function initWeather(){
  if(WEATHER.rain){
    rainPos=new Float32Array(RAIN_N*6);rainSeed=new Float32Array(RAIN_N*3);
    for(let i=0;i<RAIN_N;i++){rainSeed[i*3]=(Math.random()-.5)*BOX*2;rainSeed[i*3+1]=Math.random()*BOX*2-BOX;rainSeed[i*3+2]=(Math.random()-.5)*BOX*2;}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(rainPos,3).setUsage(THREE.DynamicDrawUsage));
    rain=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xdfe8f0,transparent:true,opacity:.42,depthWrite:false,fog:true}));
    rain.frustumCulled=false;rain.renderOrder=11;scene.add(rain);
    const c=$('rainDrops');if(c){dctx=c.getContext('2d');}
  }
}
const V=new THREE.Vector3();
export function updateWeather(dt){
  // Gusts: smooth, irregular swells layered on the world's steady wind.
  const t=worldTime;
  if(WEATHER.gust>0){
    const n=Math.sin(t*.47)*Math.sin(t*1.31+1.1)*.7+Math.sin(t*2.7+.4)*.18+Math.sin(t*5.1)*.06;
    state.gust=Math.max(0,n)*WEATHER.gust;
    state.wind.copy(WIND_BASE).multiplyScalar(1+state.gust/Math.max(1,WEATHER.kt));
    // a little crosswise wander so gusts also nudge the nose
    state.wind.x+=Math.sin(t*.9)*.25*state.gust/3;state.wind.z+=Math.cos(t*1.1)*.25*state.gust/3;
  }else state.gust=0;
  if(rain)updateRain(dt);
  updateDrops(dt);
  updateAmbience(dt);
}
function updateRain(dt){
  const c=camera.position,fall=9,len=.09;
  // streaks are drawn along the drops' motion relative to the aircraft
  const rx=state.wind.x-aircraft.velocity.x*(state.started?1:0),ry=-fall-aircraft.velocity.y*(state.started?1:0),rz=state.wind.z-aircraft.velocity.z*(state.started?1:0);
  for(let i=0;i<RAIN_N;i++){
    let y=rainSeed[i*3+1]-fall*dt*1.0;if(y<-BOX)y+=BOX*2;rainSeed[i*3+1]=y;
    let x=rainSeed[i*3]+state.wind.x*dt,z=rainSeed[i*3+2]+state.wind.z*dt;
    rainSeed[i*3]=x;rainSeed[i*3+2]=z;
    // wrap the box around the camera
    const wx=((x-c.x)%(BOX*2)+BOX*3)%(BOX*2)-BOX+c.x,wz=((z-c.z)%(BOX*2)+BOX*3)%(BOX*2)-BOX+c.z,wy=c.y+y;
    const o=i*6;rainPos[o]=wx;rainPos[o+1]=wy;rainPos[o+2]=wz;rainPos[o+3]=wx-rx*len;rainPos[o+4]=wy-ry*len;rainPos[o+5]=wz-rz*len;
  }
  rain.geometry.attributes.position.needsUpdate=true;
}
function updateDrops(dt){
  const c=$('rainDrops');if(!c||!dctx)return;
  const show=WEATHER.rain&&state.started&&state.camera===1&&!state.paused;
  c.style.opacity=show?1:0;if(!show){if(drops.length){drops=[];dctx.clearRect(0,0,dw,dh);}return;}
  const r=Math.min(2,devicePixelRatio||1);if(dw!==innerWidth*r||dh!==innerHeight*r){dw=c.width=innerWidth*r;dh=c.height=innerHeight*r;}
  const spd=aircraft.airspeed;
  for(let k=0;k<3;k++)if(drops.length<140&&Math.random()<dt*45)drops.push({x:Math.random()*dw,y:dh*.15+Math.random()*dh*.6,r:(2+Math.random()*4.5)*r,life:0,vx:0,vy:0,hold:.15+Math.random()*.6,trail:[]});
  dctx.clearRect(0,0,dw,dh);
  for(let i=drops.length-1;i>=0;i--){
    const d=drops[i];d.life+=dt;
    // at speed the airflow sweeps drops up and outward across the screen
    // a drop beads for a moment, then the airflow drives it up and outward, leaving a rivulet
    const cx=d.x-dw/2,go=d.life>d.hold?Math.min(1,(d.life-d.hold)*2):0;
    d.vx=cx/dw*spd*4*r*go;d.vy=(spd<10?22:-(spd*2.4))*r*go;
    d.x+=d.vx*dt;d.y+=d.vy*dt;if(go>0){d.trail.push(d.x,d.y);if(d.trail.length>24)d.trail.splice(0,2);}
    if(d.y<-20||d.y>dh+20||d.x<-20||d.x>dw+20||d.life>6){drops.splice(i,1);continue;}
    if(d.trail.length>4){dctx.strokeStyle='rgba(225,236,245,.22)';dctx.lineWidth=d.r*.7;dctx.lineCap='round';dctx.beginPath();dctx.moveTo(d.trail[0],d.trail[1]);for(let t=2;t<d.trail.length;t+=2)dctx.lineTo(d.trail[t],d.trail[t+1]);dctx.stroke();}
    const stretch=1+clamp(spd/40,0,1.2)*(d.life>d.hold?1:0);
    dctx.save();dctx.translate(d.x,d.y);dctx.rotate(Math.atan2(d.vy,d.vx)+Math.PI/2);
    const g=dctx.createRadialGradient(-d.r*.3,-d.r*.3,0,0,0,d.r*1.2);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(.6,'rgba(200,220,235,.18)');g.addColorStop(1,'rgba(160,180,200,0)');
    dctx.fillStyle=g;dctx.beginPath();dctx.ellipse(0,0,d.r,d.r*stretch,0,0,Math.PI*2);dctx.fill();dctx.restore();
  }
}
// ---------------------------------------------------------------- ambience
function ensureAmb(){
  if(amb)return amb;
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)(),out=ctx.createGain();out.gain.value=0;out.connect(ctx.destination);
    const len=ctx.sampleRate*2,buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);let b=0;
    for(let i=0;i<len;i++){const w=Math.random()*2-1;b=.97*b+.03*w;d[i]=(w*.4+b*2.2)*.5;}
    const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=900;
    const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=6500;const rg=ctx.createGain();rg.gain.value=0;
    src.connect(hp);hp.connect(lp);lp.connect(rg);rg.connect(out);src.start();
    amb={ctx,out,rg};
  }catch{amb=null;}
  return amb;
}
function updateAmbience(dt){
  if(!state.started)return;
  const a=ensureAmb();if(!a)return;
  if(a.ctx.state==='suspended')a.ctx.resume().catch(()=>{});
  const on=state.audioEnabled&&!state.paused,now=a.ctx.currentTime;
  a.out.gain.setTargetAtTime(on?state.audioVolume:0,now,.3);
  a.rg.gain.setTargetAtTime(WEATHER.rain?(state.camera===1?.05:.03):0,now,.5);
  // birdsong: low, slow and over forest
  forestT-=dt;
  if(forestT<0){forestT=1;const p=aircraft.position,o={},h=terrain.base(p.x,p.z,o),[tp,mo]=terrain.climate(h,o);overForest=terrain.forestAt(p.x,p.z,h,.1,tp,mo);}
  birdT-=dt;
  if(on&&overForest>.45&&aircraft.altAGL<140&&aircraft.airspeed<45&&birdT<0&&!WEATHER.rain){birdT=.6+Math.random()*2.4;chirp(a,1-aircraft.altAGL/140);}
}
function chirp(a,k){
  const ctx=a.ctx,t=ctx.currentTime,notes=1+Math.floor(Math.random()*4),base=2400+Math.random()*1800;
  for(let i=0;i<notes;i++){
    const o=ctx.createOscillator(),g=ctx.createGain(),s=t+i*(.07+Math.random()*.05);o.type='sine';
    o.frequency.setValueAtTime(base*(1+Math.random()*.2),s);o.frequency.exponentialRampToValueAtTime(base*(.7+Math.random()*.6),s+.06);
    g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(.025*k,s+.01);g.gain.exponentialRampToValueAtTime(.0001,s+.09);
    o.connect(g);g.connect(a.out);o.start(s);o.stop(s+.1);
  }
}
