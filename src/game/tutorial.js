// SKYBOUND · tutorial
import { $, DEG, FT_PER_M, KTS_PER_MS, clamp } from './util.js';
import { TAKEOFF_ROTATE_KTS, aircraft, state } from './config.js';
import { camera, restart } from './engine.js';
import { ensureAircraftAudio } from './audio.js';
import { toast } from './ui.js';

export const flightLesson=[
  {title:'Power up',objective:'You are lined up on the runway. Bring engine power up smoothly to at least 90%.',controller:'Hold R2 to increase throttle. Use L2 if you overshoot.',keyboard:'Hold LEFT SHIFT to increase throttle. Hold LEFT CTRL to reduce it.',mouse:'No mouse movement is needed for throttle.',done:()=>state.throttle>=.9,status:'WAITING FOR 90% THROTTLE'},
  {title:'Build takeoff speed',objective:'Keep the aircraft straight and let it accelerate. Avoid pitching or banking while the airspeed builds to 58 knots.',controller:'Keep the LEFT STICK centred and continue holding R2.',keyboard:'Keep W/A/S/D released. Continue holding LEFT SHIFT.',mouse:'Keep the left mouse button released; focus on the runway.',done:()=>aircraft.airspeed*KTS_PER_MS>=TAKEOFF_ROTATE_KTS,status:`WAITING FOR ${TAKEOFF_ROTATE_KTS} KTS`},
  {title:'Rotate — lift the nose',objective:'At takeoff speed, gently raise the nose. Use a small input, not a hard pull.',controller:'Push the LEFT STICK UP slightly (toward the top edge) to pitch up.',keyboard:'Tap or gently hold W to pitch the nose up.',mouse:'Hold LEFT MOUSE BUTTON and drag UP gently to raise the nose.',done:()=>aircraft.altAGL>7&&aircraft.airspeed>20,status:'WAITING FOR LIFTOFF'},
  {title:'Climb steadily',objective:'Establish a shallow climb. Make small corrections and keep the wings close to level. Aim for 200 ft above ground.',controller:'Use small LEFT STICK UP taps for pitch. Move it LEFT/RIGHT only for small roll corrections.',keyboard:'Use short W taps for pitch. Use A/D for small roll corrections.',mouse:'Hold LEFT MOUSE BUTTON and make small drags. Drag UP to pitch up; LEFT/RIGHT to bank.',done:()=>aircraft.altAGL>61,status:'WAITING FOR 200 FT AGL'},
  {title:'Stabilise the climb',objective:'The Cessna 182 Skylane has fixed landing gear, so there is no gear-retraction action. Hold a steady climb with a positive vertical speed and nearly level wings.',controller:'Use small LEFT STICK corrections. Keep the wings within about 10° of level and maintain a positive climb.',keyboard:'Use short W/A/D corrections. Keep the wings within about 10° of level and maintain a positive climb.',mouse:'Hold LEFT MOUSE BUTTON and make tiny drags. Drag UP for pitch; LEFT/RIGHT for roll corrections.',done:()=>aircraft.verticalSpeed>1.2&&Math.abs(aircraft.roll)<.18&&aircraft.airspeed>25,status:'WAITING FOR A STABLE CLIMB'},
  {title:'Make a gentle turn',objective:'Aircraft turn by banking. Try a shallow 15° bank, then release the controls.',controller:'Move the LEFT STICK LEFT or RIGHT to bank. L1/R1 provide rudder input.',keyboard:'Press A to bank left or D to bank right. Q/E control rudder.',mouse:'Hold LEFT MOUSE BUTTON and drag LEFT or RIGHT to bank.',done:()=>Math.abs(aircraft.roll)>.22,status:'WAITING FOR A 13° BANK'},
  {title:'Level the wings',objective:'Stop the turn by easing the wings back to level. Avoid large opposite inputs.',controller:'Ease the LEFT STICK toward the opposite side, then return it to the centre.',keyboard:'Tap the opposite A/D key briefly, then release both keys.',mouse:'Hold LEFT MOUSE BUTTON and drag gently in the opposite direction, then release.',done:()=>Math.abs(aircraft.roll)<.09,status:'WAITING FOR WINGS LEVEL'},
  {title:'You are flying',objective:'You have practised throttle, takeoff, climb, fixed-gear checks, banking and recovery. Keep exploring, or practise a landing when you are ready.',controller:'Left stick: pitch/roll · R2/L2: throttle · L1/R1: rudder · ✕: fixed-gear info · ○: camera · OPTIONS: pause.',keyboard:'W/S: pitch · A/D: roll · Q/E: rudder · SHIFT/CTRL: throttle · G: fixed-gear info · 1–4: camera · ESC: pause.',mouse:'LMB + drag: pitch/roll · RMB + drag: camera look. Use the keyboard for throttle; landing gear is fixed.',done:()=>true,status:'BASIC FLIGHT LESSON COMPLETE'}
];
export function hasConnectedGamepad(){try{return Array.from(navigator.getGamepads?.()||[]).some(p=>p&&p.connected);}catch{return false;}}
export function tutorialInputMode(){
  // Flight School teaches only the input scheme currently in use. Mouse and
  // keyboard are one combined fallback scheme; DualSense is a separate scheme.
  const connected=hasConnectedGamepad();
  if(!connected&&state.tutorial.inputMode==='controller')state.tutorial.inputMode='keyboardMouse';
  if(connected&&!state.tutorial.inputMode)state.tutorial.inputMode='controller';
  if(state.tutorial.inputMode!=='controller'&&state.tutorial.inputMode!=='keyboardMouse'){
    state.tutorial.inputMode=connected?'controller':'keyboardMouse';
  }
  return state.tutorial.inputMode;
}
export function setTutorialInputMode(mode){
  if(!state.tutorial.active)return;
  const next=(mode==='controller'&&hasConnectedGamepad())?'controller':'keyboardMouse';
  if(state.tutorial.inputMode!==next){
    state.tutorial.inputMode=next;
    updateTutorialPanel();
  }
}
export function keyboardMouseLessonInstruction(step,index){
  const instructions=[
    'Hold LEFT SHIFT to increase throttle; hold LEFT CTRL to reduce it. Mouse is not needed for throttle.',
    'Keep W/A/S/D released and keep the left mouse button released. Hold LEFT SHIFT to maintain power while the aircraft accelerates.',
    'Press W gently to raise the nose, OR hold LEFT MOUSE BUTTON and drag UP a small amount. Avoid a sudden pull.',
    'Use short W taps to maintain a shallow climb. Use A/D or LEFT MOUSE BUTTON + small left/right drags to keep the wings level.',
    'The Cessna 182 has fixed landing gear. No gear input is needed; focus on maintaining a steady climb.',
    'Press A or D to bank, OR hold LEFT MOUSE BUTTON and drag left/right until the bank reaches about 13°.',
    'Tap the opposite A/D key, OR use a small opposite LEFT MOUSE BUTTON drag. Release the controls as the wings level.',
    'W/S: pitch · A/D: roll · Q/E: rudder · SHIFT/CTRL: throttle · G: fixed-gear info · 1–4: camera. LEFT MOUSE + drag: pitch/roll; RIGHT MOUSE + drag: camera look.'
  ];
  return instructions[index] || `${step.keyboard} ${step.mouse}`;
}
export function tutorialProgressFor(index){
  const speed=aircraft.airspeed*KTS_PER_MS,roll=Math.abs(aircraft.roll),alt=aircraft.altAGL;
  switch(index){
    case 0:return clamp(state.throttle/.9,0,1);
    case 1:return clamp(speed/TAKEOFF_ROTATE_KTS,0,1);
    case 2:return aircraft.altAGL>7&&speed>20?1:clamp((alt-3.2)/3.8,0,.95);
    case 3:return clamp(alt/61,0,1);
    case 4:return clamp(.35+Math.min(aircraft.verticalSpeed/1.2,1)*.4+(Math.abs(aircraft.roll)<.18?.25:0),0,1);
    case 5:return clamp(roll/.22,0,1);
    case 6:return clamp(1-roll/.22,0,1);
    default:return 1;
  }
}
export function tutorialFeedback(index){
  const speed=aircraft.airspeed*KTS_PER_MS,rollDeg=Math.abs(aircraft.roll)/DEG,altFt=aircraft.altAGL*FT_PER_M;
  switch(index){
    case 0:
      return state.throttle<.65?'Bring the power up gradually. Keep holding the throttle control.':state.throttle<.9?`Good. ${Math.round(state.throttle*100)}% power — keep increasing toward 90%.`:'Power target reached. The instructor will advance automatically.';
    case 1:
      if(state.throttle<.8)return 'Power has dropped. Keep the throttle high so the aircraft can accelerate.';
      if(Math.abs(aircraft.roll)>.14)return 'Keep the wings level and stay aligned with the runway.';
      return `Building speed: ${Math.round(speed)} / ${TAKEOFF_ROTATE_KTS} knots. Keep the nose steady.`;
    case 2:
      if(aircraft.stall)return 'Too much pitch for the current speed. Ease the nose down slightly and let the wing regain lift.';
      if(speed<TAKEOFF_ROTATE_KTS)return `Wait for more speed before rotating. Target ${TAKEOFF_ROTATE_KTS} knots; current airspeed: ${Math.round(speed)} knots.`;
      return 'Gently raise the nose. Small input only — avoid pulling sharply.';
    case 3:
      if(aircraft.stall)return 'You are approaching a stall. Ease forward slightly to reduce angle of attack.';
      if(aircraft.pitch<.035)return 'A little more nose-up attitude will establish a climb.';
      if(rollDeg>12)return `Reduce the ${aircraft.roll>0?'right':'left'} bank. Keep the wings nearly level while climbing.`;
      return `Nice climb. ${Math.round(altFt)} ft AGL — keep a shallow nose-up attitude.`;
    case 4:
      if(aircraft.verticalSpeed<=1.2)return 'This Cessna 182 has fixed landing gear. Keep a positive climb above 1.2 m/s.';
      if(rollDeg>10)return 'Good climb. Reduce the bank slightly and keep the wings level.';
      return 'Climb stabilised. The fixed landing gear requires no action.';
    case 5:
      return rollDeg>13?`Bank detected: ${Math.round(rollDeg)}° ${aircraft.roll>0?'right':'left'}. Ease off the control.`:'Apply a gentle left or right bank until the aircraft reaches about 13°.';
    case 6:
      return rollDeg>7?`Still banked ${aircraft.roll>0?'right':'left'} by ${Math.round(rollDeg)}°. Apply a small opposite input.`:'Wings nearly level. Release the controls and let the aircraft settle.';
    default:return 'Basic flight lesson complete. The instructor will close automatically.';
  }
}
export function startTutorial(){camera.clearViewOffset();
  ensureAircraftAudio();state.tutorial.active=true;state.tutorial.index=0;state.tutorial.timer=0;state.tutorial.readySince=0;state.tutorial.startedAt=performance.now();state.tutorial.lastStep=-1;state.tutorial.lastMode='';
  state.tutorial.inputMode=hasConnectedGamepad()?'controller':'keyboardMouse';state.tutorial.mode=tutorialInputMode();
  $('mainMenu').style.display='none';restart();$('flightTag').textContent='FLIGHT SCHOOL · NORTH RIDGE';$('tutorialPanel').style.display='block';updateTutorialPanel();toast(`Flight school started · ${state.tutorial.mode==='controller'?'DualSense':'keyboard + mouse'} instructions`);
}
export function updateTutorialPanel(){
  if(!state.tutorial.active)return;
  const step=flightLesson[state.tutorial.index];if(!step)return;
  const mode=tutorialInputMode(),i=state.tutorial.index;
  state.tutorial.mode=mode;
  $('tutorialStep').textContent=`FLIGHT SCHOOL · ${String(i+1).padStart(2,'0')} / ${String(flightLesson.length).padStart(2,'0')}`;
  $('tutorialTitle').textContent=step.title;
  $('tutorialObjective').textContent=step.objective;
  // Never show controller and keyboard/mouse instructions together.
  if(mode==='controller'){
    $('tutorialPrimaryLabel').textContent='DUALSENSE CONTROLLER';
    $('tutorialPrimary').textContent=step.controller;
  }else{
    $('tutorialPrimaryLabel').textContent='KEYBOARD + MOUSE';
    $('tutorialPrimary').textContent=keyboardMouseLessonInstruction(step,i);
  }
  const progress=(i+tutorialProgressFor(i))/flightLesson.length;
  $('tutorialProgress').style.width=`${clamp(progress,0,1)*100}%`;
  $('tutorialStatus').textContent=tutorialFeedback(i);
  $('tutorialStatus').classList.toggle('ready',false);
  state.tutorial.lastStep=i;state.tutorial.lastMode=mode;
}
export function finishTutorial(){state.tutorial.active=false;state.tutorial.readySince=0;$('tutorialPanel').style.display='none';toast('Flight school complete. Enjoy your flight!');}
export function advanceTutorial(){
  if(!state.tutorial.active)return;
  const next=state.tutorial.index+1;
  if(next>=flightLesson.length){finishTutorial();return;}
  state.tutorial.index=next;state.tutorial.readySince=0;updateTutorialPanel();
}
export function exitTutorial(){state.tutorial.active=false;state.tutorial.readySince=0;$('tutorialPanel').style.display='none';toast('Flight school closed. Free flight remains active.');}
export function tutorialTick(){
  if(!state.tutorial.active||state.paused)return;
  const now=performance.now(),mode=tutorialInputMode(),index=state.tutorial.index,step=flightLesson[index];
  if(mode!==state.tutorial.lastMode){updateTutorialPanel();}
  const complete=!!step.done();
  if(complete){
    if(!state.tutorial.readySince)state.tutorial.readySince=now;
    const delay=index===flightLesson.length-1?2200:850;
    const elapsed=now-state.tutorial.readySince,remaining=Math.max(0,(delay-elapsed)/1000);
    $('tutorialStatus').textContent=index===flightLesson.length-1?'LESSON COMPLETE · RETURNING TO FREE FLIGHT':`ACTION DETECTED · NEXT LESSON IN ${remaining.toFixed(1)}s`;
    $('tutorialStatus').classList.toggle('ready',true);
    $('tutorialProgress').style.width=`${((index+1)/flightLesson.length)*100}%`;
    if(elapsed>=delay){
      if(index===flightLesson.length-1)finishTutorial();
      else{advanceTutorial();toast(`Good work. ${flightLesson[state.tutorial.index].title} — follow the new instruction.`);}
    }
  }else{
    state.tutorial.readySince=0;
    $('tutorialStatus').textContent=tutorialFeedback(index);
    $('tutorialStatus').classList.toggle('ready',false);
    $('tutorialProgress').style.width=`${((index+tutorialProgressFor(index))/flightLesson.length)*100}%`;
  }
  // Keep the device-specific control instructions in sync if the user swaps input methods.
  if(mode!==state.tutorial.lastMode)updateTutorialPanel();
}
