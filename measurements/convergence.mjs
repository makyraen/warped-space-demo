// §4.1 보강 — 시간간격 수렴 차수 측정 (symplectic Euler 대 kick–drift–kick)
//
// 목적: energy_drift.mjs는 앱의 기본 Δt 하나에서만 측정한다. 재검토서가 요구한 것은
//       Δt를 절반씩 줄여가며(Δt, Δt/2, Δt/4, Δt/8) 오차가 이론이 예측하는 차수대로
//       줄어드는지 — 즉 symplectic Euler는 1차(오차 ∝ Δt), kick–drift–kick은 2차
//       (오차 ∝ Δt²)로 수렴하는지 — 를 로그-로그 기울기로 직접 보이는 것이다.
//
// 방법: energy_drift.mjs와 동일한 2체 설정(힘 계산은 앱의 computeAcceleration을 그대로
//       사용)을 Δt만 4단계로 바꿔 반복한다. 같은 물리적 시간을 덮도록 스텝 수는
//       Δt에 반비례해 늘린다(steps = steps0 · dt0/dt). 지표는 최대 상대 에너지 오차.
//
// 실행: node measurements/convergence.mjs   (앱이 127.0.0.1:8777에 떠 있어야 함)

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
    const { state, CONFIG, computeAcceleration, createMass } = window.__warped;
    const Geff = CONFIG.gravityK * CONFIG.physicsSpeedScale;
    const eps = CONFIG.epsilon;

    const M0 = 200, M1 = 20;
    createMass({ x: 0, z: 0 }, 45, M0);
    createMass({ x: 250, z: 0 }, 9, M1);
    const c = state.masses[0], s = state.masses[1];
    for (const m of [c, s]) { m.growth = 1; m.settling = false; m.geo = null; }

    const R0 = 250, VT = 40;
    function reset() {
        c.mesh.position.set(0, 0, 0); c.velocity.set(0, 0, 0);
        s.mesh.position.set(R0, 0, 0); s.velocity.set(0, 0, VT);
    }
    function energy() {
        const dx = s.mesh.position.x - c.mesh.position.x;
        const dz = s.mesh.position.z - c.mesh.position.z;
        const r = Math.hypot(dx, dz);
        const v2 = s.velocity.x ** 2 + s.velocity.z ** 2;
        return { E: 0.5 * M1 * v2 - Geff * M0 * M1 / Math.sqrt(r * r + eps * eps), r };
    }
    function stepEuler(dt) {
        const a = computeAcceleration(1);
        s.velocity.x += a.ax * dt; s.velocity.z += a.az * dt;
        s.mesh.position.x += s.velocity.x * dt; s.mesh.position.z += s.velocity.z * dt;
    }
    function stepLeapfrog(dt) {
        let a = computeAcceleration(1);
        s.velocity.x += a.ax * dt / 2; s.velocity.z += a.az * dt / 2;
        s.mesh.position.x += s.velocity.x * dt; s.mesh.position.z += s.velocity.z * dt;
        a = computeAcceleration(1);
        s.velocity.x += a.ax * dt / 2; s.velocity.z += a.az * dt / 2;
    }

    function run(stepFn, dt, steps) {
        reset();
        const E0 = energy().E;
        let maxRel = 0;
        for (let i = 0; i < steps; i++) {
            stepFn(dt);
            const { E, r } = energy();
            if (!Number.isFinite(E) || !Number.isFinite(r)) return { diverged: true, atStep: i };
            const rel = Math.abs((E - E0) / E0);
            if (rel > maxRel) maxRel = rel;
        }
        return { diverged: false, maxRel };
    }

    const dt0 = CONFIG.physicsTimeStep;   // 앱과 동일한 1/120
    const steps0 = 24000;                 // energy_drift.mjs와 동일 — 약 20공전
    const levels = [1, 2, 4, 8].map(div => ({
        div, dt: dt0 / div, steps: Math.round(steps0 * div),
    }));

    const euler = levels.map(({ div, dt, steps }) => ({ div, dt, ...run(stepEuler, dt, steps) }));
    const leapfrog = levels.map(({ div, dt, steps }) => ({ div, dt, ...run(stepLeapfrog, dt, steps) }));

    function slope(rows) {
        // log(maxRel) vs log(dt) 최소제곱 기울기 — symplectic Euler는 1차(기울기≈1),
        // kick-drift-kick은 2차(기울기≈2)를 예상한다.
        const pts = rows.filter(r => !r.diverged && r.maxRel > 0).map(r => [Math.log(r.dt), Math.log(r.maxRel)]);
        const n = pts.length;
        const mx = pts.reduce((a, [x]) => a + x, 0) / n;
        const my = pts.reduce((a, [, y]) => a + y, 0) / n;
        let num = 0, den = 0;
        for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
        return num / den;
    }

    return { meta: { Geff, eps, M0, M1, R0, VT, dt0, steps0 }, euler, leapfrog, slopeEuler: slope(euler), slopeLeapfrog: slope(leapfrog) };
});

await browser.close();

console.log('설정:', JSON.stringify(result.meta));
console.log('');
for (const [key, label] of [['euler', 'symplectic Euler'], ['leapfrog', 'kick–drift–kick']]) {
    console.log(label + ':');
    for (const r of result[key]) {
        console.log(`   Δt = Δt0/${r.div} (${r.dt.toFixed(6)})  최대|ΔE/E₀| = ${r.diverged ? '발산' : (r.maxRel * 100).toExponential(3) + '%'}`);
    }
}
console.log('');
console.log(`로그-로그 수렴 기울기: symplectic Euler = ${result.slopeEuler.toFixed(3)} (기대 1차), kick–drift–kick = ${result.slopeLeapfrog.toFixed(3)} (기대 2차)`);
if (errs.length) console.log('\npageerrors:', JSON.stringify(errs));

mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL('./results/convergence.json', import.meta.url), JSON.stringify(result, null, 1));
console.log('\n→ measurements/results/convergence.json 에 원자료 저장');
