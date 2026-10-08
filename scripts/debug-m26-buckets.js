// M26 轮桶成分诊断：复跑 split 的种子发现+归桶逻辑，打印每轮桶内各分量的几何特征
// （spanX / min|x| / 角向覆盖扇区数 / 质心偏心），找出混进来的支臂碎件
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
function mulVec(m, v) { return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]; }
function worldMat(node) {
  const parents = node.listParents().filter(p => p.propertyType === 'Node');
  const m = node.getMatrix();
  if (!parents.length) return m;
  const pm = worldMat(parents[0]);
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += pm[k * 4 + r] * m[c * 4 + k];
  return out;
}
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read('tankModel/m26_pershing.glb');
  const root = doc.getRoot();
  const WHEEL_NODES = ['Object_11', 'Object_12', 'Object_14', 'Object_15'];
  const allTris = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh || !WHEEL_NODES.includes(node.getName())) continue;
    const wm = worldMat(node);
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const posArr = pos.getArray();
      const idxArr = prim.getIndices() ? prim.getIndices().getArray() : null;
      const triCount = (idxArr ? idxArr.length : posArr.length / 3) / 3;
      for (let t = 0; t < triCount; t++) {
        const vs = [];
        for (let k = 0; k < 3; k++) vs.push(idxArr ? idxArr[t * 3 + k] : t * 3 + k);
        const wv = [], c = [0, 0, 0];
        for (const v of vs) {
          const p = mulVec(wm, [posArr[v * 3], posArr[v * 3 + 1], posArr[v * 3 + 2]]);
          wv.push(p); c[0] += p[0] / 3; c[1] += p[1] / 3; c[2] += p[2] / 3;
        }
        allTris.push({ vs, wv, c, node: node.getName() });
      }
    }
  }
  // 连通分量
  const v2t = new Map();
  const keyOf = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
  allTris.forEach((t, i) => { for (const p of t.wv) { const k = keyOf(p); if (!v2t.has(k)) v2t.set(k, []); v2t.get(k).push(i); } });
  const comp = new Array(allTris.length).fill(-1);
  let nc = 0;
  for (let i = 0; i < allTris.length; i++) {
    if (comp[i] >= 0) continue;
    const q = [i]; comp[i] = nc;
    while (q.length) {
      const a = q.pop();
      for (const p of allTris[a].wv) for (const j of v2t.get(keyOf(p)) || []) {
        if (comp[j] < 0) { comp[j] = nc; q.push(j); }
      }
    }
    nc++;
  }
  const groups = new Map();
  for (let i = 0; i < allTris.length; i++) {
    if (!groups.has(comp[i])) groups.set(comp[i], []);
    groups.get(comp[i]).push(i);
  }
  const comps = [...groups.values()].map(g => {
    let xs = [1e9, -1e9], ys = [1e9, -1e9], zs = [1e9, -1e9], cx = 0, cy = 0, cz = 0;
    for (const i of g) for (const p of allTris[i].wv) {
      xs = [Math.min(xs[0], p[0]), Math.max(xs[1], p[0])];
      ys = [Math.min(ys[0], p[1]), Math.max(ys[1], p[1])];
      zs = [Math.min(zs[0], p[2]), Math.max(zs[1], p[2])];
    }
    for (const i of g) { cx += allTris[i].c[0] / g.length; cy += allTris[i].c[1] / g.length; cz += allTris[i].c[2] / g.length; }
    return { idxs: g, c: [cx, cy, cz], xs, ys, zs, spanX: xs[1] - xs[0], spanY: ys[1] - ys[0], spanZ: zs[1] - zs[0], minAx: Math.min(Math.abs(xs[0]), Math.abs(xs[1])), node: allTris[g[0]].node };
  });
  // 种子（与 split 脚本一致）
  const seeds = [];
  for (const cp of comps) {
    const discR = Math.max(cp.spanY, cp.spanZ) / 2;
    const isFullDisc = cp.spanY >= 0.55 && cp.spanZ >= 0.55 && cp.spanY <= 0.8 && cp.spanZ <= 0.8 && cp.spanX <= 0.5;
    const isRoller = cp.spanY >= 0.25 && cp.spanZ >= 0.25 && cp.spanY < 0.5 && cp.spanZ < 0.5 && Math.abs(cp.c[0]) > 1.1 && cp.c[1] < 1.3;
    if (!isFullDisc && !isRoller) continue;
    const zc = (cp.zs[0] + cp.zs[1]) / 2, yc = (cp.ys[0] + cp.ys[1]) / 2;
    let s = seeds.find(s => Math.hypot(s.z - zc, s.y - yc) < 0.1 && (s.side === (cp.c[0] > 0 ? 'R' : 'L')));
    if (!s) { s = { z: zc, y: yc, r: 0, side: cp.c[0] > 0 ? 'R' : 'L', kind: isRoller ? 'roller' : 'disc' }; seeds.push(s); }
    if (isFullDisc) s.kind = 'disc';
    s.r = Math.max(s.r, discR);
  }
  for (const side of ['R', 'L']) {
    const ss = seeds.filter(s => s.side === side).sort((a, b) => a.z - b.z);
    const discs = ss.filter(s => s.kind === 'disc');
    const rollers = ss.filter(s => s.kind === 'roller');
    discs.forEach((s, i) => { s.name = 'wheel' + side + (i === 0 ? 'S' : i === discs.length - 1 ? 'I' : String(i)); });
    rollers.forEach((s, i) => { s.name = 'wheel' + side + 'T' + (i + 1); });
  }
  // 归桶（与 split 脚本一致）
  for (const cp of comps) {
    if (cp.spanX > 0.5) continue;
    let best = null, bestD = 1e9;
    for (const s of seeds) {
      if ((s.side === 'R') !== (cp.c[0] > 0)) continue;
      const d = Math.hypot(cp.c[2] - s.z, cp.c[1] - s.y);
      const lim = s.kind === 'roller' ? s.r + 0.08 : s.r + 0.12;
      if (d < lim && d < bestD) { bestD = d; best = s; }
    }
    if (!best) continue;
    const cap = best.r * 1.35;
    let ok = true;
    for (const i of cp.idxs) for (const p of allTris[i].wv) {
      if (Math.hypot(p[2] - best.z, p[1] - best.y) > cap) { ok = false; break; }
    }
    if (!ok) continue;
    cp.seed = best;
  }
  // 打印每个轮桶的分量明细
  for (const s of seeds.sort((a, b) => a.name.localeCompare(b.name))) {
    const members = comps.filter(c => c.seed === s).sort((a, b) => b.idxs.length - a.idxs.length);
    // 合并 bbox + 角向覆盖
    let xs = [1e9, -1e9], ys = [1e9, -1e9], zs = [1e9, -1e9];
    const sectors = new Set();
    for (const cp of members) {
      xs = [Math.min(xs[0], cp.xs[0]), Math.max(xs[1], cp.xs[1])];
      ys = [Math.min(ys[0], cp.ys[0]), Math.max(ys[1], cp.ys[1])];
      zs = [Math.min(zs[0], cp.zs[0]), Math.max(zs[1], cp.zs[1])];
    }
    console.log(`\n${s.name} (z=${s.z.toFixed(2)} y=${s.y.toFixed(2)} r=${s.r.toFixed(2)}) 桶 ${members.length} 分量 → 合并 x[${xs[0].toFixed(2)},${xs[1].toFixed(2)}] y[${ys[0].toFixed(2)},${ys[1].toFixed(2)}] z[${zs[0].toFixed(2)},${zs[1].toFixed(2)}]`);
    for (const cp of members) {
      const sec = new Set();
      for (const i of cp.idxs) for (const p of allTris[i].wv) {
        sec.add(Math.floor((Math.atan2(p[1] - s.y, p[2] - s.z) + Math.PI) / (Math.PI / 6)));
      }
      const ecc = Math.hypot(cp.c[2] - s.z, cp.c[1] - s.y);
      console.log(`   n=${String(cp.idxs.length).padStart(4)} 源=${cp.node} x[${cp.xs[0].toFixed(2)},${cp.xs[1].toFixed(2)}] y[${cp.ys[0].toFixed(2)},${cp.ys[1].toFixed(2)}] z[${cp.zs[0].toFixed(2)},${cp.zs[1].toFixed(2)}] spanX=${cp.spanX.toFixed(2)} minAx=${cp.minAx.toFixed(2)} 扇区=${sec.size}/12 偏心=${ecc.toFixed(3)}`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
