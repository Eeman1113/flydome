// SKYBOUND · menu — charter board, pilot card, daily charter, resume and logbook.
import { $ } from './util.js';
import { lucide, iconButton } from './lucide.js';
import { DAILY_NUMBER, IS_DAILY, WORLD_SEED, AIRCRAFT, LIVERIES, aircraftState, urlParams } from './config.js';
import { swapAircraft } from './engine.js';
import { applyLivery } from './engine.js';
import { mission, dailyCharter, landmarkById } from './survey.js';
import { progress, previousWorld, rankInfo, averageGrade, RANKS, saveProgress } from './progress.js';
import { iconSvg, TYPE_LABEL } from './icons.js';
import { openModal } from './ui.js';

export const menuState={charter:0};

function goTo(params){const u=new URL(location.href);u.search='';for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);location.href=u.toString();}

// Mode tabs (Charters / Daily / Bush Pilot / Explore): roving tabindex, arrow keys, remembered per browser.
let tabsBound=false;
function setTab(name,focus){
  const root=$('mainMenu');if(!root)return;root.dataset.tab=name;
  for(const t of root.querySelectorAll('[role=tab]')){const on=t.dataset.tab===name;t.setAttribute('aria-selected',on);t.tabIndex=on?0:-1;if(on&&focus)t.focus();}
  try{localStorage.setItem('skybound.tab',name);}catch{}
}
function bindTabs(){
  if(tabsBound)return;tabsBound=true;const tabs=[...document.querySelectorAll('#mainMenu [role=tab]')];
  tabs.forEach((t,i)=>{t.onclick=()=>setTab(t.dataset.tab);t.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const n=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];setTab(n.dataset.tab,true);}};});
  let saved='charters';try{saved=localStorage.getItem('skybound.tab')||'charters';}catch{}
  setTab(IS_DAILY?'charters':saved);
}
export function renderMenu(){
  bindTabs();renderBoard();renderPilot();renderDaily();renderHangar();
  if(IS_DAILY){const k=$('worldSeed')?.parentElement;if(k)k.innerHTML=`DAILY CHARTER #${DAILY_NUMBER} · WORLD <span id="worldSeed">#${WORLD_SEED}</span>`;}
  const prev=previousWorld,btn=$('resumeWorldBtn');
  if(prev&&prev.seed!==WORLD_SEED&&!prev.daily){btn.style.display='';btn.querySelector('small').textContent=`World #${prev.seed}`;btn.onclick=()=>goTo({seed:prev.seed});}
  else btn.style.display='none';
}
// Minimal charter picker: one line with the selected charter, stepped with the arrows.
function availableCharters(){const amph=!!AIRCRAFT[aircraftState.variant].floats;return mission.charters.map((c,i)=>({c,i,locked:c.water&&!amph}));}
function renderBoard(){
  const name=$('chName'),meta=$('chMeta'),label=$('startBtn')?.querySelector('.mn-label');
  if(IS_DAILY){
    const c=dailyCharter();menuState.charter=0;if(label)label.textContent='Fly daily charter';
    if(name)name.textContent=c?c.title:'—';if(meta)meta.textContent=c?charterMeta(c):'';
    for(const id of ['chPrev','chNext'])$(id)&&($(id).hidden=true);return;
  }
  const list=availableCharters();
  if(!list.length){if(name)name.textContent='No landmarks found';if(meta)meta.textContent='Try a new world';return;}
  if(!list[menuState.charter]||list[menuState.charter].locked)menuState.charter=list.find(x=>!x.locked)?.i??0;
  const cur=list[menuState.charter],c=cur.c;
  if(name)name.textContent=c.title;
  if(meta)meta.textContent=cur.locked?'Needs the Caravan Amphibian':charterMeta(c);
  const step=d=>{const open=list.filter(x=>!x.locked);const k=open.findIndex(x=>x.i===menuState.charter);menuState.charter=open[(k+d+open.length)%open.length].i;renderBoard();};
  $('chPrev').onclick=()=>step(-1);$('chNext').onclick=()=>step(1);
  const multi=list.filter(x=>!x.locked).length>1;$('chPrev').hidden=$('chNext').hidden=!multi;
}
function charterMeta(c){
  const ls=c.ids.map(landmarkById).filter(Boolean),done=ls.filter(l=>mission.discovered.has(l.id)).length;
  return `${ls.map(l=>l.name).join(' · ')}  —  ${c.km.toFixed(0)} km · ${['easy','medium','hard'][c.difficulty-1]}${c.water?' · water':''}${done?` · ${done}/${ls.length} charted`:''}`;
}
function cardHtml(c,i,sel,locked=false){
  const ls=c.ids.map(landmarkById).filter(Boolean),done=ls.filter(l=>mission.discovered.has(l.id)).length;
  const chips=ls.map(l=>`<span class="chip${mission.discovered.has(l.id)?' done':''}" title="${TYPE_LABEL[l.type]}">${iconSvg(l.type,'chip-ico')}${l.name}</span>`).join('');
  const dots=[1,2,3].map(d=>`<i class="${d<=c.difficulty?'on':''}"></i>`).join('')+`<em>${['Easy','Medium','Hard'][c.difficulty-1]}</em>`;
  return `<button class="charter${sel?' selected':''}${c.water?' water':''}${locked?' locked':''}" data-i="${i}" ${locked?'disabled':''}><div class="ch-top"><span class="ch-title">${c.water?'<em class="ch-tag">WATER STRIP</em>':''}${c.title}</span><span class="ch-diff" aria-label="Difficulty: ${['easy','medium','hard'][c.difficulty-1]}">${dots}</span></div><div class="ch-chips">${chips}</div><div class="ch-meta">${locked?lucide('Lock',{size:14,cls:'ic ch-lock'})+`Needs the Caravan Amphibian${unlocked(AIRCRAFT.floats.rank)?' · pick it in the hangar':` · unlocks at ${RANKS[AIRCRAFT.floats.rank][1]}`}`:`${c.km.toFixed(0)} km route · ≈ ${c.minutes} min${c.water?` · alight on ${landmarkById(c.alight)?.name}`:''}${done?` · ${done}/${ls.length} charted`:''}`}</div></button>`;
}
function renderPilot(){
  const r=rankInfo(),p=progress.pilot;
  $('pilotRank').textContent=r.name;
  $('pilotXp').textContent=r.next?`${p.xp.toLocaleString()} / ${r.next.toLocaleString()} XP`:`${p.xp.toLocaleString()} XP · max rank`;
  $('pilotXpBar').style.width=`${Math.round(r.pct*100)}%`;
  $('pilotStats').innerHTML=`<span><b>${p.discoveries}</b> charted</span><span><b>${p.charters}</b> charters</span><span><b>$${(p.cash||0).toLocaleString()}</b> earned</span><span><b>${averageGrade()}</b> avg</span>`;
}
function renderDaily(){
  const res=progress.daily[DAILY_NUMBER],b=$('dailyBtn');
  $('dailyTitle').textContent=`Daily Charter #${DAILY_NUMBER}`;
  const label=b.querySelector('.mn-label');
  if(IS_DAILY){label.textContent='Leave daily';$('dailyStatus').textContent='Back to this week\u2019s worlds';b.onclick=()=>goTo({});return;}
  label.textContent=`Daily charter #${DAILY_NUMBER}`;
  $('dailyStatus').textContent=res?`Done · ${res.grade} landing · ${Math.floor(res.time/60)}:${String(res.time%60).padStart(2,'0')}`:'One world for every pilot today';
  b.onclick=()=>goTo({daily:'1'});
}

export function logbookModal(){
  const r=rankInfo(),p=progress.pilot,h=Math.floor(p.flightTime/3600),m=Math.floor(p.flightTime%3600/60);
  const stamps=['peak','lake','crater','island','forest','river','pass','gorge','falls','stacks','cape','lighthouse','glacier','spire','arch','wreck'].map(t=>`<div class="stamp${p.stamps[t]?' got':''}">${iconSvg(t,'st-ico')}<span>${TYPE_LABEL[t]}</span><b>${p.stamps[t]||0}</b></div>`).join('')+`<div class="stamp rare${p.stamps.rare?' got':''}">★<span>Rare finds</span><b>${p.stamps.rare||0}</b></div>`;
  const ranks=RANKS.map(([xp,n],i)=>`<li class="${i<=r.index?'got':''}"><span>${n}</span><em>${xp.toLocaleString()} XP</em></li>`).join('');
  const g=p.grades,total=Object.values(g).reduce((a,b)=>a+b,0)||1;
  const bars=['S','A','B','C','D'].map(k=>`<div class="gb"><span>${k}</span><i style="width:${g[k]/total*100}%"></i><b>${g[k]}</b></div>`).join('');
  openModal('Pilot logbook',`
    <div class="lb-head"><div><div class="kicker">${r.name.toUpperCase()}</div><div class="lb-xp">${p.xp.toLocaleString()} XP</div></div><div class="lb-bar"><i style="width:${Math.round(r.pct*100)}%"></i></div></div>
    <div class="lb-grid">
      <div><span>Worlds flown</span><b>${p.worlds}</b></div><div><span>Landmarks charted</span><b>${p.discoveries}</b></div>
      <div><span>Charters complete</span><b>${p.charters}</b></div><div><span>Flight time</span><b>${h}h ${m}m</b></div>
      <div><span>Landings</span><b>${p.landings}</b></div><div><span>Best landing</span><b>${p.best||'—'}</b></div>
      <div><span>Deliveries</span><b>${p.deliveries||0}</b></div><div><span>Earnings</span><b>$${(p.cash||0).toLocaleString()}</b></div>
    </div>
    <h3 class="lb-h">Discovery stamps</h3><div class="stamps">${stamps}</div>
    <h3 class="lb-h">Landing grades</h3><div class="grades">${bars}</div>
    <h3 class="lb-h">Ranks</h3><ul class="ranks">${ranks}</ul>`);
}

// ---------------------------------------------------------------- hangar
const UNLOCK_ALL=urlParams.has('unlock');
export function unlocked(rank){return UNLOCK_ALL||rankInfo().index>=rank;}
export function initialLoadout(){
  const p=progress.pilot;
  aircraftState.variant=(p.aircraft&&AIRCRAFT[p.aircraft]&&unlocked(AIRCRAFT[p.aircraft].rank))?p.aircraft:'skylane';
  if(urlParams.get('plane')&&AIRCRAFT[urlParams.get('plane')])aircraftState.variant=urlParams.get('plane');
  const L=LIVERIES.find(l=>l.id===p.livery);aircraftState.livery=L&&unlocked(L.rank)?L.id:'factory';
  return aircraftState.variant;
}
// Minimal hangar: aircraft name with arrows, paint dots, and a quiet hardcore toggle.
function renderHangar(){
  const el=$('hangar');if(!el)return;
  const fleet=Object.values(AIRCRAFT).filter(v=>(!v.secret||aircraftState.variant===v.id)&&unlocked(v.rank)),cur=AIRCRAFT[aircraftState.variant];
  const lockedNext=Object.values(AIRCRAFT).find(v=>!v.secret&&!unlocked(v.rank));
  const lv=LIVERIES.map(l=>{const ok=unlocked(l.rank),sel=aircraftState.livery===l.id;return `<button class="mn-sw${sel?' on':''}" data-lv="${l.id}" ${ok?'':'disabled'} aria-label="${l.name}${ok?'':' (locked)'}" title="${l.name}${ok?'':` · ${RANKS[l.rank][1]}`}" style="--c:#${l.tint.toString(16).padStart(6,'0')}"></button>`;}).join('');
  el.innerHTML=`<div class="mn-ac">${fleet.length>1?`<button class="mn-step" data-step="-1" aria-label="Previous aircraft">${lucide('ChevronLeft')}</button>`:''}<div><b>${cur.short}</b><small>${lockedNext?`${lockedNext.short} at ${RANKS[lockedNext.rank][1]}`:'All aircraft unlocked'}</small></div>${fleet.length>1?`<button class="mn-step" data-step="1" aria-label="Next aircraft">${lucide('ChevronRight')}</button>`:''}</div>
    <div class="mn-sws" role="group" aria-label="Paint">${lv}</div>
    <label class="mn-hard"><input type="checkbox" id="hardcoreToggle" ${progress.pilot.hardcore?'checked':''}><span>Hardcore</span></label>`;
  for(const b of el.querySelectorAll('[data-step]'))b.onclick=async()=>{const k=fleet.findIndex(v=>v.id===aircraftState.variant),n=fleet[(k+ +b.dataset.step+fleet.length)%fleet.length];if(!n||n.id===aircraftState.variant)return;
    progress.pilot.aircraft=n.id;saveProgress();el.classList.add('busy');await swapAircraft(n.id);el.classList.remove('busy');renderHangar();renderBoard();};
  for(const b of el.querySelectorAll('[data-lv]'))b.onclick=()=>{if(b.disabled)return;progress.pilot.livery=b.dataset.lv;saveProgress();applyLivery(b.dataset.lv);renderHangar();};
  $('hardcoreToggle').onchange=e=>{progress.pilot.hardcore=e.target.checked;saveProgress();};
}
