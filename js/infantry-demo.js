// ═══ 步兵测试 Demo 驱动：雪原场景 + 三阵营行军班 + 炮击/机枪交互 ═══
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Squad, FACTIONS } from './infantry.js';

// ── 渲染器/场景 ──
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xc3c9d0, 0.006);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500);
camera.position.set(14, 10, 26);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.maxPolarAngle = Math.PI * 0.52;
controls.update();

// ── 光照（阿登阴昼同款） ──
scene.add(new THREE.HemisphereLight(0x9aa6b4, 0x878d94, 1.65));
scene.add(new THREE.AmbientLight(0x9ba2ac, 0.5));
const sun = new THREE.DirectionalLight(0xdfe6ee, 2.2);
sun.position.set(30, 34, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = 45;
sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
sun.shadow.bias = -0.0006;
scene.add(sun);

// ── 雪地 ──
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(300, 300, 60, 60),
  new THREE.MeshStandardMaterial({ color: 0xc6ccd4, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
// 轻微起伏
{
  const p = ground.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, Math.sin(x * 0.08) * Math.cos(y * 0.07) * 0.35);
  }
  ground.geometry.computeVertexNormals();
}
ground.receiveShadow = true;
scene.add(ground);
const groundY = (x, z) => Math.sin(x * 0.08) * Math.cos(z * 0.07) * 0.35;

// ── 雪松树点缀（简易锥体，营造比例感） ──
{
  const geo = new THREE.ConeGeometry(1.6, 5.5, 7);
  geo.translate(0, 2.75, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xdde3e8, roughness: 0.9 });
  const trees = new THREE.InstancedMesh(geo, mat, 40);
  const m4 = new THREE.Matrix4();
  let ti = 0;
  const rng = (a, b) => a + Math.random() * (b - a);
  while (ti < 40) {
    const x = rng(-70, 70), z = rng(-70, 70);
    if (Math.abs(x) < 20 && Math.abs(z) < 30) continue;   // 让出行军场
    const s = rng(0.7, 1.5);
    m4.makeScale(s, s, s).setPosition(x, groundY(x, z), z);
    trees.setMatrixAt(ti++, m4);
  }
  trees.castShadow = true;
  scene.add(trees);
}

// ── 三个行军班（德/美/苏，平行纵队） ──
const squads = [
  new Squad(scene, {
    faction: 'de', count: 8, speed: 1.25,
    path: [[-8, -26], [-8, 26], [-16, 26], [-16, -26]],
  }),
  new Squad(scene, {
    faction: 'us', count: 8, speed: 1.3,
    path: [[0, 26], [0, -26], [8, -26], [8, 26]],
  }),
  new Squad(scene, {
    faction: 'su', count: 8, speed: 1.2,
    path: [[16, -20], [16, 20], [24, 20], [24, -20]],
  }),
];

// ── 炮击特效（白尘爆点 + 扩散环） ──
const fx = [];
const puffTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.5, 'rgba(240,244,248,0.4)');
  gr.addColorStop(1, 'rgba(240,244,248,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
function shellFx(p) {
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0.85, depthWrite: false }));
    const a = Math.random() * Math.PI * 2;
    s.position.set(p.x, p.y + 0.5, p.z);
    s.scale.setScalar(1.5);
    scene.add(s);
    fx.push({
      obj: s, t: 0, life: 1.2 + Math.random() * 0.8,
      vx: Math.sin(a) * (2 + Math.random() * 4), vy: 2.5 + Math.random() * 4, vz: Math.cos(a) * (2 + Math.random() * 4),
      s0: 1.5, s1: 9 + Math.random() * 5,
    });
  }
}

// ── 交互：点地=炮击 / 点兵=机枪命中 ──
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // 先打士兵（点兵=机枪）
  const soldierMeshes = [];
  for (const sq of squads) for (const s of sq.soldiers) if (s.state !== 'dead') s.root.traverse(o => { if (o.isMesh) soldierMeshes.push(o); });
  const hitS = ray.intersectObjects(soldierMeshes, false)[0];
  if (hitS && hitS.object.userData.soldier) {
    hitS.object.userData.soldier.kill();
    return;
  }
  // 打地面（点地=炮击）
  const hitG = ray.intersectObject(ground, false)[0];
  if (hitG) {
    const p = hitG.point.clone();
    p.y = groundY(p.x, p.z);
    shellFx(p);
    for (const sq of squads) sq.shellAt(p, 6, 22, 4);
  }
});

// ── 主循环 ──
const statsEl = document.getElementById('stats');
const clock = new THREE.Clock();
let fpsN = 0, fpsT = 0, fps = 0;
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const sq of squads) sq.update(dt);
  // 特效推进
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t += dt;
    const k = f.t / f.life;
    if (k >= 1) { scene.remove(f.obj); fx.splice(i, 1); continue; }
    f.obj.position.x += f.vx * dt;
    f.obj.position.y += f.vy * dt;
    f.obj.position.z += f.vz * dt;
    f.vy -= 3 * dt;
    f.obj.scale.setScalar(f.s0 + (f.s1 - f.s0) * k);
    f.obj.material.opacity = 0.85 * (1 - k);
  }
  fpsN++; fpsT += dt;
  if (fpsT > 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  statsEl.textContent = `FPS ${fps}\n` + squads.map((sq, i) =>
    `${Object.values(FACTIONS)[i].label} 存活 ${sq.aliveCount()}/${sq.soldiers.length}${sq.alertT > 0 ? '（卧倒!）' : ''}`).join('\n');
  controls.update();
  renderer.render(scene, camera);
}
tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── 测试钩子（截图脚本用） ──
window.__demo = {
  worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (-v.y + 1) / 2 * innerHeight };
  },
  lookAt(x, y, z, dist) {
    controls.target.set(x, y, z);
    const d = camera.position.clone().sub(controls.target).normalize().multiplyScalar(dist);
    camera.position.copy(controls.target).add(d).add(new THREE.Vector3(0, dist * 0.35, 0));
  },
  firstAliveSoldierScreen() {
    for (const sq of squads) for (const s of sq.soldiers) {
      if (s.state !== 'dead') {
        const p = s.root.position.clone(); p.y += 1.0;
        return this.worldToScreen(p.x, p.y, p.z);
      }
    }
    return null;
  },
  squads,
};
