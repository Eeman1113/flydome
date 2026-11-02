// SKYBOUND · perf
import { $, clamp } from './util.js';
import { CHUNK } from './config.js';
import { camera, clock, cloudSystem, composer, renderer, scene, sunLight, waterMesh } from './engine.js';
import { toast } from './ui.js';

export const TIERS={
  Low:   {name:'Low',view:5, maxView:7, treeRadius:1,treeSpacing:26,shadow:0,   post:false,dpr:.8, clouds:.45,shadowSteps:5, lod:[1,2,4]},
  Medium:{name:'Medium',view:7, maxView:10,treeRadius:1,treeSpacing:20,shadow:1024,post:false,dpr:1,  clouds:.7, shadowSteps:7, lod:[1,3,5]},
  High:  {name:'High',view:10,maxView:14,treeRadius:2,treeSpacing:17,shadow:2048,post:true, dpr:1.25,clouds:1,  shadowSteps:9, lod:[1,3,6]},
  Ultra: {name:'Ultra',view:14,maxView:20,treeRadius:3,treeSpacing:14,shadow:4096,post:true, dpr:1.75,  clouds:1,  shadowSteps:10,lod:[2,4,8]}
};
export const TIER_ORDER=['Low','Medium','High','Ultra'];
export const perf={dpr:1,auto:true,tier:TIERS.High,detectedTier:'High',gpu:'unknown',view:10,refresh:60,acc:0,frames:0,cooldown:4,lastDown:-99,clock:0,rafSamples:[],viewChanged:true};
export function detectHardware(){
  let gpu='';
  try{const gl=renderer.getContext();const ext=gl.getExtension('WEBGL_debug_renderer_info');gpu=String(ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));}catch{}
  const cores=navigator.hardwareConcurrency||4,mem=navigator.deviceMemory||8,mobile=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  let tier='Medium';const g=gpu.toLowerCase();
  if(mobile)tier='Low';
  else if(/apple m\d+ (max|ultra)/.test(g))tier='Ultra';
  else if(/apple m\d+ pro/.test(g))tier='Ultra';
  else if(/apple m\d+/.test(g))tier='High';
  else if(/apple/.test(g))tier=cores>=10?'High':'Medium';
  else if(/rtx|rx ?[6-9]\d{3}|radeon pro w|arc a7/.test(g))tier='Ultra';
  else if(/gtx|quadro|radeon|rx ?5\d{3}/.test(g))tier='High';
  else if(/iris xe|arc/.test(g))tier='Medium';
  else if(/intel|mali|adreno|powervr|swiftshader|llvmpipe/.test(g))tier='Low';
  else tier=cores>=8&&mem>=8?'High':'Medium';
  perf.gpu=gpu.replace(/ANGLE \(|\)|, or similar/g,'').replace(/Direct3D.*$/,'').slice(0,60)||'Unknown GPU';
  perf.detectedTier=tier;
  return tier;
}
export function applyTier(name,keepView=false){
  const t=TIERS[name];perf.tier=t;
  if(!keepView)perf.view=t.view;perf.view=Math.min(perf.view,t.maxView);perf.viewChanged=true;
  if(renderer){
    perf.dpr=Math.min(window.devicePixelRatio||1,t.dpr);setRenderScale(perf.dpr);
    const wantShadows=t.shadow>0;
    if(renderer.shadowMap.enabled!==wantShadows||(sunLight&&sunLight.shadow.mapSize.x!==t.shadow&&wantShadows)){
      renderer.shadowMap.enabled=wantShadows;
      if(sunLight){sunLight.castShadow=wantShadows;if(wantShadows){sunLight.shadow.mapSize.set(t.shadow,t.shadow);sunLight.shadow.map?.dispose();sunLight.shadow.map=null;}}
      scene?.traverse(o=>{if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true);}});
    }
  }
  if(cloudSystem)cloudSystem.setDensity(t.clouds);
  updateCameraFar();
}
export function perfTick(dt){
  perf.clock+=dt;
  if(perf.rafSamples.length<90){perf.rafSamples.push(dt);if(perf.rafSamples.length===90){const s=[...perf.rafSamples].sort((a,b)=>a-b);perf.refresh=clamp(Math.round(1/s[45]),30,240);}}
  if(!perf.auto||document.hidden)return;
  perf.cooldown-=dt;if(perf.cooldown>0){perf.acc=0;perf.frames=0;return;}
  perf.acc+=dt;perf.frames++;
  if(perf.acc<2.5)return;
  const fps=perf.frames/perf.acc;perf.acc=0;perf.frames=0;
  const target=Math.min(perf.refresh,60),idx=TIER_ORDER.indexOf(perf.tier.name);
  const minDpr=Math.min(window.devicePixelRatio||1,.75),maxDpr=Math.min(window.devicePixelRatio||1,perf.tier.dpr);
  if(fps<target*.8){
    // Cheapest visual loss first: render scale, then view distance, then the effects tier.
    perf.lastDown=perf.clock;perf.cooldown=3;
    if(perf.dpr>minDpr+.01){perf.dpr=Math.max(minDpr,perf.dpr-(fps<target*.55?.25:.125));setRenderScale(perf.dpr);}
    else if(perf.view>Math.max(5,perf.tier.view-3)){perf.view-=2;perf.viewChanged=true;updateCameraFar();}
    else if(idx>0){applyTier(TIER_ORDER[idx-1]);perf.dpr=Math.min(perf.dpr,minDpr+.25);setRenderScale(perf.dpr);toast(`Graphics auto-adjusted to ${perf.tier.name}`);}
  }else if(fps>=target*.95&&perf.clock-perf.lastDown>12){
    perf.cooldown=2;
    if(perf.dpr<maxDpr-.01){perf.dpr=Math.min(maxDpr,perf.dpr+.125);setRenderScale(perf.dpr);}
    else if(perf.view<perf.tier.maxView){perf.view++;perf.viewChanged=true;updateCameraFar();}
    else if(idx<TIER_ORDER.length-1&&perf.clock-perf.lastDown>40&&TIER_ORDER.indexOf(perf.detectedTier)>idx){applyTier(TIER_ORDER[idx+1],true);perf.cooldown=4;}
  }
}
export function setRenderScale(r){
  if(!renderer)return;
  renderer.setPixelRatio(r);renderer.setSize(innerWidth,innerHeight,false);
  if(composer){composer.setPixelRatio(r);composer.setSize(innerWidth,innerHeight);}
}
export function viewDistanceM(){return perf.view*CHUNK;}
export function updateCameraFar(){
  if(!camera)return;camera.far=viewDistanceM()*1.25+6000;camera.updateProjectionMatrix();
  if(scene?.fog)scene.fog.density=viewDistanceM();
  if(waterMesh){const s=camera.far*2.2;waterMesh.scale.set(s,s,1);}
}
