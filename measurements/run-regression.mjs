import { spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const physicsSha256=createHash('sha256').update(readFileSync(new URL('../physics/geodesic.mjs',import.meta.url))).digest('hex');
for(const name of ['energy_drift','convergence','precession','mode_contrast']) {
 const script=new URL('./'+name+'.mjs',import.meta.url);
 console.log('Running',name);
 const result=spawnSync(process.execPath,[fileURLToPath(script)],{encoding:'utf8',env:process.env});
 if(result.status!==0){console.error(result.stdout,result.stderr);process.exit(result.status||1);}
 const target=new URL('./results/'+name+'.json',import.meta.url),data=JSON.parse(readFileSync(target,'utf8'));
 data.reproduction={generatedAt:new Date().toISOString(),physicsSha256,angularQuadrature:'trapezoid',browserChannel:process.env.WARPED_BROWSER_CHANNEL||'msedge'};
 writeFileSync(target,JSON.stringify(data,null,2));
 console.log(result.stdout.split('\n').filter(s=>/기울기|측정 세차|r 범위|최대 |RUBBER|FLAMM|저장|차이|비교/.test(s)).join('\n'));
}
