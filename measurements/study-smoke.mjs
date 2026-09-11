import { chromium } from './browser-runtime.mjs';
import { writeFileSync } from 'node:fs';
const browser=await chromium.launch({channel:process.env.WARPED_BROWSER_CHANNEL||'msedge',headless:true});
try {
 const base=process.env.APP_URL||'http://127.0.0.1:8777/index.html?debug';
 const records=[];
 for(const mode of [null,'RUBBER','FLAMM']) {
  const url=new URL(base);if(mode)url.searchParams.set('studyModel',mode);
  const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url.href,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__warped);
  const before=await page.evaluate(()=>({model:window.__warped.state.model,disabled:document.getElementById('btn-toggle-model').disabled,shader:window.__warped.shaderMat.uniforms.uMode.value,note:document.getElementById('model-note').innerText}));
  await page.keyboard.press('c');
  const after=await page.evaluate(()=>window.__warped.state.model);
  if(mode) {
   if(before.model!==mode||after!==mode||!before.disabled||before.shader!==(mode==='FLAMM'?1:0))throw Error('Study lock failure');
   if(!before.note.includes(mode==='FLAMM'?'Flamm paraboloid':'Rubber-sheet')||!before.note.includes('모델을 전환할 수 없습니다'))throw Error('Study model note mismatch');
  } else if(before.disabled||after===before.model)throw Error('Normal switching failure');
  if(errors.length)throw Error(JSON.stringify(errors));
  records.push({mode:mode||'NORMAL',before,after,errors});
  await page.close();
 }
 writeFileSync(new URL('./results/study-smoke.json',import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),records,scope:'Functional study-condition checks only; no participant data'},null,2));
 console.log('PASS: normal switching and both fixed-model study pages.');
} finally {await browser.close();}
