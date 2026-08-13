// §4.3 — 렌더링 성능 측정
//
// 목적: "표준 웹 브라우저에서 대화형 프레임률로 동작한다"는 주장을 수치로 뒷받침하고,
//       질량 개수와 모델에 따른 부하 변화를 본다.
//
// ⚠️ 방법상 주의 두 가지
//  1) **실제 GPU로 렌더링됐는지 반드시 확인해야 한다.** 헤드리스 브라우저는 SwiftShader
//     (소프트웨어 래스터라이저)로 떨어지는 경우가 있고, 그러면 숫자가 실사용과 무관해진다.
//     그래서 WEBGL_debug_renderer_info로 렌더러 문자열을 뽑아 결과에 함께 싣는다.
//     기본은 headed(창을 띄움) — 실제 GPU를 쓰기 위해서다. HEADLESS=1로 강제 전환 가능.
//  2) rAF는 보통 화면 주사율에 묶인다(60Hz면 60fps가 상한). 그대로 재면 여유가 얼마나
//     남았는지 알 수 없으므로 vsync를 끄고 **처리량**을 잰다. 실사용은 vsync에 묶인다는 점을
//     논문에 함께 적을 것.
//
// 실행: node measurements/performance.mjs   (앱이 127.0.0.1:8777에 떠 있어야 함)

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const APP_URL = 'http://127.0.0.1:8777/index.html?debug';
const HEADLESS = process.env.HEADLESS === '1';
const SECONDS = Number(process.env.SECONDS || 4);
const VIEWPORT = { width: 1280, height: 720 };

const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: VIEWPORT });
const errs = [];
page.on('pageerror', e => errs.push(String(e.message)));
await page.goto(APP_URL, { waitUntil: 'load' });
await page.waitForTimeout(1000);

// ── 측정 환경 ──
const env = await page.evaluate(() => {
    const gl = document.getElementById('webgl').getContext('webgl2')
            || document.getElementById('webgl').getContext('webgl');
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    let plane = null;
    window.__warped.scene.traverse(o => {
        if (o.isMesh && o.geometry?.type === 'PlaneGeometry' && o.material?.type === 'ShaderMaterial') {
            plane = o.geometry.parameters;
        }
    });
    return {
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '(unknown)',
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : '(unknown)',
        glVersion: gl ? gl.getParameter(gl.VERSION) : '(none)',
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        canvas: { w: document.getElementById('webgl').width, h: document.getElementById('webgl').height },
        grid: plane,   // {width,height,widthSegments,heightSegments}
    };
});

function pct(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]; }

async function measure(model, massCount) {
    // 초기화 후 결정론적으로 질량 배치
    await page.evaluate(() => document.getElementById('btn-reset').click());
    await page.waitForTimeout(400);
    await page.evaluate((m) => {
        if (window.__warped.state.model !== m) document.getElementById('btn-toggle-model').click();
    }, model);
    await page.evaluate((n) => {
        const { createMass } = window.__warped;
        const R = 200;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            createMass({ x: R * Math.cos(a), z: R * Math.sin(a) }, 25, 100);
        }
    }, massCount);
    // 생성 트윈(팝 0.45s, growth 1.4s)이 끝나고 정상 상태가 되도록 대기
    await page.waitForTimeout(2000);

    const frames = await page.evaluate((sec) => new Promise(resolve => {
        const out = [];
        let last = performance.now();
        const end = last + sec * 1000;
        function tick(now) {
            out.push(now - last); last = now;
            if (now < end) requestAnimationFrame(tick); else resolve(out);
        }
        requestAnimationFrame(tick);
    }), SECONDS);

    const ft = frames.slice(10).filter(d => d > 0);   // 앞쪽 워밍업 프레임 제외
    const sorted = [...ft].sort((a, b) => a - b);
    const mean = ft.reduce((a, b) => a + b, 0) / ft.length;
    return {
        model, massCount, samples: ft.length,
        meanFrameMs: mean, meanFps: 1000 / mean,
        p50FrameMs: pct(sorted, 0.50),
        p95FrameMs: pct(sorted, 0.95),          // 느린 쪽 꼬리
        fpsAtP95: 1000 / pct(sorted, 0.95),     // 하위 5% 프레임률
    };
}

// 프레임 시간이 0.6ms 수준인데 performance.now()는 0.1ms로 양자화되어 있어(브라우저 보안상
// 의도적 조치) 1회 측정으로는 질량 개수별 차이를 분해할 수 없다. 게다가 열·스케줄링 드리프트가
// 측정 순서에 따라 편향을 만든다. 그래서 **라운드를 반복하고 라운드 간 산포를 함께 보고**하여,
// 관측된 차이가 잡음보다 큰지 판단할 수 있게 한다.
const ROUNDS = Number(process.env.ROUNDS || 3);
const byConfig = new Map();
for (let round = 0; round < ROUNDS; round++) {
    for (const model of ['RUBBER', 'FLAMM']) {
        for (const n of [0, 1, 2, 3, 4, 5]) {
            const r = await measure(model, n);
            const key = `${model}/${n}`;
            if (!byConfig.has(key)) byConfig.set(key, { model, massCount: n, runs: [] });
            byConfig.get(key).runs.push(r);
        }
    }
    console.error(`  (라운드 ${round + 1}/${ROUNDS} 완료)`);
}

const rows = [...byConfig.values()].map(c => {
    const means = c.runs.map(r => r.meanFrameMs).sort((a, b) => a - b);
    const median = means[Math.floor(means.length / 2)];
    return {
        model: c.model, massCount: c.massCount,
        medianFrameMs: median, minFrameMs: means[0], maxFrameMs: means[means.length - 1],
        spreadMs: means[means.length - 1] - means[0],
        fps: 1000 / median,
        p95FrameMs: c.runs.map(r => r.p95FrameMs).sort((a, b) => a - b)[Math.floor(c.runs.length / 2)],
        rounds: means,
    };
});

await browser.close();

console.log('=== 측정 환경 ===');
console.log(`  렌더러 : ${env.renderer}`);
console.log(`  벤더   : ${env.vendor}`);
console.log(`  WebGL  : ${env.glVersion}`);
console.log(`  캔버스 : ${env.canvas.w}×${env.canvas.h} (DPR ${env.devicePixelRatio})`);
if (env.grid) console.log(`  격자   : ${env.grid.widthSegments}×${env.grid.heightSegments} 분할`);
console.log(`  모드   : ${HEADLESS ? 'headless' : 'headed'}, vsync 해제, 구간 ${SECONDS}s`);
const soft = /swiftshader|llvmpipe|software/i.test(env.renderer);
if (soft) console.log('  ⚠️ 소프트웨어 렌더러로 판정됨 — 이 수치는 실사용 성능이 아니다!');

console.log(`\n=== 결과 (${ROUNDS}라운드, 라운드 평균들의 중앙값) ===`);
console.log('  모델      질량   중앙ms  라운드간 산포    fps     p95ms');
for (const r of rows) {
    console.log(`  ${r.model.padEnd(8)} ${String(r.massCount).padStart(3)}  ` +
        `${r.medianFrameMs.toFixed(3).padStart(7)}  ` +
        `${r.minFrameMs.toFixed(3)}~${r.maxFrameMs.toFixed(3)} (±${r.spreadMs.toFixed(3)})  ` +
        `${r.fps.toFixed(0).padStart(6)}  ${r.p95FrameMs.toFixed(3).padStart(6)}`);
}

// 질량 개수별 차이가 라운드 간 산포보다 큰지 판단
console.log('\n=== 해석 ===');
for (const model of ['RUBBER', 'FLAMM']) {
    const rs = rows.filter(r => r.model === model);
    const base = rs.find(r => r.massCount === 0);
    const withMass = rs.filter(r => r.massCount >= 1);
    const lo = Math.min(...withMass.map(r => r.medianFrameMs));
    const hi = Math.max(...withMass.map(r => r.medianFrameMs));
    const maxSpread = Math.max(...withMass.map(r => r.spreadMs));
    console.log(`  ${model}: 질량 0개 ${base.medianFrameMs.toFixed(3)}ms → 1~5개 ${lo.toFixed(3)}~${hi.toFixed(3)}ms`);
    console.log(`     1~5개 사이 변동폭 ${(hi - lo).toFixed(3)}ms vs 라운드간 최대 산포 ${maxSpread.toFixed(3)}ms ` +
        `→ ${(hi - lo) > maxSpread ? '개수 의존성 있음' : '**측정 잡음에 묻힘(개수 의존성 분해 불가)**'}`);
}
console.log(`  ※ 60Hz(16.667ms) 기준 여유: 최악 구성에서 약 ${(16.667 / Math.max(...rows.map(r => r.medianFrameMs))).toFixed(0)}배`);
if (errs.length) console.log('\npageerrors:', JSON.stringify(errs));

mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL('./results/performance.json', import.meta.url),
    JSON.stringify({ env, headless: HEADLESS, seconds: SECONDS, rows }, null, 1));
console.log('\n→ measurements/results/performance.json 에 원자료 저장');
