import { chromium } from './browser-runtime.mjs';
import { advanceGeodesic } from '../physics/geodesic.mjs';
import { writeFileSync } from 'node:fs';
const browser=await chromium.launch({channel:process.env.WARPED_BROWSER_CHANNEL||'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APP_URL||'http://127.0.0.1:8777/index.html?debug',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__warped?.advanceGeodesic);
 const result=await page.evaluate(()=>{
  const {state,CONFIG,createMass,updateMassPhysics}=window.__warped;
  createMass({x:0,z:0},25,100);createMass({x:150,z:0},9,20);
  for(const obj of state.masses){obj.growth=1;obj.settling=false;obj.velocity.set(0,0,0);}
  state.model='FLAMM';
  const M=5,L=Math.sqrt(M*150*150/(150-3*M))*1.1;
  const initial={r:150,vr:0,phi:0,L};state.masses[1].geo={...initial};
  for(let i=0;i<32;i++)updateMassPhysics(CONFIG.physicsTimeStep);
  const gl=document.getElementById('webgl').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {initial,M,dtau:CONFIG.physicsTimeStep*CONFIG.geodesicTimeScale,steps:32,actual:{...state.masses[1].geo},position:{x:state.masses[1].mesh.position.x,z:state.masses[1].mesh.position.z},renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,userAgent:navigator.userAgent};
 });
 const expected={...result.initial};for(let i=0;i<result.steps;i++)advanceGeodesic(expected,result.M,result.dtau);
 const discrepancy=Math.max(...['r','vr','phi','L'].map(k=>Math.abs(result.actual[k]-expected[k])));
 if(discrepancy>1e-12||errors.length)throw Error(JSON.stringify({discrepancy,errors}));
 const coordinateError=Math.hypot(result.position.x-expected.r*Math.cos(expected.phi),result.position.z-expected.r*Math.sin(expected.phi));
 if(coordinateError>1e-12)throw Error('Projection mismatch');
 writeFileSync(new URL('./results/app-smoke.json',import.meta.url),JSON.stringify({...result,expected,discrepancy,coordinateError,errors},null,2));
 console.log(JSON.stringify({renderer:result.renderer,discrepancy,coordinateError,errors}));
} finally {await browser.close();}
