# SKYBOUND — Cessna 182 Skylane Flight Simulator

A browser-based flight simulator with a procedurally generated world. The aircraft is the user-supplied `cessna_182_skylane.glb` model; SKYBOUND does not generate a replacement aircraft mesh. Three.js and GLTFLoader are loaded from jsDelivr, so an internet connection is required.

## Aircraft model

The project loads `cessna_182_skylane.glb` from the same folder as `index.html`. Keep the GLB beside the HTML file. The model is loaded with Three.js GLTFLoader, scaled to approximately Cessna 182 dimensions, and its wheel clearance is measured from the imported mesh bounds for runway contact. The model includes its own exterior and interior geometry and a propeller assembly; the simulator animates the supplied propeller node rather than drawing a replacement aircraft. The Cessna 182 has fixed landing gear, which is reflected in the HUD and Flight School.

## Recommended launch

For the most reliable Gamepad and WebHID permissions, serve the folder from `localhost` instead of opening the file directly. On macOS, double-click `launch-macos.command`. It starts a local server and opens the simulator in your browser. Keep its Terminal window open while playing.

Manual alternative:

```bash
cd skybound-flight-sim
python3 -m http.server 8000
```

Then open http://localhost:8000 in desktop Chrome or Edge.

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
- The world, runway, basic settlements, forests, clouds and aircraft are procedural. The visuals are intentionally lightweight for laptop-class hardware.
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

`cessna_182_skylane.glb` is bundled in this project and must remain in the same directory as `index.html`. The HTML file by itself is not a complete distributable because the 3D aircraft model is an external sidecar asset. Use the complete ZIP or keep the GLB next to the HTML file.

## Aircraft model attribution and license

The supplied GLB metadata identifies the model as **“Cessna 182 Skylane” by VTX**, sourced from [Sketchfab](https://sketchfab.com/3d-models/cessna-182-skylane-2dde31b1aa8f484f96bb7ee9d9c5ad26). Its embedded metadata lists **CC BY-NC-SA 4.0** ([license terms](https://creativecommons.org/licenses/by-nc-sa/4.0/)). This license is non-commercial and requires attribution and ShareAlike for adaptations. Check that the license fits the way you intend to distribute or use SKYBOUND.
