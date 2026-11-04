import { updateCrash, clearCrash, crashActive } from './crash.js';
import { setGhost, updateGhost } from './ghost.js';
import { initialLoadout } from './menu.js';
import { updatePhotoCamera, afterRender, bindPhotoUi } from './photo.js';
import { buildLandmarkProps, addBeacon, updateBeacons, updateLandmarkFx } from './scenery.js';
import { initWeather, updateWeather } from './weather.js';
import { crashAircraft } from './physics.js';
// SKYBOUND · engine
import * as THREE from 'three';
import { AIRCRAFT, aircraftState, LIVERIES } from './config.js';
import { initSurvey, beginMission, surveyTick, respawnPoint, mission } from './survey.js';
import { initHud, hudFrame, hudEvents, hudJobBoard } from './hud.js';
import { renderMenu } from './menu.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { $ } from './util.js';
import { BASE_PATH, AIRCRAFT_VISUAL_SCALE, FIXED_STEP, SKY, START_Z, WORLD_SEED, aircraft, cockpitEyeLocal, fx, glass, shared, sky, state, urlParams } from './config.js';
import { AIRPORT_H, terrain } from './world.js';
import { TIERS, applyTier, detectHardware, perf, perfTick, updateCameraFar, viewDistanceM } from './perf.js';
import { installAtmosphereShaderChunks, loadSky, makeSkyDome } from './sky.js';
import { createGeometries, createMaterials, mats } from './materials.js';
import { chunks, initWorkers, processChunkResults, updateChunks, groundLevelAt } from './chunks.js';
import { buildAirport, buildStrips, makeClouds, makeWater } from './scenery.js';
import { getControls } from './input.js';
import { ensureAircraftAudio, updateAircraftAudio } from './audio.js';
import { cameraName, setHud, setLoading, toast, updateDiagnostics, updateHud, updateWorldInfo } from './ui.js';
import { stepPhysics } from './physics.js';
import { updateCamera, updateMenuCamera } from './camera.js';
import { tutorialTick } from './tutorial.js';

export let scene,camera,renderer,clock,plane,planeVisual,terrainGroup,detailGroup,sunLight,hemiLight,worldTime=0;
export let bokehPass=null,composer=null,bloomPass=null,gradePass=null,skyMesh=null,waterMesh=null,cloudSystem=null;
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

  const aircraftPromise=makeAircraft(initialLoadout());
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
  buildAirport();buildStrips();
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
  setLoading('SURVEYING LANDMARKS',98);
  await initSurvey();buildLandmarkProps(mission.landmarks);for(const id of mission.discovered){const l=mission.landmarks.find(x=>x.id===id);if(l)addBeacon(l);}
  hudEvents.beacon=addBeacon;hudEvents.crash=crashAircraft;hudEvents.ghost=setGhost;hudEvents.jobBoard=hudJobBoard;hudEvents.setHud=setHud;hudEvents.fuelOut=()=>toast('Fuel exhausted — glide to a landing.');initWeather();bindPhotoUi();
  initHud();renderMenu();hudEvents.nextCharter=()=>{const i=(mission.charters.indexOf(mission.charter)+1)%Math.max(1,mission.charters.length);beginMission('charter',i);};
  camera.layers.enable(1);renderer.compile(scene,camera);
  clock=new THREE.Clock();
  updateWorldInfo();
}
// Two-layer rendering: the world uses a 1 m near plane for depth precision out to
// the horizon; in the cockpit the aircraft is re-drawn after a depth clear with a 5 cm near plane.
export const WORLD_NEAR=1.0,COCKPIT_NEAR=.05;let cockpitPass=null;
export function isCockpitView(){return state.started&&state.camera===1&&!state.crashed&&!state.photo;}
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
  bokehPass=new BokehPass(scene,camera,{focus:25,aperture:.0004,maxblur:.008});bokehPass.enabled=false;composer.addPass(bokehPass);
  composer.addPass(new OutputPass());
  gradePass=new ShaderPass({
    uniforms:{tDiffuse:{value:null},uTime:{value:0},uVig:{value:.55},uShock:{value:0}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uShock; varying vec2 vUv;
      void main(){ vec2 q=vUv-.5; float r2=dot(q,q);
        // crash shock: barrel warp, ripple and chromatic split, decaying over ~0.6 s
        vec2 uv=vUv+q*r2*uShock*.45+vec2(sin(vUv.y*38.+uTime*42.),cos(vUv.x*31.+uTime*37.))*uShock*.006;
        float ca=uShock*.018; vec4 c=vec4(texture2D(tDiffuse,uv+q*ca).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-q*ca).b,1.);
        c.rgb+=vec3(1.,.55,.25)*uShock*uShock*.35; c.rgb*=1.-dot(q,q)*uVig;
        c.rgb=mix(c.rgb,c.rgb*c.rgb*(3.-2.*c.rgb),.18);
        float l=dot(c.rgb,vec3(.299,.587,.114)); c.rgb=mix(vec3(l),c.rgb,1.06);
        float n=fract(sin(dot(vUv*vec2(12.9898,78.233)+fract(uTime),vec2(1.,1.)))*43758.5453); c.rgb+=(n-.5)*.01;
        gl_FragColor=c; }`
  });
  composer.addPass(gradePass);
  composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(innerWidth,innerHeight);
}
// Airframes. The Skylane is the default; the Cessna 195 on floats unlocks at Bush Pilot rank
// and can land on water. Models are meshopt + WebP compressed.
const gltfLoader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
export async function makeAircraft(variantId=aircraftState.variant){
  const V=AIRCRAFT[variantId]||AIRCRAFT.skylane;
  const group=new THREE.Group(),visual=new THREE.Group();group.add(visual);
  let gltf;
  try{
    gltf=await gltfLoader.loadAsync(`${BASE_PATH}/models/${V.file}`,event=>{
      if(event.lengthComputable&&event.total>0&&!state.started){const percent=Math.round(event.loaded/event.total*100);if(!plane)setLoading(`LOADING ${V.name.toUpperCase()} · ${percent}%`,22+percent*.33);}
    });
  }catch(error){throw new Error(`Unable to load ${V.file}. Details: ${error.message}`);}
  const model=gltf.scene;model.name=V.name;model.scale.setScalar(V.scale);
  if(V.yaw)model.rotation.y=V.yaw;
  let propPivot=null,eye=null;
  if(V.objFrame){
    // The C195 was exported with the propeller merged into the body: split the triangles in
    // front of the cowling into their own mesh on a hub pivot so it can spin.
    // three.js strips dots from node names, so match the OBJ-frame node by prefix.
    // OBJ-converted Sketchfab export: find the node that carries the OBJ frame (x nose-aft, z up).
    let frame=model;model.traverse(o=>{if(frame===model&&o.isMesh&&o.parent&&o.parent!==model)frame=o.parent;});
    model.updateMatrixWorld(true);
    propPivot=splitPropeller(frame,V.propCut,V.propZMin);
    eye={frame,p:new THREE.Vector3(...V.eye)}; // left front seat, head height (OBJ frame)
  }
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
          // Clear, lightly reflective glazing on both airframes.
          const materialName=String(material.name||'').toLowerCase();
          const isWindshield=materialName.includes('windshield')||materialName.includes('windscreen');
          const isGlass=isWindshield||materialName.includes('glass')||materialName.startsWith('transparent');
          if(isGlass){
            object.castShadow=false;
            if(materialName==='transparentred'||materialName==='transparentgreen'){material.transparent=true;material.opacity=.85;material.emissive?.set(materialName.endsWith('red')?0xff2a1a:0x2aff6a);material.emissiveIntensity=2;continue;}
            material.color?.set(0xffffff);material.map=null;material.transparent=true;material.opacity=isWindshield?.12:.1;material.depthWrite=false;
            material.metalness=0;material.roughness=.05;material.side=THREE.DoubleSide;material.envMapIntensity=1.6;
            if('clearcoat' in material)material.clearcoat=.4;if('clearcoatRoughness' in material)material.clearcoatRoughness=.05;if('specularIntensity' in material)material.specularIntensity=.5;
            material.needsUpdate=true;
          }
        }
      }
    }
  });
  visual.add(model);visual.updateMatrixWorld(true);
  // Only the large exterior parts need to cast the aircraft's ground shadow.
  model.traverse(o=>{if(o.isMesh&&o.castShadow){const s=new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());if(Math.max(s.x,s.y,s.z)<1.6)o.castShadow=false;}});
  const bounds=new THREE.Box3().setFromObject(visual);
  aircraftGroundOffset=Math.max(.8,-bounds.min.y+.035);
  const prop=model.getObjectByName('prop_1_33'),propSlow=model.getObjectByName('prop_1_slow_31'),propFast=model.getObjectByName('prop_1_fast_32');
  group.userData.prop=prop||propPivot||null;group.userData.propAxis=propPivot?'x':'y';group.userData.propSlow=propSlow||propPivot?.userData.blades||null;group.userData.propFast=propFast||propPivot?.userData.disc||null;
  if(propSlow)propSlow.visible=true;if(propFast)propFast.visible=false;
  group.userData.visualModel=model;group.userData.variant=variantId;
  // swap in
  if(plane){scene.remove(plane);plane.traverse(o=>{if(o.isMesh){o.geometry.dispose();}});}
  plane=group;planeVisual=visual;aircraftState.variant=variantId;
  scene.add(plane);
  syncPlaneTransform();plane.updateMatrixWorld(true);model.updateMatrixWorld(true);
  const pilotSeat=model.getObjectByName('seat_dside_f_27')||model.getObjectByName('seat_dside_f');
  if(pilotSeat){
    const seatWorld=pilotSeat.getWorldPosition(new THREE.Vector3());plane.worldToLocal(seatWorld);cockpitEyeLocal.copy(seatWorld);
    cockpitEyeLocal.y+=.64;cockpitEyeLocal.z+=.38;cockpitEyeSource='GLB pilot seat';
  }else if(eye){plane.updateMatrixWorld(true);cockpitEyeLocal.copy(plane.worldToLocal(eye.frame.localToWorld(eye.p.clone())));cockpitEyeSource='C195 seat';}
  plane.userData.cockpitEye=cockpitEyeLocal.clone();
  applyLivery();
}
// Move every triangle whose vertices all lie ahead of `cutX` (in the model's OBJ frame) into a
// separate mesh parented to a pivot at the propeller hub.
function splitPropeller(frame,cutX,zMin=-1e9){
  const tris=[],src=[];const P=new THREE.Vector3();
  frame.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(frame.matrixWorld).invert();
  frame.traverse(m=>{
    if(!m.isMesh)return;const g=m.geometry,pos=g.attributes.position;
    const toFrame=new THREE.Matrix4().multiplyMatrices(inv,m.matrixWorld);
    const index=g.index?g.index.array:[...Array(pos.count).keys()];
    const keep=[],take=[];
    for(let i=0;i<index.length;i+=3){
      let all=true;for(let k=0;k<3;k++){P.fromBufferAttribute(pos,index[i+k]).applyMatrix4(toFrame);if(P.x>cutX||P.z<zMin){all=false;break;}}
      (all?take:keep).push(index[i],index[i+1],index[i+2]);
    }
    if(!take.length)return;
    g.setIndex(keep);
    src.push({m,take,toFrame});
  });
  if(!src.length)return null;
  // hub = centroid of the propeller vertices
  const hub=new THREE.Vector3();let n=0;
  for(const s of src){const pos=s.m.geometry.attributes.position;for(const i of s.take){P.fromBufferAttribute(pos,i).applyMatrix4(s.toFrame);hub.add(P);n++;}}
  hub.divideScalar(n);
  const pivot=new THREE.Group();pivot.position.copy(hub);frame.add(pivot);
  const blades=new THREE.Group();pivot.add(blades);pivot.userData.blades=blades;let rad=0;
  for(const s of src){
    const g=s.m.geometry,pos=g.attributes.position,nor=g.attributes.normal,uv=g.attributes.uv;
    const P2=new Float32Array(s.take.length*3),N2=nor?new Float32Array(s.take.length*3):null,U2=uv?new Float32Array(s.take.length*2):null;
    const nm=new THREE.Matrix3().getNormalMatrix(s.toFrame),Nv=new THREE.Vector3();
    s.take.forEach((vi,k)=>{P.fromBufferAttribute(pos,vi).applyMatrix4(s.toFrame).sub(hub);P2.set([P.x,P.y,P.z],k*3);if(N2){Nv.fromBufferAttribute(nor,vi).applyMatrix3(nm).normalize();N2.set([Nv.x,Nv.y,Nv.z],k*3);}if(U2)U2.set([uv.getX(vi),uv.getY(vi)],k*2);});
    const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(P2,3));if(N2)pg.setAttribute('normal',new THREE.BufferAttribute(N2,3));if(U2)pg.setAttribute('uv',new THREE.BufferAttribute(U2,2));
    for(let k=0;k<P2.length;k+=3)rad=Math.max(rad,Math.hypot(P2[k+1],P2[k+2]));
    blades.add(new THREE.Mesh(pg,s.m.material));
  }
  // motion-blur disc shown at high RPM (soft radial falloff, mostly transparent)
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),gr=g.createRadialGradient(64,64,6,64,64,63);
  gr.addColorStop(0,'rgba(40,40,42,.0)');gr.addColorStop(.18,'rgba(40,40,42,.55)');gr.addColorStop(.75,'rgba(55,55,58,.28)');gr.addColorStop(.93,'rgba(230,200,60,.35)');gr.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=gr;g.fillRect(0,0,128,128);
  const disc=new THREE.Mesh(new THREE.CircleGeometry(rad*1.02,48).rotateY(Math.PI/2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  disc.visible=false;pivot.add(disc);pivot.userData.disc=disc;
  return pivot;
}
// Paint schemes: tint the large exterior parts (interiors and glass keep their colours).
export function applyLivery(id=aircraftState.livery){
  aircraftState.livery=id;if(!plane)return;const L=LIVERIES.find(l=>l.id===id)||LIVERIES[0];
  plane.userData.visualModel.traverse(o=>{
    if(!o.isMesh||!o.material)return;
    const s=new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());if(Math.max(s.x,s.y,s.z)<2.4)return;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    for(const m of mats){if(m.transparent)continue;if(!m.userData.baseColor)m.userData.baseColor=m.color.clone();m.color.copy(m.userData.baseColor).multiply(new THREE.Color(L.tint));}
  });
}
export function syncPlaneTransform(){plane.position.copy(aircraft.position);plane.rotation.order='YXZ';plane.rotation.set(aircraft.pitch,aircraft.yaw,-aircraft.roll);}
export const _sunTmp=new THREE.Vector3();
export function updateWorldFx(dt){
  worldTime+=dt;shared.time.value=worldTime;
  if(skyMesh)skyMesh.position.copy(camera.position);
  if(waterMesh){waterMesh.position.x=camera.position.x;waterMesh.position.z=camera.position.z;}
  if(cloudSystem)cloudSystem.update(dt,camera);
  // Tight shadow frustum that follows the aircraft, snapped to texels to avoid shimmer.
  const castNow=aircraft.altAGL<70;if(plane&&plane.userData.castNow!==castNow){plane.userData.castNow=castNow;plane.traverse(o=>{if(o.isMesh){if(o.userData.cast==null)o.userData.cast=o.castShadow;o.castShadow=castNow&&o.userData.cast;}});}
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
  if(state.started&&!state.paused){const ctrl=getControls(frameDt);/* Equal sub-steps (each <= 1/60 s) that exactly cover the frame: no leftover accumulator, so motion
    advances evenly every frame instead of alternating 1 and 2 steps (visible judder at 30-50 fps). */
    const steps=Math.max(1,Math.ceil(frameDt/FIXED_STEP-1e-6)),h=frameDt/steps;for(let i=0;i<steps;i++){stepPhysics(h,ctrl);updateCamera(h,ctrl);}surveyTick(frameDt);hudTimer+=frameDt;if(hudTimer>.08){updateHud(frameDt);tutorialTick();hudTimer=0;}}
  else if(!state.started)updateMenuCamera(frameDt);
  if(state.photo)updatePhotoCamera(frameDt);
  updateWorldFx(frameDt);
  updateWeather(frameDt);updateBeacons(worldTime);updateLandmarkFx(worldTime);updateGhost();updateCrash(frameDt);
  hudFrame();
  perfTick(frameDt);
  updateAircraftAudio(frameDt);
  renderFrame(frameDt);
  afterRender();
}
export function startFlight(mode='free',charterIndex=0){camera.clearViewOffset();ensureAircraftAudio();state.started=true;state.paused=false;state.crashed=false;physicsAccumulator=0;$('mainMenu').style.display='none';$('pauseMenu').style.display='none';beginMission(mode,charterIndex);$('flightTag').textContent=mode==='cargo'?`BUSH PILOT · WORLD #${WORLD_SEED}`:mission.charter?`${mode==='daily'?'DAILY CHARTER':'CHARTER'} · WORLD #${WORLD_SEED}`:`EXPLORER · WORLD #${WORLD_SEED}`;state.camera=2;setHud();if(mode!=='cargo')toast(mission.charter?`${mission.charter.title}: survey ${mission.charter.ids.length} landmarks, then land. Shift for throttle.`:'Explorer. Fly low over ? markers to chart them. Shift for throttle.');}
export function restart(){const rebuild=crashActive();clearCrash();if(rebuild)makeAircraft(aircraftState.variant).then(()=>syncPlaneTransform());state.crashed=false;state.paused=false;aircraft.engineRunning=true;if(mission.hardcore)mission.fuel=Math.max(mission.fuel,.5);physicsAccumulator=0;$('pauseMenu').querySelector('h2').textContent='Take a breath.';$('pauseMenu').querySelector('.intro').textContent='Your aircraft is holding its current state. Ready when you are.';state.throttle=0;const rp=respawnPoint(aircraftGroundOffset);aircraft.position.set(rp.x,rp.y,rp.z);aircraft.velocity.set(0,0,0);aircraft.pitch=aircraft.roll=aircraft.pitchRate=aircraft.rollRate=aircraft.yawRate=0;aircraft.yaw=rp.yaw;aircraft.controlPitch=aircraft.controlRoll=aircraft.controlYaw=0;aircraft.enginePower=0;aircraft.airspeed=0;aircraft.stall=false;state.flightTime=0;state.gear=true;$('pauseMenu').style.display='none';state.started=true;setHud();syncPlaneTransform();updateChunks(true);toast(mission.respawn?`Aircraft reset at ${mission.respawn.name}.`:'Aircraft reset on the home runway.');}
window.addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight,false);if(composer){composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(innerWidth,innerHeight);}});
export let booted=false;
export async function startGame(){
  if(booted)return;booted=true;
  try{
    await setupScene();
    if(urlParams.has('debug'))window.SKYB={THREE,scene,camera,renderer,perf,terrain,chunks,sky,aircraft,state,mats,applyTier,fx,mission};
    $('loading').classList.add('hidden');
    setTimeout(()=>{const l=$('loading');if(l)l.style.display='none';},500);
    frame();
  }catch(err){
    console.error(err);
    $('loading').innerHTML=`<div style="max-width:600px;padding:24px;text-align:center"><h2>Unable to start SKYBOUND</h2><p style="color:#9ab0c2;font-size:13px;line-height:1.6">${err.message}</p><p style="color:#70879b;font-size:11px">Check your connection and that public/models/cessna_182_skylane.glb and public/skies are present.</p></div>`;
  }
}

// Swap airframe from the hangar while parked (keeps the aircraft on its spot).
export async function swapAircraft(id){
  await makeAircraft(id);
  aircraft.position.y=groundLevelAt(aircraft.position.x,aircraft.position.z)+aircraftGroundOffset;syncPlaneTransform();
  camera.layers.enable(1);renderer.compile(scene,camera);
}
