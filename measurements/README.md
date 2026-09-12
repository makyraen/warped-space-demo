# Warped Space 측정과 검증

앱 코드와 함께 사용하는 수치 검증, 성능 측정 및 원자료이다. 현재 논문은 사다리꼴 각도 갱신을 사용하는 앱과 `performance-current.json`의 macOS(Apple M4 Max, headless Chrome) 측정을 기준으로 한다.

## 준비와 실행

Node.js 20 이상과 Python을 설치한다. 브라우저 측정은 설치된 Edge를 기본으로 사용한다(`msedge` 채널). Edge가 없으면 `WARPED_BROWSER_CHANNEL=chrome`으로 설치된 Chrome을 사용한다 — 현재 논문 수치는 이 방식으로 macOS에서 측정했다. Three.js와 GSAP를 CDN에서 받으므로 인터넷 연결이 필요하다.

`measurements` 폴더에서 다음 명령을 실행한다.

```text
npm ci
python -m pip install -r requirements.txt
```

프로젝트 루트에서 `node serve.mjs`로 앱을 시작한다. 기본 주소는 `http://127.0.0.1:8777/`이다. 다른 포트는 `PORT` 환경변수로 설정할 수 있다. 별도 터미널에서 다음 순서로 실행한다.

```powershell
$env:APP_URL='http://127.0.0.1:8777/index.html?debug'
node measurements/app-smoke.mjs
node measurements/study-smoke.mjs
node measurements/run-regression.mjs
node measurements/reference-validation.mjs
python measurements/analyze-reference.py
node measurements/performance-current.mjs
node measurements/plot-data.mjs
python measurements/plot-results.py
node measurements/verify-results.mjs --data-only
```

스크립트를 재실행하면 해당 결과 파일이 갱신된다. 기존 결과를 유지하려면 별도 체크아웃에서 실행한다. 성능 측정 중에는 다른 수치 실험이나 무거운 작업을 동시에 실행하지 않는다.

비공개 원고를 포함한 원본 저장소에서는 `node measurements/verify-results.mjs`로 원고의 그림 연결과 주요 수치도 확인한다. 공개 배포에는 원고가 없으므로 위의 `--data-only` 옵션을 사용한다. `update-manifest.mjs`는 원본 저장소의 자료 해시를 기록하는 관리용 도구이며 공개 배포에서는 실행하지 않는다.

## 결과 파일

| 파일 | 내용 |
|---|---|
| `results/energy_drift.json`, `results/convergence.json` | semi-implicit Euler와 KDK의 에너지 오차 및 시간간격 수렴 |
| `results/precession.json` | 상대론 보정항 포함 및 제외 조건의 세차 |
| `results/mode_contrast.json` | 두 모델의 화면 조건을 맞춘 궤도 비교와 소프트닝 영향 |
| `results/reference-trajectories.json` | 9궤도 × 2각도 갱신 방식 × 4시간간격의 궤도 표본 |
| `results/reference-validation.json` | 독립 Darwin 매개변수 기준해와의 위치 오차 및 수렴 |
| `results/performance-current.json` | macOS, Apple 내장 GPU, headless Chrome의 개별 프레임과 통계 |
| `results/app-smoke.json`, `results/study-smoke.json` | 실제 앱 연결 및 모델 전환 기능의 자동 점검 |
| `results/legacy/` | 이전 버전에서 수집한 원자료 |
| `results/performance.json`, `results/performance_firefox.json` | 이전 Mac 자료의 중앙값 재계산 기록. 현재 앱의 성능 측정이 아님 |

## 측정 범위와 해석

앱과 독립 기준해 비교의 측정 대상은 `physics/geodesic.mjs`를 함께 사용한다. 기준해 자체는 이 방사 가속도 함수를 호출하지 않고, χ 매개변수 방정식을 SciPy DOP853으로 계산한다. 원자료에는 물리 모듈 SHA-256을 기록한다. 에너지 실험은 앱의 힘 계산을 사용하며, 보정항을 분리하는 세차 실험은 별도 반복문과 앱 가속도 함수의 일치 점검을 사용한다.

독립 기준해 비교에서 기본 시간간격의 최대 표본 위치 오차는 사다리꼴 방식이 오른쪽 끝점 방식보다 20.1–379.6배 작았다. 수렴 차수는 각각 약 2.000과 1.000–1.002이다. 이 결과는 지정된 9개 구속 궤도와 약 6반경 주기에 대한 검증이다.

성능 측정은 2모드 × 물체 수 1·3·5 × 5라운드, 조건당 3초로 수행했다. 라운드 평균의 중앙값은 1.40–1.45 ms였으며, 모든 라운드의 프레임을 합친 p95는 최대 2.60 ms였다. 중앙값은 정렬한 가운데 값(짝수 표본은 가운데 두 값의 평균), 분위수는 Type 7 선형 보간을 사용한다. 이 값은 브라우저 콜백 간격이며 GPU 실행시간이나 실제 화면 주사율이 아니다. headless 실행의 GPU 사용 여부는 원자료의 렌더러 문자열로 확인한다.

`?studyModel=RUBBER`와 `?studyModel=FLAMM`은 비교 평가를 위해 모델을 고정하는 주소다. 전환 동작만 자동 점검했으며 실제 참여자의 사용성 또는 학습 효과 자료는 없다.

`performance.mjs`, `figures*.mjs`, `pagecount.mjs`는 이전 작업용 도구로 남겨 두었다. 현재 논문 결과와 수치 그래프는 위의 실행 절차를 사용한다.
