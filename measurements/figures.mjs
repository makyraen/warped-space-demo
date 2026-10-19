// 논문 그림용 스크린샷 캡처 → ../figure/  (Fig. 2 두 장 + 합본, Fig. 3)
//
// 규칙
//  · **UI를 전부 숨긴다**(Fig. 3만 예외). 논문 그림에 메뉴·버튼이 들어가면 안 된다. 어떤 모델인지는
//    파일 이름으로 구분한다(`..._rubber.png` / `..._flamm.png`).
//  · 두 모델 그림은 **같은 카메라, 같은 질량 배치**여야 비교가 성립한다.
//  · **headed로 돌린다.** 헤드리스는 SwiftShader로 떨어질 수 있다(§4.3 참고).
//  · 인쇄를 고려해 deviceScaleFactor=2로 캡처한다.
//
// 실행: node measurements/figures.mjs      (앱이 127.0.0.1:8777에 떠 있어야 함)

import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'fs';
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
// Fig. 2 — 두 모델의 곡면 대조 (단일 질량, 동일 카메라)
//   질량 200 → M=10. 고무판은 −K·m/√(r²+ε²), Flamm은 √(8M(r−2M)).
//   고무판 모드에만 격자 당김 연출(uPullStrength=1, 앱 기본값)이 있다 — 본문에 밝혀 둠.
// ─────────────────────────────────────────────────────────────
console.log('Fig. 2 단일 질량 곡면 대조');
const CAM_A = [[0, 250, 430], [0, -70, 0]];      // 비스듬히 내려다보는 기본 시점

for (const model of ['rubber', 'flamm']) {
    await reset();
    await setModel(model.toUpperCase());
    await hideUI(true);
    await spawn([{ x: 0, z: 0, m: 200 }]);
    await camera(...CAM_A); await shot(`fig2_surface_${model}.png`);
}

// 원고용 합본: 두 장을 절반 크기(1400×900)로 나란히 놓고 위에 (a)(b)를 단다.
{
    const b64 = n => 'data:image/png;base64,' + readFileSync(OUT + n).toString('base64');
    const pg = await browser.newPage({ viewport: { width: 2820, height: 935 }, deviceScaleFactor: 1 });
    await pg.setContent(`<body style="margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif">
      <div style="position:absolute;left:0;top:0;width:1400px;height:35px;line-height:35px;text-align:center;font-size:22px">(a)</div>
      <div style="position:absolute;left:1420px;top:0;width:1400px;height:35px;line-height:35px;text-align:center;font-size:22px">(b)</div>
      <img src="${b64('fig2_surface_rubber.png')}" style="position:absolute;left:0;top:35px;width:1400px;height:900px">
      <img src="${b64('fig2_surface_flamm.png')}" style="position:absolute;left:1420px;top:35px;width:1400px;height:900px">
    </body>`);
    await pg.waitForTimeout(300);
    await pg.screenshot({ path: OUT + 'fig2_surface_combined.png' });
    await pg.close();
    console.log('  → fig2_surface_combined.png');
}

// ─────────────────────────────────────────────────────────────
// Fig. 3 — 실행 화면. 이 그림만 메뉴를 **보인다**(조작부 설명용).
// ─────────────────────────────────────────────────────────────
console.log('Fig. 3 실행 화면 (이 그림만 메뉴 표시)');
await reset();
await setModel('FLAMM');
await hideUI(false);
await spawn([{ x: 0, z: 0, m: 180 }, { x: 190, z: 0, m: 60 }]);
await camera(...CAM_A);
await shot('fig3_ui_flamm.png');

if (errs.length) console.log('\npageerrors:', JSON.stringify(errs));
await browser.close();
console.log(`\n저장 위치: ${OUT}`);
