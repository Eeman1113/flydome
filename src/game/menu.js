// SKYBOUND · menu — charter board, pilot card, daily charter, resume and logbook.
import { $ } from './util.js';
import { achievementsHtml } from './achievements.js';
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
// First visit: until the pilot has landed once or opened Flight School, point them at the lessons.
function firstVisitNudge(){
  const t=$('teachBtn');if(!t)return;let seen=false;try{seen=localStorage.getItem('skybound.taught')==='1';}catch{}
  const fresh=!seen&&progress.pilot.landings===0&&progress.pilot.flightTime<120;
  t.classList.toggle('nudge',fresh);
  if(!t.dataset.bound){t.dataset.bound='1';t.addEventListener('click',()=>{try{localStorage.setItem('skybound.taught','1');}catch{}t.classList.remove('nudge');});}
}
export function renderMenu(){
  bindTabs();firstVisitNudge();renderBoard();renderPilot();renderDaily();renderHangar();
  if(IS_DAILY){const k=$('worldSeed')?.parentElement;if(k)k.innerHTML=`DAILY CHARTER #${DAILY_NUMBER} · WORLD <span id="worldSeed">#${WORLD_SEED}</span>`;}
  const prev=previousWorld,btn=$('resumeWorldBtn');
  if(prev&&prev.seed!==WORLD_SEED&&!prev.daily){btn.style.display='';btn.querySelector('small').textContent=`World #${prev.seed}`;btn.onclick=()=>goTo({seed:prev.seed});}
  else btn.style.display='none';
}
function renderBoard(){
  const el=$('charterBoard');
  if(IS_DAILY){
    const c=dailyCharter();el.innerHTML=c?cardHtml(c,0,true):'';menuState.charter=0;
    $('startBtn').innerHTML=`${lucide('PlaneTakeoff')}<span>FLY DAILY CHARTER</span>${lucide('ArrowRight',{cls:'ic ic-go'})}`;return;
  }
  const amph=!!AIRCRAFT[aircraftState.variant].floats;
  if(mission.charters[menuState.charter]?.water&&!amph)menuState.charter=0;
  el.innerHTML=mission.charters.map((c,i)=>cardHtml(c,i,i===menuState.charter,c.water&&!amph)).join('')||'<div class="board-empty">No landmarks found — try a new world.</div>';
  for(const b of el.querySelectorAll('.charter:not(.locked)')){b.onclick=()=>{menuState.charter=+b.dataset.i;renderBoard();};b.ondblclick=()=>$('startBtn').click();}
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
  const res=progress.daily[DAILY_NUMBER];
  $('dailyTitle').textContent=`Daily Charter #${DAILY_NUMBER}`;
  $('dailyStatus').textContent=res?`Completed · landing ${res.grade} · ${Math.floor(res.time/60)}:${String(res.time%60).padStart(2,'0')}`:'One shared world for every pilot today';
  const b=$('dailyBtn');
  if(IS_DAILY){iconButton(b,'X','EXIT DAILY');b.onclick=()=>goTo({});}
  else{iconButton(b,res?'RotateCcw':'CalendarDays',res?'FLY AGAIN':'PLAY DAILY');b.onclick=()=>goTo({daily:'1'});}
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
    ${achievementsHtml()}
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
function renderHangar(){
  const el=$('hangar');if(!el)return;
  const ac=Object.values(AIRCRAFT).filter(v=>!v.secret||aircraftState.variant===v.id).map(v=>{const ok=unlocked(v.rank),sel=aircraftState.variant===v.id;
    return `<button class="hg-ac${sel?' selected':''}${ok?'':' locked'}" data-ac="${v.id}" ${ok?'':'disabled'}><strong>${v.short}</strong><small>${ok?'':lucide('Lock',{size:12,cls:'ic ic-inline'})}${ok?(v.jet?'Cheat unlocked · afterburner':v.floats?'Lands on water & runways':'All-round tourer'):`Unlocks at ${RANKS[v.rank][1]}`}</small></button>`;}).join('');
  const lv=LIVERIES.map(l=>{const ok=unlocked(l.rank),sel=aircraftState.livery===l.id;return `<button class="hg-sw${sel?' selected':''}${ok?'':' locked'}" data-lv="${l.id}" title="${l.name}${ok?'':` · unlocks at ${RANKS[l.rank][1]}`}" style="--c:#${l.tint.toString(16).padStart(6,'0')}" ${ok?'':'disabled'}></button>`;}).join('');
  el.innerHTML=`<div class="side-kicker">${lucide('Plane',{size:13,cls:'ic ic-inline'})}HANGAR</div><div class="hg-row">${ac}</div><div class="hg-label">Paint · <span>${(LIVERIES.find(l=>l.id===aircraftState.livery)||LIVERIES[0]).name}</span></div><div class="hg-sws">${lv}</div>
    <label class="hg-hard"><input type="checkbox" id="hardcoreToggle" ${progress.pilot.hardcore?'checked':''}><span><strong>${lucide('Flame',{size:14,cls:'ic ic-inline ic-sun'})}Hardcore charters</strong><small>Limited fuel, refuel at strips · +50% XP</small></span></label>`;
  for(const b of el.querySelectorAll('[data-ac]'))b.onclick=async()=>{if(b.disabled||aircraftState.variant===b.dataset.ac)return;progress.pilot.aircraft=b.dataset.ac;saveProgress();el.classList.add('busy');await swapAircraft(b.dataset.ac);el.classList.remove('busy');renderHangar();renderBoard();};
  for(const b of el.querySelectorAll('[data-lv]'))b.onclick=()=>{if(b.disabled)return;progress.pilot.livery=b.dataset.lv;saveProgress();applyLivery(b.dataset.lv);renderHangar();};
  $('hardcoreToggle').onchange=e=>{progress.pilot.hardcore=e.target.checked;saveProgress();};
}
