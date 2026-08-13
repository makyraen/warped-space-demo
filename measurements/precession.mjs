// §4.2 — 근일점 세차 측정 (GR 항 on/off)
//
// 목적: 측지선 적분기가 실제로 일반상대론적 궤도를 내는지 검증한다.
//
// 방법: 앱의 `geodesicRadialAccel()`이 계산하는
//         d²r/dτ² = −M/r² + L²/r³ − 3ML²/r⁴
//       에서 **마지막 항만 켜고 끈다.** 같은 M, 같은 L, 같은 초기 r에서 그 항의 유무만
//       다르므로 세차가 오직 그 항에서 나온다는 것을 분리해 보일 수 있다.
//       (앱의 RUBBER 모드와 비교하면 안 된다 — 단위계가 완전히 달라 사과-오렌지가 된다.)
//
//       하네스가 자체 구현한 가속도 함수는 GR 항을 켠 상태에서 앱 함수와 **일치함을 먼저 검증**한다.
//
// 세차각 이론값(약장 근사): Δφ = 6πM / (a(1−e²))
//       화면 스케일에서 M=10이면 2M/p가 0.08 수준이라 약장 근사 자체의 오차가 커진다.
//       따라서 ① 약장 조건(M=1)에서 이론값과 대조해 구현을 검증하고,
//              ② 데모 조건(M=10)에서는 미세 시간간격 참조적분과 대조한다.
//
// 실행: node measurements/precession.mjs   (앱이 127.0.0.1:8777에 떠 있어야 함)

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const APP_URL = 'http://127.0.0.1:8777/index.html?debug';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e.message)));
await page.goto(APP_URL, { waitUntil: 'load' });
await page.waitForTimeout(600);

const result = await page.evaluate(() => {
    const { CONFIG, geodesicRadialAccel } = window.__warped;

    // GR 항을 끌 수 있는 하네스판. includeGR=true면 앱 함수와 같아야 한다(아래에서 검증).
    function accel(r, L, M, includeGR) {
        const iR = 1 / r;
        let a = -M * iR * iR + L * L * iR * iR * iR;
        if (includeGR) a -= 3 * M * L * L * iR * iR * iR * iR;
        return a;
    }

    // ── 검증 0: 하네스 구현이 앱 함수와 일치하는가 ──
    const agreement = [[150, 49.8, 10], [220, 14.2, 1], [300, 30, 5]].map(([r, L, M]) => {
        const app = geodesicRadialAccel(r, L, M), harness = accel(r, L, M, true);
        return { r, L, M, app, harness, relDiff: Math.abs((harness - app) / app) };
    });

    // 앱의 updateGeodesicPhysics와 동일한 스텝 구조(leapfrog on r, φ는 갱신된 r로 구적)
    function integrate({ M, rPeri, kL, includeGR, dtau, orbits }) {
        const Lcirc = Math.sqrt(M * rPeri * rPeri / (rPeri - 3 * M));
        const L = Lcirc * kL;
        let r = rPeri, phi = 0, vr = 0, tau = 0;
        let rMin = r, rMax = r;
        // vr=0이고 L>L_circ이라 바깥으로 향한다 → 시작점이 근일점이다.
        const peri = [{ phi: 0, tau: 0 }];
        let pVr = vr, pPhi = phi, pTau = tau;
        const MAX = 6000000;
        for (let i = 0; i < MAX && peri.length < orbits + 1; i++) {
            vr += accel(r, L, M, includeGR) * dtau / 2;
            r += vr * dtau;
            phi += (L / (r * r)) * dtau;
            vr += accel(r, L, M, includeGR) * dtau / 2;
            tau += dtau;
            if (!Number.isFinite(r) || r <= 0) return { diverged: true, atStep: i };
            if (r < rMin) rMin = r;
            if (r > rMax) rMax = r;
            if (pVr < 0 && vr >= 0) {           // 근일점 통과: vr 부호가 −→+
                const f = pVr / (pVr - vr);      // 선형 보간으로 교차점 추정
                peri.push({ phi: pPhi + f * (phi - pPhi), tau: pTau + f * (tau - pTau) });
            }
            pVr = vr; pPhi = phi; pTau = tau;
        }
        if (peri.length < 2) return { insufficient: true, peri: peri.length, rMin, rMax };

        // 주기당 세차 = 연속한 근일점 방위각 차이 − 2π
        const perOrbit = [];
        for (let i = 1; i < peri.length; i++) perOrbit.push(peri[i].phi - peri[i - 1].phi - 2 * Math.PI);
        const mean = perOrbit.reduce((a, b) => a + b, 0) / perOrbit.length;
        const spread = Math.max(...perOrbit) - Math.min(...perOrbit);

        const a = (rMin + rMax) / 2;
        const e = (rMax - rMin) / (rMax + rMin);
        const p = a * (1 - e * e);                       // 반통경(semi-latus rectum)
        const theory = 6 * Math.PI * M / p;              // 약장 근사 이론값
        return {
            M, L, rPeri, kL, includeGR, dtau, orbits: perOrbit.length,
            rMin, rMax, a, e, p, weakFieldParam: 2 * M / p,
            precessionPerOrbit: mean, spreadAcrossOrbits: spread,
            theoryWeakField: theory,
            period: peri.length > 1 ? peri[1].tau - peri[0].tau : null,
        };
    }

    const dtauApp = CONFIG.physicsTimeStep * CONFIG.geodesicTimeScale;   // 앱과 동일

    return {
        meta: { dtauApp, physicsTimeStep: CONFIG.physicsTimeStep, geodesicTimeScale: CONFIG.geodesicTimeScale },
        agreement,
        // ① 약장 조건: 이론값과 대조해 구현 검증
        weakGR:    integrate({ M: 1, rPeri: 150, kL: 1.15, includeGR: true,  dtau: dtauApp, orbits: 8 }),
        weakNewton:integrate({ M: 1, rPeri: 150, kL: 1.15, includeGR: false, dtau: dtauApp, orbits: 8 }),
        weakFine:  integrate({ M: 1, rPeri: 150, kL: 1.15, includeGR: true,  dtau: dtauApp / 8, orbits: 8 }),
        // ② 데모 조건(M=10): 강한 세차. 이론값은 약장이라 벗어나므로 미세 스텝과 대조
        demoGR:    integrate({ M: 10, rPeri: 150, kL: 1.05, includeGR: true,  dtau: dtauApp, orbits: 6 }),
        demoNewton:integrate({ M: 10, rPeri: 150, kL: 1.05, includeGR: false, dtau: dtauApp, orbits: 6 }),
        demoFine:  integrate({ M: 10, rPeri: 150, kL: 1.05, includeGR: true,  dtau: dtauApp / 8, orbits: 6 }),
        // ③ M을 줄이며 약장 극한으로 보낸다. 이론값이 leading order이므로, 잔차가
        //    M/p에 비례해 0으로 수렴하면 그 차이는 고차항(=물리)이지 구현 오류가 아니다.
        mScaling: [1, 0.5, 0.25, 0.125].map(M =>
            integrate({ M, rPeri: 150, kL: 1.15, includeGR: true, dtau: dtauApp, orbits: 5 })),
    };
});

await browser.close();

const deg = (rad) => (rad * 180 / Math.PI);
function show(label, r) {
    if (!r || r.diverged) { console.log(`${label}: 발산`); return; }
    if (r.insufficient) { console.log(`${label}: 근일점 표본 부족`); return; }
    console.log(`${label}`);
    console.log(`   M=${r.M}  L=${r.L.toFixed(3)}  r=${r.rMin.toFixed(1)}~${r.rMax.toFixed(1)}  e=${r.e.toFixed(4)}  p=${r.p.toFixed(1)}  2M/p=${r.weakFieldParam.toFixed(4)}`);
    console.log(`   측정 세차/주기 = ${r.precessionPerOrbit.toExponential(4)} rad = ${deg(r.precessionPerOrbit).toFixed(4)}°   (주기간 편차 ${r.spreadAcrossOrbits.toExponential(2)})`);
    console.log(`   약장 이론값    = ${r.theoryWeakField.toExponential(4)} rad = ${deg(r.theoryWeakField).toFixed(4)}°`);
}

console.log('메타:', JSON.stringify(result.meta));
console.log('\n=== 검증 0: 하네스 가속도 == 앱 geodesicRadialAccel ===');
for (const a of result.agreement) console.log(`   r=${a.r} L=${a.L} M=${a.M}  상대차 ${a.relDiff.toExponential(2)}`);

console.log('\n=== ① 약장 조건 (M=1) — 이론값 대조로 구현 검증 ===');
show('GR 항 ON ', result.weakGR);
show('GR 항 OFF', result.weakNewton);
show('GR ON, dτ/8', result.weakFine);
if (result.weakGR?.precessionPerOrbit && result.weakGR?.theoryWeakField) {
    const err = Math.abs(result.weakGR.precessionPerOrbit - result.weakGR.theoryWeakField) / result.weakGR.theoryWeakField;
    console.log(`   → 이론값 대비 오차: ${(err * 100).toFixed(2)}%`);
}

console.log('\n=== ② 데모 조건 (M=10) — 실제 화면 스케일 ===');
show('GR 항 ON ', result.demoGR);
show('GR 항 OFF', result.demoNewton);
show('GR ON, dτ/8', result.demoFine);
if (result.demoGR?.precessionPerOrbit && result.demoFine?.precessionPerOrbit) {
    const err = Math.abs(result.demoGR.precessionPerOrbit - result.demoFine.precessionPerOrbit) / Math.abs(result.demoFine.precessionPerOrbit);
    console.log(`   → 미세 스텝(dτ/8) 대비 수렴 오차: ${(err * 100).toFixed(3)}%`);
}
console.log('\n=== ③ 약장 극한 수렴 (M을 줄이며) ===');
console.log('   잔차가 M/p에 비례해 줄면 = 고차항(물리). 상수로 남으면 = 구현 오류.');
console.log('   M       2M/p      측정(°)     이론(°)     상대오차    오차/(M/p)');
for (const r of result.mScaling) {
    if (!r || r.diverged || r.insufficient) { console.log('   (실패)'); continue; }
    const relErr = (r.precessionPerOrbit - r.theoryWeakField) / r.theoryWeakField;
    const MoverP = r.M / r.p;
    console.log(`   ${String(r.M).padEnd(7)} ${r.weakFieldParam.toFixed(5).padEnd(9)} ${deg(r.precessionPerOrbit).toFixed(4).padEnd(11)} ${deg(r.theoryWeakField).toFixed(4).padEnd(11)} ${(relErr * 100).toFixed(3).padStart(7)}%   ${(relErr / MoverP).toFixed(3)}`);
}

if (errs.length) console.log('\npageerrors:', JSON.stringify(errs));

mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL('./results/precession.json', import.meta.url), JSON.stringify(result, null, 1));
console.log('\n→ measurements/results/precession.json 에 원자료 저장');
