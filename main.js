import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { gsap } from "https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js";


// 전역 설정
const CONFIG = {
    planeSize: 1000,
    maxMassCount: 5,
    // 상한을 낮게 잡는 이유: 반지름이 질량에 비례하므로 큰 질량은 구가 화면을 지배하고,
    // 곡면 깊이는 최대 5개까지 선형 중첩되어 격자가 과도하게 늘어난다.
    // 100 → 반지름 25, M=5, 단일 질량 우물 깊이 약 139.
    maxMassValue: 100,
    minMassValue: 20,
    // 질량 ↔ 화면상 구 반지름 변환 상수. 아래 massToScale()/scaleToMass()로만 쓸 것.
    // 예전에는 이 값들이 세 곳(고스트 초기 크기, 충전 중 미리보기, 확정 시 역산)에 리터럴로
    // 흩어져 있었고, 하필 scaleBase와 1/scalePerMass가 둘 다 5라서 한쪽만 고치는 사고가 나기
    // 쉬웠다 — §4-1의 음수 질량 버그와 같은 구조다.
    scaleBase: 5.0,          // 질량 0에 해당하는 최소 반지름
    scalePerMass: 0.2,       // 질량 1당 반지름 증가분
    chargeRatePerSec: 50.0,  // 누르고 있는 동안 초당 늘어나는 질량
    gridScale: 100.0,
    gravityK: 100.0, 
    epsilon: 80.0, 
    userMass: 20,
    userHeightOffset: 15,
    physicsSpeedScale: 100.0,
    // Flamm paraboloid: z(r)=sqrt(8M(r-2M)). 시뮬레이션 질량(20~100)을 기하학적 질량 M으로 옮기는 배율.
    // 0.05 → M = 1~5, throat(2M) = 2~10. 구의 반지름(9~25)보다 목이 가늘어야 우물이 '굴뚝'이 아니라
    // '깔때기'가 되고, 구가 우물에 반쯤 잠긴 모습으로 보인다. 이 배율을 키우면 구가 목 안에 갇혀 가려진다.
    massToM: 0.05,
    embedR0: 490.0,  // 임베딩 절단 반지름. 고무판 모드의 가장자리 페이드(350~490)와 끝점을 맞춘다.
    // 질량이 돌아다닐 수 있는 반경. embedR0 밖은 Flamm 깊이가 0으로 잘리고, 프래그먼트 셰이더가
    // 격자를 300~500에서 지운다. 그 구역까지 질량이 나가면 "허공에 뜬 공"으로 보이므로 안쪽에 가둔다.
    massLimit: 340.0,
    // ── Schwarzschild 측지선 운동 (FLAMM 모드) ──
    // 표면(Flamm)과 같은 M = massToM·mass를 쓴다. 옛 뉴턴 궤도의 초기 속도(10~30)는
    // gravityK·physicsSpeedScale로 100배 증폭된 힘에 맞춘 값이라 실제 M에는 탈출속도를 훨씬
    // 웃돈다 — 그대로 재사용하면 궤도가 아니라 직선으로 날아간다. 그래서 FLAMM으로 들어가는
    // 순간(생성 또는 모델 토글) 그 반경에서의 원궤도 각운동량(L_circ)을 다시 계산해 쓴다.
    geodesicEccMin: 1.02, geodesicEccMax: 1.25,  // L_circ에 곱하는 이심률 계수 → 세차가 보이는 타원궤도
    geodesicMinRFactor: 3.5,  // L_circ 공식(r>3M 필요)의 분모 안전 하한, ×M
    geodesicHorizonPad: 2.5,  // 이 반경(×M) 안쪽은 사건지평선 근접 특이점 방지용 정지 클램프(포획/병합 미구현)
    // dτ(고유시간)를 실제 프레임 시간보다 빨리 재생하는 배율. G=M=1 단위에서 진짜 궤도 주기는
    // 화면 스케일(r~100~300)에서 수십 분이 걸려 보이지 않는다 — 궤적 자체는 그대로 두고
    // "빨리 감기"만 하는 것이므로 물리(방정식)는 바뀌지 않는다.
    geodesicTimeScale: 260.0,
    // ── 관찰자(1인칭) 모드 ──
    // 중력에 이끌려 우물로 '떨어지는' 것이 주가 되고, 키 조작은 그 위에 얹는 미세 조정이다.
    // 추진력이 중력만큼 세면 자유낙하가 조작에 묻혀 체험이 사라진다.
    observerThrust: 55.0,
    observerGravityScale: 0.4,   // 우물 근처에서 중력이 폭발해 화면이 튀는 것을 완화
    observerFriction: 1.1,
    observerHeightSmooth: 6.0,   // 카메라 높이 추종 속도(1/s). 가파른 벽에서 화면이 곤두박질치지 않게
    observerLimit: 460.0,
    // 도착 판정: 질량에 이만큼 다가가면 자유낙하가 끝나고 조작권이 넘어온다.
    // 도착 전에는 중력이 주역이라 우물에서 빠져나올 수 없다(= 구에 묶인다).
    observerArrivalPad: 45.0,
    observerFreeThrust: 110.0    // 도착 후에는 중력이 꺼지므로 추진력만으로 움직인다
};
// 질량 ↔ 구 반지름은 반드시 이 한 쌍을 통해서만 오간다(서로의 역함수).
const massToScale = (mass) => CONFIG.scaleBase + mass * CONFIG.scalePerMass;
const scaleToMass = (scale) => (scale - CONFIG.scaleBase) / CONFIG.scalePerMass;

const STAR_COLORS = [0x9bb0ff, 0xaabfff, 0xcad7ff, 0xf8f7ff, 0xfff4ea, 0xffd2a1, 0xffcc6f];
const state = {
    viewMode: 'GOD', model: 'RUBBER', isSpawning: false, isCharging: false, chargeStartTime: 0, masses: [], spawnsInFlight: 0,
    // phase: FALLING(중력이 우물로 끌어당김) → ARRIVED(중력 off, WASD 자유 조작)
    // freeFlight: ARRIVED에서 Space로 전환. false=격자면을 타고 이동, true=y=0 평면 자유비행
    fps: { yaw: 0, pitch: 0, isDragging: false, phase: 'FALLING', freeFlight: false },
    user: { velocity: new THREE.Vector3(), position: new THREE.Vector3(0, 0, 300), smoothY: 0 }
};

const canvas = document.getElementById("webgl");
const vertShader = document.getElementById("vertexShader").textContent;
const fragShader = document.getElementById("fragmentShader").textContent;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.0015);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 1, 5000);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true; 
orbitControls.dampingFactor = 0.05; 
orbitControls.maxDistance = 1500; 
orbitControls.minDistance = 50; 
orbitControls.maxPolarAngle = Math.PI / 2 - 0.05; 

function setGodView() {
    state.viewMode = 'GOD';
    orbitControls.enabled = true;

    gsap.killTweensOf(camera.position);
    gsap.to(camera.position, { x: 0, y: 400, z: 600,
        duration: 1.5, ease: "power2.inOut", onUpdate: () => { camera.lookAt(0, 0, 0); }});

    document.getElementById("view-mode-text").innerText = "GOD MODE"; 
    document.getElementById("view-mode-text").style.color = "#ff8800"; 
    document.body.style.cursor = "default";
}

function setFpsView() {
    state.viewMode = 'FPS'; orbitControls.enabled = false;
    // God 모드 진입 트윈이 살아 있으면 매 프레임 camera.lookAt으로 회전을 덮어써서
    // 마우스 조작과 싸운다("카메라가 이상하게 도는" 증상). 반드시 죽이고 들어간다.
    gsap.killTweensOf(camera.position);
    state.fps.yaw = 0; state.fps.pitch = 0;
    state.fps.phase = 'FALLING'; state.fps.freeFlight = false;
    camera.rotation.set(0, 0, 0, 'YXZ');
    state.user.position.set(0, 0, 300);
    state.user.velocity.set(0, 0, 0);
    state.user.smoothY = surfaceDepth(0, 300);   // 시작 높이를 미리 맞춰 첫 프레임 튐 방지
    camera.position.copy(state.user.position);
    camera.position.y += CONFIG.userHeightOffset;
    updateObserverHud();
    document.body.style.cursor = "grab";
}
setGodView(); 

// 관찰자 HUD: 지금이 자유낙하 중인지, 도착해서 조작권이 넘어왔는지 보여준다.
function updateObserverHud() {
    const el = document.getElementById("view-mode-text");
    if(state.viewMode !== 'FPS') return;
    if(state.fps.phase !== 'ARRIVED') {
        el.innerText = "OBSERVER — 자유낙하 중 (질량에 다가가면 조작 가능)";
        el.style.color = "#00ccff";
    } else if(state.fps.freeFlight) {
        el.innerText = "OBSERVER — 자유비행 (Space: 격자면 붙기)";
        el.style.color = "#88ff88";
    } else {
        el.innerText = "OBSERVER — 격자면 이동 (Space: 자유비행)";
        el.style.color = "#88ff88";
    }
}

const keyState = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
window.addEventListener('keydown', (e) => {
    // 도착 후에만 격자면 붙기 ↔ 자유비행 전환. 낙하 중엔 중력이 주역이라 의미가 없다.
    if(e.code === 'Space' && state.viewMode === 'FPS' && state.fps.phase === 'ARRIVED') {
        e.preventDefault();
        state.fps.freeFlight = !state.fps.freeFlight;
        updateObserverHud();
    }
    // V: 'Switch View' 버튼과 동일 — GOD ↔ OBSERVER 전환
    if(e.code === 'KeyV') { if(state.viewMode === 'GOD') setFpsView(); else setGodView(); }
    // M: 'Add Mass' 시작. 스폰 모드 중이면 다시 눌러 취소(Esc와 동일 동작)
    if(e.code === 'KeyM') { if(state.isSpawning) endSpawnMode(); else startSpawnMode(); }
    // C: 'Model' 버튼과 동일 — 고무판 ↔ Flamm 토글 (Change model. M은 Add Mass가 이미 씀)
    if(e.code === 'KeyC') { toggleModel(); }
    if(keyState.hasOwnProperty(e.code)) keyState[e.code] = true;
});
window.addEventListener('keyup', (e) => { if(keyState.hasOwnProperty(e.code)) keyState[e.code] = false; });
window.addEventListener('mousedown', (e) => { if(state.viewMode === 'FPS' && !e.target.closest('button') && e.button === 0) { state.fps.isDragging = true; document.body.style.cursor = "grabbing"; } });
window.addEventListener('mouseup', () => { state.fps.isDragging = false; if(state.viewMode === 'FPS') document.body.style.cursor = "grab"; });
window.addEventListener('mousemove', (e) => {
    if (state.viewMode === 'FPS' && state.fps.isDragging) {
        const sensitivity = 0.002; 
        state.fps.yaw -= e.movementX * sensitivity; 
        state.fps.pitch -= e.movementY * sensitivity;
        state.fps.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.fps.pitch));
        camera.rotation.set(state.fps.pitch, state.fps.yaw, 0, 'YXZ');
    }
});

function updateUserSimulation(deltaTime) {
    if (state.viewMode !== 'FPS') return;
    const arrived = state.fps.phase === 'ARRIVED';
    const thrustPower = arrived ? CONFIG.observerFreeThrust : CONFIG.observerThrust;
    const inputAccel = new THREE.Vector3();
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction); direction.y = 0; direction.normalize();
    const right = new THREE.Vector3(); right.crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
    
    if(keyState.KeyW) inputAccel.add(direction); 
    if(keyState.KeyS) inputAccel.sub(direction);
    if(keyState.KeyD) inputAccel.add(right); 
    if(keyState.KeyA) inputAccel.sub(right);
    if(inputAccel.lengthSq() > 0) inputAccel.normalize().multiplyScalar(thrustPower);
    
    const gravityAccel = new THREE.Vector3(0, 0, 0); 
    const myPos = state.user.position; 
    const physicsScale = 300.0; 
    
    // 도착 판정: 질량에 충분히 다가가면 자유낙하가 끝나고 조작권이 넘어온다.
    // 이걸 안 하면 중력이 계속 당겨 우물 바닥에서 빠져나올 수 없다(도착 = 감금).
    if(!arrived) {
        for(const m of state.masses) {
            const dx = m.mesh.position.x - myPos.x, dz = m.mesh.position.z - myPos.z;
            const reach = m.mesh.scale.x + CONFIG.observerArrivalPad;
            if(dx*dx + dz*dz < reach * reach) {
                state.fps.phase = 'ARRIVED';
                state.user.velocity.set(0, 0, 0);   // 도착하면 일단 멈춘다
                updateObserverHud();
                break;
            }
        }
    }

    // 도착 후에는 중력을 끈다. 이제 WASD가 유일한 추진력이다.
    if(state.fps.phase !== 'ARRIVED') {
        state.masses.forEach(massObj => {
            const dx = massObj.mesh.position.x - myPos.x;
            const dz = massObj.mesh.position.z - myPos.z;
            const distSq = dx*dx + dz*dz + CONFIG.epsilon*CONFIG.epsilon;
            const dist = Math.sqrt(distSq);
            const effMass = massObj.mass * massObj.growth;
            const forceMagnitude = (CONFIG.gravityK * effMass * CONFIG.userMass) / distSq * physicsScale * CONFIG.observerGravityScale;
            gravityAccel.x += (dx / dist) * forceMagnitude; gravityAccel.z += (dz / dist) * forceMagnitude;
        });
    }

    const totalAccel = inputAccel.add(gravityAccel); state.user.velocity.addScaledVector(totalAccel, deltaTime);
    const friction = CONFIG.observerFriction;
    state.user.velocity.multiplyScalar(Math.max(0, 1.0 - friction * deltaTime));
    state.user.position.addScaledVector(state.user.velocity, deltaTime);

    // 질량과 같은 이유로 원형 경계(사각형이면 모서리에서 격자 밖으로 나간다)
    const r = Math.sqrt(myPos.x*myPos.x + myPos.z*myPos.z);
    if(r > CONFIG.observerLimit) {
        const nx = myPos.x / r, nz = myPos.z / r;
        myPos.x = nx * CONFIG.observerLimit; myPos.z = nz * CONFIG.observerLimit;
        const vn = state.user.velocity.x * nx + state.user.velocity.z * nz;
        if(vn > 0) { state.user.velocity.x -= 1.5 * vn * nx; state.user.velocity.z -= 1.5 * vn * nz; }
    }

    // 카메라 높이를 표면에 딱 붙이면 Flamm의 가파른 벽에서 화면이 곤두박질친다.
    // 목표 높이를 향해 부드럽게 따라가게 한다(프레임률에 무관한 지수 감쇠).
    // 자유비행(Space)이면 우물을 무시하고 y=0 평면 높이로 올라간다.
    const targetY = state.fps.freeFlight ? 0 : surfaceDepth(myPos.x, myPos.z);
    const k = 1.0 - Math.exp(-CONFIG.observerHeightSmooth * deltaTime);
    state.user.smoothY += (targetY - state.user.smoothY) * k;
    myPos.y = state.user.smoothY;

    camera.position.copy(myPos); camera.position.y += CONFIG.userHeightOffset;
}

// 격자면의 하강 깊이(≤0). 정점 셰이더(index.html)의 동일 공식을 CPU에서 재현한다.
// 격자면(GPU)·질량 구·1인칭 카메라(CPU)가 모두 이 값을 써야 한다.
// 셰이더와 어긋나면 구가 면 위에 뜨거나 카메라가 면을 뚫으므로 항상 함께 수정할 것.
function flammZ(M, r) {
    return Math.sqrt(8.0 * M * Math.max(r - 2.0 * M, 0.0));
}

// 반지름 R인 구가 격자면을 뚫지 않고 얹히는 중심 높이.
// 중심 깊이 + R로 두면 평평한 면에서만 맞고, 우물 벽이 가파른 곳(특히 Flamm의 목 주변)에서는
// 구의 옆구리가 벽을 뚫는다. 구가 덮는 원판 위를 표본조사해 어디서도 파고들지 않는 높이를 취한다.
function restHeight(x, z, R) {
    let y = surfaceDepth(x, z) + R;   // 중심점 구속조건
    const RINGS = 4, SECTORS = 8;
    for(let i = 1; i <= RINGS; i++) {
        const d = R * (i / RINGS);          // 중심에서의 수평 거리
        const lift = Math.sqrt(Math.max(R*R - d*d, 0)); // 그 지점에서 구 아랫면까지의 높이
        for(let j = 0; j < SECTORS; j++) {
            const a = (j / SECTORS) * Math.PI * 2;
            const h = surfaceDepth(x + d * Math.cos(a), z + d * Math.sin(a)) + lift;
            if(h > y) y = h;                // 가장 빡빡한 구속조건이 이긴다
        }
    }
    return y;
}

function surfaceDepth(x, z) {
    let depth = 0.0;
    state.masses.forEach(massObj => {
        const dx = x - massObj.mesh.position.x;
        const dz = z - massObj.mesh.position.z;
        const effMass = massObj.mass * massObj.growth;   // 생성 중에는 기여도가 서서히 커진다
        if(effMass <= 0) return;
        if(state.model === 'FLAMM') {
            const M = effMass * CONFIG.massToM;
            const rTrue = Math.sqrt(dx*dx + dz*dz);
            const rc = THREE.MathUtils.clamp(rTrue, 2.0 * M, CONFIG.embedR0);
            depth += -(flammZ(M, CONFIG.embedR0) - flammZ(M, rc));
        } else {
            const rSoft = Math.sqrt(dx*dx + dz*dz + CONFIG.epsilon * CONFIG.epsilon);
            depth += -CONFIG.gravityK * (effMass / rSoft);
        }
    });
    // 고무판은 무한히 뻗으므로 가장자리를 인위적으로 눌러 0으로 만든다.
    // Flamm은 R0에서 이미 0이라 이 보정을 걸면 이중으로 눌려 능선(crease)이 생긴다.
    if(state.model !== 'FLAMM') {
        const distFromCenter = Math.sqrt(x*x + z*z);
        depth *= 1.0 - THREE.MathUtils.smoothstep(350.0, 490.0, distFromCenter);
    }
    return depth;
}

function createStarfield() {
    const starCount = 5000; const geo = new THREE.BufferGeometry(); const pos = new Float32Array(starCount * 3); const colors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
        pos[i*3] = (Math.random() - 0.5) * 2500; pos[i*3+1] = (Math.random() - 0.5) * 1500 + 500; pos[i*3+2] = (Math.random() - 0.5) * 2500;
        const color = new THREE.Color().setHSL(Math.random(), 0.5, 0.8);
        colors[i*3] = color.r; colors[i*3+1] = color.g; colors[i*3+2] = color.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 1.5, vertexColors: true, transparent: true, opacity: 0.8 });
    const stars = new THREE.Points(geo, mat); scene.add(stars); return stars;
}
createStarfield();
// 조명. 예전에는 씬 한가운데 떠 있는 '태양' 구가 유일한 광원이었고, 질량이 하나라도 생기면
// sun.visible=false로 숨겼다. 그런데 three.js는 visible=false인 객체의 자식 광원을 수집하지
// 않으므로 PointLight까지 함께 꺼져, 정작 질량이 있을 때는 구가 emissive만으로 납작하게 보였다.
// 태양 구를 없애고 질량 개수와 무관하게 항상 켜져 있는 조명으로 대체한다.
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const keyLight = new THREE.DirectionalLight(0xfff0e0, 1.2);
keyLight.position.set(200, 400, 300);
scene.add(keyLight);
const planeGeo = new THREE.PlaneGeometry(CONFIG.planeSize, CONFIG.planeSize, 200, 200);
const shaderMat = new THREE.ShaderMaterial({
    vertexShader: vertShader, fragmentShader: fragShader, side: THREE.DoubleSide, transparent: true,
    uniforms: { uTime: { value: 0 }, uMassCount: { value: 0 }, uMassPositions: { value: Array.from({ length: 5 }, () => new THREE.Vector3()) }, uMassValues: { value: new Float32Array(5) }, uK: { value: CONFIG.gravityK }, uEpsilon: { value: CONFIG.epsilon }, uGridColor: { value: new THREE.Color(0x0088ff) }, uBaseColor: { value: new THREE.Color(0x02020a) }, uGridScale: { value: CONFIG.gridScale }, uMode: { value: 0 }, uR0: { value: CONFIG.embedR0 }, uMassToM: { value: CONFIG.massToM }, }
});
const plane = new THREE.Mesh(planeGeo, shaderMat); plane.rotation.x = -Math.PI / 2; scene.add(plane);
const massGeometry = new THREE.SphereGeometry(1, 64, 64); const dragPlane = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial({ visible: false })); dragPlane.rotation.x = -Math.PI / 2; scene.add(dragPlane);

function updateShaderData() {
    shaderMat.uniforms.uMassCount.value = state.masses.length;
    const pos = shaderMat.uniforms.uMassPositions.value; 
    const val = shaderMat.uniforms.uMassValues.value;
    for(let i=0; i<5; i++) {
        if(i < state.masses.length) {
            pos[i].copy(state.masses[i].mesh.position);
            val[i] = state.masses[i].mass * state.masses[i].growth;
        } else {
            pos[i].set(9999,9999,9999); 
            val[i] = 0; 
} 
    }
    // 진행 중(바운스 애니메이션)인 질량까지 합산해 즉시 반영 → 상한 초과 방지 + 버튼 즉시 갱신
    const effectiveCount = state.masses.length + state.spawnsInFlight;
    document.getElementById("mass-count").innerText = `Masses: ${effectiveCount} / ${CONFIG.maxMassCount}`;
    const btnAddEl = document.getElementById("btn-add-mass");
    if(effectiveCount >= CONFIG.maxMassCount) {
        btnAddEl.disabled = true;
        btnAddEl.innerText = "Max Limit Reached";
    } else if(!state.isSpawning) {
        btnAddEl.disabled = false;
        btnAddEl.innerText = "✚ Add Mass (M)";
    }
}

// 질량 i가 다른 질량들로부터 받는 가속도(ax, az). 위치만 보는 순수 함수 —
// leapfrog가 스텝 앞/뒤에서 두 번 불러 "반씩 섞은 힘"을 만드는 데 쓴다.
function computeAcceleration(i) {
    const m1 = state.masses[i];
    let ax = 0, az = 0;
    for(let j=0; j<state.masses.length; j++) {
        if(i === j) continue;
        const m2 = state.masses[j];
        const m2Mass = m2.mass * m2.growth;   // 생성 중인 질량은 중력도 서서히 켜진다
        if(m2Mass <= 0) continue;
        const dx = m2.mesh.position.x - m1.mesh.position.x; const dz = m2.mesh.position.z - m1.mesh.position.z;
        const distSq = dx*dx + dz*dz + CONFIG.epsilon*CONFIG.epsilon; const dist = Math.sqrt(distSq);
        const force = (CONFIG.gravityK * m1.mass * m2Mass) / distSq * CONFIG.physicsSpeedScale;
        ax += (dx/dist) * force / m1.mass;
        az += (dz/dist) * force / m1.mass;
    }
    return { ax, az };
}

function isIntegrated(i) {
    const m1 = state.masses[i];
    return !(i === 0 || m1.settling); // 중심별 고정 + 가라앉는 중엔 제자리
}

// x,z 원형 경계 + 격자면 높이 반영. 뉴턴/측지선 두 경로가 공유한다.
function applyBoundaryAndHeight(obj) {
    const limit = CONFIG.massLimit;
    const r = Math.sqrt(obj.mesh.position.x**2 + obj.mesh.position.z**2);
    if(r > limit) {
        const nx = obj.mesh.position.x / r, nz = obj.mesh.position.z / r;
        obj.mesh.position.x = nx * limit; obj.mesh.position.z = nz * limit;
        const vn = obj.velocity.x * nx + obj.velocity.z * nz;
        if(vn > 0) { obj.velocity.x -= 1.8 * vn * nx; obj.velocity.z -= 1.8 * vn * nz; }
    }
    const myPos = obj.mesh.position;
    obj.mesh.position.y = restHeight(myPos.x, myPos.z, obj.mesh.scale.x);
}

function updateMassPhysics(deltaTime) {
    if(state.model === 'FLAMM') updateGeodesicPhysics(deltaTime);
    else updateNewtonianPhysics(deltaTime);
}

// 물리 시뮬레이션 업데이트 (leapfrog / kick-drift-kick, 뉴턴 N-body — RUBBER 모드)
// Euler(스텝 시작 시점의 힘 하나로 스텝 전체를 민다)는 근접 통과 시 오차가 매번 같은 부호로
// 누적돼 계에 에너지가 주입되고 궤도가 붕괴한다. leapfrog는 스텝의 앞/뒤 힘을 반씩 섞어
// 심플렉틱(시간 가역적) 적분을 만든다 — 에너지가 정확히 보존되진 않지만 발산 없이 진동만 한다.
function updateNewtonianPhysics(deltaTime) {
    const halfDt = deltaTime / 2;

    // kick (반 스텝): 현재 위치에서의 힘으로 속도를 절반만 갱신
    state.masses.forEach((m1, i) => {
        if(!isIntegrated(i)) { m1.velocity.set(0, 0, 0); return; }
        m1.geo = null; // RUBBER로 있는 동안은 측지선 상태를 버려 다음 FLAMM 진입 시 새로 잡는다
        const { ax, az } = computeAcceleration(i);
        m1.velocity.x += ax * halfDt; m1.velocity.z += az * halfDt;
    });

    // drift (한 스텝): 반 스텝 앞선 속도로 위치 이동
    state.masses.forEach((obj) => {
        obj.mesh.position.addScaledVector(obj.velocity, deltaTime);
        applyBoundaryAndHeight(obj);
    });

    // kick (나머지 반 스텝): 새 위치에서 힘을 재계산해 속도를 마저 갱신
    state.masses.forEach((m1, i) => {
        if(!isIntegrated(i)) return;
        const { ax, az } = computeAcceleration(i);
        m1.velocity.x += ax * halfDt; m1.velocity.z += az * halfDt;
    });
}

// 적도면(θ=π/2) Schwarzschild 측지선 — FLAMM 모드.
// 궤도 질량(i>0)은 중심 질량(index 0)의 기하만 느끼는 시험 입자로 취급한다. GR은 비선형이라
// 여러 궤도체가 서로에게도 영향을 주는 엄밀해가 없으므로(§4-2·§8), 서로는 무시한다.
//
// 보존량 E, L로 얻는 유효 퍼텐셜 V_eff(r) = (1-2M/r)(1+L²/r²)에서
//   d²r/dτ² = -½ dV_eff/dr = -M/r² + L²/r³ - 3ML²/r⁴          (뉴턴 항 + 원심 항 + GR 보정 항)
//   dφ/dτ  = L/r²
// 마지막 항(-3ML²/r⁴)이 뉴턴에 없는 GR의 서명이다 — 근일점 세차, ISCO, 광자구를 만드는 항.
function geodesicRadialAccel(r, L, M) {
    const invR = 1 / r;
    return -M * invR*invR + L*L * invR*invR*invR - 3*M*L*L * invR*invR*invR*invR;
}

// obj의 현재 위치·속도(둘 다 중심 질량 기준 상대값)로부터 측지선 상태(r, φ, vr, L)를 새로 잡는다.
// 스폰 직후 첫 진입, 또는 RUBBER↔FLAMM 토글 직후에 호출된다.
// 옛 궤도 속도(뉴턴 힘 증폭에 맞춰 조정된 10~30 범위)는 실제 M 단위에서는 의미가 없으므로
// 그대로 옮기지 않는다 — 현재 반경에서 다시 "그럴듯한 근사원궤도" 각운동량을 합성한다.
function initGeodesic(obj, center, M) {
    const dx = obj.mesh.position.x - center.mesh.position.x;
    const dz = obj.mesh.position.z - center.mesh.position.z;
    const r = Math.max(Math.sqrt(dx*dx + dz*dz), CONFIG.geodesicHorizonPad * M);
    const phi = Math.atan2(dz, dx);
    const rSafe = Math.max(r, CONFIG.geodesicMinRFactor * M); // L_circ 공식은 r>3M 필요
    const Lcirc = Math.sqrt(M * rSafe*rSafe / (rSafe - 3*M));
    const ecc = CONFIG.geodesicEccMin + Math.random() * (CONFIG.geodesicEccMax - CONFIG.geodesicEccMin);
    obj.geo = { r, phi, vr: 0, L: Lcirc * ecc };
}

function updateGeodesicPhysics(deltaTime) {
    if(state.masses.length === 0) return;
    const center = state.masses[0];
    const M = center.mass * center.growth * CONFIG.massToM; // Flamm 표면과 동일한 M
    const dtau = deltaTime * CONFIG.geodesicTimeScale;

    state.masses.forEach((obj, i) => {
        // 중심별 고정(§5-A: 물리 아니라 연출) · 가라앉는 중 · 중심 질량이 아직 성장 중(M=0, 기하 미정의)
        // — 이 경우들도 높이(y)는 매 프레임 갱신해야 하므로 return 대신 아래로 흘려보낸다.
        const skipOrbit = (i === 0) || obj.settling || (M <= 0);
        if(skipOrbit) { obj.velocity.set(0, 0, 0); applyBoundaryAndHeight(obj); return; }

        if(!obj.geo) initGeodesic(obj, center, M);
        const g = obj.geo;
        const rFloor = CONFIG.geodesicHorizonPad * M;

        // leapfrog: r, vr을 kick-drift-kick으로. φ는 갱신된 r로 구적(quadrature).
        g.vr += geodesicRadialAccel(g.r, g.L, M) * dtau / 2;
        g.r += g.vr * dtau;

        if(g.r > CONFIG.massLimit) { g.r = CONFIG.massLimit; if(g.vr > 0) g.vr *= -0.8; }
        if(g.r < rFloor) { g.r = rFloor; g.vr = 0; } // 지평선 근접 클램프. 포획/병합은 미구현(한계로 명시)

        g.phi += (g.L / (g.r*g.r)) * dtau;
        g.vr += geodesicRadialAccel(g.r, g.L, M) * dtau / 2;

        const cosP = Math.cos(g.phi), sinP = Math.sin(g.phi);
        obj.mesh.position.x = center.mesh.position.x + g.r * cosP;
        obj.mesh.position.z = center.mesh.position.z + g.r * sinP;
        // RUBBER로 되돌아갈 때 끊김 없이 이어지도록 Cartesian 속도도 함께 유지해 둔다.
        const vtan = g.L / g.r;
        obj.velocity.x = g.vr * cosP - vtan * sinP;
        obj.velocity.z = g.vr * sinP + vtan * cosP;

        applyBoundaryAndHeight(obj);
    });
}

function createMass(pos, scale, mass) {
    const randomColor = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    const material = new THREE.MeshStandardMaterial({
        color: randomColor, 
        emissive: randomColor, 
        emissiveIntensity: 0.6,
        roughness: 0.3, metalness: 0.5
    });
    const mesh = new THREE.Mesh(massGeometry, material);
    // 스케일 0에서 시작해 부풀어오른다(아래 팝 트윈). 매장 곡면이 꺼지는 방향은 그림을 그리려고
    // 빌려온 여분 차원이지 실제 공간의 '아래'가 아니므로, 질량을 위에서 떨어뜨리면 화면이
    // "위에서 아래로 당기는 배경 중력이 있다"고 말하게 된다. 그것은 하필 이 프로젝트가 비판하는
    // 고무판 비유의 순환논법(설명하려는 중력을 설명에 이미 사용)을 그대로 재현하는 그림이다.
    // 스케일 팝은 방향을 암시하지 않으면서 생성 위치를 똑같이 눈에 띄게 해준다.
    mesh.scale.set(0, 0, 0);
    mesh.position.set(pos.x, surfaceDepth(pos.x, pos.z), pos.z);  // 첫 프레임 깜빡임 방지(이후 매 프레임 갱신)
    mesh.userData = { isMass: true, massValue: mass };
    scene.add(mesh);
    const initialVelocity = new THREE.Vector3();
    if (state.masses.length > 0) {
        const tangent = new THREE.Vector3(-pos.z, 0, pos.x).normalize();
        const speed = (Math.random() * 20 + 10);
        initialVelocity.copy(tangent).multiplyScalar(speed);
    }
    // 질량을 즉시 등록하되 기여도(growth)를 0에서 키운다. 우물이 서서히 깊어지고 공은 매 프레임
    // restHeight를 따라 그 안으로 가라앉는다 = "질량이 놓이자 시공간이 반응한다".
    // 예전에는 공을 y=0까지 떨어뜨린 뒤 착지 순간에 등록해서, 우물이 한 프레임 만에 생기며
    // 공이 바닥으로 순간이동했다("팍 닿는" 느낌). settling 동안은 N-body 적분을 멈춰 둔다.
    const obj = {
        mesh: mesh, mass: mass, velocity: initialVelocity,
        growth: 0, settling: true
    };
    state.masses.push(obj);
    updateShaderData();
    spawnRipple(pos.x, pos.z);   // 질량이 놓이는 순간 곡면을 타고 번진다

    // 구가 부풀어오른다. restHeight가 scale을 반지름으로 쓰므로(구 지오메트리 반지름 = 1)
    // 커지는 동안 자연스럽게 우물 위로 떠오른다.
    gsap.to(mesh.scale, { x: scale, y: scale, z: scale, duration: 0.45, ease: "back.out(1.7)" });
    gsap.to(obj, {
        growth: 1, duration: 1.4, ease: "power2.inOut",
        onComplete: () => { obj.settling = false; updateShaderData(); }
    });
}

// 질량이 얹히는 순간 격자면을 타고 바깥으로 번지는 파문.
// 평평한 고리를 y=0에 두면 우물 위 허공에 판이 뜬 것처럼 보이므로,
// 고리의 각 정점 높이를 매 프레임 격자면 높이(surfaceDepth)에 맞춘다.
function spawnRipple(x, z) {
    const SEGMENTS = 96;
    const positions = new Float32Array((SEGMENTS + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
        color: 0x88ddff, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false   // 빛의 펄스처럼 보이도록
    });
    const ring = new THREE.LineLoop(geo, mat);
    scene.add(ring);

    const wave = { radius: 0.1 };
    const redraw = () => {
        for(let i = 0; i <= SEGMENTS; i++) {
            const a = (i / SEGMENTS) * Math.PI * 2;
            const px = x + Math.cos(a) * wave.radius;
            const pz = z + Math.sin(a) * wave.radius;
            positions[i*3] = px;
            positions[i*3 + 1] = surfaceDepth(px, pz) + 1.5;  // 면에 살짝 띄워 z-fighting 방지
            positions[i*3 + 2] = pz;
        }
        geo.attributes.position.needsUpdate = true;
        geo.computeBoundingSphere();
    };
    redraw();

    gsap.to(wave, { radius: 180, duration: 1.2, ease: "power2.out", onUpdate: redraw });
    gsap.to(mat, { opacity: 0, duration: 1.2, ease: "power1.in", onComplete: () => {
        scene.remove(ring); geo.dispose(); mat.dispose();
    }});
}

const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); let spawnGhost = null; 
const btnAdd = document.getElementById("btn-add-mass"); 
const btnToggle = document.getElementById("btn-toggle-view"); 
const btnReset = document.getElementById("btn-reset");
const btnModel = document.getElementById("btn-toggle-model");
const modelNote = document.getElementById("model-note");

// 리스너 설정
btnReset.addEventListener("click", () => {
    // massGeometry는 모든 질량이 공유하므로 dispose 하지 않음(공유 지오메트리 파괴 방지). material만 정리.
    // 생성 트윈이 도는 중에 지우면, 죽은 객체를 계속 건드리다가 질량도 없는데 파문이 터진다.
    // growth 트윈은 obj에, 팝 트윈은 mesh.scale에 걸려 있으므로 둘 다 죽여야 한다.
    state.masses.forEach(m => { gsap.killTweensOf(m); gsap.killTweensOf(m.mesh.scale); scene.remove(m.mesh); m.mesh.material.dispose(); });
    state.masses = []; state.spawnsInFlight = 0;
    if(state.isSpawning) endSpawnMode();
    updateShaderData(); setGodView();
});

btnToggle.addEventListener("click", () => { if(state.viewMode === 'GOD') setFpsView(); else setGodView(); });

// 고무판(뉴턴 근사) ↔ Flamm paraboloid(Schwarzschild 공간 임베딩) 비교 토글
const MODEL_NOTES = {
    RUBBER: "Rubber-sheet: 뉴턴 퍼텐셜 모양 (−K·m/r). 공간 곡률만 흉내내는 비유.",
    FLAMM: "Flamm paraboloid: z(r)=√(8M(r−2M)), r=500에서 절단. 단일 질량은 엄밀, 다중 질량은 선형 중첩 근사."
};
// 버튼 클릭과 N 키가 공유하는 토글 로직.
function toggleModel() {
    state.model = (state.model === 'RUBBER') ? 'FLAMM' : 'RUBBER';
    const isFlamm = state.model === 'FLAMM';
    shaderMat.uniforms.uMode.value = isFlamm ? 1 : 0;
    btnModel.innerText = (isFlamm ? "Model: Flamm" : "Model: Rubber-sheet") + " (C)";
    btnModel.classList.toggle("flamm", isFlamm);
    modelNote.innerText = MODEL_NOTES[state.model];
}
btnModel.addEventListener("click", toggleModel);
modelNote.innerText = MODEL_NOTES.RUBBER;
// 버튼 클릭과 M 키가 공유하는 진입 로직.
function startSpawnMode() {
    if(state.isSpawning) return; // 이미 스폰 모드면 무시(중복 진입 방지)
    if(state.masses.length + state.spawnsInFlight >= CONFIG.maxMassCount) return;
    state.isSpawning = true; btnAdd.classList.add("active"); btnAdd.innerText = "Click & Hold on Plane... (M/Esc to cancel)"; document.body.style.cursor = "crosshair";
}
btnAdd.addEventListener("click", startSpawnMode);

// 스폰 모드를 안전하게 종료(성공/취소 공통). 고착 상태 복구용.
function endSpawnMode() {
    state.isSpawning = false;
    state.isCharging = false;
    if(spawnGhost) { scene.remove(spawnGhost); spawnGhost.material.dispose(); spawnGhost = null; }
    btnAdd.classList.remove("active");
    document.body.style.cursor = "default";
    updateShaderData();
}
// Esc로 스폰 취소
window.addEventListener("keydown", (e) => { if(e.code === "Escape" && state.isSpawning) endSpawnMode(); });

const contextMenu = document.getElementById("context-menu"); 
const btnDelete = document.getElementById("btn-delete-mass"); let selectedMassForDelete = null;

window.addEventListener("contextmenu", (e) => {
    e.preventDefault(); if(e.target.closest("#ui-layer")) return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1; pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera); 
    const hits = raycaster.intersectObjects(state.masses.map(m => m.mesh));
    if(hits.length > 0) { selectedMassForDelete = hits[0].object; contextMenu.style.display = "block"; contextMenu.style.left = e.clientX + "px"; contextMenu.style.top = e.clientY + "px"; } else { contextMenu.style.display = "none"; }
});
window.addEventListener("click", (e) => { if(!e.target.closest("#context-menu")) contextMenu.style.display = "none"; });
btnDelete.addEventListener("click", () => {
    if(selectedMassForDelete) {
        const index = state.masses.findIndex(m => m.mesh === selectedMassForDelete);
        if(index > -1) {
            // 생성 중이던 질량을 지워도 트윈이 죽은 객체를 계속 건드리지 않도록(growth + 팝 둘 다)
            gsap.killTweensOf(state.masses[index]);
            gsap.killTweensOf(state.masses[index].mesh.scale);
            state.masses.splice(index, 1);
            scene.remove(selectedMassForDelete); selectedMassForDelete.material.dispose();
            updateShaderData();
        }
    }
    contextMenu.style.display = "none";
});
window.addEventListener("pointerdown", (e) => {
    if(e.target.closest("#ui-layer") || e.target.closest("#context-menu") || e.button === 2) return;
    if(state.viewMode === 'FPS' && !state.isSpawning) return;
    if(state.isSpawning) {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1; pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        state.isCharging = true; state.chargeStartTime = performance.now();
        spawnGhost = new THREE.Mesh(massGeometry, new THREE.MeshBasicMaterial({color: 0xffffff, wireframe:true, transparent:true, opacity:0.5}));
        // 최소 질량에 해당하는 초기 크기. 홀드 없이 빠르게 클릭해도 음수 질량이 나오지 않는다.
        spawnGhost.scale.setScalar(massToScale(CONFIG.minMassValue));
        spawnGhost.position.copy(spawnPointFromRay()); scene.add(spawnGhost);
    }
});

// 화면 어디를 클릭해도 생성 지점을 하나 정해준다.
// 예전에는 y=0 평면과의 교점만 썼기 때문에, 카메라가 수평선 위(하늘)를 보고 있으면 광선이
// 평면과 만나지 않아 클릭이 통째로 무시됐다. 그 경우 카메라 앞쪽 바닥으로 떨어뜨린다.
function spawnPointFromRay() {
    const p = new THREE.Vector3();
    const hit = raycaster.intersectObject(dragPlane);
    if(hit.length > 0) {
        p.copy(hit[0].point);
    } else {
        // 하늘을 보고 있는 경우: 시선의 수평 성분을 따라 카메라 앞 300 지점
        const fwd = raycaster.ray.direction.clone(); fwd.y = 0;
        if(fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);   // 완전히 수직으로 보는 극단적 경우
        fwd.normalize();
        p.copy(camera.position).addScaledVector(fwd, 300); p.y = 0;
    }
    // 격자가 그려지고 질량이 머물 수 있는 원 안으로 가둔다(밖에 두면 허공에 뜬 공이 된다)
    const r = Math.sqrt(p.x*p.x + p.z*p.z);
    if(r > CONFIG.massLimit) { p.x *= CONFIG.massLimit / r; p.z *= CONFIG.massLimit / r; }
    return p;
}
window.addEventListener("pointermove", (e) => {
    if(state.isSpawning && state.isCharging && spawnGhost) {
        const duration = (performance.now() - state.chargeStartTime) / 1000;
        // 질량을 먼저 상한으로 자르고 반지름은 거기서 유도한다. 반지름을 따로 한 번 더 자르면
        // 두 상한이 어긋날 수 있다(예전의 Math.min(scale, 50)은 질량 상한에 이미 가려진 죽은 코드였다).
        const currentMass = Math.min(CONFIG.minMassValue + duration * CONFIG.chargeRatePerSec, CONFIG.maxMassValue);
        spawnGhost.scale.setScalar(massToScale(currentMass));
    }
});
window.addEventListener("pointerup", (e) => {
    if(!state.isSpawning) return;
    // pointerdown에는 UI 위 클릭을 거르는 가드가 있는데 pointerup엔 없었다 — 충전 중 마우스를
    // Reset/Toggle 같은 UI 버튼 위로 가져가 놓으면, 그 버튼 클릭과 동시에 질량이 생성돼 버려
    // 버튼 동작과 뒤섞이는 문제가 있었다(QA에서 발견, §5-B). UI 위에서 놓으면 그냥 취소한다.
    // canvas에서 누른 포인터는 암묵적으로 캡처될 수 있어 e.target이 여전히 canvas를 가리킬 수
    // 있으므로, e.target 대신 실제 좌표 밑에 뭐가 있는지(elementFromPoint)로 판단한다.
    const overUI = document.elementFromPoint(e.clientX, e.clientY)?.closest("#ui-layer, #context-menu");
    if(overUI) { endSpawnMode(); return; }
    if(state.isCharging && spawnGhost) {
        // 질량을 [최소, 최대]로 자른 뒤 반지름을 그 질량에서 되돌린다. 고스트 반지름을 그대로
        // 쓰면 반올림이나 이후 수정으로 둘이 어긋날 수 있으므로, 확정 값은 질량 하나에서만 유도한다.
        const finalMass = THREE.MathUtils.clamp(
            scaleToMass(spawnGhost.scale.x), CONFIG.minMassValue, CONFIG.maxMassValue);
        const position = spawnGhost.position.clone();
        createMass(position, massToScale(finalMass), finalMass);
    }
    // charging 여부와 무관하게 항상 스폰 모드 종료 → '버튼 먹통' 고착 방지
    endSpawnMode();
});

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.3; 
bloomPass.strength = 1.2; 
bloomPass.radius = 0.5;
composer.addPass(bloomPass);

const clock = new THREE.Clock();
function animate() {
    const deltaTime = clock.getDelta(); 
    const time = clock.getElapsedTime();
    shaderMat.uniforms.uTime.value = time;
    if(state.viewMode === 'GOD') orbitControls.update();
    updateUserSimulation(deltaTime);
    if(state.masses.length > 0) { updateMassPhysics(deltaTime); updateShaderData(); }
    composer.render(); requestAnimationFrame(animate);
}
animate();
window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight); 
    composer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; 
    camera.updateProjectionMatrix();
});
