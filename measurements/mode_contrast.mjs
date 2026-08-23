// §4.5 — 같은 화면 배치에서 두 모드가 만드는 궤적을 대조한다.
//
// ⚠️ 무엇을 비교하고 무엇을 비교하지 않는가
//   두 모드는 단위계가 다르다(뉴턴 모드는 gravityK·physicsSpeedScale 증폭과 소프트닝 ε를 쓴다).
//   따라서 에너지·각운동량 같은 물리량을 모드 간에 직접 비교하면 성립하지 않는다(§4.2 주의).
//   여기서 비교하는 것은 사용자가 실제로 보는 것, 즉 **화면 좌표계에서의 궤적 형상**이다:
//     · 근점/원점 반경과 그 비          · 반경 진동 주기
//     · 근점의 주기당 방위각 이동(세차)  · 궤도가 닫히는가
//
// 측정 방식: 앱의 updateMassPhysics()를 고정 간격으로 **동기 구동**한다(rAF 비의존).
//            물리를 다시 구현하지 않는다 — 스텝을 밟는 주체만 측정 코드다.
//
// 실행: 앱을 127.0.0.1:8777에 띄운 뒤  node measurements/mode_contrast.mjs

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const OUT = fileURLToPath(new URL('./results/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const SECONDS = 120;                // 시뮬레이션 시간(고정 스텝 기준)
const R0 = 200;                     // 위성 배치 반경 = CONFIG.presetRadius
const CENTER_MASS = 100, SAT_MASS = 100;
// 두 모드에 같은 이심률 조건을 준다: 각 모드의 **자기 원궤도 값의 K배**.
// K<1이므로 배치 반경 R0가 원점(apoapsis)이 되고 궤도는 안쪽으로 돈다 →
// 경계(massLimit=340)에 닿지 않는다. K를 공유하는 것이 "동일 조건"의 정의다.
const K = 0.85;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e.message)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://127.0.0.1:8777/index.html?debug', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__warped, null, { timeout: 20000 });
await page.waitForTimeout(500);

async function run(model, epsOverride) {
    // 1) 초기화 → 모델 설정 → 중심 + 위성 1개를 결정론적으로 배치
    await page.evaluate(() => document.getElementById('btn-reset').click());
    await page.waitForTimeout(400);
    await page.evaluate((m) => {
        if (window.__warped.state.model !== m) document.getElementById('btn-toggle-model').click();
    }, model);
    await page.evaluate(({ r0, cm, sm }) => {
        const { createMass, massToScale } = window.__warped;
        createMass({ x: 0, z: 0 }, massToScale(cm), cm);
        createMass({ x: r0, z: 0 }, massToScale(sm), sm);
    }, { r0: R0, cm: CENTER_MASS, sm: SAT_MASS });

    // 생성 트윈(팝 0.45s · growth 1.4s)이 끝나 settling이 풀릴 때까지 실시간 대기
    await page.waitForTimeout(2200);

    // 2) 위성을 규범 초기조건으로 되돌린 뒤 동기 구동
    //    - 두 모드 모두 화면상 같은 지점(R0, 0)에서 출발한다.
    //    - 초기 속도/각운동량은 각 모드가 자기 방식으로 합성한다. 그 합성 자체가 모델 차이의 일부다.
    return await page.evaluate(({ r0, seconds, k, epsOverride }) => {
        const W = window.__warped;
        const { state, CONFIG, updateMassPhysics } = W;
        const sat = state.masses[1], center = state.masses[0];
        // 소프트닝을 바꿔가며 뉴턴 모드의 세차가 ε에서 오는 것인지 확인한다(§4.2와 같은 방식의 통제).
        const epsSaved = CONFIG.epsilon;
        if (epsOverride != null) CONFIG.epsilon = epsOverride;

        sat.mesh.position.set(r0, sat.mesh.position.y, 0);
        let ic;
        if (state.model === 'FLAMM') {
            const M = center.mass * center.growth * CONFIG.massToM;
            const rs = Math.max(r0, CONFIG.geodesicMinRFactor * M);
            const Lcirc = Math.sqrt(M * rs * rs / (rs - 3 * M));
            sat.geo = { r: r0, phi: 0, vr: 0, L: Lcirc * k };   // 원궤도 각운동량의 k배
            ic = { Lcirc: +Lcirc.toFixed(4), L: +(Lcirc * k).toFixed(4), M: +M.toFixed(4) };
        } else {
            // 뉴턴 모드: 이 배치에서의 실제 합력으로부터 원궤도 속도를 되짚고 그 k배를 준다
            const a = W.computeAcceleration(1);
            const ar = -(a.ax * (sat.mesh.position.x / r0) + a.az * (sat.mesh.position.z / r0));
            const vc = Math.sqrt(Math.max(ar, 0) * r0);
            sat.velocity.set(0, 0, vc * k);                    // (r0,0)에서의 접선 방향
            ic = { vCirc: +vc.toFixed(4), v: +(vc * k).toFixed(4) };
        }

        const dt = CONFIG.physicsTimeStep;
        const steps = Math.round(seconds / dt);
        const rs = [], phis = [], ts = [];
        let hitWall = false;
        for (let i = 0; i < steps; i++) {
            updateMassPhysics(dt);
            const x = sat.mesh.position.x - center.mesh.position.x;
            const z = sat.mesh.position.z - center.mesh.position.z;
            const rr = Math.hypot(x, z);
            if (rr >= CONFIG.massLimit - 0.5) hitWall = true;
            rs.push(rr); phis.push(Math.atan2(z, x)); ts.push((i + 1) * dt);
        }
        const eps = CONFIG.epsilon;
        CONFIG.epsilon = epsSaved;
        return { model: state.model, dt, steps, rs, phis, ts, hitWall, ic, eps, massLimit: CONFIG.massLimit };
    }, { r0: R0, seconds: SECONDS, k: K, epsOverride });
}

// ── 형상 지표 ──────────────────────────────────────────────
function unwrap(phis) {
    const out = [phis[0]]; let acc = phis[0];
    for (let i = 1; i < phis.length; i++) {
        let d = phis[i] - phis[i - 1];
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        acc += d; out.push(acc);
    }
    return out;
}
// 근점: r이 감소→증가로 바뀌는 지점을 포물선 보간으로 정밀화
function apsides(rs, phiU, ts, sign) {
    const out = [];
    for (let i = 1; i < rs.length - 1; i++) {
        const a = rs[i - 1], b = rs[i], c = rs[i + 1];
        const isExt = sign > 0 ? (b < a && b <= c) : (b > a && b >= c);
        if (!isExt) continue;
        const den = a - 2 * b + c;
        const off = den !== 0 ? 0.5 * (a - c) / den : 0;      // [-0.5, 0.5]
        const lerp = (arr) => arr[i] + off * (off > 0 ? arr[i + 1] - arr[i] : arr[i] - arr[i - 1]);
        out.push({ r: b - 0.25 * (a - c) * off, phi: lerp(phiU), t: lerp(ts) });
    }
    return out;
}
function metrics(run) {
    const phiU = unwrap(run.phis);
    const peri = apsides(run.rs, phiU, run.ts, +1);
    const apo = apsides(run.rs, phiU, run.ts, -1);
    const D = 180 / Math.PI;
    const advances = [], periods = [];
    for (let i = 1; i < peri.length; i++) {
        advances.push((peri[i].phi - peri[i - 1].phi - 2 * Math.PI) * D);
        periods.push(peri[i].t - peri[i - 1].t);
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
    const rMin = Math.min(...run.rs), rMax = Math.max(...run.rs);
    return {
        model: run.model, epsilon: run.eps, initialConditions: run.ic, hitBoundary: run.hitWall,
        rMin: +rMin.toFixed(2), rMax: +rMax.toFixed(2),
        radialExcursion: +((rMax - rMin) / (rMax + rMin)).toFixed(4),
        radialPeriod: +mean(periods).toFixed(3),
        periapsisCount: peri.length, apoapsisCount: apo.length,
        precessionPerRadialPeriodDeg: +mean(advances).toFixed(4),
        precessionSpreadDeg: advances.length > 1
            ? +(Math.max(...advances) - Math.min(...advances)).toFixed(5) : null,
        closed: Math.abs(mean(advances)) < 1.0,          // 주기당 1° 미만이면 사실상 닫힘
        firstPeriapsisPhiDeg: peri.length ? +(peri[0].phi * D).toFixed(2) : null,
    };
}

const out = {};
for (const m of ['RUBBER', 'FLAMM']) {
    const r = await run(m);
    out[m] = { raw: { dt: r.dt, steps: r.steps, seconds: SECONDS }, ...metrics(r) };
    // 궤적은 그림용으로 100분의 1로 솎아 저장
    out[m].track = r.rs.map((v, i) => (i % 100 === 0
        ? { t: +r.ts[i].toFixed(2), r: +v.toFixed(2), phi: +r.phis[i].toFixed(4) } : null)).filter(Boolean);
    const o = out[m];
    console.log(`\n== ${m}`);
    console.log(`   r 범위        : ${o.rMin} ~ ${o.rMax}   (진폭비 ${o.radialExcursion})`);
    console.log(`   반경 진동 주기: ${o.radialPeriod}   근점 ${o.periapsisCount}회`);
    console.log(`   주기당 세차   : ${o.precessionPerRadialPeriodDeg}°  (편차 ${o.precessionSpreadDeg}°)`);
    console.log(`   궤도 닫힘     : ${o.closed}${o.hitBoundary ? '   ⚠️ 경계 접촉' : ''}`);
    console.log(`   초기조건      : ${JSON.stringify(o.initialConditions)}`);
}

console.log('\n== 소프트닝 통제 (뉴턴 모드)');
// ── 통제: 뉴턴 모드의 세차가 소프트닝 ε에서 오는가 ──────────────
// 소프트닝된 퍼텐셜 −Gm/√(r²+ε²)는 1/r가 아니므로 닫힌 타원을 주지 않는다.
// ε를 줄여 세차가 0으로 가는지 확인하면, 이 세차의 원인이 ε임을 분리할 수 있다.
const sweep = [];
for (const e of [80, 40, 20, 10, 5, 2]) {
    const r = await run('RUBBER', e);
    const m = metrics(r);
    sweep.push({ epsilon: e, precessionDeg: m.precessionPerRadialPeriodDeg,
                 rMin: m.rMin, rMax: m.rMax, radialPeriod: m.radialPeriod });
    console.log(`   ε=${String(e).padStart(2)} → 세차 ${m.precessionPerRadialPeriodDeg}°  (r ${m.rMin}~${m.rMax})`);
}
out.rubberEpsilonSweep = sweep;

writeFileSync(OUT + 'mode_contrast.json', JSON.stringify({ meta: { SECONDS, R0, CENTER_MASS, SAT_MASS, K }, ...out }, null, 1));
console.log(`\n→ ${OUT}mode_contrast.json`);
console.log('콘솔 에러:', errs.length, errs.slice(0, 3));
await browser.close();
