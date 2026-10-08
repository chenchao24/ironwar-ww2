// ═══ POI 兴趣点预生成器（docs/ai-redesign-plan.md §10 poi.js） ═══
// 按地图静态数据离线分析（战斗开始/地图构建后调用一次）：
//   hill  高地（groundY 局部极大，视野优势）；
//   cover 掩体群（obstacles 密集格：岩石/建筑/废墟）；
//   bush  遮蔽区（sightBlockers 密集格：灌木带，伏击位）；
//   node  路径节点（搜索链骨架：中心 + 双环，保证全网连通覆盖）。
// 输出供：patrol/search 搜索链（§8.1 节奏总监）、dwell 目标选择、控制点占领（L2/L3）。

const GRID = 200;          // 采样格距 m
const MERGE_R = 150;       // POI 合并半径 m
// 数量：node 全保留（≤17），hill/cover/bush 各配额 14/14/8（见 generatePOIs 尾部）

// 主入口：world 需含 obstacles / sightBlockers / groundY；bound = 地图半径（含边距）
export function generatePOIs(world, bound) {
  const B = bound - 80;
  const gy = (x, z) => world.groundY ? world.groundY(x, z) : 0;
  const raw = [];

  // ── 网格采样：高地 + 掩体群 + 遮蔽区 ──
  for (let x = -B; x <= B; x += GRID) {
    for (let z = -B; z <= B; z += GRID) {
      // 高地：高于四邻（±GRID）中最大者 + 突出度 ≥2m
      const h = gy(x, z);
      const nMax = Math.max(gy(x + GRID, z), gy(x - GRID, z), gy(x, z + GRID), gy(x, z - GRID));
      if (h - nMax >= 2) raw.push({ x, z, type: 'hill', score: 2 + (h - nMax) });
      // 掩体群：GRID 半径内 ≥2 个硬障碍
      let n = 0;
      for (const o of (world.obstacles || [])) {
        if (Math.abs(o.x - x) < GRID && Math.abs(o.z - z) < GRID && Math.hypot(o.x - x, o.z - z) < GRID) n++;
      }
      if (n >= 2) raw.push({ x, z, type: 'cover', score: 1 + Math.min(n, 5) * 0.5 });
      // 遮蔽区：GRID 半径内 ≥3 个软遮挡
      let s = 0;
      for (const b of (world.sightBlockers || [])) {
        if (Math.abs(b.x - x) < GRID && Math.abs(b.z - z) < GRID && Math.hypot(b.x - x, b.z - z) < GRID) s++;
      }
      if (s >= 3) raw.push({ x, z, type: 'bush', score: 1 + Math.min(s, 8) * 0.25 });
    }
  }

  // ── 路径节点：中心 + r400/r800 双环 ×8（搜索链骨架，与地形无关兜底） ──
  raw.push({ x: 0, z: 0, type: 'node', score: 1.5 });
  for (const r of [400, 800]) {
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + (r === 800 ? Math.PI / 8 : 0);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (Math.abs(x) <= B && Math.abs(z) <= B) raw.push({ x, z, type: 'node', score: 1 });
    }
  }

  // ── 合并（同类型 MERGE_R 内取高分者）+ 数量上限 ──
  raw.sort((a, b) => b.score - a.score);
  const pois = [];
  for (const p of raw) {
    let merged = false;
    for (const q of pois) {
      if (q.type === p.type && Math.hypot(q.x - p.x, q.z - p.z) < MERGE_R) {
        if (p.score > q.score) { q.x = (q.x + p.x) / 2; q.z = (q.z + p.z) / 2; q.score = p.score; }
        merged = true;
        break;
      }
    }
    if (!merged) pois.push(p);
  }
  // 数量上限：node（搜索链骨架）全保留；其余按类型配额（保证遮蔽区不被高分掩体群挤光）
  const nodes = pois.filter(p => p.type === 'node');
  const QUOTA = { hill: 14, cover: 14, bush: 8 };
  const others = [];
  for (const t of Object.keys(QUOTA)) {
    others.push(...pois.filter(p => p.type === t).slice(0, QUOTA[t]));
  }
  return [...nodes, ...others];
}

// 最近 POI（可排除已访问集合；type 过滤可选）
export function nearestPOI(pois, x, z, exclude, type = null) {
  let best = null, bd = Infinity;
  for (const p of pois) {
    if (exclude && exclude.has(p)) continue;
    if (type && p.type !== type) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
