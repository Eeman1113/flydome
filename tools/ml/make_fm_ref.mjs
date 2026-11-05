// Reference trajectories from the JS flight model, checked against tools/ml/fm.py on Colab.
import { stepFM, newState, DEFAULT_PARAMS } from '../../src/game/flightModel.js';
import { writeFileSync } from 'node:fs';
const cases=[
  {name:'skylane',P:{...DEFAULT_PARAMS},wind:[0,0]},
  {name:'forgiving_wind',P:{...DEFAULT_PARAMS,stall:false,forgiving:true},wind:[3,-2]},
  {name:'f16',P:{...DEFAULT_PARAMS,rollRate:220,pitchRate:50,thrust:4,cdMul:.7,ab:1.6,jet:true},wind:[0,0]},
  {name:'caravan_xwind',P:{...DEFAULT_PARAMS,thrust:1.3},wind:[5,1]},
];
const out=[];
for(const C of cases){
  const s=newState(0,1.35,0,0),E={ground:()=>0,paved:(x,z)=>Math.abs(x)<22&&Math.abs(z)<650,wind:C.wind,contact:1.35},rec=[];
  for(let i=0;i<2400;i++){const t=i/60;
    const kt=s.airspeed*1.944,c={pitch:t<12?0:(s.pitch<.12?.5:0)*(t<25?1:0)+(t>=25?Math.max(-1,Math.min(1,(.1+.06*Math.sin(t*.6)-s.pitch)*5)):0),roll:t<25?0:.45*Math.sin(t*.31)-s.roll*.6,yaw:.15*Math.sin(t*1.3),throttle:t<35?1:.7+.25*Math.sin(t*.21)};
    stepFM(s,c,C.P,E,1/60);if(i%30===29)rec.push([s.x,s.y,s.z,s.vx,s.vy,s.vz,s.pitch,s.yaw,s.roll,s.power,s.crashed?1:0]);}
  out.push({name:C.name,P:C.P,wind:C.wind,rec});
}
writeFileSync(new URL('./fm_ref.json',import.meta.url),JSON.stringify(out));
console.log(out.map(o=>`${o.name}: end alt ${o.rec.at(-1)[1].toFixed(1)} crashed ${o.rec.at(-1)[10]}`).join('\n'));
