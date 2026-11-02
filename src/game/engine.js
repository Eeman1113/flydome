// SKYBOUND · engine
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { $ } from './util.js';
import { AIRCRAFT_VISUAL_SCALE, FIXED_STEP, SKY, START_Z, WORLD_SEED, aircraft, cockpitEyeLocal, fx, glass, shared, sky, state, urlParams } from './config.js';
import { AIRPORT_H, terrain } from './world.js';
import { TIERS, applyTier, detectHardware, perf, perfTick, updateCameraFar, viewDistanceM } from './perf.js';
import { installAtmosphereShaderChunks, loadSky, makeSkyDome } from './sky.js';
import { createGeometries, createMaterials, mats } from './materials.js';
import { chunks, initWorkers, processChunkResults, updateChunks } from './chunks.js';
import { buildAirport, makeClouds, makeWater } from './scenery.js';
import { getControls } from './input.js';
import { ensureAircraftAudio, updateAircraftAudio } from './audio.js';
import { cameraName, setHud, setLoading, toast, updateDiagnostics, updateHud, updateWorldInfo } from './ui.js';
import { stepPhysics } from './physics.js';
import { updateCamera, updateMenuCamera } from './camera.js';
import { tutorialTick } from './tutorial.js';

export let scene,camera,renderer,clock,plane,planeVisual,terrainGroup,detailGroup,sunLight,hemiLight,worldTime=0;
export let composer=null,bloomPass=null,gradePass=null,skyMesh=null,waterMesh=null,cloudSystem=null;
export let aircraftGroundOffset=1.35;
export let physicsAccumulator=0,frameStartTime=0,hudTimer=0,diagnosticsTimer=0;
export let cockpitEyeSource='fallback';
export async function setupScene(){
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(66,innerWidth/innerHeight,1,20000);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false,depth:true,stencil:false,logarithmicDepthBuffer:false});
  renderer.setSize(innerWidth,innerHeight,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  $('sim').appendChild(renderer.domElement);
  const detected=detectHardware();
  perf.auto=state.quality==='Auto';
  perf.tier=TIERS[detected];perf.view=perf.tier.view;
  perf.dpr=Math.min(window.devicePixelRatio||1,perf.tier.dpr);renderer.setPixelRatio(perf.dpr);
  renderer.shadowMap.autoUpdate=false;camera.layers.enable(1);
  renderer.shadowMap.enabled=perf.tier.shadow>0;
  console.info('[SKYBOUND] GPU',perf.gpu,'→ tier',detected,'seed',WORLD_SEED);

  const aircraftPromise=makeAircraft();
  setLoading('LOADING HDR SKY · '+SKY.name.toUpperCase(),5);
  await loadSky(p=>setLoading('LOADING HDR SKY · '+Math.round(p*100)+'%',5+p*15));
  fx.visibility=(22000+((WORLD_SEED*7)%23)*1100)/SKY.haze;
  installAtmosphereShaderChunks();
  renderer.toneMappingExposure=sky.exposure;
  const pm=new THREE.PMREMGenerator(renderer);sky.env=pm.fromEquirectangular(sky.envSource||sky.texture).texture;pm.dispose();sky.envSource?.dispose();
  scene.environment=sky.env;
  scene.fog=new THREE.FogExp2(sky.horizon.clone(),viewDistanceM());
  skyMesh=makeSkyDome();scene.add(skyMesh);

  hemiLight=new THREE.HemisphereLight(sky.zenith.clone(),new THREE.Color(.18,.16,.12),.15*(sky.skyE||1));scene.add(hemiLight);
  sunLight=new THREE.DirectionalLight(sky.sunColor.clone(),sky.sunIntensity);
  sunLight.castShadow=perf.tier.shadow>0;sunLight.shadow.mapSize.set(perf.tier.shadow||1024,perf.tier.shadow||1024);
  const sc=sunLight.shadow.camera;sc.left=-38;sc.right=38;sc.top=38;sc.bottom=-38;sc.near=1;sc.far=900;sunLight.shadow.bias=-.0004;sunLight.shadow.normalBias=.04;
  sunLight.layers.enable(1);hemiLight.layers.enable(1);sunLight.shadow.camera.layers.enable(1);
  scene.add(sunLight);scene.add(sunLight.target);

  createMaterials();createGeometries();
  terrainGroup=new THREE.Group();detailGroup=new THREE.Group();scene.add(terrainGroup);scene.add(detailGroup);
  waterMesh=makeWater();scene.add(waterMesh);
  buildAirport();
  cloudSystem=makeClouds();scene.add(cloudSystem.mesh);cloudSystem.setDensity(perf.tier.clouds);
  setupPost();
  updateCameraFar();

  initWorkers();
  setLoading('LOADING CESSNA 182 SKYLANE MODEL',22);
  await aircraftPromise;
  aircraft.position.set(0,AIRPORT_H+.06+aircraftGroundOffset,START_Z);aircraft.altAGL=aircraftGroundOffset;syncPlaneTransform();
  updateChunks(true);
  // Wait for the near rings so the first view has no terrain holes.
  const t0=performance.now();
  await new Promise(resolve=>{
    const tick=()=>{
      processChunkResults(40);
      const near=[...chunks.values()].filter(c=>c.dist<=2),done=near.filter(c=>c.mesh).length;
      setLoading(`GENERATING WORLD #${WORLD_SEED} · ${done}/${near.length} CHUNKS`,55+45*done/Math.max(1,near.length));
      if((done>=near.length&&near.length)||performance.now()-t0>20000)resolve();else setTimeout(tick,16);
    };tick();
  });
  camera.layers.enable(1);renderer.compile(scene,camera);
  clock=new THREE.Clock();
  updateWorldInfo();
}
// Two-layer rendering: the world uses a 1 m near plane for depth precision out to
// the horizon; in the cockpit the aircraft is re-drawn after a depth clear with a 5 cm near plane.
export const WORLD_NEAR=1.0,COCKPIT_NEAR=.05;let cockpitPass=null;
export function isCockpitView(){return state.started&&state.camera===1;}
export function prepWorldPass(){camera.layers.set(0);if(!isCockpitView())camera.layers.enable(1);if(camera.near!==WORLD_NEAR){camera.near=WORLD_NEAR;camera.updateProjectionMatrix();}renderer.shadowMap.needsUpdate=true;}
export function prepCockpitPass(){camera.layers.set(1);camera.near=COCKPIT_NEAR;camera.updateProjectionMatrix();}
export class WorldPass extends RenderPass{render(...a){prepWorldPass();super.render(...a);}}
export class CockpitPass extends Pass{
  constructor(){super();this.needsSwap=false;}
  render(r,writeBuffer,readBuffer){prepCockpitPass();const ac=r.autoClear;r.autoClear=false;r.setRenderTarget(this.renderToScreen?null:readBuffer);r.clearDepth();r.render(scene,camera);r.autoClear=ac;}
}
export function renderFrame(dt){
  if(perf.tier.post&&composer){cockpitPass.enabled=isCockpitView();composer.render(dt);return;}
  prepWorldPass();renderer.setRenderTarget(null);renderer.render(scene,camera);
  if(isCockpitView()){prepCockpitPass();renderer.autoClear=false;renderer.clearDepth();renderer.render(scene,camera);renderer.autoClear=true;}
}
export function setupPost(){
  const rt=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,samples:4});
  composer=new EffectComposer(renderer,rt);
  composer.addPass(new WorldPass(scene,camera));
  cockpitPass=new CockpitPass();composer.addPass(cockpitPass);
  bloomPass=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.14,.5,3.0/Math.max(1e-3,sky.exposure));
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  gradePass=new ShaderPass({
    uniforms:{tDiffuse:{value:null},uTime:{value:0},uVig:{value:.55}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; varying vec2 vUv;
      void main(){ vec4 c=texture2D(tDiffuse,vUv); vec2 q=vUv-.5; c.rgb*=1.-dot(q,q)*uVig;
        c.rgb=mix(c.rgb,c.rgb*c.rgb*(3.-2.*c.rgb),.18);
        float l=dot(c.rgb,vec3(.299,.587,.114)); c.rgb=mix(vec3(l),c.rgb,1.06);
        float n=fract(sin(dot(vUv*vec2(12.9898,78.233)+fract(uTime),vec2(1.,1.)))*43758.5453); c.rgb+=(n-.5)*.01;
        gl_FragColor=c; }`
  });
  composer.addPass(gradePass);
  composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(innerWidth,innerHeight);
}
export async function makeAircraft(){
  // The aircraft visual is the supplied Cessna 182 Skylane GLB. No procedural
  // aircraft geometry is generated here; physics remain independent of the mesh.
  plane=new THREE.Group();planeVisual=new THREE.Group();plane.add(planeVisual);
  const modelUrl='/models/cessna_182_skylane.glb';
  const loader=new GLTFLoader();
  let gltf;
  try{
    gltf=await loader.loadAsync(modelUrl,event=>{
      if(event.lengthComputable&&event.total>0){const percent=Math.round(event.loaded/event.total*100);if(scene&&!scene.children.includes(plane))setLoading(`LOADING CESSNA 182 SKYLANE MODEL · ${percent}%`,22+percent*.33);}
    });
  }catch(error){
    throw new Error(`Unable to load cessna_182_skylane.glb. Keep the supplied model file in the same folder as index.html and launch SKYBOUND with launch-macos.command. Details: ${error.message}`);
  }
  const model=gltf.scene;model.name='User supplied Cessna 182 Skylane';model.scale.setScalar(AIRCRAFT_VISUAL_SCALE);
  model.traverse(object=>{
    object.layers.set(1); // aircraft layer: drawn in its own near-plane pass in the cockpit
    if(object.isMesh||object.isSkinnedMesh){
      object.castShadow=true;object.receiveShadow=true;object.frustumCulled=true;
      if(object.material){
        const materials=Array.isArray(object.material)?object.material:[object.material];
        for(const material of materials){
          if(material.map)material.map.colorSpace=THREE.SRGBColorSpace;
          if(material.map)material.map.anisotropy=8;
          if(material.normalMap)material.normalMap.colorSpace=THREE.NoColorSpace;
          if(material.roughnessMap)material.roughnessMap.colorSpace=THREE.NoColorSpace;
          if(material.metalnessMap)material.metalnessMap.colorSpace=THREE.NoColorSpace;
          material.envMapIntensity=1.0;
          // The supplied model's windshield is tinted almost opaque green; keep the
          // glass geometry but make it clear with a restrained reflective coat.
          const materialName=String(material.name||'').toLowerCase();
          const isWindshield=materialName.includes('windshield')||materialName.includes('windscreen');
          const isGlass=isWindshield||materialName.includes('glass');
          if(isGlass){
            object.castShadow=false;
            material.color?.set(0xffffff);material.map=null;material.transparent=true;material.opacity=isWindshield?.12:.1;material.depthWrite=false;
            material.metalness=0;material.roughness=.05;material.side=THREE.DoubleSide;material.envMapIntensity=1.6;
            if('clearcoat' in material)material.clearcoat=.4;if('clearcoatRoughness' in material)material.clearcoatRoughness=.05;if('specularIntensity' in material)material.specularIntensity=.5;
            material.needsUpdate=true;
          }
        }
      }
    }
  });
  planeVisual.add(model);planeVisual.updateMatrixWorld(true);
  // Only the large exterior parts need to cast the aircraft's ground shadow.
  model.traverse(o=>{if(o.isMesh&&o.castShadow){const s=new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());if(Math.max(s.x,s.y,s.z)<1.6)o.castShadow=false;}});
  const aircraftBounds=new THREE.Box3().setFromObject(planeVisual);
  aircraftGroundOffset=Math.max(.8,-aircraftBounds.min.y+.035);
  const prop=model.getObjectByName('prop_1_33'),propSlow=model.getObjectByName('prop_1_slow_31'),propFast=model.getObjectByName('prop_1_fast_32');
  plane.userData.prop=prop||null;plane.userData.propSlow=propSlow||null;plane.userData.propFast=propFast||null;
  if(propSlow)propSlow.visible=true;if(propFast)propFast.visible=false;
  plane.userData.visualModel=model;
  scene.add(plane);
  syncPlaneTransform();plane.updateMatrixWorld(true);model.updateMatrixWorld(true);
  const pilotSeat=model.getObjectByName('seat_dside_f_27')||model.getObjectByName('seat_dside_f');
  if(pilotSeat){
    const seatWorld=pilotSeat.getWorldPosition(new THREE.Vector3());plane.worldToLocal(seatWorld);cockpitEyeLocal.copy(seatWorld);
    cockpitEyeLocal.y+=.64;cockpitEyeLocal.z+=.38;cockpitEyeSource='GLB pilot seat';
  }
  plane.userData.cockpitEye=cockpitEyeLocal.clone();
}
export function syncPlaneTransform(){plane.position.copy(aircraft.position);plane.rotation.order='YXZ';plane.rotation.set(aircraft.pitch,aircraft.yaw,-aircraft.roll);}
export const _sunTmp=new THREE.Vector3();
export function updateWorldFx(dt){
  worldTime+=dt;shared.time.value=worldTime;
  if(skyMesh)skyMesh.position.copy(camera.position);
  if(waterMesh){waterMesh.position.x=camera.position.x;waterMesh.position.z=camera.position.z;}
  if(cloudSystem)cloudSystem.update(dt,camera);
  // Tight shadow frustum that follows the aircraft, snapped to texels to avoid shimmer.
  if(sunLight.castShadow){
    const size=76/sunLight.shadow.mapSize.x;
    _sunTmp.copy(aircraft.position);
    _sunTmp.x=Math.round(_sunTmp.x/size)*size;_sunTmp.z=Math.round(_sunTmp.z/size)*size;
    sunLight.target.position.copy(_sunTmp);sunLight.position.copy(_sunTmp).addScaledVector(sky.sunDir,400);
    sunLight.target.updateMatrixWorld();
  }else{sunLight.position.copy(aircraft.position).addScaledVector(sky.sunDir,400);sunLight.target.position.copy(aircraft.position);sunLight.target.updateMatrixWorld();}
  if(gradePass)gradePass.uniforms.uTime.value=worldTime;
}
export function frame(){requestAnimationFrame(frame);frameStartTime=performance.now();const frameDt=Math.min(clock.getDelta(),.05);state.fpsAccum+=frameDt;state.fpsCount++;if(state.fpsAccum>=1){state.fps=state.fpsCount/state.fpsAccum;state.fpsAccum=0;state.fpsCount=0;}
  updateChunks();processChunkResults(4);diagnosticsTimer+=frameDt;if(diagnosticsTimer>.25){updateDiagnostics();diagnosticsTimer=0;}
  if(state.started&&!state.paused){const ctrl=getControls(frameDt);physicsAccumulator=Math.min(physicsAccumulator+frameDt,.12);let steps=0;while(physicsAccumulator>=FIXED_STEP&&steps<5){stepPhysics(FIXED_STEP,ctrl);updateCamera(FIXED_STEP,ctrl);physicsAccumulator-=FIXED_STEP;steps++;}if(steps===5)physicsAccumulator=Math.min(physicsAccumulator,FIXED_STEP);hudTimer+=frameDt;if(hudTimer>.08){updateHud(frameDt);tutorialTick();hudTimer=0;}}
  else if(!state.started)updateMenuCamera(frameDt);
  updateWorldFx(frameDt);
  perfTick(frameDt);
  updateAircraftAudio(frameDt);
  renderFrame(frameDt);
}
export function startFlight(){camera.clearViewOffset();ensureAircraftAudio();state.started=true;state.paused=false;state.crashed=false;physicsAccumulator=0;$('mainMenu').style.display='none';$('pauseMenu').style.display='none';$('flightTag').textContent=`FREE FLIGHT · WORLD #${WORLD_SEED}`;state.camera=2;setHud();cameraName();toast('Flight controls active. Advance throttle and rotate to take off.');}
export function restart(){state.crashed=false;state.paused=false;physicsAccumulator=0;$('pauseMenu').querySelector('h2').textContent='Take a breath.';$('pauseMenu').querySelector('.intro').textContent='Your aircraft is holding its current state. Ready when you are.';state.throttle=0;aircraft.position.set(0,AIRPORT_H+.06+aircraftGroundOffset,START_Z);aircraft.velocity.set(0,0,0);aircraft.pitch=aircraft.roll=aircraft.yaw=aircraft.pitchRate=aircraft.rollRate=aircraft.yawRate=0;aircraft.controlPitch=aircraft.controlRoll=aircraft.controlYaw=0;aircraft.enginePower=0;aircraft.airspeed=0;aircraft.stall=false;state.flightTime=0;state.gear=true;$('pauseMenu').style.display='none';state.started=true;setHud();syncPlaneTransform();updateChunks(true);toast('Aircraft reset on runway 36.');}
window.addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight,false);if(composer){composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(innerWidth,innerHeight);}});
export let booted=false;
export async function startGame(){
  if(booted)return;booted=true;
  try{
    await setupScene();
    if(urlParams.has('debug'))window.SKYB={THREE,scene,camera,renderer,perf,terrain,chunks,sky,aircraft,state,mats,applyTier,fx};
    $('loading').classList.add('hidden');
    setTimeout(()=>{const l=$('loading');if(l)l.style.display='none';},500);
    frame();
  }catch(err){
    console.error(err);
    $('loading').innerHTML=`<div style="max-width:600px;padding:24px;text-align:center"><h2>Unable to start SKYBOUND</h2><p style="color:#9ab0c2;font-size:13px;line-height:1.6">${err.message}</p><p style="color:#70879b;font-size:11px">Check your connection and that public/models/cessna_182_skylane.glb and public/skies are present.</p></div>`;
  }
}
