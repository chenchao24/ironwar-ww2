// ═══ 阿登森林布局数据模块（纯 JS 无 three 依赖）：maps.js 建图 / 核对图共用 ═══
// 1944-12 突出部战役——阿登高原雪林：
//   · 1600×1600m（x/z ±800），出生 = 东西两侧矩形带（主路两端）
//   · 地形骨架 = 两条南北向山脊（西脊/东脊）+ 北部东西向脊，中央宽谷走人行车
//   · 森林斑块覆盖 ~45%（坡地为主），林间空地与村落 = 遭遇战口袋
//   · 积雪地面：越野减速，主路/林道压实雪略快；大雾低云（视距 ~600m）

// ── 路网（主路东西向沿谷蜿蜒过村；两条南北林道） ──
export const AR_ROADS = {
  main: [[-800, 150], [-660, 110], [-540, 150], [-420, 100], [-300, 130], [-180, 80], [-60, 55], [40, 70], [160, 30], [280, 60], [400, 20], [520, 50], [660, 10], [800, 40]],
  laneNS: [[-60, -800], [-30, -600], [-70, -430], [-30, -280], [-55, -140], [-20, -30], [-35, 120], [-5, 260], [-45, 420], [-15, 580], [-50, 800]],
  laneE: [[430, -800], [390, -610], [440, -450], [400, -280], [450, -120], [410, 60], [455, 230], [420, 400], [460, 580], [430, 800]],
};
export const AR_ROAD_HALF = 4.5;    // 主路半宽
export const AR_LANE_HALF = 3.2;    // 林道半宽

// ── 山脊（高度场参数；along 'z' = 南北向脊，轴线 x = c + wave·sin(z·freq+phase)） ──
export const AR_RIDGES = [
  { along: 'z', c: -380, wave: 70, freq: 0.0038, phase: 0.7, amp: 10, width: 250 },   // 西脊
  { along: 'z', c: 400, wave: 60, freq: 0.0032, phase: 2.1, amp: 11, width: 260 },    // 东脊
  { along: 'x', c: -560, wave: 50, freq: 0.0030, phase: 1.2, amp: 7, width: 210 },    // 北部东西脊
];

// ── 雪溪（浅谷下切；林道过溪处即涉渡点） ──
export const AR_CREEK = {
  pts: [[-800, 370], [-620, 340], [-450, 385], [-280, 355], [-100, 390], [80, 360], [260, 395], [440, 365], [620, 400], [800, 375]],
  depth: 3.2, half: 11, slopeW: 24,
};

// ── 中心村（主路 × 南北林道十字口；比利时房模组） ──
export const AR_VILLAGE = { x: -20, z: 55, r: 85 };
export const AR_VILLAGE_HOUSES = [
  // 主路北侧（门朝南向路）
  { key: 'eu_nivelles_h1', x: -95, z: 38, rot: 95 },
  { key: 'eu_mons_shop', x: -45, z: 34, rot: 92 },
  { key: 'eu_nivelles_h5', x: 8, z: 48, rot: 88 },
  // 主路南侧（门朝北向路）
  { key: 'eu_nivelles_h2', x: -72, z: 84, rot: 272 },
  { key: 'eu_feluy', x: -14, z: 90, rot: 268 },
  { key: 'eu_nivelles_h4', x: 38, z: 94, rot: 275 },
  // 南北林道两侧（村北段）
  { key: 'eu_romedenne', x: -56, z: -22, rot: 8 },
  { key: 'eu_nivelles_h9', x: -2, z: -12, rot: 178 },
];
// 林间农舍点（次级掩体）
export const AR_FARMS = [
  { key: 'eu_romeree', x: -350, z: -520, rot: 30 },
  { key: 'eu_laval', x: -306, z: -498, rot: 210 },
  { key: 'eu_moncontour', x: 420, z: 520, rot: 160 },
  { key: 'eu_nivelles_h6', x: 462, z: 500, rot: 340 },
];

// ── 森林斑块（椭圆：[cx, cz, rx, rz, rotDeg, 密度]；坡地为主，空地即战场） ──
export const AR_FOREST = [
  [-430, -380, 290, 250, 15, 1.00],    // 西脊北段（大林）
  [-480, 280, 250, 270, -10, 1.00],    // 西脊南段（大林）
  [470, -350, 270, 230, -12, 1.00],    // 东脊北段（大林）
  [520, 300, 250, 260, 8, 1.00],       // 东脊南段（大林）
  [-150, -620, 260, 160, 5, 0.95],     // 北脊西
  [250, -600, 240, 170, -6, 0.95],     // 北脊东
  [-620, 620, 210, 170, 0, 0.90],      // 西南角
  [560, 620, 230, 170, 0, 0.90],       // 东南角
  [-250, -140, 120, 95, 20, 0.85],     // 村西北口袋（伏击位）
  [200, 200, 110, 85, -15, 0.85],      // 村东南口袋（伏击位）
  [100, 600, 190, 130, 0, 0.85],       // 溪南中块
  [-60, -330, 100, 80, 10, 0.80],      // 林道西小口袋
];

// ── 出生带（东西两侧矩形带，主路两端；间距 ~1400m） ──
export const AR_SPAWNS = {
  a: { x0: -775, z0: -180, x1: -700, z1: 180 },   // 西（玩家）
  b: { x0: 700, z0: -180, x1: 775, z1: 180 },     // 东（敌方）
};

// ── 岩石（脊线露头，雪盖玄武岩感） ──
export const AR_ROCKS = [
  [-380, -150], [-420, 120], [350, -80], [430, 180],
  [150, -500], [-80, 540], [600, -150], [-600, -300],
];

// ── 距折线最近距离（mapdata-prokhorovka 同式，模块自足） ──
export function distToPolyline(x, z, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[i + 1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

// ── 雪溪下切量（供高度场） ──
export function creekCarve(x, z) {
  const d = distToPolyline(x, z, AR_CREEK.pts);
  const full = AR_CREEK.half * 0.45;
  const edge = AR_CREEK.half + AR_CREEK.slopeW;
  return AR_CREEK.depth * (1 - sstep3(d, full, edge));
}

// ── 椭圆斑块内测（rotDeg 旋转；返回 0..1 核心度，边缘羽化由调用方做密度衰减） ──
export function inPatch(x, z, p) {
  const [cx, cz, rx, rz, rot] = p;
  const a = (rot || 0) * Math.PI / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const lx = (x - cx) * c + (z - cz) * s, lz = -(x - cx) * s + (z - cz) * c;
  const d = (lx / rx) * (lx / rx) + (lz / rz) * (lz / rz);
  return d >= 1 ? 0 : 1 - Math.sqrt(d);   // 0=外，→1=核心
}

function sstep3(v, a, b) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
