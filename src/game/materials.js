// SKYBOUND · materials
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { $, clamp } from './util.js';
import { SKY, WORLD_SEED, fx, shared, sky } from './config.js';
import { AIRPORT_H, terrain } from './world.js';
import { makeNoiseTexture, makeWaterNormalTexture } from './textures.js';

export const mats={};
export function createMaterials(){
  const noiseTex=makeNoiseTexture();mats.noiseTex=noiseTex;
  // One cloud field drives both the cumulus placement (scenery.js) and the terrain's
  // cloud shadows, so every shadow on the ground has a cloud above it.
  {
    const cover=SKY.clouds*(.7+terrain.P.moistBias+.45),A=noiseTex.image.data,vals=[];
    for(let i=3;i<A.length;i+=4)vals.push(A[i]);vals.sort((a,b)=>a-b);
    const frac=clamp(cover*.32,.04,.4);
    fx.cloud={cover,tile:26000,base:AIRPORT_H+900+((WORLD_SEED>>3)%7)*160,thresh:vals[Math.floor((1-frac)*(vals.length-1))]/255};
    fx.cloudUniform={value:new THREE.Vector4(fx.cloud.tile,fx.cloud.thresh,fx.cloud.base,.6)};
  }
  // Terrain: biome/slope/altitude splatting, farmland patchwork, baked sun visibility.
  const tm=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95,metalness:0});
  tm.onBeforeCompile=(sh)=>{
    sh.uniforms.tNoise={value:noiseTex};sh.uniforms.uTime=shared.time;sh.uniforms.uAutumn={value:terrain.P.autumn};sh.uniforms.uCloud=fx.cloudUniform;sh.uniforms.uSunDirT={value:sky.sunDir};
    const S=terrain.strips;sh.uniforms.uStripA={value:[0,1,2].map(i=>S[i]?new THREE.Vector4(S[i].x,S[i].z,S[i].cos,S[i].sin):new THREE.Vector4(1e9,1e9,1,0))};
    sh.uniforms.uStripB={value:[0,1,2].map(i=>S[i]?new THREE.Vector4(S[i].halfL,S[i].halfW,0,0):new THREE.Vector4(0,0,0,0))};
    sh.vertexShader=sh.vertexShader.replace('#include <common>',`#include <common>
      attribute vec4 biome; attribute vec2 extra; varying vec4 vBiome; varying vec2 vExtra; varying vec3 vWPos; varying vec3 vWNormal;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
      vBiome=biome; vExtra=extra; vWPos=(modelMatrix*vec4(transformed,1.0)).xyz; vWNormal=normalize(mat3(modelMatrix)*objectNormal);`);
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
      uniform sampler2D tNoise; uniform float uTime; uniform float uAutumn; uniform vec4 uCloud; uniform vec3 uSunDirT; float cloudVis=1.; uniform vec4 uStripA[3]; uniform vec4 uStripB[3];
      varying vec4 vBiome; varying vec2 vExtra; varying vec3 vWPos; varying vec3 vWNormal;
      float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
      float terrRough; vec3 terrBump;
      vec3 terrainAlbedo(){
        vec3 P=vWPos; float h=P.y; float slope=1.0-clamp(vWNormal.y,0.0,1.0);
        vec4 n1=texture2D(tNoise,P.xz/2400.0), n2=texture2D(tNoise,P.xz/310.0), n3=texture2D(tNoise,P.xz/41.0), n4=texture2D(tNoise,P.xz/7.0);
        float dist=length(P-cameraPosition);
        float moist=clamp(vBiome.x+(n1.r-.5)*.3+(n2.g-.5)*.12,0.,1.), temp=clamp(vBiome.y+(n1.g-.5)*.15,0.,1.);
        float forest=vBiome.z;
        vec3 lush=vec3(.09,.19,.035), dry=vec3(.24,.23,.085), desert=vec3(.62,.47,.29), tundra=vec3(.22,.25,.14);
        vec3 grass=mix(dry,lush,smoothstep(.25,.68,moist));
        grass=mix(grass,desert,smoothstep(.6,.8,temp)*(1.-smoothstep(.18,.42,moist)));
        grass=mix(grass,tundra,smoothstep(.3,.1,temp));
        grass=mix(grass,grass*vec3(1.25,1.05,.7),uAutumn*.45);
        grass*=.8+.3*n2.b+.14*(n3.r-.5)*(1.-smoothstep(300.,2500.,dist))+.1*(n4.g-.5)*(1.-smoothstep(60.,400.,dist));
        // farmland patchwork on flat temperate lowland
        float flatness=1.-smoothstep(.035,.09,slope);
        float farmMask=flatness*smoothstep(6.,16.,h)*(1.-smoothstep(380.,620.,h))*smoothstep(.3,.42,moist)*(1.-smoothstep(.72,.85,temp))*(1.-forest*1.6)*smoothstep(.38,.52,n1.a);
        vec3 col=grass;
        if(farmMask>.001){
          vec2 region=floor(P.xz/2600.); float ang=hash12(region*1.7+3.1)*3.14159; mat2 R=mat2(cos(ang),-sin(ang),sin(ang),cos(ang));
          vec2 q=R*P.xz+region*977.; vec2 cs=vec2(190.,120.); vec2 cell=floor(q/cs); vec2 fq=fract(q/cs);
          float hsh=hash12(cell+region*13.);
          vec3 fc=hsh<.22?vec3(.50,.40,.17):hsh<.42?vec3(.17,.27,.07):hsh<.58?vec3(.26,.19,.11):hsh<.76?vec3(.33,.36,.13):vec3(.12,.2,.05);
          fc=mix(fc,fc*vec3(1.3,1.0,.6),uAutumn*.5);
          float fw=fwidth(q.x*.9);
          float furrow=.9+.1*sin(q.x*.9+hsh*20.)*(1.-smoothstep(.5,2.,fw));
          fc*=furrow*(.85+.3*n3.g);
          vec2 bd=min(fq,1.-fq)*cs; float edge=min(bd.x,bd.y);
          float hedge=1.-smoothstep(1.5,5.,edge);
          fc=mix(fc,vec3(.07,.12,.04),hedge*.8);
          col=mix(col,fc,farmMask);
        }
        vec3 forestCol=mix(vec3(.045,.085,.03),vec3(.07,.11,.035),n3.b)*(.75+.5*n2.r);
        forestCol=mix(forestCol,vec3(.16,.08,.03),uAutumn*.5*smoothstep(.4,.7,temp));
        col=mix(col,forestCol,smoothstep(.05,.8,forest));
        // bush airstrips: mown apron, mowing bands and two worn wheel tracks
        for(int si=0;si<3;si++){
          vec2 d=P.xz-uStripA[si].xy; float su=dot(d,uStripA[si].zw), sv=dot(d,vec2(-uStripA[si].w,uStripA[si].z));
          vec2 sb=uStripB[si].xy; if(sb.x<1.) continue;
          float apron=1.-smoothstep(0.,14.,max(abs(su)-sb.x-30.,abs(sv)-sb.y-24.));
          float strip=1.-smoothstep(0.,2.5,max(abs(su)-sb.x,abs(sv)-sb.y));
          if(apron<=0.) continue;
          vec3 mown=mix(col,vec3(.12,.2,.055),.55)*(.94+.12*n3.r);
          col=mix(col,mown,apron*.6);
          float bw=fwidth(sv/6.5);float band=smoothstep(.5-bw,.5+bw,fract(sv/6.5));
          vec3 s2=mown*mix(.95,1.06,band);
          float wear=smoothstep(sb.x,sb.x-60.,abs(su));
          float tracks=(1.-smoothstep(.25,.75,abs(abs(sv)-1.7)))*wear*(.7+.3*n3.b);
          s2=mix(s2,vec3(.27,.22,.14)*(.85+.3*n4.r),tracks*.6);
          float ends=smoothstep(sb.x-40.,sb.x,abs(su))*(1.-smoothstep(sb.y-1.,sb.y,abs(sv)));
          s2=mix(s2,vec3(.28,.25,.16),ends*.25*n3.g);
          col=mix(col,s2,strip);
        }
        // beaches and wet shoreline
        vec3 sand=vec3(.46,.40,.28)*(.88+.24*n3.r);
        float beach=(1.-smoothstep(.8,2.2+n2.r*2.5,h))*(1.-smoothstep(.1,.35,slope));
        col=mix(col,sand,beach);
        // rock on steep slopes, strata bands
        float rockAmt=smoothstep(.26,.44,slope+(n2.g-.5)*.18);
        vec3 rock=mix(vec3(.085,.08,.072),vec3(.22,.2,.17),n2.r*.6+n3.r*.4*(1.-smoothstep(400.,3000.,dist))+.2);
        rock*=.9+.12*sin(h*.045+n2.b*9.+n1.g*14.);
        rock=mix(rock,rock*vec3(.75,.85,.7),smoothstep(.55,.35,slope)*.6);
        rock=mix(rock,rock*vec3(1.15,1.,.85),smoothstep(.6,.8,temp));
        rock*=1.+(n4.r-.5)*.45*(1.-smoothstep(120.,900.,dist))+(n4.b-.5)*.25*(1.-smoothstep(40.,300.,dist));
        float highRock=smoothstep(mix(1300.,2400.,temp),mix(1600.,2800.,temp),h+n1.r*260.);
        col=mix(col,rock,max(rockAmt,highRock*(1.-smoothstep(.0,.2,forest))));
        // snow
        float snowLine=mix(1500.,3400.,temp);
        float snow=smoothstep(snowLine,snowLine+220.,h+(n1.r-.5)*420.+(n3.g-.5)*80.)*(1.-smoothstep(.42,.62,slope));
        col=mix(col,vec3(.86,.89,.93)*(.92+.1*n3.b),snow);
        // underwater
        float wet=smoothstep(2.2,.2,h);
        col*=1.-.35*wet*step(-.4,h);
        col=mix(col,mix(vec3(.32,.30,.22),vec3(.02,.07,.08),smoothstep(0.,-22.,h)),smoothstep(0.,-1.5,h));
        terrRough=mix(.97,.82,rockAmt); terrRough=mix(terrRough,.55,snow); terrRough=mix(terrRough,.45,wet);
        // micro relief from the detail noise
        float fade=1.-smoothstep(150.,700.,dist);
        terrBump=vec3((n2.r-.5)*.6+(n3.r-.5)*fade*.5+(n4.r-.5)*rockAmt*fade*.8,0.,(n2.g-.5)*.6+(n3.g-.5)*fade*.5+(n4.g-.5)*rockAmt*fade*.8)*(.12+rockAmt*.35)*(1.-snow*.6);
        return col;
      }`)
      .replace('#include <map_fragment>',`vec3 tAlb=terrainAlbedo(); diffuseColor.rgb=tAlb;
        vec2 cuv=(vWPos.xz+uSunDirT.xz/max(uSunDirT.y,.08)*(uCloud.z-vWPos.y))/uCloud.x;
        cloudVis=1.-uCloud.w*smoothstep(uCloud.y-.03,uCloud.y+.09,texture2D(tNoise,cuv).a);`)
      .replace('#include <roughnessmap_fragment>',`float roughnessFactor=terrRough;`)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        normal=normalize(normal+(viewMatrix*vec4(terrBump.x,0.,terrBump.z,0.)).xyz*.5);`)
      .replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin.replaceAll('RE_Direct( directLight,','directLight.color *= vExtra.x*cloudVis; RE_Direct( directLight,'))
      .replace('#include <aomap_fragment>',`reflectedLight.indirectDiffuse*=vExtra.y; reflectedLight.indirectSpecular*=vExtra.y*mix(.35,1.,vExtra.x);
        #include <aomap_fragment>`);
  };
  mats.terrain=tm;

  // Water: PBR with layered scrolling normals, reflecting the HDR sky.
  const wn=makeWaterNormalTexture();
  const wm=new THREE.MeshPhysicalMaterial({color:new THREE.Color(.006,.03,.04),roughness:.035,metalness:0,normalMap:wn,normalScale:new THREE.Vector2(.55,.55),envMapIntensity:1.25,ior:1.33,specularIntensity:1});
  wm.onBeforeCompile=(sh)=>{
    sh.uniforms.uTime=shared.time;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos2;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWPos2=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform float uTime; varying vec3 vWPos2;')
      .replace('#include <normal_fragment_maps>',`
        vec2 wuv=vWPos2.xz;
        vec3 w1=texture2D(normalMap,wuv/61.0+vec2(uTime*.011,uTime*.007)).xyz*2.-1.;
        vec3 w2=texture2D(normalMap,wuv/23.0+vec2(-uTime*.017,uTime*.013)).xyz*2.-1.;
        vec3 w3=texture2D(normalMap,wuv/420.0+vec2(uTime*.003,-uTime*.002)).xyz*2.-1.;
        float wd=length(vWPos2-cameraPosition);
        vec2 ts=(w1.xy+w2.xy*.7+w3.xy*1.2)*normalScale/(1.+wd/1400.);
        vec3 wN=normalize(vec3(ts.x,1.0,-ts.y));
        normal=normalize((viewMatrix*vec4(wN,0.)).xyz);`);
  };
  mats.water=wm;

  // Trees with per-instance tint and wind sway.
  const tree=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:0});
  tree.onBeforeCompile=(sh)=>{
    sh.uniforms.uTime=shared.time;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform float uTime;').replace('#include <begin_vertex>',`#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec2 ip=vec2(instanceMatrix[3][0],instanceMatrix[3][2]);
      float sw=max(transformed.y-.2,0.);
      transformed.x+=sin(uTime*1.6+ip.x*.07+ip.y*.04)*.025*sw*sw;
      transformed.z+=cos(uTime*1.25+ip.y*.06)*.02*sw*sw;
      #endif`);
  };
  mats.tree=tree;

}

/* ------------------------------------------------------------------------- */
/* Geometry factories                                                          */
/* ------------------------------------------------------------------------- */
export function colorize(geo,fn){const p=geo.attributes.position,c=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){const col=fn(p.getX(i),p.getY(i),p.getZ(i));c[i*3]=col[0];c[i*3+1]=col[1];c[i*3+2]=col[2];}geo.setAttribute('color',new THREE.BufferAttribute(c,3));return geo;}
export function strip(geo){const g=geo.index?geo.toNonIndexed():geo;for(const k of Object.keys(g.attributes))if(!['position','normal','color'].includes(k))g.deleteAttribute(k);return g;}
export function jitterVerts(geo,amt,seed){const p=geo.attributes.position,r=terrain.mulberry32(seed);const map=new Map();for(let i=0;i<p.count;i++){const key=`${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;if(!map.has(key))map.set(key,[(r()-.5)*amt,(r()-.5)*amt,(r()-.5)*amt]);const j=map.get(key);p.setXYZ(i,p.getX(i)+j[0],p.getY(i)+j[1],p.getZ(i)+j[2]);}geo.computeVertexNormals();return geo;}
export const geos={};
export function createGeometries(){
  const trunkC=[.16,.1,.06];
  const conTrunk=colorize(new THREE.CylinderGeometry(.035,.06,.3,5).translate(0,.15,0),()=>trunkC);
  const cones=[[.40,.42,.28],[.32,.38,.5],[.22,.32,.7],[.12,.24,.88]].map(([r,h,y],i)=>colorize(new THREE.ConeGeometry(r,h,9,1).translate(0,y,0),(x,yy)=>{const t=(yy-y+h/2)/h;const k=.38+t*.75+i*.06;return[.032*k,.07*k,.038*k];}));
  geos.conifer=mergeGeometries([conTrunk,...cones].map(strip));
  const brTrunk=colorize(new THREE.CylinderGeometry(.04,.07,.48,5).translate(0,.24,0),()=>trunkC);
  // Broadleaf crown: five lumpy lobes with self-shadowed undersides and sunlit tops.
  // Soft spherical normals (from the whole tree's crown centre) make the lobes light as one leafy mass.
  const soften=(g,cx,cy,cz)=>{const p=g.attributes.position,n=g.attributes.normal;for(let i=0;i<p.count;i++){const v=new THREE.Vector3(p.getX(i)-cx,(p.getY(i)-cy)*1.25,p.getZ(i)-cz).normalize();const fn=new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i));v.lerp(fn,.22).normalize();n.setXYZ(i,v.x,v.y,v.z);}return g;};
  const crown=(r,det,j,seed,x,y,z,sy=1)=>colorize(soften(jitterVerts(new THREE.IcosahedronGeometry(r,det),j,seed).scale(1,sy,1).translate(x,y,z),0,.72,0),(px,py,pz)=>{
    const up=(py-(y-r*sy))/(2*r*sy),out=Math.hypot(px-x,pz-z)/r;const k=.34+up*.74+out*.12;return[.075*k,.14*k,.038*k];});
  const blobs=[crown(.33,1,.1,3,0,.62,0,.8),crown(.24,1,.08,5,.15,.8,.07),crown(.22,1,.08,7,-.16,.74,-.09),crown(.2,1,.07,11,.02,.92,-.13),crown(.18,0,.06,13,-.05,.55,.18)];
  geos.broadleaf=mergeGeometries([brTrunk,...blobs].map(strip));
}
