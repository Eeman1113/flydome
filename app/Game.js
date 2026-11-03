'use client';

import { useEffect, useState } from 'react';
import MobileNotice from './MobileNotice';

// Phones and touch-only tablets get an explanation page instead of the simulator:
// it needs a keyboard/mouse (or controller) and a desktop-class GPU.
function isHandheld() {
  const ua = navigator.userAgent || '';
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini|IEMobile/i.test(ua);
  const noFinePointer = !window.matchMedia('(any-pointer: fine)').matches;
  return mobileUA || iPadOS || noFinePointer;
}

export default function Game({ readmeHtml }) {
  const [device, setDevice] = useState(null);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    // ?handheld previews the phone page on a desktop; ?desktop skips it on a handheld.
    setDevice(q.has('handheld') || (!q.has('desktop') && isHandheld()) ? 'handheld' : 'desktop');
  }, []);

  if (device === 'handheld') {
    return <MobileNotice readmeHtml={readmeHtml} onContinue={() => setDevice('desktop')} />;
  }
  return <Simulator start={device === 'desktop'} />;
}

// The interface is static markup; the three.js engine (src/game) drives it imperatively
// by element id, exactly like the HUD of a native sim. The engine is loaded client-side only.
function Simulator({ start }) {
  useEffect(() => {
    if (!start) return;
    import('../src/game/engine.js')
      .then((engine) => engine.startGame())
      .catch((err) => console.error('[SKYBOUND] engine failed to load', err));
  }, [start]);

  return (
    <>
      <div id="sim"></div><div className="grain"></div>
      <div className="loading" id="loading"><div className="loader-inner"><div className="loader-mark">SB</div><div className="loader-text">INITIALISING RENDERER</div><div className="loader-bar"><i></i></div></div></div>
      <header className="topbar">
        <div className="brand"><div className="brand-mark">SB</div><div><div className="brand-name">SKYBOUND</div><div className="brand-sub">HDR PROCEDURAL WORLD · CESSNA 182 SKYLANE</div></div></div>
        <div className="top-actions"><button id="hudBtn">HUD / H</button><button id="soundBtn" aria-pressed="true">SOUND ON</button><button id="settingsBtn">SETTINGS</button><button id="pauseBtn">PAUSE / ESC</button></div>
      </header>
      <div className="flight-tag" id="flightTag">FREE FLIGHT</div>
      <section className="hud" id="hud">
        <div className="panel hud-left">
          <div className="eyebrow">Flight telemetry</div>
          <div className="metric"><div className="metric-label">Indicated airspeed</div><div><span className="metric-value" id="speed">0</span><span className="metric-unit">KTS</span></div></div>
          <div className="metric"><div className="metric-label">Altitude AGL</div><div><span className="metric-value" id="altitude">0</span><span className="metric-unit">FT</span></div></div>
          <div className="metric-row"><span>ALTITUDE MSL</span><strong id="altMsl">0 FT</strong></div>
          <div className="metric-row"><span>VERTICAL SPEED</span><strong id="vspeed">0 FPM</strong></div>
          <div className="metric-row"><span>LOAD FACTOR</span><strong id="gLoad">1.0 G</strong></div>
          <div className="metric-row"><span>SIDESLIP</span><strong id="slipAngle">0.0°</strong></div>
          <div className="metric-row"><span>WORLD POSITION</span><strong id="position">0 / 0</strong></div>
          <div className="status-pill"><i className="dot"></i><span id="flightStatus">ON RUNWAY</span></div>
        </div>
        <div className="panel compass"><div className="eyebrow">Magnetic heading</div><div className="heading" id="heading">000°</div><div className="ticks">N · NE · E · SE · S · SW · W · NW</div></div>
        <div className="panel hud-right">
          <div className="eyebrow">Aircraft systems</div>
          <div className="instrument"><div className="instrument-head"><span>THROTTLE</span><strong id="throttleText">0%</strong></div><div className="bar"><i id="throttleBar"></i></div></div>
          <div className="instrument"><div className="instrument-head"><span>ENGINE</span><strong id="engineText">IDLE</strong></div><div className="bar"><i id="engineBar"></i></div></div>
          <div className="instrument"><div className="instrument-head"><span>LANDING GEAR</span><strong id="gearText">FIXED GEAR</strong></div><div className="bar"><i id="gearBar" style={{width:'100%',background:'var(--lime)'}}></i></div></div>
          <div className="instrument"><div className="instrument-head"><span>WIND</span><strong id="windText">240° / 04 KT</strong></div></div>
          <div className="instrument"><div className="instrument-head"><span>SIM RATE</span><strong id="fpsText">60 FPS</strong></div></div>
          <div className="instrument"><div className="instrument-head"><span>GFX</span><strong id="gfxText">AUTO</strong></div></div>
        </div>
        <div className="center-reticle"></div>
        <div className="attitude-wrap"><div className="attitude-sky" id="attitudeSky"></div><div className="attitude-mark"></div></div>
        <div className="bottom-left">
          <div className="panel mini-panel"><div className="eyebrow">Camera</div><div className="big" id="cameraName">CHASE</div></div>
          <div className="panel mini-panel"><div className="eyebrow">Controller</div><div className="big" id="controllerStatus">KEYBOARD + MOUSE</div></div>
          <div className="panel mini-panel"><div className="eyebrow">Gyroscope</div><div className="big" id="gyroStatus">OFFLINE</div></div>
        </div>
        <div className="bottom-right"><span className="hint">WASD FLIGHT · LMB DRAG STEER · RMB DRAG LOOK · G GEAR INFO · SPACE PAUSE</span></div>
      </section>
      
      <div className="overlay" id="mainMenu">
        <div className="menu-card">
          <div className="menu-grid">
            <div className="menu-main"><div className="kicker">A NEW WORLD EVERY TIME</div><h1 className="hero-title">Find your<br /><em>own horizon.</em></h1><p className="intro">Take the controls of your imported Cessna 182 Skylane and explore a brand-new procedural continent, lit by a real HDR sky, with mountains, rivers, lakes and forests. Every refresh generates a different world. Start free flight, or choose Teach Me to Fly for a guided lesson with live, device-specific control instructions.</p><div className="menu-buttons"><button className="primary" id="startBtn">START FLIGHT{"\u00a0"} ↗</button><button id="teachBtn">TEACH ME TO FLY</button><button id="controlsBtn">CONTROLS</button><button id="newWorldBtn">NEW WORLD ⟳</button></div><div style={{marginTop:'18px',color:'#7f95a8',fontSize:'10px',lineHeight:1.6}}>No controller required: use WASD and mouse-drag flight controls. Connect a DualSense for controller input.</div></div>
            <aside className="menu-side"><h3>Flight configuration</h3><div className="spec"><span>Aircraft</span><strong>Cessna 182 Skylane</strong></div><div className="spec"><span>World seed</span><strong id="worldSeed">—</strong></div><div className="spec"><span>Climate</span><strong id="worldBiome">—</strong></div><div className="spec"><span>Sky (HDR)</span><strong id="worldSky">—</strong></div><div className="spec"><span>Airfield</span><strong id="worldAirfield">—</strong></div><div className="spec"><span>Simulation</span><strong>Real-time aerodynamics</strong></div><div style={{marginTop:'20px',padding:'12px',borderRadius:'9px',background:'rgba(113,216,238,.07)',border:'1px solid rgba(113,216,238,.16)',fontSize:'10px',lineHeight:1.6,color:'#a9c3d4'}}><strong style={{color:'var(--cyan)'}}>DUALSENSE READY</strong><br />Sticks, triggers and buttons use the Gamepad API. Pair the controller's gyro separately through WebHID in Settings.</div></aside>
          </div><div className="menu-foot"><span>SKYBOUND SIMULATION LABS</span><span>CESSNA 182 · MAC / WEB</span></div>
        </div>
      </div>
      
      <div className="overlay" id="pauseMenu" style={{display:'none'}}>
        <div className="modal-card" style={{width:'min(420px,100%)',textAlign:'center'}}><div className="kicker">FLIGHT PAUSED</div><h2 style={{fontSize:'32px',letterSpacing:'-.06em',margin:'12px 0'}}>Take a breath.</h2><p className="intro" style={{margin:'0 auto'}}>Your aircraft is holding its current state. Ready when you are.</p><div className="modal-actions" style={{justifyContent:'center'}}><button className="primary" id="resumeBtn">RESUME FLIGHT</button><button id="restartBtn">RESTART</button><button id="returnBtn">MAIN MENU</button></div></div>
      </div>
      
      <aside className="tutorial-panel" id="tutorialPanel" style={{display:'none'}} aria-live="polite">
        <div className="tutorial-top"><span className="tutorial-step" id="tutorialStep">FLIGHT SCHOOL · 01 / 08</span><button id="tutorialClose" aria-label="Close lesson">✕</button></div>
        <div className="tutorial-progress"><i id="tutorialProgress"></i></div>
        <h2 className="tutorial-title" id="tutorialTitle">Power up</h2>
        <p className="tutorial-copy" id="tutorialObjective">Increase throttle before takeoff.</p>
        <div className="tutorial-command active" id="tutorialPrimaryWrap"><span id="tutorialPrimaryLabel">KEYBOARD + MOUSE</span><strong id="tutorialPrimary">Hold LEFT SHIFT to increase throttle.</strong></div>
        <div className="tutorial-status" id="tutorialStatus">WAITING FOR YOUR INPUT</div>
        <div className="tutorial-actions"><div className="tutorial-auto"><strong>AUTO-ADVANCE ENABLED</strong><br />Complete the action and the instructor moves on automatically. No button presses needed. ESC / OPTIONS pauses.</div><button className="tutorial-exit" id="tutorialExit">EXIT LESSON</button></div>
      </aside>
      
      <div className="overlay" id="modalOverlay" style={{display:'none'}}><div className="modal-card" id="modalContent"></div></div>
      <div className="toast" id="toast"></div>
    </>
  );
}
