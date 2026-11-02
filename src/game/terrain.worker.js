// SKYBOUND · terrain worker — builds chunk meshes, biome data, baked shadows and tree lists off the main thread.
import { createTerrainLib, buildChunkData } from './terrainLib.js';

let lib=null;
self.onmessage=(e)=>{
  const m=e.data;
  if(m.type==='init'){lib=createTerrainLib(m.seed);lib.setFrame(m.frame);self.postMessage({type:'ready'});return;}
  if(m.type==='chunk'){
    const r=buildChunkData(lib,m.req);
    const tr=[r.pos.buffer,r.nor.buffer,r.bio.buffer,r.ext.buffer,r.idx.buffer];
    if(r.trees)tr.push(r.trees.buffer);
    self.postMessage({type:'chunk',id:m.id,data:r},tr);
  }
};
