// 논문 그림 중 스크린샷이 아닌 것 → ../figure/ (SVG, 벡터)
//
//  · Fig.1 시스템 구조도 — 순수 작도
//  · Fig.3 GR 보정항 on/off 궤적 대조 — 앱의 geodesicRadialAccel()로 실제 적분한 궤적
//
// ⚠️ 그림 안에는 한글을 넣지 않는다(폰트 의존·조판 문제). 구조도는 영문 라벨,
//    궤적도는 도형과 숫자만. 설명은 본문 캡션으로 뺀다 — 캡션 문안은 PAPER_DRAFT.md 참조.
//
// 실행: node measurements/figures_svg.mjs   (Fig.3 때문에 앱이 127.0.0.1:8777에 떠 있어야 함)

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const APP_URL = 'http://127.0.0.1:8777/index.html?debug';
const OUT = fileURLToPath(new URL('../figure/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const FONT = "Arial,Helvetica,sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ─────────────────────────────────────────────────────────────
// Fig.1 — 시스템 구조도 (영문 라벨)
// ─────────────────────────────────────────────────────────────
function buildFig1() {
    const W = 900, H = 620;
    const box = (x, y, w, h, title, lines, fill, stroke) => {
        let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
        s += `<text x="${x + w / 2}" y="${y + 22}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="bold" fill="#12203a">${esc(title)}</text>`;
        lines.forEach((ln, i) => {
            s += `<text x="${x + w / 2}" y="${y + 43 + i * 17}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="#3b4a63">${esc(ln)}</text>`;
        });
        return s;
    };
    const arrow = (x1, y1, x2, y2) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#5b6b86" stroke-width="1.6" marker-end="url(#ah)"/>`;

    let g = '';
    g += box(295, 20, 310, 66, 'User Input',
        ['place mass (press & drag) · toggle model (C)', 'switch view (V) · observer move (WASD)'], '#eef3fb', '#7f96bb');
    g += arrow(450, 86, 450, 116);
    g += box(280, 118, 340, 66, 'State',
        ['mass array { position, mass, growth }  (max 5)', 'model flag:  rubber-sheet | Flamm'], '#eef3fb', '#7f96bb');

    g += arrow(450, 184, 450, 206);
    g += `<line x1="215" y1="206" x2="685" y2="206" stroke="#5b6b86" stroke-width="1.6"/>`;
    g += arrow(215, 206, 215, 240);
    g += arrow(685, 206, 685, 240);

    g += box(55, 242, 320, 100, 'Surface Depth',
        ['rubber:  z = −K·m / √(r²+ε²)',
         'Flamm:  z = √(8M(r−2M)),  r ∈ [2M, R₀]',
         'multi-mass: linear superposition'], '#fdf1e6', '#d09a63');
    g += box(525, 242, 320, 100, 'Motion Integrator',
        ['fixed-step leapfrog  (1/120 s)',
         'rubber → Newtonian N-body',
         'Flamm → Schwarzschild geodesic'], '#e9f6ee', '#6fae86');

    g += arrow(215, 342, 215, 380);
    g += box(55, 382, 320, 78, 'GPU Vertex Shader',
        ['200 × 200 grid displacement', 'depth → colour / intensity (non-saturating)'], '#fdf1e6', '#d09a63');

    g += arrow(685, 342, 685, 380);
    g += box(525, 382, 320, 78, 'Mass Position Update',
        ['rest height on the surface', 'circular boundary reflection'], '#e9f6ee', '#6fae86');

    g += arrow(215, 460, 215, 498);
    g += arrow(685, 460, 685, 498);
    g += `<line x1="215" y1="498" x2="685" y2="498" stroke="#5b6b86" stroke-width="1.6"/>`;
    g += arrow(450, 498, 450, 526);
    g += box(295, 528, 310, 62, 'Rendering',
        ['Three.js · bloom post-processing', 'god view / first-person observer'], '#eef3fb', '#7f96bb');

    // 두 갈래가 같은 기하학적 질량 M을 공유 (Flamm 모드에서 표면·운동의 정합성)
    g += `<path d="M 375 300 L 523 300" stroke="#b06a2c" stroke-width="1.4" stroke-dasharray="5 4" marker-end="url(#ah2)"/>`;
    g += `<text x="449" y="293" text-anchor="middle" font-family="${FONT}" font-size="11.5" fill="#b06a2c">same M</text>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
 <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
   <path d="M 0 0 L 10 5 L 0 10 z" fill="#5b6b86"/></marker>
 <marker id="ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
   <path d="M 0 0 L 10 5 L 0 10 z" fill="#b06a2c"/></marker>
</defs>
<rect width="${W}" height="${H}" fill="#ffffff"/>
${g}
</svg>`;
}

writeFileSync(OUT + 'fig1_architecture.svg', buildFig1());
console.log('  → fig1_architecture.svg');

// ─────────────────────────────────────────────────────────────
// Fig.3 — GR 보정항 on/off 궤적 대조 (도형과 숫자만)
// ─────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(APP_URL, { waitUntil: 'load' });
await page.waitForTimeout(600);

const orbits = await page.evaluate(() => {
    const { CONFIG } = window.__warped;
    function accel(r, L, M, gr) {
        const iR = 1 / r;
        let a = -M * iR * iR + L * L * iR * iR * iR;
        if (gr) a -= 3 * M * L * L * iR * iR * iR * iR;
        return a;
    }
    // §4.2와 동일한 조건: M=10, r_peri=150, L = 1.05·L_circ
    const M = 10, rPeri = 150, kL = 1.05;
    const L = Math.sqrt(M * rPeri * rPeri / (rPeri - 3 * M)) * kL;
    const dtau = CONFIG.physicsTimeStep * CONFIG.geodesicTimeScale;

    function run(gr, orbitsWanted) {
        let r = rPeri, phi = 0, vr = 0;
        const pts = [[r, phi]];
        const peris = [[r, phi]];       // 근일점 — 세차를 눈으로 읽게 해주는 표식
        let pVr = vr, peri = 0;
        for (let i = 0; i < 3000000 && peri < orbitsWanted; i++) {
            vr += accel(r, L, M, gr) * dtau / 2;
            r += vr * dtau;
            phi += (L / (r * r)) * dtau;
            vr += accel(r, L, M, gr) * dtau / 2;
            if (i % 4 === 0) pts.push([r, phi]);
            if (pVr < 0 && vr >= 0) { peri++; peris.push([r, phi]); }
            pVr = vr;
        }
        const toXY = ([rr, pp]) => [rr * Math.cos(pp), rr * Math.sin(pp)];
        return { points: pts.map(toXY), periapsides: peris.map(toXY) };
    }
    return { gr: run(true, 4), newton: run(false, 1), M, L, rPeri };
});
await browser.close();

function buildFig3(d) {
    const S = 780, pad = 26;
    const all = [...d.gr.points, ...d.newton.points];
    const maxR = Math.max(...all.map(([x, y]) => Math.hypot(x, y))) * 1.05;
    const k = (S / 2 - pad) / maxR;
    const px = ([x, y]) => [(S / 2 + x * k), (S / 2 + y * k)];
    const path = (pts) => 'M ' + pts.map(p => px(p).map(v => v.toFixed(1)).join(',')).join(' L ');

    let g = '';
    // 반경 눈금(숫자만 — 언어 중립)
    for (let rr = 100; rr <= maxR; rr += 100) {
        g += `<circle cx="${S / 2}" cy="${S / 2}" r="${(rr * k).toFixed(1)}" fill="none" stroke="#e6e9ef" stroke-width="1"/>`;
        g += `<text x="${(S / 2 + rr * k + 4).toFixed(1)}" y="${(S / 2 - 5).toFixed(1)}" font-family="${FONT}" font-size="10.5" fill="#a6aebc">${rr}</text>`;
    }
    // 뉴턴(보정항 제외): 닫힌 타원 — 점선
    g += `<path d="${path(d.newton.points)}" fill="none" stroke="#555555" stroke-width="1.7" stroke-dasharray="7 5"/>`;
    // GR(보정항 포함): 세차하는 장미 곡선 — 실선
    g += `<path d="${path(d.gr.points)}" fill="none" stroke="#e2711d" stroke-width="1.7" opacity="0.95"/>`;
    // 근일점 표식 + 중심에서 뻗는 가는 반경선 → 주기마다 근일점이 도는 각도가 읽힌다
    d.gr.periapsides.forEach((p) => {
        const [x, y] = px(p);
        g += `<line x1="${S / 2}" y1="${S / 2}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#b0541a" stroke-width="0.9" opacity="0.55"/>`;
        g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="#b0541a"/>`;
    });
    // 중심 질량
    g += `<circle cx="${S / 2}" cy="${S / 2}" r="7.5" fill="#2b3a55"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<rect width="${S}" height="${S}" fill="#ffffff"/>
${g}
</svg>`;
}

writeFileSync(OUT + 'fig3_orbit_gr_vs_newton.svg', buildFig3(orbits));
console.log('  → fig3_orbit_gr_vs_newton.svg');
console.log(`     (M=${orbits.M}, r_peri=${orbits.rPeri}, L=${orbits.L.toFixed(3)}, GR 4주기 / 뉴턴 1주기)`);

// Word/HWP에 바로 끼워 넣을 수 있도록 PNG 판도 함께 만든다(SVG를 못 받는 편집기가 많다).
const b2 = await chromium.launch();
for (const [name, w, h] of [['fig1_architecture', 900, 620], ['fig3_orbit_gr_vs_newton', 780, 780]]) {
    const pg = await b2.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await pg.setContent(`<body style="margin:0">${readFileSync(OUT + name + '.svg', 'utf8')}</body>`);
    await pg.waitForTimeout(250);
    await pg.screenshot({ path: OUT + name + '.png' });
    await pg.close();
    console.log(`  → ${name}.png`);
}
await b2.close();
console.log(`\n저장 위치: ${OUT}`);
