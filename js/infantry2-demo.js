// ═══ 步兵 v2 Demo 驱动：姿态审查台（德/美/苏三兵）+ 行军班 + 炮击/机枪交互 ═══
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SoldierRig, Squad, FACTIONS } from './infantry2.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ── 渲染器/场景/相机 ──
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfc6cd);
scene.fog = new THREE.FogExp2(0xc3c9d0, 0.005);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 500);
camera.position.set(4, 3.2, 13);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, 4);
controls.maxPolarAngle = Math.PI * 0.55;
controls.update();

// ── 光照（阿登阴昼） ──
scene.add(new THREE.HemisphereLight(0x9aa6b4, 0x878d94, 1.65));
scene.add(new THREE.AmbientLight(0x9ba2ac, 0.5));
const sun = new THREE.DirectionalLight(0xdfe6ee, 2.2);
sun.position.set(18, 26, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = 40;
sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
sun.shadow.bias = -0.0006;
scene.add(sun);

// ── 雪地（微起伏） ──
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 240, 48, 48),
  new THREE.MeshStandardMaterial({ color: 0xc6ccd4, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
{
  const p = ground.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 0.08) * Math.cos(p.getY(i) * 0.07) * 0.3);
  ground.geometry.computeVertexNormals();
}
ground.receiveShadow = true;
scene.add(ground);
const groundY = (x, z) => Math.sin(x * 0.08) * Math.cos(z * 0.07) * 0.3;

// ── 雪松点缀 ──
{
  const geo = new THREE.ConeGeometry(1.6, 5.5, 7);
  geo.translate(0, 2.75, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xdde3e8, roughness: 0.9 });
  const trees = new THREE.InstancedMesh(geo, mat, 36);
  const m4 = new THREE.Matrix4();
  let ti = 0;
  while (ti < 36) {
    const x = (Math.random() - 0.5) * 130, z = (Math.random() - 0.5) * 130;
    if (Math.abs(x) < 22 && Math.abs(z) < 28) continue;
    const s = 0.7 + Math.random() * 0.8;
    m4.makeScale(s, s, s).setPosition(x, groundY(x, z), z);
    trees.setMatrixAt(ti++, m4);
  }
  trees.castShadow = true;
  scene.add(trees);
}

// ── 特效（雪原风格白尘/火光） ──
const effects = [];
function spriteTex(inner = 'rgba(255,255,255,0.9)', outer = 'rgba(240,244,248,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const puffTex = spriteTex();
const flashTex = spriteTex('rgba(255,240,200,1)', 'rgba(255,140,40,0)');
function puff(p, n = 8, white = true) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: white ? puffTex : flashTex, transparent: true, opacity: 0.8, depthWrite: false }));
    const a = Math.random() * Math.PI * 2;
    s.position.set(p.x, p.y + 0.4, p.z);
    s.scale.setScalar(1.2);
    scene.add(s);
    effects.push({
      obj: s, t: 0, life: 1 + Math.random() * 0.8,
      vx: Math.sin(a) * (1.5 + Math.random() * 3.5), vy: 2 + Math.random() * 3.5, vz: Math.cos(a) * (1.5 + Math.random() * 3.5),
      s0: 1.2, s1: 8 + Math.random() * 4, fire: !white,
    });
  }
}
function tracer(p, dir) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 2.2),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
  m.position.copy(p);
  m.quaternion.setFromUnitVectors(V3(0, 0, 1), dir);
  scene.add(m);
  effects.push({ obj: m, t: 0, life: 0.25, vx: dir.x * 85, vy: dir.y * 85, vz: dir.z * 85, s0: 1, s1: 1, tracer: true });
}
const fxCbs = {
  onMuzzle(pos, dir) {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    f.position.copy(pos); f.scale.setScalar(0.5);
    scene.add(f);
    effects.push({ obj: f, t: 0, life: 0.1, vx: 0, vy: 0, vz: 0, s0: 0.5, s1: 0.3, fire: true });
    tracer(pos.clone().addScaledVector(dir, 0.5), dir);
    puff(pos, 2);
  },
  onDust(x, y, z, n) { puff(V3(x, y, z), n * 2); },
  onThrow(pos, vel) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x50574d, roughness: 0.6 }));
    g.position.copy(pos);
    scene.add(g);
    effects.push({ obj: g, t: 0, life: 1.6, vx: vel.x, vy: vel.y, vz: vel.z, grenade: true, s0: 1, s1: 1 });
  },
};

// ── 前景姿态审查台：德/美/苏三兵 ──
const showcase = [];
['de', 'us', 'su'].forEach((fk, i) => {
  const rig = new SoldierRig(scene, fk, { snow: i === 1 ? false : true });
  rig.root.position.set((i - 1) * 1.6, groundY((i - 1) * 1.6, 5), 5);
  rig.root.rotation.y = Math.PI;
  rig.home.copy(rig.root.position);   // 锚点对齐摆放位（构造时 root 尚在原点）
  rig.root.traverse(o => { o.userData.rig = rig; });
  showcase.push(rig);
});
function resetShowcase() {
  showcase.forEach((rig, i) => {
    rig.root.position.set((i - 1) * 1.6, groundY((i - 1) * 1.6, 5), 5);
    rig.root.quaternion.identity();
    rig.root.rotation.y = Math.PI;
    rig.home.copy(rig.root.position);
  });
}

// ── 行军班（背景，三阵营） ──
const squads = [
  new Squad(scene, { faction: 'de', count: 8, speed: 1.05, groundY, snow: true, path: [[-14, -20], [-14, 18], [-22, 18], [-22, -20]] }),
  new Squad(scene, { faction: 'us', count: 8, speed: 1.1, groundY, snow: true, path: [[14, 18], [14, -20], [22, -20], [22, 18]] }),
  new Squad(scene, { faction: 'su', count: 8, speed: 1.0, groundY, snow: true, path: [[-4, -30], [-4, -14], [4, -14], [4, -30]] }),
];
for (const sq of squads) for (const s of sq.soldiers) s.root.traverse(o => { o.userData.rig = s; });

// ── 姿态按钮 ──
const anims = [
  ['idle', '待机'], ['guard', '站岗'], ['port_arms', '双手持枪'],
  ['walk_sling', '行军(背枪)'], ['walk', '前进(持枪)'], ['crouch', '低姿前进'],
  ['sprint', '冲刺'], ['stand_fire', '立射'], ['kneel_fire', '跪射'],
  ['prone_fire', '卧射'], ['prone_alert', '受惊卧倒'], ['throw', '投雷'],
  ['death', '中弹'], ['death_fwd', '前扑'], ['explode', '炸飞'],
];
const btnsEl = document.getElementById('animBtns');
for (const [name, label] of anims) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => {
    resetShowcase();
    showcase.forEach(r => r.setState(name));
    document.querySelectorAll('#animBtns button').forEach(x => x.classList.toggle('on', x === b));
  };
  btnsEl.appendChild(b);
}

// ── 交互：点地=炮击 / 点兵=机枪 ──
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const meshes = [];
  for (const sq of squads) for (const s of sq.soldiers) if (s.alive) s.root.traverse(o => { if (o.isMesh) meshes.push(o); });
  const hitS = ray.intersectObjects(meshes, false)[0];
  if (hitS && hitS.object.userData.rig) {
    const rig = hitS.object.userData.rig;
    for (const sq of squads) if (sq.soldiers.includes(rig)) sq.mgHit(rig);
    return;
  }
  const hitG = ray.intersectObject(ground, false)[0];
  if (hitG) {
    const p = hitG.point.clone();
    puff(p, 12, false);
    puff(p, 10, true);
    for (const sq of squads) sq.shellAt(p, 5.5, 20, 4, fxCbs);
  }
});

// ── 主循环 ──
const statsEl = document.getElementById('stats');
const clock = new THREE.Clock();
let fpsN = 0, fpsT = 0, fps = 0;
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const r of showcase) r.update(dt, fxCbs);
  for (const sq of squads) sq.update(dt, fxCbs);
  for (let i = effects.length - 1; i >= 0; i--) {
    const f = effects[i];
    f.t += dt;
    const k = f.t / f.life;
    if (k >= 1) {
      if (f.grenade) { puff(f.obj.position, 10, false); puff(f.obj.position, 8, true); }
      scene.remove(f.obj); effects.splice(i, 1); continue;
    }
    f.obj.position.x += f.vx * dt;
    f.obj.position.y += f.vy * dt;
    f.obj.position.z += f.vz * dt;
    if (f.grenade) { f.vy -= 9.8 * dt; if (f.obj.position.y <= groundY(f.obj.position.x, f.obj.position.z) + 0.05) f.t = f.life; }
    else if (!f.tracer) {
      f.vy -= (f.fire ? 0 : 3) * dt;
      f.obj.scale.setScalar(f.s0 + (f.s1 - f.s0) * k);
      f.obj.material.opacity = (f.fire ? 1 : 0.8) * (1 - k);
    } else {
      f.obj.material.opacity = 0.9 * (1 - k);
    }
  }
  fpsN++; fpsT += dt;
  if (fpsT > 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  statsEl.textContent = `FPS ${fps}\n` + squads.map(sq =>
    `${FACTIONS[sq.faction].label}班 存活 ${sq.aliveCount()}/${sq.soldiers.length}${sq.alertT > 0 ? '（卧倒!）' : ''}`).join('\n');
  controls.update();
  renderer.render(scene, camera);
}
tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── 测试钩子 ──
window.__demo = {
  setAnim(name) { resetShowcase(); showcase.forEach(r => r.setState(name)); },
  lookAt(x, y, z, dist) {
    controls.target.set(x, y, z);
    const d = camera.position.clone().sub(controls.target).normalize().multiplyScalar(dist);
    camera.position.copy(controls.target).add(d).add(V3(0, dist * 0.3, 0));
  },
  worldToScreen(x, y, z) {
    const v = V3(x, y, z).project(camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (-v.y + 1) / 2 * innerHeight };
  },
  squads, showcase,
  info() { return { calls: renderer.info.render.calls, tris: Math.round(renderer.info.render.triangles) }; },
};
