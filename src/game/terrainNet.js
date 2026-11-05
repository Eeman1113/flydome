// SKYBOUND · terrainNet: runs the learned-terrain network (tools/ml/train_terrain.py) on the GPU, once per world.
// A minimal WebGL2 inference engine: every 3×3 dilated conv layer is a few fullscreen passes over RGBA32F
// textures (4 channels each), weights read from a float texture. 640×640 cells (40 km at 62.5 m) take tens of
// milliseconds. The CPU only does the cheap box blurs; the result is a delta grid added to the terrain in base().
import { BASE_PATH } from './config.js';

const RES=448; // 28 km at 62.5 m: the surveyed world area
function boxBlur3(src,W,H,sigma){
  let w=Math.floor(Math.sqrt(12*sigma*sigma/3+1));if(w%2===0)w++;const r=w>>1;
  let a=Float32Array.from(src),b=new Float32Array(src.length);
  for(let pass=0;pass<3;pass++){
    // horizontal (replicate edges), then vertical
    for(let y=0;y<H;y++){const o=y*W;let s=0;for(let k=-r;k<=r;k++)s+=a[o+Math.min(W-1,Math.max(0,k))];
      for(let x=0;x<W;x++){b[o+x]=s/w;s+=a[o+Math.min(W-1,x+r+1)]-a[o+Math.max(0,x-r)];}}
    for(let x=0;x<W;x++){let s=0;for(let k=-r;k<=r;k++)s+=b[Math.min(H-1,Math.max(0,k))*W+x];
      for(let y=0;y<H;y++){a[y*W+x]=s/w;s+=b[Math.min(H-1,y+r+1)*W+x]-b[Math.max(0,y-r)*W+x];}}
  }
  return a;
}
const VS=`#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
// One output RGBA group = sum over input groups and 9 taps of mat4(weights) * input texel.
const FS=`#version 300 es
precision highp float;precision highp sampler2D;
uniform sampler2D inp[8];uniform sampler2D wt;uniform int nIn;uniform int dil;uniform int k1;uniform int base;uniform int relu;uniform vec4 bias;uniform ivec2 size;
out vec4 o;
vec4 fetchIn(int g,ivec2 c){c=clamp(c,ivec2(0),size-1);
  if(g==0)return texelFetch(inp[0],c,0);if(g==1)return texelFetch(inp[1],c,0);if(g==2)return texelFetch(inp[2],c,0);if(g==3)return texelFetch(inp[3],c,0);
  if(g==4)return texelFetch(inp[4],c,0);if(g==5)return texelFetch(inp[5],c,0);if(g==6)return texelFetch(inp[6],c,0);return texelFetch(inp[7],c,0);}
void main(){ivec2 c=ivec2(gl_FragCoord.xy);vec4 acc=bias;int taps=k1==1?1:9;
  for(int g=0;g<8;g++){if(g>=nIn)break;
    for(int t=0;t<9;t++){if(t>=taps)break;ivec2 off=k1==1?ivec2(0):ivec2(t%3-1,t/3-1)*dil;vec4 v=fetchIn(g,c+off);
      int row=base+(g*taps+t)*4;mat4 M=mat4(texelFetch(wt,ivec2(row&255,row>>8),0),texelFetch(wt,ivec2((row+1)&255,(row+1)>>8),0),texelFetch(wt,ivec2((row+2)&255,(row+2)>>8),0),texelFetch(wt,ivec2((row+3)&255,(row+3)>>8),0));
      acc+=M*v;}}
  o=relu==1?max(acc,0.):acc;}`;

let netP=null;
const loadNet=()=>netP||(netP=fetch(`${BASE_PATH}/models/terrain_net.json`).then(r=>r.ok?r.json():null).catch(()=>null));
export async function runTerrainNet(heights,W=RES,H=RES){
  const net=await loadNet();if(!net)return null;
  const b=boxBlur3(heights,W,H,net.sig_fine),bb=boxBlur3(b,W,H,net.sig_rel);
  const inp=new Float32Array(W*H*4);for(let i=0;i<W*H;i++){inp[i*4]=(b[i]-bb[i])/net.rel_scale;inp[i*4+1]=b[i]/net.h_scale;}
  const y=infer(net,inp,W,H);if(!y)return null;
  // delta: (fine-blurred procedural + learned detail) − procedural, in metres
  const delta=new Float32Array(W*H);for(let i=0;i<W*H;i++)delta[i]=b[i]+y[i]*net.out_scale-heights[i];
  return delta;
}
// Golden test: the trainer stores features + PyTorch output for a 64×64 patch; returns the max abs difference.
export async function testTerrainNet(){
  const net=await loadNet();if(!net?.test)return null;const T=net.test,H=T.out.length,W=T.out[0].length;
  const inp=new Float32Array(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){inp[(y*W+x)*4]=T.inp[0][y][x];inp[(y*W+x)*4+1]=T.inp[1][y][x];}
  const out=infer(net,inp,W,H);if(!out)return null;let m=0,at=0,om=0,sum=0,big=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const d=Math.abs(out[y*W+x]-T.out[y][x]);if(d>m){m=d;at=[x,y,out[y*W+x],T.out[y][x]];}om=Math.max(om,Math.abs(out[y*W+x]));sum+=d;if(d>.01)big++;}return {max:m,at,outAbsMax:om,mean:sum/(W*H),big};
}
function infer(net,inp,W,H){
  const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(1,1):document.createElement('canvas');
  const gl=canvas.getContext('webgl2',{antialias:false,depth:false,preserveDrawingBuffer:false});
  if(!gl||!gl.getExtension('EXT_color_buffer_float'))return null;
  try{
    // create on a spare unit (9): binding on the active unit would clobber the weights texture on unit 8
    const tex=(data)=>{const t=gl.createTexture();gl.activeTexture(gl.TEXTURE9);gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,W,H,0,gl.RGBA,gl.FLOAT,data);
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
      for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);return t;};
    // ---- pack weights: for each layer, out group G, in group g, tap t → 4 rows (mat4 columns = input channel)
    const rows=[],meta=[];
    for(const L of net.layers){
      const out=L.w.length,inC=L.w[0].length,k1=L.k===1,taps=k1?1:9,gOut=Math.ceil(out/4),gIn=Math.ceil(inC/4);const m={gOut,gIn,taps,dil:L.dil,k1,bases:[],bias:[]};
      for(let G=0;G<gOut;G++){m.bases.push(rows.length/4);m.bias.push([0,1,2,3].map(j=>L.b[G*4+j]??0));
        for(let g=0;g<gIn;g++)for(let t=0;t<taps;t++)for(let col=0;col<4;col++){const ic=g*4+col;
          for(let r=0;r<4;r++){const oc=G*4+r;rows.push(oc<out&&ic<inC?(k1?L.w[oc][ic][0][0]:L.w[oc][ic][Math.floor(t/3)][t%3]):0);}}}
      meta.push(m);
    }
    // weights as a 256-wide 2D texture (a single column would exceed MAX_TEXTURE_SIZE)
    const nRows=rows.length/4,hW=Math.ceil(nRows/256),wdata=new Float32Array(256*hW*4);wdata.set(rows);
    const wt=gl.createTexture();gl.activeTexture(gl.TEXTURE9);gl.bindTexture(gl.TEXTURE_2D,wt);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,256,hW,0,gl.RGBA,gl.FLOAT,wdata);
    for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
    // ---- program
    const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
    const prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);
    const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    const U=n=>gl.getUniformLocation(prog,n);
    gl.uniform1iv(U('inp'),[0,1,2,3,4,5,6,7]);gl.uniform1i(U('wt'),8);gl.uniform2i(U('size'),W,H);gl.viewport(0,0,W,H);
    // ---- run layers (ping-pong texture sets)
    let cur=[tex(inp)];const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    meta.forEach((m,li)=>{
      const next=[];
      for(let i=0;i<8;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,cur[Math.min(i,cur.length-1)]);}
      gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D,wt);
      gl.uniform1i(U('nIn'),m.gIn);gl.uniform1i(U('dil'),m.dil);gl.uniform1i(U('k1'),m.k1?1:0);gl.uniform1i(U('relu'),li<meta.length-1?1:0);
      for(let G=0;G<m.gOut;G++){const t=tex(null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
        gl.uniform1i(U('base'),m.bases[G]);gl.uniform4fv(U('bias'),m.bias[G]);gl.drawArrays(gl.TRIANGLES,0,3);next.push(t);}
      for(const t of cur)gl.deleteTexture(t);cur=next;
    });
    const px=new Float32Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,px);
    const y=new Float32Array(W*H);for(let i=0;i<W*H;i++)y[i]=px[i*4];
    for(const t of cur)gl.deleteTexture(t);gl.deleteTexture(wt);gl.getExtension('WEBGL_lose_context')?.loseContext();
    return y;
  }catch(e){console.warn('[SKYBOUND] terrain net unavailable:',e.message);return null;}
}
export const TERRAIN_NET_RES=RES;
