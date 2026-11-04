// SKYBOUND · jet: the secret F-16 ("fly" cheat). Afterburner flame with shock diamonds and a
// heat-haze shimmer, nozzle glow, a vapour cone at Mach 1, and a full turbofan sound model:
// fan and turbine whine, compressor hiss, core roar, afterburner light-up, rumble and crackle,
// spool lag, cockpit muffling, front/rear directivity and a sonic boom.
import * as THREE from 'three';
import { aircraft, aircraftState, AIRCRAFT, state, shared } from './config.js';
import { clamp } from './util.js';
import { camera, plane, gradePass } from './engine.js';
const H1=new THREE.Vector3(),H2=new THREE.Vector3();
import { radioEvent } from './radio.js';

let fx=null;
// ---------------------------------------------------------------- flame shader
const flameVert=`
uniform float uLen;varying float vY;varying vec3 vN;varying vec3 vV;varying float vA;
void main(){vY=position.y/uLen+.5;vA=atan(position.x,position.z);vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`;
const flameFrag=`
uniform float uTime,uPower,uAB,uCore;uniform vec3 uHot,uMid,uTail;varying float vY;varying vec3 vN;varying vec3 vV;varying float vA;
float h(float n){return fract(sin(n)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=h(i.x+i.y*57.),b=h(i.x+1.+i.y*57.),c=h(i.x+(i.y+1.)*57.),d=h(i.x+1.+(i.y+1.)*57.);return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
void main(){
  float y=clamp(vY,0.,1.);
  float rim=pow(clamp(abs(dot(vN,vV)),0.,1.),uCore>.5?1.2:2.2);
  float body=pow(1.-y,uCore>.5?1.4:.9);
  // shock diamonds: standing bright bands in the core, strongest with reheat
  float dia=uCore>.5?pow(.5+.5*cos(y*30.),7.)*(1.-y)*uAB*1.6:0.;
  float flick=.82+.18*noise(vec2(vA*3.+uTime*9.,y*14.-uTime*38.));
  float tongue=smoothstep(1.,.55+.35*noise(vec2(vA*2.,uTime*6.)),y);
  vec3 col=mix(uHot,uMid,smoothstep(0.,.35,y));col=mix(col,uTail,smoothstep(.3,.95,y)*uAB);
  float I=(body*flick*tongue+dia)*rim*(uCore>.5?1.6:1.)*mix(.18*uPower,1.,uAB);
  gl_FragColor=vec4(col*I*2.2,1.);
}`;
function flameMat(core){
  return new THREE.ShaderMaterial({vertexShader:flameVert,fragmentShader:flameFrag,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    uniforms:{uTime:shared.time,uLen:{value:1},uPower:{value:0},uAB:{value:0},uCore:{value:core?1:0},
      uHot:{value:new THREE.Color(core?0xe8f2ff:0x6f8cff)},uMid:{value:new THREE.Color(core?0x5a7dff:0xff9a3a)},uTail:{value:new THREE.Color(core?0xffb347:0xff6a1a)}}});
}
function cone(r0,r1,mat){const g=new THREE.CylinderGeometry(r1,r0,1,40,30,true);const m=new THREE.Mesh(g,mat);m.rotation.x=Math.PI/2;m.frustumCulled=false;m.renderOrder=14;return m;}
// Attach the exhaust to the current aircraft (called after the F-16 model is built).
export function attachJetFx(group,V){
  detachJetFx();
  if(!V.jet)return;
  const n=new THREE.Group();n.position.set(...V.nozzle);group.add(n);
  const r=V.nozzleR||.5;
  const outer=cone(r*.95,r*.35,flameMat(false)),core=cone(r*.7,r*.12,flameMat(true));
  // nozzle glow and a light that paints the tail and the ground
  const glowTex=(()=>{const S=64,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d'),gr=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(255,200,140,.55)');gr.addColorStop(1,'rgba(255,120,40,0)');g.fillStyle=gr;g.fillRect(0,0,S,S);return new THREE.CanvasTexture(c);})();
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xffb070,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));glow.renderOrder=15;
  const light=new THREE.PointLight(0xff9a50,0,40,1.8);
  // vapour cone (Prandtl-Glauert) around the fuselage near Mach 1
  const vcMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
  const vapour=new THREE.Mesh(new THREE.ConeGeometry(V.vapourR||3.4,V.vapourL||6,48,1,true),vcMat);vapour.rotation.x=-Math.PI/2;vapour.position.set(0,V.vapourY||.4,V.vapourZ||-1);vapour.renderOrder=12;
  n.add(outer,core,glow,light);group.add(vapour);
  for(const o of [outer,core,glow,vapour])o.layers.set(0);
  fx={n,outer,core,glow,light,vapour,r,boomT:0,lastMach:0,gear:null};
  // Landing gear: the model carries an extended-gear mesh and a closed-doors mesh. Retracting
  // folds the gear up into the belly (scaled about its top), then the doors close over it.
  const model=group.userData.visualModel;let on=null,off=null,lamp=null;
  model.traverse(o=>{const nm=o.name||'';if(/landingOnLight/i.test(nm))lamp=o;else if(/landingOn/i.test(nm))on=o;else if(/landingOff/i.test(nm))off=o;});
  if(on&&off){fx.gear=splitGear(group,[on,lamp].filter(Boolean),off);off.visible=false;}
}
// Split the extended-gear mesh into nose and left/right main legs, each on a hinge pivot
// at the top of its strut (in aircraft space), so retraction is a real 3D fold.
function splitGear(group,nodes,off){
  const meshes=[];for(const n of nodes)n.traverse(o=>{if(o.isMesh)meshes.push(o);});
  group.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets={nose:[],left:[],right:[]},P=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  let zmin=1e9,zmax=-1e9;
  for(const m of meshes){const pos=m.geometry.attributes.position,toL=new THREE.Matrix4().multiplyMatrices(inv,m.matrixWorld);for(let i=0;i<pos.count;i++){P[0].fromBufferAttribute(pos,i).applyMatrix4(toL);zmin=Math.min(zmin,P[0].z);zmax=Math.max(zmax,P[0].z);}}
  const zCut=zmin+(zmax-zmin)*.45;
  for(const m of meshes){
    const g=m.geometry,pos=g.attributes.position,idx=g.index?g.index.array:[...Array(pos.count).keys()],toL=new THREE.Matrix4().multiplyMatrices(inv,m.matrixWorld);
    for(let t=0;t<idx.length;t+=3){
      for(let k=0;k<3;k++)P[k].fromBufferAttribute(pos,idx[t+k]).applyMatrix4(toL);
      const cx=(P[0].x+P[1].x+P[2].x)/3,cz=(P[0].z+P[1].z+P[2].z)/3;
      buckets[cz<zCut?'nose':cx<0?'left':'right'].push({m,t,toL,i:[idx[t],idx[t+1],idx[t+2]]});
    }
    m.visible=false;
  }
  const spec={nose:{rx:-Math.PI*.5,rz:0,delay:0},left:{rx:Math.PI*.47,rz:.5,delay:.12},right:{rx:Math.PI*.47,rz:-.5,delay:.12}};
  const legs=[];
  for(const [name,all] of Object.entries(buckets)){
    if(!all.length)continue;
    const box=new THREE.Box3(),Q=new THREE.Vector3(),N=new THREE.Vector3(),nm=new THREE.Matrix3();
    for(const tr of all)for(const vi of tr.i){Q.fromBufferAttribute(tr.m.geometry.attributes.position,vi).applyMatrix4(tr.toL);box.expandByPoint(Q);}
    const hinge=new THREE.Vector3((box.min.x+box.max.x)/2,box.max.y-.05,name==='nose'?box.min.z+(box.max.z-box.min.z)*.35:box.max.z-(box.max.z-box.min.z)*.3);
    const piv=new THREE.Group();piv.position.copy(hinge);group.add(piv);
    // one sub-mesh per source mesh (they differ in material and attribute layout)
    for(const src of new Set(all.map(t=>t.m))){
      const tris=all.filter(t=>t.m===src),ga=src.geometry.attributes,names=Object.keys(ga).filter(n=>n!=='tangent'),data={};for(const n of names)data[n]=[];
      for(const tr of tris){nm.getNormalMatrix(tr.toL);
        for(const vi of tr.i)for(const n of names){const at=ga[n];
          if(n==='position'){Q.fromBufferAttribute(at,vi).applyMatrix4(tr.toL).sub(hinge);data[n].push(Q.x,Q.y,Q.z);}
          else if(n==='normal'){N.fromBufferAttribute(at,vi).applyMatrix3(nm).normalize();data[n].push(N.x,N.y,N.z);}
          else for(let c=0;c<at.itemSize;c++)data[n].push(at.getComponent(vi,c));}}
      const geo=new THREE.BufferGeometry();for(const n of names)geo.setAttribute(n,new THREE.Float32BufferAttribute(data[n],ga[n].itemSize));geo.computeBoundingSphere();
      const mesh=new THREE.Mesh(geo,src.material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.layers.mask=src.layers.mask;piv.add(mesh);
    }
    legs.push({piv,...spec[name]});
  }
  return {legs,off,t:1,down:true};
}
const legEase=(t,d)=>{const x=Math.min(1,Math.max(0,(t-d)/(1-d)));return x*x*(3-2*x);};
export function gearDown(){return !fx?.gear||fx.gear.t>.98;}
export function detachJetFx(){if(gradePass?.uniforms.uHaze)gradePass.uniforms.uHaze.value=0;if(!fx)return;fx.n.parent?.remove(fx.n);fx.vapour.parent?.remove(fx.vapour);fx=null;}
export function updateJetFx(dt){
  if(!fx)return;
  const a=aircraft,p=state.crashed?0:a.engineRunning?clamp(a.enginePower,0,1):0,ab=state.crashed?0:a.abLevel||0;
  const outerL=(1.2+2.8*p)+8.5*ab,coreL=(.6+1.4*p)+4.2*ab;
  for(const [m,L] of [[fx.outer,outerL],[fx.core,coreL]]){m.scale.set(1,L,1);m.position.z=L/2;const u=m.material.uniforms;u.uLen.value=1;u.uPower.value=p;u.uAB.value=ab;m.visible=p>.02||ab>.02;}
  // heat haze in the grade pass: nozzle and plume end projected to the screen
  const g=gradePass?.uniforms;
  if(g){
    const A=fx.n.localToWorld(H1.set(0,0,0)),B=fx.n.localToWorld(H2.set(0,0,5+9*p+12*ab)),dist=camera.position.distanceTo(A);
    A.project(camera);B.project(camera);const vis=A.z<1&&B.z<1&&!state.crashed&&p>.1;
    g.uHaze.value=vis?(.35+.65*p+.8*ab)*(state.camera===1?0:1):0;g.uHazeA.value.set(A.x*.5+.5,A.y*.5+.5);g.uHazeB.value.set(B.x*.5+.5,B.y*.5+.5);
    g.uHazeR.value=clamp(fx.r*1.6/Math.max(dist,1)*.9,.004,.12);g.uAspect.value=innerWidth/innerHeight;
  }
  const flick=.85+.15*Math.random();
  fx.glow.scale.setScalar(fx.r*(2.2+1.5*p+3.5*ab)*flick);fx.glow.material.opacity=.25+.35*p+.4*ab;fx.glow.position.z=.15;
  fx.light.intensity=(3*p+70*ab)*flick;fx.light.color.setHSL(.07-.03*ab,1,.6);
  // automatic gear: up after a positive climb or when fast, down when low and slow
  const G=fx.gear;
  if(G){
    const kt=a.airspeed*1.94384,agl=a.altAGL;
    let want=G.down;
    if(agl<15||state.crashed)want=true;
    else if(G.down&&agl>40&&(a.verticalSpeed>2||kt>220))want=false;
    else if(!G.down&&agl<140&&kt<230&&a.verticalSpeed<1)want=true;
    if(want!==G.down){G.down=want;jetAudio.gear(want);}
    const tgt=G.down?1:0;G.t+=Math.sign(tgt-G.t)*Math.min(Math.abs(tgt-G.t),dt/2.2);
    // each leg swings on its hinge: nose folds aft, mains swing forward and in, then the doors close
    for(const L of G.legs){const k=1-legEase(G.t,L.delay);L.piv.rotation.set(L.rx*k,0,L.rz*k);L.piv.visible=G.t>.02;}
    G.off.visible=G.t<.06;
  }
  // vapour cone flickers in from Mach .95 to 1.02 and fades as the aircraft goes supersonic
  const m=a.mach||0,vc=clamp((m-.94)/.05,0,1)*clamp((1.08-m)/.05,0,1);
  fx.vapour.material.opacity=vc*(.28+.12*Math.random());fx.vapour.visible=vc>.01;
  if(fx.lastMach<1&&m>=1){jetAudio.boom();radioEvent('boom');}fx.lastMach=m;
}

// ---------------------------------------------------------------- turbofan sound
let A=null;
function buildAudio(){
  const ctx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
  const master=ctx.createGain();master.gain.value=0;
  const muffle=ctx.createBiquadFilter();muffle.type='lowpass';muffle.frequency.value=12000;muffle.Q.value=.5;
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-16;comp.ratio.value=3;
  master.connect(muffle);muffle.connect(comp);comp.connect(ctx.destination);
  const N=ctx.sampleRate*3,white=ctx.createBuffer(1,N,ctx.sampleRate),brown=ctx.createBuffer(1,N,ctx.sampleRate),w=white.getChannelData(0),b=brown.getChannelData(0);let x=0;
  for(let i=0;i<N;i++){w[i]=Math.random()*2-1;x=(x+.02*w[i])/1.02;b[i]=x*3.5;}
  const loop=(buf,type,f,q=.7)=>{const s=ctx.createBufferSource();s.buffer=buf;s.loop=true;const fl=ctx.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const g=ctx.createGain();g.gain.value=0;s.connect(fl);fl.connect(g);g.connect(master);s.start(0,Math.random()*2);return {fl,g};};
  // fan + turbine whine: blade-pass tones with a little wobble
  const whine=ctx.createGain();whine.gain.value=0;const wf=ctx.createBiquadFilter();wf.type='bandpass';wf.Q.value=3;whine.connect(wf);wf.connect(master);
  const tones=[1,1.52,2.04,3.1].map((m,i)=>{const o=ctx.createOscillator();o.type=i<2?'sawtooth':'sine';o.frequency.value=600*m;const g=ctx.createGain();g.gain.value=[.5,.25,.18,.08][i];o.connect(g);g.connect(whine);o.start();return {o,m};});
  const wob=ctx.createOscillator(),wd=ctx.createGain();wob.frequency.value=5.3;wd.gain.value=6;wob.connect(wd);for(const t of tones)wd.connect(t.o.frequency);wob.start();
  const hiss=loop(white,'highpass',4200,.4),roar=loop(brown,'lowpass',600,.5),rumble=loop(brown,'lowpass',110,.6),ab=loop(white,'bandpass',700,.35),abLow=loop(brown,'lowpass',260,.4);
  return {ctx,master,muffle,whine,wf,tones,hiss,roar,rumble,ab,abLow,rpm:0,abWas:0,crackT:0};
}
const set=(p,v,tc=.08)=>p.setTargetAtTime(v,A.ctx.currentTime,tc);
export const jetAudio={
  gear(down){if(!A)return;const c=A.ctx,t=c.currentTime;const o=c.createOscillator(),g=c.createGain();o.type='sawtooth';o.frequency.setValueAtTime(140,t);o.frequency.linearRampToValueAtTime(220,t+1.8);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.05,t+.15);g.gain.setValueAtTime(.05,t+1.7);g.gain.exponentialRampToValueAtTime(.0001,t+2.1);const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=900;o.connect(lp);lp.connect(g);g.connect(A.master);o.start(t);o.stop(t+2.2);burst(A,t+2.1,'lowpass',500,.35,.003,.25);},
  boom(){if(!A)return;const c=A.ctx,t=c.currentTime;for(const [dt,k] of [[0,1],[.18,.8]]){const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(70,t+dt);o.frequency.exponentialRampToValueAtTime(24,t+dt+.6);g.gain.setValueAtTime(.0001,t+dt);g.gain.exponentialRampToValueAtTime(.9*k,t+dt+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dt+.9);o.connect(g);g.connect(A.master);o.start(t+dt);o.stop(t+dt+1);
    burst(A,t+dt,'lowpass',1800,.8*k,.004,.7);}},
};
function burst(A,t,type,f,peak,a,d){const c=A.ctx,s=c.createBufferSource(),N=c.sampleRate*1.2,buf=c.createBuffer(1,N,c.sampleRate),x=buf.getChannelData(0);for(let i=0;i<N;i++)x[i]=Math.random()*2-1;s.buffer=buf;
  const fl=c.createBiquadFilter();fl.type=type;fl.frequency.value=f;const g=c.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);s.connect(fl);fl.connect(g);g.connect(A.master);s.start(t);s.stop(t+a+d+.05);}
export function isJet(){return !!AIRCRAFT[aircraftState.variant]?.jet;}
export function updateJetAudio(dt){
  const jet=isJet();
  if(!A){if(!jet||!state.started)return;try{A=buildAudio();}catch{return;}}
  if(A.ctx.state==='suspended'&&state.started&&!state.paused)A.ctx.resume().catch(()=>{});
  const a=aircraft,active=jet&&state.started&&!state.paused&&!state.crashed&&state.audioEnabled&&a.engineRunning;
  set(A.master.gain,active?state.audioVolume*.9:0,.12);
  if(!active)return;
  // spool: N1/N2 lag behind the throttle; idle ~ 0.62
  const target=.62+.38*clamp(a.enginePower,0,1);A.rpm+=(target-A.rpm)*(1-Math.exp(-dt*(target>A.rpm?.9:1.3)));
  const r=A.rpm,ab=a.abLevel||0,cockpit=state.camera===1;
  // where the listener is: in front hears the fan whine, behind hears the exhaust roar
  const fwd=new THREE.Vector3(0,0,-1).applyQuaternion(plane.quaternion),to=camera.position.clone().sub(a.position).normalize(),front=cockpit?.4:clamp(fwd.dot(to)*.5+.5,0,1),rear=1-front;
  const base=1150+r*r*3600;for(const t of A.tones)set(t.o.frequency,base*t.m,.15);set(A.wf.frequency,base*1.4,.15);
  set(A.whine.gain,(.012+.05*Math.pow(r,3))*(cockpit?.55:.4+.9*front),.12);
  set(A.hiss.g.gain,(.01+.06*Math.pow(r,4))*(cockpit?.35:.4+.6*front),.12);set(A.hiss.fl.frequency,3000+r*4000,.2);
  set(A.roar.g.gain,(.05+.32*Math.pow(r,3))*(cockpit?.6:.5+.8*rear),.12);set(A.roar.fl.frequency,300+r*1400+ab*1200,.2);
  set(A.rumble.g.gain,(.04+.18*Math.pow(r,2)+.5*ab)*(cockpit?.9:.6+.6*rear),.15);
  set(A.ab.g.gain,ab*(cockpit?.25:.45+.4*rear),.08);set(A.ab.fl.frequency,500+ab*900,.2);set(A.abLow.g.gain,ab*(cockpit?.5:.7),.08);
  set(A.muffle.frequency,cockpit?1500+ab*600:14000,.3);
  const c=A.ctx,t=c.currentTime;
  // afterburner light-up "whump" and its ragged crackle
  if(ab>.3&&A.abWas<=.3){burst(A,t,'lowpass',260,.9,.01,.9);burst(A,t+.02,'bandpass',900,.4,.005,.4);}
  A.abWas=ab;
  if(ab>.2){A.crackT-=dt;if(A.crackT<0){A.crackT=.008+Math.random()*.04;burst(A,t,'bandpass',600+Math.random()*2400,(.04+Math.random()*.1)*ab*(cockpit?.4:1),.001,.03+Math.random()*.05);}}
}
