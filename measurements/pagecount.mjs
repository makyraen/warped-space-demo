// 원고를 JKSCI에 가까운 2단 A4로 조판해 **실제 쪽수를 센다**.
// 계수 기반 어림 대신 렌더링해서 세는 것이 목적이다. HWP 최종 조판과 1:1은 아니지만
// "줄였더니 몇 쪽 줄었나"를 재현 가능하게 비교할 수 있다.
//
// 실행: node measurements/pagecount.mjs [경로]   (기본 paper/manuscript.md)

import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

const SRC = process.argv[2] || fileURLToPath(new URL('../paper/manuscript.md', import.meta.url));
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TMP = '/tmp/pagecount';

let html = execSync(`pandoc "${SRC}" -t html --mathml`, { encoding: 'utf8', maxBuffer: 1 << 26 });
// 그림 경로는 원고 기준 상대경로다. 임시 HTML에서 깨지면 쪽수가 과소평가되므로 절대경로로 바꾼다.
const SRCDIR = SRC.slice(0, SRC.lastIndexOf('/') + 1);
let imgs = 0, missing = [];
html = html.replace(/src="([^"]+)"/g, (m, u) => {
    if (/^(https?:|data:|file:|\/)/.test(u)) return m;
    const abs = new URL(u, 'file://' + SRCDIR).pathname;
    imgs++;
    if (!existsSync(abs)) missing.push(u);
    return `src="file://${abs}"`;
});
console.log(`그림 ${imgs}개 경로 변환` + (missing.length ? `  ⚠️ 없음: ${missing.join(', ')}` : '  (전부 존재)'));

// JKSCI 근사: A4, 상하 20mm·좌우 18mm, 2단(단 간격 7mm), 본문 9.5pt/1.45
const page = `<!doctype html><meta charset="utf-8"><style>
@page { size: A4; margin: 20mm 18mm; }
body { font-family: "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;
       font-size: 9.5pt; line-height: 1.45; text-align: justify; margin:0;
       column-count: 2; column-gap: 7mm; }
h1 { font-size: 12pt; margin: 10pt 0 5pt; column-span: all; text-align:center; }
h2 { font-size: 10.5pt; margin: 9pt 0 4pt; }
p  { margin: 0 0 5pt; }
table { border-collapse: collapse; font-size: 8.5pt; width: 100%; margin: 5pt 0 7pt; }
th,td { border: 0.5pt solid #666; padding: 1.5pt 3pt; }
img { max-width: 100%; height: auto; display:block; margin: 4pt auto; }
/* 연속한 그림은 실제 조판에서 (a)(b)로 나란히 놓인다 — 세로로 쌓으면 쪽수가 과대평가된다 */
.figrow { display: flex; gap: 3mm; align-items: flex-end; margin: 4pt 0; }
.figrow img { margin: 0; flex: 1 1 0; min-width: 0; }
blockquote { margin: 4pt 0 6pt 6pt; font-size: 9pt; }
code { font-size: 8.5pt; }
</style>${html}`;
// pandoc이 각 그림을 <p><img></p>로 내보낸다. 연속한 것끼리 한 줄로 묶는다.
const paged = page.replace(/(?:<p><img[^>]*\/>\s*<\/p>\s*){2,}/g, (blk) => {
    const imgs = blk.match(/<img[^>]*\/>/g) || [];
    return `<div class="figrow">${imgs.join('')}</div>`;
});
writeFileSync(TMP + '.html', paged);

const browser = await chromium.launch();
const pg = await browser.newPage();
await pg.goto('file://' + TMP + '.html', { waitUntil: 'networkidle' });
await pg.pdf({ path: TMP + '.pdf', format: 'A4', printBackground: true,
               margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' } });
await browser.close();

const buf = readFileSync(TMP + '.pdf');
const n = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`${SRC.replace(ROOT,'')}  →  ${n} 쪽  (${TMP}.pdf)`);
