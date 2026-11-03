// SKYBOUND · sky
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { $, DEG, clamp, lerp } from './util.js';
import { BASE_PATH, SKY, fx, sky } from './config.js';
import { terrain } from './world.js';

export async function loadSky(onProgress){
  let tex=null;
  try{
    const loader=new RGBELoader();
    tex=await loader.loadAsync(`${BASE_PATH}/skies/${SKY.id}_2k.hdr`,e=>{if(e.lengthComputable)onProgress(e.loaded/e.total);});
  }catch(err){console.warn('[SKYBOUND] HDR sky unavailable, using procedural sky',err);tex=makeFallbackSky();sky.name='Procedural sky';}
  tex.mapping=THREE.EquirectangularReflectionMapping;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.generateMipmaps=false;
  analyseSky(tex);sky.texture=tex;
  return tex;
}
export function makeFallbackSky(){
  const W=512,H=256,data=new Float32Array(W*H*4);
  for(let r=0;r<H;r++)for(let c=0;c<W;c++){
    const el=(.5-(r+.5)/H)*Math.PI,i=(r*W+c)*4,t=Math.max(0,Math.sin(el));
    data[i]=lerp(.75,.22,Math.pow(t,.5))*1.4;data[i+1]=lerp(.85,.42,Math.pow(t,.5))*1.4;data[i+2]=lerp(1,.85,Math.pow(t,.5))*1.4;data[i+3]=1;
  }
  const phi=.8,el=.75,cc=Math.round((phi/(2*Math.PI)+.5)*W),rr=Math.round((.5-el/Math.PI)*H);
  for(let r=rr-2;r<=rr+2;r++)for(let c=cc-2;c<=cc+2;c++){const i=(r*W+c)*4;data[i]=data[i+1]=data[i+2]=800;}
  const t=new THREE.DataTexture(data,W,H,THREE.RGBAFormat,THREE.FloatType);t.flipY=true;t.needsUpdate=true;return t;
}
export function analyseSky(tex){
  // Physically based calibration from the HDR itself: integrate the sun disc and the
  // sky dome separately (radiance x solid angle), drive the sun light with the measured
  // solar irradiance and pick exposure from total horizontal illuminance.
  const {width:W,height:H,data}=tex.image;
  const half=data instanceof Uint16Array,ch=data.length/(W*H);
  const rd=(i)=>half?THREE.DataUtils.fromHalfFloat(data[i]):data[i];
  const lum=new Float32Array(W*H);
  let best=-1,bi=0,upSum=0,upN=0;const hz=[0,0,0];let hzN=0;const zen=[0,0,0];let zenN=0;
  const dPhi=2*Math.PI/W,dEl=Math.PI/H;
  for(let r=0;r<H;r++){
    const el=(.5-(r+.5)/H)*Math.PI;
    for(let c=0;c<W;c++){
      const i=(r*W+c)*ch,R=rd(i),G=rd(i+1),B=rd(i+2),L=.2126*R+.7152*G+.0722*B;lum[r*W+c]=L;
      if(el>0&&L>best){best=L;bi=r*W+c;}
      if(el>.05&&(c&1)===0){upSum+=Math.min(L,8);upN++;}
      if(el>.015&&el<.07&&(c&1)===0){hz[0]+=Math.min(R,6);hz[1]+=Math.min(G,6);hz[2]+=Math.min(B,6);hzN++;}
      if(el>1.0&&(c&1)===0){zen[0]+=Math.min(R,6);zen[1]+=Math.min(G,6);zen[2]+=Math.min(B,6);zenN++;}
    }
  }
  const avgUp=upSum/Math.max(1,upN);
  const sr=Math.floor(bi/W),sc=bi%W;
  const sEl=(.5-(sr+.5)/H)*Math.PI,sPhi=((sc+.5)/W-.5)*Math.PI*2;
  sky.sunDir.set(Math.cos(sPhi)*Math.cos(sEl),Math.sin(sEl),Math.sin(sPhi)*Math.cos(sEl)).normalize();
  const sunThresh=Math.max(avgUp*40,4);
  const hasSun=best>sunThresh;
  // Integrate sun disc (pixels above threshold within 8 degrees) and clamp them in an env copy.
  const env=half?new Uint16Array(data):new Float32Array(data);
  const clampVal=half?THREE.DataUtils.toHalfFloat(sunThresh):sunThresh;
  const sunE=[0,0,0];let skyE=0;const cosLim=Math.cos(8*DEG),d=new THREE.Vector3();
  for(let r=0;r<H;r++){
    const el=(.5-(r+.5)/H)*Math.PI,ce=Math.cos(el),dOmega=ce*dPhi*dEl;
    for(let c=0;c<W;c++){
      const k=r*W+c,L=lum[k];
      if(hasSun&&L>sunThresh){
        const ph=((c+.5)/W-.5)*Math.PI*2;d.set(Math.cos(ph)*ce,Math.sin(el),Math.sin(ph)*ce);
        if(d.dot(sky.sunDir)>cosLim){
          const i=k*ch,R=rd(i),G=rd(i+1),B=rd(i+2),s=sunThresh/L;
          sunE[0]+=(R-R*s)*dOmega;sunE[1]+=(G-G*s)*dOmega;sunE[2]+=(B-B*s)*dOmega;
          env[i]=half?THREE.DataUtils.toHalfFloat(R*s):R*s;env[i+1]=half?THREE.DataUtils.toHalfFloat(G*s):G*s;env[i+2]=half?THREE.DataUtils.toHalfFloat(B*s):B*s;
          if(el>0)skyE+=Math.min(L,sunThresh)*Math.sin(el)*dOmega;
          continue;
        }
      }
      if(el>0)skyE+=L*Math.sin(el)*dOmega;
    }
  }
  void clampVal;
  const envTex=new THREE.DataTexture(env,W,H,THREE.RGBAFormat,tex.type);envTex.flipY=tex.flipY;envTex.mapping=THREE.EquirectangularReflectionMapping;envTex.minFilter=THREE.LinearFilter;envTex.magFilter=THREE.LinearFilter;envTex.generateMipmaps=false;envTex.needsUpdate=true;
  sky.envSource=envTex;
  let sunLum=.2126*sunE[0]+.7152*sunE[1]+.0722*sunE[2];
  if(!hasSun||sunLum<skyE*.3){sky.sunDir.set(.35,.62,-.4).normalize();sunE[0]=sunE[1]=sunE[2]=skyE*.6;sunLum=skyE*.6;}
  const m=Math.max(sunE[0],sunE[1],sunE[2])||1;sky.sunColor.setRGB(sunE[0]/m,sunE[1]/m,sunE[2]/m,THREE.LinearSRGBColorSpace);
  sky.sunIntensity=sunLum/Math.max(.2126*sky.sunColor.r+.7152*sky.sunColor.g+.0722*sky.sunColor.b,1e-3);
  sky.horizon.setRGB(hz[0]/hzN,hz[1]/hzN,hz[2]/hzN,THREE.LinearSRGBColorSpace);
  sky.zenith.setRGB(zen[0]/Math.max(1,zenN),zen[1]/Math.max(1,zenN),zen[2]/Math.max(1,zenN),THREE.LinearSRGBColorSpace);
  const Etotal=sunLum*Math.max(sky.sunDir.y,.05)+skyE;
  sky.exposure=clamp(1.15*Math.PI/Math.max(Etotal,1e-3),.02,8);
  sky.avgUp=avgUp;sky.skyE=skyE;sky.sunE=sunLum;
  console.info('[SKYBOUND] Sky',SKY.id,'sun',sky.sunDir.toArray().map(v=>+v.toFixed(3)),'Esun',sunLum.toFixed(1),'Esky',skyE.toFixed(2),'exposure',sky.exposure.toFixed(3));
}
export function installAtmosphereShaderChunks(){
  // Height-based aerial perspective: exponential height fog with sun in-scattering,
  // plus a soft fade at the streamed-terrain view distance (fogDensity = metres).
  const s=sky.sunDir,c=sky.sunColor,f=(v)=>v.toFixed(5),hzL=Math.max(.05,(sky.horizon.r+sky.horizon.g+sky.horizon.b)/3)*1.6;
  const a=1/fx.visibility,b=1/1700;
  THREE.ShaderChunk.fog_pars_vertex='#ifdef USE_FOG\n varying vec3 vFogRay;\n#endif';
  THREE.ShaderChunk.fog_vertex='#ifdef USE_FOG\n vFogRay = transpose(mat3(viewMatrix)) * mvPosition.xyz;\n#endif';
  THREE.ShaderChunk.fog_pars_fragment=`#ifdef USE_FOG
  uniform vec3 fogColor; uniform float fogDensity; varying vec3 vFogRay;
  const vec3 ATMO_SUN_DIR = vec3(${f(s.x)},${f(s.y)},${f(s.z)});
  const vec3 ATMO_SUN_COL = vec3(${f(c.r)},${f(c.g)},${f(c.b)});
  vec3 atmoApply(vec3 col, vec3 ray){
    float d = length(ray); vec3 rd = ray / max(d, 1e-3);
    float ry = abs(rd.y) < 1e-4 ? 1e-4 : rd.y;
    float camY = max(cameraPosition.y, 0.0);
    float amt = (${f(a)} / ${f(b)}) * exp(-camY * ${f(b)}) * (1.0 - exp(-d * ry * ${f(b)})) / ry;
    amt = 1.0 - exp(-max(amt, 0.0));
    amt = max(amt, smoothstep(fogDensity * 0.6, fogDensity * 0.97, d));
    float sd = max(dot(rd, ATMO_SUN_DIR), 0.0);
    vec3 fc = fogColor + ATMO_SUN_COL * (pow(sd, 10.0) * 0.55 + pow(sd, 2.0) * 0.08);
    return mix(col, fc, amt);
  }
#endif`;
  THREE.ShaderChunk.fog_fragment='#ifdef USE_FOG\n gl_FragColor.rgb = atmoApply(gl_FragColor.rgb, vFogRay);\n#endif';
}

export function makeSkyDome(){
  const mat=new THREE.ShaderMaterial({
    uniforms:{tSky:{value:sky.texture},uFog:{value:sky.horizon},uSunDir:{value:sky.sunDir},uSunCol:{value:sky.sunColor}},
    vertexShader:`varying vec3 vDir; void main(){ vDir=position; vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.0); gl_Position=p; gl_Position.z=gl_Position.w*.99999; }`,
    fragmentShader:`uniform sampler2D tSky; uniform vec3 uFog; uniform vec3 uSunDir; uniform vec3 uSunCol; varying vec3 vDir;
      #include <common>
      void main(){ vec3 d=normalize(vDir);
        vec2 uv=vec2(atan(d.z,d.x)*RECIPROCAL_PI2+.5, asin(clamp(d.y,-1.,1.))*RECIPROCAL_PI+.5);
        vec3 c=texture2D(tSky,uv).rgb;
        float sd=max(dot(d,uSunDir),0.);
        vec3 fc=uFog+uSunCol*(pow(sd,10.)*.55+pow(sd,2.)*.08);
        c=mix(fc,c,smoothstep(-.04,.16,d.y));
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthWrite:false,depthTest:false,side:THREE.BackSide,fog:false
  });
  const m=new THREE.Mesh(new THREE.SphereGeometry(10,64,32),mat);m.frustumCulled=false;m.renderOrder=-1000;
  return m;
}
