// SKYBOUND · ui
import { $, DEG, FT_PER_M, KTS_PER_MS, clamp } from './util.js';
import { WORLD_SEED, aircraft, sky, state } from './config.js';
import { AIRPORT_H, terrain } from './world.js';
import { applyTier, perf } from './perf.js';
import { chunks, onRunway } from './chunks.js';
import { camera, restart, startFlight } from './engine.js';
import { connectGyro, dead, readGamepad, startGyroCalibration } from './input.js';
import { ensureAircraftAudio, setAircraftAudioVolume, syncSoundButton, toggleAircraftAudio } from './audio.js';
import { exitTutorial, startTutorial } from './tutorial.js';
import { IS_DAILY } from './config.js';
import { hudReadouts, hudCamera, openChart, closeChart, downloadChart } from './hud.js';
import { menuState, renderMenu, logbookModal } from './menu.js';

export function toggleGear(){state.gear=true;toast('Cessna 182 Skylane uses fixed landing gear.');}
export function nextCamera(){state.camera=state.camera%4+1;cameraName();}
export function cameraName(){hudCamera(['','COCKPIT','CHASE','ORBIT','FREE LOOK'][state.camera]);}
export function togglePause(){if(!state.started)return;state.paused=!state.paused;$('pauseMenu').style.display=state.paused?'grid':'none';}
export function setHud(){$('hud').classList.toggle('active',state.hud&&state.started&&!state.paused);document.body.classList.toggle('flying',state.started);}
export function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2600);}
export function setLoading(text,pct){const t=$('loading')?.querySelector('.loader-text'),b=$('loading')?.querySelector('.loader-bar i');if(t)t.textContent=text;if(b&&pct!=null){b.style.animation='none';b.style.width=`${clamp(pct,0,100)}%`;}}
export function updateWorldInfo(){
  const el=$('worldSeed');if(el)el.textContent=`#${WORLD_SEED}`;
  const sk=$('worldSky');if(sk)sk.textContent=sky.name;
  const bi=$('worldBiome');if(bi){const P=terrain.P;bi.textContent=`${P.autumn?'Autumn':'Summer'} · ${P.tempBias>.08?'warm':P.tempBias<-.08?'cool':'temperate'} · ${P.mountainH>2400?'alpine':'rolling'}`;}
  const ap=$('worldAirfield');if(ap)ap.textContent=`Field elev. ${Math.round(AIRPORT_H*FT_PER_M).toLocaleString()} ft`;
}
let lastCam=0;
export function updateHud(dt){hudReadouts();if(state.camera!==lastCam){if(lastCam)cameraName();lastCam=state.camera;}}
export function updateDiagnostics(){const gp=readGamepad(),c=$('controllerDetail'),a=$('controllerAxes');if(c&&a){if(gp){c.textContent=`${gp.id||'Gamepad'} · index ${gp.index} · ${gp.buttons.length} buttons / ${gp.axes.length} axes`;const ax=(gp.axes||[]).slice(0,4).map(v=>(v||0).toFixed(2)).join(' / '),b=gp.buttons||[];a.textContent=`Axes: ${ax||'—'} · L2/R2: ${((b[6]?.value)||0).toFixed(2)} / ${((b[7]?.value)||0).toFixed(2)}`;}else{c.textContent='No controller detected · WASD + mouse active';a.textContent='W/S pitch · A/D roll · Q/E rudder · Shift/Ctrl throttle · LMB drag steer · RMB drag camera';}}const g=$('gfxDetail');if(g)g.textContent=`${perf.gpu} · detected ${perf.detectedTier} · now ${perf.tier.name} · view ${perf.view} km · ${chunks.size} chunks · ${Math.round(state.fps)} fps`;}
export function openModal(title,body){$('modalContent').innerHTML=`<div class="modal-head"><h2>${title}</h2><button class="close" id="modalClose">✕</button></div>${body}`;$('modalOverlay').style.display='grid';$('modalClose').onclick=()=>$('modalOverlay').style.display='none';}
export function settingsModal(){openModal('Simulator settings',`
  <div class="control-row"><div><strong>Aircraft audio</strong><small>Six-cylinder piston pulses, three-blade prop wash, speed-sensitive airflow and subtle pedal/cable movement.</small></div><input id="audioEnabled" type="checkbox" ${state.audioEnabled?'checked':''}></div>
  <div class="control-row"><div><strong>Master audio level</strong><small>Engine, propeller and airflow volume.</small></div><input id="audioVolume" type="range" min="0" max="1" step=".01" value="${state.audioVolume}"></div>
  <div class="control-row"><div><strong>Rudder / airframe effects</strong><small>Subtle mechanical pedal movement and sideslip airflow.</small></div><input id="effectVolume" type="range" min="0" max="1" step=".01" value="${state.effectVolume}"></div>
  <div class="diag"><strong>Audio model</strong><br>Based on Cessna 182T IO-540 / three-blade propeller reference frequencies. Rudder effects represent soft pedal and cable movement; airflow responds to indicated speed and sideslip. This is a real-time acoustic model, not a copied aircraft sound recording. <a href="https://freesound.org/people/JLWSound/sounds/322321/" target="_blank" rel="noopener noreferrer" style="color:var(--cyan)">Listen to a genuine CC0 Cessna 172E reference recording ↗</a> (similar piston-single sound, not a C182 recording).</div>
  <div class="control-row"><div><strong>Graphics quality</strong><small>Auto benchmarks your GPU and continuously tunes view distance, LOD, forests, shadows and post-processing.</small></div><select id="qualitySelect"><option>Auto</option><option>Ultra</option><option>High</option><option>Medium</option><option>Low</option></select></div>
  <div class="diag"><strong>Graphics</strong><br><span id="gfxDetail">—</span></div>
  <div class="control-row"><div><strong>Flight control response</strong><small>Higher values make pitch, roll and rudder react faster.</small></div><input id="controlResponse" type="range" min=".55" max="1.65" step=".05" value="${state.controlResponse}"></div>
  <div class="control-row"><div><strong>Stick sensitivity</strong><small>Overall DualSense and keyboard/mouse flight authority.</small></div><input id="stickSens" type="range" min=".4" max="1.8" step=".05" value="${state.stickSensitivity}"></div>
  <div class="control-row"><div><strong>Fine-control curve</strong><small>More expo gives finer movement around the stick centre.</small></div><input id="inputExpo" type="range" min="0" max=".75" step=".05" value="${state.inputExpo}"></div>
  <div class="control-row"><div><strong>Wing stability assist</strong><small>Gentle self-levelling when you release the roll input.</small></div><input id="rollStability" type="range" min="0" max=".65" step=".05" value="${state.rollStability}"></div>
  <div class="control-row"><div><strong>Stick dead zone</strong><small>Ignore small stick drift.</small></div><input id="deadzone" type="range" min="0" max=".25" step=".01" value="${state.deadzone}"></div>
  <div class="control-row"><div><strong>Enable gyro flight input</strong><small>Use DualSense gyro rotation for yaw.</small></div><input id="gyroEnabled" type="checkbox" ${state.gyroEnabled?'checked':''}></div>
  <div class="control-row"><div><strong>Gyro pitch assist</strong><small>Use controller pitch rotation as an optional secondary input.</small></div><input id="gyroPitch" type="checkbox" ${state.gyroPitch?'checked':''}></div>
  <div class="control-row"><div><strong>Gyro sensitivity</strong><small>Angular rate scaling for yaw / pitch.</small></div><input id="gyroSens" type="range" min=".2" max="2.5" step=".05" value="${state.gyroSensitivity}"></div>
  <div class="control-row"><div><strong>Gyro noise threshold</strong><small>Degrees per second ignored as sensor drift.</small></div><input id="gyroDz" type="range" min="0" max="12" step=".5" value="${state.gyroDeadzone}"></div>
  <div class="diag"><strong>Controller diagnostics</strong><br><span id="controllerDetail">Waiting for controller input…</span><br><span id="controllerAxes">Axes: — · Triggers: —</span></div>
  <div class="diag"><strong>DualSense motion sensor</strong><br><span id="gyroDetail">${state.gyroDevice?(state.gyroCalibrated?'Calibrated · live gyro rates':'Connected · calibration required'):'Not connected. Pair it using WebHID.'}</span><br>USB and Bluetooth HID report layouts are supported by the parser. Motion sensor data is read directly; no simulated gyro values are used.</div>
  <div class="modal-actions"><button class="primary" id="pairGyro">PAIR DUALSENSE GYRO</button><button id="calibrateGyro">CALIBRATE NEUTRAL</button><button id="doneSettings">DONE</button></div>`);
  $('audioEnabled').onchange=e=>{state.audioEnabled=e.target.checked;if(state.audioEnabled)ensureAircraftAudio();syncSoundButton();};$('audioVolume').oninput=e=>setAircraftAudioVolume(e.target.value);$('effectVolume').oninput=e=>state.effectVolume=+e.target.value;
  $('qualitySelect').value=state.quality;$('qualitySelect').onchange=e=>{state.quality=e.target.value;perf.auto=state.quality==='Auto';applyTier(perf.auto?perf.detectedTier:state.quality);perf.cooldown=4;toast(`Graphics quality: ${state.quality}`);};
  $('controlResponse').oninput=e=>state.controlResponse=+e.target.value;$('stickSens').oninput=e=>state.stickSensitivity=+e.target.value;$('inputExpo').oninput=e=>state.inputExpo=+e.target.value;$('rollStability').oninput=e=>state.rollStability=+e.target.value;$('deadzone').oninput=e=>state.deadzone=+e.target.value;$('gyroEnabled').onchange=e=>state.gyroEnabled=e.target.checked;$('gyroPitch').onchange=e=>state.gyroPitch=e.target.checked;$('gyroSens').oninput=e=>state.gyroSensitivity=+e.target.value;$('gyroDz').oninput=e=>state.gyroDeadzone=+e.target.value;
  $('pairGyro').onclick=async()=>{await connectGyro();$('gyroDetail').textContent=state.gyroDevice?`${state.gyroDevice.productName||'DualSense'} · connected, calibrate before flying`:'No DualSense HID device selected.';};$('calibrateGyro').onclick=startGyroCalibration;$('doneSettings').onclick=()=>$('modalOverlay').style.display='none';
}
export function controlsModal(){openModal('Flight controls',`<div class="keygrid">
  <div class="key"><span>Pitch down / up</span><kbd>W / S · ↑ / ↓</kbd></div><div class="key"><span>Roll left / right</span><kbd>A / D · ← / →</kbd></div>
  <div class="key"><span>Rudder left / right</span><kbd>Q LEFT · E RIGHT</kbd></div><div class="key"><span>Throttle increase</span><kbd>SHIFT</kbd></div>
  <div class="key"><span>Throttle decrease</span><kbd>CTRL</kbd></div><div class="key"><span>Landing gear</span><kbd>FIXED ON C182</kbd></div>
  <div class="key"><span>Camera views</span><kbd>1 – 4</kbd></div><div class="key"><span>Toggle HUD</span><kbd>H</kbd></div>
  <div class="key"><span>Pause / resume</span><kbd>ESC / SPACE</kbd></div><div class="key"><span>Mouse flight steering</span><kbd>Hold LMB + drag</kbd></div><div class="key"><span>Camera look</span><kbd>Hold RMB + drag</kbd></div></div>
  <div class="diag"><strong>Keyboard + mouse fallback</strong><br>W/S: pitch · A/D: roll · Q/E: rudder · Shift/Ctrl: throttle · G: fixed-gear info · 1–4: camera · H: HUD · ESC/SPACE: pause. Hold left mouse and drag to steer (horizontal = roll, vertical = pitch). Hold right mouse and drag to orbit the camera. Keyboard controls remain available alongside the controller.<br><br><strong>DualSense mapping</strong><br>Left stick: pitch / roll · Right stick: camera · R2/L2: throttle · L1: rudder left · R1: rudder right · ✕: fixed-gear info · ○: camera · □: HUD · △: cockpit/chase toggle · D-pad up/down: throttle steps · D-pad left/right: camera cycle · OPTIONS: pause.<br><br><strong>Gyroscope</strong><br>Pair through Settings → Pair DualSense Gyro. Rotate the controller around its vertical axis to command yaw. Hold it still during calibration. Gyro data requires WebHID in a compatible browser such as desktop Chrome or Edge.</div>`);}

// Inputs and buttons
$('startBtn').onclick=()=>startFlight(IS_DAILY?'daily':'charter',menuState.charter);$('freeBtn').onclick=()=>startFlight('free');$('logbookBtn').onclick=logbookModal;$('chartBtn').onclick=openChart;$('chartSave').onclick=downloadChart;$('chartClose').onclick=closeChart;$('teachBtn').onclick=startTutorial;$('tutorialExit').onclick=exitTutorial;$('tutorialClose').onclick=exitTutorial;$('controlsBtn').onclick=controlsModal;$('settingsBtn').onclick=settingsModal;$('hudBtn').onclick=()=>{state.hud=!state.hud;setHud();};$('soundBtn').onclick=toggleAircraftAudio;$('pauseBtn').onclick=togglePause;$('resumeBtn').onclick=()=>{state.paused=false;$('pauseMenu').style.display='none';setHud();};$('restartBtn').onclick=restart;$('returnBtn').onclick=()=>{state.started=false;state.paused=false;exitTutorial();$('pauseMenu').style.display='none';$('mainMenu').style.display='grid';setHud();renderMenu();};
$('newWorldBtn').onclick=()=>{const u=new URL(location.href);u.searchParams.set('seed',String(1+Math.floor(Math.random()*999999)));u.searchParams.delete('sky');location.href=u.toString();};
