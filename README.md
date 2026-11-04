# SKYBOUND — Cessna 182 Skylane Flight Simulator

A browser flight simulator built with **Next.js** and **three.js**. Every visit generates a brand-new world — seeded terrain, climate, season, airfield site and clouds — lit by a real HDR sky.

**Play: [eeman1113.github.io/flydome](https://eeman1113.github.io/flydome/)** — on a laptop or desktop with Chrome or Edge. Phones and tablets are not supported.

## How to play: First Charter

Every world is uncharted wilderness, and you're its first survey pilot.

1. **Pick a charter** on the menu's charter board. Each one lists three real landmarks of this world (peaks, lakes, islands, forests, rivers, mountain passes), generated from the terrain itself.
2. **Fly to them.** The compass tape and minimap show `?` markers, and the charter card shows live distances.
3. **Survey each landmark** with a controlled pass inside its envelope: low over a lake or forest, close to a summit, or threading a pass. Hold it steady until the ring fills, and the landmark is inked onto your chart.
4. **Land** at any bush strip or the home field to file the charter. Landings are graded **S–D** on sink rate, centreline, alignment and bounces.
5. A crash keeps your discoveries but costs the charter's landing bonus, and you respawn at the last strip you landed on.

Your **pilot logbook** (rank, XP, discovery stamps, landing grades) is saved in the browser and carries across worlds. **Refresh for a brand-new world.** The URL always carries the seed, so you can share it, and **Resume last world** reopens the last world you flew. The **Daily Charter** gives every pilot the same world and charter each day, with a shareable result line. Press **M** for the full expedition chart, which can be saved as a PNG. **Free Flight** lets you explore and chart at will.

## Game modes

- **Charters** (First Charter): survey three named landmarks, then land at a strip.
- **Bush Pilot**: a job board of deliveries between bush strips and the home field. Cargo weight affects climb, medical runs are timed, and you're paid on landing, then pick the next job from wherever you are.
- **Explore**: chart the whole world at your own pace and share `World #48213: 7/12 discovered`.
- **Daily Charter**: one world for everyone each day, with a ghost of your best run.
- **Flight School**: ten lessons, from throttle to surveying a landmark and landing on a strip.

## Features

- **Landmarks from real terrain.** Peaks, lakes, crater lakes inside volcanic rims, islands, forests, rivers, passes, gorge runs, coastal waterfalls, sea stacks and arches, capes and lighthouses, glaciers, rock spires and old plane wrecks. Each is named, and the rare ones carry their own logbook stamp. A survey beacon (a cairn and pennant, or a buoy on water) marks every charted landmark.
- **Survey gameplay.** Seeded grass bush strips, each with a cabin, windsock and edge cones, sit on flat sites found by a rotated flatness search. A worker-side scanner names 7–8 landmarks per world, and charters, survey envelopes, landing grades, a fog-of-war chart and the logbook turn exploration into the goal.
- **A new world on every visit.** A random seed drives domain-warped continents and coastlines, ridged mountain ranges, rolling hills, lowland rivers, lakes, temperature/moisture climate and summer or autumn seasons. The airfield is placed automatically at the flattest suitable site and sits in a natural forest clearing. Use `?seed=12345` to revisit a world, or **NEW WORLD** in the menu.
- **Real HDR skies.** Seven CC0 HDRIs from [Poly Haven](https://polyhaven.com), from dawn through noon to dusk plus overcast; one is picked per world, or force one with `?sky=belfast`. Each HDR is analysed at load: the sun disc is located and integrated for the sun light's direction, colour and strength, sky irradiance sets exposure, and the sun is clamped out of the image-based lighting so it is not counted twice.
- **Streaming terrain.** Chunks are generated in Web Workers with distance LOD (64/32/16/8 segments) and crack-hiding skirts. Baked terrain self-shadowing, ambient occlusion and a splatting shader give grassland, farmland patchwork, forest, rock with strata, snow lines, beaches and wet shorelines.
- **Living scenery.** Instanced conifer and broadleaf forests with wind sway, PBR water reflecting the sky, sun-lit cumulus clouds with matching cloud shadows on the ground, and height fog with sun in-scattering.
- **Cinematic rendering.** HDR render target with MSAA, bloom, ACES tone mapping and grading, a sun-aligned aircraft shadow, and a separate near-plane pass for the cockpit so the world keeps depth precision to the horizon.
- **Weather & time of day.** Seven CC0 HDR skies (dawn to dusk, plus overcast). Each world has seeded wind and gusts that the flight model feels, rain with windshield droplets on some overcast days, and low cloud.
- **Two aircraft.** The Cessna 182 Skylane, and a Cessna 208 Caravan Amphibian that unlocks at Bush Pilot rank and lands on lakes as well as runways. With the amphibian, **water strip charters** appear on the board: survey the waters, then alight on the named lake to file. Six paint schemes unlock with rank. Hardcore mode adds fuel limits, refuelling at strips and +50% XP.
- **Crashes.** A fireball, a smoke plume drifting with the wind, torn-off parts and shards with physics, a crumpled airframe, a shock-distortion pulse and a crash camera. A water landing in the wrong aircraft ends in a splash and steam instead.
- **Approach guide & photo mode.** A glideslope and centreline cue when lined up with a strip. Photo mode (P) has an orbit camera, depth of field, a letterbox frame and PNG capture.
- **Automatic quality.** The GPU is detected to pick Low/Medium/High/Ultra, then a runtime governor watches frame rate and adjusts render scale, view distance (4–20 km) and effects. **Settings → Graphics quality** allows a manual override.
- **Flight model.** Lift perpendicular to the airflow, induced and sideslip drag, ground effect, progressive stall, engine spool-up, density falloff with altitude, rate-commanded controls with expo and an optional wing-levelling assist. Propeller thrust falls off with airspeed, and the numbers are tuned against the real C182: rotate at 58 kt, about 270 m to clear the runway, about 1,000 fpm climb at 85 kt, about 145 kt cruise at 75% power, and a stall near 55 kt. The nose can't over-rotate past the tail-strike attitude on the ground. It is a game flight model, not a certified training simulator.
- **Flight School.** **TEACH ME TO FLY** walks you through throttle, takeoff roll, rotation, climb, banking and levelling, advancing automatically as you complete each step, with instructions for whichever device you are using.
- **Procedural engine audio** for the six-cylinder engine, three-blade propeller and airflow, generated live with Web Audio.

## Controls

| Action | Keyboard + mouse | DualSense |
|---|---|---|
| Pitch up / down | W / S or ↑ / ↓ | Left stick |
| Roll left / right | A / D or ← / → | Left stick |
| Rudder left / right | Q / E | L1 / R1 |
| Throttle up / down | Shift / Ctrl | R2 / L2 |
| Camera (cockpit, chase, orbit, free look) | 1–4, C to cycle | ○, D-pad |
| Steer like a joystick | Hold left mouse + drag | — |
| Look around | Hold right mouse + drag | Right stick |
| HUD | H | □ |
| Expedition chart | M | Touchpad |
| Minimap zoom | N or scroll | Create |
| Photo mode | P | — |
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
  survey.js          FIRST CHARTER: landmarks, charters, survey envelopes, landing grades
  hud.js             minimal HUD: compass tape, minimap, charter card, banners, chart + PNG
  menu.js            charter board, pilot card, daily charter, logbook
  progress.js        pilot logbook persistence (localStorage)
  icons.js           shared vector icon set
  tutorial.js        Flight School
  ui.js              settings, modals, button wiring
public/models/       Cessna 182 GLB (meshopt + WebP, ~5 MB)
public/skies/        CC0 HDR skies
```

## Credits

- **Amphibian:** "CaravanA" (Cessna 208 Caravan Amphibian) by [helijah](https://sketchfab.com/helijah) on [Sketchfab](https://sketchfab.com/3d-models/caravanazip-125yIM3DWOvlzV70NvXjZElRdel), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Aircraft:** "Cessna 182 Skylane" by VTX on [Sketchfab](https://sketchfab.com/3d-models/cessna-182-skylane-2dde31b1aa8f484f96bb7ee9d9c5ad26), licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (non-commercial, attribution, share-alike). Compressed with glTF-Transform for the web.
- **Skies:** CC0 HDRIs from [Poly Haven](https://polyhaven.com): Kloofendal 48d Partly Cloudy, Kloofendal Overcast, Qwantani Dawn, Noon, Late Afternoon and Dusk 2, and Belfast Sunset (Pure Sky).
- Built with [three.js](https://threejs.org) and [Next.js](https://nextjs.org).
