import { advanceGeodesic, geodesicEnergySquared } from '../physics/geodesic.mjs';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';

// Uniform proper-time steps; observations are shared across all refinements.
// The independent reference is evaluated in analyze-reference.py.
const h0 = 260 / 120;
const cycles = 6;
const p = 120;
const cases=[];
for(const M of [1,5,10]) for(const e of [0.1,0.3,0.6]) {
    const rp=p/(1+e), ra=p/(1-e);
    const L=Math.sqrt(M*p*p/(p-M*(3+e*e)));
    const E2=((p-2*M)**2-4*M*M*e*e)/(p*(p-M*(3+e*e)));
    // Composite Simpson only estimates the run duration; it is not the reference.
    const dtDchi=chi=>Math.pow(p,1.5)/Math.sqrt(M)*Math.sqrt(1-(3+e*e)*M/p)
        /((1+e*Math.cos(chi))**2*Math.sqrt(1-(6+2*e*Math.cos(chi))*M/p));
    const intervals=8192, dchi=2*Math.PI/intervals;
    let sum=0;
    for(let k=0;k<=intervals;k++)sum+=(k===0||k===intervals?1:k%2?4:2)*dtDchi(k*dchi);
    const periodEstimate=sum*dchi/3;
    const baseSteps=Math.ceil(cycles*periodEstimate/h0);
    const observationStride=Math.max(1,Math.floor(baseSteps/4096));
    const sampleSteps=[];
    for(let k=0;k<=baseSteps;k+=observationStride)sampleSteps.push(k);
    if(sampleSteps.at(-1)!==baseSteps)sampleSteps.push(baseSteps);
    const runs=[];
    for(const angleRule of ['right-endpoint','trapezoid']) for(const divisor of [1,2,4,8]) {
        const g={r:rp,vr:0,phi:0,L};
        const samples=[[rp,0]];
        let sampleIndex=1, maxEnergyRelative=0, minR=rp, maxR=rp;
        for(let k=1;k<=baseSteps*divisor;k++) {
            const boundary=advanceGeodesic(g,M,h0/divisor,{angleRule});
            if(boundary || !Number.isFinite(g.r) || g.r<=2.5*M || g.r>=340)throw Error('Invalid orbit domain');
            minR=Math.min(minR,g.r);maxR=Math.max(maxR,g.r);
            maxEnergyRelative=Math.max(maxEnergyRelative,Math.abs(geodesicEnergySquared(g,M)-E2)/E2);
            if(k===sampleSteps[sampleIndex]*divisor) {samples.push([g.r,g.phi]);sampleIndex++;}
        }
        runs.push({angleRule,divisor,h:h0/divisor,maxEnergyRelative,minR,maxR,samples});
    }
    cases.push({id:`M${M}-e${e}`,M,p,e,rp,ra,L,E2,periodEstimate,baseSteps,sampleSteps,runs});
    console.log(`Calculated M=${M}, e=${e}: ${sampleSteps.length} shared observation times`);
}
mkdirSync(new URL('./results/',import.meta.url),{recursive:true});
const moduleFile=new URL('../physics/geodesic.mjs',import.meta.url);
const meta={generatedAt:new Date().toISOString(),h0,cycles,observations:'Shared proper-time samples over at least six radial periods; extrema are sampled maxima.',node:process.version,platform:os.platform(),cpu:os.cpus()[0]?.model,physicsSha256:createHash('sha256').update(readFileSync(moduleFile)).digest('hex')};
writeFileSync(new URL('./results/reference-trajectories.json',import.meta.url),JSON.stringify({meta,cases}));
