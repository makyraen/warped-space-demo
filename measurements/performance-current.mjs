import { chromium } from './browser-runtime.mjs';
import { median, quantile } from './stats.mjs';
import { writeFileSync,readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
const channel=process.env.WARPED_BROWSER_CHANNEL||'msedge';
const rounds=Number(process.env.WARPED_ROUNDS||5),seconds=Number(process.env.WARPED_SAMPLE_SECONDS||3);
const counts=[1,3,5],conditions=['RUBBER','FLAMM'].flatMap(model=>counts.map(count=>({model,count})));
let seed=20260911;
const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/2**32;};
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const browser=await chromium.launch({channel,headless:true,args:['--disable-gpu-vsync','--disable-frame-rate-limit']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APP_URL||'http://127.0.0.1:8777/index.html?debug',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__warped?.advanceGeodesic);
 const env=await page.evaluate(()=>{
  const canvas=document.getElementById('webgl'),gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {userAgent:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',webgl:gl.getParameter(gl.VERSION),canvas:{width:canvas.width,height:canvas.height},dpr:devicePixelRatio};
 });
 console.log('Renderer:',env.renderer);
 const runs=[];
 for(let round=0;round<rounds;round++) {
  for(const {model,count} of shuffle(conditions)) {
   await page.evaluate(({model,count})=>{
    document.getElementById('btn-reset').click();
    const {state,createMass,massToScale}=window.__warped;
    if(state.model!==model)document.getElementById('btn-toggle-model').click();
    createMass({x:0,z:0},massToScale(100),100);
    for(let i=1;i<count;i++) {const a=2*Math.PI*(i-1)/(count-1);createMass({x:200*Math.cos(a),z:200*Math.sin(a)},massToScale(100),100,{lScale:1.12});}
   },{model,count});
   await page.waitForTimeout(1900);
   await page.evaluate(()=>{
    const {state,CONFIG,computeAcceleration,initGeodesic}=window.__warped;
    state.masses.forEach((m,i)=>{const a=i?2*Math.PI*(i-1)/(state.masses.length-1):0;m.mesh.position.set(i?200*Math.cos(a):0,m.mesh.position.y,i?200*Math.sin(a):0);m.growth=1;m.settling=false;m.velocity.set(0,0,0);m.geo=null;});
    state.masses.forEach((m,i)=>{if(!i)return;const a=2*Math.PI*(i-1)/(state.masses.length-1);if(state.model==='FLAMM'){m.presetLScale=1.12;initGeodesic(m,state.masses[0],5);}else{const f=computeAcceleration(i);const ar=-(f.ax*Math.cos(a)+f.az*Math.sin(a));const v=.95*Math.sqrt(Math.max(ar,0)*200);m.velocity.set(-Math.sin(a)*v,0,Math.cos(a)*v);}});
   });
   await page.waitForTimeout(400);
   const frames=await page.evaluate(seconds=>new Promise(resolve=>{
    const values=[];let previous=null,start=null;
    function tick(now){if(start===null)start=now;if(previous!==null)values.push(now-previous);previous=now;if(now-start<seconds*1000)requestAnimationFrame(tick);else resolve(values.filter(v=>v>0));}
    requestAnimationFrame(tick);
   }),seconds);
   const mean=frames.reduce((a,b)=>a+b,0)/frames.length;
   runs.push({round:round+1,model,count,meanFrameMs:mean,p50FrameMs:median(frames),p95FrameMs:quantile(frames,.95),frames});
   console.log(`Round ${round+1}/${rounds} ${model}/${count}: mean ${mean.toFixed(3)} ms`);
  }
 }
 const rows=conditions.map(({model,count})=>{
  const selected=runs.filter(r=>r.model===model&&r.count===count),means=selected.map(r=>r.meanFrameMs),all=selected.flatMap(r=>r.frames);
  return {model,count,medianOfRoundMeansMs:median(means),minimumRoundMeanMs:Math.min(...means),maximumRoundMeanMs:Math.max(...means),pooledP95FrameMs:quantile(all,.95),medianOfRoundP95Ms:median(selected.map(r=>r.p95FrameMs)),samples:all.length};
 });
 if(errors.length)throw Error(JSON.stringify(errors));
 const result={meta:{generatedAt:new Date().toISOString(),channel,headless:true,vsyncDisabled:true,rounds,seconds,seed:20260911,setup:'Central mass at origin, remaining masses on r=200; all masses=100; deterministic motion reset before each trial',cpu:os.cpus()[0]?.model,memoryBytes:os.totalmem(),platform:os.platform(),osRelease:os.release(),physicsSha256:createHash('sha256').update(readFileSync(new URL('../physics/geodesic.mjs',import.meta.url))).digest('hex'),quantiles:'Type 7 linear interpolation; pooled p95 uses all frames across rounds'},env,rows,runs,errors};
 writeFileSync(new URL('./results/performance-current.json',import.meta.url),JSON.stringify(result));
 console.log('Saved performance-current.json');
} finally {await browser.close();}
