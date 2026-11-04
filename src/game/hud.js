// SKYBOUND · hud — clean, minimal flight HUD for FIRST CHARTER.
// Compass tape, speed/altitude readouts, circular relief minimap with fog of war, charter card,
// survey ring, discovery banners, landing stamps, the full chart and the shareable chart card.
import { $, DEG, FT_PER_M, KTS_PER_MS, clamp } from './util.js';
import { DAILY_NUMBER, IS_DAILY, RUNWAY_HALF_L, RUNWAY_HALF_W, WORLD_SEED, WEATHER, aircraft, sky, state } from './config.js';
import { AIRPORT_H, terrain } from './world.js';
import { mission, charterTargets, nextTarget, charterSurveyed, landmarkById, fmtTime, rankInfo, acceptJob } from './survey.js';
import { progress, averageGrade } from './progress.js';
import { drawIcon, iconSvg, TYPE_LABEL } from './icons.js';

const C={cyan:'#71d8ee',ink:'#eef6fc',muted:'rgba(214,232,244,.62)',dim:'rgba(214,232,244,.28)',cream:'#f3e7c9',warn:'#ffb86b',red:'#ff8d83'};
const REVEAL_R=2300;
let relief=null,fogMask=null,fogRelief=null,chartBase=null,N=0,STEP=125,R=14000;
let tapeCtx=null,mapCtx=null,tapeW=0,tapeH=0,mapS=0,dpr=1,cardTimer=0;

function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}

// ---------------------------------------------------------------- setup
export function initHud(){
  const s=mission.scan;N=s.N;STEP=s.step;R=s.R;
  relief=canvas(N,N);relief.getContext('2d').putImageData(new ImageData(s.rgba,N,N),0,0);
  // uncharted look: cool, desaturated and darkened relief
  fogRelief=canvas(N,N);{const g=fogRelief.getContext('2d');g.filter='grayscale(.85) brightness(.42) contrast(1.15)';g.drawImage(relief,0,0);g.filter='none';g.fillStyle='rgba(10,24,38,.35)';g.fillRect(0,0,N,N);}
  fogMask=canvas(N,N);chartBase=canvas(N,N);
  revealAt(0,RUNWAY_HALF_L*.2,3200,false);
  for(const id of mission.discovered){const l=landmarkById(id);if(l)revealAt(l.x,l.z,REVEAL_R,false);}
  rebuildChart();
  dpr=Math.min(2,window.devicePixelRatio||1);
  const tape=$('compassTape'),map=$('minimap');
  tapeW=tape.clientWidth||460;tapeH=tape.clientHeight||46;tape.width=tapeW*dpr;tape.height=tapeH*dpr;tapeCtx=tape.getContext('2d');
  mapS=map.clientWidth||184;map.width=map.height=mapS*dpr;mapCtx=map.getContext('2d');
  window.addEventListener('resize',()=>{tapeW=tape.clientWidth||tapeW;tape.width=tapeW*dpr;tape.height=tapeH*dpr;});
  map.addEventListener('wheel',e=>{e.preventDefault();cycleMapZoom(e.deltaY>0?1:-1);},{passive:false});
  map.addEventListener('click',()=>toggleChart());
}
function revealAt(x,z,r,rebuild=true){
  if(!fogMask)return;const g=fogMask.getContext('2d'),px=(x+R)/STEP,pz=(z+R)/STEP,pr=r/STEP;
  const gr=g.createRadialGradient(px,pz,pr*.55,px,pz,pr);gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=gr;g.beginPath();g.arc(px,pz,pr,0,Math.PI*2);g.fill();
  if(rebuild)rebuildChart();
}
function rebuildChart(){
  const g=chartBase.getContext('2d');g.globalCompositeOperation='source-over';g.clearRect(0,0,N,N);g.drawImage(fogRelief,0,0);
  const t=canvas(N,N),tg=t.getContext('2d');tg.drawImage(relief,0,0);tg.globalCompositeOperation='destination-in';tg.drawImage(fogMask,0,0);
  g.drawImage(t,0,0);
}
export function hudRevealTick(x,z){revealAt(x,z,REVEAL_R);}

// ---------------------------------------------------------------- per frame
const wrap180=a=>((a+540)%360)-180;
const headingDeg=()=>(((-aircraft.yaw/DEG)%360)+360)%360;
const bearingTo=(x,z)=>((Math.atan2(x-aircraft.position.x,-(z-aircraft.position.z))/DEG)+360)%360;

export function hudFrame(){
  if(!tapeCtx||!state.started||!state.hud)return;
  drawTape();drawMinimap();
}
function markerSet(){
  const out=[],tgt=nextTarget(),cset=new Set(mission.charter?mission.charter.ids:[]);
  for(const l of mission.landmarks){
    if(mission.discovered.has(l.id))continue;
    out.push({x:l.x,z:l.z,kind:cset.has(l.id)?'target':'unknown',active:tgt&&tgt.id===l.id,l});
  }
  if(mission.mode==='cargo'){
    const j=mission.job;out.push({x:0,z:0,kind:'home',active:!!j&&j.to.key==='home'});
    for(const s of mission.strips)out.push({x:s.x,z:s.z,kind:'strip',active:!!j&&j.to.key===`s${s.id}`,s});
    if(j&&j.to.kind==='water')out.push({x:j.to.x,z:j.to.z,kind:'strip',active:true});
    return out;
  }
  if(mission.charter&&charterSurveyed()){
    out.push({x:0,z:0,kind:'home',active:true});for(const s of mission.strips)out.push({x:s.x,z:s.z,kind:'strip',active:false,s});
  }else{out.push({x:0,z:0,kind:'home'});for(const s of mission.strips)out.push({x:s.x,z:s.z,kind:'strip',s});}
  return out;
}
function drawTape(){
  const g=tapeCtx,W=tapeW,H=tapeH,head=headingDeg(),span=110,ppd=W/span;
  g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);
  const fade=g.createLinearGradient(0,0,W,0);fade.addColorStop(0,'rgba(238,246,252,0)');fade.addColorStop(.18,'rgba(238,246,252,1)');fade.addColorStop(.82,'rgba(238,246,252,1)');fade.addColorStop(1,'rgba(238,246,252,0)');
  g.strokeStyle=fade;g.fillStyle=fade;g.lineWidth=1;g.font='600 10px Inter, ui-sans-serif, system-ui';g.textAlign='center';g.textBaseline='alphabetic';
  const base=H-14;
  for(let d=Math.ceil((head-span/2)/5)*5;d<=head+span/2;d+=5){
    const x=W/2+(d-head)*ppd,dd=((d%360)+360)%360,major=dd%30===0,mid=dd%10===0;
    g.globalAlpha=major?.95:mid?.55:.3;g.beginPath();g.moveTo(x,base);g.lineTo(x,base-(major?9:mid?6:3.5));g.stroke();
    if(major){const lab={0:'N',90:'E',180:'S',270:'W'}[dd]??String(dd/10).padStart(2,'0');g.globalAlpha=lab.length===1?1:.7;g.fillText(lab,x,base-13);}
  }
  g.globalAlpha=1;
  // markers
  const ms=markerSet();
  for(const m of ms){
    const rel=wrap180(bearingTo(m.x,m.z)-head),inside=Math.abs(rel)<span/2-4,x=W/2+clamp(rel,-span/2+6,span/2-6)*ppd,y=base+7;
    const col=m.kind==='target'||(m.active&&m.kind!=='unknown')?C.cyan:m.kind==='unknown'?'rgba(238,246,252,.55)':'rgba(238,246,252,.5)';
    g.fillStyle=col;g.strokeStyle=col;g.lineWidth=1.4;
    if(m.kind==='home'||m.kind==='strip'){if(!inside)continue;g.globalAlpha=m.active?1:.55;g.strokeRect(x-2.5,y-4,5,8);g.globalAlpha=1;continue;}
    g.save();g.translate(x,y);g.rotate(Math.PI/4);const s=m.active?5:3.4;
    if(m.active){g.fillRect(-s/2,-s/2,s,s);}else g.strokeRect(-s/2,-s/2,s,s);g.restore();
    if(!inside&&m.active){g.beginPath();const dir=rel<0?-1:1;g.moveTo(x+dir*8,y-4);g.lineTo(x+dir*12,y);g.lineTo(x+dir*8,y+4);g.stroke();}
  }
  // centre caret
  g.fillStyle=C.ink;g.beginPath();g.moveTo(W/2-5,0);g.lineTo(W/2+5,0);g.lineTo(W/2,6);g.closePath();g.fill();
}
export const MAP_RANGES=[2500,4500,9000];let mapZoom=1;
export function cycleMapZoom(dir=1){mapZoom=(mapZoom+dir+MAP_RANGES.length)%MAP_RANGES.length;}
function drawMinimap(){
  const g=mapCtx,S=mapS,rng=MAP_RANGES[mapZoom],a=aircraft.position;
  g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,S,S);
  g.save();g.beginPath();g.arc(S/2,S/2,S/2-1,0,Math.PI*2);g.clip();
  g.fillStyle='#0b1622';g.fillRect(0,0,S,S);
  const srcR=rng/STEP,cx=(a.x+R)/STEP,cz=(a.z+R)/STEP;
  g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  g.drawImage(chartBase,cx-srcR,cz-srcR,srcR*2,srcR*2,0,0,S,S);
  const k=S/(2*rng),toS=(x,z)=>[S/2+(x-a.x)*k,S/2+(z-a.z)*k];
  // track
  if(mission.track.length>1){g.strokeStyle='rgba(243,231,201,.55)';g.lineWidth=1.2;g.setLineDash([2,3]);g.beginPath();mission.track.forEach(([x,z],i)=>{const [sx,sz]=toS(x,z);i?g.lineTo(sx,sz):g.moveTo(sx,sz);});const [px,pz]=toS(a.x,a.z);g.lineTo(px,pz);g.stroke();g.setLineDash([]);}
  // runway + strips
  const runway=(x,z,c,s,hl,col)=>{g.save();g.translate(...toS(x,z));g.rotate(Math.atan2(s,c)+Math.PI/2);g.fillStyle=col;g.fillRect(-2,-hl*k,4,hl*2*k);g.restore();};
  runway(0,0,0,1,RUNWAY_HALF_L,'rgba(238,246,252,.9)');
  for(const s of mission.strips)runway(s.x,s.z,s.cos,s.sin,s.halfL,'rgba(243,231,201,.85)');
  // landmarks
  const tgt=nextTarget(),cset=new Set(mission.charter?mission.charter.ids:[]);
  if(mission.mode==='cargo'&&mission.job){
    const [sx,sz]=toS(mission.job.to.x,mission.job.to.z),d=Math.hypot(sx-S/2,sz-S/2);
    if(d>S/2-9){const ang=Math.atan2(sz-S/2,sx-S/2),rx=S/2+Math.cos(ang)*(S/2-9),rz=S/2+Math.sin(ang)*(S/2-9);g.save();g.translate(rx,rz);g.rotate(ang);g.fillStyle=C.cyan;g.beginPath();g.moveTo(6,0);g.lineTo(-3,-5);g.lineTo(-3,5);g.closePath();g.fill();g.restore();}
    else{g.strokeStyle=C.cyan;g.lineWidth=2;g.beginPath();g.arc(sx,sz,9,0,Math.PI*2);g.stroke();}
  }
  for(const l of mission.landmarks){
    const [sx,sz]=toS(l.x,l.z),d=Math.hypot(sx-S/2,sz-S/2),disc=mission.discovered.has(l.id),isT=cset.has(l.id);
    if(d>S/2-9){
      if(tgt&&tgt.id===l.id){const ang=Math.atan2(sz-S/2,sx-S/2),rx=S/2+Math.cos(ang)*(S/2-9),rz=S/2+Math.sin(ang)*(S/2-9);g.save();g.translate(rx,rz);g.rotate(ang);g.fillStyle=C.cyan;g.beginPath();g.moveTo(6,0);g.lineTo(-3,-5);g.lineTo(-3,5);g.closePath();g.fill();g.restore();}
      continue;
    }
    if(disc){g.fillStyle='rgba(8,18,28,.65)';g.beginPath();g.arc(sx,sz,8,0,Math.PI*2);g.fill();drawIcon(g,l.type,sx,sz,11,C.cream,1.6);}
    else{g.save();g.translate(sx,sz);g.rotate(Math.PI/4);const s=tgt&&tgt.id===l.id?9:7;g.fillStyle=isT?'rgba(113,216,238,.25)':'rgba(8,18,28,.5)';g.strokeStyle=isT?C.cyan:'rgba(238,246,252,.7)';g.lineWidth=1.3;g.fillRect(-s/2,-s/2,s,s);g.strokeRect(-s/2,-s/2,s,s);g.restore();
      g.fillStyle=isT?C.cyan:'rgba(238,246,252,.85)';g.font='700 8px Inter, system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText('?',sx,sz+.5);}
  }
  g.restore();
  // rim, north mark, aircraft
  g.strokeStyle='rgba(238,246,252,.22)';g.lineWidth=1;g.beginPath();g.arc(S/2,S/2,S/2-1,0,Math.PI*2);g.stroke();
  g.strokeStyle='rgba(238,246,252,.1)';g.beginPath();g.arc(S/2,S/2,S/4,0,Math.PI*2);g.stroke();
  g.fillStyle=C.ink;g.font='700 9px Inter, system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText('N',S/2,9);
  g.save();g.translate(S/2,S/2);g.rotate(headingDeg()*DEG);g.fillStyle='#fff';g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=1;
  g.beginPath();g.moveTo(0,-8);g.lineTo(5.5,6);g.lineTo(0,3.2);g.lineTo(-5.5,6);g.closePath();g.fill();g.stroke();g.restore();
}

// ---------------------------------------------------------------- 12 Hz readouts
export function hudReadouts(){
  const a=aircraft,kts=Math.round(a.airspeed*KTS_PER_MS),agl=Math.round(a.altAGL*FT_PER_M),msl=Math.round(a.position.y*FT_PER_M),vs=Math.round(a.verticalSpeed*196.85/10)*10;
  $('hdgVal').textContent=String(Math.round(headingDeg())%360).padStart(3,'0');
  $('spdVal').textContent=kts;$('altVal').textContent=agl.toLocaleString();$('mslVal').textContent=`MSL ${msl.toLocaleString()}`;
  $('vsVal').textContent=`${vs>0?'▲':vs<0?'▼':'•'} ${Math.abs(vs).toLocaleString()}`;
  $('thrFill').style.height=`${state.throttle*100}%`;$('thrVal').textContent=`${Math.round(state.throttle*100)}%`;
  const fr=$('fuelRow');fr.style.display=mission.hardcore?'':'none';
  if(mission.hardcore){const fu=mission.fuel;$('fuelFill').style.width=`${fu*100}%`;$('fuelFill').style.background=fu<.15?'var(--red)':fu<.3?'var(--amber)':'var(--lime)';$('fuelVal').textContent=`FUEL ${Math.round(fu*100)}%`;}
  const st=$('flightStatus'),warn=state.crashed?'DAMAGED':a.stall&&a.altAGL>8?'STALL':mission.hardcore&&mission.fuel<=0?'FUEL EXHAUSTED':mission.hardcore&&mission.fuel<.12&&a.altAGL>5?'LOW FUEL':'';st.textContent=warn;st.classList.toggle('show',!!warn);
  // survey ring
  const sv=mission.survey,ring=$('surveyRing');
  if(sv&&state.started){
    ring.classList.add('show');ring.style.setProperty('--p',sv.prog.toFixed(3));
    const known=mission.charter?.ids.includes(sv.l.id);
    $('surveyName').textContent=known?sv.l.name:`Uncharted ${TYPE_LABEL[sv.l.type].toLowerCase()}`;
    $('surveyHint').textContent=sv.why||'Hold steady';
    ring.classList.toggle('active',!sv.why);
  }else ring.classList.remove('show');
  cardTimer+=.08;if(cardTimer>.25){cardTimer=0;updateCardDistances();}
  // wind: arrow shows where the air is going relative to the nose
  const wkt=state.wind.length()*KTS_PER_MS,wInd=$('windInd');
  if(wkt<2.5){wInd.style.opacity=0;}else{
    wInd.style.opacity=1;$('windArrow').style.transform=`rotate(${WEATHER.dir+180-headingDeg()+180}deg)`;
    $('windTxt').innerHTML=`${String(WEATHER.dir).padStart(3,'0')}° ${Math.round(WEATHER.kt)}${WEATHER.gust>0?`<span class="gust">G${Math.round(WEATHER.kt+WEATHER.gust)}</span>`:''} KT`;
  }
  approachGuide();
}

// ---------------------------------------------------------------- charter card
export function hudCharterUpdate(){
  const el=$('charterCard');if(!el)return;
  if(mission.mode==='cargo'){
    const j=mission.job;
    el.innerHTML=j?`<div class="cc-kicker">BUSH PILOT · DELIVERY</div><div class="cc-title">${j.cargo}</div><ul class="cc-list"><li class="target">${iconSvg(j.to.kind==='runway'?'home':j.to.kind==='water'?'lake':'strip','cc-ico')}<span class="cc-name">${j.to.name}</span><span class="cc-dist" id="jobDist"></span></li><li>${iconSvg('wreck','cc-ico')}<span class="cc-name">Payload ${j.kg} kg</span><span class="cc-dist">$${j.pay}</span></li>${j.limit?`<li><span class="cc-name" style="padding-left:25px">Medical deadline</span><span class="cc-dist" id="jobTimer"></span></li>`:''}</ul><div class="cc-foot">Land at <b>${j.to.name}</b> to deliver</div>`
      :`<div class="cc-kicker">BUSH PILOT</div><div class="cc-title">Awaiting a job</div><div class="cc-foot">Pick a delivery from the job board</div>`;
    updateCardDistances();return;
  }
  const c=mission.charter;
  if(!c){
    const n=mission.discovered.size,t=mission.landmarks.length;
    el.innerHTML=`<div class="cc-kicker">EXPLORER · WORLD #${WORLD_SEED}</div><div class="cc-title">${n} of ${t} landmarks charted</div><div class="cc-bar"><i style="width:${t?n/t*100:0}%"></i></div><div class="cc-foot">Fly low over a <b>?</b> marker to chart it</div>`;
    return;
  }
  const ts=charterTargets(),done=ts.filter(l=>mission.discovered.has(l.id)).length,tgt=nextTarget();
  const rows=ts.map(l=>{const d=mission.discovered.has(l.id);return `<li class="${d?'done':tgt&&tgt.id===l.id?'target':''}" data-id="${l.id}">${iconSvg(l.type,'cc-ico')}<span class="cc-name">${l.name}</span><span class="cc-dist">${d?'✓':''}</span></li>`;}).join('');
  const all=done===ts.length;
  el.innerHTML=`<div class="cc-kicker">${mission.mode==='daily'?`DAILY CHARTER #${DAILY_NUMBER}`:'CHARTER'} · ${done}/${ts.length}${mission.bonusLost?' · <span class="cc-lost">BONUS LOST</span>':''}</div><div class="cc-title">${c.title}</div><ul class="cc-list">${rows}</ul><div class="cc-foot">${mission.complete?'Charter complete':all?'<b>Return and land</b> at any strip or home field':'Survey each landmark, then land'}</div>`;
  updateCardDistances();
}
function updateCardDistances(){
  const el=$('charterCard');if(!el)return;
  if(mission.mode==='cargo'&&mission.job){
    const j=mission.job,d=Math.hypot(j.to.x-aircraft.position.x,j.to.z-aircraft.position.z)/1000,dd=$('jobDist');if(dd)dd.textContent=`${d<10?d.toFixed(1):Math.round(d)} km`;
    const tt=$('jobTimer');if(tt&&j.limit){const left=j.limit-(mission.flightTime-j.start);tt.textContent=left>0?fmtTime(left):'LATE';tt.style.color=left<30?'var(--red)':'';}
    return;
  }
  if(!mission.charter)return;
  for(const li of el.querySelectorAll('li[data-id]')){
    const l=landmarkById(+li.dataset.id);if(!l||mission.discovered.has(l.id))continue;
    const d=Math.hypot(l.x-aircraft.position.x,l.z-aircraft.position.z)/1000;li.querySelector('.cc-dist').textContent=`${d<10?d.toFixed(1):Math.round(d)} km`;
  }
}

// ---------------------------------------------------------------- events
let bannerTimer=0;
export function hudBanner(b){
  const el=$('discoveryBanner');
  el.innerHTML=`<div class="db-kicker">${b.rare?'RARE DISCOVERY':'NEW DISCOVERY'}</div><div class="db-row">${iconSvg(b.type,'db-ico')}<div class="db-name">${b.name}</div></div><div class="db-meta">${b.meta}</div><div class="db-xp">+${b.xp} XP${b.clean?' · CLEAN SURVEY':''}${b.rankUp?` · PROMOTED TO ${b.rankUp.toUpperCase()}`:''}</div>${b.charterLeft===0?'<div class="db-next">Charter surveyed — return and land</div>':b.charterLeft?`<div class="db-next">${b.charterLeft} left on this charter</div>`:''}`;
  el.classList.remove('show');void el.offsetWidth;el.classList.add('show');
  clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>el.classList.remove('show'),5200);
  playChime(b.rare?2:1);
  speak(`${b.rare?'Rare find. ':''}${b.name}, charted.${b.charterLeft===0?' Charter surveyed. Return and land.':''}`);
}
let stampTimer=0;
export function hudLanding(l){
  const el=$('landingStamp');
  el.innerHTML=`<div class="ls-stamp g-${l.grade}"><span class="ls-grade">${l.grade}</span><span class="ls-word">${l.label}</span></div><div class="ls-meta">${l.fpm} fpm · ${l.site}</div><div class="ls-xp">+${l.xp} XP${l.rankUp?` · ${l.rankUp.toUpperCase()}`:''}</div>${l.hint?`<div class="ls-hint">${l.hint}</div>`:''}`;
  el.classList.remove('show');void el.offsetWidth;el.classList.add('show');
  clearTimeout(stampTimer);stampTimer=setTimeout(()=>el.classList.remove('show'),4600);
  speak(`${l.label.toLowerCase()} landing, ${l.site}.`);
}
export function hudCharterComplete(r){
  const c=mission.charter,ts=charterTargets(),rk=rankInfo();
  const list=ts.map(l=>`<li>${iconSvg(l.type,'cc-ico')}<span>${l.name}</span></li>`).join('');
  $('completeCard').innerHTML=`
    <div class="kicker">${mission.mode==='daily'?`DAILY CHARTER #${DAILY_NUMBER} · `:''}CHARTER COMPLETE</div>
    <h2 class="cp-title">${c.title}</h2>
    <div class="cp-grid">
      <div class="ls-stamp big g-${r.grade}"><span class="ls-grade">${r.grade}</span><span class="ls-word">${r.label}</span></div>
      <div class="cp-stats">
        <div><span>Landing</span><strong>${r.fpm} fpm · ${r.site}</strong></div>
        <div><span>Flight time</span><strong>${fmtTime(r.time)}</strong></div>
        <div><span>Reward</span><strong>+${r.xp} XP${r.bonusLost?' <em>(landing bonus lost)</em>':''}</strong></div>
        <div><span>Rank</span><strong>${rk.name}${r.rankUp?' · promoted!':''}</strong></div>
        <div class="cp-rank"><i style="width:${Math.round(rk.pct*100)}%"></i></div>
      </div>
    </div>
    <ul class="cp-list">${list}</ul>
    ${r.share?`<div class="cp-share"><code id="shareText">${r.share}</code><button id="copyShare">COPY</button></div>`:''}
    <div class="modal-actions"><button class="primary" id="cpChart">SAVE CHART ↓</button><button id="cpNext">NEXT CHARTER</button><button id="cpNewWorld">NEW WORLD</button><button id="cpKeep">KEEP FLYING</button></div>`;
  $('completeOverlay').style.display='grid';
  $('cpChart').onclick=()=>downloadChart();
  $('cpKeep').onclick=()=>{$('completeOverlay').style.display='none';};
  $('cpNewWorld').onclick=()=>$('newWorldBtn').click();
  $('cpNext').onclick=()=>{$('completeOverlay').style.display='none';hudEvents.nextCharter?.();};
  if(r.share)$('copyShare').onclick=async()=>{try{await navigator.clipboard.writeText(r.share);$('copyShare').textContent='COPIED';}catch{}};
  playChime(3);
}
export const hudEvents={};

// soft two-note chime for discoveries (Web Audio, no assets)
let chimeCtx=null;
function playChime(kind){
  if(!state.audioEnabled)return;
  try{
    chimeCtx=chimeCtx||new (window.AudioContext||window.webkitAudioContext)();const ctx=chimeCtx,t=ctx.currentTime;
    const notes=kind===3?[523.25,659.25,783.99,1046.5]:kind===2?[587.33,880,1174.66]:[659.25,987.77];
    notes.forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t+i*.11);g.gain.linearRampToValueAtTime(.07*state.audioVolume,t+i*.11+.02);g.gain.exponentialRampToValueAtTime(.0001,t+i*.11+1.4);o.connect(g);g.connect(ctx.destination);o.start(t+i*.11);o.stop(t+i*.11+1.5);});
  }catch{}
}

// ---------------------------------------------------------------- full chart + export
export function drawChart(g,size,{labels=true,track=true}={}){
  g.save();g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  g.drawImage(chartBase,0,0,N,N,0,0,size,size);
  const k=size/(2*R),toS=(x,z)=>[(x+R)*k,(z+R)*k];
  // grid
  g.strokeStyle='rgba(238,246,252,.07)';g.lineWidth=1;for(let v=-R;v<=R;v+=2000){const [p]=toS(v,0);g.beginPath();g.moveTo(p,0);g.lineTo(p,size);g.stroke();g.beginPath();g.moveTo(0,p);g.lineTo(size,p);g.stroke();}
  if(track&&mission.track.length>1){g.strokeStyle='rgba(243,231,201,.75)';g.lineWidth=Math.max(1.2,size/700);g.setLineDash([size/260,size/220]);g.beginPath();mission.track.forEach(([x,z],i)=>{const [sx,sz]=toS(x,z);i?g.lineTo(sx,sz):g.moveTo(sx,sz);});g.stroke();g.setLineDash([]);}
  const rw=(x,z,c,s,hl,col)=>{g.save();g.translate(...toS(x,z));g.rotate(Math.atan2(s,c)+Math.PI/2);g.fillStyle=col;const w=Math.max(2.5,size/300);g.fillRect(-w/2,-hl*k,w,hl*2*k);g.restore();};
  rw(0,0,0,1,RUNWAY_HALF_L,'#ffffff');for(const s of mission.strips)rw(s.x,s.z,s.cos,s.sin,s.halfL,C.cream);
  const fs=Math.round(size/58);
  g.textAlign='center';g.textBaseline='top';
  const label=(text,x,y,font,col)=>{g.font=font;g.lineWidth=Math.max(3,fs/3.5);g.strokeStyle='rgba(6,14,22,.8)';g.strokeText(text,x,y);g.fillStyle=col;g.fillText(text,x,y);};
  if(labels){
    const [hx,hz]=toS(0,0);label('Home Field',hx,hz+RUNWAY_HALF_L*k+fs*.4,`600 ${Math.round(fs*.8)}px Inter, system-ui`,C.ink);
    for(const s of mission.strips){const [sx,sz]=toS(s.x,s.z);label(s.name,sx,sz+fs*.9,`600 ${Math.round(fs*.72)}px Inter, system-ui`,C.cream);}
  }
  for(const l of mission.landmarks){
    const [sx,sz]=toS(l.x,l.z),disc=mission.discovered.has(l.id),is=fs*1.5;
    g.fillStyle='rgba(6,14,22,.72)';g.beginPath();g.arc(sx,sz,is*.72,0,Math.PI*2);g.fill();
    g.strokeStyle=disc?C.cream:'rgba(238,246,252,.35)';g.lineWidth=Math.max(1,fs/12);g.stroke();
    if(disc){drawIcon(g,l.type,sx,sz,is*.9,C.cream,1.8);if(labels)label(l.name,sx,sz+is*.85,`italic 500 ${fs}px Fraunces, Georgia, serif`,C.cream);}
    else{g.fillStyle='rgba(238,246,252,.55)';g.font=`700 ${Math.round(fs*.9)}px Inter, system-ui`;g.textBaseline='middle';g.fillText('?',sx,sz+1);g.textBaseline='top';}
  }
  // compass rose + scale bar
  const rx=size-fs*3.2,ry=fs*3.4;g.strokeStyle=C.ink;g.fillStyle=C.ink;g.lineWidth=Math.max(1,fs/14);
  g.beginPath();g.arc(rx,ry,fs*1.6,0,Math.PI*2);g.globalAlpha=.4;g.stroke();g.globalAlpha=1;
  g.beginPath();g.moveTo(rx,ry-fs*1.6);g.lineTo(rx+fs*.4,ry);g.lineTo(rx,ry+fs*.4);g.lineTo(rx-fs*.4,ry);g.closePath();g.fill();
  g.font=`700 ${Math.round(fs*.8)}px Inter, system-ui`;g.textBaseline='bottom';g.fillText('N',rx,ry-fs*1.75);
  const bar=5000*k,bx=fs*1.4,by=size-fs*1.6;g.fillRect(bx,by,bar,Math.max(2,fs/8));g.textBaseline='bottom';g.textAlign='left';g.font=`600 ${Math.round(fs*.7)}px Inter, system-ui`;g.fillText('5 KM',bx,by-fs*.25);
  g.restore();
}
export function openChart(){
  if(!chartBase)return;
  const S=Math.min(innerHeight-200,innerWidth-80,820),c=$('chartCanvas'),r=Math.min(2,devicePixelRatio||1);
  c.style.width=c.style.height=`${S}px`;c.width=c.height=S*r;const g=c.getContext('2d');g.setTransform(r,0,0,r,0,0);drawChart(g,S);
  $('chartTitle').textContent=`Chart of World #${WORLD_SEED}`;
  $('chartMeta').textContent=`${mission.discovered.size} of ${mission.landmarks.length} landmarks charted · ${mission.strips.length} bush strips · ${sky.name}`;
  $('chartOverlay').style.display='grid';
}
export function closeChart(){$('chartOverlay').style.display='none';}
export function toggleChart(){if($('chartOverlay').style.display==='grid')closeChart();else openChart();}
export function downloadChart(){
  const W=1800,H=1200,c=canvas(W,H),g=c.getContext('2d');
  const bg=g.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#0d2133');bg.addColorStop(1,'#060f18');g.fillStyle=bg;g.fillRect(0,0,W,H);
  const M=70,S=H-2*M;g.save();g.beginPath();g.roundRect(M,M,S,S,18);g.clip();g.translate(M,M);drawChart(g,S);g.restore();
  g.strokeStyle='rgba(238,246,252,.18)';g.lineWidth=2;g.beginPath();g.roundRect(M,M,S,S,18);g.stroke();
  const x=M+S+70;let y=M+20;
  g.fillStyle=C.cyan;g.font='800 22px Inter, system-ui';g.textAlign='left';g.textBaseline='top';g.fillText(IS_DAILY?`SKYBOUND · DAILY CHARTER #${DAILY_NUMBER}`:'SKYBOUND · FIRST CHARTER',x,y);y+=50;
  g.fillStyle=C.ink;g.font='italic 500 64px Fraunces, Georgia, serif';g.fillText(`World #${WORLD_SEED}`,x,y);y+=96;
  const stat=(k,v)=>{g.fillStyle=C.muted;g.font='600 18px Inter, system-ui';g.fillText(k.toUpperCase(),x,y);g.fillStyle=C.ink;g.font='600 30px Inter, system-ui';g.fillText(v,x,y+26);y+=84;};
  stat('Charted',`${mission.discovered.size} of ${mission.landmarks.length} landmarks`);
  if(mission.charter)stat('Charter',mission.charter.title);
  stat('Flight time',fmtTime(mission.flightTime));
  stat('Pilot',`${rankInfo().name} · avg landing ${averageGrade()}`);
  y+=10;g.fillStyle=C.muted;g.font='600 18px Inter, system-ui';g.fillText('DISCOVERIES',x,y);y+=36;
  for(const l of mission.landmarks.filter(l=>mission.discovered.has(l.id)).slice(0,8)){drawIcon(g,l.type,x+14,y+14,26,C.cream,1.8);g.fillStyle=C.cream;g.font='italic 500 28px Fraunces, Georgia, serif';g.fillText(l.name,x+42,y);y+=44;}
  g.fillStyle=C.dim;g.font='500 16px Inter, system-ui';g.fillText(location.origin+location.pathname+`?seed=${WORLD_SEED}`,x,H-M-20);
  c.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`skybound-world-${WORLD_SEED}.png`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},800);},'image/png');
}

// ---------------------------------------------------------------- camera label
let camTimer=0;
export function hudCamera(name){const el=$('cameraName');if(!el)return;el.textContent=name;el.classList.add('show');clearTimeout(camTimer);camTimer=setTimeout(()=>el.classList.remove('show'),1600);}

// ---------------------------------------------------------------- approach guide
// Appears when lined up with the home runway or a bush strip: diamond markers show deviation
// from a 3° glide path to a point 60 m past the threshold, and from the centreline.
function approachGuide(){
  const el=$('approachGuide'),a=aircraft,p=a.position;
  if(!state.started||a.altAGL<3||a.altAGL>520){el.classList.remove('show');return;}
  const fx=-Math.sin(a.yaw),fz=-Math.cos(a.yaw),sites=[{name:'Home Field',x:0,z:0,cos:0,sin:1,halfL:RUNWAY_HALF_L,h:AIRPORT_H}];
  for(const s of mission.strips)sites.push({name:s.name,x:s.x,z:s.z,cos:s.cos,sin:s.sin,halfL:s.halfL,h:s.h});
  let best=null;
  for(const s of sites)for(const dir of [1,-1]){
    const dx=s.cos*dir,dz=s.sin*dir;if(fx*dx+fz*dz<Math.cos(35*DEG))continue;
    const tx=s.x-dx*(s.halfL-60),tz=s.z-dz*(s.halfL-60),rx=tx-p.x,rz=tz-p.z,along=rx*dx+rz*dz,cross=-rx*dz+rz*dx;
    if(along<120||along>4500||Math.abs(cross)>along*.35+60)continue;
    if(!best||along<best.along)best={s,along,cross};
  }
  if(!best){el.classList.remove('show');return;}
  el.classList.add('show');
  const target=best.s.h+best.along*Math.tan(3*DEG),dev=(p.y-target)/Math.max(6,best.along*Math.tan(1*DEG));
  $('apName').textContent=best.s.name.toUpperCase();
  $('apGlide').style.top=`${50-clamp(dev,-1,1)*44}%`;
  $('apLoc').style.left=`${50+clamp(best.cross/Math.max(12,best.along*.06),-1,1)*46}%`;
  $('apDist').textContent=`${(best.along/1000).toFixed(1)} km · ${dev>.35?'high':dev<-.35?'low':'on path'}`;
}

// Radio-style voice callouts (Web Speech API), optional in settings.
export function speak(text){
  if(state.voice===false||!state.audioEnabled||!('speechSynthesis' in window))return;
  try{const u=new SpeechSynthesisUtterance(text);u.rate=1.04;u.pitch=.92;u.volume=.75*state.audioVolume;
    const v=speechSynthesis.getVoices().find(v=>/en-(GB|US)/.test(v.lang)&&/Daniel|Samantha|Google UK|Serena|Alex/.test(v.name));if(v)u.voice=v;
    speechSynthesis.cancel();speechSynthesis.speak(u);}catch{}
}

// ---------------------------------------------------------------- Bush Pilot job board
export function hudJobBoard({delivered,jobs}){
  const rows=jobs.map((j,i)=>`<button class="job" data-i="${i}"><div class="job-top"><span class="job-cargo">${j.cargo}</span><span class="job-pay">$${j.pay}</span></div><div class="job-route">${iconSvg(j.to.kind==='runway'?'home':j.to.kind==='water'?'lake':'strip','cc-ico')}<span>${j.from.name} → <b>${j.to.name}</b></span></div><div class="job-meta">${(j.dist/1000).toFixed(1)} km ${j.dir} · ${j.kg} kg${j.limit?` · <span class="job-timed">⏱ ${fmtTime(j.limit)}</span>`:''}</div></button>`).join('');
  const head=delivered?`<div class="kicker">DELIVERED · ${delivered.to.name.toUpperCase()}</div><h2 class="cp-title">${delivered.cargo}</h2>
    <div class="job-receipt"><div><span>Landing</span><strong>${delivered.grade}</strong></div><div><span>Time</span><strong>${fmtTime(delivered.elapsed)}${delivered.late?' · late':''}</strong></div><div><span>Paid</span><strong>$${delivered.pay}${delivered.timeBonus?` <em>(+$${delivered.timeBonus} on time)</em>`:''}</strong></div><div><span>XP</span><strong>+${delivered.xp}${delivered.rankUp?` · ${delivered.rankUp}`:''}</strong></div></div>
    <div class="board-head"><span>NEXT JOBS</span><span class="board-sub">Wallet $${(progress.pilot.cash||0).toLocaleString()}</span></div>`
    :`<div class="kicker">BUSH PILOT · JOB BOARD</div><h2 class="cp-title">Pick a delivery</h2><div class="board-head"><span>AVAILABLE JOBS</span><span class="board-sub">Wallet $${(progress.pilot.cash||0).toLocaleString()}</span></div>`;
  $('completeCard').innerHTML=`${head}<div class="jobs">${rows}</div><div class="modal-actions"><button id="jbExplore">EXPLORE INSTEAD</button></div>`;
  $('completeOverlay').style.display='grid';state.paused=true;
  for(const b of $('completeCard').querySelectorAll('.job'))b.onclick=()=>{acceptJob(jobs[+b.dataset.i]);$('completeOverlay').style.display='none';state.paused=false;hudEvents.setHud?.();};
  $('jbExplore').onclick=()=>{mission.mode='free';mission.job=null;mission.cargoKg=0;hudCharterUpdate();$('completeOverlay').style.display='none';state.paused=false;hudEvents.setHud?.();};
  if(delivered){playChime(3);speak(`Delivery complete at ${delivered.to.name}. ${delivered.pay} dollars.`);}
}
export function explorerShare(){
  const n=mission.discovered.size,t=mission.landmarks.length;
  return `SKYBOUND · World #${WORLD_SEED}: ${n}/${t} discovered · ${location.origin+location.pathname}?seed=${WORLD_SEED}`;
}
