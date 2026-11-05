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
      <div id="sim"></div><canvas id="rainDrops" className="rain-drops"></canvas><div className="radio-sub" id="radioSub"></div><div className="grain"></div>
      <div className="loading" id="loading"><div className="loader-inner"><div className="loader-mark">SB</div><div className="loader-text">INITIALISING RENDERER</div><div className="loader-bar"><i></i></div></div></div>
      <header className="topbar">
        <div className="brand"><div className="brand-mark">SB</div><div><div className="brand-name">SKYBOUND</div><div className="brand-sub">FIRST CHARTER · CESSNA 182 SKYLANE</div></div></div>
        <div className="top-actions"><button id="hudBtn" title="Toggle HUD (H)">HUD</button><button id="soundBtn" aria-pressed="true">SOUND ON</button><button id="settingsBtn">SETTINGS</button><button id="pauseBtn" title="Pause (Esc)">PAUSE</button></div>
      </header>
      <section className="hud" id="hud">
        <div className="hud-compass">
          <div className="hdg"><span id="hdgVal">000</span>°</div>
          <canvas id="compassTape"></canvas>
          <div className="flight-tag" id="flightTag"></div>
          <div className="wind-ind" id="windInd"><svg viewBox="0 0 24 24" id="windArrow"><path d="M12 3v15 M7 13l5 6 5-6" /></svg><span id="windTxt"></span></div>
        </div>
        <div className="approach" id="approachGuide">
          <div className="ap-kicker">FINAL · <span id="apName"></span></div>
          <div className="ap-body">
            <div className="ap-scale"><i className="ap-mark" id="apGlide"></i><span>3°</span></div>
            <div className="ap-center"><div className="ap-loc"><i id="apLoc"></i></div><div className="ap-dist" id="apDist"></div></div>
          </div>
        </div>
        <div className="hud-readout left">
          <div className="ro-label">IAS</div>
          <div className="ro-main"><span id="spdVal">0</span><small>KT</small></div>
          <div className="ro-sub spd-sub"><span id="gsVal">GS 0</span><span id="machVal"></span></div>
          <div className="thr"><div className="thr-track"><i id="thrFill"></i></div><span id="thrVal">0%</span></div>
          <div className="thr fuel" id="fuelRow"><div className="thr-track"><i id="fuelFill"></i></div><span id="fuelVal">FUEL</span></div>
        </div>
        <div className="hud-readout right">
          <div className="ro-label">ALT AGL</div>
          <div className="ro-main"><span id="altVal">0</span><small>FT</small></div>
          <div className="ro-sub"><span id="mslVal">MSL 0</span><span id="vsVal">• 0</span></div>
        </div>
        <div className="center-reticle"></div>
        <div className="survey-ring" id="surveyRing">
          <svg viewBox="0 0 100 100"><circle className="sr-bg" cx="50" cy="50" r="44" /><circle className="sr-fg" cx="50" cy="50" r="44" /></svg>
          <div className="sr-text"><div className="sr-kicker">SURVEYING</div><div className="sr-name" id="surveyName"></div><div className="sr-hint" id="surveyHint"></div></div>
        </div>
        <div className="flight-status" id="flightStatus"></div>
        <aside className="charter-card" id="charterCard"></aside>
        <div className="hud-map"><canvas id="minimap"></canvas><div className="map-hint">M · CHART</div></div>
        <div className="cam-label" id="cameraName"></div>
        <div className="discovery-banner" id="discoveryBanner"></div>
        <div className="landing-stamp" id="landingStamp"></div>
        <span id="controllerStatus" hidden></span><span id="gyroStatus" hidden></span>
      </section>

      <div className="overlay" id="mainMenu" data-tab="charters">
        <div className="m-scrim" aria-hidden="true"></div>
        <header className="m-top">
          <div className="m-brand">
            <span className="m-mark" aria-hidden="true">SB</span>
            <div><b>SKYBOUND</b><small>FIRST CHARTER · WORLD <span id="worldSeed">—</span></small></div>
          </div>
          <div className="m-world">
            <span className="m-chip" title="Season and terrain"><span id="worldBiome">—</span></span>
            <span className="m-chip" title="Sky"><span id="worldSky">—</span></span>
            <span className="m-chip" title="Home field elevation"><span id="worldAirfield">—</span></span>
            <button className="m-icon-btn" id="newWorldBtn" title="Generate a new world">NEW WORLD</button>
            <button className="m-icon-btn" id="resumeWorldBtn" style={{display:'none'}}>RESUME<small></small></button>
          </div>
        </header>

        <section className="m-panel glass" aria-label="Main menu">
          <h1 className="hero-title">Every world is <em>uncharted.</em></h1>
          <p className="intro">A new wilderness every time you load. Find its landmarks from the air, survey them low and slow, and bring your aircraft home with a clean landing.</p>

          <div className="m-tabs" role="tablist" aria-label="Game mode">
            <button role="tab" data-tab="charters" aria-selected="true">Charters</button>
            <button role="tab" data-tab="daily" aria-selected="false">Daily</button>
            <button role="tab" data-tab="cargo" aria-selected="false">Bush Pilot</button>
            <button role="tab" data-tab="explore" aria-selected="false">Explore</button>
          </div>

          <div className="m-pane" data-pane="charters" role="tabpanel">
            <div className="board-head"><span>Charter board</span><span className="board-sub">Survey 3 landmarks, then land</span></div>
            <div className="charter-board" id="charterBoard"><div className="board-empty">Surveying this world…</div></div>
            <button className="primary m-cta" id="startBtn">FLY CHARTER{'\u00a0'} ↗</button>
          </div>
          <div className="m-pane" data-pane="daily" role="tabpanel">
            <div className="m-mode">
              <div className="m-mode-kicker">ONE WORLD FOR EVERY PILOT</div>
              <div className="daily-title" id="dailyTitle">Daily Charter</div>
              <p className="daily-status" id="dailyStatus"></p>
              <ul className="m-points"><li>Same world, same route for everyone today</li><li>Race a ghost of your best run</li><li>Share your result line</li></ul>
            </div>
            <button className="primary m-cta" id="dailyBtn">PLAY DAILY</button>
          </div>
          <div className="m-pane" data-pane="cargo" role="tabpanel">
            <div className="m-mode">
              <div className="m-mode-kicker">FREIGHT BETWEEN BUSH STRIPS</div>
              <div className="daily-title">Bush Pilot</div>
              <p className="daily-status">Pick a job from the board: fuel drums, mail, survey crews or a timed medical run. Heavy loads climb slowly; you are paid on landing.</p>
              <ul className="m-points"><li>Earn cash and XP per delivery</li><li>Medical runs pay a bonus on time</li><li>Fly on from wherever you land</li></ul>
            </div>
            <button className="primary m-cta" id="cargoBtn">OPEN JOB BOARD{'\u00a0'} ↗</button>
          </div>
          <div className="m-pane" data-pane="explore" role="tabpanel">
            <div className="m-mode">
              <div className="m-mode-kicker">NO ROUTE, NO CLOCK</div>
              <div className="daily-title">Explore</div>
              <p className="daily-status">Chart the whole world at your own pace. Every landmark you find is named, stamped in your logbook and shareable.</p>
              <ul className="m-points"><li>Up to 12 landmarks per world</li><li>Rare finds earn their own stamp</li><li>Press M for the expedition chart</li></ul>
            </div>
            <button className="primary m-cta" id="freeBtn">TAKE OFF{'\u00a0'} ↗</button>
          </div>

          <div className="m-sub">
            <button className="m-link" id="teachBtn">Flight School</button>
            <button className="m-link" id="controlsBtn">Controls</button>
            <button className="m-link" onClick={()=>document.getElementById('settingsBtn')?.click()}>Settings</button>
            <button className="m-link" onClick={(e)=>{document.getElementById('soundBtn')?.click();const s=document.getElementById('soundBtn');e.currentTarget.textContent=s?.textContent==='SOUND ON'?'Sound on':'Sound off';}}>Sound on</button>
          </div>
        </section>

        <aside className="m-dock" aria-label="Pilot and hangar">
          <div className="glass m-pilot">
            <div className="side-kicker">PILOT</div>
            <div className="pilot-rank" id="pilotRank">Student Pilot</div>
            <div className="xp-bar" role="progressbar" aria-label="Rank progress"><i id="pilotXpBar"></i></div>
            <div className="pilot-xp" id="pilotXp">0 XP</div>
            <div className="pilot-stats" id="pilotStats"></div>
            <button className="ghost" id="logbookBtn">LOGBOOK</button>
          </div>
          <div className="glass m-hangar side-block hangar" id="hangar"></div>
        </aside>
      </div>

      <div className="overlay" id="pauseMenu" style={{display:'none'}}>
        <div className="modal-card pause-card"><div className="kicker">FLIGHT PAUSED</div><h2>Take a breath.</h2><p className="intro">Your aircraft is holding its current state. Ready when you are.</p><div className="modal-actions"><button className="primary" id="resumeBtn">RESUME</button><button id="chartBtn">CHART</button><button id="restartBtn">RESTART</button><button id="returnBtn">MAIN MENU</button></div></div>
      </div>

      <div className="photo-ui" id="photoUi">
        <div className="pf-bar top"></div><div className="pf-bar bottom"></div>
        <div className="pf-caption"><div className="kicker">SKYBOUND · PHOTO MODE</div><div className="pf-place" id="photoCaption"></div></div>
        <div className="pf-controls"><span className="pf-hint">DRAG ORBIT · SCROLL ZOOM · WASD ROTATE</span><button id="photoDof" className="on">DEPTH OF FIELD</button><button className="primary" id="photoCapture">CAPTURE ◉</button><button id="photoExit">EXIT · P</button></div>
        <div className="pf-flash" id="photoFlash"></div>
      </div>
      <div className="overlay" id="chartOverlay" style={{display:'none'}}>
        <div className="chart-card">
          <div className="chart-head"><div><div className="kicker">EXPEDITION CHART</div><h2 id="chartTitle">Chart</h2><div className="chart-meta" id="chartMeta"></div></div><div className="chart-actions"><button id="chartShare">COPY SHARE</button><button id="chartSave">SAVE PNG ↓</button><button className="close" id="chartClose">✕</button></div></div>
          <canvas id="chartCanvas"></canvas>
        </div>
      </div>

      <div className="overlay" id="completeOverlay" style={{display:'none'}}><div className="modal-card complete-card" id="completeCard"></div></div>
      
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
      <div className="toast" id="toast"></div><div className="cheat-banner" id="cheatBanner"></div>
    </>
  );
}
