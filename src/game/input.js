import { toggleChart, closeChart } from './hud.js';
// SKYBOUND · input
import { $, clamp } from './util.js';
import { state } from './config.js';
import { frame } from './engine.js';
import { cameraName, nextCamera, setHud, toast, toggleGear, togglePause } from './ui.js';
import { setTutorialInputMode } from './tutorial.js';

// DualSense direct WebHID motion input. Gamepad API remains the main stick/button channel.
export async function connectGyro(){
  if(!('hid' in navigator)){toast('WebHID is unavailable here. Use Chrome or Edge on localhost / HTTPS.');return;}
  try{
    const devices=await navigator.hid.requestDevice({filters:[{vendorId:0x054c,productId:0x0ce6},{vendorId:0x054c,productId:0x0df2}]});if(!devices.length)return;const dev=devices[0];await dev.open();state.gyroDevice=dev;dev.addEventListener('inputreport',onHidReport);$('gyroStatus').textContent='CONNECTED';$('gyroDetail').textContent=`${dev.productName||'DualSense'} · WebHID active`;toast('DualSense motion sensor connected. Hold the controller still and calibrate.');
  }catch(err){console.error(err);toast(`Gyro connection failed: ${err.message||err}`);}
}
export function onHidReport(e){
  const d=e.data;let off=e.reportId===0x31?16:15;if(d.byteLength<off+6){off=e.reportId===0x31?17:16;if(d.byteLength<off+6)return;}
  const raw={x:d.getInt16(off,true),y:d.getInt16(off+2,true),z:d.getInt16(off+4,true)};state.gyroRaw=raw;
  if(state.gyroCalibrating){state.gyroSamples.push(raw);if(performance.now()-state.gyroCalibrationStart>1800 && state.gyroSamples.length>=100){for(const k of ['x','y','z'])state.gyroBias[k]=state.gyroSamples.reduce((a,v)=>a+v[k],0)/state.gyroSamples.length;state.gyroCalibrating=false;state.gyroCalibrated=true;$('gyroDetail').textContent='Calibrated · live gyro rates';toast('Gyroscope calibrated.');}}
}
export function startGyroCalibration(){if(!state.gyroDevice){toast('Connect the DualSense gyro first.');return;}state.gyroSamples=[];state.gyroCalibrationStart=performance.now();state.gyroCalibrating=true;$('gyroDetail').textContent='Calibrating — hold controller still';toast('Hold the controller still for two seconds.');}
export function readGyro(){const g=state.gyroRaw,b=state.gyroBias;return{x:(g.x-b.x)/1024,y:(g.y-b.y)/1024,z:(g.z-b.z)/1024};}
export function readGamepad(){const pads=navigator.getGamepads?navigator.getGamepads():[];let gp=null;if(state.gamepad!==null&&pads[state.gamepad]?.connected)gp=pads[state.gamepad];if(!gp)gp=Array.from(pads).find(p=>p&&p.connected)||null;if(gp){state.gamepad=gp.index;state.gamepadName=gp.id||'Gamepad';$('controllerStatus').textContent='DUALSENSE';if(state.gamepadName.length>26)$('controllerStatus').textContent='CONNECTED';}else{$('controllerStatus').textContent='KEYBOARD + MOUSE';state.gamepad=null;}return gp;}
window.addEventListener('gamepadconnected',e=>{state.gamepad=e.gamepad.index;state.gamepadName=e.gamepad.id;toast('Controller connected. Use a control to switch Flight School to DualSense instructions.');});window.addEventListener('gamepaddisconnected',()=>{state.gamepad=null;if(state.tutorial.active)setTutorialInputMode('keyboardMouse');toast('Controller disconnected.');});
export function dead(v,d=state.deadzone){
  const a=Math.abs(v);if(a<=d)return 0;
  return Math.sign(v)*((a-d)/(1-d));
}
export function curveAxis(v){
  const x=dead(clamp(v,-1,1)),a=Math.abs(x),e=state.inputExpo;
  return Math.sign(x)*((1-e)*a+e*a*a*a);
}
export function getControls(dt){
  let pitch=0,roll=0,yaw=0,throttleDelta=0,camX=0,camY=0;
  const gp=readGamepad();
  if(gp){
    const a=gp.axes||[],b=gp.buttons||[];
    const moved=a.some(v=>Math.abs(v)>.18)||b.some(v=>v.pressed||(v.value||0)>.18);
    if(state.tutorial.active&&moved)setTutorialInputMode('controller');
    roll=curveAxis(a[0]||0);pitch=-curveAxis(a[1]||0);
    camX=curveAxis(a[2]||0);camY=curveAxis(a[3]||0);
    const r2=b[7]?.value??(b[7]?.pressed?1:0),l2=b[6]?.value??(b[6]?.pressed?1:0);
    throttleDelta=(r2-l2)*.62*dt;
    yaw=((b[4]?.pressed?1:0)-(b[5]?.pressed?1:0));
    if(b[0]?.pressed&&!state.crossLatch){toggleGear();state.crossLatch=true;}if(!b[0]?.pressed)state.crossLatch=false;
    if(b[1]?.pressed&&!state.circleLatch){nextCamera();state.circleLatch=true;}if(!b[1]?.pressed)state.circleLatch=false;
    if(b[2]?.pressed&&!state.squareLatch){state.hud=!state.hud;setHud();state.squareLatch=true;}if(!b[2]?.pressed)state.squareLatch=false;
    if(b[3]?.pressed&&!state.triangleLatch){state.camera=state.camera===1?2:1;cameraName();state.triangleLatch=true;}if(!b[3]?.pressed)state.triangleLatch=false;
    if(b[12]?.pressed&&!state.dpadUpLatch){state.throttle=clamp(state.throttle+.05,0,1);state.dpadUpLatch=true;}if(!b[12]?.pressed)state.dpadUpLatch=false;
    if(b[13]?.pressed&&!state.dpadDownLatch){state.throttle=clamp(state.throttle-.05,0,1);state.dpadDownLatch=true;}if(!b[13]?.pressed)state.dpadDownLatch=false;
    if(b[14]?.pressed&&!state.dpadLeftLatch){state.camera=(state.camera+2)%4+1;cameraName();state.dpadLeftLatch=true;}if(!b[14]?.pressed)state.dpadLeftLatch=false;
    if(b[15]?.pressed&&!state.dpadRightLatch){nextCamera();state.dpadRightLatch=true;}if(!b[15]?.pressed)state.dpadRightLatch=false;
    if(b[9]?.pressed&&!state.startLatch){togglePause();state.startLatch=true;}if(!b[9]?.pressed)state.startLatch=false;
  }
  // Digital controls remain available alongside a connected controller.
  const k=state.keys;
  if(state.tutorial.active&&Object.entries(k).some(([code,down])=>down&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','ShiftLeft','ShiftRight','ControlLeft','ControlRight','KeyG'].includes(code)))setTutorialInputMode('keyboardMouse');
  if(k.KeyW||k.ArrowUp)pitch+=1;if(k.KeyS||k.ArrowDown)pitch-=1;
  if(k.KeyA||k.ArrowLeft)roll-=1;if(k.KeyD||k.ArrowRight)roll+=1;
  if(k.KeyQ)yaw+=1;if(k.KeyE)yaw-=1;
  if(k.ShiftLeft||k.ShiftRight)throttleDelta+=.38*dt;
  if(k.ControlLeft||k.ControlRight)throttleDelta-=.38*dt;
  // Mouse drag behaves like a virtual spring-centred stick, not one-frame impulses.
  // This gives the pilot stable proportional control while dragging.
  if(state.mouseFlightActive){
    roll+=curveAxis(clamp(state.mouseFlightDx/150,-1,1));
    pitch+=curveAxis(clamp(-state.mouseFlightDy/150,-1,1));
  }
  if(k.KeyG&&!state.gLatch){toggleGear();state.gLatch=true;}if(!k.KeyG)state.gLatch=false;
  if(k.Digit1)state.camera=1;if(k.Digit2)state.camera=2;if(k.Digit3)state.camera=3;if(k.Digit4)state.camera=4;
  if(state.gyroEnabled&&state.gyroDevice&&state.gyroCalibrated){
    const g=readGyro(),dz=state.gyroDeadzone;
    const rate=v=>Math.abs(v)<dz?0:Math.sign(v)*(Math.abs(v)-dz);
    yaw+=clamp(rate(g.y)/70*state.gyroSensitivity,-1,1);
    if(state.gyroPitch)pitch+=clamp(rate(g.x)/80*state.gyroSensitivity,-1,1);
  }
  state.throttle=clamp(state.throttle+throttleDelta,0,1);
  return{pitch:clamp(pitch*state.stickSensitivity,-1,1),roll:clamp(roll*state.stickSensitivity,-1,1),yaw:clamp(yaw,-1,1),camX,camY};
}
window.addEventListener('keydown',e=>{state.keys[e.code]=true;if(state.tutorial.active&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','ShiftLeft','ShiftRight','ControlLeft','ControlRight','KeyG'].includes(e.code))setTutorialInputMode('keyboardMouse');if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='KeyM'&&state.started){toggleChart();return;}if(e.code==='Escape'&&document.getElementById('chartOverlay')?.style.display==='grid'){closeChart();return;}if(e.code==='Escape'||e.code==='Space'){if(state.started)togglePause();}if(e.code==='KeyH'){state.hud=!state.hud;setHud();}if(e.code==='KeyC')nextCamera();});window.addEventListener('keyup',e=>state.keys[e.code]=false);
$('sim').addEventListener('pointerdown',e=>{
  if(e.button===0){
    // Left-drag always flies, even when a controller is connected. This makes
    // keyboard/mouse a genuine selectable input scheme rather than a fallback
    // that silently stops working when a gamepad is plugged in.
    state.mouseFlightActive=true;
    if(state.tutorial.active)setTutorialInputMode('keyboardMouse');
    state.mouseFlightX=e.clientX;state.mouseFlightY=e.clientY;
    state.mouseFlightDx=0;state.mouseFlightDy=0;
  }else if(e.button===2){
    state.mouseDown=true;state.mouseButton=e.button;state.mouseX=e.clientX;state.mouseY=e.clientY;
    if(state.tutorial.active)setTutorialInputMode('keyboardMouse');
  }
});
window.addEventListener('pointerup',()=>{state.mouseDown=false;state.mouseFlightActive=false;state.mouseFlightDx=0;state.mouseFlightDy=0;state.mouseButton=-1;});
window.addEventListener('pointercancel',()=>{state.mouseDown=false;state.mouseFlightActive=false;state.mouseFlightDx=0;state.mouseFlightDy=0;state.mouseButton=-1;});
window.addEventListener('pointermove',e=>{
  if(state.mouseFlightActive){if(state.tutorial.active)setTutorialInputMode('keyboardMouse');state.mouseFlightDx=e.clientX-state.mouseFlightX;state.mouseFlightDy=e.clientY-state.mouseFlightY;}
  if(state.mouseDown){state.mouseDx+=e.clientX-state.mouseX;state.mouseDy+=e.clientY-state.mouseY;state.mouseX=e.clientX;state.mouseY=e.clientY;}
});
$('sim').addEventListener('contextmenu',e=>e.preventDefault());
