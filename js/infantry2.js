// ═══ 步兵 v2：程序化二战士兵（德/美/苏三阵营）+ 骨骼合并 + 两骨 IK + 姿态状态机 ═══
// 内核移植自 German.html（用户手写程序化模型），重构为可复用模块：
//   · 骨骼合并：90 mesh/人 → ~15（装饰件按所属骨骼 mergeGeometries，材质按组分桶）
//   · 三阵营：配色/盔形/徽记参数化（德=M35钢盔+胸鹰 / 美=M1半球盔 / 苏=ssh40+乌山卡混装）
//   · 雪地罩衫变体（阿登：按阵营配发率换白装）
//   · 动作协调改进：行军可选"背枪摆臂"（史实行军携行）/ 受惊纯卧倒姿态 / 过渡速率分档
//   · 特效走回调（onMuzzle/onExplode/onDust/onThrow），不绑定具体粒子系统

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const sstep = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

// ── 阵营外观表 ──
export const FACTIONS = {
  de: {
    label: '德军',
    feld: 0x5a6350, feldD: 0x4e5747, collar: 0x333d2c, trouser: 0x646a58,
    helmet: { type: 'stahlhelm', color: 0x4d5546, metal: 0.3, rough: 0.45 },
    eagle: true, board: 0x6e3b32,
    leather: 0x3a3028, boot: 0x171717, pack: 0x6a6152, skin: 0xc9a186,
    snow: { feld: 0xd8dce0, feldD: 0xc4cad0, trouser: 0xccd1d7, collar: 0xb8bec6, helmet: 0xcfd4d8, rate: 0.5 },
  },
  us: {
    label: '美军',
    feld: 0x6b6248, feldD: 0x5a5340, collar: 0x4e4838, trouser: 0x716a52,
    helmet: { type: 'm1', color: 0x54513f, metal: 0.12, rough: 0.6 },
    eagle: false, board: 0x54513f,
    leather: 0x4a3d2e, boot: 0x2e2018, pack: 0x5a5140, skin: 0xc9a186,
    snow: { feld: 0xdde0e2, feldD: 0xc9cdd1, trouser: 0xd2d5d8, collar: 0xbfc4c9, helmet: 0xd4d8db, rate: 0.2 },
  },
  su: {
    label: '苏军',
    feld: 0x6e5f43, feldD: 0x5c5040, collar: 0x4c4436, trouser: 0x6a5f46,
    helmet: { type: 'ssh40', color: 0x4c4a38, metal: 0.2, rough: 0.55, alt: 'ushanka', altRate: 0.4 },
    eagle: false, board: 0x6e3b32,
    leather: 0x3f3428, boot: 0x1c1a17, pack: 0x4e4636, skin: 0xc9a186,
    snow: { feld: 0xd6d9dc, feldD: 0xc6cace, trouser: 0xcdcfd3, collar: 0xbabfc5, helmet: 0xd0d4d8, rate: 0.3 },
  },
};

// ── 像素纹理（脸部/胸鹰/盔徽/铁十字——全部阵营共用脸，徽记仅德军） ──
function canvasTex(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _tex = null;
function texes() {
  if (_tex) return _tex;
  _tex = {
    face: canvasTex(32, 32, g => {
      g.fillStyle = '#c9a186'; g.fillRect(0, 0, 32, 32);
      g.fillStyle = '#b8906f'; g.fillRect(0, 0, 3, 32); g.fillRect(29, 0, 3, 32);
      g.fillStyle = '#5a4632'; g.fillRect(8, 10, 6, 2); g.fillRect(18, 10, 6, 2);
      g.fillStyle = '#f2ede4'; g.fillRect(9, 13, 4, 3); g.fillRect(19, 13, 4, 3);
      g.fillStyle = '#2c3438'; g.fillRect(10, 13, 2, 3); g.fillRect(20, 13, 2, 3);
      g.fillStyle = '#b8906f'; g.fillRect(14, 16, 4, 5);
      g.fillStyle = '#8a5f4e'; g.fillRect(12, 24, 8, 1);
      g.fillStyle = '#a98268'; for (let i = 0; i < 90; i++) g.fillRect(6 + Math.random() * 20 | 0, 19 + Math.random() * 11 | 0, 1, 1);
    }),
    eagle: canvasTex(32, 24, g => {
      g.clearRect(0, 0, 32, 24); g.fillStyle = '#d8d8cf';
      g.fillRect(14, 6, 4, 7); g.fillRect(15, 3, 2, 3);
      g.fillRect(6, 7, 8, 2); g.fillRect(18, 7, 8, 2); g.fillRect(4, 8, 6, 2); g.fillRect(22, 8, 6, 2); g.fillRect(3, 9, 4, 2); g.fillRect(25, 9, 4, 2);
      g.fillRect(12, 13, 8, 2); g.fillStyle = '#c9c9be'; g.fillRect(14, 15, 4, 3);
      g.fillStyle = '#efe9dc'; g.fillRect(12, 18, 8, 5); g.fillStyle = '#15171a';
      g.fillRect(15, 18, 2, 5); g.fillRect(12, 19, 8, 2);
    }),
    decal: canvasTex(16, 16, g => {
      g.clearRect(0, 0, 16, 16); g.fillStyle = '#c8ccc0';
      g.fillRect(7, 3, 2, 6); g.fillRect(3, 4, 10, 2); g.fillRect(2, 5, 3, 1); g.fillRect(11, 5, 3, 1); g.fillRect(6, 9, 4, 3);
    }),
    cross: canvasTex(12, 12, g => {
      g.clearRect(0, 0, 12, 12); g.fillStyle = '#e8e4d8';
      g.fillRect(4, 1, 4, 10); g.fillRect(1, 4, 10, 4);
      g.fillStyle = '#15171a'; g.fillRect(5, 2, 2, 8); g.fillRect(2, 5, 8, 2);
    }),
  };
  return _tex;
}

// ── 材质表（阵营×雪地 缓存共享） ──
const _mats = new Map();
function factionMats(fk, snow) {
  const key = fk + (snow ? '_s' : '');
  if (_mats.has(key)) return _mats.get(key);
  const F = FACTIONS[fk], S = snow ? F.snow : null;
  const mk = (c, r = 0.9, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: metal });
  const M = {
    feld: mk(S ? S.feld : F.feld),
    feldD: mk(S ? S.feldD : F.feldD),
    collar: mk(S ? S.collar : F.collar),
    trouser: mk(S ? S.trouser : F.trouser, 0.92),
    leather: mk(F.leather, 0.55),
    leatherD: mk(0x221c17, 0.5),
    skin: mk(F.skin, 0.75),
    boot: mk(F.boot, 0.32, 0.1),
    helmet: new THREE.MeshStandardMaterial({ color: S ? S.helmet : F.helmet.color, roughness: F.helmet.rough, metalness: F.helmet.metal, side: THREE.DoubleSide }),
    metal: mk(0x33363b, 0.35, 0.85),
    wood: mk(0x6b4a2b, 0.7),
    woodL: mk(0x96733f, 0.8),
    board: mk(F.board, 0.85),
    grey: mk(0x8b8f8a, 0.5, 0.6),
    pack: mk(F.pack),
  };
  _mats.set(key, M);
  return M;
}

// ── 几何小工具 ──
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 5, 12);
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

// ── 骨骼合并袋：同一骨骼上的装饰件合并为单几何体（材质分桶 → groups） ──
class PartBag {
  constructor() { this.buckets = new Map(); }
  add(matKey, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(
      V3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      V3(sx, sy, sz)));
    if (!this.buckets.has(matKey)) this.buckets.set(matKey, []);
    this.buckets.get(matKey).push(g);
  }
  build(M) {
    const keys = [...this.buckets.keys()];
    const per = keys.map(k => mergeGeometries(this.buckets.get(k), false));
    const merged = mergeGeometries(per, true);
    const mesh = new THREE.Mesh(merged, keys.map(k => M[k]));
    mesh.castShadow = true;
    return mesh;
  }
}

// ── 盔形 lathe ──
function helmetGeo(type) {
  let prof;
  if (type === 'stahlhelm') {
    prof = [[.150, -.062], [.141, -.054], [.128, -.041], [.119, -.02], [.113, .004], [.101, .045], [.081, .077], [.053, .097], [.022, .107], [.001, .109]]
      .map(p => new THREE.Vector2(p[0], p[1]));
    const hg = new THREE.LatheGeometry(prof, 28, -Math.PI / 2, Math.PI * 2);
    const hp = hg.attributes.position, by = -.062, rg = .08;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i), t = Math.atan2(z, x);
      const wy = clamp((by + rg - y) / rg, 0, 1);
      const d = Math.acos(Math.max(-1, Math.min(1, Math.sin(t))));
      const fw = d < 1.12 ? 1 : Math.max(0, 1 - (d - 1.12) / (Math.PI / 2 - 1.12));
      const bw = Math.max(0, -Math.sin(t)), sw = 1 - Math.abs(Math.sin(t));
      hp.setY(i, y + .013 * fw * wy - .046 * bw * wy - .044 * sw * wy);
    }
    hg.computeVertexNormals();
    hg.scale(.9158, .8883, 1.084);
    return hg;
  }
  if (type === 'm1') {   // 美 M1：半球碗形 + 微后檐
    prof = [[.118, -.018], [.116, 0], [.110, .025], [.098, .052], [.080, .072], [.055, .086], [.025, .094], [.001, .096]]
      .map(p => new THREE.Vector2(p[0], p[1]));
    const hg = new THREE.LatheGeometry(prof, 24, -Math.PI / 2, Math.PI * 2);
    hg.computeVertexNormals();
    hg.scale(1.0, 0.95, 1.12);
    return hg;
  }
  if (type === 'ushanka') {   // 苏乌山卡：圆顶棉帽
    prof = [[.128, -.01], [.126, .02], [.118, .055], [.10, .08], [.07, .095], [.03, .102], [.001, .103]]
      .map(p => new THREE.Vector2(p[0], p[1]));
    const hg = new THREE.LatheGeometry(prof, 18, -Math.PI / 2, Math.PI * 2);
    hg.computeVertexNormals();
    hg.scale(1.0, 0.9, 1.05);
    return hg;
  }
  // ssh40：比 M1 略小略扁
  prof = [[.112, -.014], [.110, .005], [.104, .028], [.092, .052], [.072, .070], [.048, .082], [.02, .088], [.001, .089]]
    .map(p => new THREE.Vector2(p[0], p[1]));
  const hg = new THREE.LatheGeometry(prof, 22, -Math.PI / 2, Math.PI * 2);
  hg.computeVertexNormals();
  hg.scale(1.0, 0.92, 1.08);
  return hg;
}

// ═══ 士兵装配 ═══
function buildSoldier(fk, rand, snow) {
  const F = FACTIONS[fk], M = factionMats(fk, snow), T = texes();
  const root = new THREE.Group();

  // ── hips（骨盆骨骼：裤裆/腰带/弹药包/干粮袋/水壶/手榴弹袋 全合并） ──
  const hips = new THREE.Group(); hips.position.y = .96; root.add(hips);
  {
    const B = new PartBag();
    B.add('trouser', cap(.13, .12), 0, .01, 0, 0, 0, 0, 1, .9, .8);
    B.add('feld', cyl(.15, .19, .20, 14), 0, -.10, 0, 0, 0, 0, 1, 1, .82);
    B.add('leatherD', cyl(.162, .162, .05, 14), 0, .02, 0, 0, 0, 0, 1, 1, .8);
    B.add('grey', box(.052, .062, .01), 0, .02, .135);
    B.add('metal', box(.02, .032, .012), 0, .02, .142);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x = s * (.048 + i * .05), z = .128 - i * i * .01;
      B.add('leatherD', box(.052, .088, .038), x, -.035, z);
      B.add('leather', box(.052, .03, .042), x, -.007, z + .002);
    }
    B.add('pack', box(.085, .105, .05), -.135, -.07, -.105, 0, .2, 0);
    B.add('pack', cyl(.043, .043, .19, 10), .135, -.06, -.11, 0, 0, Math.PI / 2);
    hips.add(B.build(M));
    // Y 带（皮带圆柱连肩）
    const belt = (p1, p2, r) => {
      const d = new THREE.Vector3().subVectors(p2, p1), L = d.length();
      const m = new THREE.Mesh(cyl(r, r, L, 8), M.leatherD);
      m.position.copy(p1).addScaledVector(d, .5);
      m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
      m.castShadow = true; hips.add(m);
    };
    belt(V3(0, -.02, -.13), V3(0, .26, -.13), .017);
    belt(V3(0, .26, -.13), V3(-.185, .50, .04), .017);
    belt(V3(0, .26, -.13), V3(.185, .50, .04), .017);
  }

  // ── spine → chest（胸：上衣/口袋/扣/肩章/领/Britz 带/胸鹰(德) 合并） ──
  const spine = new THREE.Group(); spine.position.y = .06; hips.add(spine);
  const chest = new THREE.Group(); chest.position.y = .16; spine.add(chest);
  {
    const B = new PartBag();
    B.add('feld', cap(.152, .22), 0, .05, 0, 0, 0, 0, 1, 1, .74);
    for (const s of [-1, 1]) {
      B.add('feldD', box(.072, .08, .012), s * .062, .075, .118, -.08, 0, 0);
      B.add('feldD', box(.072, .022, .014), s * .062, .115, .119, -.08, 0, 0);
      B.add('feldD', box(.08, .09, .012), s * .075, -.12, .148, -.18, 0, 0);
    }
    for (let i = 0; i < 5; i++) B.add('metal', cyl(.0085, .0085, .008, 8), 0, .19 - i * .055, .121, Math.PI / 2, 0, 0);
    B.add('collar', cyl(.108, .112, .05, 12), 0, .275, 0, 0, 0, 0, 1, 1, .9);
    for (const s of [-1, 1]) {
      B.add('leatherD', box(.03, .44, .008), s * .085, .07, .118, -.10, 0, 0);
      B.add('board', box(.08, .013, .048), s * .165, .262, .01, 0, 0, -s * .32);
    }
    if (F.eagle) {
      chest.add(B.build(M));
      const eagle = new THREE.Mesh(new THREE.PlaneGeometry(.075, .055),
        new THREE.MeshStandardMaterial({ map: T.eagle, transparent: true, roughness: .9 }));
      eagle.position.set(-.062, .135, .124); eagle.rotation.x = -.08;
      chest.add(eagle);
      const rank = new THREE.Mesh(new THREE.PlaneGeometry(.02, .02),
        new THREE.MeshStandardMaterial({ map: T.cross, transparent: true }));
      rank.position.set(.05, .148, .123); rank.rotation.x = -.08;
      chest.add(rank);
    } else {
      chest.add(B.build(M));
    }
  }

  // ── neck → head（头：球+脸贴图+耳+鼻 合并） + 盔 ──
  const neck = new THREE.Group(); neck.position.y = .25; chest.add(neck);
  const head = new THREE.Group(); head.position.y = .075; neck.add(head);
  {
    const B = new PartBag();
    B.add('skin', sph(.098, 18, 14), 0, .05, 0, 0, 0, 0, .9, 1.12, .98);
    for (const s of [-1, 1]) B.add('skin', sph(.02), s * .087, .048, .005);
    B.add('skin', box(.018, .03, .02), 0, .045, .098);
    head.add(B.build(M));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(.085, .08),
      new THREE.MeshStandardMaterial({ map: T.face, roughness: .8 }));
    face.position.set(0, .052, .0905);
    head.add(face);
    // 盔（苏 40% 乌山卡）
    let hType = F.helmet.type;
    if (F.helmet.alt && rand() < F.helmet.altRate) hType = F.helmet.alt;
    const helmetG = new THREE.Group();
    helmetG.position.set(0, .115, -.004); helmetG.rotation.x = .04;
    head.add(helmetG);
    const helm = new THREE.Mesh(helmetGeo(hType), M.helmet);
    helm.castShadow = true;
    helmetG.add(helm);
    if (F.eagle) {
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(.034, .034),
        new THREE.MeshStandardMaterial({ map: T.decal, transparent: true, roughness: .6, metalness: .3 }));
      decal.position.set(.1145, -.005, .015); decal.rotation.y = Math.PI / 2;
      helmetG.add(decal);
    }
    if (hType === 'stahlhelm') {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(.092, .006, 6, 18, Math.PI), M.leatherD);
      strap.position.set(0, -.02, .01); strap.rotation.set(.1, 0, Math.PI);
      helmetG.add(strap);
    }
  }

  // ── 手臂（上臂/前臂+袖口/手 三段骨骼，合并装饰） ──
  function makeArm(s) {
    const sh = new THREE.Group(); sh.position.set(s * .185, .262, .008); chest.add(sh);
    {
      const B = new PartBag();
      B.add('feld', cap(.052, .17), 0, -.155, 0);
      sh.add(B.build(M));
    }
    const el = new THREE.Group(); el.position.y = -.30; sh.add(el);
    {
      const B = new PartBag();
      B.add('feld', cap(.045, .15), 0, -.125, 0);
      B.add('collar', cyl(.05, .047, .05, 10), 0, -.205, 0);
      el.add(B.build(M));
    }
    const hand = new THREE.Group(); hand.position.y = -.26; el.add(hand);
    {
      const B = new PartBag();
      B.add('skin', cap(.037, .05), 0, -.03, 0);
      hand.add(B.build(M));
    }
    return { sh, el, hand };
  }
  const armL = makeArm(1), armR = makeArm(-1);

  // ── 腿（大腿/膝+绑腿+靴筒/踝+靴头 三段骨骼） ──
  function makeLeg(s) {
    const hip = new THREE.Group(); hip.position.set(s * .095, -.015, 0); hips.add(hip);
    {
      const B = new PartBag();
      B.add('trouser', cap(.073, .27), 0, -.225, 0);
      hip.add(B.build(M));
    }
    const knee = new THREE.Group(); knee.position.y = -.46; hip.add(knee);
    {
      const B = new PartBag();
      B.add('trouser', sph(.058), 0, 0, 0);
      B.add('trouser', cyl(.063, .06, .13, 10), 0, -.055, 0);
      B.add('boot', cyl(.058, .062, .30, 10), 0, -.23, 0);
      knee.add(B.build(M));
    }
    const ankle = new THREE.Group(); ankle.position.y = -.40; knee.add(ankle);
    {
      const B = new PartBag();
      B.add('boot', box(.088, .085, .23), 0, -.048, .055);
      B.add('boot', sph(.044), 0, -.052, .165, 0, 0, 0, 1, .75, 1.1);
      B.add('boot', box(.07, .04, .05), 0, -.07, -.06);
      const foot = B.build(M);
      foot.rotation.y = Math.PI / 2;
      ankle.add(foot);
    }
    return { hip, knee, ankle };
  }
  const legL = makeLeg(1), legR = makeLeg(-1);

  // ── Kar98k 风格步枪（木/钢两材质两网格；背枪/持枪/脱手 由状态机驱动） ──
  const rifle = new THREE.Group(); root.add(rifle);
  {
    const W = new PartBag(), S = new PartBag();
    W.add('wood', box(.041, .115, .18), 0, -.014, -.212);
    S.add('metal', box(.038, .12, .02), 0, -.014, -.312);
    W.add('wood', box(.034, .064, .255), 0, -.004, -.003);
    W.add('wood', box(.032, .06, .09), 0, -.026, -.038, .55, 0, 0);
    S.add('metal', box(.030, .006, .17), 0, .043, .194);
    S.add('metal', cyl(.007, .007, .139, 8), 0, .035, -.13, Math.PI / 2, 0, 0);
    S.add('metal', sph(.0115), -.03, .035, 0);
    S.add('metal', new THREE.TorusGeometry(.019, .004, 6, 12, Math.PI), 0, -.049, -.026, Math.PI / 2, 0, Math.PI);
    S.add('metal', cyl(.0105, .0105, .736, 10), 0, .02, .391, Math.PI / 2, 0, 0);
    S.add('metal', cyl(.015, .015, .015, 10), 0, .02, .67, Math.PI / 2, 0, 0);
    S.add('metal', cyl(.015, .015, .015, 10), 0, .02, .693, Math.PI / 2, 0, 0);
    W.add('wood', box(.031, .041, .574), 0, .02, .33);
    S.add('metal', box(.014, .02, .05), 0, .045, .13);
    S.add('metal', box(.006, .02, .008), 0, .042, .75);
    S.add('metal', box(.015, .028, .243), 0, .032, .02);
    rifle.add(W.build(M), S.build(M));
  }

  return { root, hips, spine, chest, neck, head, armL, armR, legL, legR, rifle };
}

// ── IK 解算（两骨 + 极向） ──
function solveLimb(jp, tp, pole, a, b) {
  const dir = tp.clone().sub(jp); let d = dir.length(); d = clamp(d, .03, a + b - .004);
  const dh = dir.normalize();
  const ca = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), al = Math.acos(ca);
  let n = pole.clone().sub(dh.clone().multiplyScalar(pole.dot(dh)));
  if (n.lengthSq() < 1e-6) n.set(0, 0, 1); n.normalize();
  const elbow = jp.clone().addScaledVector(dh, a * Math.cos(al)).addScaledVector(n, a * Math.sin(al));
  const ud = elbow.clone().sub(jp).normalize();
  const xw = n.clone().addScaledVector(ud, -n.dot(ud)).normalize();
  const yw = ud.clone().negate();
  const zw = new THREE.Vector3().crossVectors(xw, yw).normalize();
  const qUp = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xw, yw, zw));
  const fd = tp.clone().sub(elbow).normalize();
  const th = Math.atan2(fd.dot(xw), fd.dot(ud));
  return { qUp, qEl: new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), clamp(th, -2.6, .35)) };
}
const _v1 = new THREE.Vector3(), _q1 = new THREE.Quaternion();
const _qId = new THREE.Quaternion();   // 单位四元数（externalTransform 姿态转体判定）
function applyLimb(jointG, elbowG, jp, tp, pole, a, b, k) {
  const s = solveLimb(jp, tp, pole, a, b);
  jointG.parent.getWorldQuaternion(_q1).invert();
  jointG.quaternion.slerp(_q1.clone().multiply(s.qUp), k);
  elbowG.quaternion.slerp(s.qEl, k);
}

// ── 关键帧插值 ──
function kN(t, a) {
  if (t <= a[0][0]) return a[0][1];
  for (let i = 1; i < a.length; i++) if (t <= a[i][0]) {
    const u = (t - a[i - 1][0]) / (a[i][0] - a[i - 1][0]), s = u * u * (3 - 2 * u);
    return lerp(a[i - 1][1], a[i][1], s);
  }
  return a[a.length - 1][1];
}
function kV(t, a, out) {
  let i = a.length - 1;
  for (let j = 1; j < a.length; j++) if (t <= a[j][0]) { i = j; break; }
  const A = a[i - 1] || a[0], B = a[i];
  const u = clamp((t - A[0]) / Math.max(1e-5, B[0] - A[0]), 0, 1), s = u * u * (3 - 2 * u);
  out.set(lerp(A[1], B[1], s), lerp(A[2], B[2], s), lerp(A[3], B[3], s));
  return out;
}

// ═══ 姿态函数（移植 + 协调改进） ═══
const UP = .30, FORE = .26, THIGH = .46, SHIN = .40;

function pIdle(T, t) {
  const b = Math.sin(t * 1.5);
  T.drop = .004 + .004 * (1 + b) * .5; T.spine = .02; T.chest = .03 + .01 * b;
  T.headY = Math.sin(t * .33) * .16; T.headP = .03 + .02 * Math.sin(t * .57);
  T.footL.set(.115, 0, .06); T.footR.set(-.115, 0, -.04);
  setRifle(T, .07, 1.10 + .004 * b, .17, -.75, .25, .12);
  T.poleArmR.set(-.45, -.95, -.3); T.poleArmL.set(.6, -.9, .25);
}

function pGuard(T, t) {
  T.drop = .004; T.spine = .015; T.chest = .025;
  T.headY = .06 + .03 * Math.sin(t * .4); T.headP = .01;
  T.footL.set(.15, 0, .12); T.footR.set(-.15, 0, -.12);
  T.rlp.set(.17, 1.12, .07);
  T.rlq.setFromEuler(new THREE.Euler(-Math.PI / 2 + .12, 0, .06));
  T.handL = V3(.08, .80, -.17);
  T.poleArmR.set(-.45, -.5, .15); T.poleArmL.set(.4, -.7, -.25);
}

function pPortArms(T, t) {
  const b = Math.sin(t * 1.1);
  T.drop = .005 + .003 * (1 + b) * .5; T.spine = .025; T.chest = .035;
  T.headY = .03; T.headP = .015;
  T.footL.set(.13, 0, .08); T.footR.set(-.13, 0, -.08);
  T.rlp.set(.03, 1.06, .11);
  T.rlq.setFromEuler(new THREE.Euler(-.05, -.2, .42));
  T.poleArmL.set(.5, -.65, .1); T.poleArmR.set(-.5, -.65, -.1);
}

// 步行基础（改进：髋部侧滚+反向肩转、步态肩摆可选"背枪摆臂"史实行军携行）
function walkBase(T, t, o, dt, prog) {
  const f = t * o.freq, pL = f % 1, pR = (f + .5) % 1;
  const ft = p => {
    if (p < .55) { const u = p / .55; return { z: lerp(o.stride / 2, -o.stride / 2, u), y: 0, pp: o.push * sstep(.32, .55, p) }; }
    const u = (p - .55) / .45;
    return { z: lerp(-o.stride / 2, o.stride / 2, u), y: o.lift * Math.sin(Math.PI * u), pp: lerp(-.30, -.08, u) };
  };
  const L = ft(pL), R = ft(pR);
  T.drop = o.drop - o.bob * Math.cos(2 * Math.PI * (pL - .275));
  T.footL.set(.115, L.y, L.z); T.footR.set(-.115, R.y, R.z); T.footLP = L.pp; T.footRP = R.pp;
  T.spine = o.lean * .65; T.chest = o.lean * .45 + .02;
  // 协调改进①：髋随步侧滚（重心换腿）+ 胸反向微转（对摆），头保持稳定
  T.hipRoll = Math.sin(2 * Math.PI * f) * (o.roll ?? .035);
  T.twist = -Math.sin(2 * Math.PI * f) * (o.counter ?? .05);
  T.headP = .04; T.headY = .05 * Math.sin(t * .5) - T.twist * .8;
  if (o.sling) {
    // 背枪摆臂：步枪斜背，双臂自由摆动（与对侧腿同步）
    T.rifleMode = 'back';
    setRifle(T, -.02, o.rifY ?? 1.16, -.22, -1.42, .12, .5);
    const sw = Math.sin(2 * Math.PI * f) * o.swing;
    T.handL = V3(.26, .78, sw * .9);
    T.handR = V3(-.26, .78, -sw * .9);
    T.poleArmL.set(.7, -.9, .1); T.poleArmR.set(-.7, -.9, .1);
  } else {
    setRifle(T, .02, o.rifY, .20, -.16 + .04 * Math.sin(2 * Math.PI * f) + o.rp, 0.10, 0);
  }
}

function pFireStand(T, t) {
  const P = 1.5, id = Math.floor(t / P), ts = t - id * P; T.shotId = id;
  const r = .055 * Math.exp(-11 * ts), bolt = .018 * Math.exp(-Math.pow((ts - .55) / .09, 2));
  setRifle(T, .015, 1.425, .16 - r - bolt * .5, r * 1.2, 0, bolt * .4);
  T.spine = .05; T.chest = .04 + .006 * Math.sin(t * 1.7); T.headP = .12; T.headR = .15; T.headY = .015 * Math.sin(t * .9); T.drop = .03;
  T.footL.set(.13, 0, .24); T.footR.set(-.13, 0, -.20);
  T.poleArmL.set(.55, -1, .15); T.poleArmR.set(-.5, -1, -.4);
}

function pFireKneel(T, t) {
  const P = 2.6, id = Math.floor(t / P), ts = t - id * P; T.shotId = id;
  const r = .06 * Math.exp(-10 * ts);
  T.drop = .34; T.hipPitch = .05;
  T.footL.set(.145, 0, .35); T.footLP = 0; T.poleLegL.set(0, .3, 1);
  T.footR.set(-.125, .02, -.42); T.footRP = -1.25; T.poleLegR.set(.05, -.9, .7);
  setRifle(T, .02, 1.11, .15 - r, r * 1.2, 0, 0);
  T.headP = .13; T.headR = .14; T.spine = .08; T.chest = .05 + .005 * Math.sin(t * 1.2);
  T.poleArmL.set(.55, -1, .15); T.poleArmR.set(-.5, -1, -.4);
}

function pFireProne(T, t) {
  const P = 2.2, id = Math.floor(t / P), ts = t - id * P; T.shotId = id;
  const r = .04 * Math.exp(-12 * ts);
  T.drop = .745; T.hipPitch = 1.45; T.spine = -.06; T.neck = -1.20; T.headP = -.15 + .02 * Math.sin(t * 1.3);
  T.footL.set(.16, .02, -.88); T.footR.set(-.16, .02, -.88); T.footLP = -1.2; T.footRP = -1.2;
  T.poleLegL.set(0, 1, 0); T.poleLegR.set(0, 1, 0);
  setRifle(T, .07, .105, .42 - r, -.02 + r, 0, 0);
  T.poleArmR.set(-.75, -.7, .15); T.poleArmL.set(.75, -.7, .2);
}

// 受惊纯卧倒（新增：无开火、背枪、双肘撑地、腿后伸微撇；炮击警报用）
function pProneAlert(T, t) {
  T.drop = .745; T.hipPitch = 1.45; T.spine = -.04; T.neck = -.95; T.headP = -.10 + .02 * Math.sin(t * 1.2);
  T.headY = .12 * Math.sin(t * .7);   // 微微侧头观察——比射击卧姿更"慌"
  T.footL.set(.17, .02, -.88); T.footR.set(-.17, .02, -.88); T.footLP = -1.2; T.footRP = -1.2;
  T.poleLegL.set(.05, 1, .2); T.poleLegR.set(-.05, 1, .2);
  T.rifleMode = 'back';
  setRifle(T, 0, .10, -.28, -1.42, .1, .45);
  T.ikArms = false;
  T.exp = {
    lHipX: .06, rHipX: .06, lHipZ: .10, rHipZ: -.10, lKnee: .12, rKnee: .12, lAnk: 0, rAnk: 0,
    lShX: -1.15, rShX: -1.15, lShZ: .55, rShZ: -.55, lElX: -1.15, rElX: -1.15,
  };
}

const throwKeys = [[0, -.12, .98, .18], [.6, -.18, 1.02, .10], [1, -.30, 1.10, -.20], [1.5, -.32, .90, -.48], [1.72, -.15, 1.65, -.25], [1.9, 0, 1.80, .20], [2.3, .05, 1.30, .55], [3, -.15, .85, .10], [4.2, -.12, .98, .18]];
function pThrow(T, t, S) {
  const tt = t % 4.2;
  const lid = Math.floor(t / 4.2);
  if (lid !== S.loopId) { S.loopId = lid; S.gThrown = false; }
  T.rifleMode = 'back'; setRifle(T, 0, 1.28, -.20, -1.45, 0, .35);
  kV(tt, throwKeys, T.handR);
  T.handL = V3(.26 + .02 * Math.sin(t * 1.3), .80 + .02 * Math.sin(t * 1.7), .06);
  T.poleArmR.set(-.45, -.25, -.55); T.poleArmL.set(.7, -.9, .15);
  T.twist = kN(tt, [[0, 0], [1, -.15], [1.5, -.5], [1.75, .15], [2.2, .3], [3.2, .05], [4.2, 0]]);
  T.spine = kN(tt, [[0, .04], [1.3, -.12], [1.75, .28], [2.2, .30], [3, .08], [4.2, .04]]);
  T.chest = .03; T.headP = kN(tt, [[0, 0], [1.5, -.1], [1.9, .15], [2.6, 0], [4.2, 0]]);
  T.grenadePhase = tt;   // 装备手雷显隐/出手由状态机处理
}

function pDeath(T, t, S) {
  const tt = Math.min(t, 3.2);
  T.ikArms = false; T.ikLegs = false;
  T.rp.z = S.enterProg + kN(tt, [[0, 0], [.2, -.08], [1.05, -.42], [1.85, -.78], [3.2, -.82]]);
  T.drop = kN(tt, [[1.05, 0], [1.5, .30], [1.85, .72], [2.3, .80], [3.2, .80]]);
  T.hipPitch = kN(tt, [[1.05, 0], [1.5, -.35], [1.85, -1.28], [2.3, -1.50], [3.2, -1.46]]);
  T.chest = kN(tt, [[0, .02], [.12, -.30], [.6, -.12], [1.85, -.08], [3.2, -.04]]);
  T.neck = kN(tt, [[0, 0], [.12, -.42], [.6, -.15], [1.85, -.18], [3.2, -.30]]);
  T.headY = kN(tt, [[0, 0], [.15, .3], [1.85, .15], [3.2, .4]]);
  const stg = (t > .2 && t < 1.05) ? Math.sin(t * 11) * .32 * (1 - (t - .2) / .85) : 0;
  if (tt > 1.85 && tt < 2.6) { const j = .05 * Math.sin(tt * 34) * Math.exp(-2.2 * (tt - 1.85)); T.chest += j; T.neck += j * .7; }
  T.exp = {
    lHipX: kN(tt, [[0, 0], [1.05, 0], [1.4, -.45], [1.85, -.15], [3.2, -.08]]) + stg,
    rHipX: kN(tt, [[0, 0], [1.05, 0], [1.4, -.45], [1.85, -.15], [3.2, -.08]]) - stg,
    lHipZ: .08, rHipZ: -.08,
    lKnee: kN(tt, [[0, .05], [1.05, .25], [1.5, 1.05], [1.85, .75], [2.3, .25], [3.2, .2]]),
    rKnee: kN(tt, [[0, .05], [1.05, .3], [1.5, 1.1], [1.85, .8], [2.3, .3], [3.2, .25]]),
    lAnk: 0, rAnk: 0,
    lShX: kN(tt, [[0, 0], [.12, .75], [.5, .45], [1.2, .8], [1.9, 1.15], [3.2, 1.05]]),
    rShX: kN(tt, [[0, 0], [.12, .7], [.5, .5], [1.2, .85], [1.9, 1.2], [3.2, 1.1]]),
    lShZ: kN(tt, [[0, .08], [.5, .55], [1.6, 1.1], [3.2, 1.0]]),
    rShZ: -kN(tt, [[0, .08], [.5, .55], [1.6, 1.1], [3.2, 1.0]]),
    lElX: kN(tt, [[0, -.2], [.4, -.9], [1.5, -.5], [3.2, -.3]]),
    rElX: kN(tt, [[0, -.2], [.4, -.85], [1.5, -.55], [3.2, -.35]]),
  };
  T.dropRifleAt = .15;
}

function pDeathFwd(T, t, S) {
  const tt = Math.min(t, 3.2);
  T.ikArms = false; T.ikLegs = false;
  T.rp.z = S.enterProg + kN(tt, [[0, 0], [.2, .08], [1.0, .35], [1.8, .58], [3.2, .62]]);
  T.drop = kN(tt, [[0, 0], [.4, .06], [1.0, .22], [1.8, .56], [2.3, .6], [3.2, .6]]);
  T.hipPitch = kN(tt, [[0, 0], [.4, .2], [1.0, .5], [1.8, .9], [2.3, .95], [3.2, .95]]);
  T.chest = kN(tt, [[0, .02], [.2, .18], [.8, .35], [1.8, .5], [3.2, .52]]);
  T.neck = kN(tt, [[0, 0], [.2, .22], [.8, .4], [1.8, .55], [3.2, .58]]);
  T.headP = kN(tt, [[0, 0], [.2, .28], [1.0, .5], [1.8, .65], [3.2, .68]]); T.headY = .1;
  const stg = (t > .2 && t < 1.0) ? Math.sin(t * 12) * .3 * (1 - (t - .2) / .8) : 0;
  if (tt > 1.8 && tt < 2.5) { const j = .05 * Math.sin(tt * 32) * Math.exp(-2.5 * (tt - 1.8)); T.chest += j; T.neck += j * .7; }
  T.exp = {
    lHipX: stg, rHipX: -stg, lHipZ: .1, rHipZ: -.1,
    lKnee: kN(tt, [[0, .05], [.5, .35], [1.0, 1.45], [1.8, 1.65], [2.3, 1.6], [3.2, 1.6]]),
    rKnee: kN(tt, [[0, .05], [.5, .35], [1.0, 1.45], [1.8, 1.65], [2.3, 1.6], [3.2, 1.6]]),
    lAnk: kN(tt, [[0, 0], [.5, -.2], [1.6, .4], [3.2, .4]]),
    rAnk: kN(tt, [[0, 0], [.5, -.2], [1.6, .4], [3.2, .4]]),
    lShX: kN(tt, [[0, 0], [.3, -.6], [1.0, -1.1], [1.8, -1.3], [3.2, -1.25]]),
    rShX: kN(tt, [[0, 0], [.3, -.6], [1.0, -1.1], [1.8, -1.3], [3.2, -1.25]]),
    lShZ: kN(tt, [[0, .08], [.5, .35], [1.8, .55], [3.2, .55]]),
    rShZ: kN(tt, [[0, -.08], [.5, -.35], [1.8, -.55], [3.2, -.55]]),
    lElX: kN(tt, [[0, -.2], [.5, -.9], [1.0, -1.1], [3.2, -1.0]]),
    rElX: kN(tt, [[0, -.2], [.5, -.9], [1.0, -1.1], [3.2, -1.0]]),
  };
  T.dropRifleAt = .2;
}

function pExplode(T, t, S, dt, fx, rig) {
  T.ikArms = false; T.ikLegs = false;
  if (!S.phys) {
    S.phys = { p: V3(0, 0, 0), v: V3((Math.random() - .5) * 1.2, 4.6, -2.6), e: V3(0, 0, 0), w: V3(-5.5, 2.2, 3.4), b: 0, rest: false };
    T.dropRifleAt = 0.01; T.dropRifleVel = [6, 4, 8];
  }
  const ph = S.phys;
  if (!ph.rest) {
    ph.v.y -= 9.8 * dt; ph.p.addScaledVector(ph.v, dt); ph.e.addScaledVector(ph.w, dt);
    if (ph.p.y <= 0 && ph.v.y < 0) {
      if (ph.b < 2) {
        ph.p.y = 0; ph.v.y *= -.3; ph.v.x *= .5; ph.v.z *= .5; ph.w.multiplyScalar(.45); ph.b++;
        if (fx && fx.onDust) fx.onDust(rig.root.position.x, 0, rig.root.position.z + ph.p.z, 4);
      } else { ph.rest = true; ph.v.set(0, 0, 0); ph.w.set(0, 0, 0); }
    }
  } else {
    const kk = 1 - Math.exp(-4 * dt);
    ph.e.x += (-1.5 - ph.e.x) * kk; ph.e.y += (0 - ph.e.y) * kk; ph.e.z += (0 - ph.e.z) * kk;
  }
  T.drop = ph.rest ? .8 : .35;
  T.rp.set(0, ph.p.y + .55, S.enterProg + ph.p.z);
  T.rq.setFromEuler(new THREE.Euler(ph.e.x, ph.e.y, ph.e.z, 'YXZ'));
  const s = Math.sin;
  T.exp = ph.rest ? {
    lHipX: -.1, rHipX: -.1, lHipZ: .15, rHipZ: -.15, lKnee: .25, rKnee: .3, lAnk: 0, rAnk: 0,
    lShX: 1.1, rShX: 1.15, lShZ: 1.0, rShZ: -1.0, lElX: -.3, rElX: -.35,
  } : {
    lHipX: .3 * s(t * 10), rHipX: .3 * s(t * 10 + 2.5), lHipZ: .2, rHipZ: -.2,
    lKnee: .7 + .3 * s(t * 12), rKnee: .7 + .3 * s(t * 11 + 1), lAnk: .3 * s(t * 15), rAnk: .3 * s(t * 16),
    lShX: s(t * 11) * 1.1, rShX: s(t * 12 + 2) * 1.1,
    lShZ: .6 + .4 * s(t * 9), rShZ: -(.6 + .4 * s(t * 9 + 1)),
    lElX: -.8 + .5 * s(t * 14), rElX: -.8 + .5 * s(t * 13 + 1),
  };
  if (S.rifDrop) T.rifleMode = 'drop';
}

function setRifle(T, x, y, z, rx, ry, rz) {
  T.rlp.set(x, y, z + .15);
  T.rlq.setFromEuler(new THREE.Euler(rx, ry, rz));
}

// ═══ 士兵装配体（状态机 + IK 驱动） ═══
export class SoldierRig {
  /**
   * @param parent  THREE.Group/Scene
   * @param fk      'de'|'us'|'su'
   * @param opts    { rand, snow }（snow 缺省按阵营配发率抽）
   */
  constructor(parent, fk, opts = {}) {
    const rand = opts.rand || Math.random;
    const snow = opts.snow ?? (rand() < FACTIONS[fk].snow.rate);
    const b = buildSoldier(fk, rand, snow);
    Object.assign(this, b);
    this.faction = fk;
    this.root = b.root;
    parent.add(this.root);
    this.home = this.root.position.clone();   // 锚点：姿态位移以此为原点（摆台/单兵模式）
    // 手雷（投雷动作用，德军柄式/其余同形）
    this.grenade = new THREE.Group();
    {
      const M = factionMats(fk, snow);
      const h = new THREE.Mesh(cyl(.012, .012, .105, 8), M.woodL); h.position.y = .052;
      const hd = new THREE.Mesh(cyl(.0335, .0335, .072, 12), new THREE.MeshStandardMaterial({ color: 0x50574d, roughness: .5, metalness: .5 })); hd.position.y = .141;
      const tp = new THREE.Mesh(cyl(.02, .02, .012, 8), M.metal); tp.position.y = .183;
      this.grenade.add(h, hd, tp);
      this.grenade.visible = false;
      this.root.add(this.grenade);
    }
    this.S = this._newState('idle');
    this.GRIP = V3(0, -.07, -.01); this.FOREND = V3(0, -.012, .34); this.MUZZLE = V3(0, .014, .925);
    this._lastDrop = 0;
  }

  _newState(name) {
    const S = this.S;
    return {
      name, t: 0, prog: S ? S.prog : 0, enterProg: S ? S.prog : 0,
      firedId: -1, loopId: -1, gThrown: false, rifDrop: null, phys: null,
    };
  }
  _newT() {
    const S = this.S;
    return {
      rp: V3(0, 0, S.prog), rq: new THREE.Quaternion(), drop: 0, hipPitch: 0, hipRoll: 0, spine: 0, chest: 0, twist: 0, neck: 0,
      headP: 0, headY: 0, headR: 0, ikLegs: true, ikArms: true, footL: V3(.115, 0, 0), footR: V3(-.115, 0, 0), footLP: 0, footRP: 0,
      poleLegL: V3(0, .35, 1), poleLegR: V3(0, .35, 1), rifleMode: 'hold', rlp: V3(0, 1.1, .16), rlq: new THREE.Quaternion(),
      handL: null, handR: null, poleArmL: V3(.55, -1, .1), poleArmR: V3(-.55, -1, -.15), exp: null, shotId: undefined,
      grenadePhase: -1, dropRifleAt: -1, dropRifleVel: null,
    };
  }

  /** 切换姿态：idle/guard/port_arms/walk/walk_sling/crouch/sprint/stand_fire/kneel_fire/prone_fire/prone_alert/throw/death/death_fwd/explode */
  setState(name) {
    const keep = this.S ? this.S.prog : 0;
    this.S = this._newState(name);
    this.S.prog = keep; this.S.enterProg = keep;
    this.rifle.visible = true;
    this.grenade.visible = false;
    // 过渡速率分档（改进②：受惊/中弹进入快过渡，常规切换舒缓）
    this._kRate = (name === 'prone_alert' || name === 'explode') ? 16 : (name === 'death' || name === 'death_fwd') ? 13 : 10;
    // externalTransform 模式（Squad 行军）：姿态位移/转体以状态进入点为基准做增量叠加
    if (this.externalTransform) {
      this._extBaseQ = this.root.quaternion.clone();
      this._extPrp = V3(0, 0, 0);
    }
  }

  get alive() { return this.S.name !== 'death' && this.S.name !== 'death_fwd' && this.S.name !== 'explode'; }

  /** fx: { onMuzzle(pos,dir), onExplode(pos), onDust(x,y,z,n), onThrow(pos,vel) }（均可省） */
  update(dt, fx = null) {
    const S = this.S, T = this._newT();
    const t = S.t += dt;
    switch (S.name) {
      case 'idle': pIdle(T, t); break;
      case 'guard': pGuard(T, t); break;
      case 'port_arms': pPortArms(T, t); break;
      case 'walk': walkBase(T, t, { freq: .75, stride: .55, lift: .045, drop: 0, lean: .08, rifY: 1.27, rp: 0, bob: .02, push: .3 }, dt, S.prog); S.prog += .4125 * dt; break;
      case 'walk_sling': walkBase(T, t, { freq: .78, stride: .55, lift: .045, drop: 0, lean: .07, bob: .02, push: .3, sling: true, swing: .22, rifY: 1.18 }, dt, S.prog); S.prog += .43 * dt; break;
      case 'crouch': walkBase(T, t, { freq: 1.0, stride: .42, lift: .05, drop: .26, lean: .34, rifY: 1.02, rp: -.06, bob: .015, push: .25, roll: .02, counter: .03 }, dt, S.prog); S.prog += .42 * dt; break;
      case 'sprint': walkBase(T, t, { freq: 2.0, stride: 1.05, lift: .13, drop: .05, lean: .30, rifY: 1.24, rp: -.10, bob: .035, push: .45, roll: .05, counter: .07, sling: true, swing: .5, rifY: 1.22 }, dt, S.prog); S.prog += 2.1 * dt; break;
      case 'stand_fire': pFireStand(T, t); break;
      case 'kneel_fire': pFireKneel(T, t); break;
      case 'prone_fire': pFireProne(T, t); break;
      case 'prone_alert': pProneAlert(T, t); break;
      case 'throw': pThrow(T, t, S); break;
      case 'death': pDeath(T, t, S); break;
      case 'death_fwd': pDeathFwd(T, t, S); break;
      case 'explode': pExplode(T, t, S, dt, fx, this); break;
    }
    const k = 1 - Math.exp(-dt * (this._kRate || 10));
    const root = this.root;
    if (this.externalTransform) {
      // 外部（Squad）持有基准位姿：姿态位移增量以进入时朝向旋转后叠加；姿态转体增量叠加在基准朝向上
      const dx = T.rp.x - this._extPrp.x, dy = T.rp.y - this._extPrp.y, dz = (T.rp.z - S.enterProg) - this._extPrp.z;
      _v1.set(dx, dy, dz).applyQuaternion(this._extBaseQ);
      root.position.add(_v1);
      this._extPrp.set(T.rp.x, T.rp.y, T.rp.z - S.enterProg);
      if (T.rq.angleTo(_qId) > 1e-3) {   // 仅姿态函数给出转体时叠加（行军 heading 归 Squad）
        _q1.copy(this._extBaseQ).multiply(T.rq);
        root.quaternion.slerp(_q1, k);
      }
    } else {
      _v1.copy(T.rp).add(this.home);   // 姿态位移以 home 锚点为原点
      root.position.lerp(_v1, k);
      root.quaternion.slerp(T.rq, k);
    }
    this.hips.position.y += ((.96 - T.drop) - this.hips.position.y) * k;
    this._lastDrop = T.drop;
    const dE = (node, axis, target) => { node.rotation[axis] += (target - node.rotation[axis]) * k; };
    dE(this.hips, 'x', T.hipPitch); dE(this.hips, 'z', T.hipRoll);
    dE(this.spine, 'x', T.spine); dE(this.chest, 'x', T.chest); dE(this.chest, 'y', T.twist);
    dE(this.neck, 'x', T.neck);
    dE(this.head, 'x', T.headP); dE(this.head, 'y', T.headY); dE(this.head, 'z', T.headR);
    root.updateMatrixWorld(true);
    // 步枪（root 子节点：局部位姿直写；脱手掉落走本地简化弹道）
    if (T.rifleMode !== 'drop') {
      this.rifle.position.lerp(T.rlp, k);
      this.rifle.quaternion.slerp(T.rlq, k);
      this.rifle.visible = true;
    }
    if (T.dropRifleAt >= 0 && t >= T.dropRifleAt && !S.rifDrop) {
      S.rifDrop = { p: this.rifle.position.clone(), q: this.rifle.quaternion.clone(), v: V3(.3, 1.0, .5).multiplyScalar(2), w: V3(Math.random() * 4, Math.random() * 4, Math.random() * 4), done: false };
      if (T.dropRifleVel) S.rifDrop.v.set(T.dropRifleVel[0], T.dropRifleVel[1], T.dropRifleVel[2]);
    }
    if (S.rifDrop) {
      const d = S.rifDrop;
      if (!d.done) {
        d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt);
        d.q.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(d.w.x * dt, d.w.y * dt, d.w.z * dt)));
        if (d.p.y < .05) { d.p.y = .05; d.v.multiplyScalar(.25); d.w.multiplyScalar(.2); if (d.v.length() < .4) { d.done = true; d.v.set(0, 0, 0); d.w.set(0, 0, 0); } }
      }
      this.rifle.position.copy(d.p);
      this.rifle.quaternion.copy(d.q);
      this.rifle.visible = true;
    }
    // 手雷（投掷动作）
    if (S.name === 'throw') {
      const tt = T.grenadePhase;
      if (tt >= 0 && tt < 1.9) {
        this.grenade.visible = true;
        this.armR.hand.getWorldPosition(_v1);
        root.worldToLocal(_v1);
        this.grenade.position.copy(_v1);
        this.grenade.rotation.set(.9, 0, .5);
      } else this.grenade.visible = false;
      if (!S.gThrown && tt >= 1.9 && tt < 2.2) {
        S.gThrown = true;
        if (fx && fx.onThrow) fx.onThrow(root.localToWorld(this.grenade.position.clone()), V3(.5, 3.2, 7.0).applyQuaternion(root.quaternion));
      }
    } else this.grenade.visible = false;
    root.updateMatrixWorld(true);
    // 枪口事件
    if (T.shotId !== undefined && T.shotId !== S.firedId) {
      S.firedId = T.shotId;
      if (fx && fx.onMuzzle) {
        const mp = this.MUZZLE.clone().applyMatrix4(this.rifle.matrixWorld);
        const dir = V3(0, 0, 1).applyQuaternion(root.quaternion);
        fx.onMuzzle(mp, dir);
      }
    }
    // 手臂 IK
    if (T.ikArms && !S.rifDrop) {
      if (!T.handR) {
        T.handR = this.GRIP.clone().applyQuaternion(this.rifle.quaternion).add(this.rifle.position);
        T.handL = this.FOREND.clone().applyQuaternion(this.rifle.quaternion).add(this.rifle.position);
      }
      if (T.handL) {
        T.handL.applyQuaternion(root.quaternion).add(root.position);
        this.armL.sh.getWorldPosition(_v1); applyLimb(this.armL.sh, this.armL.el, _v1.clone(), T.handL, T.poleArmL, UP, FORE, k);
      }
      if (T.handR) {
        T.handR.applyQuaternion(root.quaternion).add(root.position);
        this.armR.sh.getWorldPosition(_v1); applyLimb(this.armR.sh, this.armR.el, _v1.clone(), T.handR, T.poleArmR, UP, FORE, k);
      }
    }
    // 腿 IK
    if (T.ikLegs) {
      const fl = T.footL.clone().applyQuaternion(root.quaternion).add(root.position);
      const fr = T.footR.clone().applyQuaternion(root.quaternion).add(root.position);
      this.legL.hip.getWorldPosition(_v1); applyLimb(this.legL.hip, this.legL.knee, _v1.clone(), fl.add(V3(0, .085, 0)), T.poleLegL, THIGH, SHIN, k);
      this.legR.hip.getWorldPosition(_v1); applyLimb(this.legR.hip, this.legR.knee, _v1.clone(), fr.add(V3(0, .085, 0)), T.poleLegR, THIGH, SHIN, k);
      dE(this.legL.ankle, 'z', T.footLP); dE(this.legR.ankle, 'z', T.footRP);
    }
    // 显式关节姿态（卧倒/死亡等非 IK 状态）
    if (T.exp) {
      const E = T.exp;
      dE(this.legL.hip, 'x', E.lHipX); dE(this.legR.hip, 'x', E.rHipX);
      dE(this.legL.hip, 'z', E.lHipZ); dE(this.legR.hip, 'z', E.rHipZ);
      dE(this.legL.knee, 'x', E.lKnee); dE(this.legR.knee, 'x', E.rKnee);
      dE(this.legL.ankle, 'z', E.lAnk); dE(this.legR.ankle, 'z', E.rAnk);
      dE(this.armL.sh, 'x', E.lShX); dE(this.armR.sh, 'x', E.rShX);
      dE(this.armL.sh, 'z', E.lShZ); dE(this.armR.sh, 'z', E.rShZ);
      dE(this.armL.el, 'x', E.lElX); dE(this.armR.el, 'x', E.rElX);
    }
  }
}

// ═══ 步兵班（路径纵队 + 炮击/机枪事件） ═══
export class Squad {
  /**
   * @param parent  THREE.Group/Scene
   * @param opts    { faction, path:[[x,z]...], count, spacing, speed, loop, rand, snow, groundY }
   */
  constructor(parent, opts) {
    const rand = opts.rand || Math.random;
    this.faction = opts.faction;
    this.path = opts.path;
    this.loop = opts.loop !== false;
    this.speed = opts.speed ?? 1.0;
    this.groundY = opts.groundY || (() => 0);
    this.alertT = 0;
    this.soldiers = [];
    this._s = 0;
    const spacing = opts.spacing ?? 2.6;
    const count = opts.count ?? 8;
    this._cum = [0];
    for (let i = 1; i < this.path.length; i++) {
      const [ax, az] = this.path[i - 1], [bx, bz] = this.path[i];
      this._cum.push(this._cum[i - 1] + Math.hypot(bx - ax, bz - az));
    }
    this._total = this._cum[this._cum.length - 1];
    for (let i = 0; i < count; i++) {
      const rig = new SoldierRig(parent, opts.faction, { rand, snow: opts.snow });
      rig.externalTransform = true;   // 位姿由班驱动（路径行军），姿态系统只做增量
      rig.setState('walk_sling');
      rig._sOff = -i * spacing;
      rig._lat = (i % 2 === 0 ? -0.8 : 0.8) * (0.8 + rand() * 0.4);
      rig._proneDelay = 0;
      this.soldiers.push(rig);
    }
    this.update(0, null);
  }

  _posAt(s, lat, out) {
    if (this.loop) s = ((s % this._total) + this._total) % this._total;
    else s = Math.max(0, Math.min(this._total, s));
    const c = this._cum;
    let i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    const t = (s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
    const [ax, az] = this.path[i - 1], [bx, bz] = this.path[i];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    out.x = ax + dx * t - uz * lat;
    out.z = az + dz * t + ux * lat;
    out.yaw = Math.atan2(ux, uz);
    return out;
  }

  /** 炮击：rKill 内阵亡（爆心最近者炸飞、其余中弹倒地），rProne 内全班卧倒 sec 秒 */
  shellAt(pos, rKill = 6, rProne = 22, sec = 4, fx = null) {
    let killed = 0, alarmed = false, nearest = null, nd = 1e9;
    for (const s of this.soldiers) {
      if (!s.alive) continue;
      const d = Math.hypot(s.root.position.x - pos.x, s.root.position.z - pos.z);
      if (d < rKill && d < nd) { nd = d; nearest = s; }
    }
    for (const s of this.soldiers) {
      if (!s.alive) continue;
      const d = Math.hypot(s.root.position.x - pos.x, s.root.position.z - pos.z);
      if (d < rKill) {
        s.setState(s === nearest ? 'explode' : (Math.random() < 0.5 ? 'death' : 'death_fwd'));
        killed++;
      } else if (d < rProne) alarmed = true;
    }
    if (alarmed) {
      this.alertT = Math.max(this.alertT, sec);
      for (const s of this.soldiers) {
        if (s.alive) { s._proneDelay = Math.random() * 0.45; s.setState('prone_alert'); }
      }
    }
    if (nearest && fx && fx.onExplode) { /* 炸飞姿态自带尘土回调 */ }
    return killed;
  }

  /** 机枪命中单体 */
  mgHit(rig) {
    if (!rig.alive) return false;
    rig.setState(Math.random() < 0.5 ? 'death' : 'death_fwd');
    return true;
  }

  aliveCount() { return this.soldiers.reduce((n, s) => n + (s.alive ? 1 : 0), 0); }

  update(dt, fx) {
    if (this.alertT > 0) {
      this.alertT -= dt;
      if (this.alertT <= 0) for (const s of this.soldiers) if (s.alive) s.setState('walk_sling');
    }
    const moving = this.alertT <= 0;
    if (moving) this._s += this.speed * dt;
    const tmp = { x: 0, z: 0, yaw: 0 };
    for (const s of this.soldiers) {
      if (s.alive) {
        this._posAt(this._s + s._sOff, s._lat, tmp);
        s.root.position.x = tmp.x;
        s.root.position.z = tmp.z;
        s.root.position.y = this.groundY(tmp.x, tmp.z);
        s.root.rotation.y = tmp.yaw;
        s.S.prog = 0;   // 行进距离已折算进路径参数
      }
      // 阵亡者位姿完全冻结（倒地/炸飞由姿态系统增量驱动，不可覆盖 y）
      s.update(dt, fx);
    }
  }
}
