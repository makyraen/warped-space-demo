// §4.1 — 적분기 에너지 표류 측정 (semi-implicit Euler vs leapfrog)
//
// 목적: 논문 §IV의 "적분기 안정성" 수치를 재현 가능하게 뽑는다.
//
// 방법: 힘 계산은 앱의 실제 함수(computeAcceleration)를 그대로 쓰고, **스텝을 밟는 방식만**
//       바꿔 비교한다. 비교 대상이 적분 스킴이므로 이것이 올바른 통제다.
//       측정은 하나의 동기 evaluate 안에서 수행하므로 rAF 루프가 끼어들지 않는다.
//
// ⚠️ 확인하려는 것: 원본 코드의 Euler는 "모든 속도 갱신 → 모든 위치 갱신" 순서로
//    semi-implicit(symplectic) Euler다. 고정 Δt에서는 심플렉틱 적분기라 에너지가 발산하지
//    않고 유계 진동해야 한다. 따라서 "Euler라서 붕괴한다"는 통념 대신, **가변 Δt가 원인인지**를
//    함께 가른다(고정 Δt / 지터 Δt 두 조건).
//
// 실행: node measurements/energy_drift.mjs   (앱이 127.0.0.1:8777에 떠 있어야 함)

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const APP_URL = 'http://127.0.0.1:8777/index.html?debug';   // 전역 URL 생성자를 가리지 않도록 이름 구분

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e.message)));
await page.goto(APP_URL, { waitUntil: 'load' });
await page.waitForTimeout(600);

const result = await page.evaluate(() => {
    const { state, CONFIG, computeAcceleration, createMass } = window.__warped;
    const Geff = CONFIG.gravityK * CONFIG.physicsSpeedScale;   // 실효 중력상수
    const eps = CONFIG.epsilon;                                 // Plummer 소프트닝

    // ── 2체 구성: 중심 질량 고정(앱과 동일), 위성 하나 ──
    const M0 = 200, M1 = 20;
    createMass({ x: 0, z: 0 }, 45, M0);
    createMass({ x: 250, z: 0 }, 9, M1);
    const c = state.masses[0], s = state.masses[1];
    for (const m of [c, s]) { m.growth = 1; m.settling = false; m.geo = null; }

    // 결정론적 초기조건(기본 스폰 경로는 난수를 쓰므로 반드시 덮어쓴다)
    const R0 = 250, VT = 40;   // 원궤도 속도(약 85)보다 한참 낮게 → 이심 궤도, 근접 통과 반복
    function reset() {
        c.mesh.position.set(0, 0, 0); c.velocity.set(0, 0, 0);
        s.mesh.position.set(R0, 0, 0); s.velocity.set(0, 0, VT);
    }

    // 위성의 역학적 에너지. 중심이 고정이므로 정적 퍼텐셜 → 보존량으로 잘 정의된다.
    // 소프트닝된 힘 a = Geff·m0·d/(r²+ε²)^{3/2} 에 대응하는 퍼텐셜은 −Geff·m0/√(r²+ε²).
    function energy() {
        const dx = s.mesh.position.x - c.mesh.position.x;
        const dz = s.mesh.position.z - c.mesh.position.z;
        const r = Math.hypot(dx, dz);
        const v2 = s.velocity.x ** 2 + s.velocity.z ** 2;
        return { E: 0.5 * M1 * v2 - Geff * M0 * M1 / Math.sqrt(r * r + eps * eps), r };
    }

    // semi-implicit Euler: 현재 위치의 힘으로 속도를 먼저 갱신하고, 그 속도로 위치를 옮긴다.
    function stepEuler(dt) {
        const a = computeAcceleration(1);
        s.velocity.x += a.ax * dt; s.velocity.z += a.az * dt;
        s.mesh.position.x += s.velocity.x * dt; s.mesh.position.z += s.velocity.z * dt;
    }
    // leapfrog(kick–drift–kick)
    function stepLeapfrog(dt) {
        let a = computeAcceleration(1);
        s.velocity.x += a.ax * dt / 2; s.velocity.z += a.az * dt / 2;
        s.mesh.position.x += s.velocity.x * dt; s.mesh.position.z += s.velocity.z * dt;
        a = computeAcceleration(1);
        s.velocity.x += a.ax * dt / 2; s.velocity.z += a.az * dt / 2;
    }

    // 재현 가능한 지터용 난수(선형 합동)
    function makeRng(seed) {
        let x = seed >>> 0;
        return () => (x = (1103515245 * x + 12345) >>> 0) / 4294967296;
    }

    function run(stepFn, dtBase, steps, jitter) {
        reset();
        const rng = makeRng(12345);
        const E0 = energy().E;
        let maxRel = 0, rMin = Infinity, rMax = 0;
        const series = [];
        let t = 0;
        for (let i = 0; i < steps; i++) {
            // 지터: 평균은 같게 유지하되 스텝마다 ±50% 흔든다(프레임 간격 변동 모사)
            const dt = jitter ? dtBase * (0.5 + rng()) : dtBase;
            stepFn(dt);
            t += dt;
            const { E, r } = energy();
            if (!Number.isFinite(E) || !Number.isFinite(r)) {
                return { diverged: true, atStep: i, E0, maxRel, rMin, rMax, series };
            }
            const rel = Math.abs((E - E0) / E0);
            if (rel > maxRel) maxRel = rel;
            if (r < rMin) rMin = r;
            if (r > rMax) rMax = r;
            // rel은 유효숫자로 남긴다. 예전에는 toFixed(8)로 소수점 8자리에 맞춰 반올림했는데,
            // leapfrog의 rel이 10⁻⁶~10⁻⁸ 대라 양자화가 신호에 비해 컸다 — 아래 기울기가 이
            // 시계열에서 계산되므로 반올림이 곧 결과에 섞였고, 로그 축에 올리면 값이 0으로
            // 뭉개진 지점이 바닥에 닿는 것처럼 보였다. 표본 간격도 200 → 50스텝으로 좁혀
            // 궤도당 표본이 진동을 제대로 담게 했다(궤도당 약 6점 → 약 24점).
            if (i % 50 === 0) series.push({ t: +t.toFixed(3), rel: +rel.toPrecision(6), r: +r.toFixed(2) });
        }
        // 세속 표류(추세) 추정: rel 시계열의 최소제곱 기울기
        const n = series.length;
        const mt = series.reduce((a, p) => a + p.t, 0) / n;
        const mr = series.reduce((a, p) => a + p.rel, 0) / n;
        let num = 0, den = 0;
        for (const p of series) { num += (p.t - mt) * (p.rel - mr); den += (p.t - mt) ** 2; }
        return { diverged: false, E0, maxRel, rMin, rMax, slopePerUnitTime: num / den, series };
    }

    const dt = CONFIG.physicsTimeStep;      // 앱과 동일한 1/120
    const STEPS = 24000;                    // 약 20 공전
    return {
        meta: { Geff, eps, M0, M1, R0, VT, dt, steps: STEPS },
        eulerFixed:    run(stepEuler,    dt, STEPS, false),
        leapfrogFixed: run(stepLeapfrog, dt, STEPS, false),
        eulerJitter:   run(stepEuler,    dt, STEPS, true),
        leapfrogJitter:run(stepLeapfrog, dt, STEPS, true),
    };
});

await browser.close();

const fmt = (v) => (v * 100).toExponential(3) + '%';
console.log('설정:', JSON.stringify(result.meta));
console.log('');
for (const [k, label] of [
    ['eulerFixed', 'semi-implicit Euler · 고정 Δt'],
    ['leapfrogFixed', 'leapfrog · 고정 Δt'],
    ['eulerJitter', 'semi-implicit Euler · 지터 Δt(±50%)'],
    ['leapfrogJitter', 'leapfrog · 지터 Δt(±50%)'],
]) {
    const r = result[k];
    if (r.diverged) { console.log(`${label}: 발산 (step ${r.atStep})`); continue; }
    console.log(`${label}`);
    console.log(`   최대 |ΔE/E₀| = ${fmt(r.maxRel)}`);
    console.log(`   세속 표류 기울기 = ${r.slopePerUnitTime.toExponential(3)} /시간단위`);
    console.log(`   r 범위 = ${r.rMin.toFixed(2)} ~ ${r.rMax.toFixed(2)}`);
}
if (errs.length) console.log('\npageerrors:', JSON.stringify(errs));

mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL('./results/energy_drift.json', import.meta.url), JSON.stringify(result, null, 1));
console.log('\n→ measurements/results/energy_drift.json 에 원자료 저장');
