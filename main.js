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
    maxMassValue: 200, 
    minMassValue: 20,
    gridScale: 100.0, 
    gravityK: 100.0, 
    epsilon: 80.0, 
    userMass: 20,
    userHeightOffset: 15,
    physicsSpeedScale: 100.0,
    // Flamm paraboloid: z(r)=sqrt(8M(r-2M)). 시뮬레이션 질량(20~200)을 기하학적 질량 M으로 옮기는 배율.
    // 0.05 → M = 1~10, throat(2M) = 2~20. 구의 반지름(9~45)보다 목이 가늘어야 우물이 '굴뚝'이 아니라
    // '깔때기'가 되고, 구가 우물에 반쯤 잠긴 모습으로 보인다. 이 배율을 키우면 구가 목 안에 갇혀 가려진다.
    massToM: 0.05,
    embedR0: 490.0,  // 임베딩 절단 반지름. 고무판 모드의 가장자리 페이드(350~490)와 끝점을 맞춘다.
    // 질량이 돌아다닐 수 있는 반경. embedR0 밖은 Flamm 깊이가 0으로 잘리고, 프래그먼트 셰이더가
    // 격자를 300~500에서 지운다. 그 구역까지 질량이 나가면 "허공에 뜬 공"으로 보이므로 안쪽에 가둔다.
    massLimit: 340.0,
    dropHeight: 220.0   // 질량을 이 높이에서 떨어뜨린다(생성 순간을 눈으로 좇을 수 있게)
};
const STAR_COLORS = [0x9bb0ff, 0xaabfff, 0xcad7ff, 0xf8f7ff, 0xfff4ea, 0xffd2a1, 0xffcc6f];
const state = {
    viewMode: 'GOD', model: 'RUBBER', isSpawning: false, isCharging: false, chargeStartTime: 0, masses: [], spawnsInFlight: 0,
    fps: { yaw: 0, pitch: 0, isDragging: false },
    user: { velocity: new THREE.Vector3(), position: new THREE.Vector3(0, 0, 300) }
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
    
    gsap.to(camera.position, { x: 0, y: 400, z: 600, 
        duration: 1.5, ease: "power2.inOut", onUpdate: () => { camera.lookAt(0, 0, 0); }});
    
    document.getElementById("view-mode-text").innerText = "GOD MODE"; 
    document.getElementById("view-mode-text").style.color = "#ff8800"; 
    document.body.style.cursor = "default";
}

function setFpsView() {
    state.viewMode = 'FPS'; orbitControls.enabled = false; 
    state.fps.yaw = 0; state.fps.pitch = 0;
    camera.rotation.set(0, 0, 0); 
    state.user.position.set(0, 0, 300); 
    state.user.velocity.set(0, 0, 0);
    camera.position.copy(state.user.position); 
    camera.position.y += CONFIG.userHeightOffset;
    document.getElementById("view-mode-text").innerText = "OBSERVER (Drag to Look)"; 
    document.getElementById("view-mode-text").style.color = "#00ccff"; 
    document.body.style.cursor = "grab";
}
setGodView(); 

const keyState = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
window.addEventListener('keydown', (e) => { if(keyState.hasOwnProperty(e.code)) keyState[e.code] = true; });
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
    const thrustPower = 200.0; 
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
    
    state.masses.forEach(massObj => {
        const dx = massObj.mesh.position.x - myPos.x; 
        const dz = massObj.mesh.position.z - myPos.z;
        const distSq = dx*dx + dz*dz + CONFIG.epsilon*CONFIG.epsilon; 
        const dist = Math.sqrt(distSq);
        const forceMagnitude = (CONFIG.gravityK * massObj.mass * CONFIG.userMass) / distSq * physicsScale;
        gravityAccel.x += (dx / dist) * forceMagnitude; gravityAccel.z += (dz / dist) * forceMagnitude;
    });
    
    const totalAccel = inputAccel.add(gravityAccel); state.user.velocity.addScaledVector(totalAccel, deltaTime);
    const friction = 0.5; state.user.velocity.multiplyScalar(1.0 - friction * deltaTime);
    state.user.position.addScaledVector(state.user.velocity, deltaTime);
    const mapLimit = 480;
    if(Math.abs(state.user.position.x) > mapLimit) { state.user.position.x = Math.sign(state.user.position.x) * mapLimit; state.user.velocity.x *= -0.5; }
    if(Math.abs(state.user.position.z) > mapLimit) { state.user.position.z = Math.sign(state.user.position.z) * mapLimit; state.user.velocity.z *= -0.5; }
    state.user.position.y = surfaceDepth(myPos.x, myPos.z);
    camera.position.copy(state.user.position); camera.position.y += CONFIG.userHeightOffset;
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
const sunGeo = new THREE.SphereGeometry(15, 32, 32); const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffee }); const sun = new THREE.Mesh(sunGeo, sunMat); sun.position.set(0, 200, 0); scene.add(sun); sun.add(new THREE.PointLight(0xffaa00, 2, 1000));
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
        btnAddEl.innerText = "✚ Add Mass";
    }
    sun.visible = (state.masses.length === 0);
}

// 물리 시뮬레이션 업데이트
function updateMassPhysics(deltaTime) {
    // 속도 계산 
    for(let i=0; i<state.masses.length; i++) {
        const m1 = state.masses[i];
        if (i === 0) { m1.velocity.set(0, 0, 0); continue; } // 중심별 고정
        if (m1.settling) { m1.velocity.set(0, 0, 0); continue; } // 가라앉는 중엔 제자리
        for(let j=0; j<state.masses.length; j++) {
            if(i === j) continue;
            const m2 = state.masses[j];
            const m2Mass = m2.mass * m2.growth;   // 생성 중인 질량은 중력도 서서히 켜진다
            if(m2Mass <= 0) continue;
            const dx = m2.mesh.position.x - m1.mesh.position.x; const dz = m2.mesh.position.z - m1.mesh.position.z;
            const distSq = dx*dx + dz*dz + CONFIG.epsilon*CONFIG.epsilon; const dist = Math.sqrt(distSq);
            const force = (CONFIG.gravityK * m1.mass * m2Mass) / distSq * CONFIG.physicsSpeedScale;
            const ax = (dx/dist) * force; const az = (dz/dist) * force;
            m1.velocity.x += (ax / m1.mass) * deltaTime; m1.velocity.z += (az / m1.mass) * deltaTime;
        }
    }
    
    // 위치 및 높이 업데이트
    state.masses.forEach((obj) => {
        obj.mesh.position.addScaledVector(obj.velocity, deltaTime);
        // 사각형 벽이 아니라 원형 경계로 가둔다. 격자가 보이는 영역이 원형이므로 모서리로 나가면
        // 그리드가 페이드로 지워진 구역에 공이 놓여 "허공에 뜬" 것처럼 보인다.
        const limit = CONFIG.massLimit;
        const r = Math.sqrt(obj.mesh.position.x**2 + obj.mesh.position.z**2);
        if(r > limit) {
            const nx = obj.mesh.position.x / r, nz = obj.mesh.position.z / r;
            obj.mesh.position.x = nx * limit; obj.mesh.position.z = nz * limit;
            // 경계 법선 방향 속도 성분만 반사(접선 성분은 유지)
            const vn = obj.velocity.x * nx + obj.velocity.z * nz;
            if(vn > 0) { obj.velocity.x -= 1.8 * vn * nx; obj.velocity.z -= 1.8 * vn * nz; }
        }

        const myPos = obj.mesh.position;
        obj.mesh.position.y = restHeight(myPos.x, myPos.z, obj.mesh.scale.x) + obj.dropOffset;
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
    mesh.scale.set(scale, scale, scale);
    mesh.position.set(pos.x, CONFIG.dropHeight, pos.z);  // 첫 프레임 깜빡임 방지(이후 매 프레임 갱신)
    mesh.userData = { isMass: true, massValue: mass };
    scene.add(mesh);
    const initialVelocity = new THREE.Vector3();
    if (state.masses.length > 0) {
        const tangent = new THREE.Vector3(-pos.z, 0, pos.x).normalize();
        const speed = (Math.random() * 20 + 10);
        initialVelocity.copy(tangent).multiplyScalar(speed);
    }
    // 질량을 즉시 등록하되 기여도(growth)를 0에서 키운다. 우물이 서서히 깊어지고 공은 매 프레임
    // restHeight를 따라 그 안으로 가라앉는다.
    // 예전에는 공을 y=0까지 떨어뜨린 뒤 착지 순간에 등록해서, 우물이 한 프레임 만에 생기며
    // 공이 바닥으로 순간이동했다("팍 닿는" 느낌). settling 동안은 N-body 적분을 멈춰 둔다.
    // 높이는 두 단계로 나뉜다.
    //   ① 낙하: dropOffset이 위에서 0으로 줄며 공이 면으로 떨어진다(가속하는 ease-in).
    //   ② 가라앉기: growth가 0→1로 자라며 우물이 깊어지고, 공은 restHeight를 따라 그 안으로 잠긴다.
    // 매 프레임 y = restHeight(현재 우물) + dropOffset 이므로 두 단계가 끊김 없이 이어진다.
    const obj = {
        mesh: mesh, mass: mass, velocity: initialVelocity,
        growth: 0, settling: true, dropOffset: CONFIG.dropHeight
    };
    state.masses.push(obj);
    updateShaderData();

    gsap.to(obj, {
        dropOffset: 0, duration: 0.7, ease: "power2.in",   // 자유낙하처럼 가속
        onComplete: () => spawnRipple(pos.x, pos.z)         // 파문은 '닿는 순간'에
    });
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
    state.masses.forEach(m => { gsap.killTweensOf(m); scene.remove(m.mesh); m.mesh.material.dispose(); });
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
btnModel.addEventListener("click", () => {
    state.model = (state.model === 'RUBBER') ? 'FLAMM' : 'RUBBER';
    const isFlamm = state.model === 'FLAMM';
    shaderMat.uniforms.uMode.value = isFlamm ? 1 : 0;
    btnModel.innerText = isFlamm ? "Model: Flamm" : "Model: Rubber-sheet";
    btnModel.classList.toggle("flamm", isFlamm);
    modelNote.innerText = MODEL_NOTES[state.model];
});
modelNote.innerText = MODEL_NOTES.RUBBER;
btnAdd.addEventListener("click", () => {
    if(state.isSpawning) return; // 이미 스폰 모드면 무시(중복 진입 방지)
    if(state.masses.length + state.spawnsInFlight >= CONFIG.maxMassCount) return;
    state.isSpawning = true; btnAdd.classList.add("active"); btnAdd.innerText = "Click & Hold on Plane..."; document.body.style.cursor = "crosshair";
});

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
            gsap.killTweensOf(state.masses[index]);   // 생성 중이던 질량을 지워도 파문이 남지 않도록
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
        spawnGhost.scale.set(9, 9, 9); // 최소 질량(=minMassValue)에 해당하는 초기 크기. 빠른 클릭 시 음수 질량 방지
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
        let currentMass = Math.min(CONFIG.minMassValue + duration * 50, CONFIG.maxMassValue);
        let scale = 5 + currentMass * 0.2; 
        scale = Math.min(scale, 50); 
        spawnGhost.scale.set(scale, scale, scale);
    }
});
window.addEventListener("pointerup", (e) => {
    if(!state.isSpawning) return;
    if(state.isCharging && spawnGhost) {
        const finalScale = spawnGhost.scale.x;
        const finalMass = Math.max(CONFIG.minMassValue, (finalScale - 5) * 5); // 음수 질량 방지
        const position = spawnGhost.position.clone();
        createMass(position, finalScale, finalMass);
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