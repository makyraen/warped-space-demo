import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { median, quantile } from './stats.mjs';
import { advanceGeodesic } from '../physics/geodesic.mjs';
const read=name=>JSON.parse(readFileSync(new URL('./results/'+name,import.meta.url),'utf8'));
assert.equal(median([4,1,3,2]),2.5);
assert.equal(quantile([4,1,3,2],.5),2.5);
const sha=createHash('sha256').update(readFileSync(new URL('../physics/geodesic.mjs',import.meta.url))).digest('hex');
const reference=read('reference-validation.json');
assert.equal(reference.meta.physicsSha256,sha);
assert.equal(reference.cases.length,9);
for(const c of reference.cases){
 assert.ok(c.orders['right-endpoint']>.98&&c.orders['right-endpoint']<1.02);
 assert.ok(c.orders.trapezoid>1.95&&c.orders.trapezoid<2.05);
 const fine=c.runs.find(r=>r.angleRule==='trapezoid'&&r.divisor===8);
 assert.ok(c.referenceRefinementMaxPositionOverP<fine.maxPositionErrorOverP/1000);
 for(const r of c.runs)assert.ok(r.minR>2.5*c.M&&r.maxR<340);
}
// Analytic circular orbit: r and angular velocity are constant.
const M=5,r=120,L=Math.sqrt(M*r*r/(r-3*M)),h=260/120,g={r,vr:0,phi:0,L};
for(let i=0;i<1000;i++)advanceGeodesic(g,M,h);
assert.ok(Math.abs(g.r-r)<1e-9);
assert.ok(Math.abs(g.phi-1000*h*L/(r*r))<1e-10);
// Without boundaries the symmetric step should reverse to its initial state.
const orbit={r:100,vr:.03,phi:.4,L:30},initial={...orbit};
for(let i=0;i<100;i++)advanceGeodesic(orbit,5,.25);
for(let i=0;i<100;i++)advanceGeodesic(orbit,5,-.25);
for(const k of ['r','vr','phi'])assert.ok(Math.abs(orbit[k]-initial[k])<1e-10);
const smoke=read('app-smoke.json');assert.equal(smoke.discrepancy,0);assert.equal(smoke.coordinateError,0);assert.equal(smoke.errors.length,0);
const perf=read('performance-current.json');assert.equal(perf.meta.physicsSha256,sha);assert.equal(perf.errors.length,0);
for(const row of perf.rows){
 const runs=perf.runs.filter(r=>r.model===row.model&&r.count===row.count);
 assert.equal(runs.length,5);
 assert.equal(median(runs.map(r=>r.meanFrameMs)),row.medianOfRoundMeansMs);
 assert.equal(quantile(runs.flatMap(r=>r.frames),.95),row.pooledP95FrameMs);
}
for(const name of ['energy_drift','convergence','precession','mode_contrast'])assert.equal(read(name+'.json').reproduction.physicsSha256,sha);
const dataOnly=process.argv.includes('--data-only');
if(!dataOnly){
const paper=readFileSync(new URL('../paper/manuscript.md',import.meta.url),'utf8');
for(const m of paper.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g))assert.ok(existsSync(new URL('../paper/'+m[1],import.meta.url)),'Missing '+m[1]);
assert.equal((paper.match(/^\[\d+\]/gm)||[]).length,15);
assert.ok(paper.includes('20.1–379.6'));
assert.ok(paper.includes('2.79–3.01'));
assert.ok(paper.includes('17.33'));
assert.ok(!/\*\*그림 8\./.test(paper));
}
console.log('PASS: independent reference, analytical circular orbit, reversibility, app linkage, raw-frame statistics, shared-source hashes, '+(dataOnly?'data-only checks.':'paper figures and headline values.'));
