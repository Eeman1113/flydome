# SKYBOUND — Cessna 182 Skylane Flight Simulator

A browser flight simulator built with **Next.js** and **three.js**. **Every page load generates a brand-new world** (seeded terrain, climate, season, airfield site and clouds) lit by a real HDR sky. The aircraft is the user-supplied `public/models/cessna_182_skylane.glb`. All code and assets are bundled locally; no CDN is needed.

## World & rendering (v0.2)

- **New world on every refresh.** A random seed drives the continent: domain-warped continents and coastlines, ridged-multifractal mountain ranges, rolling hills, lowland rivers, lakes, temperature/moisture climate, summer or autumn seasons. The airfield is placed automatically at the flattest suitable site near the origin. Use `?seed=12345` to revisit a world, or **NEW WORLD** in the menu.
- **HDR sky lighting.** Four CC0 pure-sky HDRIs from [Poly Haven](https://polyhaven.com) live in `skies/` (partly cloudy midday, clear noon, late afternoon, golden sunset); one is picked per world (`?sky=belfast` etc. to force one). The HDR is analysed at load: the sun disc is located and integrated for the sun light's direction, colour and irradiance; sky irradiance sets exposure; the sun is clamped out of the image-based lighting so it is not counted twice.
- **Terrain.** Chunks are generated in Web Workers with distance LOD (64/32/16/8 segments) and crack-hiding skirts. Per-vertex biome data, baked terrain self-shadowing toward the HDR sun and ambient occlusion feed a splatting shader: grass/dry/desert/tundra, farmland patchwork, forest floor, slope rock with strata, snow line, beaches and wet shorelines.
- **Forests** are instanced conifer and broadleaf trees with per-instance tint and wind sway; the airfield sits in a natural clearing with a ragged tree line. **Water** is PBR with layered scrolling normals reflecting the HDR sky. **Clouds** are camera-sorted, sun-lit billboard cumulus placed from the same noise field that casts matching **cloud shadows** on the terrain. **Atmosphere** is height fog with sun in-scattering.
- **Post-processing** (High/Ultra): MSAA HDR render target, bloom, ACES tone mapping, vignette/grade. Aircraft shadow via a tight sun-aligned shadow map. In the cockpit the aircraft is rendered in a separate near-plane pass so the world keeps depth precision to the horizon.
- **Automatic quality.** The GPU is detected (WebGL renderer string, core count) to pick Low/Medium/High/Ultra, then a runtime governor measures frame rate against the display refresh and adjusts render scale, view distance (4–20 km of streamed chunks) and the effects tier. Settings → Graphics quality allows a manual override.

## Play online

**https://eeman1113.github.io/flydome/** — deployed automatically to GitHub Pages by `.github/workflows/pages.yml` on every push to `main` (static export with base path `/flydome`).

## Running locally

Requires Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build: `npm run build && npm run start` (the build uses webpack). On macOS you can also double-click `launch-macos.command`, which installs dependencies on first run and starts the dev server.

Desktop Chrome or Edge is recommended (WebHID gyro support). URL options: `?seed=12345` (world), `?sky=belfast` (sky), `?debug` (exposes `window.SKYB` for inspection).

## Assets & optimisation

The aircraft GLB is meshopt-compressed with WebP textures (glTF-Transform: dedup, prune, webp, meshopt), shrinking it from ~31 MB to ~5 MB with all node and material names preserved. three.js decodes it with `MeshoptDecoder`.

## Project layout

```
app/                 Next.js App Router: layout, page (HUD/menu markup), global styles
src/game/
  engine.js          renderer, scene setup, post-processing, aircraft loading, frame loop
  terrainLib.js      seeded terrain/climate generator + chunk mesh builder (shared with worker)
  terrain.worker.js  Web Worker that builds terrain chunks off the main thread
  chunks.js          chunk streaming, LOD, forests, physics ground queries
  sky.js             HDR loading, sun/exposure calibration, atmosphere shader chunks, sky dome
  materials.js       terrain/water/tree shaders and geometry
  scenery.js         water plane, clouds, airfield
  perf.js            GPU detection and the runtime quality governor
  physics.js         flight model        camera.js   camera rigs
  input.js           keyboard/mouse/gamepad/WebHID gyro     audio.js   procedural engine audio
  tutorial.js        Flight School      ui.js       HUD, menus, settings
  config.js / world.js / util.js / textures.js   shared state, seeded world, helpers, procedural textures
public/models/       Cessna 182 GLB      public/skies/   CC0 HDR skies
```

## DualSense support

1. Pair the PS5 DualSense with macOS Bluetooth settings or connect it over USB.
2. Click the simulator page, then press a controller button so the browser exposes it through the Gamepad API.
3. Use **Settings → Pair DualSense Gyro** and select the controller in the browser's HID picker.
4. Hold the controller still and choose **Calibrate Neutral**.

The Gamepad API handles buttons, sticks and triggers. The gyro is read from DualSense HID input reports through WebHID. WebHID requires a secure context (localhost or HTTPS) and a compatible browser; Safari does not currently support WebHID. If the browser does not expose the controller over WebHID, the main Gamepad controls still work and gyro remains visibly offline rather than being simulated.

## Controls

- W/S or Up/Down: pitch up/down
- A/D or Left/Right: roll left/right (positive roll is a right bank)
- Q/E: rudder left/right
- Shift/Ctrl: throttle up/down
- G / Cross: show fixed-gear information (the Cessna 182 landing gear does not retract)
- 1–4: cockpit, chase, orbit, free-look
- H: HUD
- Escape / Space: pause
- Hold left mouse button and drag: pitch / roll flight steering when no gamepad is detected
- Hold right mouse button and drag: orbit / free-look camera
- WASD flight controls remain available even when a controller is connected

DualSense mapping is shown in the in-app Controls panel.

## Keyboard + mouse fallback

The simulator does not require a controller. When no Gamepad API controller is connected, the controller indicator shows **KEYBOARD + MOUSE**. Use WASD for pitch and roll, Q/E for rudder, Shift/Ctrl for throttle, and hold the left mouse button while dragging to steer (horizontal movement controls roll; vertical movement controls pitch). Hold the right mouse button and drag to orbit the camera.

The `glass is not defined` startup issue has been fixed by moving the canopy material into shared module scope so both the aircraft cockpit and runway control-tower glazing can use it.

## Notes

- This is a functional prototype, not a certified training simulator. Aerodynamics are simplified and should not be used for real-world flight training.
- Terrain is generated deterministically from a seed and streamed in chunks around the aircraft.
## Visual stability notes (v0.1.2)

This build addresses terrain shimmer/flicker by removing the single transparent 30 km water plane that intersected low terrain, generating opaque ocean quads only where terrain is fully below sea level, assigning river segments to exactly one chunk (to prevent duplicate transparent river surfaces), and lowering/flattening terrain beneath the full runway footprint. Procedural terrain no longer receives the large directional shadow map, which avoids shadow-map acne on long terrain surfaces. Chunk cleanup now resolves every tagged object to its owning chunk and only updates when the aircraft crosses a chunk boundary.


## Flight School (v0.1.4 · automatic, device-specific)

Select **Teach Me to Fly** to begin the guided lessons. Flight School watches the simulated aircraft state and automatically advances once the current action is completed; there is no Next button and no need to take your hands off the controls. Press **ESC / OPTIONS** to pause or **Exit Lesson** to leave.

Only one instruction scheme is shown at a time:
- **DualSense** when controller input is active: exact stick, trigger and button directions.
- **Keyboard + mouse** when keyboard or mouse input is active, or when no controller is connected: the relevant key and drag instructions appear together in one card.

The lesson scheme changes automatically when you switch devices. A connected controller does not prevent left-mouse drag flight control; right-mouse drag remains camera look. The lessons cover throttle, takeoff roll, rotation, climb stabilization, banking and leveling. The supplied Cessna 182 has fixed landing gear, so Flight School does not ask you to retract it.

## Performance and terrain stability

The renderer now uses a stable quality-based pixel ratio instead of continuously changing render resolution. Terrain streaming uses a five-by-five active chunk radius and retains a wider safety ring to avoid visible gaps during chunk generation. Initial nearby chunks are built behind the loading screen, and only one additional chunk is generated per frame within a small frame budget.


## Takeoff acceleration fix (v0.1.5)

The runway used to apply a fixed 0.985 velocity multiplier every 1/60-second physics step. That compounded to severe braking and could trap the aircraft near 7 knots. Runway resistance is now timestep-independent exponential rolling resistance (3.5% per second longitudinally, with stronger lateral tyre scrub). The trainer mass, wing area, thrust and lift curve are tuned for a practical takeoff roll. Stall force is only applied while airborne, and Flight School waits for 58 kt before asking the pilot to rotate. Indicated airspeed is computed from air-relative velocity.

This is still a simplified game flight model, not a certified aircraft performance simulation.


## Flight School takeoff threshold (v0.1.6)

Flight School's takeoff roll lesson now waits for 58 kt indicated airspeed before requesting rotation. The physics model uses a 1,050 kg trainer, 18.5 m² wing area, 6,000 N maximum thrust and an adjusted lift curve. At full throttle with the built-in 4 kt wind, a ground-roll model check reaches approximately 60 kt IAS in seven seconds. This is an internal tuning estimate, not a measured browser/physical-hardware benchmark.


## Flight handling update (v0.1.7)

This update focuses on control feel and a more coherent light-aircraft flight model:

- Gamepad axes use a configurable expo curve and dead zone for finer centre control.
- Flight inputs are filtered with time-based response so the same settings feel consistent across frame rates.
- Pitch, roll and yaw are commanded as damped angular rates rather than raw angular acceleration.
- Roll stability assist gently recentres the wings after the pilot releases the stick.
- Positive roll is now a right bank; coordinated yaw follows the bank direction, and rudder mappings use consistent left/right signs.
- Lift is applied perpendicular to the air-relative flow; induced drag, sideslip drag, ground effect and progressive stall behaviour are included.
- Engine power spools instead of jumping instantly to throttle, and the propeller animation follows engine power.
- HUD now shows load factor and sideslip. Settings expose control response, expo and wing-stability assist.
- Mouse drag now acts like a virtual spring-centred stick: hold left mouse and drag away from the starting point for proportional pitch/roll control, then release to neutral.

The simplified trainer model is intended for game feel and practice in this prototype, not real-world flight training.


## SKYBOUND v0.1.7 — Flight feel pass

The trainer now uses right-bank-positive roll with correctly coordinated right-turn yaw, left/right rudder signs are consistent (Q/L1 left, E/R1 right), and the mouse behaves as a spring-centred virtual stick while held. A sideslip damper reduces uncoordinated yaw. The HUD adds load factor and sideslip readouts.

The new Settings controls let you tune flight-control response, centre-stick expo, overall sensitivity, dead zone, and wing-level stability assist. The engine now spools up/down and the aerodynamic model includes projected lift direction, density variation with altitude, induced drag, progressive stall separation, sideslip drag and ground effect.


## User-supplied aircraft asset

`public/models/cessna_182_skylane.glb` is served by Next.js from the `public/` folder.

## Aircraft model attribution and license

The supplied GLB metadata identifies the model as **“Cessna 182 Skylane” by VTX**, sourced from [Sketchfab](https://sketchfab.com/3d-models/cessna-182-skylane-2dde31b1aa8f484f96bb7ee9d9c5ad26). Its embedded metadata lists **CC BY-NC-SA 4.0** ([license terms](https://creativecommons.org/licenses/by-nc-sa/4.0/)). This license is non-commercial and requires attribution and ShareAlike for adaptations. Check that the license fits the way you intend to distribute or use SKYBOUND.


## Sky HDRI attribution

The `public/skies/*.hdr` files are CC0 (public domain) HDRIs from Poly Haven: Kloofendal 48d Partly Cloudy (Pure Sky), Qwantani Noon (Pure Sky), Qwantani Late Afternoon (Pure Sky) and Belfast Sunset (Pure Sky).
