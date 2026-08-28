# measurements — 논문 §IV 수치 측정 하네스

`PAPER_DRAFT.md`/`paper/manuscript.md` §IV에 들어가는 수치를 **재현 가능하게** 뽑기 위한 스크립트다.
손으로 코드를 고쳐가며 값을 얻지 않고, 앱을 그대로 띄운 채 계측한다.

## 준비

```bash
cd measurements && npm ci                # package-lock.json 기준 고정 설치
npx playwright install chromium          # 최초 1회
```

앱을 띄워 둔다(저장소 루트에서):

```bash
python3 -m http.server 8777
```

## 실행

```bash
node measurements/energy_drift.mjs      # §4.1 적분기 정확도(에너지 오차)
node measurements/convergence.mjs       # §4.1 시간간격 수렴 차수
node measurements/precession.mjs        # §4.2 근점 세차, 약장 극한 수렴
ROUNDS=10 SEED=20260828 BROWSER=chromium SECONDS=3 \
  node measurements/performance.mjs     # §4.3 렌더 루프 처리 간격 (headed 필수)
node measurements/mode_contrast.mjs     # §4.4 두 모드 궤적 대조
```

원자료는 `measurements/results/*.json`에 저장된다. 논문 위치별 대응은 다음과 같다.

| 논문 위치 | 스크립트 | 원자료 | 비고 |
|---|---|---|---|
| §4.1 표, 그림 4 | `energy_drift.mjs` | `results/energy_drift.json` | |
| §4.1 수렴 차수 | `convergence.mjs` | `results/convergence.json` | Δt₀·Δt₀/2·Δt₀/4·Δt₀/8 |
| §4.2 표, 그림 5 | `precession.mjs` | `results/precession.json` | M-스캔 4점 포함 |
| §4.3 표 | `performance.mjs` | `results/performance.json` | `ROUNDS`/`SEED`/`BROWSER` 환경변수 |
| §4.4 표 2개, 그림 6 | `mode_contrast.mjs` | `results/mode_contrast.json` | ε-스캔 포함 |

## 설계 원칙

- **`?debug` 훅**: `main.js` 끝에서 `?debug` 쿼리가 있을 때만 `window.__warped`를 연다.
  일반 실행이나 배포본에는 노출되지 않는다.
- **각 측정이 앱 코드를 재사용하는 범위는 서로 다르다** — "아무것도 재구현하지 않는다"는 진술은
  부정확하므로 쓰지 않는다. 실제 구성:

  | 측정 | 앱 함수 직접 사용 | 하네스에서 별도 구성 | 검증 |
  |---|---|---|---|
  | §4.1 에너지 오차·수렴 차수 | `computeAcceleration()` | Euler/KDK 스텝 루프 | 동일 힘·초기조건 |
  | §4.2 세차 | (참조만) | 보정항 on/off 축약 가속도·적분 루프 | `geodesicRadialAccel()`과 부동소수점 수준 일치 확인 |
  | §4.3 성능 | 실제 앱 렌더 루프 전체 | 집계·통계 코드 | 렌더러 문자열로 GPU 렌더링 확인 |
  | §4.4 모드 대조 | `updateMassPhysics()`, `initGeodesic()` | 궤적 지표 계산(근점 검출 등) | 결정론적 배치·상태 덮어쓰기 |

  §4.2의 세차 하네스가 가속도·적분 루프를 별도로 구성하는 이유는 상대론 보정항만 켜고 끄는
  통제 조건을 만들기 위해서다(앱에는 그 스위치가 없다). 그 하네스가 앱과 같은 값을 내는지는
  `geodesicRadialAccel()` 대조로 먼저 확인한다.
- **동기 실행**: 측정 루프는 하나의 `page.evaluate()` 안에서 동기로 돌아 rAF 루프가 끼어들지 않는다.
- **⚠️ 초기조건 고정 필수**: `initGeodesic()`이 각운동량 배율에 `Math.random()`을 쓴다.
  측정에서는 `geo = {r, phi, vr, L}`(또는 위치·속도)를 **반드시 명시적으로 덮어쓸 것.**
  이걸 놓치면 실행마다 다른 궤도가 되어 비교가 성립하지 않는다(실제로 한 번 겪었다).

## 기록된 결과

### §4.1 적분기 정확도 (`energy_drift.mjs`, `convergence.mjs`)

2체계(중심 고정 `m₀=200`, 위성 `m₁=20`), `r₀=250`, 접선속도 40(원궤도 속도 약 85보다 낮음),
`Δt=1/120`, 24,000스텝(약 20공전).

| 적분기 | Δt | 최대 `|ΔE/E₀|` | `r` 범위 |
|---|---|---|---|
| semi-implicit Euler | 고정 | 5.40e-1 % | 62.2–250.0 |
| leapfrog | 고정 | 3.62e-3 % | 62.2–250.0 |
| semi-implicit Euler | ±50% 지터 | 8.17e-1 % | 62.2–250.1 |
| leapfrog | ±50% 지터 | 5.81e-3 % | 62.2–250.0 |

**결론**: 고정 시간간격에서 leapfrog가 최대 오차 약 149배 개선. **둘 다 발산하지 않는다** —
원본의 Euler는 explicit이 아니라 semi-implicit(심플렉틱)이므로 고정 Δt에서 에너지가 유계
진동하는 것이 정상이다. 따라서 **"Euler라서 궤도가 붕괴한다"는 서술은 쓰지 않는다.** leapfrog
도입의 근거는 붕괴 방지가 아니라 정확도 향상이다.

`convergence.mjs`가 Δt₀·Δt₀/2·Δt₀/4·Δt₀/8에서 같은 시험을 반복해 로그-로그 기울기를 구하면
semi-implicit Euler는 1.001, kick–drift–kick은 2.000으로 각각 1차·2차 이론적 차수와 일치한다.

> ⚠️ 예전에는 이 표에 `|ΔE/E₀|` 시계열의 최소제곱 기울기("세속 표류") 열이 있었으나 **폐기했다.**
> 표본 밀도를 바꾸자(200→50스텝) 같은 계산에서 Euler 기울기가 7배 변해, 유계 진동을 성기게
> 표본한 앨리어싱을 재고 있었을 뿐임이 드러났다. 되살리지 말 것 — 대신 위 수렴 차수와
> 그림 4(에너지 오차 시계열)로 유계성을 보인다.

### §4.2 근점 세차 (`precession.mjs`)

측지선 방정식에서 **`−3ML²/r⁴` 항만 켜고 끄며** 동일 `M`·`L`·`r_peri`로 적분.
(앱의 RUBBER 모드와 비교하면 안 된다 — 단위계가 달라 사과-오렌지가 된다.)

**검증 0**: 하네스 가속도 함수가 앱의 `geodesicRadialAccel()`과 상대차 **0**으로 일치.

| 검증 | 결과 |
|---|---|
| 보정항 제거 시 | 세차 −0.00001° ≈ 0 → 이 통제 방정식에서 세차를 발생시키는 항이 그 항임을 확인 |
| 시간간격 1/8 | 세차각 동일(87.5677° → 87.5679°, 0.000%) → **수렴 확인** |
| 주기 간 편차 | 1e-12 ~ 1e-9 rad |

**약장 극한 수렴** (`r_peri`=150, `kL`=1.15):

| M | 2M/p | 측정 | 이론 6πM/p | 상대오차 | 오차÷(M/p) | 2차 이론 (18+e²)/4 |
|---|---|---|---|---|---|---|
| 1 | 0.01004 | 5.5462° | 5.4199° | 2.331 % | 4.645 | 4.527 |
| 0.5 | 0.00503 | 2.7474° | 2.7161° | 1.153 % | 4.584 | 4.527 |
| 0.25 | 0.00252 | 1.3674° | 1.3596° | 0.573 % | 4.554 | 4.526 |
| 0.125 | 0.00126 | 0.6821° | 0.6802° | 0.286 % | 4.537 | 4.526 |

M을 절반으로 줄일 때마다 오차도 절반 → **상대 잔차가 M/p에 1차 비례**하고 정규화 잔차가 ~4.54로
수렴한다. 이 값은 유효 퍼텐셜을 `q=M/p`로 전개한 2차 이론값 `(18+e²)/4`(측정 이심률 기준)와
0.2~2.6% 이내로 일치하며, 그 차이가 M에 거의 비례해 줄어든다(다음 차수 `O(q³)`과 정합) —
잔차가 구현 오류가 아니라 고차 상대론 항임을 정량적으로 뒷받침한다.

**데모 조건**(M=10, `r_peri`=150): 주기당 **87.57°**. 같은 `L`·`r_peri`인데도 보정항 유무에 따라
원지점(apoapsis)이 196.2 대 332.4로 갈린다 — 이 영역에서 보정항은 궤도의 **방향뿐 아니라 형상**을
바꾼다.

**부수 확인**: 모든 측정에서 `r_min` = 진입 반경(150)이고 지평선 클램프(2.5M=25)는 한 번도
작동하지 않았다 → §V 한계 2를 "통상 사용에서는 작동하지 않는 안전장치"로 서술한다.

### §4.3 브라우저 렌더 루프 처리 간격 (`performance.mjs`)

```bash
ROUNDS=10 SEED=20260828 SECONDS=3 node measurements/performance.mjs   # 기본: headed, Chromium
HEADLESS=1 node measurements/performance.mjs                          # (권장하지 않음, 아래 참고)
BROWSER=firefox node measurements/performance.mjs                     # 다른 엔진(주의사항 있음, 아래 참고)
```

**⚠️ 반드시 headed로, 화면을 켜 둔 채 돌릴 것.** 헤드리스 Chromium은 SwiftShader(소프트웨어
래스터라이저)로 떨어져 같은 구성이 **약 6fps**로 측정된다. 스크립트가 `WEBGL_debug_renderer_info`로
렌더러를 확인해 소프트웨어면 경고를 찍는다. headed로 띄워도 **물리 디스플레이가 절전으로 꺼지면**
합성 경로가 달라질 수 있으므로 `caffeinate -d -i -s`(macOS) 등으로 절전을 차단할 것을 권한다.

**⚠️ `BROWSER=firefox`/`webkit`는 vsync 해제 플래그가 적용되지 않는다**(Chromium 전용). 그 결과
측정값이 처리 여유가 아니라 디스플레이 주사율에 그대로 vsync 고정된 값이 된다 — 실제로 100Hz
디스플레이에서 전 조건이 정확히 10.000ms로 나온 것을 확인했다. 논문 §4.3에는 Chromium 결과만
싣는다.

**환경**(2026-08-28 재측정): Apple M4 Max 내장 GPU, Chromium 151(WebGL 2.0, ANGLE/Metal),
1280×720, DPR 1, 격자 200×200, vsync 해제. 프레임 간격 3초 수집 → **10라운드**(조건 순서를
라운드마다 재현 가능한 시드로 무작위화) → 라운드 평균의 중앙값.

| 질량 | 고무판 (ms, [최소,최대]) | Flamm (ms, [최소,최대]) |
|---|---|---|
| 0 | 1.440 [1.337, 1.453] | 1.437 [1.336, 1.458] |
| 1 | 1.551 [1.383, 1.639] | 1.543 [1.410, 1.588] |
| 2 | 1.514 [1.341, 1.595] | 1.543 [1.389, 1.576] |
| 3 | 1.476 [1.380, 1.583] | 1.557 [1.363, 1.607] |
| 4 | 1.497 [1.358, 1.540] | 1.499 [1.363, 1.552] |
| 5 | 1.479 [1.381, 1.530] | 1.502 [1.350, 1.541] |

- 가장 큰 중앙 `requestAnimationFrame` 콜백 간격(Flamm·질량 3개, 약 1.56ms)은 60Hz 예산
  (16.667ms) 대비 **약 10.7배** 작다. 전 조건의 p95(2.6–2.8ms) 기준으로는 **약 6배**.
  이 측정은 GPU 실행시간 자체를 분리한 값이 아니라 브라우저 렌더 루프의 처리 간격이다.
- 이전 초고는 GTX 1070·Windows·3라운드 환경에서 측정해 최악 구성 약 0.64ms(60Hz 대비 26배)를
  보고했다. 측정 장비 교체로 같은 하드웨어 재측정은 불가능했다 — GPU·OS·드라이버가 달라
  **두 환경의 수치를 직접 비교하지 않는다.**
- 질량 개수·모델에 따른 차이는 라운드 간 산포보다 작아 분해되지 않는다.
  **"개수에 따라 선형 증가"라고 주장하지 말 것.**
- p95가 전 조건에서 좁은 범위(2.6–2.8ms)에 뭉친 것은 `performance.now()` 타이머 해상도 축소
  (브라우저의 지문 방지 조치)에 따른 양자화 클러스터링일 가능성이 있으나, GPU timer query를
  쓰지 않았으므로 원인을 단정하지 않는다.

**왜 라운드를 반복·무작위화하나**: 프레임 시간이 수 ms 수준인데 `performance.now()`가 0.1ms로
양자화돼 있어(브라우저 보안 조치) 1회로는 미세 차이를 못 가른다. 열·스케줄링 드리프트도 고정된
측정 순서와 얽히면 순서 편향을 만들므로, 라운드마다 12개 (모델, 질량 개수) 조건의 순서를
재현 가능한 시드로 섞는다(`ROUNDS`/`SEED` 환경변수, 원자료에 시드 기록).

## §4.4 두 모드 궤적 대조 (`mode_contrast.mjs`)

```bash
node measurements/mode_contrast.mjs
```

논문의 핵심 기여(비교 토글)를 평가하는 측정이다. **두 모드는 단위계가 다르므로 물리량을 직접
비교하지 않는다** — 비교 대상은 화면 좌표계에서의 **궤적 형상**(근점/원점 반경, 반경 진동 주기,
주기당 근점 이동)이다.

- **동일 조건의 정의**: 같은 배치에서 **각 모드의 자기 원궤도 값의 K=0.85배**로 초기조건을
  합성한다. 이는 동일한 물리적 위상공간 초기조건이 아니라 동일한 화면 위치·정규화 계수라는
  뜻이다. K<1이라 배치 반경이 원지점(apoapsis)이 되어 궤도가 안쪽으로 돌고 경계(340)에
  닿지 않는다.
- **동기 구동**: 앱의 `updateMassPhysics()`를 고정 간격 1/120으로 직접 밟는다. rAF에 의존하지
  않아 재현된다(`?debug` 훅에 `updateMassPhysics`·`initGeodesic`을 연 이유).
- **소프트닝 통제**: 뉴턴 모드도 세차한다. 그것이 물리가 아니라 소프트닝 `ε` 때문임을 보이려고
  `ε`를 80→2로 줄여가며 잰다. 작은 `ε` 구간에서 세차가 `ε²`에 근접해 0으로 간다.

## 재현 절차 (전체)

```bash
git clone --branch gh-pages --single-branch \
  https://github.com/makyraen/warped-space-demo.git
cd warped-space-demo
npm ci --prefix measurements
npx --prefix measurements playwright install chromium

python3 -m http.server 8777   # 다른 터미널에서

node measurements/energy_drift.mjs
node measurements/convergence.mjs
node measurements/precession.mjs
ROUNDS=10 SEED=20260828 node measurements/performance.mjs
node measurements/mode_contrast.mjs
```

기본 브랜치(`main`)에는 배포용 최소 파일만 있다 — 위처럼 `gh-pages` 브랜치를 명시할 것.
