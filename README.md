# SKYBOUND — Cessna 182 Skylane Flight Simulator

A browser flight simulator built with **Next.js** and **three.js**. Every visit generates a brand-new world — seeded terrain, climate, season, airfield site and clouds — lit by a real HDR sky.

**Play: [eeman1113.github.io/flydome](https://eeman1113.github.io/flydome/)** — on a laptop or desktop with Chrome or Edge. Phones and tablets are not supported.

## Features

- **A new world on every visit.** A random seed drives domain-warped continents and coastlines, ridged mountain ranges, rolling hills, lowland rivers, lakes, temperature/moisture climate and summer or autumn seasons. The airfield is placed automatically at the flattest suitable site and sits in a natural forest clearing. Use `?seed=12345` to revisit a world, or **NEW WORLD** in the menu.
- **Real HDR skies.** Four CC0 pure-sky HDRIs from [Poly Haven](https://polyhaven.com) (partly cloudy midday, clear noon, late afternoon, golden sunset); one is picked per world, or force one with `?sky=belfast`. Each HDR is analysed at load: the sun disc is located and integrated for the sun light's direction, colour and strength, sky irradiance sets exposure, and the sun is clamped out of the image-based lighting so it is not counted twice.
- **Streaming terrain.** Chunks are generated in Web Workers with distance LOD (64/32/16/8 segments) and crack-hiding skirts. Baked terrain self-shadowing, ambient occlusion and a splatting shader give grassland, farmland patchwork, forest, rock with strata, snow lines, beaches and wet shorelines.
- **Living scenery.** Instanced conifer and broadleaf forests with wind sway, PBR water reflecting the sky, sun-lit cumulus clouds with matching cloud shadows on the ground, and height fog with sun in-scattering.
- **Cinematic rendering.** HDR render target with MSAA, bloom, ACES tone mapping and grading, a sun-aligned aircraft shadow, and a separate near-plane pass for the cockpit so the world keeps depth precision to the horizon.
- **Automatic quality.** The GPU is detected to pick Low/Medium/High/Ultra, then a runtime governor watches frame rate and adjusts render scale, view distance (4–20 km) and effects. **Settings → Graphics quality** allows a manual override.
- **Flight model.** Lift perpendicular to the airflow, induced and sideslip drag, ground effect, progressive stall, engine spool-up, density falloff with altitude, rate-commanded controls with expo and an optional wing-levelling assist. It is a game flight model, not a certified training simulator.
- **Flight School.** **TEACH ME TO FLY** walks you through throttle, takeoff roll, rotation, climb, banking and levelling, advancing automatically as you complete each step, with instructions for whichever device you are using.
- **Procedural engine audio** for the six-cylinder engine, three-blade propeller and airflow, generated live with Web Audio.

## Controls

| Action | Keyboard + mouse | DualSense |
|---|---|---|
| Pitch down / up | W / S or ↑ / ↓ | Left stick |
| Roll left / right | A / D or ← / → | Left stick |
| Rudder left / right | Q / E | L1 / R1 |
| Throttle up / down | Shift / Ctrl | R2 / L2 |
| Camera (cockpit, chase, orbit, free look) | 1–4, C to cycle | ○, D-pad |
| Steer like a joystick | Hold left mouse + drag | — |
| Look around | Hold right mouse + drag | Right stick |
| HUD | H | □ |
| Pause | Esc / Space | OPTIONS |

**Taking off:** hold Shift to full throttle, wait for about 58 kt, then gently pull back with W.

## DualSense controller

Pair the controller over Bluetooth or USB, click the page and press a button so the browser detects it. For gyro yaw, open **Settings → Pair DualSense Gyro**, pick the controller, hold it still and choose **Calibrate Neutral**. The gyro uses WebHID, which needs desktop Chrome or Edge.

## Running locally

Requires Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build: `npm run build` (a static export in `out/`, built with webpack). On macOS you can double-click `launch-macos.command`, which installs dependencies on first run and starts the dev server.

URL options: `?seed=12345` (world), `?sky=belfast` (sky), `?debug` (exposes `window.SKYB` for inspection).

Every push to `main` is built and deployed to GitHub Pages by `.github/workflows/pages.yml`.

## Project layout

```
app/                 Next.js App Router: page, simulator UI, handheld notice, styles
src/game/
  engine.js          renderer, scene setup, post-processing, aircraft, frame loop
  terrainLib.js      seeded terrain/climate generator + chunk mesh builder
  terrain.worker.js  Web Worker that builds terrain chunks off the main thread
  chunks.js          chunk streaming, LOD, forests, physics ground queries
  sky.js             HDR loading, sun/exposure calibration, atmosphere, sky dome
  materials.js       terrain, water and tree shaders and geometry
  scenery.js         water plane, clouds, airfield
  perf.js            GPU detection and the runtime quality governor
  physics.js         flight model
  camera.js          camera rigs
  input.js           keyboard, mouse, gamepad, WebHID gyro
  audio.js           procedural engine audio
  tutorial.js        Flight School
  ui.js              HUD, menus, settings
public/models/       Cessna 182 GLB (meshopt + WebP, ~5 MB)
public/skies/        CC0 HDR skies
```

## Credits

- **Aircraft:** "Cessna 182 Skylane" by VTX on [Sketchfab](https://sketchfab.com/3d-models/cessna-182-skylane-2dde31b1aa8f484f96bb7ee9d9c5ad26), licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (non-commercial, attribution, share-alike). Compressed with glTF-Transform for the web.
- **Skies:** CC0 HDRIs from [Poly Haven](https://polyhaven.com): Kloofendal 48d Partly Cloudy, Qwantani Noon, Qwantani Late Afternoon and Belfast Sunset (Pure Sky).
- Built with [three.js](https://threejs.org) and [Next.js](https://nextjs.org).
