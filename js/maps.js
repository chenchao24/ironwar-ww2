// 地图构建模块：buildMap 装配「库尔斯克 · 1943」东欧平原战场——天空/光照/雾/地面/土路/布景 + 可破坏系统（Destructibles）统一接线
import * as THREE from 'three';
import { Destructibles, PROP_RULES, INST_PROPS, EU_PROP_RULE, isTreeType } from './destructibles.js';
import { HedgeField } from './hedgefield.js';
import { injectTreeWind } from './hedge.js';
import { TERRAIN_RULES } from './config.js';
import { Snowfall } from './snowfall.js';
import { N2_ROADS, N2_LANES, N2_TOWN, N2_PLAZA, N2_TOWN_HOUSES, N2_LAMPS, N2_TOWN_TREES,
         ROAD_HALF as N2_ROAD_HALF, LANE_HALF, EU_SCALE,
         buildParcels, buildHedgeBorders, buildHedgeTrees, buildYardBushes, buildOutskirts, buildYardLayouts,
         N2_TREE_AREAS } from './mapdata-normandy.js';
import { PK_ROADS, PK_ROAD_HALF, PK_RAVINES, ravineCarve, A_VILLAGE, PK_VILLAGE_HOUSES, PK_FARMS,
         PK_TREES, PK_SPAWNS, PK_TREE_ROWS, PK_TREE_CLUSTERS, PK_ROCKS, distToPolyline as pkDist } from './mapdata-prokhorovka.js';
import { AR_ROADS, AR_ROAD_HALF, AR_LANE_HALF, AR_RIDGES, AR_CREEK, creekCarve, AR_VILLAGE, AR_VILLAGE_HOUSES,
         AR_FARMS, AR_FOREST, AR_SPAWNS, AR_ROCKS, distToPolyline as arDist, inPatch } from './mapdata-ardennes.js';

// ── 地图注册表（main.js 读取 name/size/exposure 做选图、活动边界与曝光） ──
export const MAPS = {
  kursk: { id: 'kursk', name: '库尔斯克 · 1943', size: 2200, exposure: 1.22, terrain: 'soft' },      // 松软土地
  normandy: { id: 'normandy', name: '诺曼底 · 1944', size: 2000, exposure: 1.22, terrain: 'hard' },  // 硬地
  prokhorovka: { id: 'prokhorovka', name: '普罗霍罗夫卡 · 1943', size: 1500, exposure: 1.2, terrain: 'prokhorovka', spawns: PK_SPAWNS },  // 冲沟台地（方形 1500）
  ardennes: { id: 'ardennes', name: '阿登森林 · 1944', size: 1600, exposure: 0.95, terrain: 'snow', spawns: AR_SPAWNS },  // 雪林山地（大雾低云）
};

// ── 基础工具 ──
const clamp = THREE.MathUtils.clamp;
const sstep = THREE.MathUtils.smoothstep;
const UP = new THREE.Vector3(0, 1, 0);

// 确定性随机（与 map-test.html / terrain.js 相同实现；地图布局可复现）
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════ 库尔斯克地形高度场（东欧平原，起伏和缓） ═══
// 2200×2200 战场：多层正弦缓丘；中央交战区压平；出生环带（1v1 对峙 900m / 1vN 1100m → 出生半径 450~550m）局部放缓
// 废墟坡度（摧毁后 <1.5m 可通行的废墟场）由 Destructibles.rubbleHeightAt 提供，经 world.setGroundY 叠加
function kurskHeight(x, z) {
  let h = 0;
  h += Math.sin(x * 0.011 + 1.7) * Math.cos(z * 0.013 + 0.4) * 3.4;
  h += Math.sin(x * 0.031 + 4.2) * Math.cos(z * 0.027 + 2.1) * 1.5;
  h += Math.sin(x * 0.083 + 0.3) * Math.cos(z * 0.071 + 5.0) * 0.45;
  // 中央交战区稍平缓
  const d = Math.hypot(x, z);
  let f = 0.35 + 0.65 * sstep(d, 40, 260);
  // 出生环带（r≈450~550m）放缓起伏：出生点不被坡脊卡视线/姿态
  f *= 0.5 + 0.5 * sstep(Math.abs(d - 500), 60, 170);
  return h * f;
}

// ═══════════════════════ 土路网（3 条交叉土路） ═══
// roadDist 供 ribbon 摆放避障 / world.surfaceY 贴高 / world.isOnRoad 颠簸系数共用
const ROAD_HALF = 5;   // 土路半宽
const ROADS = [
  [[-1080, -380], [-560, -300], [-80, -120], [420, 60], [1080, 220]],     // 东西向主土路（微弯）
  [[-260, 1080], [-180, 520], [-40, 80], [120, -420], [300, -1080]],      // 南北向土路
  [[-1080, 700], [-420, 320], [200, -100], [820, -560]],                  // 斜向支线（与前两条交叉）
];
function makeRoadDist(roads) {
  return function (x, z) {
    let best = Infinity;
    for (const line of roads) {
      for (let i = 0; i < line.length - 1; i++) {
        const [x1, z1] = line[i], [x2, z2] = line[i + 1];
        const dx = x2 - x1, dz = z2 - z1;
        const t = clamp(((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz), 0, 1);
        const d = Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t));
        if (d < best) best = d;
      }
    }
    return best;
  };
}
const roadDist = makeRoadDist(ROADS);

// ═══════════════════════ 诺曼底地形高度场（bocage 浅丘农田，镇为附近高地） ═══
// 2000×2000 战场：低幅多层正弦缓丘 + 两处浅洼地；镇台地（顶平坡缓，附近最高）；出生环带放缓
function normandyHeight(x, z) {
  let h = 0;
  h += Math.sin(x * 0.009 + 0.6) * Math.cos(z * 0.011 + 2.3) * 3.2;
  h += Math.sin(x * 0.024 + 3.1) * Math.cos(z * 0.021 + 0.9) * 1.5;
  h += Math.sin(x * 0.067 + 1.2) * Math.cos(z * 0.059 + 4.4) * 0.5;
  const d = Math.hypot(x, z);
  let f = 0.4 + 0.6 * sstep(d, 40, 260);
  f *= 0.5 + 0.5 * sstep(Math.abs(d - 500), 60, 170);
  h *= f;
  // 浅洼地 ×2（低地排水草甸）
  h -= 2.6 * Math.exp(-((x + 620) * (x + 620) + (z - 520) * (z - 520)) / (2 * 260 * 260));
  h -= 2.2 * Math.exp(-((x - 560) * (x - 560) + (z + 560) * (z + 560)) / (2 * 300 * 300));
  // 镇台地：镇区为附近最高（顶平建房、坡缓行车），r100 内平、280m 渐归原地形
  const dt = Math.hypot(x - N2_TOWN.x, z - N2_TOWN.z);
  const plateau = 3.4;
  h = plateau + (h - plateau) * sstep(dt, 100, 280);
  return h;
}

// ═══════════════════════ 诺曼底路网与布局（v2：js/mapdata-normandy.js 同源） ═══
const nRoadDist = makeRoadDist(N2_ROADS);
const nLaneDist = makeRoadDist(N2_LANES);
// 广场内测（硬化地面；带 rot 旋转）
function inPlaza(x, z) {
  const c = Math.cos(N2_PLAZA.rot * Math.PI / 180), s = Math.sin(N2_PLAZA.rot * Math.PI / 180);
  const dx = x - N2_PLAZA.x, dz = z - N2_PLAZA.z;
  const lx = dx * c + dz * s, lz = -dx * s + dz * c;
  return Math.abs(lx) < N2_PLAZA.w / 2 && Math.abs(lz) < N2_PLAZA.d / 2;
}

// ═══════════════════════ 统一入口 ═══════════════════════
// ctx: { world, scene, quality, assets, ps, effects, audio }
//   world.root 已加入 scene 的 Group（本模块产物全部挂其下）
//   world.setGroundY(fn) / world.addObstacle(o) / world.removeObstacle(o) 由 main.js 提供
//   assets.town_kit / leaf_tree / pine_tree / rock / rock2 / wood_log = 各 glb 的 .scene
// 返回 Destructibles 实例（同时挂到 ctx.destructibles 与 world.destructibles）
export function buildMap(ctx) {
  const { world } = ctx;
  const isNorm = world.mapId === 'normandy';
  const isPk = world.mapId === 'prokhorovka';
  const isArd = world.mapId === 'ardennes';
  // 特效主题（effects/destructibles 共用此开关）：阿登=雪原白尘系；其余图默认土色系（切图复位）
  ctx.effects.theme = isArd ? 'snow' : 'default';
  world.snowWash = isArd;   // 坦克冬季白洗涂装（snowwash.js，tank.js 构造时注入）
  const baseHeight = isNorm ? normandyHeight : isPk ? prokhorovkaHeight : isArd ? ardennesHeight : kurskHeight;
  const rDist = isNorm ? nRoadDist : isPk ? pkMainDist : isArd ? arMainDist : roadDist;
  // Destructibles 的 groundY 用纯基础高度（不含废墟场，避免递归）；废墟坡度由 world.setGroundY 叠加
  const des = new Destructibles({
    root: world.root,
    ps: ctx.ps,
    effects: ctx.effects,
    audio: ctx.audio,
    groundY: baseHeight,
    addObstacle: o => world.addObstacle(o),
    removeObstacle: o => world.removeObstacle(o),
    sightAdd: s => world.addSightBlocker(s),
    sightRemove: s => world.removeSightBlocker(s),
  });
  ctx.destructibles = des;
  world.destructibles = des;
  if (isNorm) {
    // 路面抬高：主路 0.05 / 镇内小路 0.04 / 广场 0.04（履带贴上路面）
    world.surfaceY = (x, z) => {
      if (nRoadDist(x, z) < N2_ROAD_HALF) return 0.05;
      if (nLaneDist(x, z) < LANE_HALF) return 0.04;
      if (inPlaza(x, z)) return 0.04;
      return 0;
    };
    // 颠簸系数：土路 0.65 / 路肩 0.85 / 石板小路·广场 0.45（硬化平整）/ 野地 1
    world.isOnRoad = (x, z) => {
      const d = nRoadDist(x, z);
      if (d < N2_ROAD_HALF) return 0.65;
      if (d < N2_ROAD_HALF + 3) return 0.85;
      if (nLaneDist(x, z) < LANE_HALF + 1 || inPlaza(x, z)) return 0.45;
      return 1;
    };
  } else if (isPk) {
    // 普罗霍罗夫卡：土路 0.05（草原土路）
    world.surfaceY = (x, z) => (pkMainDist(x, z) < PK_ROAD_HALF ? 0.05 : 0);
    world.isOnRoad = (x, z) => (pkMainDist(x, z) < PK_ROAD_HALF ? 0.7 : 1);
  } else if (isArd) {
    // 阿登：压实雪路抬高；颠簸 主路 0.7 / 林道 0.8 / 雪野 1
    world.surfaceY = (x, z) => {
      if (arMainDist(x, z) < AR_ROAD_HALF) return 0.05;
      if (arLaneDist(x, z) < AR_LANE_HALF) return 0.04;
      return 0;
    };
    world.isOnRoad = (x, z) => {
      if (arMainDist(x, z) < AR_ROAD_HALF) return 0.7;
      if (arLaneDist(x, z) < AR_LANE_HALF) return 0.8;
      return 1;
    };
    // 压实雪路提速（tank.js roadSpeedAt 钩子）：主路 ×1.15 / 林道 ×1.10，出路面回软雪
    world.roadSpeedAt = (x, z) => {
      if (arMainDist(x, z) < AR_ROAD_HALF) return 1.15;
      if (arLaneDist(x, z) < AR_LANE_HALF) return 1.10;
      return null;
    };
  } else {
    // 土路路面渲染抬高（buildDirtRoad yOff 0.05）——坦克地面采样叠加，履带贴上土路面
    world.surfaceY = (x, z) => (rDist(x, z) < ROAD_HALF ? 0.05 : 0);
    // 路面颠簸系数（悬挂抖动强度）：土路 0.65（比铺装路颠）/ 路肩 0.85 / 野地 1
    world.isOnRoad = (x, z) => {
      const d = rDist(x, z);
      if (d < ROAD_HALF) return 0.65;
      if (d < ROAD_HALF + 3) return 0.85;
      return 1;
    };
  }
  if (isNorm) buildNormandy(ctx, des); else if (isPk) buildProkhorovka(ctx, des); else if (isArd) buildArdennes(ctx, des); else buildKursk(ctx, des);
  return des;
}

// ═══════════════════════ 程序化贴图（canvas 程序化生成例外允许 document） ═══════════════════════

// ── 巨石材质：地层色带 + 颗粒噪点 + 裂缝 + 地衣晒斑（草原转石风格） ──
function makeRockTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#6e685c'; g.fillRect(0, 0, s, s);   // 暗灰褐底（与平原旧岩石同色域，防强光过曝）
  for (let i = 0; i < 9; i++) {   // 地层色带
    g.fillStyle = `rgba(${72 + Math.random() * 34 | 0},${68 + Math.random() * 26 | 0},${56 + Math.random() * 22 | 0},${0.16 + Math.random() * 0.2})`;
    g.fillRect(0, Math.random() * s, s, 6 + Math.random() * 26);
  }
  for (let i = 0; i < 2600; i++) {   // 颗粒
    g.fillStyle = Math.random() < 0.6
      ? `rgba(38,34,28,${0.06 + Math.random() * 0.14})`
      : `rgba(150,142,122,${0.05 + Math.random() * 0.1})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.strokeStyle = 'rgba(40,36,30,0.5)';
  for (let i = 0; i < 10; i++) {   // 裂缝折线
    g.lineWidth = 0.6 + Math.random() * 1.2;
    let x = Math.random() * s, y = Math.random() * s;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += (Math.random() - 0.5) * 46; y += (Math.random() - 0.2) * 34; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 26; i++) {   // 地衣晒斑（压暗）
    g.fillStyle = `rgba(${88 + Math.random() * 36 | 0},${92 + Math.random() * 30 | 0},${56 + Math.random() * 22 | 0},${0.06 + Math.random() * 0.12})`;
    g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 4 + Math.random() * 16, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}


// 库尔斯克 7 月地面：绿意更重的草原（橄榄绿为主 + 金黄麦斑点缀）
function makeGroundTexture(rand) {
  const s = 512, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#7f7c48';   // 橄榄草底（降黄提绿）
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 110; i++) {
    const x = rand() * s, y = rand() * s, r = 20 + rand() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const cols = ['148,140,72', '122,128,62', '104,120,54', '138,132,72', '92,110,52', '164,148,84'];
    const col = cols[(rand() * cols.length) | 0];
    gr.addColorStop(0, `rgba(${col},0.55)`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }
  for (let i = 0; i < 9000; i++) {
    const v = rand();
    g.fillStyle = v < 0.5 ? 'rgba(56,58,30,0.10)' : 'rgba(214,206,140,0.08)';
    g.fillRect(rand() * s, rand() * s, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(90, 90);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ── 诺曼底 v2 地面（写实航拍风，拒绝卡通色块）：整图一张 2048 不平铺。
//    田块 = mapdata buildParcels 的真实多边形（含随形边），低饱和土系/草系色差（±8% 明度差），
//    田内作物行纹理 + 大块色斑；篱线只在有 3D 树篱处画柔和暗缝（无篱边界仅 0.16 淡痕） ──
function makeNormandyGroundTexture(rand, size, cells, hedgeSegs) {
  const s = 2048, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const m2px = s / size;
  const toPx = (x, z) => [(x + size / 2) * m2px, (z + size / 2) * m2px];
  // 底：深橄榄草绿（用户反馈去"虚浮感"：整体加深变暗）+ 大范围柔和明暗
  g.fillStyle = '#5d633c'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 70; i++) {
    const x = rand() * s, y = rand() * s, r = 120 + rand() * 380;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() < 0.55;
    gr.addColorStop(0, dark ? 'rgba(38,44,24,0.13)' : 'rgba(136,138,94,0.09)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }
  // 田块调色（用户定稿：不要泥土色、全绿有植被、加深变暗）
  const PAL = [
    [88, 98, 54],     // 牧草（深）
    [96, 106, 62],    // 草甸
    [104, 108, 60],   // 作物（绿燕麦，不带黄）
    [80, 92, 48],     // 深绿茂草
    [92, 100, 58],    // 浅草
  ];
  const WT = [0.30, 0.26, 0.18, 0.16, 0.10];
  const cellPath = (cell) => {
    g.beginPath();
    const pts = cell.edges.flat();
    pts.forEach(([x, z], i) => {
      const [px, pz] = toPx(x, z);
      if (i === 0) g.moveTo(px, pz); else g.lineTo(px, pz);
    });
    g.closePath();
  };
  cells.forEach((cell, ci) => {
    let r = rand(), k = 0;
    for (; k < WT.length - 1; k++) { if (r < WT[k]) break; r -= WT[k]; }
    const [pr, pg, pb] = PAL[k];
    const vjit = 0.94 + rand() * 0.12;   // 明度抖动 ±6%
    g.save();
    cellPath(cell);
    g.clip();
    g.fillStyle = `rgb(${pr * vjit | 0},${pg * vjit | 0},${pb * vjit | 0})`;
    g.fillRect(0, 0, s, s);
    // 田内大块色斑（长势/干湿，绿色系为主）
    const pts = cell.edges.flat();
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), bz0 = Math.min(...zs), bz1 = Math.max(...zs);
    for (let b = 0; b < 6; b++) {
      const cx = (bx0 + rand() * (bx1 - bx0) + size / 2) * m2px, cz = (bz0 + rand() * (bz1 - bz0) + size / 2) * m2px;
      const br = (12 + rand() * 26) * m2px;
      const gr = g.createRadialGradient(cx, cz, 0, cx, cz, br);
      const shade = rand() < 0.6 ? '30,38,18' : '120,126,80';
      gr.addColorStop(0, `rgba(${shade},${0.08 + rand() * 0.10})`);
      gr.addColorStop(1, `rgba(${shade},0)`);
      g.fillStyle = gr;
      g.fillRect(cx - br, cz - br, br * 2, br * 2);
    }
    // 植被行纹理（除最浅草田外均有：细行距条纹——航拍作物行感）
    if (k !== 4) {
      const ang = rand() * Math.PI;
      const ux = Math.cos(ang), uz = Math.sin(ang);
      g.strokeStyle = 'rgba(34,44,20,0.10)';
      g.lineWidth = Math.max(1, 0.9 * m2px);
      const cx0 = ((bx0 + bx1) / 2 + size / 2) * m2px, cz0 = ((bz0 + bz1) / 2 + size / 2) * m2px;
      const span = Math.max(bx1 - bx0, bz1 - bz0) * m2px;
      for (let off = -span; off < span; off += 3.2 * m2px) {
        g.beginPath();
        g.moveTo(cx0 + uz * off - ux * span, cz0 - ux * off - uz * span);
        g.lineTo(cx0 + uz * off + ux * span, cz0 - ux * off + uz * span);
        g.stroke();
      }
    }
    // 田内杂色斑点（用户要求加杂色点：草簇/小石/野花感，压掉"动画感"）
    const nDot = Math.round((bx1 - bx0) * (bz1 - bz0) / 900);
    for (let d2 = 0; d2 < nDot; d2++) {
      const dx = (bx0 + rand() * (bx1 - bx0) + size / 2) * m2px, dz = (bz0 + rand() * (bz1 - bz0) + size / 2) * m2px;
      const v = rand();
      g.fillStyle = v < 0.55 ? `rgba(30,40,18,${0.10 + rand() * 0.10})`
        : v < 0.85 ? `rgba(108,116,66,${0.09 + rand() * 0.08})`
        : `rgba(64,72,40,${0.12 + rand() * 0.08})`;
      g.fillRect(dx, dz, 1 + rand() * 2.2, 1 + rand() * 2.2);
    }
    g.restore();
    // 无篱边界淡痕（田界可辨但不抢眼）
    g.strokeStyle = 'rgba(44,50,30,0.22)';
    g.lineWidth = 1.2;
    cellPath(cell);
    g.stroke();
    void ci;
  });
  // 篱线（只在有 3D 树篱处：柔暗缝 + 微高光侧——写实篱墙投影）
  for (const [x1, z1, x2, z2] of hedgeSegs) {
    const [ax, az] = toPx(x1, z1), [bx, bz] = toPx(x2, z2);
    g.strokeStyle = 'rgba(34,44,24,0.48)';
    g.lineWidth = 4.5 * m2px;
    g.beginPath(); g.moveTo(ax, az); g.lineTo(bx, bz); g.stroke();
    g.strokeStyle = 'rgba(24,34,16,0.62)';
    g.lineWidth = 2.2 * m2px;
    g.beginPath(); g.moveTo(ax, az); g.lineTo(bx, bz); g.stroke();
  }
  // 细颗粒（近看质感，加密加对比压"虚浮"）
  for (let i = 0; i < 46000; i++) {
    const v = rand();
    g.fillStyle = v < 0.55 ? 'rgba(28,34,16,0.09)' : 'rgba(150,152,102,0.07)';
    g.fillRect(rand() * s, rand() * s, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ── 石板/硬化路面贴图（镇内小路 + 广场）：灰石底 + 不规则板缝 + 磨损斑 ──
function makeCobbleTexture(rand) {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#8a8578'; g.fillRect(0, 0, s, s);
  // 石板错缝网格
  for (let row = 0; row < 8; row++) {
    const off = (row % 2) * 16;
    for (let col = -1; col < 8; col++) {
      const x = col * 32 + off + (rand() - 0.5) * 4, y = row * 32 + (rand() - 0.5) * 3;
      const v = 0.9 + rand() * 0.2;
      g.fillStyle = `rgb(${0x86 * v | 0},${0x81 * v | 0},${0x74 * v | 0})`;
      g.fillRect(x + 1.5, y + 1.5, 29, 29);
    }
  }
  for (let i = 0; i < 1600; i++) {   // 磨损颗粒
    const v = rand();
    g.fillStyle = v < 0.5 ? 'rgba(60,56,48,0.12)' : 'rgba(190,186,172,0.10)';
    g.fillRect(rand() * s, rand() * s, 1 + rand() * 2, 1 + rand() * 2);
  }
  for (let i = 0; i < 14; i++) {   // 污渍
    g.fillStyle = `rgba(70,64,52,${0.05 + rand() * 0.07})`;
    g.beginPath(); g.arc(rand() * s, rand() * s, 8 + rand() * 22, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 土路贴图：土黄底 + 颗粒 + 草丛碎屑 + 双车辙暗带（u 向横跨路面，车辙在 u≈0.3 / 0.7）
function makeDirtRoadTexture(rand) {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#7a6a48';
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2400; i++) {
    const v = rand();
    g.fillStyle = v < 0.45 ? 'rgba(52,44,30,0.20)' : v < 0.8 ? 'rgba(150,132,96,0.18)' : 'rgba(96,84,58,0.20)';
    g.fillRect(rand() * s, rand() * s, 1 + rand() * 2, 1 + rand() * 2);
  }
  for (let i = 0; i < 30; i++) {   // 风吹来的草屑
    g.fillStyle = `rgba(${120 + rand() * 40 | 0},${110 + rand() * 30 | 0},${60 + rand() * 20 | 0},${0.10 + rand() * 0.12})`;
    g.fillRect(rand() * s, rand() * s, 2 + rand() * 6, 1 + rand() * 2);
  }
  for (const u of [0.30, 0.70]) {   // 车辙暗带（沿 v 向连续）
    const x = u * s;
    const gr = g.createLinearGradient(x - 10, 0, x + 10, 0);
    gr.addColorStop(0, 'rgba(60,50,34,0)');
    gr.addColorStop(0.5, 'rgba(60,50,34,0.42)');
    gr.addColorStop(1, 'rgba(60,50,34,0)');
    g.fillStyle = gr;
    g.fillRect(x - 10, 0, 20, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ── 土路/硬化路铺设（库尔斯克/诺曼底共用）：带状网格沿折线、贴地形起伏，yOff 规避 Z-fighting ──
function buildDirtRoads(root, roads, groundY, rand, half = ROAD_HALF, tex = null, yOff = 0.05) {
  const dirtTex = tex || makeDirtRoadTexture(rand);
  const mat = new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 0.97, metalness: 0, side: THREE.DoubleSide });
  for (const line of roads) {
    const positions = [], uvs = [], indices = [];
    let vi = 0, vDist = 0, prevX = null, prevZ = null;
    for (let i = 0; i < line.length - 1; i++) {
      const [x1, z1] = line[i], [x2, z2] = line[i + 1];
      const segLen = Math.hypot(x2 - x1, z2 - z1);
      const px = -(z2 - z1) / segLen, pz = (x2 - x1) / segLen;   // 路宽方向（垂直于路段）
      const steps = Math.max(1, Math.round(segLen / 6));
      for (let s = (i === 0 ? 0 : 1); s <= steps; s++) {
        const t = s / steps;
        const cx = x1 + (x2 - x1) * t, cz = z1 + (z2 - z1) * t;
        if (prevX !== null) vDist += Math.hypot(cx - prevX, cz - prevZ);
        prevX = cx; prevZ = cz;
        const ax = cx + px * half, az = cz + pz * half;
        const bx = cx - px * half, bz = cz - pz * half;
        positions.push(ax, groundY(ax, az) + yOff, az, bx, groundY(bx, bz) + yOff, bz);
        uvs.push(0, vDist / 9, 1, vDist / 9);
        if (vi >= 2) indices.push(vi - 2, vi - 1, vi, vi - 1, vi + 1, vi);
        vi += 2;
      }
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    rgeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    rgeo.setIndex(indices);
    rgeo.computeVertexNormals();
    const mesh = new THREE.Mesh(rgeo, mat);
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

// 夏日东欧平原天空穹：蓝天白云（移植自前作《钢铁战线2》东欧小镇图 makeSkyDome，观感一致）
// 三层 fbm 云（地平线层云带 / 中空层积云 / 天顶 3D 噪声卷云——球面连续无接缝无极点拉伸）
// + 旋转矩阵打破网格对齐 + uTime 慢速漂移（main.js 主循环每帧累加）+ 穹底与雾色无缝融合
function makeSkyDome() {
  const sunDir = new THREE.Vector3(0.5, 0.85, 0.6).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3a6ab8) },    // 晴天深蓝
      midColor: { value: new THREE.Color(0x9cc4e4) },    // 过渡浅蓝
      botColor: { value: new THREE.Color(0xd8e6ee) },    // 地平线亮白蓝
      sunDir: { value: sunDir.clone() },
      sunDiscPow: { value: 260.0 },                      // 日轮锐度：越大视直径越小（260≈8°大日轮；清晨图另行收小）
      fogColor: { value: new THREE.Color(0xc8d8e4) },    // 与场景雾同色：地平线以下融合
      uTime: { value: 0 },                               // 秒；shader 内乘慢速漂移系数
    },
    vertexShader: `
      varying vec3 vDir;
      varying vec2 vUv;
      void main() {
        vDir = normalize(position);
        vUv = uv;                          // 球体自带 UV：经线接缝处由纹理环绕无缝处理
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor, midColor, botColor, sunDir, fogColor;
      uniform float uTime, sunDiscPow;
      varying vec3 vDir;
      // ── fbm 噪声云（技法移植自 darkWil environment.js 柏林关配置：三层云 + 天顶 3D 噪声） ──
      float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0; float a = 0.5;
        mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);  // 旋转 36.87°，打破网格对齐（去方格感）
        for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = rot * p * 2.0; a *= 0.5; }
        return v;
      }
      // 3D 噪声（天顶云：dir 单位向量球面连续，无方位角接缝、无极点汇聚拉抻）
      float hash13(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float vnoise3(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p);
        vec3 u = f * f * (3.0 - 2.0 * f);
        float n000 = hash13(i);
        float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
        return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
                   mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
      }
      float fbm3(vec3 p) {
        float v = 0.0; float a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * vnoise3(p); p *= 2.02; a *= 0.5; }
        return v;
      }
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 dir = normalize(vDir);
        vec3 col = mix(botColor, midColor, smoothstep(0.0, 0.22, h));
        col = mix(col, topColor, smoothstep(0.15, 0.7, h));
        float sd = max(dot(dir, normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.96, 0.86) * pow(sd, sunDiscPow) * 2.6;   // 日轮（视直径由 sunDiscPow 控制）
        col += vec3(1.0, 0.85, 0.55) * pow(sd, 8.0) * 0.16;    // 薄雾光晕

        // ── 三层 fbm 云（柏林关参数：coverage 0.55 / farDarken 1.0 / zenithBoost 0.5） ──
        float lit = smoothstep(0.10, 0.80, sd);
        vec3 cloudCol = vec3(0.957, 0.965, 0.973);     // 柏林关 0xf4f6f8 亮白
        vec3 cloudHi  = vec3(0.973, 0.957, 0.910);     // 柏林关 0xf8f4e8 暖白高光
        vec3 cloudShade = cloudCol * 0.88;             // 云底微灰（受光混色用）

        // 1. 远景层云带（地平线附近，水平拉伸；farDarken=1.0 不暗化）
        if (dir.y < 0.35) {
          float stretch = mix(3.5, 1.0, smoothstep(0.0, 0.25, dir.y));
          vec2 cuv = dir.xz * stretch * 0.8;
          cuv += vec2(uTime * 0.005, uTime * 0.0015);   // 柏林关 drift 0.005
          float n = fbm(cuv);
          float cloud = smoothstep(1.0 - 0.55 * 1.15, 1.0 - 0.55 * 0.25, n);  // coverage 0.55
          float band = smoothstep(0.32, 0.08, dir.y) * smoothstep(-0.08, 0.04, dir.y);
          cloud *= band;
          vec3 farCol = mix(cloudCol, cloudHi * 0.85, lit);
          col = mix(col, farCol, cloud * 0.85);
        }
        // 2. 中空层积云（主要云层，中等密度）
        if (dir.y > 0.06 && dir.y < 0.75) {
          vec2 cuv2 = dir.xz * 1.0 + vec2(uTime * 0.0035, uTime * 0.0010);
          float n2 = fbm(cuv2 + vec2(7.3, 2.1));       // 偏移避免与层云重复
          float cloud2 = smoothstep(1.0 - 0.55 * 0.9, 1.0 - 0.55 * 0.3, n2);
          float band2 = smoothstep(0.06, 0.25, dir.y) * smoothstep(0.75, 0.40, dir.y);
          cloud2 *= band2 * 0.80;
          vec3 midCol = mix(cloudShade, cloudHi, lit);
          col = mix(col, midCol, cloud2);
        }
        // 3. 高空天顶卷云（zenithBoost 0.5：加密 + band 上界推高 + 3D 噪声采样——天顶无拉抻无接缝）
        if (dir.y > 0.25) {
          vec3 c3 = dir * 3.0 + vec3(uTime * 0.002, 0.0, 0.0) + vec3(15.7, 8.2, 3.1);
          float n3 = fbm3(c3);
          float thrLow = mix(0.45, 0.28, 0.5);          // zenithBoost=0.5 → 阈值 0.365
          float cloud3 = smoothstep(thrLow, thrLow + 0.20, n3);
          float band3 = smoothstep(0.25, 0.45, dir.y) * smoothstep(1.50, 0.60, dir.y);  // 上界 1.50：天顶不衰减
          cloud3 *= band3 * mix(0.50, 0.85, 0.5);       // 密度 0.675
          vec3 highCol = mix(cloudCol * 1.15, cloudHi * 1.08, lit);
          col = mix(col, highCol, cloud3);
        }

        col = mix(col, vec3(0.82, 0.87, 0.9), (1.0 - smoothstep(0.0, 0.14, h)) * 0.35);
        // 地平线以下 → 雾色：地图边缘外的穹底与远处雾化地面无缝融合
        col = mix(fogColor, col, smoothstep(-0.09, 0.015, vDir.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(3800, 32, 16), mat);
}

// ═══════════════════════ 布景模板工具 ═══════════════════════
// 植被/柴堆模板烘焙：双面 + alphaTest 裁切 + 带贴图的深度材质（阴影不出黑边）
function prepFlora(scene) {
  scene.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m.side = THREE.DoubleSide;
        if (m.map) {
          m.alphaTest = 0.45;
          if (!o.customDepthMaterial) {
            o.customDepthMaterial = new THREE.MeshDepthMaterial({
              depthPacking: THREE.RGBADepthPacking, map: m.map, alphaTest: 0.45,
            });
          }
        }
      }
    }
  });
  return scene;
}

// 建筑套件拆分（map-test 同款）：找 RootNode → 克隆子件并烘焙世界变换 → 按 glb 节点名入表
function splitTownKit(kitScene, templates) {
  const rootScene = new THREE.Group();
  rootScene.add(kitScene);
  rootScene.updateMatrixWorld(true);
  let rootNode = null;
  kitScene.traverse(o => { if (!rootNode && o.name === 'RootNode') rootNode = o; });
  if (!rootNode) {
    kitScene.traverse(o => { if (!rootNode || o.children.length > rootNode.children.length) rootNode = o; });
  }
  for (const child of [...rootNode.children]) {
    const t = child.clone(true);
    child.matrixWorld.decompose(t.position, t.quaternion, t.scale);
    t.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    templates.set(child.name, t);
  }
}

// ── inst 物件收集器：布局阶段记录摆放数据（含岩石 yOff / 灌木露出高度 h），buildInstancedProps 统一构建 + 注册 ──
function makeInstCollector(groundY) {
  const instData = {};
  for (const k of Object.keys(INST_PROPS)) instData[k] = [];
  const collectInst = (type, x, z, rotDeg, scale, yOff = 0, hOverride = 0) => {
    const rec = {
      type, x, z,
      y: groundY(x, z) + yOff,
      rot: rotDeg * Math.PI / 180, s: scale || 1,
      h: hOverride || 0,          // 灌木：地面以上露出高度（其余类型 0）
      obstacle: null,
    };
    instData[type].push(rec);
    return rec;
  };
  return { instData, collectInst };
}

// ── Instanced 物件构建：每类一个 InstancedMesh（draw call 极低）；逐实例 registerInst 注册可破坏 ──
// 求交数据齐全：旋转包围盒 minx..maxz / miny..maxy、树干圆柱 cyl+cr、岩石 yOff 已在收集时写入 y
function buildInstancedProps(des, instData, templates, flora, root) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  for (const type of Object.keys(instData)) {
    const list = instData[type];
    if (!list.length) continue;
    const src = flora[type] || templates.get(type);
    if (!src) continue;
    // 克隆模板并归零根坐标，烘焙 mesh 世界变换进几何体（与 placeKit 摆放一致）
    const tmp = src.clone(true);
    tmp.position.set(0, 0, 0);
    tmp.updateMatrixWorld(true);
    let geo = null, mat = null, depth = null;
    tmp.traverse(o => {
      if (!geo && o.isMesh) {
        geo = o.geometry.clone();
        geo.applyMatrix4(o.matrixWorld);
        mat = Array.isArray(o.material) ? o.material[0] : o.material;
        if (o.customDepthMaterial) depth = o.customDepthMaterial;
      }
    });
    if (!geo) continue;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const gw = bb.max.x - bb.min.x, gh = bb.max.y - bb.min.y, gd = bb.max.z - bb.min.z;
    // 树木注入风摆（高度权重：树干定、树冠摆；与灌木共享阵风 uniforms）
    if (isTreeType(type)) injectTreeWind(mat, gh);

    const im = new THREE.InstancedMesh(geo, mat, list.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = im.receiveShadow = true;
    im.raycast = () => {};   // 不参与测距射线
    if (depth) im.customDepthMaterial = depth;
    list.forEach((p, i) => {
      q.setFromAxisAngle(UP, p.rot);
      pos.set(p.x, p.y, p.z);
      scl.setScalar(p.s);
      m4.compose(pos, q, scl);
      im.setMatrixAt(i, m4);
      // 实例求交数据：旋转包围盒（AABB 近似，围栏/横条类判定稍宽松可接受）
      const w = gw * p.s, h = gh * p.s, d = gd * p.s;
      const c = Math.abs(Math.cos(p.rot)), sn = Math.abs(Math.sin(p.rot));
      const ex = (w * c + d * sn) / 2, ez = (w * sn + d * c) / 2;
      const isTree = isTreeType(type);
      des.registerInst({
        type, mesh: im, index: i,
        x: p.x, z: p.z, y: p.y, rot: p.rot, s: p.s,
        r: Math.max(ex, ez), height: h,
        minx: p.x - ex, maxx: p.x + ex,
        minz: p.z - ez, maxz: p.z + ez,
        miny: p.y, maxy: p.y + h,
        obstacle: p.obstacle,
        cyl: isTree, cr: isTree ? 0.55 * p.s : 0,   // 树：求交用树干圆柱（枝叶可穿；贴真实树干，勿给空气墙）
      });
    });
    root.add(im);
  }
}

// ═══════════════════════ 建筑套件摆放引擎（东欧小镇 / 平原村落共用） ═══════════════════════
// opts: { groundY: 高度函数, rand: 随机源 }；返回 { templates, flora, instData, collectInst,
//        placeKit, finalizeBatch, placeTree, fenceRun, household, greenGap, SIDES }
function createKitPlacer(ctx, des, opts) {
  const { world, assets } = ctx;
  const root = world.root;
  const groundY = opts.groundY;
  const rand = opts.rand;

  // ── 布景模板（建筑套件拆分 + 植被烘焙） ──
  const templates = new Map();
  const flora = {};
  splitTownKit(assets.town_kit, templates);
  // 欧洲小镇组（eu_ 前缀，单件 GLB；诺曼底 v2 镇区）
  for (const key of Object.keys(assets)) {
    if (!key.startsWith('eu_')) continue;
    const tmp = new Map();
    splitTownKit(assets[key].scene || assets[key], tmp);
    const first = tmp.values().next().value;
    if (first) templates.set(key, first);
  }
  flora.leaf = prepFlora(assets.leaf_tree);
  flora.pine = prepFlora(assets.pine_tree);
  flora.rock = prepFlora(assets.rock);
  flora.rock2 = prepFlora(assets.rock2);
  prepFlora(assets.wood_log);                 // 柴堆模板（alpha 贴图 + 深度材质）
  templates.set('wood_log', assets.wood_log);

  const { instData, collectInst } = makeInstCollector(groundY);

  // ═══ 布景摆放（map-test 移植；注册可破坏/碰撞改走 destructibles API） ═══
  const KITS = {
    house01: ['house01', 'house01_roof', 'house01_add'],
    house03: ['house03', 'house03_add', 'house03_roof'],
    barn01: ['barn01', 'barn01_add'],
  };

  // 院落式小镇布局：建筑整体校准比例（对比坦克高 2.2-3.3m）
  const KIT_SCALE = { house01: 1.2, house02: 1.05, house03: 1.3, barn01: 1.15, barn03: 1.15 };

  // 院落朝向：u = 沿街方向，v = 背路方向；rot = 主屋长轴沿街的摆放角
  const SIDES = {
    N: { ux: 1, uz: 0, vx: 0, vz: 1, rot: 90 },   // X 公路北侧，院落向 +z 展开
    S: { ux: 1, uz: 0, vx: 0, vz: -1, rot: 90 },  // X 公路南侧
    E: { ux: 0, uz: 1, vx: 1, vz: 0, rot: 0 },    // Z 公路东侧
    W: { ux: 0, uz: 1, vx: -1, vz: 0, rot: 0 },   // Z 公路西侧
  };

  // ── B1 建筑合批：group 物件不再逐栋挂场景，克隆仅作数据源（求 box/注册/受损抽出用），
  //    网格按（几何体×材质）收集进流；布局结束后 finalizeBatch 落地为少量 InstancedMesh。
  //    首次受损时 destructibles._ensureGroup 把该栋实例矩阵置零并挂回独立克隆 → 走原灰化/倒塌管线 ──
  const batchStreams = new Map();   // key(geoUuid|matUuids) → { geometry, material, castShadow, receiveShadow, items:[{matrix, rec}] }

  // 摆放一套件/单件：KIT 多件按相对偏移组合；inst 物件（围栏/柴堆/树）走收集器
  // 注册可破坏物件 + 碰撞体（obstacle kind 'building'，r×0.82，solid 规则由 registerGroup 判定）
  function placeKit(nameOrKit, x, z, rotDeg, opts = {}) {
    const names = KITS[nameOrKit] || [nameOrKit];
    // inst 物件（围栏/柴堆）走收集器
    if (!KITS[nameOrKit] && INST_PROPS[names[0]]) {
      collectInst(names[0], x, z, rotDeg, opts.scale || 1);
      return null;
    }
    if (!templates.has(names[0])) { console.warn('缺少模板', names[0]); return null; }
    const rot = rotDeg * Math.PI / 180;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, rot);
    const g = new THREE.Group();
    const y = opts.y !== undefined ? opts.y : groundY(x, z);
    g.position.set(x, y, z);
    if (opts.scale) g.scale.setScalar(opts.scale);   // 整套件（含子件偏移）统一缩放
    const base = templates.get(names[0]);
    for (const n of names) {
      const t = templates.get(n);
      if (!t) continue;
      const c = t.clone(true);
      if (n === names[0]) {
        c.position.set(0, 0, 0);
        c.quaternion.premultiply(q);
      } else {
        c.position.sub(base.position).applyQuaternion(q);
        c.quaternion.premultiply(q);
      }
      g.add(c);
    }
    // ── 注册可破坏物件 + 碰撞体（destructibles API：box/半径/碰撞判定与原逻辑一致） ──
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const w = box.max.x - box.min.x, d = box.max.z - box.min.z;
    const rule = PROP_RULES[names[0]] || (names[0].startsWith('eu_') ? EU_PROP_RULE : undefined);
    if (rule) {
      // B1：g 不挂 root（布局后由 InstancedMesh 渲染）；受损时 _ensureGroup 挂回
      const rec = des.registerGroup({
        type: names[0], group: g,
        cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2,
        r: Math.max(w, d) / 2, height: box.max.y - box.min.y,
        w, dp: d, y0: box.min.y,
        rule, collide: opts.collide,
        inst: { refs: [] },
      });
      // 网格收进合批流（同几何体+同材质 → 同一 InstancedMesh；材质数组按序拼接 key）
      g.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const key = o.geometry.uuid + '|' + mats.map(m => m.uuid).join(',');
        let st = batchStreams.get(key);
        if (!st) {
          st = { geometry: o.geometry, material: o.material, castShadow: o.castShadow, receiveShadow: o.receiveShadow, items: [] };
          batchStreams.set(key, st);
        }
        st.items.push({ matrix: o.matrixWorld.clone(), rec });
      });
    } else {
      root.add(g);
      if (opts.collide !== false) {
        // 无规则物件兜底：仍保留碰撞体
        world.addObstacle({
          x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2,
          r: Math.max(w, d) / 2 * 0.82, kind: 'building', topY: box.max.y,
        });
      }
    }
    return g;
  }

  // ── B1 合批落地：每（几何体×材质）流一个 InstancedMesh；实例 ≥12 时按象限切分
  //    保留视锥剔除收益（背后象限整块不画）。抽出机制见 destructibles._ensureGroup ──
  function finalizeBatch() {
    for (const st of batchStreams.values()) {
      let groups = [st.items];
      if (st.items.length >= 12) {
        const quads = [[], [], [], []];
        for (const it of st.items) {
          const e = it.matrix.elements;
          quads[(e[12] >= 0 ? 1 : 0) + (e[14] >= 0 ? 2 : 0)].push(it);
        }
        groups = quads;
      }
      for (const items of groups) {
        if (!items.length) continue;
        const im = new THREE.InstancedMesh(st.geometry, st.material, items.length);
        im.castShadow = !!st.castShadow;
        im.receiveShadow = !!st.receiveShadow;
        items.forEach((it, i) => {
          im.setMatrixAt(i, it.matrix);
          it.rec.inst.refs.push({ mesh: im, index: i });
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.computeBoundingSphere) im.computeBoundingSphere();   // 实例感知包围球（视锥剔除用）
        root.add(im);
      }
    }
    batchStreams.clear();
  }

  function placeTree(type, x, z, scale, collide = true) {
    // 树无坦克碰撞（可碾过压毁）；×0.8 整体缩小与坦克比例协调（leaf 冠幅 5-13m / pine 4-7m）
    const s = clamp((scale || 1) * (0.85 + rand() * 0.3) * 0.8, type === 'pine' ? 0.45 : 0.32, 0.8);
    collectInst(type, x, z, rand() * 360, s);
  }

  // 一户人家：临街主屋（门朝公路）+ 围栏院落（前栏留大门）+ 棚屋/柴堆/配电箱 + 院内树 + 临街行道树
  function household(cx, cz, side, opt = {}) {
    const s = SIDES[side];
    const halfW = opt.halfW ?? 15, depth = opt.depth ?? 38;
    const pw = (a, b) => [cx + a * s.ux + b * s.vx, cz + a * s.uz + b * s.vz];

    // —— 主屋 ——
    const r = rand();
    const house = opt.house || (r < 0.4 ? 'house01' : r < 0.68 ? 'house03' : r < 0.86 ? 'house02' : 'barn01');
    const hb = house === 'barn01' ? 16 : 13;   // 谷仓进深大，更靠后
    const [hx, hz] = pw(-3, hb);
    placeKit(house, hx, hz, s.rot + (rand() < 0.5 ? 0 : 180), { scale: KIT_SCALE[house] || 1 });

    // —— 围栏（前栏留 10m 门洞，正对主屋门） ——
    const edges = [
      [-halfW, 0, -5, 0], [5, 0, halfW, 0],    // 前栏两段（门洞 a∈[-5,5]）
      [halfW, 0, halfW, depth],                // 右侧栏
      [halfW, depth, -halfW, depth],           // 后栏
      [-halfW, depth, -halfW, 0],              // 左侧栏
    ];
    for (const [a1, b1, a2, b2] of edges) {
      const [x1, z1] = pw(a1, b1), [x2, z2] = pw(a2, b2);
      fenceRun(x1, z1, x2, z2);
    }

    // —— 院内设施（一家一况，确定性变化） ——
    if (opt.barn || rand() < 0.38) {
      const sh = opt.barn || (rand() < 0.5 ? 'barrack01' : 'barrack03');
      const [px, pz] = pw(halfW - 5.5, depth - 7);
      placeKit(sh, px, pz, s.rot + 90, { scale: 1.1 });
    }
    if (rand() < 0.6) {
      const [px, pz] = pw(-halfW + 4.5, depth - 4);
      placeKit('wood_log', px, pz, rand() * 360, { collide: false, merge: true });
    }
    if (rand() < 0.7) {
      const box = ['utilitybox01', 'utilitybox02', 'utilitybox03'][Math.floor(rand() * 3)];
      const [px, pz] = pw(-halfW + 3, 11);
      placeKit(box, px, pz, s.rot, { collide: false });
    }
    if (rand() < 0.22) {
      const [px, pz] = pw(8, 4.5);
      placeKit('bench01', px, pz, s.rot + 90, { collide: false });
    }
    if (rand() < 0.12) {
      const [px, pz] = pw(-halfW + 7, depth - 11);
      placeKit(rand() < 0.5 ? 'trailer01' : 'trailer02', px, pz, s.rot, { scale: 1.0 });
    }

    // —— 绿化：院内点缀 1 棵（40%）+ 临街行道树（镇内少而精） ——
    const t1 = pw(-halfW + 3, depth - 3);
    if (rand() < 0.4) placeTree(rand() < 0.7 ? 'leaf' : 'pine', t1[0], t1[1], 0.55 + rand() * 0.15);
    if (rand() < 0.3) {
      const t2 = pw(halfW - 3.5, 24);
      placeTree('leaf', t2[0], t2[1], 0.55 + rand() * 0.15);
    }
    const t3 = pw(halfW + 6, 3);
    placeTree(rand() < 0.65 ? 'leaf' : 'pine', t3[0], t3[1], 0.6 + rand() * 0.2);
  }

  // 临街绿地（不盖房，留出呼吸空间）：2 棵点缀
  function greenGap(cx, cz, side) {
    const s = SIDES[side];
    const pw = (a, b) => [cx + a * s.ux + b * s.vx, cz + a * s.uz + b * s.vz];
    let p = pw(-7, 16); placeTree('leaf', p[0], p[1], 0.8 + rand() * 0.15);
    p = pw(6, 27); placeTree(rand() < 0.5 ? 'pine' : 'leaf', p[0], p[1], 0.7 + rand() * 0.2);
    if (rand() < 0.6) { p = pw(-2, 7); placeKit('bench01', p[0], p[1], s.rot + 90, { collide: false }); }
  }


  // 围栏沿两点连线分段铺设（交替 fence01/02 + 末端立柱）
  function fenceRun(x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.round(len / 4.3));
    const rot = Math.atan2(-dz, dx) * 180 / Math.PI;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      collectInst(i % 2 === 0 ? 'fence01' : 'fence02', x1 + dx * t, z1 + dz * t, rot, 1);
    }
    collectInst('fence_pole01', x2, z2, rot, 1);
  }


  return { templates, flora, instData, collectInst, placeKit, finalizeBatch, placeTree, fenceRun, household, greenGap, SIDES };
}


// ═══════════════════════ 库尔斯克 · 1943（东欧平原：金色麦田 / 交叉土路 / 村落 / 巨石掩体） ═══════════════════════
function buildKursk(ctx, des) {
  const { world, scene, quality } = ctx;
  const root = world.root;
  const size = MAPS.kursk.size;
  const rand = mulberry32(19430705);   // 确定性布局（1943 年 7 月，库尔斯克）

  // 出生环带避障：1v1 对峙 1300m / 1vN 1500m → 出生半径 650/750 ±60m（含敌群扇形横展），
  // 带区 [590,810] ±130m 内不放村落/巨石/树木（灌木为软遮挡，不受限）
  const onSpawnRing = (x, z, margin) => {
    const d = Math.hypot(x, z);
    return d > 590 - margin && d < 810 + margin;
  };

  // ── 光照：7 月正午偏后的中性日光（蓝天环境下白光，暖度收敛） ──
  const sunDir = new THREE.Vector3(0.5, 0.85, 0.6).normalize();
  root.add(new THREE.HemisphereLight(0xbdd0e4, 0x9ba06c, 1.55));   // 天空冷蓝散射 / 草地橄榄反弹
  root.add(new THREE.AmbientLight(0xaab2b8, 0.45));
  const sun = new THREE.DirectionalLight(0xfff0d5, 3.9);
  sun.position.copy(sunDir).multiplyScalar(600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  const sc = 90;
  sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
  sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0006;
  root.add(sun);
  root.add(sun.target);
  world.sun = sun;
  world.sunDir = sunDir;

  // ── 天空 + 雾（移植前作东欧小镇蓝天白云；雾色与 shader fogColor 同源，穹底无缝融合；
  //    密度 0.0015 保 ~1100m 近全雾，与距离剔除阈值衔接） ──
  world.sky = makeSkyDome();
  world.sky.material.uniforms.sunDir.value.copy(sunDir);
  world.skyMat = world.sky.material;   // 主循环每帧累加 uTime（云层缓慢漂移）
  root.add(world.sky);
  scene.fog = new THREE.FogExp2(0xc8d8e4, 0.0015);

  // ── 地面（2200×2200，200 分段；金色麦田贴图） ──
  const seg = 200;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const posA = geo.attributes.position;
  for (let i = 0; i < posA.count; i++) posA.setY(i, kurskHeight(posA.getX(i), posA.getZ(i)));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: makeGroundTexture(rand), roughness: 0.96, metalness: 0.0, color: 0xb9bf98,
  }));
  ground.receiveShadow = true;
  root.add(ground);

  // ── 土路（3 条交叉；共用铺设函数 buildDirtRoads） ──
  buildDirtRoads(root, ROADS, kurskHeight, rand);

  // ── 巨石掩体 ×16：位移几何 + 程序化岩石贴图（可炮毁、阻挡坦克与视线；避开中央 190m / 出生环带 ±130m / 土路） ──
  const bigRockTex = makeRockTexture();
  const bigRockMat = new THREE.MeshStandardMaterial({
    map: bigRockTex, color: 0x968f80, roughness: 0.95, flatShading: true,
  });
  const bigRockGeos = [];
  for (let v = 0; v < 3; v++) {
    const bgeo = new THREE.IcosahedronGeometry(1, 2);
    const bpA = bgeo.attributes.position;
    const seen = new Map();
    for (let i = 0; i < bpA.count; i++) {   // 同位顶点焊接后统一径向位移（面不撕裂）
      const key = bpA.getX(i).toFixed(3) + ',' + bpA.getY(i).toFixed(3) + ',' + bpA.getZ(i).toFixed(3);
      if (!seen.has(key)) seen.set(key, 0.78 + rand() * 0.5);
      const k = seen.get(key);
      bpA.setXYZ(i, bpA.getX(i) * k, bpA.getY(i) * k, bpA.getZ(i) * k);
    }
    bgeo.computeVertexNormals();
    bigRockGeos.push(bgeo);
  }
  let boulders = 0, bTries = 0;
  while (boulders < 16 && bTries < 300) {
    bTries++;
    const x = (rand() - 0.5) * 1750, z = (rand() - 0.5) * 1750;
    if (Math.hypot(x, z) < 190 || onSpawnRing(x, z, 130) || roadDist(x, z) < 22) continue;
    const s2 = 3.5 + rand() * 3.5;
    const m = new THREE.Mesh(bigRockGeos[boulders % 3], bigRockMat);
    m.position.set(x, kurskHeight(x, z) + s2 * 0.16, z);
    m.scale.set(s2, s2 * (0.7 + rand() * 0.5), s2 * (0.75 + rand() * 0.5));
    m.rotation.set(rand() * 0.6 - 0.3, rand() * 6, rand() * 0.6 - 0.3);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    des.registerGroup({
      type: 'boulder', group: m, cx: x, cz: z, r: s2,
      w: bb.max.x - bb.min.x, dp: bb.max.z - bb.min.z,
      height: bb.max.y - bb.min.y, y0: bb.min.y,
      rule: { hp: 5, rubbleH: 0.6 },   // 巨石：5 发炮毁，掩体价值高
      // 碰撞体唯一来源（勿再手动 addObstacle，否则双重判定且摧毁后残留空气墙）；
      // 0.78 收紧到地面截面内（可以小不能大）；炮弹走内切椭球判定
      obstacleKind: 'rock', obstacleK: 0.78, ellipsoid: true,
    });
    boulders++;
  }

  // ── 布景模板 + 摆放引擎（村落户院 = 主屋/谷仓 + 围栏院落 + 棚屋柴堆；树也走同一收集器统一合批） ──
  const tb = createKitPlacer(ctx, des, { groundY: kurskHeight, rand });

  // ── 零散村落 ×5（每村 2~3 户；避开中央 190m / 出生环带 ±130m / 土路 60m，村间距 ≥330m） ──
  const villageSides = ['N', 'S', 'E', 'W'];
  const villageCs = [];
  for (let tries = 0; tries < 120 && villageCs.length < 5; tries++) {
    const x = (rand() - 0.5) * 1750, z = (rand() - 0.5) * 1750;
    if (Math.hypot(x, z) < 190 || onSpawnRing(x, z, 130) || roadDist(x, z) < 60) continue;
    if (villageCs.some(c => Math.hypot(c.x - x, c.z - z) < 330)) continue;
    villageCs.push({ x, z });
  }
  for (const c of villageCs) {
    const n = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const ox = (i - (n - 1) / 2) * 58 + (rand() - 0.5) * 16;
      const oz = (rand() - 0.5) * 44;
      tb.household(c.x + ox, c.z + oz, villageSides[Math.floor(rand() * 4)],
        { halfW: 12, depth: 30, house: rand() < 0.5 ? 'house01' : 'house03' });
    }
  }

  // ── 植被：白桦/阔叶树（leaf）70 棵为主 + 少量松树 20 棵；避开中央 190m / 出生环带 ±130m / 土路 ──
  // 树无坦克碰撞（可碾过压毁倒伏）；逐实例 registerInst 注册（含树干圆柱求交）
  const placeTreeScatter = (type) => {
    const x = (rand() - 0.5) * size * 0.86;
    const z = (rand() - 0.5) * size * 0.86;
    if (Math.hypot(x, z) < 190 || onSpawnRing(x, z, 130) || roadDist(x, z) < 18) return;
    tb.placeTree(type, x, z, 1);
  };
  for (let i = 0; i < 70; i++) placeTreeScatter('leaf');
  for (let i = 0; i < 20; i++) placeTreeScatter('pine');

  // ── 散石群：中小巨石散布（可炮毁+阻挡，与独立巨石同一注册管线；纯石头无植被开销）。
  //    预算 60：另 ~18 块切给灌木伴生石（见下方灌木带），石头总量持平、向灌木聚拢 ──
  const stoneCs = [];
  for (let tries = 0; tries < 900 && stoneCs.length < 100; tries++) {
    const x = (rand() - 0.5) * size * 0.9, z = (rand() - 0.5) * size * 0.9;
    if (Math.hypot(x, z) < 50) continue;                    // 中心极近域留少量开阔地
    if (onSpawnRing(x, z, 130)) continue;
    if (roadDist(x, z) < 9) continue;
    if (villageCs.some(c => Math.hypot(c.x - x, c.z - z) < 40)) continue;
    if (world.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 6)) continue;   // 不与巨石/建筑重叠
    if (stoneCs.some(c => Math.hypot(c.x - x, c.z - z) < 24)) continue;
    stoneCs.push({ x, z });
  }
  let stoneCount = 0;
  for (const c of stoneCs) {
    if (rand() < 0.65 && stoneCount < 30) {
      const ang = rand() * Math.PI * 2, off = 2 + rand() * 3;   // 点位附近随机偏移
      const sx = c.x + Math.cos(ang) * off, sz = c.z + Math.sin(ang) * off;
      if (Math.abs(sx) < size / 2 - 30 && Math.abs(sz) < size / 2 - 30 && roadDist(sx, sz) > 8) {
        const s2 = 1.6 + rand() * 1.6;
        const m = new THREE.Mesh(bigRockGeos[stoneCount % 3], bigRockMat);
        m.position.set(sx, kurskHeight(sx, sz) + s2 * 0.16, sz);
        m.scale.set(s2, s2 * (0.7 + rand() * 0.5), s2 * (0.75 + rand() * 0.5));
        m.rotation.set(rand() * 0.6 - 0.3, rand() * 6, rand() * 0.6 - 0.3);
        m.castShadow = m.receiveShadow = true;
        root.add(m);
        m.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(m);
        des.registerGroup({
          type: 'boulder', group: m, cx: sx, cz: sz, r: s2,
          w: bb.max.x - bb.min.x, dp: bb.max.z - bb.min.z,
          height: bb.max.y - bb.min.y, y0: bb.min.y,
          rule: { hp: 5, rubbleH: 0.6 },
          obstacleKind: 'rock', obstacleK: 0.78, ellipsoid: true,   // 单一碰撞体；炮弹内切椭球判定
        });
        stoneCount++;
      }
    }
  }


  // ── inst 合批落地（树/围栏/柴堆） + 建筑合批落地 ──
  buildInstancedProps(des, tb.instData, tb.templates, tb.flora, root);
  tb.finalizeBatch();

  // ── 灌木带 ×26（js/hedgefield.js）：中央环带（r∈[60,340]，即双方出生点中间区域）静态布置，
  //    分层网格均匀分布，12/14/16m 长丛混合——软视线遮挡（挡视线不挡移动/炮弹），坦克可穿越
  //    （穿越扬尘 + 碾木声 + 小叶片落叶），炮口 5m 内开火震落尘埃。静态布置：避路/贴地一次生效。
  const hedgeField = new HedgeField({
    root, world, ps: ctx.ps, destructibles: des, audio: ctx.audio,
    groundY: kurskHeight, roadDist, rand,
    avoid: (x, z) => villageCs.some(c => Math.hypot(c.x - x, c.z - z) < 45),
  });
  hedgeField.build();
  world.hedgeField = hedgeField;
  ctx.hedgeField = hedgeField;

  // ── 灌木伴生石：每丛 ~70% 概率在旁侧（石缘距丛缘 0.5~2.5m）放一块中小巨石，
  //    符合自然群落（灌木生于石旁）；与散石同一注册管线（散石预算已大幅削减至 30）。
  //    外围出生区散布丛（h.outer）跳过——出生点可能落在丛旁，不放硬障碍压出生位 ──
  let companionRocks = 0;
  for (const h of hedgeField.hedges) {
    if (h.outer) continue;
    if (rand() >= 0.7) continue;
    const s2 = 1.6 + rand() * 1.6;
    const side = rand() < 0.5 ? 1 : -1;
    const ax = Math.cos(h.yaw), az = -Math.sin(h.yaw);    // 丛长轴方向
    const px = Math.sin(h.yaw), pz = Math.cos(h.yaw);     // 丛侧向
    const along = (rand() - 0.5) * h.len * 0.75;
    const gap = 0.5 + rand() * 2.0;
    const sx = h.cx + ax * along + px * side * (1.3 + s2 + gap);
    const sz = h.cz + az * along + pz * side * (1.3 + s2 + gap);
    if (Math.abs(sx) > size / 2 - 30 || Math.abs(sz) > size / 2 - 30) continue;
    if (roadDist(sx, sz) < 9) continue;
    if (world.obstacles.some(o => Math.hypot(o.x - sx, o.z - sz) < o.r + s2 + 1.5)) continue;
    const m = new THREE.Mesh(bigRockGeos[(stoneCount + companionRocks) % 3], bigRockMat);
    m.position.set(sx, kurskHeight(sx, sz) + s2 * 0.16, sz);
    m.scale.set(s2, s2 * (0.7 + rand() * 0.5), s2 * (0.75 + rand() * 0.5));
    m.rotation.set(rand() * 0.6 - 0.3, rand() * 6, rand() * 0.6 - 0.3);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m);
    des.registerGroup({
      type: 'boulder', group: m, cx: sx, cz: sz, r: s2,
      w: bb.max.x - bb.min.x, dp: bb.max.z - bb.min.z,
      height: bb.max.y - bb.min.y, y0: bb.min.y,
      rule: { hp: 5, rubbleH: 0.6 },
      obstacleKind: 'rock', obstacleK: 0.78, ellipsoid: true,   // 单一碰撞体；炮弹内切椭球判定
    });
    companionRocks++;
  }

  // ── 高度采样：基础地形 + 废墟坡度场 + 土路路面抬高 ──
  world.setGroundY((x, z) => kurskHeight(x, z) + des.rubbleHeightAt(x, z) +
    (world.surfaceY ? world.surfaceY(x, z) : 0));
}


// ═══════════════════════ 诺曼底 · 1944（bocage 树篱田：田块拼接 / 乡道十字 / 清晨低阳） ═══
// 设计定稿：Bocage 农田主题；清晨、少雾；树篱全部可穿越（软遮挡）；2000×2000
// ── 简易几何合并（路灯杆件等小道具；索引几何按顺序拼接） ──
function mergeGeos(geos) {
  let vCount = 0, iCount = 0;
  for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const idx = new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// ═══════════════════════ 诺曼底 · 1944 v2（bocage 树篱田：随形田块 / 紧凑小镇 / 清晨低阳） ═══
// 布局：js/mapdata-normandy.js（用户手绘稿定稿）；清晨、少雾；树篱软遮挡可穿越；2000×2000
function buildNormandy(ctx, des) {
  const { world, scene, quality } = ctx;
  const root = world.root;
  const size = MAPS.normandy.size;
  const rand = mulberry32(19440610);   // 确定性布局（与 mapdata 平面图脚本同种子）

  // ── 布局数据（同源：田块多边形 / 树篱边界 / 篱上树 / 小镇房屋） ──
  const cells = buildParcels(rand);
  const hedgeSegs = buildHedgeBorders(rand, cells);
  const hedgeTreePts = buildHedgeTrees(rand, hedgeSegs);

  // ── 光照：六月清晨——低角度暖阳 + 冷灰蓝天光（Ambient/Hemi 略抬：晨阳背光墙面不死黑） ──
  const sunDir = new THREE.Vector3(0.78, 0.30, 0.42).normalize();
  root.add(new THREE.HemisphereLight(0x9fb2c8, 0x55603c, 1.5));   // 清晨灰蓝散射 / 草地暗绿反弹
  root.add(new THREE.AmbientLight(0x9aa4ac, 0.52));
  const sun = new THREE.DirectionalLight(0xffdfae, 3.6);          // 低阳暖金，长影
  sun.position.copy(sunDir).multiplyScalar(600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  const sc = 90;
  sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
  sun.shadow.camera.top = sc; sun.shadow.camera.bottom = sc;
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0006;
  root.add(sun);
  root.add(sun.target);
  world.sun = sun;
  world.sunDir = sunDir;

  // ── 天空 + 雾（shader 不动只换 uniform：清晨灰蓝调；雾色灰绿、密度不变保 1100m 剔除衔接） ──
  world.sky = makeSkyDome();
  const su = world.sky.material.uniforms;
  su.sunDir.value.copy(sunDir);
  su.sunDiscPow.value = 6000;   // 清晨低阳：日轮收到近真实视直径（~1.7°，默认 260≈8° 像巨日）
  su.topColor.value.set(0x35507e);
  su.midColor.value.set(0x8ba7c4);
  su.botColor.value.set(0xd9dcd0);
  su.fogColor.value.set(0xbfc8ba);
  world.skyMat = world.sky.material;  // 主循环每帧累加 uTime
  root.add(world.sky);
  scene.fog = new THREE.FogExp2(0xbfc8ba, 0.0015);

  // ── 地面（写实航拍风田块贴图，整图一张 2048 不平铺） ──
  const seg = 200;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const posA = geo.attributes.position;
  for (let i = 0; i < posA.count; i++) posA.setY(i, normandyHeight(posA.getX(i), posA.getZ(i)));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: makeNormandyGroundTexture(rand, size, cells, hedgeSegs), roughness: 0.96, metalness: 0.0,
  }));
  ground.receiveShadow = true;
  root.add(ground);

  // ── 主公路 ×3（土路） + 镇内小路 ×3（石板） + 广场（石板） ──
  buildDirtRoads(root, N2_ROADS, normandyHeight, rand, N2_ROAD_HALF, null, 0.05);
  const cobbleTex = makeCobbleTexture(rand);
  buildDirtRoads(root, N2_LANES, normandyHeight, rand, LANE_HALF, cobbleTex, 0.04);
  {
    // 广场：旋转矩形硬化面（镇区已压平，直接平铺）
    const pg = new THREE.PlaneGeometry(N2_PLAZA.w, N2_PLAZA.d, 8, 6);
    pg.rotateX(-Math.PI / 2);
    const pm = pg.attributes.position;
    const rot = N2_PLAZA.rot * Math.PI / 180;
    const rc = Math.cos(rot), rs = Math.sin(rot);
    for (let i = 0; i < pm.count; i++) {
      const lx = pm.getX(i), lz = pm.getZ(i);
      const wx = N2_PLAZA.x + lx * rc + lz * rs, wz = N2_PLAZA.z - lx * rs + lz * rc;
      pm.setXYZ(i, wx, normandyHeight(wx, wz) + 0.04, wz);
    }
    pg.computeVertexNormals();
    const plaza = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: cobbleTex, roughness: 0.95, metalness: 0 }));
    plaza.receiveShadow = true;
    root.add(plaza);
  }

  // ── 树篱网：篱段 → 模板分段（24/34/44/56/64m），软遮挡可穿越 ──
  const LENS = [24, 34, 44, 56, 64];
  const pieces = [];
  for (const [x1, z1, x2, z2] of hedgeSegs) {
    const dx = x2 - x1, dz = z2 - z1;
    const L = Math.hypot(dx, dz);
    if (L < 18) continue;
    const ux = dx / L, uz = dz / L;
    let t = 0;
    while (L - t > 18) {
      let tl = 0;
      for (const cand of LENS) if (cand <= L - t) tl = cand;
      if (!tl) break;
      const mid = t + tl / 2;
      pieces.push({ x: x1 + ux * mid, z: z1 + uz * mid, yaw: Math.atan2(-uz, ux), len: tl });
      t += tl + 1.5;
    }
  }
  const hedgeField = new HedgeField({
    root, world, ps: ctx.ps, destructibles: des, audio: ctx.audio,
    groundY: normandyHeight, roadDist: nRoadDist, rand,
  });
  hedgeField.buildBocage(pieces);
  world.hedgeField = hedgeField;
  ctx.hedgeField = hedgeField;

  // ── 小镇（紧凑沿街立面 + 背院填充，欧洲小镇组；EU_SCALE 0.88——0.8 基础上 2026-09-18 回调 +10%） ──
  const tb = createKitPlacer(ctx, des, { groundY: normandyHeight, rand });
  for (const h of N2_TOWN_HOUSES) {
    if (nLaneDist(h.x, h.z) < 1.5) console.warn('[normandy] 建筑压小路', h.key, h.x, h.z);
    tb.placeKit(h.key, h.x, h.z, h.rot, { scale: EU_SCALE });
  }
  // ── 镇内后院：木围栏（fenceRun 分段交替 fence01/02）+ 柴堆/长椅/配电箱 ──
  const yards = buildYardLayouts(rand);
  for (const [x1, z1, x2, z2] of yards.fences) tb.fenceRun(x1, z1, x2, z2);
  for (const p of yards.props) tb.placeKit(p.type, p.x, p.z, p.rot, { collide: false });

  // ── 路灯（程序化：深绿铁杆 + 弯臂 + 奶白灯头；纯装饰无碰撞） ──
  {
    const poleGeo = new THREE.CylinderGeometry(0.055, 0.085, 4.4, 6);
    poleGeo.translate(0, 2.2, 0);
    const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 5);
    armGeo.rotateZ(Math.PI / 2 - 0.35);
    armGeo.translate(0.42, 4.32, 0);
    const headGeo = new THREE.SphereGeometry(0.17, 8, 6);
    headGeo.translate(0.82, 4.16, 0);
    const merged = mergeGeos([poleGeo, armGeo]);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2e3a2e, roughness: 0.7, metalness: 0.5 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf2ead0, roughness: 0.5, emissive: 0x8a7f5a, emissiveIntensity: 0.55 });
    const poles = new THREE.InstancedMesh(merged, poleMat, N2_LAMPS.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, N2_LAMPS.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3();
    N2_LAMPS.forEach((l, i) => {
      q.setFromAxisAngle(UP, l.rot * Math.PI / 180 + Math.PI);   // 弯臂朝向路心
      pv.set(l.x, normandyHeight(l.x, l.z), l.z);
      m4.compose(pv, q, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, m4);
      heads.setMatrixAt(i, m4);
    });
    poles.castShadow = true;
    root.add(poles); root.add(heads);
  }

  // ── 镇内绿化：宅旁小灌木（矮篱模板）+ 镇内树木 + 镇外围绿带（衔接田野） ──
  const yardBushes = buildYardBushes(rand);
  const outskirts = buildOutskirts(rand);
  const smallBushPieces = [...yardBushes, ...outskirts.bushes]
    .filter(b => nRoadDist(b.x, b.z) > 9 && nLaneDist(b.x, b.z) > 6 && !inPlaza(b.x, b.z));
  hedgeField.buildBocage(smallBushPieces, { cardDensity: 0.42, hMin: 0.9, hMax: 1.5, cullFar: 300 });
  for (const [x0, z0] of N2_TOWN_TREES) {
    const x = x0 + (rand() - 0.5) * 4, z = z0 + (rand() - 0.5) * 4;
    if (nRoadDist(x, z) < 7 || nLaneDist(x, z) < 5) continue;   // 树不压路/巷
    tb.placeTree('leaf', x, z, 0.55 + rand() * 0.2);
  }
  for (const [x, z] of outskirts.trees) {
    if (nRoadDist(x, z) < 10 || nLaneDist(x, z) < 7) continue;
    tb.placeTree(rand() < 0.8 ? 'leaf' : 'pine', x, z, 0.7 + rand() * 0.25);
  }

  // 篱上大树（bocage 特征）
  for (const [x, z] of hedgeTreePts) {
    if (nRoadDist(x, z) < 8 || nLaneDist(x, z) < 6) continue;
    tb.placeTree('leaf', x, z, 0.75 + rand() * 0.3);
  }
  // 缘带/路旁散树（避镇区/路/广场）
  for (const a of N2_TREE_AREAS) {
    for (let i = 0; i < a.n; i++) {
      const x = a.x0 + rand() * (a.x1 - a.x0), z = a.z0 + rand() * (a.z1 - a.z0);
      if (nRoadDist(x, z) < 10 || nLaneDist(x, z) < 7 || inPlaza(x, z)) continue;
      if (Math.hypot(x - N2_TOWN.x, z - N2_TOWN.z) < N2_TOWN.r) continue;
      tb.placeTree(rand() < 0.85 ? 'leaf' : 'pine', x, z, 1);
    }
  }

  buildInstancedProps(des, tb.instData, tb.templates, tb.flora, root);
  tb.finalizeBatch();

  // ── 高度采样：基础地形 + 废墟坡度场 + 路面抬高 ──
  world.setGroundY((x, z) => normandyHeight(x, z) + des.rubbleHeightAt(x, z) +
    (world.surfaceY ? world.surfaceY(x, z) : 0));
}

// ═══════════════════════ 普罗霍罗夫卡 · 1943（1500×2000 矩形：冲沟台地 / 春季黑土草原） ═══
// 地形骨架 = 3 条大冲沟（G1 北 / G2 中 / G3 东支沟）分割 4 块台地（北/中央/东/南）；
// 大而不碎：台地大块平整（±1.5m），冲沟是唯一大地形遮挡；棱线 = 天然反斜面。
const pkMainDist = (x, z) => pkDist(x, z, PK_ROADS.main);

function prokhorovkaHeight(x, z) {
  // 台地基准：四块各自不同（北 15 / 中央 18 / 南 12.5 / 东 17）——z/x 向平滑过渡（过渡带藏在冲沟与坡下）
  let base = 15 + 3 * sstep(z, -280, 100) - 5.5 * sstep(z, 320, 640);
  base += 2.2 * sstep(x, 430, 640) * sstep(Math.abs(z + 60), 30, 260);          // 东台地略高
  // 大缓丘：中央台地主丘 + 东南次丘（350m 级别——打断一览无余的长视距）
  let h = base + 5.5 * Math.exp(-((x + 240) * (x + 240) + (z + 70) * (z + 70)) / (2 * 210 * 210));
  h += 4.0 * Math.exp(-((x - 380) * (x - 380) + (z - 380) * (z - 380)) / (2 * 160 * 160));
  h += 3.2 * Math.exp(-((x - 520) * (x - 520) + (z + 300) * (z + 300)) / (2 * 150 * 150));
  // 中尺度起伏（正弦双频；高频微碎去掉——pitch 采样会拾取局地坡度尖刺导致上坡没速度）
  h += Math.sin(x * 0.011 + 1.9) * Math.cos(z * 0.010 + 0.7) * 1.8;
  h += Math.sin(x * 0.024 + 2.6) * Math.cos(z * 0.021 + 1.4) * 0.5;
  // 冲沟与支沟下切
  h -= ravineCarve(x, z);
  // 沟口村局部微平（压在主丘南肩，基准 20.5）
  const dv = Math.hypot(x - A_VILLAGE.x, z - A_VILLAGE.z);
  h = 20.5 + (h - 20.5) * sstep(dv, 55, 100);
  return h;
}

// ── 春季黑土草原纹理（1536×2048 单张）：台地大田块拼块（犁地黑土/返青麦绿）+ 冲沟野草 + 溪线 + 路肩 ──
function makePkGroundTexture(rand) {
  const W = 1536, H = 1536;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const px = (v) => (v + 750) / 1500 * W;
  const pz = (v) => (v + 750) / 1500 * H;
  // 低饱和真实草原调色板（早春黑土返青——橄榄/土灰/枯黄/暗绿，非动画亮绿）
  const T = {
    base:   '#6e6e48',    // 基底：暗橄榄绿
    dry:    '#8a8258',    // 干草黄
    green:  '#5c6838',    // 返青麦绿（暗）
    dirt:   '#4a4030',    // 犁地黑土
    pale:   '#9a9268',    // 枯草浅
    mud:    '#584c34',    // 泥泞
  };
  c.fillStyle = T.base;
  c.fillRect(0, 0, W, H);
  // ── 层1：大尺度底色分区（300~500m 级：干草原/返青/犁地的天然分布，极低对比度） ──
  const bigZones = [
    [-450, -750, 380, '#5c6438', 0.35], [-100, -720, 350, '#847c54', 0.3],
    [300, -700, 340, '#6a6a3e', 0.3], [-600, -400, 400, '#827a50', 0.25],
    [-200, -350, 380, '#5a6038', 0.3], [250, -300, 380, '#8a8258', 0.25],
    [500, -200, 320, '#62643c', 0.3], [-500, 50, 380, '#847c52', 0.25],
    [-100, 100, 400, '#5a6238', 0.3], [300, 150, 380, '#88805a', 0.25],
    [550, 50, 300, '#64683c', 0.3], [-550, 350, 380, '#7e7a4e', 0.25],
    [-150, 400, 380, '#5a6238', 0.3], [250, 450, 380, '#8a8258', 0.25],
    [550, 400, 320, '#62643c', 0.3], [-550, 650, 380, '#847c52', 0.25],
    [-100, 700, 400, '#5a6238', 0.3], [300, 750, 380, '#88805a', 0.25],
  ];
  for (const [x, z, r, col, a] of bigZones) {
    const g = c.createRadialGradient(px(x), pz(z), 0, px(x), pz(z), r / 1500 * W);
    g.addColorStop(0, col);
    g.addColorStop(1, col);
    c.globalAlpha = a;
    c.fillStyle = g;
    c.beginPath(); c.arc(px(x), pz(z), r / 1500 * W, 0, 7); c.fill();
  }
  c.globalAlpha = 1;
  // ── 层2：田块色差（低对比度、不规则边、暗犁地与亮返青的过渡——非矩形纯色块） ──
  const fieldPatches = [
    [-560, -880, 320, '#585030', 0.28], [-140, -860, 300, '#7a7448', 0.22],
    [280, -820, 260, '#4c4428', 0.2], [-600, -580, 280, '#847c50', 0.18],
    [-200, -560, 320, '#4c4428', 0.22], [240, -540, 280, '#7a7448', 0.18],
    [-600, -180, 300, '#585030', 0.25], [-180, -160, 280, '#7a7448', 0.2],
    [280, -140, 260, '#4c4428', 0.2], [-600, 100, 280, '#847c50', 0.18],
    [-200, 120, 320, '#585030', 0.22], [280, 140, 260, '#7a7448', 0.18],
    [-600, 440, 280, '#585030', 0.22], [-180, 460, 300, '#7a7448', 0.18],
    [280, 480, 260, '#4c4428', 0.2], [-600, 700, 300, '#847c50', 0.18],
    [-200, 720, 320, '#585030', 0.22], [280, 740, 260, '#7a7448', 0.18],
    [500, 300, 240, '#585030', 0.2], [540, 620, 220, '#7a7448', 0.18],
  ];
  for (const [x, z, r, col, a] of fieldPatches) {
    const g = c.createRadialGradient(px(x), pz(z), 0, px(x), pz(z), r / 1500 * W);
    g.addColorStop(0, col);
    g.addColorStop(1, col);
    c.globalAlpha = a;
    c.fillStyle = g;
    c.beginPath(); c.arc(px(x), pz(z), r / 1500 * W, 0, 7); c.fill();
  }
  c.globalAlpha = 1;
  // ── 层3：中尺度斑驳（干湿草过渡、泥点、枯斑——50~150m 级，极低对比度） ──
  for (let i = 0; i < 320; i++) {
    const x = rand() * W, y = rand() * H, r = 15 + rand() * 55;
    const tone = rand() < 0.35 ? '88,82,52' : rand() < 0.6 ? '104,96,60' : '122,116,80';
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + tone + ',' + (0.06 + rand() * 0.08).toFixed(2) + ')');
    g.addColorStop(1, 'rgba(' + tone + ',0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  // ── 层4：冲沟岸坡暗色带（沟缘植被+湿土，沿冲沟中线宽笔触） ──
  c.lineCap = 'round';
  for (const r of PK_RAVINES) {
    c.strokeStyle = 'rgba(58,52,32,0.35)';
    c.lineWidth = pz((r.half + r.slopeW) * 2) - pz(0);
    c.beginPath();
    r.pts.forEach(([x, z], i) => { const a = px(x), b = pz(z); if (i) c.lineTo(a, b); else c.moveTo(a, b); });
    c.stroke();
  }
  // 沟底线（暗湿土）
  for (const r of PK_RAVINES) {
    c.strokeStyle = 'rgba(48,44,28,0.6)';
    c.lineWidth = pz(r.half) - pz(0);
    c.beginPath();
    r.pts.forEach(([x, z], i) => { const a = px(x), b = pz(z); if (i) c.lineTo(a, b); else c.moveTo(a, b); });
    c.stroke();
  }
  // ── 层5：路肩融合带（压实土色，路 mesh 下方） ──
  c.strokeStyle = 'rgba(108,96,68,0.5)';
  c.lineWidth = pz(PK_ROAD_HALF * 2 + 10) - pz(0);
  c.beginPath();
  PK_ROADS.main.forEach(([x, z], i) => { const a = px(x), b = pz(z); if (i) c.lineTo(a, b); else c.moveTo(a, b); });
  c.stroke();
  // ── 层6：细粒噪点（风吹草纹/土粒/枯茎，三色混合密布——真实地表颗粒质感） ──
  for (let i = 0; i < 9000; i++) {
    const x = rand() * W, y = rand() * H, r = 0.5 + rand() * 1.8;
    const tone = rand() < 0.35 ? 'rgba(56,50,32,' : rand() < 0.65 ? 'rgba(120,112,72,' : 'rgba(90,86,52,';
    c.fillStyle = tone + (0.08 + rand() * 0.14).toFixed(2) + ')';
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  // 短草茎线（极细极短，随机角度）
  for (let i = 0; i < 4500; i++) {
    const x = rand() * W, y = rand() * H;
    const a = rand() * Math.PI * 2, l = 1.5 + rand() * 3.5;
    c.strokeStyle = rand() < 0.5 ? 'rgba(60,56,36,0.1)' : 'rgba(130,124,80,0.08)';
    c.lineWidth = 0.5;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
function buildProkhorovka(ctx, des) {
  const { world, quality } = ctx;
  const root = world.root;
  const rand = mulberry32(19430712);

  // ── 光照：春末晴朗（太阳偏高、影子适中） ──
  const sunDir = new THREE.Vector3(0.42, 0.66, 0.5).normalize();
  root.add(new THREE.HemisphereLight(0xa8bcd8, 0x5c6640, 1.4));
  root.add(new THREE.AmbientLight(0x8b95a2, 0.45));
  const sun = new THREE.DirectionalLight(0xfff2da, 3.2);
  sun.position.copy(sunDir).multiplyScalar(700);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  const sc = 110;
  sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
  sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 1400;
  sun.shadow.bias = -0.0006;
  root.add(sun);
  root.add(sun.target);
  world.sun = sun;
  world.sunDir = sunDir;

  // ── 天空 + 薄雾（视距 ~600m，草原开阔但远端柔化） ──
  world.sky = makeSkyDome();
  const su = world.sky.material.uniforms;
  su.sunDir.value.copy(sunDir);
  su.topColor.value.set(0x3a6cb4);
  su.midColor.value.set(0x93b8dc);
  su.botColor.value.set(0xd8e2ea);
  su.fogColor.value.set(0xc8d4de);
  world.skyMat = world.sky.material;
  root.add(world.sky);
  ctx.scene.fog = new THREE.FogExp2(0xc8d4de, 0.0018);

  // ── 地面（春季草原 1536² 单张；190×190 分段贴 prokhorovkaHeight） ──
  const geo = new THREE.PlaneGeometry(1500, 1500, 280, 280);
  geo.rotateX(-Math.PI / 2);
  const posA = geo.attributes.position;
  for (let i = 0; i < posA.count; i++) posA.setY(i, prokhorovkaHeight(posA.getX(i), posA.getZ(i)));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: makePkGroundTexture(rand), roughness: 0.94, metalness: 0.0,
  }));
  ground.receiveShadow = true;
  root.add(ground);

  // ── 路网（草原土路） ──
  buildDirtRoads(root, [PK_ROADS.main], prokhorovkaHeight, rand, PK_ROAD_HALF, null, 0.05);
  buildDirtRoads(root, [PK_ROADS.east, PK_ROADS.south], prokhorovkaHeight, rand, 3, null, 0.04);

  // ── 建筑：沟口村 ×7 + 农庄/农舍 ──
  const tb = createKitPlacer(ctx, des, { groundY: prokhorovkaHeight, rand });
  for (const h of PK_VILLAGE_HOUSES) tb.placeKit(h.key, h.x, h.z, h.rot, { scale: EU_SCALE });
  for (const f of PK_FARMS) tb.placeKit(f.key, f.x, f.z, f.rot, { scale: EU_SCALE });
  for (const [x1, z1, x2, z2] of [[-136, 40, -128, 62], [-32, 12, -8, 20], [-104, 34, -80, 30],
                                   [-344, -706, -300, -712], [548, -96, 574, -88], [196, 688, 240, 692]]) {
    tb.fenceRun(x1, z1, x2, z2);
  }
  // ── 植被（大量）：护田林带行 + 树丛 + 冲沟底树行 + 村旁绿化 + 岩石 ──
  // ① 冲沟底树行（沿沟心两侧柳树/白杨，沟底绿廊）
  for (const r of PK_RAVINES) {
    for (let i = 1; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const nx = (bz - az) / L, nz = -(bx - ax) / L;
      for (const side of [-1, 1]) {
        const x = r.pts[i][0] + nx * side * r.half * 0.55, z = r.pts[i][1] + nz * side * r.half * 0.55;
        if (rand() < 0.75) tb.placeTree(rand() < 0.9 ? 'leaf' : 'pine', x, z, 0.55 + rand() * 0.25);
      }
    }
  }
  // ② 护田林带（防风林行：沿田块边缘成行等距 + 抖动）
  for (const [x1, z1, x2, z2, cnt] of PK_TREE_ROWS) {
    for (let i = 0; i < cnt; i++) {
      const t = (i + 0.5) / cnt;
      const x = x1 + (x2 - x1) * t + (rand() - 0.5) * 8, z = z1 + (z2 - z1) * t + (rand() - 0.5) * 8;
      if (pkMainDist(x, z) < 12) continue;
      tb.placeTree(rand() < 0.88 ? 'leaf' : 'pine', x, z, 0.6 + rand() * 0.25);
    }
  }
  // ③ 树丛（3~6 棵小群：丘顶/沟缘/田角）
  for (const [cx, cz] of PK_TREE_CLUSTERS) {
    const cnt = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < cnt; i++) {
      const a = rand() * Math.PI * 2, rr = 4 + rand() * 12;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (pkMainDist(x, z) < 12) continue;
      tb.placeTree(rand() < 0.85 ? 'leaf' : 'pine', x, z, 0.6 + rand() * 0.28);
    }
  }
  // ④ 村旁/农舍绿化：每栋 1~2 树 + 灌木（建筑不突兀，院子有绿）
  const greenAt = (hx, hz) => {
    for (let i = 0; i < 2; i++) {
      const a = rand() * Math.PI * 2, rr = 9 + rand() * 7;
      const x = hx + Math.cos(a) * rr, z = hz + Math.sin(a) * rr;
      if (pkMainDist(x, z) < 12) continue;
      tb.placeTree('leaf', x, z, 0.5 + rand() * 0.22);
    }
  };
  for (const h of PK_VILLAGE_HOUSES) greenAt(h.x, h.z);
  for (const f of PK_FARMS) greenAt(f.x, f.z);
  // ⑤ 岩石（冲沟坡/台地缓丘）
  for (const [x, z] of PK_ROCKS) tb.placeTree(rand() < 0.6 ? 'rock' : 'rock2', x, z, 0.7 + rand() * 0.9);
  // ⑥ 路旁灌木（主路+支路两侧间隔矮篱）
  const bushPieces = [];
  for (const poly of [PK_ROADS.main, PK_ROADS.east, PK_ROADS.south]) {
    for (let i = 1; i < poly.length; i++) {
      const [ax, az] = poly[i - 1], [bx, bz] = poly[i];
      const segL = Math.hypot(bx - ax, bz - az);
      const cnt = Math.floor(segL / 85);
      for (let k = 0; k < cnt; k++) {
        const t = (k + 0.5 + rand() * 0.4) / cnt;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (Math.hypot(x - A_VILLAGE.x, z - A_VILLAGE.z) < A_VILLAGE.r + 40) continue;
        const side = rand() < 0.5 ? -1 : 1;
        const off = 9 + rand() * 6;
        const nx = (bz - az) / segL, nz = -(bx - ax) / segL;
        bushPieces.push({ x: x + nx * side * off, z: z + nz * side * off, yaw: Math.atan2(-(bz - az), bx - ax) + (rand() - 0.5) * 0.6, len: 9 + rand() * 9 });
      }
    }
  }
  const hedgeField = new HedgeField({
    root, world, ps: ctx.ps, destructibles: des, audio: ctx.audio,
    groundY: prokhorovkaHeight, roadDist: pkMainDist, rand,
  });
  hedgeField.buildBocage(bushPieces, { cardDensity: 0.4, hMin: 0.8, hMax: 1.4, cullFar: 320 });
  world.hedgeField = hedgeField;
  ctx.hedgeField = hedgeField;

  buildInstancedProps(des, tb.instData, tb.templates, tb.flora, root);
  tb.finalizeBatch();

  // ── 高度采样 + 主路土路（草原路速同越野） ──
  world.setGroundY((x, z) => prokhorovkaHeight(x, z) + des.rubbleHeightAt(x, z) +
    (world.surfaceY ? world.surfaceY(x, z) : 0));
}


// ═══════════════════════ 阿登森林 · 1944（1600²：雪林山地 / 大雾低云 / 溪谷村落） ═══
// 布局：js/mapdata-ardennes.js。玩法性格 = 密林软遮挡 + 脊线反斜面 + 道路机动轴；
// 炮弹穿树（树干仅决定倒伏），双方不再"打树上"（destructibles.shellHit 树类放行）
const arMainDist = (x, z) => arDist(x, z, AR_ROADS.main);
const arLaneDist = (x, z) => Math.min(arDist(x, z, AR_ROADS.laneNS), arDist(x, z, AR_ROADS.laneE));

// 基底高度：大尺度缓丘（低频，防上坡掉速碎坡）+ 三条山脊（高斯岭线）+ 雪溪下切
function ardennesBase(x, z) {
  let h = Math.sin(x * 0.006 + 1.2) * Math.cos(z * 0.005 + 0.4) * 4.2
        + Math.sin(x * 0.014 + 3.3) * Math.cos(z * 0.012 + 2.2) * 1.8
        + Math.sin(x * 0.031 + 0.9) * Math.cos(z * 0.028 + 4.1) * 0.6;
  for (const r of AR_RIDGES) {
    const axis = r.c + r.wave * Math.sin((r.along === 'z' ? z : x) * r.freq + r.phase);
    const d = (r.along === 'z' ? x : z) - axis;
    h += r.amp * Math.exp(-(d * d) / (r.width * r.width));
  }
  h -= creekCarve(x, z);
  return h;
}
const AR_V_H = ardennesBase(AR_VILLAGE.x, AR_VILLAGE.z);   // 村台地标高（模块加载时算一次）
function ardennesHeight(x, z) {
  let h = ardennesBase(x, z);
  // 村台地压平（建房行车）
  h = AR_V_H + (h - AR_V_H) * sstep(Math.hypot(x - AR_VILLAGE.x, z - AR_VILLAGE.z), 60, 140);
  // 出生带（|x|>600 → 700 外）放缓起伏：出生点不被坡脊卡视线/姿态
  h *= 1 - 0.55 * sstep(Math.abs(x), 600, 700);
  return h;
}

// ── 雪原地面纹理（2048² 单张不平铺）：阴雪底 + 风蚀雪纹 + 林下腐殖斑 + 溪冰 + 路肩雪泥 ──
function makeArdennesGroundTexture(rand) {
  const s = 2048, size = MAPS.ardennes.size;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const m2px = s / size;
  const toPx = (x, z) => [(x + size / 2) * m2px, (z + size / 2) * m2px];
  // 底：阴天雪面（中性偏冷，防过曝）
  g.fillStyle = '#c6ccd4'; g.fillRect(0, 0, s, s);
  // 大尺度明暗（雪堆/风场，80~400m 级）
  for (let i = 0; i < 90; i++) {
    const x = rand() * s, y = rand() * s, r = 60 + rand() * 260;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const lite = rand() < 0.5;
    gr.addColorStop(0, lite ? 'rgba(226,231,238,0.14)' : 'rgba(168,178,190,0.13)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 林下腐殖斑（雪被踏化露出针叶腐殖土；椭圆随斑块旋转，核心深边缘羽化）
  for (const p of AR_FOREST) {
    const [cx, cz, rx, rz, rot] = p;
    const [px0, pz0] = toPx(cx, cz);
    g.save();
    g.translate(px0, pz0);
    g.rotate(rot * Math.PI / 180);
    g.scale(rx * m2px, rz * m2px);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, 'rgba(48,50,40,0.52)');
    gr.addColorStop(0.7, 'rgba(56,58,46,0.40)');
    gr.addColorStop(1, 'rgba(56,58,46,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill();
    g.restore();
  }
  // 风蚀雪纹（sastrugi：统一风向的细亮纹）
  const wx = 0.86, wz = 0.5;   // 西北风
  for (let i = 0; i < 2600; i++) {
    const x = rand() * s, y = rand() * s, l = 5 + rand() * 16;
    g.strokeStyle = rand() < 0.6 ? `rgba(238,242,247,${0.05 + rand() * 0.06})` : `rgba(160,170,182,${0.04 + rand() * 0.05})`;
    g.lineWidth = 0.8 + rand() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + wx * l, y + wz * l); g.stroke();
  }
  // 溪谷：岸坡湿土带 + 冰面
  g.lineCap = 'round';
  const drawPoly = (poly, style, wM) => {
    g.strokeStyle = style;
    g.lineWidth = Math.max(1, wM * m2px);
    g.beginPath();
    poly.forEach(([x, z], i) => { const [a, b] = toPx(x, z); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
    g.stroke();
  };
  drawPoly(AR_CREEK.pts, 'rgba(74,80,86,0.42)', (AR_CREEK.half + AR_CREEK.slopeW) * 1.6);
  drawPoly(AR_CREEK.pts, 'rgba(158,176,190,0.75)', AR_CREEK.half * 1.7);
  drawPoly(AR_CREEK.pts, 'rgba(210,222,232,0.5)', AR_CREEK.half * 0.8);
  // 路肩雪泥融合带（路 mesh 下方）
  drawPoly(AR_ROADS.main, 'rgba(142,140,132,0.40)', AR_ROAD_HALF * 2 + 9);
  drawPoly(AR_ROADS.laneNS, 'rgba(142,140,132,0.34)', AR_LANE_HALF * 2 + 7);
  drawPoly(AR_ROADS.laneE, 'rgba(142,140,132,0.34)', AR_LANE_HALF * 2 + 7);
  // 村口踩踏（人车踩踏雪变灰）
  {
    const [vx, vz] = toPx(AR_VILLAGE.x, AR_VILLAGE.z);
    const gr = g.createRadialGradient(vx, vz, 0, vx, vz, 95 * m2px);
    gr.addColorStop(0, 'rgba(140,138,128,0.20)');
    gr.addColorStop(1, 'rgba(140,138,128,0)');
    g.fillStyle = gr;
    g.fillRect(vx - 95 * m2px, vz - 95 * m2px, 190 * m2px, 190 * m2px);
  }
  // 细颗粒 + 雪晶闪光点
  for (let i = 0; i < 40000; i++) {
    const v = rand();
    g.fillStyle = v < 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(118,126,138,0.07)';
    g.fillRect(rand() * s, rand() * s, 1 + rand() * 1.6, 1 + rand() * 1.6);
  }
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(255,255,255,${0.18 + rand() * 0.2})`;
    g.fillRect(rand() * s, rand() * s, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ── 压实雪路贴图：雪底 + 双雪泥车辙 + 砾石杂点 ──
function makeSnowRoadTexture(rand) {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#b2b8c0'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2200; i++) {
    const v = rand();
    g.fillStyle = v < 0.45 ? 'rgba(130,136,144,0.18)' : v < 0.8 ? 'rgba(216,220,226,0.14)' : 'rgba(92,90,82,0.20)';
    g.fillRect(rand() * s, rand() * s, 1 + rand() * 2, 1 + rand() * 2);
  }
  for (const u of [0.30, 0.70]) {   // 雪泥车辙暗带
    const x = u * s;
    const gr = g.createLinearGradient(x - 13, 0, x + 13, 0);
    gr.addColorStop(0, 'rgba(88,86,78,0)');
    gr.addColorStop(0.5, 'rgba(88,86,78,0.62)');
    gr.addColorStop(1, 'rgba(88,86,78,0)');
    g.fillStyle = gr;
    g.fillRect(x - 13, 0, 26, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildArdennes(ctx, des) {
  const { world, quality } = ctx;
  const root = world.root;
  const size = MAPS.ardennes.size;
  const rand = mulberry32(19441216);   // 确定性布局（1944 年 12 月，突出部战役）

  // ── 光照：12 月阴昼——低角度冷阳 + 雪面强反弹（Hemi 地面色亮） ──
  const sunDir = new THREE.Vector3(0.45, 0.28, 0.55).normalize();
  root.add(new THREE.HemisphereLight(0x9aa6b4, 0x878d94, 1.65));
  root.add(new THREE.AmbientLight(0x9ba2ac, 0.5));
  const sun = new THREE.DirectionalLight(0xdfe6ee, 2.3);   // 冷白弱阳
  sun.position.copy(sunDir).multiplyScalar(600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  const sc = 100;
  sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
  sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0006;
  root.add(sun);
  root.add(sun.target);
  world.sun = sun;
  world.sunDir = sunDir;

  // ── 天空 + 雾（阴云低垂；密度 0.0024 → ~600m 近全雾，"空中遮蔽"感） ──
  world.sky = makeSkyDome();
  const su = world.sky.material.uniforms;
  su.sunDir.value.copy(sunDir);
  su.sunDiscPow.value = 3500;   // 朦胧小日轮
  su.topColor.value.set(0x707b88);
  su.midColor.value.set(0xa4adb6);
  su.botColor.value.set(0xccd2d8);
  su.fogColor.value.set(0xc3c9d0);
  world.skyMat = world.sky.material;
  root.add(world.sky);
  ctx.scene.fog = new THREE.FogExp2(0xc3c9d0, 0.0024);

  // ── 地面（雪原单张 2048） ──
  const geo = new THREE.PlaneGeometry(size, size, 240, 240);
  geo.rotateX(-Math.PI / 2);
  const posA = geo.attributes.position;
  for (let i = 0; i < posA.count; i++) posA.setY(i, ardennesHeight(posA.getX(i), posA.getZ(i)));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: makeArdennesGroundTexture(rand), roughness: 0.94, metalness: 0.0,
  }));
  ground.receiveShadow = true;
  root.add(ground);

  // ── 路网（压实雪路贴图；主路 + 两条南北林道） ──
  const snowRoadTex = makeSnowRoadTexture(rand);
  buildDirtRoads(root, [AR_ROADS.main], ardennesHeight, rand, AR_ROAD_HALF, snowRoadTex, 0.05);
  buildDirtRoads(root, [AR_ROADS.laneNS, AR_ROADS.laneE], ardennesHeight, rand, AR_LANE_HALF, snowRoadTex, 0.04);

  // ── 建筑：中心村（比利时组） + 林间农舍 ──
  const tb = createKitPlacer(ctx, des, { groundY: ardennesHeight, rand });
  for (const h of AR_VILLAGE_HOUSES) tb.placeKit(h.key, h.x, h.z, h.rot, { scale: EU_SCALE });
  for (const f of AR_FARMS) tb.placeKit(f.key, f.x, f.z, f.rot, { scale: EU_SCALE });
  for (const [x1, z1, x2, z2] of [[-105, 30, -88, 24], [10, 100, 34, 106], [-60, -34, -38, -42], [-316, -488, -296, -496]]) {
    tb.fenceRun(x1, z1, x2, z2);
  }
  // 村内柴堆/原木（冬日取暖意象）
  tb.placeKit('wood_log', -60, 60, 40, { collide: false });
  tb.placeKit('wood_log', 22, 70, 100, { collide: false });
  tb.placeKit('wood_log', 440, 512, 20, { collide: false });

  // ── 雪树模板（snow_trees_pack 拆分；材质转 alphaTest 免密林排序错乱；底面归零 + 平面居中） ──
  const snowT = new Map();
  splitTownKit(ctx.assets.snow_trees, snowT);
  const SNOW_MAP = {
    snowpine: 'snowtree', snowbare: 'TreeBareTall', snowdead: 'deadtreehero', snowdead2: 'deadtreewide',
    snowbush1: 'snowbush1', snowbush2: 'snowbush2',
  };
  for (const [type, node] of Object.entries(SNOW_MAP)) {
    const t = snowT.get(node);
    if (!t) { console.warn('[ardennes] 缺雪树模板', node); continue; }
    prepFlora(t);
    t.position.set(0, 0, 0);            // 拆掉原布局位移（保留自带比例/旋转）
    t.updateMatrixWorld(true);
    t.traverse(o => {
      if (!o.isMesh) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { m.transparent = false; m.alphaTest = 0.4; m.depthWrite = true; }
    });
    const box = new THREE.Box3().setFromObject(t);
    const g2 = new THREE.Group();       // 包裹层：子件反移使包围盒底面归零、平面居中
    t.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    g2.add(t);
    tb.flora[type] = g2;
  }

  // ── 雪地松树包（snowy_pine_trees-pak：T1/T2/T3 三款高大松；同雪树处理管线） ──
  {
    const p2T = new Map();
    splitTownKit(ctx.assets.snowy_pines, p2T);
    // 包结构：RootNode > Tree_Pine_Snowy（带 -90°X 旋转）> T1/T2/T3——深层子件按 matrixWorld 反解成独立模板
    const pack = p2T.get('Tree_Pine_Snowy') || p2T.values().next().value;
    const P2_MAP = { pine2_t1: 'Tree_Pine_Snowy_T1', pine2_t2: 'Tree_Pine_Snowy_T2', pine2_t3: 'Tree_Pine_Snowy_T3' };
    if (pack) pack.updateMatrixWorld(true);
    for (const [type, node] of Object.entries(P2_MAP)) {
      let src = null;
      if (pack) for (const c of pack.children) { if (c.name === node) { src = c; break; } }
      if (!src) { console.warn('[ardennes] 缺松树模板', node); continue; }
      const t = src.clone(true);
      src.matrixWorld.decompose(t.position, t.quaternion, t.scale);   // 保留父链旋转/缩放
      prepFlora(t);
      t.position.set(0, 0, 0);
      t.updateMatrixWorld(true);
      t.traverse(o => {
        if (!o.isMesh) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          m.transparent = false; m.alphaTest = 0.4; m.depthWrite = true;
          // 针叶贴图暖黄烘焙色 → 冷蓝灰中和（与雪树包/雪原色调统一；该材质仅本包使用）
          m.color.set(0x93a8ba);
        }
      });
      const box = new THREE.Box3().setFromObject(t);
      const g2 = new THREE.Group();
      t.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      g2.add(t);
      tb.flora[type] = g2;
    }
  }

  // ── 巨石包模板（rocas：8 款大块石；固态障碍，挡坦克挡炮弹可炮毁——与库尔斯克巨石同管线） ──
  const rocaT = new Map();
  splitTownKit(ctx.assets.rocas, rocaT);
  const rocaTemplates = [];
  for (const [, t] of rocaT) {
    t.position.set(0, 0, 0);
    t.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(t);
    const g2 = new THREE.Group();
    t.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    g2.add(t);
    rocaTemplates.push(g2);
  }

  // ── 木电线杆模板（psx；pylon01 规则：可压倒、炮弹穿过、无碰撞） ──
  {
    const poleT = new Map();
    splitTownKit(ctx.assets.pole_psx, poleT);
    const tp = poleT.get('Pole') || poleT.values().next().value;
    if (tp) tb.templates.set('pylon01', tp);
    else console.warn('[ardennes] 缺电线杆模板');
  }

  // ── 森林斑块：网格抖动散点 + 边缘羽化；避路/村/出生带/溪 ──
  const roadD = (x, z) => Math.min(arMainDist(x, z), arLaneDist(x, z));
  const inSpawn = (x, z) => Math.abs(x) > 655 && Math.abs(z) < 260;
  let treeCount = 0;
  for (const p of AR_FOREST) {
    const [cx, cz, rx, rz] = p;
    const R = Math.max(rx, rz), spacing = 11.5;
    for (let gx = cx - R; gx <= cx + R; gx += spacing) {
      for (let gz = cz - R; gz <= cz + R; gz += spacing) {
        const jx = gx + (rand() - 0.5) * spacing * 0.9, jz = gz + (rand() - 0.5) * spacing * 0.9;
        const core = inPatch(jx, jz, p);
        if (!core) continue;
        if (rand() > core * p[5] * 1.15) continue;    // 边缘羽化衰减
        if (roadD(jx, jz) < 10) continue;
        if (Math.hypot(jx - AR_VILLAGE.x, jz - AR_VILLAGE.z) < AR_VILLAGE.r + 12) continue;
        if (inSpawn(jx, jz)) continue;
        if (arDist(jx, jz, AR_CREEK.pts) < 8) continue;
        // 树种混配：雪地松包 45%（T1/T2/T3 高大松）/ 雪树包雪杉 30% / 枯树 25%
        const r = rand();
        const type = r < 0.15 ? 'pine2_t1' : r < 0.30 ? 'pine2_t2' : r < 0.45 ? 'pine2_t3'
          : r < 0.75 ? 'snowpine' : r < 0.88 ? 'snowbare' : r < 0.96 ? 'snowdead' : 'snowdead2';
        const s = type === 'pine2_t1' ? 0.9 + rand() * 0.3      // 原生 10.5m → 9.5~13.7m
          : type === 'pine2_t2' ? 0.55 + rand() * 0.2           // 原生 19m → 10.4~14.3m
          : type === 'pine2_t3' ? 0.75 + rand() * 0.25          // 原生 12.7m → 9.5~15.9m
          : type === 'snowpine' ? 0.5 + rand() * 0.22
          : type === 'snowbare' ? 0.45 + rand() * 0.2
          : 0.35 + rand() * 0.15;
        tb.collectInst(type, jx, jz, rand() * 360, s);
        treeCount++;
      }
    }
  }
  console.log('[ardennes] 雪树', treeCount);

  // ── 村/农舍配树：每栋 1~2 棵积雪树（生活感 + 村落软遮蔽；避路 8m/避建筑本体） ──
  const yardTree = (hx, hz) => {
    const n = 1 + (rand() < 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, rr = 9 + rand() * 6;
      const x = hx + Math.cos(a) * rr, z = hz + Math.sin(a) * rr;
      if (roadD(x, z) < 8) continue;
      if (world.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 2)) continue;
      const r = rand();
      const type = r < 0.35 ? 'pine2_t1' : r < 0.55 ? 'pine2_t3' : r < 0.8 ? 'snowpine' : 'snowbare';
      const s = type === 'pine2_t1' ? 0.55 + rand() * 0.15 : type === 'pine2_t3' ? 0.45 + rand() * 0.15
        : type === 'snowpine' ? 0.42 + rand() * 0.15 : 0.4 + rand() * 0.14;
      tb.collectInst(type, x, z, rand() * 360, s);   // 宅旁树比林内小一号
      treeCount++;
    }
  };
  for (const h of AR_VILLAGE_HOUSES) yardTree(h.x, h.z);
  for (const f of AR_FARMS) yardTree(f.x, f.z);

  // ── 森林软视线遮挡（点亮模型：斑块 = 几片圆形遮挡；炮弹/移动不受限） ──
  for (const p of AR_FOREST) {
    const [cx, cz, rx, rz, rot] = p;
    const topY = ardennesHeight(cx, cz) + 14;
    world.addSightBlocker({ x: cx, z: cz, r: Math.min(rx, rz) * 0.8, topY });
    if (Math.max(rx, rz) > 200) {   // 大斑块沿长轴加卫星圈
      const a = (rot || 0) * Math.PI / 180;
      const ux = Math.cos(a), uz = -Math.sin(a);
      for (const sgn of [-1, 1]) {
        const sx = cx + ux * rx * 0.55 * sgn, sz = cz + uz * rx * 0.55 * sgn;
        world.addSightBlocker({ x: sx, z: sz, r: Math.min(rx, rz) * 0.55, topY: ardennesHeight(sx, sz) + 14 });
      }
    }
  }

  // ── 雪灌木（林缘/空地散点；软遮挡密度低，炮弹穿过、履带可压） ──
  for (let i = 0; i < 140; i++) {
    const x = (rand() - 0.5) * size * 0.9, z = (rand() - 0.5) * size * 0.9;
    if (roadD(x, z) < 8 || inSpawn(x, z)) continue;
    if (Math.hypot(x - AR_VILLAGE.x, z - AR_VILLAGE.z) < AR_VILLAGE.r) continue;
    tb.collectInst(rand() < 0.5 ? 'snowbush1' : 'snowbush2', x, z, rand() * 360, 0.9 + rand() * 0.5);
  }

  // ── 巨石（rocas 包：固态障碍掩体，挡坦克挡炮弹可炮毁；脊线露头点 + 空地散布） ──
  if (rocaTemplates.length) {
    const spots = AR_ROCKS.map(([x, z]) => [x, z]);
    for (let i = 0; i < 10; i++) spots.push([(rand() - 0.5) * size * 0.85, (rand() - 0.5) * size * 0.85]);
    let placed = 0;
    for (const [x, z] of spots) {
      if (placed >= 14) break;
      if (roadD(x, z) < 12 || inSpawn(x, z)) continue;
      if (Math.hypot(x - AR_VILLAGE.x, z - AR_VILLAGE.z) < AR_VILLAGE.r + 15) continue;
      if (AR_FOREST.some(p => inPatch(x, z, p) > 0.55)) continue;   // 深林内不放（林缘可）
      if (world.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 8)) continue;
      const m = rocaTemplates[(rand() * rocaTemplates.length) | 0].clone(true);
      const s2 = 0.8 + rand() * 0.5;
      m.scale.setScalar(s2);
      m.rotation.y = rand() * Math.PI * 2;
      m.position.set(x, ardennesHeight(x, z), z);
      root.add(m);
      m.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(m);
      des.registerGroup({
        type: 'boulder', group: m, cx: x, cz: z, r: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2,
        w: bb.max.x - bb.min.x, dp: bb.max.z - bb.min.z,
        height: bb.max.y - bb.min.y, y0: bb.min.y,
        rule: { hp: 5, rubbleH: 0.6 },   // 巨石：5 发炮毁，掩体价值高
        obstacleKind: 'rock', obstacleK: 0.78, ellipsoid: true,   // 单一碰撞体；炮弹内切椭球判定
      });
      placed++;
    }
    console.log('[ardennes] 巨石', placed);
  }

  // ── 木电线杆沿主路（psx 杆 + 顺路电线；pylon01 规则：可压倒、炮弹穿过、无碰撞） ──
  if (tb.templates.has('pylon01')) {
    const POLE_SCALE = 0.38, POLE_SPAN = 52, POLE_OFF = 7.2;
    const tips = [];
    const pts = AR_ROADS.main;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1];
    for (let s0 = 26; s0 < total - 10; s0 += POLE_SPAN) {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s0) i++;
      const t = (s0 - cum[i - 1]) / (cum[i] - cum[i - 1]);
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
      const ux = dx / L, uz = dz / L;
      const x = ax + dx * t - uz * POLE_OFF, z = az + dz * t + ux * POLE_OFF;   // 路北侧单排
      const yawDeg = Math.atan2(-uz, ux) * 180 / Math.PI;   // 横担顺路（与 fenceRun 同约定）
      tb.placeKit('pylon01', x, z, yawDeg, { scale: POLE_SCALE });
      tips.push({ x, z });
    }
    // 不拉电线（用户定）：杆子可自然压倒，无需处理线的悬空/联动
    console.log('[ardennes] 电线杆', tips.length);
  }
  // 伐倒原木（伐木场意象）
  for (let i = 0; i < 10; i++) {
    const p = AR_FOREST[(rand() * AR_FOREST.length) | 0];
    const a = rand() * Math.PI * 2, rr = Math.max(p[2], p[3]) * (1.05 + rand() * 0.2);
    const x = p[0] + Math.cos(a) * rr, z = p[1] + Math.sin(a) * rr;
    if (roadD(x, z) < 9 || inSpawn(x, z)) continue;
    tb.collectInst('wood_log', x, z, rand() * 360, 1);
  }

  // ── 界外雪林剪影：treeline 平卡弃用（贴图底部为不透明白色雪地带，alphaTest 裁不掉，近看是白墙；
  //    0.0024 大雾已包住边界，无需剪影） ──

  // ── 飘雪（相机跟随循环雪幕；主循环 battle 态驱动） ──
  world.snowfall = new Snowfall(root);

  buildInstancedProps(des, tb.instData, tb.templates, tb.flora, root);
  tb.finalizeBatch();

  // ── 高度采样：基础地形 + 废墟坡度场 + 雪路抬高 ──
  world.setGroundY((x, z) => ardennesHeight(x, z) + des.rubbleHeightAt(x, z) +
    (world.surfaceY ? world.surfaceY(x, z) : 0));
}

// ── 路网注册表（minimap 底图绘制用；与建图共用同源折线） ──
export const MAP_ROADS = {
  kursk: ROADS.map(pts => ({ pts, half: ROAD_HALF })),
  normandy: [...N2_ROADS.map(pts => ({ pts, half: N2_ROAD_HALF })),
             ...N2_LANES.map(pts => ({ pts, half: LANE_HALF }))],
  prokhorovka: [{ pts: PK_ROADS.main, half: PK_ROAD_HALF }, { pts: PK_ROADS.east, half: 3 }, { pts: PK_ROADS.south, half: 3 }],
  ardennes: [{ pts: AR_ROADS.main, half: AR_ROAD_HALF }, { pts: AR_ROADS.laneNS, half: AR_LANE_HALF }, { pts: AR_ROADS.laneE, half: AR_LANE_HALF }],
};



