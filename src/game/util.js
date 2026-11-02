// SKYBOUND · util
export const $ = (id)=>document.getElementById(id);
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const lerp=(a,b,t)=>a+(b-a)*t;
export const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
export const wrapAngle=(a)=>{while(a>Math.PI)a-=Math.PI*2;while(a< -Math.PI)a+=Math.PI*2;return a};
export const DEG=Math.PI/180, FT_PER_M=3.28084, KTS_PER_MS=1.94384;
