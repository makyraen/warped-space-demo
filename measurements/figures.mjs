// 논문 그림용 스크린샷 캡처 → ../figure/
//
// 규칙
//  · **UI를 전부 숨긴다.** 논문 그림에 메뉴·버튼이 들어가면 안 된다. 어떤 모델인지는
//    파일 이름으로 구분한다(`..._rubber.png` / `..._flamm.png`).
//  · 두 모델 그림은 **같은 카메라, 같은 질량 배치**여야 비교가 성립한다.
//  · **headed로 돌린다.** 헤드리스는 SwiftShader로 떨어질 수 있다(§4.3 참고).
//  · 인쇄를 고려해 deviceScaleFactor=2로 캡처한다.
//
// 실행: node measurements/figures.mjs      (앱이 127.0.0.1:8777에 떠 있어야 함)

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const APP_URL = 'http://127.0.0.1:8777/index.html?debug';
const OUT = fileURLToPath(new URL('../figure/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 2,          // 인쇄용 해상도 (실제 2800×1800)
});
const errs = [];
page.on('pageerror', e => errs.push(String(e.message)));
await page.goto(APP_URL, { waitUntil: 'load' });
await page.waitForTimeout(1200);

// ── UI 숨기기 ──
async function hideUI(hidden = true) {
    await page.evaluate((h) => {
        let st = document.getElementById('__figstyle');
        if (!st) { st = document.createElement('style'); st.id = '__figstyle'; document.head.appendChild(st); }
        st.textContent = h ? '#ui-layer, #context-menu { display: none !important; }' : '';
    }, hidden);
}

async function setModel(model) {
    await page.evaluate((m) => {
        if (window.__warped.state.model !== m) document.getElementById('btn-toggle-model').click();
    }, model);
}

async function reset() {
    await page.evaluate(() => document.getElementById('btn-reset').click());
    await page.waitForTimeout(500);
}

async function spawn(list) {
    await page.evaluate((items) => {
        const { createMass, massToScale } = window.__warped;
        for (const it of items) createMass({ x: it.x, z: it.z }, massToScale(it.m), it.m);
    }, list);
    await page.waitForTimeout(2200);   // 팝(0.45s) + growth(1.4s) 완료 대기
}

async function camera(pos, look) {
    await page.evaluate(([p, l]) => {
        const c = window.__warped.camera;
        c.position.set(p[0], p[1], p[2]);
        c.lookAt(l[0], l[1], l[2]);
    }, [pos, look]);
    await page.waitForTimeout(400);
}

async function shot(name) {
    await page.screenshot({ path: OUT + name });
    console.log('  →', name);
}

// ─────────────────────────────────────────────────────────────
// Fig.2 — 두 모델의 곡면 대조 (단일 질량, 동일 카메라)
//   질량 200 → M=10. 고무판은 −K·m/√(r²+ε²), Flamm은 √(8M(r−2M)).
// ─────────────────────────────────────────────────────────────
console.log('Fig.2 단일 질량 곡면 대조');
const CAM_A = [[0, 250, 430], [0, -70, 0]];      // 비스듬히 내려다보는 기본 시점
const CAM_B = [[0, 90, 470], [0, -110, 0]];      // 낮은 시점 — 우물 단면이 드러난다

for (const model of ['rubber', 'flamm']) {
    await reset();
    await setModel(model.toUpperCase());
    await hideUI(true);
    await spawn([{ x: 0, z: 0, m: 200 }]);
    await camera(...CAM_A); await shot(`fig2_surface_${model}.png`);
    await camera(...CAM_B); await shot(`fig2_surface_${model}_low.png`);
}

// ─────────────────────────────────────────────────────────────
// Fig.2 (보조) — 고무판의 '당김' 연출을 끈 변형.
//   고무판 모드에만 있는 이 연출이 두 모델의 시각 차이를 부풀린다는 지적을 피하려면,
//   깊이 함수만 남긴 대조가 따로 필요하다. Flamm 쪽은 원래 이 연출이 없으므로 그대로다.
// ─────────────────────────────────────────────────────────────
console.log('Fig.2 당김 연출 제거 변형(깊이 함수만 대조)');
async function setPull(v) {
    await page.evaluate((val) => { window.__warped.shaderMat.uniforms.uPullStrength.value = val; }, v);
}
await reset();
await setModel('RUBBER');
await hideUI(true);
await setPull(0);
await spawn([{ x: 0, z: 0, m: 200 }]);
await camera(...CAM_A); await shot('fig2_surface_rubber_nopull.png');
await camera(...CAM_B); await shot('fig2_surface_rubber_nopull_low.png');
await setPull(1);   // 이후 캡처를 위해 기본값 복구

// ─────────────────────────────────────────────────────────────
// Fig.2b — 다중 질량(선형 중첩). 논문 §3.2의 근사를 보이는 그림.
// ─────────────────────────────────────────────────────────────
console.log('Fig.2b 다중 질량 중첩');
const MULTI = [{ x: -140, z: -60, m: 160 }, { x: 150, z: 40, m: 120 }, { x: 10, z: 190, m: 90 }];
for (const model of ['rubber', 'flamm']) {
    await reset();
    await setModel(model.toUpperCase());
    await hideUI(true);
    await spawn(MULTI);
    await camera(...CAM_A);
    await shot(`fig2b_multi_${model}.png`);
}

// ─────────────────────────────────────────────────────────────
// Fig.4 — UI 그림은 예외적으로 메뉴를 **보여야** 한다(상호작용 설명용).
// ─────────────────────────────────────────────────────────────
console.log('Fig.4 UI (이 그림만 메뉴 표시)');
await reset();
await setModel('FLAMM');
await hideUI(false);
await spawn([{ x: 0, z: 0, m: 180 }, { x: 190, z: 0, m: 60 }]);
await camera(...CAM_A);
await shot('fig3_ui_flamm.png');

if (errs.length) console.log('\npageerrors:', JSON.stringify(errs));
await browser.close();
console.log(`\n저장 위치: ${OUT}`);
