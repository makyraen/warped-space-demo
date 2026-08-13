// 논문 §IV의 그래프 → ../figure/ (SVG + PNG)
//
//  · Fig.4 에너지 표류 곡선      — results/energy_drift.json
//  · Fig.6 약장 극한 수렴 그래프 — results/precession.json (mScaling)
//
// 앱이 필요 없다. 이미 측정해 둔 원자료만 읽어 작도한다 → 서버를 띄우지 않아도 실행된다.
//
// ⚠️ 그림 안에는 한글을 넣지 않는다(폰트 의존·조판 문제). 축·범례는 영문, 설명은 본문 캡션으로.
//
// 실행: node measurements/figures_plots.mjs

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const OUT = fileURLToPath(new URL('../figure/', import.meta.url));
const RES = fileURLToPath(new URL('./results/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const FONT = "Arial,Helvetica,sans-serif";
const INK = '#12203a', MUTED = '#5b6b86', GRID = '#dfe5ee';
const C_EULER = '#c0392b', C_LEAP = '#1f6fb2';

// 로그 축의 바닥. 두 기법 모두 근일점 사이에서 이보다 훨씬 아래(leapfrog는 10⁻¹⁵까지)로
// 내려가지만, 축을 거기까지 늘리면 정작 비교해야 할 구간이 눌린다 → 여기서 자르고 그림에 표시한다.
const FLOOR = 1e-8;

const fmtPow = (e) => `10${String(e).replace(/-/g, '−').split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c] ?? (c === '−' ? '⁻' : c)).join('')}`;

// ─────────────────────────────────────────────────────────────
// Fig.4 — 에너지 표류 곡선 (log y)
// ─────────────────────────────────────────────────────────────
function buildEnergyDrift(d) {
    const W = 880, H = 500;
    const L = 92, R = 24, T = 56, B = 62;            // 여백
    const pw = W - L - R, ph = H - T - B;

    const tMax = 200;
    const yTop = -2, yBot = -8;                       // 10^-2 … 10^-8
    const px = (t) => L + (t / tMax) * pw;
    const py = (v) => {
        const e = Math.log10(Math.max(v, FLOOR));
        return T + ((yTop - e) / (yTop - yBot)) * ph;
    };

    const series = [
        ['eulerFixed',    C_EULER, 'none',  'semi-implicit Euler, fixed Δt'],
        ['leapfrogFixed', C_LEAP,  'none',  'leapfrog, fixed Δt'],
        ['eulerJitter',   C_EULER, '5 4',   'semi-implicit Euler, ±50% jitter'],
        ['leapfrogJitter',C_LEAP,  '5 4',   'leapfrog, ±50% jitter'],
    ];

    let g = `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;

    // y 격자 + 눈금
    for (let e = yBot; e <= yTop; e++) {
        const y = py(Math.pow(10, e));
        g += `<line x1="${L}" y1="${y}" x2="${L + pw}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`;
        g += `<text x="${L - 10}" y="${y + 4}" text-anchor="end" font-family="${FONT}" font-size="12" fill="${MUTED}">${fmtPow(e)}</text>`;
    }
    // x 격자 + 눈금
    for (let t = 0; t <= tMax; t += 50) {
        const x = px(t);
        g += `<line x1="${x}" y1="${T}" x2="${x}" y2="${T + ph}" stroke="${GRID}" stroke-width="1"/>`;
        g += `<text x="${x}" y="${T + ph + 20}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${MUTED}">${t}</text>`;
    }

    // 축 바닥선 — 아래로 나가는 값은 잘린다
    const yf = py(FLOOR);
    g += `<line x1="${L}" y1="${yf}" x2="${L + pw}" y2="${yf}" stroke="#9aa6b8" stroke-width="1" stroke-dasharray="2 3"/>`;
    g += `<text x="${L + pw - 4}" y="${yf - 6}" text-anchor="end" font-family="${FONT}" font-size="11" fill="#9aa6b8">axis floor — lower values clipped</text>`;

    // 곡선
    for (const [key, color, dash, ] of series) {
        const pts = d[key].series.map(p => `${px(p.t).toFixed(1)},${py(p.rel).toFixed(1)}`).join(' ');
        g += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.7"`
           + (dash === 'none' ? '' : ` stroke-dasharray="${dash}" opacity="0.75"`) + `/>`;
    }

    // 축
    g += `<line x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}" stroke="${INK}" stroke-width="1.4"/>`;
    g += `<line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="${INK}" stroke-width="1.4"/>`;
    g += `<text x="${L + pw / 2}" y="${H - 18}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${INK}">simulation time (arbitrary units, ≈ 20 orbits)</text>`;
    g += `<text x="22" y="${T + ph / 2}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${INK}" transform="rotate(-90 22 ${T + ph / 2})">relative energy error  |ΔE/E₀|</text>`;

    // 범례 — 그림 위쪽 여백에 2열로. 곡선이 폭 전체를 채우므로 작도 영역 안에 두면 가린다.
    series.forEach(([, color, dash, label], i) => {
        const lx = L + (i % 2) * 400, ly = 20 + Math.floor(i / 2) * 18;
        g += `<line x1="${lx}" y1="${ly}" x2="${lx + 26}" y2="${ly}" stroke="${color}" stroke-width="1.9"`
           + (dash === 'none' ? '' : ` stroke-dasharray="${dash}" opacity="0.75"`) + `/>`;
        g += `<text x="${lx + 34}" y="${ly + 4}" font-family="${FONT}" font-size="12" fill="${INK}">${label}</text>`;
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}

// ─────────────────────────────────────────────────────────────
// Fig.6 — 약장 극한 수렴 (log-log, 기울기 1 참조선)
// ─────────────────────────────────────────────────────────────
function buildConvergence(rows) {
    const W = 640, H = 520;
    const L = 96, R = 28, T = 50, B = 66;
    const pw = W - L - R, ph = H - T - B;

    const pts = rows.map(r => ({
        M: r.M,
        x: r.M / r.p,
        y: (r.precessionPerOrbit - r.theoryWeakField) / r.theoryWeakField,
    }));

    const xLo = -3.32, xHi = -2.18;    // log10(M/p)
    const yLo = -2.66, yHi = -1.52;    // log10(relative error) — x와 같은 폭이라 기울기 1이 45°로 보인다
    const px = (v) => L + ((Math.log10(v) - xLo) / (xHi - xLo)) * pw;
    const py = (v) => T + ((yHi - Math.log10(v)) / (yHi - yLo)) * ph;

    let g = `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;

    // 격자·눈금. 10의 거듭제곱만으로는 눈금이 한두 개뿐이라 2·5 배수까지 표시한다.
    const decades = (lo, hi) => {
        const out = [];
        for (let e = Math.floor(lo); e <= Math.ceil(hi); e++)
            for (const m of [1, 2, 5]) {
                const v = m * Math.pow(10, e), lg = Math.log10(v);
                if (lg >= lo && lg <= hi) out.push([v, m === 1]);
            }
        return out;
    };
    const tickLabel = (v, major) => major ? fmtPow(Math.round(Math.log10(v)))
        : `${Math.round(v / Math.pow(10, Math.floor(Math.log10(v))))}×${fmtPow(Math.floor(Math.log10(v)))}`;

    for (const [v, major] of decades(yLo, yHi)) {
        const y = py(v);
        g += `<line x1="${L}" y1="${y}" x2="${L + pw}" y2="${y}" stroke="${GRID}" stroke-width="${major ? 1.2 : 0.7}"/>`;
        g += `<text x="${L - 10}" y="${y + 4}" text-anchor="end" font-family="${FONT}" font-size="11" fill="${MUTED}">${tickLabel(v, major)}</text>`;
    }
    for (const [v, major] of decades(xLo, xHi)) {
        const x = px(v);
        g += `<line x1="${x}" y1="${T}" x2="${x}" y2="${T + ph}" stroke="${GRID}" stroke-width="${major ? 1.2 : 0.7}"/>`;
        g += `<text x="${x}" y="${T + ph + 20}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${MUTED}">${tickLabel(v, major)}</text>`;
    }

    // 기울기 1 참조선 — 가장 작은 M 점에 앵커. 작도 영역 안에서만 그린다.
    const anchor = pts[pts.length - 1];
    const k = anchor.y / anchor.x;                       // y = k·x
    const xa = Math.max(Math.pow(10, xLo), Math.pow(10, yLo) / k);
    const xb = Math.min(Math.pow(10, xHi), Math.pow(10, yHi) / k);
    g += `<line x1="${px(xa)}" y1="${py(k * xa)}" x2="${px(xb)}" y2="${py(k * xb)}" stroke="${MUTED}" stroke-width="1.4" stroke-dasharray="6 4"/>`;
    // 참조선 라벨은 오른쪽 아래 모서리에 고정한다. 선을 기준으로 배치하면 점 라벨들도
    // 선 근처에 있어 어디에 두든 부딪친다. 이 모서리는 선 아래쪽이라 늘 비어 있다.
    g += `<text x="${L + pw - 12}" y="${T + ph - 22}" text-anchor="end" font-family="${FONT}" font-size="12" fill="${MUTED}">‑ ‑ ‑  slope 1 — first order in M/p</text>`;

    // 측정점
    for (const p of pts) {
        g += `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="5.5" fill="${C_LEAP}" stroke="#ffffff" stroke-width="1.5"/>`;
        // 점 라벨은 오른쪽 아래로. 위로 두면 M=1이 그림 위 가장자리를 넘고 참조선 라벨과 부딪친다.
        g += `<text x="${px(p.x) + 12}" y="${py(p.y) + 18}" font-family="${FONT}" font-size="12" fill="${INK}">M = ${p.M}</text>`;
    }

    // 축
    g += `<line x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}" stroke="${INK}" stroke-width="1.4"/>`;
    g += `<line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="${INK}" stroke-width="1.4"/>`;
    g += `<text x="${L + pw / 2}" y="${H - 20}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${INK}">compactness  M/p</text>`;
    g += `<text x="24" y="${T + ph / 2}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${INK}" transform="rotate(-90 24 ${T + ph / 2})">deviation from weak-field prediction</text>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}

// ─────────────────────────────────────────────────────────────
const energy = JSON.parse(readFileSync(RES + 'energy_drift.json', 'utf8'));
const prec = JSON.parse(readFileSync(RES + 'precession.json', 'utf8'));

writeFileSync(OUT + 'fig4_energy_drift.svg', buildEnergyDrift(energy));
console.log('  → fig4_energy_drift.svg');
writeFileSync(OUT + 'fig6_weakfield_convergence.svg', buildConvergence(prec.mScaling));
console.log('  → fig6_weakfield_convergence.svg');

// Word/HWP용 PNG 판(SVG를 못 받는 편집기가 많다)
const b = await chromium.launch();
for (const [name, w, h] of [['fig4_energy_drift', 880, 500], ['fig6_weakfield_convergence', 640, 520]]) {
    const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await pg.setContent(`<body style="margin:0">${readFileSync(OUT + name + '.svg', 'utf8')}</body>`);
    await pg.waitForTimeout(200);
    await pg.screenshot({ path: OUT + name + '.png' });
    await pg.close();
    console.log(`  → ${name}.png`);
}
await b.close();
console.log(`\n저장 위치: ${OUT}`);
