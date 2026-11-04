// SKYBOUND · radio: Skybound Ground, the female controller who calls the whole flight,
// plus background traffic chatter. Calls are assembled from pre-rendered clips (callsign +
// body + numbers), with shuffle-bag variants so lines rarely repeat, and played through a
// live radio chain (band-pass, grit, compression, static bed, squelch on key-up and release).
import { BASE_PATH, AIRCRAFT, aircraftState, aircraft, state, WEATHER } from './config.js';
import { $, clamp, DEG } from './util.js';
import { mission, nextTarget, charterSurveyed, landmarkById } from './survey.js';

const SETTINGS_KEY='skybound.radio';
export const radioSettings=(()=>{const d={on:true,chatter:true,subs:true,volume:.85};try{return {...d,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')};}catch{return d;}})();
export function saveRadioSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(radioSettings));}catch{}if(!radioSettings.on)stopRadio();}

let manifest=null,groups={},ctx=null,bus=null,noiseBuf=null,loading=null;
const buffers=new Map(),bags=new Map(),cool=new Map(),lastPick=new Map();
let queue=[],playing=null,chatT=70+Math.random()*40;

function load(){
  if(loading)return loading;
  loading=fetch(`${BASE_PATH}/radio/manifest.json`).then(r=>r.ok?r.json():null).then(m=>{
    manifest=m;groups={};if(!m)return;
    for(const [id,c] of Object.entries(m))(groups[c.g]||(groups[c.g]=[])).push(id);
  }).catch(()=>{manifest=null;});
  return loading;
}
function ensureCtx(){
  if(ctx)return ctx;
  try{ctx=new (window.AudioContext||window.webkitAudioContext)();}catch{return null;}
  // radio chain: voice → HP → LP → presence → grit → compressor → bus
  const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=330;hp.Q.value=.8;
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=3400;lp.Q.value=.9;
  const pk=ctx.createBiquadFilter();pk.type='peaking';pk.frequency.value=1900;pk.gain.value=5;pk.Q.value=1.1;
  const ws=ctx.createWaveShaper();const k=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/511.5-1;k[i]=Math.tanh(x*2.2)/Math.tanh(2.2);}ws.curve=k;
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-22;comp.ratio.value=6;comp.attack.value=.003;comp.release.value=.12;
  bus=ctx.createGain();bus.gain.value=radioSettings.volume;
  hp.connect(lp);lp.connect(pk);pk.connect(ws);ws.connect(comp);comp.connect(bus);bus.connect(ctx.destination);
  bus.input=hp;
  const n=ctx.sampleRate*2;noiseBuf=ctx.createBuffer(1,n,ctx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
  return ctx;
}
async function buffer(id){
  if(buffers.has(id))return buffers.get(id);
  const p=fetch(`${BASE_PATH}/radio/${id}.ogg`).then(r=>r.arrayBuffer()).then(b=>ctx.decodeAudioData(b)).catch(()=>null);
  buffers.set(id,p);return p;
}
// Shuffle bag: every variant plays once before any repeats.
function pick(group){
  const ids=groups[group];if(!ids||!ids.length)return null;
  let bag=bags.get(group);if(!bag||!bag.length){bag=[...ids].sort(()=>Math.random()-.5);if(bag.length>1&&bag[bag.length-1]===lastPick.get(group))bag.unshift(bag.pop());bags.set(group,bag);}
  const id=bag.pop();lastPick.set(group,id);return id;
}
function noise(t,dur,level,freq=2400){
  const s=ctx.createBufferSource();s.buffer=noiseBuf;s.loop=true;s.loopStart=Math.random();
  const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=freq;f.Q.value=.7;
  const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(level,t+.008);g.gain.setValueAtTime(level,t+dur-.02);g.gain.linearRampToValueAtTime(0,t+dur);
  s.connect(f);f.connect(g);g.connect(bus);s.start(t,Math.random()*1.5);s.stop(t+dur+.05);return {s,g};
}
function click(t,level=.5){const o=ctx.createOscillator(),g=ctx.createGain();o.type='square';o.frequency.setValueAtTime(1300,t);o.frequency.exponentialRampToValueAtTime(400,t+.02);g.gain.setValueAtTime(level,t);g.gain.exponentialRampToValueAtTime(.001,t+.03);o.connect(g);g.connect(bus);o.start(t);o.stop(t+.04);}

function subtitle(who,text){
  const el=$('radioSub');if(!el)return;
  if(!radioSettings.subs||!text){el.classList.remove('show');return;}
  el.innerHTML=`<b>${who}</b>${text}`;el.classList.add('show');
  clearTimeout(subtitle.t);subtitle.t=setTimeout(()=>el.classList.remove('show'),Math.max(2600,text.length*70));
}
// Play one call (a list of clip ids) as a single transmission.
async function transmit(call){
  const c=ensureCtx();if(!c)return;
  if(c.state==='suspended')try{await c.resume();}catch{}
  const bufs=(await Promise.all(call.ids.map(buffer))).filter(Boolean);
  if(!bufs.length||playing!==call)return;
  const chatter=call.chatter,lvl=chatter?.55:1;
  let t=c.currentTime+.06;const t0=t;
  click(t,.35*lvl);noise(t,.09,.22*lvl,3000);t+=.1;
  const srcs=[];
  for(const b of bufs){const s=c.createBufferSource();s.buffer=b;const g=c.createGain();g.gain.value=lvl*(chatter?.8:1);s.connect(g);g.connect(bus.input);s.start(t);srcs.push(s);t+=b.duration-.04;}
  const bed=noise(t0+.08,t-t0,chatter?.035:.018,1700);
  noise(t,.16,.2*lvl,2600);click(t+.15,.2*lvl);t+=.2;
  call.srcs=srcs;call.bed=bed;call.end=t;
  const who=chatter?'TRAFFIC':'SKYBOUND GROUND';
  subtitle(who,call.text);
  await new Promise(r=>setTimeout(r,(t-c.currentTime)*1000));
  if(playing===call)playing=null;
}
function stopRadio(){if(playing){for(const s of playing.srcs||[])try{s.stop();}catch{}try{playing.bed?.s.stop();}catch{}playing=null;}queue=[];}
function pump(){
  if(playing||!queue.length||!state.audioEnabled||!radioSettings.on)return;
  const call=queue.shift();
  if(performance.now()-call.at>(call.ttl||9000))return pump();
  playing=call;transmit(call).catch(()=>{playing=null;});
}
// Build and queue a call. parts: group names or literal clip ids ('#id').
function call(parts,{pri=1,ttl,chatter=false,key,cd=0}={}){
  if(!manifest||!radioSettings.on)return false;
  if(key){const now=performance.now();if(now<(cool.get(key)||0))return false;cool.set(key,now+cd*1000);}
  const ids=[],text=[];
  for(const p of parts){if(p==null)continue;const id=p.startsWith('#')?p.slice(1):pick(p);if(!id||!manifest[id])continue;ids.push(id);text.push(manifest[id].t);}
  if(!ids.length)return false;
  const c={ids,text:text.reduce((s,t)=>!s?t:s+' '+(/,$/.test(s)&&!/^I\b/.test(t)?t[0].toLowerCase()+t.slice(1):t),'').replace(/\s+([,.])/g,'$1'),pri,ttl,chatter,at:performance.now()};
  if(pri>=3){stopRadio();queue=[c];}
  else if(playing?.chatter&&!chatter){stopRadio();queue.unshift(c);}
  else{queue.push(c);queue.sort((a,b)=>b.pri-a.pri);if(queue.length>4)queue.length=4;}
  pump();return true;
}
// ---------------------------------------------------------------- spoken numbers
const digits=n=>String(n).padStart(3,'0').split('').map(d=>`dig_${d}`);
function numGroup(n){n=Math.round(n);return n>=0&&n<=30?`num_${n}`:null;}
function cs(){return AIRCRAFT[aircraftState.variant].floats?'cs_caravan':'cs_skylane';}
function bearingTo(l){const a=aircraft.position;let b=Math.atan2(l.x-a.x,-(l.z-a.z))/DEG;b=(b+360)%360;return Math.round(b/10)*10%360||360;}
function targetParts(l,lead){
  const a=aircraft.position,km=Math.hypot(l.x-a.x,l.z-a.z)/1000;
  const parts=[lead,`type_${l.type}`,'w_bearing',...digits(bearingTo(l))];
  if(km>=1.5&&km<30.5)parts.push('w_range',numGroup(km),'w_km');
  return parts;
}
function windParts(){
  if(WEATHER.kt<2)return ['w_calm'];
  const dir=(Math.round(WEATHER.dir/10)*10%360)||360,p=['w_wind',...digits(dir),'w_at',numGroup(Math.min(30,WEATHER.kt))];
  if(WEATHER.gust>3)p.push('w_gusting',numGroup(Math.min(30,WEATHER.kt+WEATHER.gust)));
  p.push('w_knots');return p;
}

// ---------------------------------------------------------------- game events
const live={airborneSaid:false,nearSaid:new Set(),surveySaid:null,approachSaid:false,approachT:0,stallT:0,fuelLowSaid:false,tutT:0,tutStep:-1,lastLevel:0};
export function radioEvent(ev,d={}){
  if(!radioSettings.on)return;
  load().then(()=>{
    switch(ev){
      case 'start':{
        live.airborneSaid=false;live.nearSaid.clear();live.fuelLowSaid=false;live.approachSaid=false;
        const onStrip=d.strip,m=d.mode;
        const body=onStrip?'start_strip':m==='cargo'?'start_cargo':m==='daily'?'start_daily':m==='charter'?'start_charter':m==='tutorial'?'tut_welcome':'start_explore';
        call([cs(),body],{pri:2,ttl:15000});
        if(m==='tutorial')break;
        if(!onStrip)call(windParts(),{pri:2,ttl:20000});
        if(WEATHER.rain)call(['wx_rain'],{ttl:25000});else if(WEATHER.gust>5)call(['wx_gusts'],{ttl:25000});else if(WEATHER.lowCloud)call(['wx_lowcloud'],{ttl:25000});
        const t=nextTarget();if(t&&mission.charter)call(targetParts(t,'brief_first'),{ttl:30000});
        break;}
      case 'discovery':{
        call([d.rare?'discovery_rare':'discovery'],{pri:2});
        if(mission.charter&&!mission.complete){
          if(charterSurveyed())call([mission.charter.water?'charter_surveyed_water':'charter_surveyed'],{pri:2});
          else{const t=nextTarget();if(t)call(targetParts(t,'brief_next'),{ttl:15000});}
        }
        if(d.rankUp!=null)call(['rank_up',`rank_${d.rankUp}`],{ttl:20000});
        break;}
      case 'gorge':call(['gorge_done'],{pri:2});break;
      case 'landed':{
        const g=d.kind==='field'?'land_field':d.kind==='water'&&'SAB'.includes(d.grade)?'land_water':`land_${d.grade}`;
        call([cs(),g],{pri:2});
        if(d.charterComplete)call(['charter_complete'],{pri:2});
        if(d.rankUp!=null)call(['rank_up',`rank_${d.rankUp}`],{ttl:20000});
        break;}
      case 'job':call([cs(),`job_${d.cargoId}`],{pri:2});break;
      case 'delivered':call([d.late?'delivered_late':'delivered'],{pri:2});if(d.rankUp!=null)call(['rank_up',`rank_${d.rankUp}`],{ttl:20000});break;
      case 'crash':call([d.water?'ditch':'crash'],{pri:3});break;
      case 'respawn':call([cs(),d.strip?'start_strip':'respawn'],{pri:2});break;
      case 'fuelOut':call([cs(),'fuel_out'],{pri:3});break;
      case 'tutStep':live.tutStep=d.index;live.tutT=0;
        if(!d.first)call(['tut_good'],{pri:2,ttl:4000});
        call([`tut_${d.index}`],{pri:2,ttl:20000});break;
    }
  });
}
// Per-frame watchers for calls that come from flight state rather than discrete events.
export function radioUpdate(dt,ctxState){
  if(!manifest||!radioSettings.on||!state.started||state.paused||state.crashed){if(state.paused||!state.started)stopRadio();return;}
  if(bus)bus.gain.value=radioSettings.volume*state.audioVolume*1.2;
  pump();
  const a=aircraft,kt=a.airspeed*1.94384,air=a.altAGL>6;
  // takeoff
  if(!live.airborneSaid&&a.altAGL>25&&kt>45){live.airborneSaid=true;if(!state.tutorial.active)call(['takeoff']);}
  if(a.altAGL<3)live.airborneSaid=a.altAGL>25;
  // warnings
  if(air&&a.stall)call(['stall'],{pri:3,key:'stall',cd:9,ttl:1500});
  else if(air&&a.altAGL<30&&a.verticalSpeed<-7&&kt>40&&!ctxState?.approach)call(['terrain'],{pri:3,key:'terrain',cd:12,ttl:1500});
  if(mission.hardcore&&!live.fuelLowSaid&&mission.fuel<.15&&mission.fuel>0){live.fuelLowSaid=true;call([cs(),'fuel_low'],{pri:2});}
  if(state.tutorial.active){
    live.tutT+=dt;if(live.tutT>28){live.tutT=0;call(['tut_hint'],{key:'tuthint',cd:25,ttl:3000});}
    return;
  }
  // survey
  const t=nextTarget();
  if(t&&!live.nearSaid.has(t.id)&&Math.hypot(t.x-a.position.x,t.z-a.position.z)<Math.max(1600,(t.env?.r||600)*2.4)){live.nearSaid.add(t.id);call(['target_near']);}
  const sv=mission.survey;
  if(sv&&sv.prog>.12&&sv.prog<.6&&live.surveySaid!==sv.l.id){live.surveySaid=sv.l.id;call(['surveying'],{ttl:2500,key:'surveying',cd:20});}
  if(sv&&live.surveySaid===sv.l.id&&sv.prog===0&&sv.why)call(['survey_lost'],{key:'lost',cd:30,ttl:2500});
  // approach
  const ap=ctxState?.approach;
  if(ap&&ap.along<2600){
    if(!live.approachSaid){live.approachSaid=true;call([cs(),'approach'],{pri:2,ttl:6000});}
    else if(ap.along<1900&&ap.along>350){
      if(ap.dev>.8)call(['approach_high'],{key:'aphigh',cd:14,ttl:2500});
      else if(ap.dev<-.8)call(['approach_low'],{key:'aplow',cd:14,ttl:2500});
      else if(kt>88)call(['approach_fast'],{key:'apfast',cd:16,ttl:2500});
    }
  }else if(!ap||ap.along>3200)live.approachSaid=false;
  // background chatter
  if(radioSettings.chatter){
    chatT-=dt;
    if(chatT<0&&!playing&&!queue.length){
      chatT=55+Math.random()*70;
      const pool=Object.keys(groups).filter(g=>g.startsWith('chat_'));
      if(pool.length)call([pool[Math.floor(Math.random()*pool.length)]],{chatter:true,pri:0,ttl:3000});
    }
  }
}
export function radioReady(){return !!manifest;}
load();
