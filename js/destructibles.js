// ═══ 可破坏物件系统：规则表 + 炮击毁伤 / 履带压毁 / 建筑倒塌 / 树木电线杆倒伏 / 废墟坡度场 ═══
// 从 map-test.html 移植：原全局函数与全局状态数组（fallingTrees / collapsing / rubbleFields…）全部收敛为 Destructibles 实例方法与实例字段
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const mergeGeos = BufferGeometryUtils.mergeGeometries || BufferGeometryUtils.mergeBufferGeometries;
const clamp = THREE.MathUtils.clamp;
const UP = new THREE.Vector3(0, 1, 0);
const rand = Math.random;   // 特效随机（尘团/碎屑/倒塌方向等视觉参数，无需复现）
const ZERO_MAT = new THREE.Matrix4().makeScale(0, 0, 0);   // B1：合批实例摘除（零缩放=不可见）

// ═══ 可破坏物件规则（用户标注表）：hp=可承受炮击次数；rubbleH=炮毁残骸高度；crushH=压毁残骸高度 ═══
// noCollide：无坦克碰撞（树/电线杆/柴堆可碾过）；solid：即使调用处 collide:false 也保留碰撞
// drag：压毁阻力等级（碾过瞬间减速比例 + 震动）——轻质 0.10 / 中质 0.30 / 重质 0.45
export const PROP_RULES = {
  house01: { hp: 2, rubbleH: 1.5 }, house02: { hp: 3, rubbleH: 1.8 }, house03: { hp: 2, rubbleH: 1.2 },
  barn01: { hp: 2, rubbleH: 1.2 }, barn03: { hp: 1, rubbleH: 1.2 },
  // 诺曼底小镇（石砌/战损建筑，单件 GLB；教堂石砌最耐打）
  church: { hp: 4, rubbleH: 2.5 }, town_house: { hp: 2, rubbleH: 1.6 },
  war_damaged: { hp: 2, rubbleH: 2.2 }, war_damaged2: { hp: 3, rubbleH: 2.5 }, war_hall: { hp: 3, rubbleH: 2.5 },
  barrack01: { hp: 1, rubbleH: 0.8 }, barrack02: { hp: 2, rubbleH: 0.8 }, barrack03: { hp: 1, rubbleH: 0.8 },
  barrack04: { hp: 2, rubbleH: 1.0 },
  truck01: { hp: 1, rubbleH: 0.6, crushH: 0.4, drag: 0.30 },
  trailer01: { hp: 1, rubbleH: 0.5, drag: 0.30 }, trailer02: { hp: 1, rubbleH: 0.5, drag: 0.30 },
  watertank01: { hp: 1, rubbleH: 0.8, drag: 0.30 },
  generator01: { hp: 1, rubbleH: 0.4, crushH: 0.3, drag: 0.30 },
  container01: { hp: 1, rubbleH: 0.4, crushH: 0.3, drag: 0.30 },
  container02: { hp: 1, rubbleH: 0.5, drag: 0.30 }, container03: { hp: 1, rubbleH: 0.5, drag: 0.30 },
  cable_reel01: { hp: 1, rubbleH: 0.3, crushH: 0.2, drag: 0.10 },
  metalplate01: { hp: 1, rubbleH: 0.15, crushH: 0.1, noCollide: true, drag: 0.10 },
  metalplate02: { hp: 1, rubbleH: 0.15, crushH: 0.1, noCollide: true, drag: 0.10 },
  metalplate03: { hp: 1, rubbleH: 0.15, crushH: 0.1, noCollide: true, drag: 0.10 },
  bench01: { hp: 1, rubbleH: 0.15, crushH: 0.15, noCollide: true, drag: 0.10 },
  sign01: { hp: 1, rubbleH: 0.2, crushH: 0.1, noCollide: true, drag: 0.10 }, sign02: { hp: 1, rubbleH: 0.2, crushH: 0.1, noCollide: true, drag: 0.10 },
  sign03: { hp: 1, rubbleH: 0.2, crushH: 0.1, noCollide: true, drag: 0.10 }, sign04: { hp: 1, rubbleH: 0.2, crushH: 0.1, noCollide: true, drag: 0.10 },
  utilitybox01: { hp: 1, rubbleH: 0.3, crushH: 0.2, solid: true, drag: 0.10 },
  utilitybox02: { hp: 1, rubbleH: 0.3, crushH: 0.2, solid: true, drag: 0.10 },
  utilitybox03: { hp: 1, rubbleH: 0.3, crushH: 0.2, solid: true, drag: 0.10 },
  // 电线杆：炮弹穿过不可击毁，只能压倒（倒伏动画），重质阻力
  pylon01: { hp: 1, rubbleH: 0.5, crushH: 0.3, noCollide: true, drag: 0.45 },
};

// Instanced 物件（围栏/树木/岩石/柴堆）：逐个可炮毁/压毁
// 围栏：炮弹穿过不可击毁，只能压毁；leaf/pine：炮毁/压毁均倒伏
export const INST_PROPS = {
  fence01: { hp: 1, rubbleH: 0.25, crushH: 0.25, drag: 0.10 },
  fence02: { hp: 1, rubbleH: 0.25, crushH: 0.25, drag: 0.10 },
  fence_pole01: { hp: 1, rubbleH: 0.25, crushH: 0.25, drag: 0.10 },
  wood_log: { hp: 1, rubbleH: 0.2, crushH: 0.2, drag: 0.10 },
  leaf: { hp: 1, rubbleH: 0.2, crushH: 0.4, drag: 0.45 },
  pine: { hp: 1, rubbleH: 0.2, crushH: 0.4, drag: 0.45 },
  rock: { hp: 1, rubbleH: 0.3 },       // 岩石不可压毁
  rock2: { hp: 1, rubbleH: 0.3 },
  // 阿登雪树组（snow_trees_pack_lowpoly.glb）：与 leaf/pine 同规则——炮穿树倒、履带可压
  snowpine: { hp: 1, rubbleH: 0.2, crushH: 0.4, drag: 0.45 },
  snowbare: { hp: 1, rubbleH: 0.2, crushH: 0.4, drag: 0.45 },
  snowdead: { hp: 1, rubbleH: 0.2, crushH: 0.4, drag: 0.45 },
  snowdead2: { hp: 1, rubbleH: 0.2, crushH: 0.4, drag: 0.45 },
  // 雪地松树包（snowy_pine_trees-pak：T1/T2/T3 三款高大松）
  pine2_t1: { hp: 1, rubbleH: 0.2, crushH: 0.4, drag: 0.45 },
  pine2_t2: { hp: 1, rubbleH: 0.2, crushH: 0.4, drag: 0.45 },
  pine2_t3: { hp: 1, rubbleH: 0.2, crushH: 0.4, drag: 0.45 },
  snowbush1: { hp: 1, rubbleH: 0.15, crushH: 0.15, drag: 0.10 },   // 雪灌木：炮弹穿过，只能压毁
  snowbush2: { hp: 1, rubbleH: 0.15, crushH: 0.15, drag: 0.10 },
};
// 树木类型集合：炮弹穿树放行 + 履带压倒两用的统一判定
const TREE_TYPES = new Set(['leaf', 'pine', 'snowpine', 'snowbare', 'snowdead', 'snowdead2', 'pine2_t1', 'pine2_t2', 'pine2_t3']);
export const isTreeType = (t) => TREE_TYPES.has(t);
// 针叶类型（倒伏落叶用松针配色）
const CONIFER_TYPES = new Set(['pine', 'snowpine', 'pine2_t1', 'pine2_t2', 'pine2_t3']);
export const isConiferType = (t) => CONIFER_TYPES.has(t);
// 欧洲小镇组默认规则（eu_ 前缀，砖石承重结构；registerGroup 兜底）
export const EU_PROP_RULE = { hp: 3, rubbleH: 2.0 };

// ── 碎片/废墟材质：深灰、土褐等低饱和多色（弃水泥灰） ──
const mkMat = (c, r = 0.92) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.02 });
const DEBRIS = {
  // 废墟/碎砖主组：深灰、暗灰、土褐、褐灰、灰褐、深褐（低饱和 6 色）
  concrete: [0x565650, 0x63625c, 0x6e6558, 0x5c5348, 0x716b60, 0x4a463f].map(c => mkMat(c)),
  wood: [0x6b5d4a, 0x5c5140, 0x7a6a52, 0x4e4436].map(c => mkMat(c)),   // 长条木片（土褐灰褐）
  leaf: [0x4d6b35, 0x5d7a3e, 0x6a8247, 0x3f5a2c].map(c => mkMat(c, 0.85)),   // 落叶（橄榄绿4档）
  pineNeedle: [0x3a5232, 0x2f4529, 0x45603a].map(c => mkMat(c, 0.85)),        // 松针（深绿3档）
  dirt: [0x7a6f5c, 0x6b6152, 0x857a66].map(c => mkMat(c, 0.9)),              // 尘土小碎屑（灰土色）
  // 雪原主题（阿登 effects.theme='snow'）：倒树落雪/雪尘碎屑——白与浅灰系
  snowFlake: [0xf2f4f6, 0xe4e8ec, 0xd9dee4, 0xeceff2].map(c => mkMat(c, 0.85)),   // 积雪碎团（代落叶）
  snowDirt: [0xe0e4e8, 0xccd2d8, 0xbfc6cd].map(c => mkMat(c, 0.9)),               // 雪尘小碎屑
};

// ── 多层次烟雾配色（灰白/灰/灰褐/土色） ──
const DUST_COLORS = [
  { c0: [0.74, 0.72, 0.68], c1: [0.62, 0.60, 0.57] },   // 灰白
  { c0: [0.62, 0.60, 0.56], c1: [0.52, 0.50, 0.47] },   // 灰
  { c0: [0.58, 0.53, 0.46], c1: [0.47, 0.43, 0.38] },   // 灰褐
  { c0: [0.55, 0.48, 0.38], c1: [0.44, 0.38, 0.30] },   // 土色
];
const pickDust = () => DUST_COLORS[(rand() * DUST_COLORS.length) | 0];
// 雪原烟尘配色（雪白/浅灰白/浅灰/阴影灰）——阿登倒树/雪堆扬起用
const SNOW_DUST_COLORS = [
  { c0: [0.93, 0.94, 0.96], c1: [0.82, 0.84, 0.88] },
  { c0: [0.86, 0.88, 0.91], c1: [0.72, 0.74, 0.78] },
  { c0: [0.80, 0.82, 0.86], c1: [0.64, 0.66, 0.71] },
  { c0: [0.74, 0.76, 0.80], c1: [0.58, 0.60, 0.65] },
];
// 尘团随机层次：每团独立明度/透明度抖动（深浅前后景深感，避免整片同色同浓度）
const jCol = (c, amt = 0.14) => {
  const k = 1 + (rand() - 0.5) * 2 * amt;
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
};
const jA = (a, amt = 0.3) => Math.max(0.05, a * (1 - amt + rand() * 2 * amt));

// ── 程序化废墟堆范围倍率（按建筑类型；house02 大宅 ×2） ──
const RUBBLE_SCALE = { house02: 2.0 };

// ── 建筑碎片爆发数量表：[木片总数, 砖石数]（A组建筑效果表.md 覆盖值；其余按公式） ──
const DEBRIS_TABLE = {
  house01: { hit: [137, 34], final: [283, 135] },
  house02: { hit: [126, 28], final: [429, 154] },
};

// ── A 组建筑（适用倒塌系统）：house01/02/03、barn01/03、barrack01-04 ──
// ── A 组建筑（适用倒塌系统）：house01/02/03、barn01/03、barrack01-04、eu_ 欧洲小镇组（诺曼底镇区） ──
// 倒塌模式由 maxHp 决定（≥2 倾斜沉降 / =1 纯沉降）；判定统一走 isCollapseType
const COLLAPSE_TYPES = new Set(['house01', 'house02', 'house03', 'barn01', 'barn03', 'barrack01', 'barrack02', 'barrack03', 'barrack04']);
const isCollapseType = (t) => COLLAPSE_TYPES.has(t) || (t && t.startsWith('eu_'));

// —— 建筑战损着色：整体变灰（水泥灰 + 泥土色，非黑色） ——
const _grayC = new THREE.Color(0x8f8c84);   // 水泥灰
const _grayD = new THREE.Color(0x7a6f5c);   // 泥土色
const _grayMix = _grayC.clone().lerp(_grayD, 0.4);

// —— 模块级临时对象（避免每帧分配） ——
const _iq = new THREE.Quaternion(), _ip = new THREE.Vector3(), _is = new THREE.Vector3(), _im = new THREE.Matrix4();
const _fq1 = new THREE.Quaternion(), _fq2 = new THREE.Quaternion(), _fAxis = new THREE.Vector3();
const _pq = new THREE.Quaternion(), _pAxis = new THREE.Vector3();
const _cfw = new THREE.Vector3(), _crt = new THREE.Vector3();

// ── 炮弹与物件求交（线段-AABB / 线段-圆柱，防高速隧穿） ──
function segBoxHit(x0, y0, z0, x1, y1, z1, minx, miny, minz, maxx, maxy, maxz) {
  let tmin = 0, tmax = 1;
  const ax = [x0, y0, z0], bx = [x1, y1, z1];
  const mn = [minx, miny, minz], mx = [maxx, maxy, maxz];
  for (let a = 0; a < 3; a++) {
    const d = bx[a] - ax[a];
    if (Math.abs(d) < 1e-9) {
      if (ax[a] < mn[a] || ax[a] > mx[a]) return false;
    } else {
      let t1 = (mn[a] - ax[a]) / d, t2 = (mx[a] - ax[a]) / d;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return true;
}

function segCylHit(x0, y0, z0, x1, y1, z1, cx, cz, r, y0c, y1c) {
  const dx = x1 - x0, dz = z1 - z0;
  const fx = x0 - cx, fz = z0 - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return fx * fx + fz * fz <= r * r && y0 >= y0c && y0 <= y1c;
  const b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
  if (c > 0) {   // 起点在圆外：求线段与圆交点
    const disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > 1) return false;
    const hy = y0 + (y1 - y0) * t;
    return hy >= y0c && hy <= y1c;
  }
  return y0 >= y0c && y0 <= y1c;   // 起点已在圆内
}

// 线段与椭球求交（巨石炮弹判定：贴合石体，消除 AABB 角部空气墙）
function segEllipsoidHit(x0, y0, z0, x1, y1, z1, cx, cy, cz, rx, ry, rz) {
  const ax = (x0 - cx) / rx, ay = (y0 - cy) / ry, az = (z0 - cz) / rz;
  const dx = (x1 - x0) / rx, dy = (y1 - y0) / ry, dz = (z1 - z0) / rz;
  const A = dx * dx + dy * dy + dz * dz;
  if (A < 1e-9) return ax * ax + ay * ay + az * az <= 1;
  const B = 2 * (ax * dx + ay * dy + az * dz);
  const C = ax * ax + ay * ay + az * az - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return false;
  const sq = Math.sqrt(disc);
  const t0 = (-B - sq) / (2 * A), t1 = (-B + sq) / (2 * A);
  return t1 >= 0 && t0 <= 1;
}

// 线段与三角形 soup 求交（Möller–Trumbore 双面判定，t∈[0,1] 即命中）：
// 巨石炮弹走这个——判定面就是可见石面本身，消除椭球/AABB 与真实网格间 1~5m 的空气墙
function segTrisHit(x0, y0, z0, x1, y1, z1, tris) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  for (let t = 0; t < tris.length; t += 9) {
    const ax = tris[t], ay = tris[t + 1], az = tris[t + 2];
    const e1x = tris[t + 3] - ax, e1y = tris[t + 4] - ay, e1z = tris[t + 5] - az;
    const e2x = tris[t + 6] - ax, e2y = tris[t + 7] - ay, e2z = tris[t + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-9 && det < 1e-9) continue;
    const inv = 1 / det;
    const tx = x0 - ax, ty = y0 - ay, tz = z0 - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < -1e-6 || u > 1.000001) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < -1e-6 || u + v > 1.000001) continue;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (tt >= 0 && tt <= 1) return true;
  }
  return false;
}

export class Destructibles {
  // opts: { root: THREE.Group(物件父节点，pivot重挂用), ps, effects, audio,
  //         groundY: (x,z)=>number, addObstacle: (o)=>void, removeObstacle: (o)=>void,
  //         listener: 可选，音频距离衰减参考（Tank / Vector3 / ()=>Vector3，缺省 dist01=0） }
  constructor(opts) {
    this.root = opts.root;
    this.ps = opts.ps;
    this.effects = opts.effects;
    this.audio = opts.audio;
    this.groundY = opts.groundY || (() => 0);
    this.addObstacle = opts.addObstacle || (() => {});
    this.removeObstacle = opts.removeObstacle || (() => {});
    this.sightAdd = opts.sightAdd || (() => {});      // 软视线遮挡注册（灌木丛：挡视线不挡移动）
    this.sightRemove = opts.sightRemove || (() => {});
    this.listener = opts.listener || null;
    this.list = [];            // 全部可破坏物件（group 与 inst 两类）
    this.fallingTrees = [];    // 倒伏中的树
    this.fallingPylons = [];   // 倒伏中的电线杆
    this.collapsing = [];      // 倒塌中的建筑
    this.propFires = [];       // 持续烟源 {x,y,z, until, k, mode}
    this.rubbleFields = [];    // 废墟坡度场 {x, z, r, h}
    this._fireAcc = 0;
    // ── 空间网格（2026-10-08 性能改造：shellHit/crushCheck 不再全表线性扫） ──
    // 16m 格；registerGroup/registerInst 时按包围盒入桶；查询按线段/矩形 AABB 聚集 + 邮票去重
    this._cell = 16;
    this._grid = new Map();      // "cx:cz" → rec[]
    this._stamp = 0;             // 去重邮票（每次聚集 +1）
  }

  _gAdd(rec, minx, minz, maxx, maxz) {
    const c = this._cell;
    for (let gx = Math.floor(minx / c); gx <= Math.floor(maxx / c); gx++) {
      for (let gz = Math.floor(minz / c); gz <= Math.floor(maxz / c); gz++) {
        const key = gx + ':' + gz;
        let arr = this._grid.get(key);
        if (!arr) this._grid.set(key, arr = []);
        arr.push(rec);
      }
    }
  }
  // 按 AABB 聚集候选（去重；返回复用数组——调用方立即消费不可保留）
  _gGather(minx, minz, maxx, maxz) {
    const out = [];
    const c = this._cell, st = ++this._stamp;
    for (let gx = Math.floor(minx / c); gx <= Math.floor(maxx / c); gx++) {
      for (let gz = Math.floor(minz / c); gz <= Math.floor(maxz / c); gz++) {
        const arr = this._grid.get(gx + ':' + gz);
        if (!arr) continue;
        for (const rec of arr) {
          if (rec._gs === st) continue;
          rec._gs = st;
          out.push(rec);
        }
      }
    }
    return out;
  }

  // ── B1 合批抽出：group 物件首次受损/倒塌/压毁前，从 InstancedMesh 摘除该实例（矩阵置零），
  //    挂回注册时预构建的独立克隆（视觉与合批前逐栋摆放完全一致），此后走原灰化/倒塌/压扁管线 ──
  _ensureGroup(d) {
    if (!d.inst || !d.inst.refs.length) return;
    for (const ref of d.inst.refs) {
      ref.mesh.setMatrixAt(ref.index, ZERO_MAT);
      ref.mesh.instanceMatrix.needsUpdate = true;
    }
    d.inst.refs.length = 0;
    this.root.add(d.group);
    d.group.updateMatrixWorld(true);
  }

  // ── 建筑等 group 物件注册：自动建包围盒记录 + 按规则挂碰撞体（addObstacle） ──
  // o: { type, group, cx, cz, r, height, w, dp, y0, rule, collide?, obstacleKind?, obstacleK?, ellipsoid? }
  // collide 缺省按规则：rule.solid 强制保留；rule.noCollide 或 collide===false 无碰撞
  // ellipsoid：炮弹命中用内切椭球替代 AABB（巨石等近椭球物体，消除包围盒角部空气墙）
  registerGroup(o) {
    // eu_ 前缀（欧洲小镇组，砖石结构）未单列规则时走默认
    const rule = o.rule || PROP_RULES[o.type] || (o.type && o.type.startsWith('eu_') ? EU_PROP_RULE : undefined);
    const rec = {
      kind: 'group', type: o.type, group: o.group, rule, hp: rule.hp, maxHp: rule.hp, alive: true,
      inst: o.inst || null,   // B1 合批：{ refs: [{mesh, index}] }，受损时 _ensureGroup 抽出
      box: new THREE.Box3(
        new THREE.Vector3(o.cx - o.w / 2, o.y0, o.cz - o.dp / 2),
        new THREE.Vector3(o.cx + o.w / 2, o.y0 + o.height, o.cz + o.dp / 2)),
      cx: o.cx, cz: o.cz, radius: o.r, height: o.height,
      baseScaleY: o.group.scale.y || 1, obstacle: null,
      ellipsoid: !!o.ellipsoid,
    };
    // 巨石类近椭球物件：烘焙世界空间三角形 soup，炮弹改走精确网格求交——
    // 判定面 = 可见石面本身（原"包围盒半轴椭球"比随机位移石体表面大 0.7~5.3m，空气墙严重）
    if (rec.ellipsoid && o.group.isMesh) {
      o.group.updateMatrixWorld(true);
      const gp = o.group.geometry.attributes.position, gidx = o.group.geometry.index;
      const triN = gidx ? gidx.count / 3 : gp.count / 3;
      const arr = new Float32Array(triN * 9);
      const _bv = new THREE.Vector3(), cyC = (rec.box.min.y + rec.box.max.y) / 2;
      let bR = 0;
      for (let t = 0; t < triN; t++) {
        for (let k = 0; k < 3; k++) {
          const vi = gidx ? gidx.getX(t * 3 + k) : t * 3 + k;
          _bv.fromBufferAttribute(gp, vi).applyMatrix4(o.group.matrixWorld);
          arr[t * 9 + k * 3] = _bv.x; arr[t * 9 + k * 3 + 1] = _bv.y; arr[t * 9 + k * 3 + 2] = _bv.z;
          const dd = Math.hypot(_bv.x - o.cx, _bv.y - cyC, _bv.z - o.cz);
          if (dd > bR) bR = dd;
        }
      }
      rec.meshTris = arr;
      rec.boundR = bR;   // 世界包围球半径（炮弹粗判用，比 radius 更贴合位移后真实范围）
    }
    const solid = rule ? (rule.solid || (!rule.noCollide && o.collide !== false)) : (o.collide !== false);
    if (solid) {
      const ob = { x: o.cx, z: o.cz, r: o.r * (o.obstacleK ?? 0.82), kind: o.obstacleKind || 'building',
        topY: o.y0 + o.height, d: rec };   // topY：LOS 射线高度判定（低障碍/坡地可越过）
      this.addObstacle(ob);
      rec.obstacle = ob;
    }
    this._gAdd(rec, rec.box.min.x, rec.box.min.z, rec.box.max.x, rec.box.max.z);   // 空间网格入桶
    this.list.push(rec);
    return rec;
  }

  // ── Instanced 物件注册：mesh + 实例序号 + 求交数据 ──
  // o: { type, mesh: InstancedMesh, index, x, z, r, height, rule, y?, rot?, s?, cyl?, cr?, minx..maxz?, obstacle? }
  registerInst(o) {
    const rule = o.rule || INST_PROPS[o.type] || { hp: 1, rubbleH: 0.3 };
    const rec = {
      kind: 'inst', type: o.type, rule, hp: rule.hp, maxHp: rule.hp, alive: true,
      x: o.x, z: o.z, y: o.y !== undefined ? o.y : this.groundY(o.x, o.z),
      rot: o.rot || 0, s: o.s || 1,
      mesh: o.mesh, i: o.index,
      radius: o.r !== undefined ? o.r : 1,
      srcH: o.height !== undefined ? o.height : 1,
      cyl: !!o.cyl, cr: o.cr || 0,
      minx: o.minx, miny: o.miny, minz: o.minz, maxx: o.maxx, maxy: o.maxy, maxz: o.maxz,
      obstacle: o.obstacle || null,
    };
    // 求交包围盒缺省：以 r 为半宽、y..y+height 的立方体
    if (rec.minx === undefined) { rec.minx = rec.x - rec.radius; rec.maxx = rec.x + rec.radius; }
    if (rec.minz === undefined) { rec.minz = rec.z - rec.radius; rec.maxz = rec.z + rec.radius; }
    if (rec.miny === undefined) { rec.miny = rec.y; rec.maxy = rec.y + rec.srcH; }
    if (o.sight) { rec.sight = o.sight; this.sightAdd(o.sight); }   // 软视线遮挡（灌木）
    this._gAdd(rec, rec.minx, rec.minz, rec.maxx, rec.maxz);        // 空间网格入桶
    this.list.push(rec);
    return rec;
  }

  // ── 炮弹命中钩子（原 world.onShellHitDestructible）：命中返回 true（炮弹爆炸销毁） ──
  // prev/pos: 上一帧与当前帧弹道点（Vector3）；shell: 炮弹对象（取弹种）
  // 围栏 / 电线杆：不可被炮弹命中（炮弹直接穿过），只能被履带压毁
  shellHit(prev, pos, shell) {
    const mx = (prev.x + pos.x) / 2, mz = (prev.z + pos.z) / 2;
    const step = Math.hypot(pos.x - prev.x, pos.z - prev.z) + 1;
    // 空间网格聚集：只测弹道段附近候选（语义与原全表扫描一致——任一命中即爆）
    const cands = this._gGather(
      Math.min(prev.x, pos.x) - step, Math.min(prev.z, pos.z) - step,
      Math.max(prev.x, pos.x) + step, Math.max(prev.z, pos.z) + step);
    for (const d of cands) {
      if (!d.alive) continue;
      if (d.kind === 'inst' && d.type.startsWith('fence')) continue;   // 围栏：炮弹穿过
      if (d.kind === 'inst' && d.type.startsWith('snowbush')) continue; // 雪灌木：炮弹穿过（同围栏）
      if (d.kind === 'group' && d.type === 'pylon01') continue;        // 电线杆：穿过
      if (d.kind === 'group') {
        const rr = (d.boundR || d.radius) + step;
        if (Math.abs(d.cx - mx) > rr || Math.abs(d.cz - mz) > rr) continue;
        const hitOk = d.meshTris
          ? segTrisHit(prev.x, prev.y, prev.z, pos.x, pos.y, pos.z, d.meshTris)   // 巨石：精确网格求交（判定面=可见石面）
          : d.ellipsoid
            ? segEllipsoidHit(prev.x, prev.y, prev.z, pos.x, pos.y, pos.z,
                d.cx, (d.box.min.y + d.box.max.y) / 2, d.cz,
                (d.box.max.x - d.box.min.x) / 2, (d.box.max.y - d.box.min.y) / 2, (d.box.max.z - d.box.min.z) / 2)
            : segBoxHit(prev.x, prev.y, prev.z, pos.x, pos.y, pos.z,
                d.box.min.x, d.box.min.y, d.box.min.z, d.box.max.x, d.box.max.y, d.box.max.z);
        if (hitOk) {
          this.damageDestructible(d, pos, shell ? shell.shellType : undefined);
          return true;
        }
      } else {
        const rr = (d.radius || 1) + step;
        if (Math.abs(d.x - mx) > rr || Math.abs(d.z - mz) > rr) continue;
        if (d.cyl) {
          if (segCylHit(prev.x, prev.y, prev.z, pos.x, pos.y, pos.z, d.x, d.z, d.cr, d.y, d.y + d.srcH)) {
            if (isTreeType(d.type)) {
              // 炮弹穿树：不爆不挡弹——树干被削断直接倒 + 树冠积雪/叶震落（雪原主题为雪白系）
              const th = rand() * Math.PI * 2;
              this.leafBurst(d.x, d.y + d.srcH * 0.55, d.z, 45 + Math.floor(rand() * 20), isConiferType(d.type), d.s * 2.5);
              this.fellTree(d, Math.cos(th), Math.sin(th), true);
              continue;   // 炮弹存活，继续扫描同段其他物件
            }
            this.damageDestructible(d, pos);
            return true;
          }
        } else if (segBoxHit(prev.x, prev.y, prev.z, pos.x, pos.y, pos.z,
          d.minx, d.miny, d.minz, d.maxx, d.maxy, d.maxz)) {
          this.damageDestructible(d, pos);
          return true;
        }
      }
    }
    return false;
  }

  // ── 履带压毁（每帧检查车体矩形接触；只压接触到的物件/围栏节） ──
  // tank: 玩家或 AI 敌坦；rig: 相机装置（可为 null——AI 敌坦无 rig 时不震屏）
  crushCheck(tank, rig) {
    if (!tank || tank.destroyed) return;
    _cfw.set(0, 0, -1).applyQuaternion(tank.root.quaternion);
    _crt.set(1, 0, 0).applyQuaternion(tank.root.quaternion);
    const hl = (tank.cfg.dims.length || 7) / 2 + 0.6;
    const hw = (tank.cfg.dims.width || 3.4) / 2 + 0.5;
    const px = tank.root.position.x, pz = tank.root.position.z;
    // 空间网格聚集：车体附近候选（60m 粗筛语义保留于循环内）
    const reach = Math.max(hl, hw) + 4;
    const cands = this._gGather(px - reach, pz - reach, px + reach, pz + reach);
    for (const d of cands) {
      if (!d.alive || d.rule.crushH === undefined) continue;
      const cx = d.kind === 'group' ? d.cx : d.x;
      const cz = d.kind === 'group' ? d.cz : d.z;
      const dx = cx - px, dz = cz - pz;
      if (dx * dx + dz * dz > 3600) continue;   // 60m 粗筛
      // 车体局部坐标
      const lx = dx * _crt.x + dz * _crt.z;
      const lz = -dx * _cfw.x - dz * _cfw.z;
      const rr = Math.min(d.radius || 1, 2.2);
      if (Math.abs(lx) > hw + rr || Math.abs(lz) > hl + rr) continue;
      // 压毁
      const rh = d.rule.crushH;
      const isTree = d.kind === 'inst' && isTreeType(d.type);
      const isPylon = d.kind === 'group' && d.type === 'pylon01';
      const isFence = d.kind === 'inst' && d.type.startsWith('fence');
      const hp = new THREE.Vector3(cx, this.groundY(cx, cz) + 0.5, cz);
      // ── 压毁阻力：碾过瞬间减速 + 相机震动（等级：轻0.10 / 中0.30 / 重0.45） ──
      const drag = d.rule.drag || 0.10;
      if (Math.abs(tank.speed) > 0.4) tank.speed *= (1 - drag);
      if (rig) rig.addShake(0.12 + drag * 0.55);
      if (isTree) {
        // 树：倒下（朝远离坦克方向），非压扁；byPlayer 决定 50m 静音门（敌坦压倒远处无声）
        this.fellTree(d, dx, dz, false, !!tank.isPlayer);
      } else if (isPylon) {
        // 电线杆：绕根部倒下（朝远离坦克方向），非压扁
        this.fellPylon(d, dx, dz);
      } else {
        d.hp = 0;
        d.alive = false;
        if (d.kind === 'group') { this._ensureGroup(d); this.grayifyProp(d, 0.5); this.squashGroupProp(d, rh); }
        else this.squashInstProp(d, rh);
        this.finalizeDestruction(d, rh);
      }
      // 压毁特效：长条木片（围栏/树/柴堆纯木片）+ 尘土 + 轻响
      // 压毁音效：树/电线杆在倒伏起始播（fellTree/fellPylon）；木制品 vs 一般物品分音；按听者（玩家）距离衰减
      if (!isTree && !isPylon) {
        const isWoodProp = isFence || (d.kind === 'inst' && d.type === 'wood_log');
        this.audio.playProp(isWoodProp ? 'crushWood' : 'crushObj', 0.35 + drag, { x: cx, z: cz });
      }
      this.effects._debrisBurst(hp, isTree || isFence ? 8 : 5, 6, { mats: isTree || isFence ? DEBRIS.wood : DEBRIS.concrete, size: 0.45, wood: isTree || isFence });
      this.ps.spawn('smoke', {
        x: cx, y: hp.y + 0.4, z: cz, vx: 0, vy: 1.3, vz: 0,
        life: 1.6, size0: 1.5, size1: 5, alpha: 0.3, drag: 0.5, fadeIn: 0.12,
        c0: [0.66, 0.62, 0.55], c1: [0.55, 0.52, 0.47],
      });
    }
  }

  // ── 每帧驱动：倒塌 / 倒树 / 倒电线杆 / 火点烟源 ──
  update(dt) {
    this.updateCollapsing(dt);    // 建筑倒塌动画（下沉→废墟）
    this.updateFallingTrees(dt);  // 树木倒伏动画
    this.updateFallingPylons(dt); // 电线杆倒伏动画
    this.updatePropFires(dt);     // 建筑火点（火焰+灰烟）
  }

  // ── 废墟坡度场求值：中心 h → 边缘 0 的余弦衰减（先距离粗筛，避免高频三角函数） ──
  rubbleHeightAt(x, z) {
    let h = 0;
    for (let i = 0; i < this.rubbleFields.length; i++) {
      const f = this.rubbleFields[i];
      const dx = x - f.x, dz = z - f.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < f.r * f.r) h += f.h * (0.5 + 0.5 * Math.cos(Math.sqrt(d2) / f.r * Math.PI));
    }
    return h;
  }

  // ── 已摧毁计数 ──
  get destroyed() {
    let n = 0;
    for (const d of this.list) if (!d.alive) n++;
    return n;
  }

  // ── 清理实例状态（网格由地图根节点统一移除，这里只清逻辑状态） ──
  dispose() {
    this.list.length = 0;
    this.fallingTrees.length = 0;
    this.fallingPylons.length = 0;
    this.collapsing.length = 0;
    this.propFires.length = 0;
    this.rubbleFields.length = 0;
    this._fireAcc = 0;
  }

  // ── 音频距离（米）与归一化（0=近处全响；参考 listener，缺省 0） ──
  _distRaw(pos) {
    const l = this.listener;
    if (!l) return 0;
    let p = null;
    if (typeof l === 'function') p = l();
    else if (l.isVector3) p = l;
    else if (l.root && l.root.position) p = l.root.position;
    else if (l.position) p = l.position;
    if (!p) return 0;
    return p.distanceTo(pos);
  }

  _dist01(pos) {
    return clamp(this._distRaw(pos) / 800, 0, 1);
  }

  // ── 雪原主题（阿登）：effects.theme 由 maps.js 按图设置；树/灌木烟尘换雪白系 ──
  _snow() { return !!(this.effects && this.effects.theme === 'snow'); }
  _pickDust() { return this._snow() ? SNOW_DUST_COLORS[(rand() * SNOW_DUST_COLORS.length) | 0] : pickDust(); }

  // ── 敌坦压倒的树：50m 外静音、50m 内随距离线性衰减；玩家压倒全额 ──
  _enemyTreeGate(pos, byPlayer) {
    if (byPlayer) return 1;
    const d = this._distRaw(pos);
    return d >= 50 ? 0 : 1 - d / 50;
  }

  // ═══════════════ 以下为原 map-test.html 全局函数移植（改为实例方法） ═══════════════

  // —— inst 物件压扁到目标高度（树桩/倒伏/残骸） ——
  squashInstProp(p, targetH) {
    if (!p.mesh) return;
    _iq.setFromAxisAngle(UP, p.rot);
    _ip.set(p.x, p.y, p.z);
    // XZ 微缩 0.85 制造"塌缩堆"观感
    _is.set(p.s * 0.85, Math.max(targetH / p.srcH, 0.02), p.s * 0.85);
    _im.compose(_ip, _iq, _is);
    p.mesh.setMatrixAt(p.i, _im);
    p.mesh.instanceMatrix.needsUpdate = true;
  }

  // —— group 物件（车辆/巨石等）压扁到目标高度（仅用于压毁/一般性毁坏，建筑倒塌走 collapsing 流程） ——
  squashGroupProp(d, targetH) {
    const k = targetH / d.height;
    d.group.scale.y = d.baseScaleY * k;
    // 归零俯仰/侧倾：巨石落地带 ±17° 随机倾角，压扁后斜面一端会悬空 1m+（"悬浮平面"观感）
    d.group.rotation.x = 0;
    d.group.rotation.z = 0;
    // 测后落位：按实测包围盒把压扁体底面贴到地表（微沉 0.05），对深埋底座的巨石同样成立
    d.group.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(d.group);
    d.group.position.y += this.groundY(d.cx, d.cz) - 0.05 - bb.min.y;
  }

  // —— 建筑战损着色：整体变灰（水泥灰 + 泥土色，非黑色） ——
  grayifyProp(d, k) {
    if (!d._mats) {
      d._mats = [];
      d.group.traverse(o => {
        if (o.isMesh) {
          o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
          d._mats.push(o.material);
        }
      });
    }
    for (const mm of d._mats) {
      const arr = Array.isArray(mm) ? mm : [mm];
      for (const m of arr) {
        if (m.color) m.color.lerp(_grayMix, k);
        if (m.roughness !== undefined) m.roughness = Math.min(1, m.roughness + 0.1);
      }
    }
  }

  // ── 持续烟源系统：mode='fire' 火焰+灰烟；mode='smoke' 纯烟（废墟/倒树，1m 高悬浮烟尘） ──
  addPropFire(x, y, z, dur, k = 0.8, mode = 'fire') {
    this.propFires.push({ x, y, z, until: performance.now() / 1000 + dur, k, mode });
  }

  updatePropFires(dt) {
    const now = performance.now() / 1000;
    this._fireAcc += dt;
    const emit = this._fireAcc >= 0.03;
    if (emit) this._fireAcc = 0;
    for (let i = this.propFires.length - 1; i >= 0; i--) {
      const f = this.propFires[i];
      if (now > f.until) { this.propFires.splice(i, 1); continue; }
      if (!emit) continue;
      const fade = Math.min(1, (f.until - now) / 4);   // 尾段淡出
      const k = f.k * fade;
      if (f.mode === 'smoke' || f.mode === 'smokeDark') {
        // 纯烟：1m 高度左右悬浮的灰褐烟尘；smokeDark = 灰黑薄烟向上飘（弃车瘫痪标记）
        const dark = f.mode === 'smokeDark';
        const col = dark
          ? { c0: [0.30, 0.30, 0.30], c1: [0.16, 0.16, 0.17] }
          : this._pickDust();   // 雪原主题：倒树/废墟持续烟尘换雪白系
        this.ps.spawn('smoke', {
          x: f.x + (rand() - 0.5) * (dark ? 0.8 : 2.2), y: f.y + (dark ? rand() * 0.5 : 0.5 + rand() * 0.9), z: f.z + (rand() - 0.5) * (dark ? 0.8 : 2.2),
          vx: (rand() - 0.5) * 0.4, vy: dark ? 0.7 + rand() * 0.5 : 0.35 + rand() * 0.5, vz: (rand() - 0.5) * 0.4,
          life: dark ? 2.2 + rand() * 1.5 : 3 + rand() * 2.5,
          size0: dark ? 0.5 + k * 0.3 : 1.6 + k * 1.2, size1: dark ? 2.2 + k * 1.6 : 6 + k * 5,
          alpha: jA(dark ? 0.30 : 0.3, 0.25),
          grav: -0.15, drag: 0.35, windK: 1.1, fadeIn: 0.35, sizeEase: 1.8,
          c0: jCol(col.c0), c1: jCol(col.c1),
        });
        continue;
      }
      // 火焰
      this.ps.spawn('fire', {
        x: f.x + (rand() - 0.5) * 1.4, y: f.y + 0.3, z: f.z + (rand() - 0.5) * 1.4,
        vy: 1.0 + rand() * 0.7 * k, life: 0.4, size0: 0.5 + k * 0.5, size1: 1.6 + k * 1.4,
        alpha: 0.75, sizeEase: 1.4, fadeIn: 0.2,
        c0: [1, 0.7, 0.25], c1: [0.8, 0.22, 0.05],
      });
      // 灰烟
      const col = pickDust();
      this.ps.spawn('smoke', {
        x: f.x + (rand() - 0.5) * 1.2, y: f.y + 0.8, z: f.z + (rand() - 0.5) * 1.2,
        vx: (rand() - 0.5) * 0.5, vy: 0.8 + rand() * 0.6, vz: (rand() - 0.5) * 0.5,
        life: 2.6 + rand() * 2, size0: 1.4, size1: 5 + k * 3, alpha: jA(0.26, 0.25),
        grav: -0.3, drag: 0.3, windK: 1.2, fadeIn: 0.3, sizeEase: 2,
        c0: jCol(col.c0), c1: jCol(col.c1),
      });
      if (rand() < 0.2) this.ps.flash(new THREE.Vector3(f.x, f.y + 1, f.z), 0xff7722, 9 * k, 8);
    }
  }

  // ── 大团尘云（烟雾弹级，多层配色，遮蔽倒塌过程） ──
  bigDust(x, y, z, n, spread, sizeK = 1) {
    this.bigDustAbs(x, y, z, n, spread, (5 + rand() * 5) * sizeK, (24 + rand() * 16) * sizeK);
  }
  // 绝对烟径版本：sz0 初始直径 / sz1 膨胀直径（按房屋跨度生成）
  bigDustAbs(x, y, z, n, spread, sz0, sz1) {
    for (let i = 0; i < n; i++) {
      const col = pickDust();
      this.ps.spawn('smoke', {
        x: x + (rand() - 0.5) * spread, y: y + rand() * 2.5, z: z + (rand() - 0.5) * spread,
        vx: (rand() - 0.5) * 3.2, vy: 0.9 + rand() * 1.8, vz: (rand() - 0.5) * 3.2,
        life: 4 + rand() * 3.2, size0: sz0 * (0.75 + rand() * 0.5), size1: sz1 * (0.75 + rand() * 0.5),
        alpha: jA(0.5, 0.3), drag: 0.4, windK: 0.6, fadeIn: 0.25, sizeEase: 1.6,
        c0: jCol(col.c0), c1: jCol(col.c1),
      });
    }
  }

  // ── 弹着点外向方向：从建筑中心指向命中点的单位向量（近心时随机） ──
  hitOutward(d, hitPos) {
    let dx = hitPos.x - d.cx, dz = hitPos.z - d.cz;
    const l = Math.hypot(dx, dz);
    if (l < 0.5) { const a = rand() * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; }
    return [dx / l, dz / l];
  }

  // ── 命中包围烟：主烟柱在弹着点外侧（不被楼体遮挡），环绕烟全部在建筑轮廓之外 ──
  surroundSmoke(d, hitPos, big) {
    const w = d.box.max.x - d.box.min.x, dp = d.box.max.z - d.box.min.z;
    const gy = this.groundY(d.cx, d.cz);
    const [ox, oz] = this.hitOutward(d, hitPos);
    // 弹着点主烟柱：沿外向推出 3-6m（墙外侧腾起），高度取命中高度
    for (let i = 0; i < 3; i++) {
      const off = 3 + rand() * 3;
      const col = pickDust();
      this.ps.spawn('smoke', {
        x: hitPos.x + ox * off + (rand() - 0.5) * 2, y: hitPos.y + 0.4 + i * 1.4, z: hitPos.z + oz * off + (rand() - 0.5) * 2,
        vx: ox * 1.6 + (rand() - 0.5) * 2, vy: 2.2 + rand() * 2, vz: oz * 1.6 + (rand() - 0.5) * 2,
        life: 3.8 + rand() * 2.6, size0: 4.5 + rand() * 3, size1: 22 + rand() * 12,
        alpha: jA(0.52, 0.25), drag: 0.4, windK: 0.7, fadeIn: 0.12, sizeEase: 1.6,
        c0: jCol(col.c0), c1: jCol(col.c1),
      });
    }
    // 环绕烟罩：椭圆轮廓外一圈（半长/半宽 + 外扩），80% 偏向命中侧
    const n = big ? 20 : 14;
    for (let i = 0; i < n; i++) {
      const a = (rand() < 0.8)
        ? Math.atan2(oz, ox) + (rand() - 0.5) * 2.4          // 命中侧扇区
        : rand() * Math.PI * 2;                              // 其余四周
      const rx = d.cx + Math.cos(a) * (w / 2 + 1.5 + rand() * w * 0.8);
      const rz = d.cz + Math.sin(a) * (dp / 2 + 1.5 + rand() * dp * 0.8);
      const col = pickDust();
      this.ps.spawn('smoke', {
        x: rx, y: gy + 0.5 + rand() * 2.6, z: rz,
        vx: (rand() - 0.5) * 2.6, vy: 1.1 + rand() * 1.8, vz: (rand() - 0.5) * 2.6,
        life: 3.2 + rand() * 3, size0: 4 + rand() * 5, size1: 16 + rand() * 14,
        alpha: jA(0.46, 0.3), drag: 0.42, windK: 0.7, fadeIn: 0.15 + rand() * 0.25, sizeEase: 1.7,
        c0: jCol(col.c0), c1: jCol(col.c1),
      });
    }
  }

  // ── 程序化废墟堆：多灰度灰砖 + 木梁，面积扩为原建筑 1.3 倍（线性 ×1.14）；house02 大宅 ×2 ──
  buildRubblePile(d, off = null) {
    const rk = RUBBLE_SCALE[d.type] || 1;
    const w = (d.box.max.x - d.box.min.x) * 1.14 * rk, dp = (d.box.max.z - d.box.min.z) * 1.14 * rk;
    const rh = d.rule.rubbleH;
    const cx = d.cx + (off ? off.ox : 0), cz = d.cz + (off ? off.oz : 0);   // 倾斜倒塌时偏移到完全沉降侧
    const gy = this.groundY(cx, cz);
    const byMat = new Map();   // 材质 → 几何体数组
    const push = (mat, geo) => { let a = byMat.get(mat); if (!a) { a = []; byMat.set(mat, a); } a.push(geo); };
    const R = Math.max(w, dp) / 2;
    const nBlocks = clamp(Math.round(w * dp / 3.0), 30, 92);
    for (let i = 0; i < nBlocks; i++) {
      // 中心高边缘低（余弦衰减），块体从 6 档灰度随机取（深浅不一）
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * R * 0.94;
      const px = Math.cos(a) * rr * (w / Math.max(w, dp)), pz = Math.sin(a) * rr * (dp / Math.max(w, dp));
      const fall = 1 - (rr / R) * 0.72;
      const bw = 0.3 + rand() * 1.4, bh = (0.25 + rand() * 0.8) * fall, bd = 0.3 + rand() * 1.4;
      const g = new THREE.BoxGeometry(bw, Math.max(bh * rh, 0.15), bd);
      g.rotateY(rand() * Math.PI);
      g.rotateZ((rand() - 0.5) * 0.55);
      g.translate(px, gy + (0.1 + rand() * 0.6) * rh * fall, pz);
      push(DEBRIS.concrete[(rand() * DEBRIS.concrete.length) | 0], g);
    }
    // 碎木板/灰板：平贴散落（增加层次）
    const nPlanks = 6 + Math.floor(rand() * 5);
    for (let i = 0; i < nPlanks; i++) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * R * 0.9;
      const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
      const g = new THREE.BoxGeometry(0.8 + rand() * 1.8, 0.08 + rand() * 0.1, 0.35 + rand() * 0.5);
      g.rotateY(rand() * Math.PI);
      g.rotateZ((rand() - 0.5) * 0.25);
      g.translate(px, gy + 0.06 + rand() * 0.3 * rh, pz);
      push(DEBRIS.wood[(rand() * DEBRIS.wood.length) | 0], g);
    }
    // 木梁：灰褐长条，斜插
    const nBeams = 5 + Math.floor(rand() * 5);
    for (let i = 0; i < nBeams; i++) {
      const a = rand() * Math.PI * 2, rr = rand() * R * 0.82;
      const px = Math.cos(a) * rr * 0.8, pz = Math.sin(a) * rr * 0.8;
      const g = new THREE.BoxGeometry(0.22 + rand() * 0.16, 1.6 + rand() * 2.2, 0.2 + rand() * 0.14);
      g.rotateZ(0.5 + rand() * 1.0);
      g.rotateY(rand() * Math.PI * 2);
      g.translate(px, gy + 0.35 + rand() * 0.5 * rh, pz);
      push(DEBRIS.wood[(rand() * DEBRIS.wood.length) | 0], g);
    }
    const group = new THREE.Group();
    group.position.set(cx, 0, cz);
    // 注意：上面几何体用了世界系坐标（含 gy），group 放原点即可
    for (const [mat, geos] of byMat) {
      let merged = null;
      try { merged = mergeGeos(geos, false); } catch (e) { merged = null; }
      if (merged) {
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.raycast = () => {};   // 废墟不参与测距
        group.add(mesh);
      }
    }
    this.root.add(group);
    return group;
  }

  // ── 建筑倒塌流程：终击触发 → 1 秒内浓烟全罩（2-3 倍房屋面积）→ 3-4s 前慢后快下沉 → 废墟中途升起 ──
  startCollapse(d) {
    d.alive = false;
    this._ensureGroup(d);   // B1：合批实例在此抽出独立克隆（幂等）
    this.grayifyProp(d, 0.55);   // 终击整体重度灰化
    const dur = 3.2 + rand() * 0.8;   // 下沉 3-4s
    const w = d.box.max.x - d.box.min.x, dp = d.box.max.z - d.box.min.z;
    // ── 倾斜沉降式（需 ≥2 发击毁的建筑）：一侧沉降 100%、另一侧 30%，边降边倾斜 ──
    // 随机倒塌方向 dir；低沉降侧（-dir）最终有一部分露在地面外；废墟偏移到完全沉降侧（+dir）
    let tilt = null;
    if (d.maxHp >= 2) {
      const th = rand() * Math.PI * 2;
      const dirX = Math.cos(th), dirZ = Math.sin(th);
      const e = Math.abs(dirX) * (w / 2) + Math.abs(dirZ) * (dp / 2);   // 沿 dir 的半跨
      const H = d.height;
      const sinkLow = H * 0.3;                                          // 低沉降侧（露出侧）下沉量
      const drop = H * 0.75;                                            // 两侧沉降差（0.3H → 1.05H）
      const alpha = Math.asin(clamp(drop / (2 * e), 0, 1));             // 绕低侧边的终态倾角
      // 支点 = 低沉降侧边缘（地面处）；旋转轴垂直于 dir，使 +dir 侧下沉
      const pivot = new THREE.Object3D();
      pivot.position.set(d.cx - dirX * e, d.group.position.y, d.cz - dirZ * e);
      this.root.add(pivot);
      pivot.attach(d.group);                                            // 保持世界变换重挂到支点下
      tilt = {
        pivot, pLowY: pivot.position.y,          // 支点初始 y
        axis: new THREE.Vector3(dirZ, 0, -dirX).normalize(),
        alpha, sinkLow,
        dirX, dirZ, offE: e * 0.8,              // 废墟向完全沉降侧偏移量
      };
    }
    this.collapsing.push({
      d, t: 0, dur,
      y0: d.group.position.y,
      sink: d.height * 1.06,               // 完全沉入地下（纯沉降式）
      tiltAxis: new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize(),
      tiltMax: 0.05 + rand() * 0.04,
      tilt,                                 // null = 纯沉降式；对象 = 倾斜沉降式
      dustT: 0, debrisT: 0,
      rubble: null, riseK: 0,
      sizeK: clamp(Math.max(w, dp) / 9, 0.65, 1.9),   // 补尘散布范围系数
      span: Math.max(w, dp),                            // 房屋跨度（烟径基数）
      w, dp,
    });
    // 起始爆响：按占地面积分大/小房屋倒塌音（实测：house01≈82 / house02≈128-281 / barn01≈165 大；house03≈46 / barn03≈57 / 营房 14-49 小）
    const isLarge = w * dp >= 80;
    this.audio.playProp(isLarge ? 'collapseLg' : 'collapseSm', 1 - this._dist01(d.group.position) * 0.75);
    // ── 瞬间爆烟：1 秒内腾起大量多层烟雾，快速达到最高浓度 ──
    // 烟团尺寸按房屋跨度绝对生成：初始=跨度×1.5，膨胀后=跨度×2-3 倍（大房大烟小房小烟）
    const R = Math.max(w, dp);
    const s0 = R * 1.5;                       // 初始烟径 = 跨度 × 1.5
    const s1 = R * (2 + rand());              // 膨胀烟径 = 跨度 × 2-3
    const burstN = Math.round((40 + rand() * 12) * clamp(w * dp / 110, 0.55, 2.1));   // 数量按占地面积
    for (let i = 0; i < burstN; i++) {
      const col = pickDust();
      // 环形分布：建筑轮廓外 0-1.4 倍外扩（烟雾不被楼体遮挡）
      const a = rand() * Math.PI * 2, rr = R * (0.55 + rand() * 1.35);
      this.ps.spawn('smoke', {
        x: d.cx + Math.cos(a) * rr, y: this.groundY(d.cx, d.cz) + 0.4 + rand() * 3.2, z: d.cz + Math.sin(a) * rr,
        vx: (rand() - 0.5) * 4.6, vy: 1.2 + rand() * 2.8, vz: (rand() - 0.5) * 4.6,
        life: 5.5 + rand() * 4, size0: s0 * (0.75 + rand() * 0.5), size1: s1 * (0.75 + rand() * 0.5),
        alpha: jA(0.6, 0.25), drag: 0.42, windK: 0.55, fadeIn: 0.08, sizeEase: 1.5,
        c0: jCol(col.c0), c1: jCol(col.c1),
      });
    }
    // 首波碎片：多点大爆发（大块近落 + 小块远飞，覆盖 2 倍房屋范围）
    {
      const w2 = d.box.max.x - d.box.min.x, dp2 = d.box.max.z - d.box.min.z;
      const span2 = Math.max(w2, dp2);
      const areaK2 = clamp(w2 * dp2 / 110, 0.55, 2.1);
      const total2 = Math.round(220 * areaK2);
      const nB = Math.round(total2 * 0.3), nS = total2 - nB;
      for (let i = 0; i < 6; i++) {
        const px = d.cx + (rand() - 0.5) * span2 * 1.1;
        const pz = d.cz + (rand() - 0.5) * span2 * 1.1;
        const p = new THREE.Vector3(px, this.groundY(px, pz) + 1 + rand() * 1.5, pz);
        this.effects._debrisBurst(p, Math.max(2, Math.round(nB / 6)), 5 + rand() * 2.5, { mats: DEBRIS.wood, size: 1.8, wood: true });
        this.effects._debrisBurst(p, Math.max(3, Math.round(nS / 6)), 17 + rand() * 7, { mats: DEBRIS.wood, size: 0.5, wood: true });
        this.effects._debrisBurst(p, 5, 11, { mats: DEBRIS.concrete, size: 0.55 });
      }
    }
  }

  updateCollapsing(dt) {
    for (let i = this.collapsing.length - 1; i >= 0; i--) {
      const c = this.collapsing[i];
      c.t += dt;
      const k = Math.min(c.t / c.dur, 1);
      const ease = Math.pow(k, 2.3);   // 前期慢后期快
      if (c.tilt) {
        // 倾斜沉降式：支点（低沉降侧边缘）下沉 0.3H，同时绕垂直于倒塌方向的轴倾斜
        // +dir 侧最终沉降 1.05H 完全入地；-dir 侧只沉 0.3H，一部分墙体露在地面外
        c.tilt.pivot.position.y = c.tilt.pLowY - c.tilt.sinkLow * ease;
        c.tilt.pivot.quaternion.setFromAxisAngle(c.tilt.axis, c.tilt.alpha * ease);
      } else {
        // 纯沉降式：整体下沉 + 微倾（烟雾全罩后才开始明显下沉）
        c.d.group.position.y = c.y0 - c.sink * ease;
        c.d.group.quaternion.setFromAxisAngle(c.tiltAxis, c.tiltMax * ease);
      }
      // 废墟在倒塌中段从地面逐渐升起（覆盖倒塌后半程）；倾斜式偏移到完全沉降侧
      if (!c.rubble && k > 0.38) {
        c.rubble = this.buildRubblePile(c.d, c.tilt ? { ox: c.tilt.dirX * c.tilt.offE, oz: c.tilt.dirZ * c.tilt.offE } : null);
        c.rubble.scale.y = 0.02;
      }
      if (c.rubble && c.riseK < 1) {
        c.riseK = clamp((k - 0.38) / 0.5, 0, 1);
        c.rubble.scale.y = 0.02 + 0.98 * (c.riseK * c.riseK * (3 - 2 * c.riseK));   // smoothstep 升起
      }
      // 持续尘云：高密度维持遮蔽（前 70% 时间最浓）；烟径按房屋跨度（初始×1.5 → 膨胀×2-2.5）
      c.dustT -= dt;
      if (c.dustT <= 0) {
        c.dustT = k < 0.7 ? 0.06 : 0.12;   // 前期每 60ms 一波，后期渐疏
        const px = c.d.cx + (rand() - 0.5) * c.w * 1.1;
        const pz = c.d.cz + (rand() - 0.5) * c.dp * 1.1;
        this.bigDustAbs(px, this.groundY(px, pz) + 0.8 + rand() * 2, pz, k < 0.7 ? 3 : 1, 11 * c.sizeK,
          c.span * 1.5, c.span * (2 + rand() * 0.5));
      }
      // 碎片流：以木片为主，偶有小砖石
      c.debrisT -= dt;
      if (c.debrisT <= 0) {
        c.debrisT = 0.13;
        const px = c.d.cx + (rand() - 0.5) * c.w * 0.9;
        const pz = c.d.cz + (rand() - 0.5) * c.dp * 0.9;
        const p = new THREE.Vector3(px, this.groundY(px, pz) + 1 + rand() * 1.5, pz);
        if (rand() < 0.75) this.effects._debrisBurst(p, 12 + Math.floor(rand() * 10), 9 + rand() * 9, { mats: DEBRIS.wood, size: 0.8, wood: true });
        else this.effects._debrisBurst(p, 6 + Math.floor(rand() * 5), 8 + rand() * 6, { mats: DEBRIS.concrete, size: 0.5 });
      }
      if (k >= 1) {
        // 倒塌完成。纯沉降式：移除建筑；倾斜沉降式：保留倾斜模型（低沉降侧露在地面外）
        const off = c.tilt ? { ox: c.tilt.dirX * c.tilt.offE, oz: c.tilt.dirZ * c.tilt.offE } : null;
        if (!c.tilt) this.root.remove(c.d.group);
        if (rand() < 0.12) {
          // 废墟无持续烟尘，仅 12% 几率残留一簇小明火（放在废墟堆上）
          const fx = c.d.cx + (off ? off.ox : 0) + (rand() - 0.5) * c.w * 0.5;
          const fz = c.d.cz + (off ? off.oz : 0) + (rand() - 0.5) * c.dp * 0.5;
          this.addPropFire(fx, this.groundY(fx, fz) + 0.25, fz, 10 + rand() * 6, 0.3, 'fire');
        }
        this.finalizeDestruction(c.d, c.d.rule.rubbleH, off);
        this.collapsing.splice(i, 1);
      }
    }
  }

  // ── 落叶飞散：叶片 5cm×3cm，从树冠外侧飘散点快速上扬 → 阻力衰减 → 自然飘落扩散 ──
  // opts: { leafScale=1.5（叶片几何 7.5cm×4.5cm 的倍率）, dirt=true（是否夹带灰土碎屑块） }
  leafBurst(x, y, z, n, pine, canopyR = 2.5, opts = {}) {
    const leafScale = opts.leafScale ?? 1.5;
    const snow = this._snow();   // 雪原：落叶改积雪碎团（白），夹带碎屑改雪尘
    const leafMats = snow ? DEBRIS.snowFlake : (pine ? DEBRIS.pineNeedle : DEBRIS.leaf);
    const dirtMats = snow ? DEBRIS.snowDirt : DEBRIS.dirt;
    // 飘散点分布在树冠外侧环形（每个叶片独立起点，扩散自然）
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const rr = canopyR * (0.8 + rand() * 0.5);           // 树冠外侧
      p.set(x + Math.cos(a) * rr, y + (rand() - 0.5) * 1.2, z + Math.sin(a) * rr);
      this.effects._debrisBurst(p, 1, 12 + rand() * 6, {
        mats: leafMats,
        leaf: true,            // 7.5cm×4.5cm 小叶片几何
        leafScale,
        grav: 2.6,             // 飘落速度：整体 ~2.5s 内落地
        drag: 3.0,             // 强阻力：初速快速衰减 → 上扬后马上转缓降
        life: 3.0 + rand() * 1.2,
      });
    }
    // 尘土伴随：树冠外侧同区域灰土小碎屑与叶子混飘（灌木丛穿越传 dirt:false —— 只要薄片不要块状物）
    if (opts.dirt ?? true) {
      for (let i = 0; i < Math.max(4, (n / 4) | 0); i++) {
        const a = rand() * Math.PI * 2;
        const rr = canopyR * (0.85 + rand() * 0.45);
        p.set(x + Math.cos(a) * rr, y + (rand() - 0.3) * 1.5, z + Math.sin(a) * rr);
        this.effects._debrisBurst(p, 1, 8 + rand() * 4, {
          mats: dirtMats, size: 0.28,
          grav: 2.2, drag: 2.8, life: 2.4 + rand() * 0.9,
        });
      }
    }
  }

  // ── 树木倒伏：绕根部旋转倒下（非压扁），起始播倒树音（压倒/炮击两版），落点扬起烟尘 ──
  // byPlayer：玩家压倒（全额音量）还是敌坦压倒（50m 规则）；炮击倒树（shot）不区分归属，走标准衰减
  fellTree(rec, dirX, dirZ, shot = false, byPlayer = true) {
    rec.hp = 0;
    rec.alive = false;
    const len = Math.hypot(dirX, dirZ) || 1;
    this.fallingTrees.push({
      rec, t: 0, dur: 0.85,
      dx: dirX / len, dz: dirZ / len,
      shot, byPlayer, creaked: 0,   // 倒伏过程辅助吱嘎声计数（0.22s/0.5s 各一次）
    });
    // 主音源：玩家压倒 0.32（实测仍偏大，较 0.54 再降 40%）；炮击倒树 0.9；敌坦压倒叠加 50m 静音门
    const pos = new THREE.Vector3(rec.x, rec.y, rec.z);
    let vol = (shot ? 0.9 : 0.32) * (1 - this._dist01(pos) * 0.8);
    if (!shot) vol *= this._enemyTreeGate(pos, byPlayer);
    if (vol > 0.01) this.audio.playProp(shot ? 'treeShot' : 'treeTopple', vol);
  }

  updateFallingTrees(dt) {
    for (let i = this.fallingTrees.length - 1; i >= 0; i--) {
      const f = this.fallingTrees[i];
      const r = f.rec;
      f.t += dt;
      // 辅助吱嘎声：倒伏中途叠播（多次播放；敌坦压倒同样受 50m 静音门）
      if (f.creaked < 2 && f.t > (f.creaked === 0 ? 0.22 : 0.5)) {
        f.creaked++;
        const pos = new THREE.Vector3(r.x, r.y, r.z);
        let vol = 0.39 * (1 - this._dist01(pos) * 0.8);
        if (!f.shot) vol *= this._enemyTreeGate(pos, f.byPlayer);
        if (vol > 0.01) this.audio.playProp('treeCreak', vol);
      }
      const k = Math.min(f.t / f.dur, 1);
      const ease = k * k;   // 重力加速倒下
      const ang = ease * 1.42;   // ~81°，不完全贴地
      _fq1.setFromAxisAngle(UP, r.rot);
      _fAxis.set(f.dz, 0, -f.dx);
      _fq2.setFromAxisAngle(_fAxis, ang);
      _fq2.multiply(_fq1);
      _im.compose(_ip.set(r.x, r.y, r.z), _fq2, _is.setScalar(r.s));
      r.mesh.setMatrixAt(r.i, _im);
      r.mesh.instanceMatrix.needsUpdate = true;
      if (k >= 1) {
        // 落地：树冠处即时烟团 + 木屑 + 8-10s 持续烟尘源
        const tipX = r.x + f.dx * r.srcH * 0.7, tipZ = r.z + f.dz * r.srcH * 0.7;
        const ty = this.groundY(tipX, tipZ) + 0.5;
        for (let s = 0; s < 4; s++) {
          const col = this._pickDust();
          this.ps.spawn('smoke', {
            x: tipX + (rand() - 0.5) * 3, y: ty + rand() * 0.6, z: tipZ + (rand() - 0.5) * 3,
            vx: f.dx * 1.2 + (rand() - 0.5), vy: 1 + rand(), vz: f.dz * 1.2 + (rand() - 0.5),
            life: 3.5 + rand() * 2, size0: 2.5, size1: 11, alpha: jA(0.42, 0.3), drag: 0.6, windK: 0.9,
            fadeIn: 0.15, sizeEase: 1.7, c0: jCol(col.c0), c1: jCol(col.c1),
          });
        }
        this.effects._debrisBurst(new THREE.Vector3(tipX, ty, tipZ), 7, 7, { mats: DEBRIS.wood, size: 0.5, wood: true });
        // 落地冲击：木料砸地（低音量，主倒树音已在起始播放；敌坦压倒同样受 50m 静音门）
        const landPos = new THREE.Vector3(tipX, ty, tipZ);
        let landVol = 0.24 * (1 - this._dist01(landPos) * 0.8);
        if (!f.shot) landVol *= this._enemyTreeGate(landPos, f.byPlayer);
        if (landVol > 0.01) this.audio.playProp('crushWood', landVol);
        // 落叶飞散：树冠处大量 + 沿树干中段少量（快速上扬后自然飘落）
        const pine = isConiferType(r.type);
        const canopyR = r.s * 2.5;
        this.leafBurst(tipX, ty, tipZ, 68 + Math.floor(rand() * 28), pine, canopyR);
        this.leafBurst((r.x + tipX) / 2, ty + 0.6, (r.z + tipZ) / 2, 24 + Math.floor(rand() * 16), pine, canopyR * 0.8);
        // 持续烟尘：倒伏树冠 + 树根两处，8-10s
        this.addPropFire(tipX, ty - 0.3, tipZ, 3 + rand(), 0.6, 'smoke');
        this.addPropFire(r.x, r.y, r.z, 2.5 + rand(), 0.4, 'smoke');
        this.fallingTrees.splice(i, 1);
      }
    }
  }

  // —— 电线杆倒伏（group 版）：绕根部 pivot 旋转倒下，只能被压倒、不可炮击 ——
  fellPylon(d, dirX, dirZ) {
    d.hp = 0;
    d.alive = false;
    this._ensureGroup(d);   // B1 合批：先从 InstancedMesh 抽出独立克隆（否则实例还立在原地）
    const len = Math.hypot(dirX, dirZ) || 1;
    const g = d.group;
    const pivot = new THREE.Group();
    pivot.position.copy(g.position);
    g.position.set(0, 0, 0);
    this.root.add(pivot);
    pivot.add(g);
    // 倒伏起始：电线杆（非植物物品）压倒音
    this.audio.playProp('crushObj', 0.8 * (1 - this._dist01(d.group.position) * 0.8));
    this.fallingPylons.push({ d, pivot, t: 0, dur: 0.95, dx: dirX / len, dz: dirZ / len });
  }

  updateFallingPylons(dt) {
    for (let i = this.fallingPylons.length - 1; i >= 0; i--) {
      const f = this.fallingPylons[i];
      f.t += dt;
      const k = Math.min(f.t / f.dur, 1);
      const ease = k * k;   // 重力加速倒下
      _pAxis.set(f.dz, 0, -f.dx);
      _pq.setFromAxisAngle(_pAxis, ease * 1.42);   // ~81°，不完全贴地
      f.pivot.quaternion.copy(_pq);
      if (k >= 1) {
        // 落地：杆尖尘烟 + 碎屑
        const tipX = f.pivot.position.x + f.dx * f.d.height * 0.85;
        const tipZ = f.pivot.position.z + f.dz * f.d.height * 0.85;
        const ty = this.groundY(tipX, tipZ) + 0.4;
        for (let s = 0; s < 3; s++) {
          const col = pickDust();
          this.ps.spawn('smoke', {
            x: tipX + (rand() - 0.5) * 2.5, y: ty + rand() * 0.5, z: tipZ + (rand() - 0.5) * 2.5,
            vx: f.dx * 1 + (rand() - 0.5), vy: 0.9 + rand(), vz: f.dz * 1 + (rand() - 0.5),
            life: 2.5 + rand() * 1.5, size0: 2, size1: 9, alpha: jA(0.4, 0.3), drag: 0.6, windK: 0.9,
            fadeIn: 0.12, sizeEase: 1.7, c0: jCol(col.c0), c1: jCol(col.c1),
          });
        }
        this.effects._debrisBurst(new THREE.Vector3(tipX, ty, tipZ), 5, 6, { mats: DEBRIS.concrete, size: 0.35 });
        // 落地冲击：主压倒音已在起始播放，低音量补落地闷响
        this.audio.playProp('crushObj', 0.5 * (1 - this._dist01(new THREE.Vector3(tipX, ty, tipZ)) * 0.8));
        this.fallingPylons.splice(i, 1);
      }
    }
  }

  // —— 摧毁收尾：视线遮挡失效 + 碰撞与废墟坡度处理（<1.5m 废墟可通行+坡度；≥1.5m 保留阻挡缩半径） ——
  finalizeDestruction(d, rh, off = null) {
    if (d.sight) { this.sightRemove(d.sight); d.sight = null; }   // 灌木视线遮挡随毁失效
    const ox = off ? off.ox : 0, oz = off ? off.oz : 0;
    const rk = d.kind === 'group' ? (RUBBLE_SCALE[d.type] || 1) : 1;   // 废墟范围倍率同步坡度场
    if (d.obstacle) {
      if (rh >= 1.5) {
        // 高废墟仍阻挡：摘除原障碍物后按 0.55 倍半径重新挂回（topY 随废墟高度降档）
        this.removeObstacle(d.obstacle);
        d.obstacle = { x: d.obstacle.x, z: d.obstacle.z, r: d.obstacle.r * 0.55, kind: 'building',
          topY: this.groundY(d.obstacle.x, d.obstacle.z) + rh, d };
        this.addObstacle(d.obstacle);
      } else {
        // 低废墟可通行：摘除障碍物，改记废墟坡度场（坦克骑上去有起伏）
        this.removeObstacle(d.obstacle);
        d.obstacle = null;
        this.rubbleFields.push({ x: (d.cx ?? d.x) + ox, z: (d.cz ?? d.z) + oz, r: d.radius * 1.15 * rk, h: rh });
      }
    } else if (d.kind === 'group') {
      // 无碰撞体建筑也产生坡度
      this.rubbleFields.push({ x: d.cx + ox, z: d.cz + oz, r: d.radius * 1.15 * rk, h: rh });
    }
  }

  // —— 建筑碎片爆发：数量按房屋尺寸缩放（基础×3 / 终击×5），大块近落 + 小块远飞，散布覆盖 2 倍房屋 ——
  buildingDebrisBurst(d, hitPos, last) {
    const w = d.box.max.x - d.box.min.x, dp = d.box.max.z - d.box.min.z;
    const span = Math.max(w, dp);
    const areaK = clamp(w * dp / 110, 0.55, 2.1);                    // 占地系数：house03≈0.45→0.55 / house01≈1.2 / house02≈1.8
    // 覆盖表优先；公式：基础量 70（×3）按面积缩放；终击 ×5（用户：碎块更多、飞得更远）
    const ov = DEBRIS_TABLE[d.type];
    let total, rockN;
    if (ov) { total = ov[last ? 'final' : 'hit'][0]; rockN = ov[last ? 'final' : 'hit'][1]; }
    else { total = Math.round((last ? 340 : 70) * areaK); rockN = Math.round((last ? 42 : 16) * areaK); }
    const bigN = Math.round(total * (last ? 0.3 : 0.35));            // 大块：低速近处掉落
    const smallN = total - bigN;                                      // 小块：高速远飞
    // 弹着点本体一股 + 房屋范围内多点抛射（覆盖 2 倍房屋大小）
    const pts = [hitPos.clone()];
    const nPts = last ? 6 : 4;
    for (let i = 0; i < nPts; i++) {
      const px = d.cx + (rand() - 0.5) * span * 2 * 0.55;
      const pz = d.cz + (rand() - 0.5) * span * 2 * 0.55;
      pts.push(new THREE.Vector3(px, this.groundY(px, pz) + 1 + rand() * 1.6, pz));
    }
    for (const p of pts) {
      this.effects._debrisBurst(p, Math.max(2, Math.round(bigN / pts.length)), 7 + rand() * 3, { mats: DEBRIS.wood, size: 1.8, wood: true });
      this.effects._debrisBurst(p, Math.max(3, Math.round(smallN / pts.length)), 20 + rand() * 8, { mats: DEBRIS.wood, size: 0.5, wood: true });
      this.effects._debrisBurst(p, Math.max(1, Math.round(rockN / pts.length)), last ? 14 : 10, { mats: DEBRIS.concrete, size: 0.55 });
    }
  }

  // —— 炮弹命中伤害：A 组建筑=灰化+包围烟+终击倒塌；其余物件=一般性毁坏（碎片+小爆，无倒塌烟雾） ——
  damageDestructible(d, hitPos, shellType) {
    if (!d.alive) return;
    const isBld = d.kind === 'group' && isCollapseType(d.type);   // A 组建筑（倒塌系统）
    // A 组建筑只有 HE 高爆弹能摧毁结构；AP/HEAT 只有效果不扣血（其他物件不区分弹种）
    const isHE = shellType === undefined || shellType === 'he';
    if (isBld && !isHE) {
      // AP/HEAT 命中建筑：烟尘 + 少量碎屑效果，不灰化不扣血不倒塌
      this.surroundSmoke(d, hitPos, false);
      this.effects._debrisBurst(hitPos, 10, 8, { mats: DEBRIS.wood, size: 0.6, wood: true });
      this.audio.playProp('houseHit', 0.75 * (1 - this._dist01(hitPos) * 0.8));
      return;
    }
    d.hp--;
    const last = d.hp <= 0;
    const isTree = d.kind === 'inst' && isTreeType(d.type);
    const isFence = d.kind === 'inst' && d.type.startsWith('fence');
    const isWood = isTree || isFence || (d.kind === 'inst' && d.type === 'wood_log');
    const dist01 = this._dist01(hitPos);

    // 爆炸特效：A 组建筑命中不出火光（纯烟尘由 surroundSmoke 负责）；其余物件保留小型爆炸
    if (!isBld) this.effects.explosion(hitPos, last ? 0.5 : 0.35);

    // 碎片：以长条木片为主（建筑木质结构），砖石小块少量
    if (isWood) {
      // 围栏/柴堆/树：纯木片
      this.effects._debrisBurst(hitPos, last ? 14 : 9, 8, { mats: DEBRIS.wood, size: 0.55, wood: true });
    } else if (isBld) {
      // A 组建筑：碎片量按房屋尺寸缩放（基础×3，终击×5），大块近落 + 小块远飞，爆炸范围 2 倍房屋
      this.buildingDebrisBurst(d, hitPos, last);
    } else {
      // 其余物件（车/集装箱/金属件等）：一般性毁坏碎片
      this.effects._debrisBurst(hitPos, last ? 8 : 5, 8, { mats: DEBRIS.concrete, size: 0.6 });
    }

    // 命中灰烟（灰土色，A 组建筑命中加量加大并推到弹着点外侧防止被楼体遮蔽）
    const [ox, oz] = isBld ? this.hitOutward(d, hitPos) : [0, 0];
    const ns = isBld ? (last ? 10 : 7) : 2;
    for (let i = 0; i < ns; i++) {
      const col = isBld ? pickDust() : this._pickDust();   // 非建筑（树/围栏/木件）雪原主题走雪白系
      const off = isBld ? 2 + rand() * 4 : 0;
      this.ps.spawn('smoke', {
        x: hitPos.x + ox * off + (rand() - 0.5) * 4, y: hitPos.y + rand() * 2, z: hitPos.z + oz * off + (rand() - 0.5) * 4,
        vx: (rand() - 0.5) * 2.8, vy: 1.8 + rand() * 2.6, vz: (rand() - 0.5) * 2.8,
        life: 3 + rand() * 3, size0: 5, size1: 20 + rand() * 14, alpha: jA(0.46, 0.3), drag: 0.4, windK: 0.8,
        fadeIn: 0.15, sizeEase: 1.7, c0: jCol(col.c0), c1: jCol(col.c1),
      });
    }
    // ── 命中音效（物件专属）：A 组建筑→房屋被击中；树→fellTree 起始播炮击倒树音（跳过）；木制品→木料碾压；其余物件→非植物物品毁伤 ──
    const vAtt = 1 - dist01 * 0.8;
    if (isBld) this.audio.playProp('houseHit', (last ? 0.9 : 0.7) * vAtt);
    else if (isTree) { /* 声音在下方 fellTree(d, …, true) 起始播 */ }
    else if (isWood) this.audio.playProp('crushWood', 0.8 * vAtt);
    else this.audio.playProp('crushObj', 0.75 * vAtt);

    if (isBld) {
      // A 组建筑命中：整体灰化 + 大量灰/灰褐烟雾包围房屋 + 木片碎屑（不着火、不下沉）
      this._ensureGroup(d);
      this.grayifyProp(d, last ? 0.55 : 0.3);
      this.surroundSmoke(d, hitPos, last);
      if (last) this.startCollapse(d);   // 终击才进入倒塌流程
    } else if (d.kind === 'group') {
      // 其余 group 物件（车/集装箱/水塔等）：一般性毁坏——压扁成残骸，无倒塌烟雾
      if (last) {
        d.alive = false;
        this._ensureGroup(d);
        this.squashGroupProp(d, d.rule.rubbleH);
        this.finalizeDestruction(d, d.rule.rubbleH);
      }
    } else if (last) {
      d.alive = false;
      if (isTree) {
        // 炮击毁树：直接倒下（随机方向），树冠先炸开一波落叶
        const th = rand() * Math.PI * 2;
        this.leafBurst(d.x, d.y + d.srcH * 0.55, d.z, 45 + Math.floor(rand() * 20), isConiferType(d.type), d.s * 2.5);
        this.fellTree(d, Math.cos(th), Math.sin(th), true);
        this.effects._debrisBurst(hitPos, 6, 8, { mats: DEBRIS.wood, size: 0.55, wood: true });
        // 炮击毁树：即时烟团 + 8-10s 持续烟尘
        for (let s = 0; s < 3; s++) {
          const col = this._pickDust();
          this.ps.spawn('smoke', {
            x: d.x + (rand() - 0.5) * 2, y: d.y + 0.8 + rand(), z: d.z + (rand() - 0.5) * 2,
            vx: (rand() - 0.5) * 1.5, vy: 1.4 + rand(), vz: (rand() - 0.5) * 1.5,
            life: 3.5 + rand() * 2, size0: 2.2, size1: 10, alpha: jA(0.42, 0.3), drag: 0.6, windK: 0.9,
            fadeIn: 0.15, sizeEase: 1.7, c0: jCol(col.c0), c1: jCol(col.c1),
          });
        }
        this.addPropFire(d.x, d.y, d.z, 3 + rand(), 0.55, 'smoke');
      } else {
        this.squashInstProp(d, d.rule.rubbleH);
      }
      this.finalizeDestruction(d, isTree ? 0.2 : d.rule.rubbleH);
    }
  }
}
