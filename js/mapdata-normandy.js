// ═══ 诺曼底 v2 布局数据模块（纯 JS 无 three 依赖）：maps.js 建图 / scripts/norm-plan-v2.mjs 出图共用 ═══
// 布局来源：用户手绘稿 + 三轮反馈定稿：
//   · 小镇：以 R1×R2 丁字口 (-380,50) 为西南角，紧凑块（x -370..-80 / z -280..30），镇内小路自由形状 + 硬化广场
//   · 田地：分区网格切块（zone 内行列分割，共享边无重叠），邻路边换成路形偏移链（随路形）
//   · 树篱：内圈田每块 ≤2 条边（70% 覆盖留缺口）；外圈田（临缘带）零星点缀 1 短段；篱上穿插树木
//   · 缘带：距图缘 60~80m 草场，只零星树木。主公路不动。改布局只改这里。

// ── 路网（主公路 ×3，不动） ──
export const N2_ROADS = [
  [[30, -1000], [-40, -840], [-130, -670], [-240, -490], [-310, -340], [-360, -190], [-380, -50], [-370, 150], [-400, 350], [-420, 550], [-430, 750], [-410, 1000]],
  [[-380, 50], [-200, 62], [0, 70], [200, 55], [350, 35], [550, 40], [750, 48], [1000, 58]],
  [[350, 30], [480, -100], [620, -240], [760, -350], [880, -440], [1000, -520]],
];
// ── 镇内小路（自由形状，仅供镇内交通；两端搭主路） ──
export const N2_LANES = [
  [[-362, -190], [-250, -196], [-120, -186]],       // 北横巷
  [[-252, -192], [-246, -110], [-240, -20], [-234, 40]],   // 纵巷（北横巷→主街）
  [[-366, -64], [-300, -70], [-248, -74]],          // 西支巷（R1→纵巷）
];
export const ROAD_HALF = 5;
export const LANE_HALF = 2.5;
export const N2_PLAZA = { x: -208, z: -104, w: 46, d: 36, rot: 4 };   // 镇内硬化广场
export const N2_TOWN = { x: -230, z: -110, r: 200 };                  // 镇域参考圈

// ── 欧洲小镇组模型尺寸表（宽×深，opt 实测；详见 docs/europe-city-buildings.md） ──
// EU_SCALE：用户实测房屋普遍偏大 ~20%（对比门窗比例）→ 全线 ×0.8；
// 2026-09-18 用户复看偏小 → ×1.1 回调至 0.88。frontage 间距/碰撞/平面图/压路校验全部由本系数派生
export const EU_SCALE = 0.88;
export const EU_SIZE = {
  eu_le_mans_row: [20.1, 10.8], eu_le_mans_corner: [22.2, 7.5], eu_le_mans_c1b: [15.5, 7.5],
  eu_le_mans_filler: [4.3, 7.6], eu_le_mans_h2: [16.2, 15.5],
  eu_mons_shop: [16.2, 15.2], eu_angers_shop: [10.0, 15.3],
  eu_nivelles_c1: [19.3, 7.3], eu_nivelles_c2: [7.3, 7.3],
  eu_nivelles_h1: [10.0, 8.5], eu_nivelles_h2: [12.1, 16.4], eu_nivelles_h4: [8.1, 14.8],
  eu_nivelles_h5: [8.0, 9.3], eu_nivelles_h6: [20.0, 7.4], eu_nivelles_h7: [16.0, 12.6],
  eu_nivelles_h9: [9.9, 12.2],
  eu_bourges_h1: [11.3, 23.5], eu_bourges_h2: [7.4, 15.4],
  eu_dijon: [8.0, 12.2], eu_laval: [8.0, 11.1], eu_fumay: [6.4, 8.3],
  eu_moncontour: [6.5, 11.5], eu_chatelaudren: [7.2, 13.8],
  eu_romedenne: [7.3, 12.2], eu_romeree: [11.8, 8.8], eu_feluy: [8.0, 9.0],
  eu_troyes_corner: [7.5, 7.4], eu_troyes_house3: [8.1, 7.4], eu_york_corner: [7.5, 15.3],
};

// ── eu 键 → GLB 文件（otherModel/EuropeCity/opt/；main.js PROPS 加载用） ──
export const EU_FILES = {
  eu_le_mans_row: 'le_mans_house_1_row.glb',
  eu_le_mans_corner: 'le_mans_corner.glb',
  eu_le_mans_c1b: 'le_mans_corner_house_1_b_france.glb',
  eu_le_mans_filler: 'le_mans_filler_house_1.glb',
  eu_le_mans_h2: 'le_mans_house_2_france.glb',
  eu_mons_shop: 'mons_shop_2_belgium.glb',
  eu_angers_shop: 'angers_shop_2_france.glb',
  eu_nivelles_c1: 'nivelles_corner_house_1_belgium.glb',
  eu_nivelles_c2: 'nivelles_corner_house_2_belgium.glb',
  eu_nivelles_h1: 'nivelles_house_1_belgium.glb',
  eu_nivelles_h2: 'nivelles_house_2_belgium.glb',
  eu_nivelles_h4: 'nivelles_house_4_belgium.glb',
  eu_nivelles_h5: 'nivelles_house_5_belgium.glb',
  eu_nivelles_h6: 'nivelles_house_6_belgium.glb',
  eu_nivelles_h7: 'nivelles_house_7_belgium.glb',
  eu_nivelles_h9: 'nivelles_house_9_belgium.glb',
  eu_bourges_h2: 'bourges_house_2_france.glb',
  eu_dijon: 'dijon_house_1_france.glb',
  eu_laval: 'laval_house_1_france.glb',
  eu_fumay: 'fumay_house_1_france.glb',
  eu_moncontour: 'moncontour_house_1_france.glb',
  eu_chatelaudren: 'chatelaudren_filler_shop_1_france.glb',
  eu_romedenne: 'romedenne_house_1_belgium.glb',
  eu_romeree: 'romeree_house_1_belgium.glb',
  eu_feluy: 'feluy_village_house_1_belgium.glb',
  eu_troyes_corner: 'troyes_corner_shop_1_france.glb',
  eu_troyes_house3: 'troyes_house_3_france.glb',
  eu_york_corner: 'york_corner_shop_1.glb',
};

// ── 小镇（紧凑连续沿街立面：同组贴缝 0.8m，组间小巷 6~9m；模型正面=局部+Z 朝向街） ──
function frontage(out, ax, az, bx, bz, side, keys, s0 = 0, halfW = LANE_HALF, gap = 0.8) {
  const dx = bx - ax, dz = bz - az;
  const L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L;
  const nx = -uz * side, nz = ux * side;
  let cur = s0;
  for (const k of keys) {
    const [w0, d0] = EU_SIZE[k];
    const w = w0 * EU_SCALE, d = d0 * EU_SCALE;
    const off = halfW + d / 2 + 1.2;
    const x = ax + ux * (cur + w / 2) + nx * off;
    const z = az + uz * (cur + w / 2) + nz * off;
    const rot = Math.atan2(-nx, -nz) * 180 / Math.PI;
    out.push({ key: k, x: +x.toFixed(1), z: +z.toFixed(1), rot: +rot.toFixed(1) });
    cur += w + gap;
  }
  return cur;
}

// ── 压路校验：建筑旋转包围盒（四角+中心）到主路/小路中心线距离须 ≥ 路半宽+0.6m。
//    不满足时沿「最近路点→角点」方向外推（垂直离路，frontage 参照线与真实路形微偏也能兜住） ──
function _nearestOnRoads(roads, x, z) {
  let best = Infinity, bx = 0, bz = 0;
  for (const line of roads) {
    for (let i = 0; i < line.length - 1; i++) {
      const [x1, z1] = line[i], [x2, z2] = line[i + 1];
      const dx = x2 - x1, dz = z2 - z1;
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
      const px = x1 + dx * t, pz = z1 + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bx = px; bz = pz; }
    }
  }
  return { d: best, x: bx, z: bz };
}
function validateHouses(H) {
  for (const h of H) {
    const [w0, d0] = EU_SIZE[h.key];
    const hw = w0 * EU_SCALE / 2, hd = d0 * EU_SCALE / 2;
    const yaw = h.rot * Math.PI / 180, cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let iter = 0; iter < 8; iter++) {
      let need = 0, worstRoads = null;
      for (const [cx, cz] of [[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd], [0, 0]]) {
        const wx = h.x + cy * cx + sy * cz, wz = h.z - sy * cx + cy * cz;
        const r = _nearestOnRoads(N2_ROADS, wx, wz);
        const l = _nearestOnRoads(N2_LANES, wx, wz);
        const nr = ROAD_HALF + 0.6 - r.d, nl = LANE_HALF + 0.6 - l.d;
        if (nr > need) { need = nr; worstRoads = N2_ROADS; }
        if (nl > need) { need = nl; worstRoads = N2_LANES; }
      }
      if (!worstRoads) break;
      // 外推方向取建筑中心所属侧（中心 → 最近路点），避免角点过线后被推到对侧排屋
      const c0 = _nearestOnRoads(worstRoads, h.x, h.z);
      let dx = h.x - c0.x, dz = h.z - c0.z;
      const dl = Math.hypot(dx, dz);
      if (dl < 0.5) { dx = -sy; dz = -cy; }   // 中心骑线：退化为背街方向
      else { dx /= dl; dz /= dl; }
      h.x = +(h.x + dx * (need + 0.1)).toFixed(1);
      h.z = +(h.z + dz * (need + 0.1)).toFixed(1);
    }
  }
  return H;
}

function buildTown() {
  const H = [];
  const L1 = [[-362, -190], [-120, -186]];
  const L2 = [[-252, -192], [-234, 40]];
  const L3 = [[-366, -64], [-248, -74]];
  // 主街参照线 = 真实 R2 中心线（镇段两折点；此前用近似线导致南排骑路）
  const R2N = [[-360, 51.3], [-200, 62]];      // 北排用（=R2 实测中心线）
  const R2S = [[-320, 54.0], [-110, 66.4]];    // 南排用
  // 主街北排（镇南立面，大店；首件用矩形双面可观的 le_mans_row——le_mans_corner 是 L 形，内角素面会露在西端）
  frontage(H, ...R2N[0], ...R2N[1], -1, ['eu_le_mans_row', 'eu_angers_shop', 'eu_nivelles_h6'], 6, ROAD_HALF, 1.2);
  frontage(H, ...R2N[0], ...R2N[1], -1, ['eu_le_mans_row', 'eu_nivelles_h1', 'eu_dijon'], 62, ROAD_HALF, 1.2);
  frontage(H, ...R2N[0], ...R2N[1], -1, ['eu_nivelles_h4', 'eu_le_mans_h2', 'eu_fumay'], 122, ROAD_HALF, 1.2);   // h2 与 h4 对调：h2（最深 16.4m）离开纵巷北端夹缝，0.88 缩放下该位外推不收敛
  H.push({ key: 'eu_mons_shop', x: -96, z: 30, rot: 172 });          // 地标大楼（主街东端）
  // 北横巷两排
  frontage(H, ...L1[0], ...L1[1], -1, ['eu_nivelles_h4', 'eu_dijon', 'eu_laval'], 8);
  frontage(H, ...L1[0], ...L1[1], -1, ['eu_moncontour', 'eu_nivelles_h5', 'eu_troyes_house3', 'eu_feluy'], 50);
  frontage(H, ...L1[0], ...L1[1], -1, ['eu_nivelles_h1', 'eu_romedenne', 'eu_bourges_h2'], 100);
  frontage(H, ...L1[0], ...L1[1], 1, ['eu_nivelles_h9', 'eu_le_mans_filler', 'eu_fumay'], 14);
  frontage(H, ...L1[0], ...L1[1], 1, ['eu_nivelles_h4', 'eu_romedenne', 'eu_chatelaudren'], 58);
  frontage(H, ...L1[0], ...L1[1], 1, ['eu_troyes_house3', 'eu_dijon', 'eu_nivelles_h5'], 104);
  // 纵巷两排（中段西侧让广场）
  frontage(H, ...L2[0], ...L2[1], 1, ['eu_troyes_corner', 'eu_nivelles_h4'], 6);
  frontage(H, ...L2[0], ...L2[1], 1, ['eu_nivelles_h5', 'eu_dijon'], 120);
  frontage(H, ...L2[0], ...L2[1], -1, ['eu_nivelles_c2', 'eu_bourges_h2'], 8);
  frontage(H, ...L2[0], ...L2[1], -1, ['eu_le_mans_filler', 'eu_nivelles_h1'], 150);
  // 西支巷南排
  frontage(H, ...L3[0], ...L3[1], 1, ['eu_romedenne', 'eu_moncontour', 'eu_feluy'], 6);
  // 街角/端头转角楼
  H.push({ key: 'eu_le_mans_c1b', x: -362, z: 14, rot: 45 });      // 丁字口东北角（离 R1 ≥14m；双面可观）
  H.push({ key: 'eu_troyes_corner', x: -352, z: -200, rot: 100 });
  H.push({ key: 'eu_york_corner', x: -100, z: -196, rot: -95 });
  // 广场北/南侧
  H.push({ key: 'eu_nivelles_h7', x: -196, z: -128, rot: 175 });
  H.push({ key: 'eu_nivelles_h2', x: -196, z: -80, rot: -5 });
  // ── 加密（用户反馈镇区空旷；优先低三角量模型：bourges_h2 279 / feluy 330 / romeree 374 / fumay 382 / romedenne 460） ──
  // 主街南排（与北排对街，参照真实 R2 中心线 R2S；两端用双面可观模型——fumay/feluy/romedenne/romeree 山墙深色素面只能藏进组内）
  frontage(H, ...R2S[0], ...R2S[1], 1, ['eu_le_mans_c1b', 'eu_fumay', 'eu_romedenne'], 8, ROAD_HALF, 1.2);
  frontage(H, ...R2S[0], ...R2S[1], 1, ['eu_feluy', 'eu_romeree', 'eu_nivelles_h6'], 52, ROAD_HALF, 1.2);
  // 巷内补充组（填小巷空隙）
  frontage(H, ...L1[0], ...L1[1], -1, ['eu_romedenne', 'eu_feluy', 'eu_fumay'], 152);
  frontage(H, ...L1[0], ...L1[1], 1, ['eu_bourges_h2', 'eu_romeree', 'eu_moncontour'], 150);
  frontage(H, ...L2[0], ...L2[1], 1, ['eu_fumay', 'eu_romedenne'], 62);
  frontage(H, ...L3[0], ...L3[1], 1, ['eu_bourges_h2', 'eu_fumay'], 48);
  // 街区内部背院填充（低模小宅，错落朝向）
  const INFILL = [
    ['eu_feluy', -318, -150, 40], ['eu_romedenne', -286, -120, -85], ['eu_fumay', -300, -88, 15],
    ['eu_bourges_h2', -160, -150, 175], ['eu_romeree', -140, -110, 85], ['eu_feluy', -176, -52, -40],
    ['eu_romedenne', -128, -160, 95], ['eu_fumay', -330, -110, -50], ['eu_bourges_h2', -268, -52, 130],
  ];
  for (const [key, x, z, rot] of INFILL) H.push({ key, x, z, rot });
  return validateHouses(H);   // 全量压路校验（不足自动背街外推）
}
export const N2_TOWN_HOUSES = buildTown();

// ── 路灯（主街两侧 + 巷口/广场；杆件位置，maps.js 程序化建模） ──
export const N2_LAMPS = (() => {
  const pts = [];
  // 主街 R2 镇段（z≈50+((x+380)*0.066)，两侧交错，间距 ~40m）
  for (let i = 0, x = -345; x <= -110; x += 40, i++) {
    const side = i % 2 === 0 ? -1 : 1;
    pts.push({ x, z: 50 + (x + 380) * 0.066 + side * 6.5, rot: side < 0 ? 0 : 180 });
  }
  // 巷口/广场
  pts.push({ x: -258, z: -186, rot: 90 });    // 纵巷北口
  pts.push({ x: -228, z: -44, rot: -90 });    // 纵巷南口（主街角）
  pts.push({ x: -186, z: -126, rot: 90 });    // 广场东北
  pts.push({ x: -360, z: -184, rot: 0 });     // 北横巷西口
  return pts;
})();

// ── 镇内宅旁小灌木（屋侧/屋后 85% 概率 + 25% 第二处，len 4~7m 矮篱段，走 buildBocage 矮模板） ──
export function buildYardBushes(rand) {
  const pieces = [];
  const addOne = (h, w, d, yaw) => {
    const back = rand() < 0.6;
    const ox = back ? (rand() - 0.5) * w : (rand() < 0.5 ? -w : w);
    const oz = back ? d + rand() * 2 : (rand() - 0.5) * d;
    const x = h.x + Math.sin(yaw) * oz + Math.cos(yaw) * ox;
    const z = h.z + Math.cos(yaw) * oz - Math.sin(yaw) * ox;
    pieces.push({ x, z, yaw: yaw + (rand() - 0.5) * 0.6, len: 4 + Math.floor(rand() * 4) });
  };
  for (const h of N2_TOWN_HOUSES) {
    if (rand() > 0.85) continue;
    const [w0, d0] = EU_SIZE[h.key];
    const w = w0 * EU_SCALE / 2 + 1.8, d = d0 * EU_SCALE / 2 + 1.8;
    const yaw = h.rot * Math.PI / 180;
    addOne(h, w, d, yaw);
    if (rand() < 0.25) addOne(h, w, d, yaw);
  }
  return pieces;
}

// ── 镇内绿化树（广场角/巷口/院角/屋后，加密） + 镇外围绿带（灌木+树木环，衔接田野） ──
export const N2_TOWN_TREES = [
  [-184, -88], [-232, -122], [-186, -130], [-252, -30],
  [-364, 36], [-118, -178], [-304, -196], [-148, -44],
  // 加密（用户反馈镇内树少）
  [-336, -140], [-278, -164], [-214, -64], [-166, -96],
  [-346, -56], [-124, -130], [-288, -36], [-238, -158],
];
export function buildOutskirts(rand) {
  const bushes = [], trees = [];
  const CX = N2_TOWN.x, CZ = N2_TOWN.z;
  // 环带 r 205~275：灌木段 + 树，绕镇一圈（路北/路南跳过主路 ±16m）
  for (let a = 0; a < Math.PI * 2; a += 0.24 + rand() * 0.12) {
    const r = 205 + rand() * 70;
    const x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
    if (Math.abs(x) > 960 || Math.abs(z) > 960) continue;
    if (rand() < 0.55) bushes.push({ x, z, yaw: rand() * Math.PI, len: 5 + Math.floor(rand() * 5) });
    else trees.push([x + (rand() - 0.5) * 8, z + (rand() - 0.5) * 8]);
  }
  return { bushes, trees };
}

// ── 折线工具 ──
function polySamples(line, step = 15) {
  const pts = [];
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [x1, z1] = line[i], [x2, z2] = line[i + 1];
    const L = Math.hypot(x2 - x1, z2 - z1);
    const ux = (x2 - x1) / L, uz = (z2 - z1) / L;
    for (let t = (i === 0 ? 0 : step - (acc % step)); t <= L; t += step) {
      pts.push({ x: x1 + ux * t, z: z1 + uz * t, tx: ux, tz: uz, s: acc + t });
    }
    acc += L;
  }
  const [lx, lz] = line[line.length - 1];
  const p2 = pts[pts.length - 1];
  pts.push({ x: lx, z: lz, tx: p2 ? p2.tx : 1, tz: p2 ? p2.tz : 0, s: acc });
  return pts;
}
// 路形偏移链：side=+1 取法线 (-tz,tx) 侧；R1 南行→+1=西/-1=东；R2 东行→+1=南/-1=北；R3 东北行→+1=东南/-1=西北
function offChain(line, side, off, step = 12) {
  return polySamples(line, step).map(p => ({ x: p.x + (-p.tz) * side * off, z: p.z + p.tx * side * off }));
}
// 从链上截取 z∈[z0,z1]（链单调，直接过滤）
function chainZ(chain, z0, z1) { return chain.filter(p => p.z >= z0 && p.z <= z1); }

// ── 田块分区切块（共享边、结构上无重叠；邻路侧为路形链边） ──
// cell = { edges: [pts 数组...], outer: bool }；edges 首尾相接成闭合多边形
export function buildParcels(rand) {
  const [R1, R2, R3] = N2_ROADS;
  const r1w = offChain(R1, 1, ROAD_HALF + 9);    // R1 西缘线
  const r1e = offChain(R1, -1, ROAD_HALF + 9);   // R1 东缘线
  const r2n = offChain(R2, -1, ROAD_HALF + 9);   // R2 北缘线
  const r2s = offChain(R2, 1, ROAD_HALF + 9);    // R2 南缘线
  const r3nw = offChain(R3, -1, ROAD_HALF + 9);  // R3 西北缘线
  const r3se = offChain(R3, 1, ROAD_HALF + 9);   // R3 东南缘线
  const EDGE = 920;        // 田块距图缘 80m（缘带草场）
  const cells = [];
  const J = (a) => a + (rand() - 0.5) * 50;      // 分割线抖动

  // cell 构建器：西直边 xw + 东路形链 ce（z0→z1 上行）或直边
  const cellW2E = (xw, z0, z1, ce, outer) => {
    // ce: 路形链点（z 升序）；多边形：西北→东北(沿链)→东南→西南
    const first = ce[0], last = ce[ce.length - 1];
    cells.push({
      edges: [
        [[xw, z0], [first.x, first.z]],          // 北边
        ce.map(p => [p.x, p.z]),                  // 东边（路形）
        [[last.x, last.z], [xw, z1]],             // 南边
        [[xw, z1], [xw, z0]],                     // 西边
      ], outer: !!outer,
    });
  };
  const rectCell = (x0, z0, x1, z1, outer) => cells.push({
    edges: [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]],
    edgesOut: null, outer: !!outer,
  });
  const isOuterRect = (x0, z0, x1, z1) => x0 <= -860 || x1 >= 860 || z0 <= -860 || z1 >= 860;

  // ── Z1：R1 以西（西直边 -920，东边随 R1 西缘线；8 行 × 2 列） ──
  const zRows1 = [-920, -680, -440, -200, 40, 280, 520, 760, 920];
  for (let r = 0; r < zRows1.length - 1; r++) {
    const z0 = zRows1[r], z1 = zRows1[r + 1];
    const xs = J(-640);
    const chain = chainZ(r1w, z0 + 2, z1 - 2);
    rectCell(-920, z0, xs, z1, isOuterRect(-920, z0, xs, z1));
    if (chain.length >= 2) cellW2E(xs, z0, z1, chain, isOuterRect(xs, z0, chain[chain.length - 1].x, z1));
  }

  // ── Z2：镇北（R1 东缘线 → 东 920；3 行 × 3 列；最东列东南角随 R3 西北缘线） ──
  const zRows2 = [-920, -700, -480, -300];
  for (let r = 0; r < zRows2.length - 1; r++) {
    const z0 = zRows2[r], z1 = zRows2[r + 1];
    const x1 = J(160), x2 = J(560);
    const cw = chainZ(r1e, z0 + 2, z1 - 2);
    // 西列：西随 R1 东缘线（镜像用 cellW2E 的反向：西路链 + 东直边）——直接构造
    if (cw.length >= 2) {
      const first = cw[0], last = cw[cw.length - 1];
      cells.push({ edges: [
        [[first.x, first.z], [x1, z0]],
        [[x1, z0], [x1, z1]],
        [[x1, z1], [last.x, last.z]],
        cw.slice().reverse().map(p => [p.x, p.z]),
      ], outer: isOuterRect(first.x, z0, x1, z1) });
    }
    // 中列（矩形）
    rectCell(x1, z0, x2, z1, isOuterRect(x1, z0, x2, z1));
    // 东列：东边 z>=-520 段随 R3 西北缘线，否则直边 920
    const c3 = chainZ(r3nw, z0, z1);
    if (c3.length >= 2) {
      const first = c3[0], last = c3[c3.length - 1];
      // 多边形：北(x2,z0)→(920,z0) 或链上端… 东链只在行下部存在：简化 = 东北角直边 920，南段随链
      cells.push({ edges: [
        [[x2, z0], [Math.max(last.x, x2 + 40), z0]],
        [[Math.max(last.x, x2 + 40), z0], [last.x, last.z]],
        c3.slice().reverse().map(p => [p.x, p.z]),
        [[first.x, first.z], [x2, z1]],
        [[x2, z1], [x2, z0]],
      ], outer: isOuterRect(x2, z0, 920, z1) });
    } else {
      rectCell(x2, z0, 920, z1, isOuterRect(x2, z0, 920, z1));
    }
  }

  // ── Z2c：镇东北条（镇东缘 -60 → 470，z -290..-140；2 列共享分割） ──
  const xc2c = J(210);
  rectCell(-60, -290, xc2c, -140, false);
  rectCell(xc2c, -290, 470, -140, false);

  // ── Z3：东楔形（R3 东南缘线以北、R2 北缘线以南；x 480→920 链式田） ──
  {
    const n3 = chainZ(r3se, -999, 999).filter(p => p.x >= 480 && p.x <= 905);
    const n2 = r2n.filter(p => p.x >= 480 && p.x <= 905);
    if (n3.length >= 2 && n2.length >= 2) {
      // 按 x 切成 3 块：480..620..760..905
      const cuts = [480, J(620), J(760), 905];
      for (let i = 0; i < 3; i++) {
        const xa = cuts[i], xb = cuts[i + 1];
        const top = n3.filter(p => p.x >= xa && p.x <= xb);
        const bot = n2.filter(p => p.x >= xa && p.x <= xb);
        if (top.length < 2 || bot.length < 2) continue;
        cells.push({ edges: [
          top.map(p => [p.x, p.z]),
          [[top[top.length - 1].x, top[top.length - 1].z], [bot[bot.length - 1].x, bot[bot.length - 1].z]],
          bot.slice().reverse().map(p => [p.x, p.z]),
          [[bot[0].x, bot[0].z], [top[0].x, top[0].z]],
        ], outer: false });
      }
    }
  }

  // ── Z4：南部（R2 南缘线以南、R1 东缘线以东、东 920、南 920；3 行 × 3 列） ──
  const zRows4 = [null, 520, 800, 920];   // 首行北边随 R2 南缘线
  for (let r = 0; r < 3; r++) {
    const z1 = zRows4[r + 1];
    const x1 = J(150), x2 = J(470);
    if (r === 0) {
      // 北边随 R2 南缘线（按 x 截取各列）
      const cols = [[null, x1], [x1, x2], [x2, 905]];
      for (const [xa, xb] of cols) {
        const top = r2s.filter(p => p.x >= (xa ?? -420) + 5 && p.x <= xb - 5);
        if (top.length < 2) continue;
        const t0 = top[0], t1 = top[top.length - 1];
        if (xa === null) {
          // 西列：西边随 R1 东缘线
          const cw = chainZ(r1e, t0.z + 2, z1 - 2);
          if (cw.length < 2) continue;
          const first = cw[0], last = cw[cw.length - 1];
          cells.push({ edges: [
            top.map(p => [p.x, p.z]),
            [[t1.x, t1.z], [t1.x, z1]],
            [[t1.x, z1], [last.x, last.z]],
            cw.slice().reverse().map(p => [p.x, p.z]),
            [[first.x, first.z], [t0.x, t0.z]],
          ], outer: false });
        } else {
          cells.push({ edges: [
            top.map(p => [p.x, p.z]),
            [[t1.x, t1.z], [t1.x, z1]],
            [[t1.x, z1], [t0.x, z1]],
            [[t0.x, z1], [t0.x, t0.z]],
          ], outer: isOuterRect(t0.x, t0.z, t1.x, z1) });
        }
      }
    } else {
      const z0 = zRows4[r];
      const cw = chainZ(r1e, z0 + 2, z1 - 2);
      if (cw.length >= 2) {
        const first = cw[0], last = cw[cw.length - 1];
        cells.push({ edges: [
          [[first.x, first.z], [x1, z0]],
          [[x1, z0], [x1, z1]],
          [[x1, z1], [last.x, last.z]],
          cw.slice().reverse().map(p => [p.x, p.z]),
        ], outer: false });
      }
      rectCell(x1, z0, x2, z1, isOuterRect(x1, z0, x2, z1));
      rectCell(x2, z0, 920, z1, isOuterRect(x2, z0, 920, z1));
    }
  }
  return cells;
}

// ── 树篱规则（用户定稿 v2）：
//    · 外圈田（outer）不设整边篱，最长边 55% 概率点缀 1 短段（25~45m）
//    · 内圈田每块最多 2 条逻辑边（70% 覆盖留缺口；共享边去重）
//    · R1 镇南段两侧伴随篱（手绘稿主路南侧双线） ──
export function buildHedgeBorders(rand, parcels) {
  const segs = [];
  const seen = new Set();
  const edgeKey = (ax, az, bx, bz) => [ax, az, bx, bz].map(v => Math.round(v / 6)).sort().join(',');
  const edgeLen = (pts) => {
    let L = 0;
    for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    return L;
  };
  // 沿折线边放篱段（覆盖 70%，端头/中部留缺口）
  const edgeSegs = (pts) => {
    const total = edgeLen(pts);
    if (total < 26) return;
    // 弧长展开 → 按弧长切分
    let acc = 0, pi = 0;
    const at = (s) => {
      while (pi < pts.length - 2 && acc + Math.hypot(pts[pi + 1][0] - pts[pi][0], pts[pi + 1][1] - pts[pi][1]) < s) {
        acc += Math.hypot(pts[pi + 1][0] - pts[pi][0], pts[pi + 1][1] - pts[pi][1]); pi++;
      }
      const segL = Math.hypot(pts[pi + 1][0] - pts[pi][0], pts[pi + 1][1] - pts[pi][1]) || 1;
      const t = (s - acc) / segL;
      return [pts[pi][0] + (pts[pi + 1][0] - pts[pi][0]) * t, pts[pi][1] + (pts[pi + 1][1] - pts[pi][1]) * t];
    };
    let s = 4 + rand() * 5;
    const end = total - 4 - rand() * 5;
    while (s < end - 16) {
      const segL = Math.min(36 + rand() * 26, end - s);
      const [ax, az] = at(s), [bx, bz] = at(s + segL);
      segs.push([ax, az, bx, bz]);
      s += segL + (rand() < 0.45 ? 6 + rand() * 9 : 2 + rand() * 3);
    }
  };
  for (const p of parcels) {
    if (p.outer) {
      // 外圈：最长边 55% 概率点缀一短段
      if (rand() > 0.55) continue;
      const long = p.edges.slice().sort((a, b) => edgeLen(b) - edgeLen(a))[0];
      const L = edgeLen(long);
      if (L < 60) continue;
      const s0 = L * (0.2 + rand() * 0.3), l2 = 25 + rand() * 20;
      const pts = long;
      // 直接取边的首尾插值（近似，点缀用足够）
      const [ax, az] = pts[0], [bx, bz] = pts[pts.length - 1];
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      segs.push([ax + ux * s0, az + uz * s0, ax + ux * (s0 + l2), az + uz * (s0 + l2)]);
      continue;
    }
    // 内圈：随机选最多 2 条逻辑边
    const idx = p.edges.map((_, i) => i).filter(i => edgeLen(p.edges[i]) >= 26);
    for (let k = idx.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [idx[k], idx[j]] = [idx[j], idx[k]]; }
    for (const i of idx.slice(0, 2)) {
      const pts = p.edges[i];
      const [ax, az] = pts[0], [bx, bz] = pts[pts.length - 1];
      const k = edgeKey(ax, az, bx, bz);
      if (seen.has(k)) continue;
      seen.add(k);
      edgeSegs(pts);
    }
  }
  // R1 镇南段伴随篱（两侧距路心 13m）
  const pts = polySamples(N2_ROADS[0]);
  for (const side of [-1, 1]) {
    let s = 1120;
    while (s < 1880) {
      if (rand() < 0.22) { s += 46; continue; }
      const seg = pts.filter(p => p.s >= s && p.s <= s + 46)
        .map(p => [p.x + (-p.tz) * side * 13, p.z + p.tx * side * 13]);
      for (let i = 0; i < seg.length - 1; i++) segs.push([...seg[i], ...seg[i + 1]]);
      s += 46 + 12 + rand() * 16;
    }
  }
  return segs;
}

// ── 篱上树木穿插：每条篱段 35% 概率中点附近 1 棵（bocage 特征） ──
export function buildHedgeTrees(rand, hedges) {
  const pts = [];
  for (const [x1, z1, x2, z2] of hedges) {
    if (rand() > 0.35) continue;
    const t = 0.3 + rand() * 0.4;
    pts.push([x1 + (x2 - x1) * t + (rand() - 0.5) * 3, z1 + (z2 - z1) * t + (rand() - 0.5) * 3]);
  }
  return pts;
}

// ── 镇内后院（用户定制）：屋后木围栏小院 + 杂物（柴堆/长椅/配电箱）；避路网与其他建筑 ──
// 返回 { fences: [x1,z1,x2,z2][], props: [{type,x,z,rot}] }；maps.js 经 tb.fenceRun/placeKit 落地
export function buildYardLayouts(rand) {
  const fences = [], props = [];
  const houses = N2_TOWN_HOUSES;
  const roadD = (x, z) => Math.min(_nearestOnRoads(N2_ROADS, x, z).d, _nearestOnRoads(N2_LANES, x, z).d);
  const nearHouse = (x, z, self) => houses.some(o => o !== self && Math.hypot(o.x - x, o.z - z) < 8);
  for (const h of houses) {
    if (rand() > 0.55) continue;
    const [w0, d0] = EU_SIZE[h.key];
    const w = w0 * EU_SCALE, d = d0 * EU_SCALE;
    const yaw = h.rot * Math.PI / 180;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);      // 正面朝街
    const bx = -fx, bz = -fz;                          // 后院方向（屋后）
    const pw = w / 2 + 2.5, pd = 5 + rand() * 4;       // 院半宽/院深
    const cx = h.x + bx * (d / 2 + pd / 2 + 1.5), cz = h.z + bz * (d / 2 + pd / 2 + 1.5);
    if (roadD(cx, cz) < 6) continue;
    const rx = fz, rz = -fx;   // 右向（前向转 90°）
    const c = [
      [cx - rx * pw - bx * pd / 2, cz - rz * pw - bz * pd / 2],   // 前左（近房）
      [cx + rx * pw - bx * pd / 2, cz + rz * pw - bz * pd / 2],   // 前右
      [cx + rx * pw + bx * pd / 2, cz + rz * pw + bz * pd / 2],   // 后右
      [cx - rx * pw + bx * pd / 2, cz - rz * pw + bz * pd / 2],   // 后左
    ];
    // 三面围（左/后/右；前向屋侧敞开）；任一角点压路或压其他房则整院放弃
    const edges = [[c[0], c[3]], [c[3], c[2]], [c[2], c[1]]];
    let ok = true;
    for (const [a, b] of edges) {
      for (const [px, pz] of [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]) {
        if (roadD(px, pz) < 5.5 || nearHouse(px, pz, h)) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) continue;
    for (const [a, b] of edges) fences.push([+a[0].toFixed(1), +a[1].toFixed(1), +b[0].toFixed(1), +b[1].toFixed(1)]);
    // 院内杂物（后左角一带；柴堆/长椅——1944 乡村无配电箱，用户定稿移除）
    const px = c[3][0] + rx * 1.5 - bx * 1.5, pz = c[3][1] + rz * 1.5 - bz * 1.5;
    const r = rand();
    if (r < 0.42) props.push({ type: 'wood_log', x: +px.toFixed(1), z: +pz.toFixed(1), rot: rand() * 360 });
    else if (r < 0.58) props.push({ type: 'bench01', x: +px.toFixed(1), z: +pz.toFixed(1), rot: h.rot + 90 });
  }
  return { fences, props };
}

// ── 树散布：地图缘带零星点缀 + 路旁（最外缘只零星树木，不拉满田地） ──
export const N2_TREE_AREAS = [
  { x0: -980, z0: -980, x1: -860, z1: 980, n: 10 },    // 西缘带
  { x0: 940, z0: -980, x1: 985, z1: 980, n: 8 },       // 东缘带
  { x0: -860, z0: -985, x1: 940, z1: -940, n: 8 },     // 北缘带
  { x0: -860, z0: 940, x1: 940, z1: 985, n: 8 },       // 南缘带
  { x0: -600, z0: -480, x1: -430, z1: -380, n: 5 },    // 路旁点缀
  { x0: 100, z0: -700, x1: 300, z1: -560, n: 5 },
];
