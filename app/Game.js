'use client';
import { ChevronLeft, ChevronRight, ArrowRight, BookOpen, CalendarDays, Camera, Cloud, Compass, Download, Eye, GraduationCap, History, House, Keyboard, Map as MapIcon, Mountain, Package, Pause, PlaneLanding, PlaneTakeoff, Play, RefreshCw, RotateCcw, Settings, Share2, Volume2, X } from 'lucide-react';

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
        <div className="top-actions"><button id="hudBtn" title="Toggle HUD (H)"><Eye className="ic" aria-hidden="true"/>HUD</button><button id="soundBtn" aria-pressed="true"><Volume2 className="ic" aria-hidden="true"/><span>SOUND ON</span></button><button id="settingsBtn"><Settings className="ic" aria-hidden="true"/>SETTINGS</button><button id="pauseBtn" title="Pause (Esc)"><Pause className="ic" aria-hidden="true"/>PAUSE</button></div>
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

      <div className="overlay mn" id="mainMenu" data-tab="charters">
        <div className="m-scrim" aria-hidden="true"></div>

        <header className="mn-top">
          <div className="mn-brand"><b>SKYBOUND</b><small>WORLD <span id="worldSeed">—</span></small></div>
          <nav className="mn-icons" aria-label="World and settings">
            <button className="mn-ic" id="resumeWorldBtn" style={{display:'none'}} title="Resume last world" aria-label="Resume last world"><History aria-hidden="true"/><small></small></button>
            <button className="mn-ic" id="newWorldBtn" title="New world" aria-label="New world"><RefreshCw className="ic-spin" aria-hidden="true"/></button>
            <button className="mn-ic" id="logbookBtn" title="Logbook" aria-label="Logbook"><BookOpen aria-hidden="true"/></button>
            <button className="mn-ic" id="controlsBtn" title="Controls" aria-label="Controls"><Keyboard aria-hidden="true"/></button>
            <button className="mn-ic" title="Settings" aria-label="Settings" onClick={()=>document.getElementById('settingsBtn')?.click()}><Settings aria-hidden="true"/></button>
            <button className="mn-ic" id="menuSoundBtn" title="Sound" aria-label="Toggle sound"><Volume2 aria-hidden="true"/></button>
          </nav>
        </header>

        <main className="mn-main">
          <p className="mn-meta"><span id="worldBiome">—</span><i>·</i><span id="worldSky">—</span><i>·</i><span id="worldAirfield">—</span></p>
          <h1 className="mn-title">Every world is <em>uncharted.</em></h1>

          <ul className="mn-list">
            <li className="mn-row mn-row-primary">
              <button className="mn-item" id="startBtn"><span className="mn-label">Fly charter</span><ArrowRight className="mn-go" aria-hidden="true"/></button>
              <div className="mn-charter">
                <button className="mn-step" id="chPrev" aria-label="Previous charter"><ChevronLeft aria-hidden="true"/></button>
                <div className="mn-ch"><b id="chName">—</b><small id="chMeta"></small></div>
                <button className="mn-step" id="chNext" aria-label="Next charter"><ChevronRight aria-hidden="true"/></button>
              </div>
              <div id="charterBoard" hidden></div>
            </li>
            <li className="mn-row"><button className="mn-item" id="dailyBtn"><span className="mn-label">Daily charter</span><small className="mn-sub" id="dailyStatus"></small><ArrowRight className="mn-go" aria-hidden="true"/></button><span id="dailyTitle" hidden></span></li>
            <li className="mn-row"><button className="mn-item" id="cargoBtn"><span className="mn-label">Bush pilot</span><small className="mn-sub">Freight between strips</small><ArrowRight className="mn-go" aria-hidden="true"/></button></li>
            <li className="mn-row"><button className="mn-item" id="freeBtn"><span className="mn-label">Explore</span><small className="mn-sub">No route, no clock</small><ArrowRight className="mn-go" aria-hidden="true"/></button></li>
            <li className="mn-row"><button className="mn-item" id="teachBtn"><span className="mn-label">Learn to fly</span><small className="mn-sub">Ten lessons with Skybound Ground</small><ArrowRight className="mn-go" aria-hidden="true"/></button></li>
          </ul>
        </main>

        <footer className="mn-foot">
          <div className="mn-pilot">
            <div className="mn-pilot-line"><b id="pilotRank">Student Pilot</b><span id="pilotXp">0 XP</span></div>
            <div className="mn-xp" role="progressbar" aria-label="Rank progress"><i id="pilotXpBar"></i></div>
            <div id="pilotStats" hidden></div>
          </div>
          <div className="mn-hangar" id="hangar"></div>
        </footer>
      </div>

      <div className="overlay" id="pauseMenu" style={{display:'none'}}>
        <div className="modal-card pause-card"><div className="kicker">FLIGHT PAUSED</div><h2>Take a breath.</h2><p className="intro">Your aircraft is holding its current state. Ready when you are.</p><div className="modal-actions"><button className="primary" id="resumeBtn"><Play className="ic" aria-hidden="true"/>RESUME</button><button id="chartBtn"><MapIcon className="ic" aria-hidden="true"/>CHART</button><button id="restartBtn"><RotateCcw className="ic" aria-hidden="true"/>RESTART</button><button id="returnBtn"><House className="ic" aria-hidden="true"/>MAIN MENU</button></div></div>
      </div>

      <div className="photo-ui" id="photoUi">
        <div className="pf-bar top"></div><div className="pf-bar bottom"></div>
        <div className="pf-caption"><div className="kicker">SKYBOUND · PHOTO MODE</div><div className="pf-place" id="photoCaption"></div></div>
        <div className="pf-controls"><span className="pf-hint">DRAG ORBIT · SCROLL ZOOM · WASD ROTATE</span><button id="photoDof" className="on">DEPTH OF FIELD</button><button className="primary" id="photoCapture"><Camera className="ic" aria-hidden="true"/>CAPTURE</button><button id="photoExit"><X className="ic" aria-hidden="true"/>EXIT · P</button></div>
        <div className="pf-flash" id="photoFlash"></div>
      </div>
      <div className="overlay" id="chartOverlay" style={{display:'none'}}>
        <div className="chart-card">
          <div className="chart-head"><div><div className="kicker">EXPEDITION CHART</div><h2 id="chartTitle">Chart</h2><div className="chart-meta" id="chartMeta"></div></div><div className="chart-actions"><button id="chartShare"><Share2 className="ic" aria-hidden="true"/><span>COPY SHARE</span></button><button id="chartSave"><Download className="ic" aria-hidden="true"/>SAVE PNG</button><button className="close" id="chartClose" aria-label="Close chart"><X className="ic" aria-hidden="true"/></button></div></div>
          <canvas id="chartCanvas"></canvas>
        </div>
      </div>

      <div className="overlay" id="completeOverlay" style={{display:'none'}}><div className="modal-card complete-card" id="completeCard"></div></div>
      
      <aside className="tutorial-panel" id="tutorialPanel" style={{display:'none'}} aria-live="polite">
        <div className="tutorial-top"><span className="tutorial-step" id="tutorialStep">FLIGHT SCHOOL · 01 / 08</span><button id="tutorialClose" aria-label="Close lesson"><X className="ic" aria-hidden="true"/></button></div>
        <div className="tutorial-progress"><i id="tutorialProgress"></i></div>
        <h2 className="tutorial-title" id="tutorialTitle">Power up</h2>
        <p className="tutorial-copy" id="tutorialObjective">Increase throttle before takeoff.</p>
        <div className="tutorial-command active" id="tutorialPrimaryWrap"><span id="tutorialPrimaryLabel">KEYBOARD + MOUSE</span><strong id="tutorialPrimary">Hold LEFT SHIFT to increase throttle.</strong></div>
        <div className="tutorial-status" id="tutorialStatus">WAITING FOR YOUR INPUT</div>
        <div className="tutorial-actions"><div className="tutorial-auto"><strong>AUTO-ADVANCE ENABLED</strong><br />Complete the action and the instructor moves on automatically. No button presses needed. ESC / OPTIONS pauses.</div><button className="tutorial-exit" id="tutorialExit"><X className="ic" aria-hidden="true"/>EXIT LESSON</button></div>
      </aside>
      
      <div className="overlay" id="modalOverlay" style={{display:'none'}}><div className="modal-card" id="modalContent"></div></div>
      <div className="toast" id="toast"></div><div className="cheat-banner" id="cheatBanner"></div>
    </>
  );
}
