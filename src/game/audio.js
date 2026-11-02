// SKYBOUND · audio
import { $, KTS_PER_MS, clamp, smooth } from './util.js';
import { aircraft, state } from './config.js';
import { camera } from './engine.js';
import { toast } from './ui.js';

// SKYBOUND acoustic model: C182T reference engine/prop frequencies, a soft
// broadband exhaust/prop texture, cockpit-filtered airflow, and restrained
// rudder-pedal/cable foley. Audio is generated locally with Web Audio so it
// follows the live simulation (RPM, throttle, airspeed, sideslip and camera).
export let aircraftAudio=null;
export function makeAircraftNoiseBuffer(ctx,duration=2.5){
  const length=Math.max(1,Math.floor(ctx.sampleRate*duration));
  const buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
  // Soft pink-ish noise is a better base for airflow/exhaust than harsh white noise.
  let low=0,mid=0,high=0;
  for(let i=0;i<length;i++){
    const white=Math.random()*2-1;
    low=.985*low+.015*white;
    mid=.82*mid+.18*white;
    high=white-mid;
    data[i]=clamp((low*2.8+mid*.85+high*.12)*.28,-1,1);
  }
  return buffer;
}
export function ensureAircraftAudio(){
  if(aircraftAudio){if(aircraftAudio.ctx.state==='suspended')aircraftAudio.ctx.resume().catch(()=>{});return true;}
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtx){toast('This browser does not support Web Audio.');return false;}
  try{
    const ctx=new AudioCtx({latencyHint:'interactive'});
    const master=ctx.createGain();master.gain.value=0;
    const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-20;compressor.knee.value=12;compressor.ratio.value=3.2;compressor.attack.value=.012;compressor.release.value=.22;
    master.connect(compressor);compressor.connect(ctx.destination);

    const engineBus=ctx.createGain();engineBus.gain.value=.78;
    const engineFilter=ctx.createBiquadFilter();engineFilter.type='lowpass';engineFilter.frequency.value=1750;engineFilter.Q.value=.62;
    const enginePan=ctx.createStereoPanner();enginePan.pan.value=0;
    engineBus.connect(engineFilter);engineFilter.connect(enginePan);enginePan.connect(master);

    const tones=[];
    const addTone=(kind,multiple,level)=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=kind;osc.frequency.value=30;gain.gain.value=level;
      osc.connect(gain);gain.connect(engineBus);osc.start();tones.push({osc,gain,multiple});
    };
    // Six-cylinder, four-stroke firing order: 3 firing events per crank revolution.
    // At 2,400 RPM this yields 120 Hz; harmonics reproduce the piston/prop tone stack.
    addTone('sine',-1,.043); // crankshaft fundamental: RPM / 60
    addTone('sine',-2,.019);
    addTone('triangle',-3,.009);
    [.105,.052,.029,.017,.010,.006].forEach((level,i)=>addTone(i<2?'sine':'triangle',i+1,level));

    const engineNoise=ctx.createBufferSource();engineNoise.buffer=makeAircraftNoiseBuffer(ctx,3);engineNoise.loop=true;
    const exhaustBand=ctx.createBiquadFilter();exhaustBand.type='bandpass';exhaustBand.frequency.value=820;exhaustBand.Q.value=.62;
    const exhaustGain=ctx.createGain();exhaustGain.gain.value=0;engineNoise.connect(exhaustBand);exhaustBand.connect(exhaustGain);exhaustGain.connect(engineBus);engineNoise.start();

    const propNoise=ctx.createBufferSource();propNoise.buffer=makeAircraftNoiseBuffer(ctx,2.5);propNoise.loop=true;
    const propBand=ctx.createBiquadFilter();propBand.type='lowpass';propBand.frequency.value=1250;propBand.Q.value=.5;
    const propGain=ctx.createGain();propGain.gain.value=0;propNoise.connect(propBand);propBand.connect(propGain);propGain.connect(engineBus);propNoise.start();
    // Gentle blade-passage modulation on the prop wash texture.
    const propLfo=ctx.createOscillator(),propLfoDepth=ctx.createGain();propLfo.type='sine';propLfo.frequency.value=32.5;propLfoDepth.gain.value=.006;propLfo.connect(propLfoDepth);propLfoDepth.connect(propGain.gain);propLfo.start();

    const windSource=ctx.createBufferSource();windSource.buffer=makeAircraftNoiseBuffer(ctx,3);windSource.loop=true;
    const windHigh=ctx.createBiquadFilter();windHigh.type='highpass';windHigh.frequency.value=145;windHigh.Q.value=.55;
    const windLow=ctx.createBiquadFilter();windLow.type='lowpass';windLow.frequency.value=1900;windLow.Q.value=.5;
    const windGain=ctx.createGain();windGain.gain.value=0;const windPan=ctx.createStereoPanner();windPan.pan.value=0;
    windSource.connect(windHigh);windHigh.connect(windLow);windLow.connect(windGain);windGain.connect(windPan);windPan.connect(master);windSource.start();

    const pedalBus=ctx.createGain();pedalBus.gain.value=1;pedalBus.connect(master);
    const pedalBuffer=makeAircraftNoiseBuffer(ctx,.28);
    aircraftAudio={ctx,master,engineBus,engineFilter,enginePan,tones,exhaustGain,propGain,propLfo,windLow,windGain,windPan,pedalBus,pedalBuffer,previousRudder:0,lastPedalTime:-1,enabled:true};
    ctx.resume().catch(()=>{});
    syncSoundButton();
    return true;
  }catch(err){console.error('[SKYBOUND audio]',err);toast('Unable to initialise aircraft audio.');return false;}
}
export function setAudioParam(param,value,timeConstant=.08){
  if(!aircraftAudio||!Number.isFinite(value))return;
  const now=aircraftAudio.ctx.currentTime;
  param.setTargetAtTime(value,now,timeConstant);
}
export function playRudderPedalFoley(amount){
  if(!aircraftAudio||!state.audioEnabled||state.paused)return;
  const a=aircraftAudio,ctx=a.ctx,now=ctx.currentTime;
  if(now-a.lastPedalTime<.095)return;
  a.lastPedalTime=now;
  const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),pan=ctx.createStereoPanner();
  src.buffer=a.pedalBuffer;filter.type='bandpass';filter.frequency.value=480+Math.min(1,Math.abs(amount))*520;filter.Q.value=.85;
  pan.pan.value=clamp(amount,-1,1)*.35;
  const peak=(.006+Math.min(1,Math.abs(amount))*.014)*state.effectVolume;
  gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(peak,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+.145);
  src.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(a.pedalBus);src.start(now);src.stop(now+.16);
  src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();};
}
export function updateAircraftAudio(dt){
  if(!aircraftAudio)return;
  const a=aircraftAudio,ctx=a.ctx,now=ctx.currentTime;
  if(ctx.state==='suspended'&&state.started&&!state.paused)ctx.resume().catch(()=>{});
  const active=state.started&&!state.paused&&!state.crashed;
  const audible=state.audioEnabled?state.audioVolume:0;
  setAudioParam(a.master.gain,active?audible:0,.16);
  const running=active&&aircraft.engineRunning;
  const power=running?clamp(aircraft.enginePower,0,1):0;
  // Simplified constant-speed-prop training model: idle-to-governed RPM follows power.
  const rpm=running?650+1750*Math.pow(power,.78):0;
  const crankHz=Math.max(0,rpm/60);
  const firingHz=crankHz*3; // six-cylinder, four-stroke firing events / three-blade passage
  for(const t of a.tones){const hz=t.multiple<0?crankHz*Math.abs(t.multiple):firingHz*t.multiple;t.osc.frequency.setTargetAtTime(Math.max(0,hz),now,.11);}
  setAudioParam(a.engineBus.gain,running?.76:0,.12);
  setAudioParam(a.exhaustGain.gain,running?( .012+.048*power):0,.18);
  setAudioParam(a.propGain.gain,running?( .018+.05*power):0,.15);
  setAudioParam(a.propLfo.frequency,firingHz,.12);

  const speedKts=Math.max(0,aircraft.airspeed*KTS_PER_MS);
  const slip=clamp(aircraft.slipAngle/24,-1,1);
  const windIntensity=active?(smooth(12,85,speedKts)*(.085+.11*Math.abs(slip))):0;
  setAudioParam(a.windGain.gain,windIntensity,.22);
  setAudioParam(a.windPan.pan,slip*.72,.18);
  const cockpit=state.camera===1;
  setAudioParam(a.engineFilter.frequency,cockpit?1550:3100,.25);
  setAudioParam(a.windLow.frequency,cockpit?1650:3900,.25);
  setAudioParam(a.enginePan.pan,cockpit?slip*.12:clamp(-aircraft.position.x/1800,-.65,.65),.2);

  const rudder=aircraft.controlYaw;
  const rudderDelta=rudder-a.previousRudder;
  if(active&&Math.abs(rudderDelta)>.135)playRudderPedalFoley(rudderDelta);
  a.previousRudder=rudder;
}
export function syncSoundButton(){const b=$('soundBtn');if(!b)return;b.textContent=state.audioEnabled?'SOUND ON':'SOUND OFF';b.setAttribute('aria-pressed',String(state.audioEnabled));}
export function toggleAircraftAudio(){state.audioEnabled=!state.audioEnabled;if(state.audioEnabled)ensureAircraftAudio();syncSoundButton();toast(state.audioEnabled?'Aircraft audio enabled.':'Aircraft audio muted.');}
export function setAircraftAudioVolume(value){state.audioVolume=clamp(Number(value),0,1);if(aircraftAudio)setAudioParam(aircraftAudio.master.gain,state.started&&!state.paused&&state.audioEnabled?state.audioVolume:0,.08);}
document.addEventListener('visibilitychange',()=>{if(!aircraftAudio)return;if(document.hidden){aircraftAudio.ctx.suspend().catch(()=>{});}else if(state.started&&!state.paused){aircraftAudio.ctx.resume().catch(()=>{});}});
