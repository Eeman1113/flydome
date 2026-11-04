// SKYBOUND · chunks
import * as THREE from 'three';
import { $, clamp, lerp } from './util.js';
import { CHUNK, RUNWAY_HALF_L, RUNWAY_HALF_W, SEA_LEVEL, WORLD_SEED, aircraft, fx, sky } from './config.js';
import { buildChunkData } from './terrainLib.js';
import { AIRPORT_H, terrain, terrainFrame } from './world.js';
import { perf } from './perf.js';
import { geos, mats } from './materials.js';
import { detailGroup, frame, terrainGroup } from './engine.js';

export const chunks=new Map();
export const workerPool={workers:[],idle:[],queue:[],pending:new Map(),nextId:1,results:[],fallback:false,ready:0};
// Region survey (chart relief + landmarks), produced once per world by a worker.
export const SCAN_R=14000,SCAN_STEP=125;
let scanRequested=false,resolveScan=null;
export const worldScan=new Promise(r=>{resolveScan=r;});
export function initWorkers(){
  const n=clamp((navigator.hardwareConcurrency||4)-2,1,4);
  try{
    for(let i=0;i<n;i++){
      const w=new Worker(new URL('./terrain.worker.js',import.meta.url),{type:'module'});
      w.onmessage=(e)=>{const m=e.data;
        if(m.type==='ready'){workerPool.ready++;
          // The first worker to come up surveys the region (landmarks + chart relief) before taking chunks.
          if(!scanRequested){scanRequested=true;w.postMessage({type:'scan',R:SCAN_R,step:SCAN_STEP});return;}
          workerPool.idle.push(w);pumpWorkers();return;}
        if(m.type==='scan'){resolveScan(m.data);workerPool.idle.push(w);pumpWorkers();return;}
        if(m.type==='chunk'){workerPool.pending.delete(m.id);workerPool.results.push(m.data);workerPool.idle.push(w);pumpWorkers();}};
      w.onerror=(err)=>{console.error('[SKYBOUND worker]',err);};
      w.postMessage({type:'init',seed:WORLD_SEED,frame:terrainFrame});
      workerPool.workers.push(w);
    }
  }catch(err){console.warn('[SKYBOUND] Workers unavailable; generating terrain on the main thread',err);workerPool.fallback=true;resolveScan(terrain.scanWorld(SCAN_R,SCAN_STEP));}
}
export function lodForRing(d){const L=perf.tier.lod;return d<=L[0]?0:d<=L[1]?1:d<=L[2]?2:3;}
export const LOD_SEG=[64,32,16,8];
export function requestChunk(cx,cz,lod,detail,priority){
  const key=`${cx},${cz}`;
  const req={key,cx,cz,lod,seg:LOD_SEG[lod],size:CHUNK,shadowSteps:lod<=1?perf.tier.shadowSteps:lod===2?Math.max(5,perf.tier.shadowSteps-2):5,sun:sky.sunDir.toArray(),detail:detail?{spacing:perf.tier.treeSpacing}:null,priority};
  workerPool.queue.push(req);
}
export function pumpWorkers(){
  if(workerPool.fallback)return;
  while(workerPool.idle.length&&workerPool.queue.length){
    workerPool.queue.sort((a,b)=>a.priority-b.priority);
    const req=workerPool.queue.shift(),c=chunks.get(req.key);
    if(!c||c.pendingLod!==req.lod)continue;
    const w=workerPool.idle.pop(),id=workerPool.nextId++;
    workerPool.pending.set(id,req);w.postMessage({type:'chunk',id,req});
  }
}
export let lastChunkCenter='';
export function updateChunks(force=false){
  const fx0=aircraft.position.x,fz0=aircraft.position.z;
  const cx=Math.floor(fx0/CHUNK),cz=Math.floor(fz0/CHUNK),center=`${cx},${cz}`;
  if(center===lastChunkCenter&&!perf.viewChanged&&!force)return;
  lastChunkCenter=center;perf.viewChanged=false;
  const R=perf.view,keep=new Set();
  for(let z=cz-R;z<=cz+R;z++)for(let x=cx-R;x<=cx+R;x++){
    const dx=x-cx,dz=z-cz;if(dx*dx+dz*dz>(R+.5)*(R+.5))continue;
    const key=`${x},${z}`,d=Math.max(Math.abs(dx),Math.abs(dz)),lod=lodForRing(d),wantDetail=d<=perf.tier.treeRadius+1;
    keep.add(key);
    let c=chunks.get(key);
    if(!c){c={key,cx:x,cz:z,lod:-1,pendingLod:-1,mesh:null,detailData:null,trees:[],dist:d};chunks.set(key,c);}
    c.dist=d;
    const needDetail=wantDetail&&!c.detailData;
    if((c.lod!==lod||needDetail)&&c.pendingLod!==lod){c.pendingLod=lod;requestChunk(x,z,lod,wantDetail,dx*dx+dz*dz-(lod===0?100:0));}
    else if(needDetail&&c.pendingLod===lod&&!workerPool.queue.some(q=>q.key===key)&&![...workerPool.pending.values()].some(q=>q.key===key)){c.pendingLod=lod;requestChunk(x,z,lod,true,dx*dx+dz*dz);}
  }
  for(const [key,c] of chunks){if(!keep.has(key)){disposeChunk(c);chunks.delete(key);}}
  workerPool.queue=workerPool.queue.filter(q=>chunks.has(q.key));
  for(const q of workerPool.queue){const c=chunks.get(q.key);const dx=c.cx-cx,dz=c.cz-cz;q.priority=dx*dx+dz*dz;}
  pumpWorkers();
}
export function disposeChunk(c){
  if(c.mesh){terrainGroup.remove(c.mesh);c.mesh.geometry.dispose();c.mesh=null;}
  clearDetail(c);
}
export function clearDetail(c){
  for(const m of c.trees){detailGroup.remove(m);m.dispose();}c.trees=[];
}
export function integrateChunk(r){
  const c=chunks.get(r.key);if(!c)return;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(r.pos,3));geo.setAttribute('normal',new THREE.BufferAttribute(r.nor,3));
  geo.setAttribute('biome',new THREE.BufferAttribute(r.bio,4));geo.setAttribute('extra',new THREE.BufferAttribute(r.ext,2));
  geo.setIndex(new THREE.BufferAttribute(r.idx,1));
  geo.boundingBox=new THREE.Box3(new THREE.Vector3(r.cx*CHUNK,r.minY,r.cz*CHUNK),new THREE.Vector3((r.cx+1)*CHUNK,r.maxY,(r.cz+1)*CHUNK));
  geo.boundingSphere=geo.boundingBox.getBoundingSphere(new THREE.Sphere());
  const mesh=new THREE.Mesh(geo,mats.terrain);mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;mesh.updateMatrix();
  if(c.mesh){terrainGroup.remove(c.mesh);c.mesh.geometry.dispose();}
  c.mesh=mesh;terrainGroup.add(mesh);c.lod=r.lod;if(c.pendingLod===r.lod)c.pendingLod=-1;
  if(r.trees){c.detailData={trees:r.trees};clearDetail(c);c.detailBuilt=false;}
}
export const _m4=new THREE.Matrix4(),_q=new THREE.Quaternion(),_v=new THREE.Vector3(),_s=new THREE.Vector3(),_e=new THREE.Euler(),_c=new THREE.Color();
export function buildDetail(c){
  const d=c.detailData;if(!d)return;
  // Trees: only inside the tree radius; distant rings get thinned for performance.
  if(c.dist<=perf.tier.treeRadius&&d.trees.length){
    const stride=c.dist<=1?1:2,T=d.trees,n=T.length/8,counts=[0,0];
    for(let i=0;i<n;i+=stride)counts[T[i*8+4]]++;
    const meshes=[new THREE.InstancedMesh(geos.broadleaf,mats.tree,Math.max(1,counts[0])),new THREE.InstancedMesh(geos.conifer,mats.tree,Math.max(1,counts[1]))];
    const idx=[0,0];const autumn=terrain.P.autumn;
    for(let i=0;i<n;i+=stride){
      const o=i*8,type=T[o+4],s=T[o+3],r=T[o+5],temp=T[o+6],moist=T[o+7];
      _v.set(T[o],T[o+1]-.4,T[o+2]);_q.setFromEuler(_e.set((r-.5)*.08,r*6.283,(r*7%1-.5)*.08));_s.set(s*(type?.62:1.18),s,s*(type?.62:1.18));
      _m4.compose(_v,_q,_s);meshes[type].setMatrixAt(idx[type],_m4);
      const v=.72+r*.5;
      if(type===0){
        if(autumn&&r>.35)_c.setRGB(lerp(1.6,2.4,r)*v,lerp(.9,1.3,(r*13)%1)*v,.35*v);
        else _c.setRGB(v*(1+(1-moist)*.35),v*(1.02-(1-moist)*.1),v*(.85));
      }else _c.setRGB(v*.8,v*(.85+temp*.12),v*.7);
      meshes[type].setColorAt(idx[type],_c);idx[type]++;
    }
    meshes.forEach((m,k)=>{m.count=idx[k];m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();m.castShadow=false;m.receiveShadow=false;if(m.count){detailGroup.add(m);c.trees.push(m);}else m.dispose();});
  }
}
export function processChunkResults(budgetMs){
  if(workerPool.fallback&&workerPool.queue.length){
    workerPool.queue.sort((a,b)=>a.priority-b.priority);
    const req=workerPool.queue.shift(),c=chunks.get(req.key);
    if(c&&c.pendingLod===req.lod)workerPool.results.push(buildChunkData(terrain,req));
  }
  const t0=performance.now();
  workerPool.results.sort((a,b)=>(chunks.get(a.key)?.dist??99)-(chunks.get(b.key)?.dist??99));
  while(workerPool.results.length&&performance.now()-t0<budgetMs){integrateChunk(workerPool.results.shift());}
  // Trees: build inside the tree radius, tear down outside it.
  let built=0;
  for(const c of chunks.values()){
    const inTree=c.dist<=perf.tier.treeRadius;
    if(c.trees.length&&!inTree){for(const m of c.trees){detailGroup.remove(m);m.dispose();}c.trees=[];}
    if(inTree&&c.detailData&&!c.trees.length&&!c.detailBuilt&&built<2){buildDetail(c);c.detailBuilt=true;built++;}
    if(!inTree)c.detailBuilt=false;
    if(c.detailData&&c.dist>perf.tier.treeRadius+1)c.detailData=null;
  }
}
// Physics ground height matching the highest-LOD triangle layout.
export const LOD0_STEP=CHUNK/LOD_SEG[0];
export function meshHeightAt(x,z){
  const gx=Math.floor(x/LOD0_STEP),gz=Math.floor(z/LOD0_STEP),fx=x/LOD0_STEP-gx,fz=z/LOD0_STEP-gz;
  const X=gx*LOD0_STEP,Z=gz*LOD0_STEP;
  const hb=terrain.heightAt(X+LOD0_STEP,Z),hd=terrain.heightAt(X,Z+LOD0_STEP);
  if(fx+fz<1){const ha=terrain.heightAt(X,Z);return ha+(hb-ha)*fx+(hd-ha)*fz;}
  const he=terrain.heightAt(X+LOD0_STEP,Z+LOD0_STEP);return he+(hd-he)*(1-fx)+(hb-he)*(1-fz);
}
export const groundCache={x:1e9,z:1e9,h:0};
export function terrainGroundAt(x,z){if(Math.abs(x-groundCache.x)<.05&&Math.abs(z-groundCache.z)<.05)return groundCache.h;groundCache.x=x;groundCache.z=z;groundCache.h=meshHeightAt(x,z);return groundCache.h;}
export function onRunway(x,z){return Math.abs(x)<=RUNWAY_HALF_W&&Math.abs(z)<=RUNWAY_HALF_L;}
export function stripAtPos(x,z,pad=0){return terrain.stripAt(x,z,pad);}
export function groundLevelAt(x,z){
  if(onRunway(x,z))return AIRPORT_H+.06;
  return Math.max(terrainGroundAt(x,z),SEA_LEVEL);
}
export function isWaterAt(x,z){return !onRunway(x,z)&&terrainGroundAt(x,z)<SEA_LEVEL-.2;}
