// SKYBOUND · achievements, stored in the pilot logbook. Stat-based ones are checked every couple of
// seconds; event-based ones are fired from the game (achEvent). Unlocks show a banner and a chime.
import { aircraft, state, AIRCRAFT, aircraftState } from './config.js';
import { progress, saveProgress } from './progress.js';
import { lucide } from './lucide.js';
import { $ } from './util.js';
import { sfx } from './sfx.js';

const P=()=>progress.pilot;
export const ACHIEVEMENTS=[
  {id:'firstFlight',name:'Wheels Up',desc:'Take off for the first time',icon:'PlaneTakeoff'},
  {id:'graduate',name:'Graduate',desc:'Finish Flight School',icon:'GraduationCap'},
  {id:'firstFind',name:'First Find',desc:'Chart your first landmark',icon:'Map',test:()=>P().discoveries>=1},
  {id:'explorer',name:'Explorer',desc:'Chart 10 landmarks',icon:'Compass',test:()=>P().discoveries>=10},
  {id:'cartographer',name:'Cartographer',desc:'Chart 50 landmarks',icon:'Map',test:()=>P().discoveries>=50},
  {id:'rareHunter',name:'Rare Hunter',desc:'Find 5 rare landmarks',icon:'Sparkles',test:()=>(P().stamps.rare||0)>=5},
  {id:'craterDiver',name:'Crater Diver',desc:'Survey a crater lake',icon:'Mountain',test:()=>(P().stamps.crater||0)>=1},
  {id:'gorgeRunner',name:'Gorge Runner',desc:'Fly a gorge end to end',icon:'Navigation',test:()=>(P().stamps.gorge||0)>=1},
  {id:'firstCharter',name:'Chartered',desc:'Complete a charter',icon:'Check',test:()=>P().charters>=1},
  {id:'veteran',name:'Veteran Surveyor',desc:'Complete 10 charters',icon:'Trophy',test:()=>P().charters>=10},
  {id:'butter',name:'Butter',desc:'Make an S-grade landing',icon:'Sparkles',test:()=>P().grades.S>=1},
  {id:'greaser',name:'Greaser',desc:'Make 5 S-grade landings',icon:'Trophy',test:()=>P().grades.S>=5},
  {id:'splashdown',name:'Splashdown',desc:'Land on water',icon:'Ship'},
  {id:'firstDelivery',name:'Bush Pilot',desc:'Deliver your first cargo',icon:'Package',test:()=>(P().deliveries||0)>=1},
  {id:'hauler',name:'Hauler',desc:'Make 10 deliveries',icon:'Package',test:()=>(P().deliveries||0)>=10},
  {id:'lifesaver',name:'Lifesaver',desc:'Deliver a medical run on time',icon:'Clock'},
  {id:'rich',name:'Well Paid',desc:'Earn $5,000',icon:'Coins',test:()=>(P().cash||0)>=5000},
  {id:'hardcore',name:'Running on Fumes',desc:'Complete a Hardcore charter',icon:'Fuel'},
  {id:'daily',name:'Daily Driver',desc:'Complete a Daily Charter',icon:'CalendarDays'},
  {id:'worldHopper',name:'World Hopper',desc:'Fly in 5 different worlds',icon:'RefreshCw',test:()=>P().worlds>=5},
  {id:'hours',name:'Ten Hours',desc:'Log 10 hours of flight time',icon:'Clock',test:()=>P().flightTime>=36000},
  {id:'rough',name:'Learning Experience',desc:'Crash 5 times',icon:'Flame',test:()=>(P().crashes||0)>=5},
  {id:'tallyHo',name:'Tally Ho',desc:'Fly within 300 m of other traffic',icon:'Eye'},
  {id:'formation',name:'Wingman',desc:'Hold formation with Viper two for 30 seconds',icon:'Plane',secret:true},
  {id:'viper',name:'Classified',desc:'Find the secret aircraft',icon:'Plane',secret:true},
  {id:'mach',name:'Sound Barrier',desc:'Break Mach 1',icon:'Flame',secret:true},
];
function store(){return P().ach||(P().ach={});}
export function hasAch(id){return !!store()[id];}
export function unlock(id){
  const a=ACHIEVEMENTS.find(x=>x.id===id);if(!a||hasAch(id))return;
  store()[id]=Date.now();saveProgress();
  const el=$('achToast');
  if(el){el.innerHTML=`<span class="ach-ic">${lucide(a.icon,{size:20,cls:''})}</span><span><small>ACHIEVEMENT UNLOCKED</small><b>${a.name}</b><em>${a.desc}</em></span>`;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');clearTimeout(unlock.t);unlock.t=setTimeout(()=>el.classList.remove('show'),4200);}
  sfx.achievement?.();
}
export function achEvent(name){unlock(name);}
let t=0;
export function updateAchievements(dt){
  if(!state.started)return;t-=dt;if(t>0)return;t=2;
  const a=aircraft;
  if(a.altAGL>20&&a.airspeed>20)unlock('firstFlight');
  if((a.mach||0)>=1)unlock('mach');
  if(AIRCRAFT[aircraftState.variant]?.jet)unlock('viper');
  for(const x of ACHIEVEMENTS)if(x.test&&!hasAch(x.id)&&x.test())unlock(x.id);
}
export function achievementsHtml(){
  const got=ACHIEVEMENTS.filter(a=>hasAch(a.id)).length;
  return `<h3 class="lb-h">Achievements <span class="lb-count">${got} / ${ACHIEVEMENTS.length}</span></h3><div class="achs">${ACHIEVEMENTS.map(a=>{const on=hasAch(a.id),hide=a.secret&&!on;
    return `<div class="ach${on?' got':''}" title="${hide?'Secret achievement':a.desc}"><span class="ach-ic">${lucide(hide?'Lock':a.icon,{size:18,cls:''})}</span><span><b>${hide?'Secret':a.name}</b><em>${hide?'Keep exploring':a.desc}</em></span></div>`;}).join('')}</div>`;
}
