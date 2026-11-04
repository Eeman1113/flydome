// SKYBOUND · sfx: synthesised sound effects that sit alongside the engine model.
// Touchdown tyre chirps, grass rumble, float spray, the reed stall horn, gust buffeting,
// rain on the airframe, thunder, the starter and engine catch, crash impact, fire and
// debris, UI clicks, the shutter, cash and promotion stingers.
import { aircraft, state, WEATHER } from './config.js';
import { clamp } from './util.js';
import { camera } from './engine.js';

let ctx=null,out=null,noise=null,brown=null,L=null;
const lerp=(a,b,t)=>a+(b-a)*t;
function init(){
  if(ctx)return ctx;
  try{ctx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});}catch{return null;}
  out=ctx.createGain();out.gain.value=0;
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;comp.attack.value=.004;comp.release.value=.2;
  out.connect(comp);comp.connect(ctx.destination);
  const n=ctx.sampleRate*3;noise=ctx.createBuffer(1,n,ctx.sampleRate);brown=ctx.createBuffer(1,n,ctx.sampleRate);
  const w=noise.getChannelData(0),b=brown.getChannelData(0);let x=0;
  for(let i=0;i<n;i++){w[i]=Math.random()*2-1;x=(x+.02*w[i])/1.02;b[i]=x*3.5;}
  L=loops();
  return ctx;
}
function src(buf=noise,loop=false){const s=ctx.createBufferSource();s.buffer=buf;s.loop=loop;return s;}
function filt(type,f,q=.7){const b=ctx.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;return b;}
function gain(v=0){const g=ctx.createGain();g.gain.value=v;return g;}
function chain(...n){for(let i=0;i<n.length-1;i++)n[i].connect(n[i+1]);return n[n.length-1];}
function env(g,t,a,peak,d,end=.0001){g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(peak,.0002),t+a);g.gain.exponentialRampToValueAtTime(end,t+a+d);}
function burst({buf=noise,type='bandpass',f=1000,q=.7,peak=.3,a=.005,d=.2,t=ctx.currentTime,dest=out,sweep}){
  const s=src(buf),fl=filt(type,f,q),g=gain();chain(s,fl,g,dest);env(g,t,a,peak,d);
  if(sweep)fl.frequency.exponentialRampToValueAtTime(sweep,t+a+d);
  s.start(t,Math.random()*2);s.stop(t+a+d+.05);
}
function tone({type='sine',f=440,f2,peak=.2,a=.01,d=.3,t=ctx.currentTime,dest=out,detune=0}){
  const o=ctx.createOscillator(),g=gain();o.type=type;o.frequency.setValueAtTime(f,t);o.detune.value=detune;if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+a+d);
  chain(o,g,dest);env(g,t,a,peak,d);o.start(t);o.stop(t+a+d+.05);
}
// Continuous layers, driven every frame.
function loops(){
  const mk=(buf,type,f,q)=>{const s=src(buf,true),fl=filt(type,f,q),g=gain();chain(s,fl,g,out);s.start(0,Math.random()*2);return {s,fl,g};};
  const roll=mk(brown,'lowpass',180,.6),grass=mk(noise,'bandpass',420,.6),spray=mk(noise,'highpass',1800,.4),
        gust=mk(brown,'bandpass',260,.5),patter=mk(noise,'highpass',3200,.5),fire=mk(brown,'lowpass',420,.5);
  // reed stall horn: two detuned saws through a resonant band, with flutter
  const hg=gain(),hb=filt('bandpass',2400,4),h1=ctx.createOscillator(),h2=ctx.createOscillator(),fl=ctx.createOscillator(),fd=gain(18);
  h1.type=h2.type='sawtooth';h1.frequency.value=2330;h2.frequency.value=2352;fl.frequency.value=23;fl.connect(fd);fd.connect(h1.frequency);fd.connect(h2.frequency);
  h1.connect(hb);h2.connect(hb);hb.connect(hg);hg.connect(out);h1.start();h2.start();fl.start();
  return {roll,grass,spray,gust,patter,fire,horn:hg};
}
const set=(p,v,tc=.08)=>p.setTargetAtTime(v,ctx.currentTime,tc);

// ---------------------------------------------------------------- one-shots
export const sfx={
  resume(){if(!init())return;if(ctx.state==='suspended')ctx.resume().catch(()=>{});},
  click(){if(!init())return;const t=ctx.currentTime;tone({type:'triangle',f:1800,f2:900,peak:.05,a:.002,d:.05,t});burst({f:3500,q:2,peak:.03,d:.03,t});},
  touchdown(sink,surface){
    if(!init())return;const t=ctx.currentTime,k=clamp(sink/3,.15,1.4);
    if(surface==='water'){burst({buf:noise,type:'lowpass',f:2200,peak:.35*k,a:.01,d:.6,t,sweep:500});burst({buf:brown,type:'lowpass',f:200,peak:.4*k,d:.4,t});return;}
    if(surface==='runway'){for(let i=0;i<2;i++){const ti=t+i*.06;tone({type:'sawtooth',f:780+Math.random()*120,f2:520,peak:.06*k,a:.005,d:.18,t:ti});burst({f:1400,q:3,peak:.12*k,d:.16,t:ti});}}
    burst({buf:brown,type:'lowpass',f:160,peak:.55*k,a:.004,d:.25,t});
    if(sink>2.6){burst({f:600,q:1.5,peak:.2*k,d:.35,t:t+.02});tone({type:'square',f:140,f2:60,peak:.08,d:.2,t});}
  },
  crash(water,pos){
    if(!init())return;const t=ctx.currentTime,k=distGain(pos,1.2);
    burst({buf:brown,type:'lowpass',f:900,peak:.9*k,a:.003,d:1.8,t,sweep:60});
    burst({buf:noise,type:'lowpass',f:5000,peak:.5*k,a:.002,d:.5,t,sweep:300});
    tone({type:'sine',f:60,f2:28,peak:.7*k,a:.005,d:1.2,t});
    if(water){burst({type:'lowpass',f:3000,peak:.5*k,a:.02,d:1.4,t:t+.05,sweep:400});return;}
    // metal and debris settling
    for(let i=0;i<14;i++){const ti=t+.15+Math.random()*2.4;burst({f:900+Math.random()*3000,q:6,peak:(.05+Math.random()*.12)*k,a:.002,d:.08+Math.random()*.25,t:ti});
      if(Math.random()<.4)tone({type:'triangle',f:300+Math.random()*900,peak:.03*k,a:.002,d:.4,t:ti,detune:Math.random()*80});}
  },
  thunder(){if(!init())return;const t=ctx.currentTime+.4*Math.random(),k=.25+Math.random()*.35;
    burst({buf:brown,type:'lowpass',f:220,peak:.6*k,a:.08,d:3.5+Math.random()*2,t});
    for(let i=0;i<5;i++)burst({buf:brown,type:'lowpass',f:400,peak:.3*k,a:.02,d:.5,t:t+Math.random()*1.5});},
  starter(){if(!init())return;const t=ctx.currentTime;
    // starter motor whine, cranking, then the cylinders catch
    tone({type:'sawtooth',f:180,f2:420,peak:.05,a:.1,d:1.1,t});
    for(let i=0;i<7;i++){const ti=t+.15+i*.14;burst({buf:brown,type:'lowpass',f:300,peak:.2,a:.005,d:.08,t:ti});}
    for(let i=0;i<4;i++)burst({buf:brown,type:'lowpass',f:500,peak:.35,a:.003,d:.12,t:t+1.15+i*.09});},
  shutter(){if(!init())return;const t=ctx.currentTime;burst({f:4200,q:2,peak:.2,d:.03,t});burst({f:2600,q:2,peak:.16,d:.05,t:t+.09});},
  cash(){if(!init())return;const t=ctx.currentTime;[1568,2093,2637].forEach((f,i)=>tone({type:'triangle',f,peak:.09,a:.004,d:.5,t:t+i*.07}));burst({f:6000,q:1,peak:.05,d:.2,t});},
  fanfare(){if(!init())return;const t=ctx.currentTime;[523,659,784,1047].forEach((f,i)=>{tone({type:'triangle',f,peak:.1,a:.02,d:.9,t:t+i*.11});tone({type:'sine',f:f*2,peak:.03,a:.02,d:.7,t:t+i*.11});});},
};
function distGain(pos,ref=1){if(!pos)return ref;const d=camera.position.distanceTo(pos);return ref*clamp(60/(d+20),.05,1);}

// ---------------------------------------------------------------- per-frame
let thunderT=30+Math.random()*40,patterT=0;
export function sfxUpdate(dt,{onGround,surface,fire}={}){
  if(!ctx){if(state.started)init();if(!ctx)return;}
  if(ctx.state==='suspended'&&state.started&&!state.paused)ctx.resume().catch(()=>{});
  const active=state.started&&!state.paused&&state.audioEnabled;
  set(out.gain,active?state.audioVolume*(.55+.6*(state.effectVolume??.6)):0,.15);
  const a=aircraft,gs=Math.hypot(a.velocity.x,a.velocity.z),kt=a.airspeed*1.94384,crashed=state.crashed,cockpit=state.camera===1;
  const roll=onGround&&!crashed?clamp(gs/30,0,1):0;
  set(L.roll.g.gain,surface==='runway'?roll*.25:surface==='water'?0:roll*.35);set(L.roll.fl.frequency,90+gs*6);
  // grass: bumpy, with random thumps
  set(L.grass.g.gain,(surface==='strip'||surface==='field')?roll*.16:0);
  if((surface==='strip'||surface==='field')&&roll>.1&&Math.random()<dt*gs*.25)burst({buf:brown,type:'lowpass',f:220,peak:.18*roll,a:.004,d:.12});
  set(L.spray.g.gain,surface==='water'&&!crashed?clamp(gs/25,0,1)*.22:0);set(L.spray.fl.frequency,1200+gs*60);
  // stall horn: sounds just above the stall, airborne only
  const horn=!onGround&&!crashed&&a.altAGL>3&&(a.stall||kt<62)&&kt>15;
  set(L.horn.gain,horn?(cockpit?.07:.035):0,.03);
  // gust buffet
  set(L.gust.g.gain,!crashed&&!onGround?clamp((state.gust||0)/8,0,1)*clamp(kt/90,0,1)*(cockpit?.32:.2):0,.25);
  // rain on the airframe
  const rain=WEATHER.rain&&!crashed;
  set(L.patter.g.gain,rain?(cockpit?.05:.02):0,.5);
  if(rain&&cockpit){patterT-=dt;if(patterT<0){patterT=.01+Math.random()*.05;burst({f:2500+Math.random()*3500,q:3,peak:.02+Math.random()*.03,a:.001,d:.02});}}
  if(rain){thunderT-=dt;if(thunderT<0){thunderT=35+Math.random()*55;sfx.thunder();}}
  // fire roar + crackle after a crash
  const fk=fire?distGain(fire,1):0;
  set(L.fire.g.gain,fk*.35,.3);
  if(fk>.05&&Math.random()<dt*14)burst({f:1500+Math.random()*3000,q:4,peak:.08*fk,a:.001,d:.03+Math.random()*.05});
}
// UI click on every button
if(typeof window!=='undefined')window.addEventListener('pointerdown',e=>{if(e.target.closest?.('button'))sfx.click();},{capture:true});
