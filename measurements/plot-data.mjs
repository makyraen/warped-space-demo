import { advanceGeodesic } from '../physics/geodesic.mjs';
import { readFileSync,writeFileSync } from 'node:fs';
const source=JSON.parse(readFileSync(new URL('./results/precession.json',import.meta.url),'utf8'));
const out={M:source.demoGR.M,L:source.demoGR.L,rPeri:source.demoGR.rPeri,curves:[]};
for(const includeGR of [true,false]) {
 const meta=includeGR?source.demoGR:source.demoNewton;
 const g={r:meta.rPeri,vr:0,phi:0,L:meta.L},dt=meta.dtau;
 const samples=[[g.r,0]];const count=Math.ceil(meta.period*(includeGR?4:1)/dt);
 for(let i=0;i<count;i++) {
  if(includeGR)advanceGeodesic(g,meta.M,dt);
  else {
   const accel=r=>-meta.M/(r*r)+g.L*g.L/(r*r*r),before=g.r;
   g.vr+=accel(g.r)*dt/2;g.r+=g.vr*dt;
   g.phi+=dt*g.L*(1/(before*before)+1/(g.r*g.r))/2;
   g.vr+=accel(g.r)*dt/2;
  }
  if(i%4===0||i===count-1)samples.push([g.r,g.phi]);
 }
 out.curves.push({includeGR,samples});
}
writeFileSync(new URL('./results/orbit-plot-data.json',import.meta.url),JSON.stringify(out));
