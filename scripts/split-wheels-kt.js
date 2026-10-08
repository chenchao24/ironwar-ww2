// 虎王（pz.kpfw._vi.glb）离线预处理：
//   ① 材质 specGloss → metalRough（three 新版不支持 spec-gloss，否则无贴图）
//   ② 负重轮切割：外排 5 轮/侧按「连通岛」整体抽出（岛 = 完整轮盘+侧壁，贴图零误伤），
//      内排 4 轮/侧不切留车体（交错轮内侧贴图切割必坏 → 静态观感更好，2026-09-13 改）；
//      主动轮/诱导轮仍按轮心圆盘分类 + 连通精滤。
//   ③ Object_11 拆分：上部车顶高射机枪（隐藏）/ 下部车体前机枪（F 键 hullMg）。
// 轮心标定：外排轮心 = 连通岛实测 z=-1.94/-0.90/0.13/1.16/2.19, y=0.47；
// 主动轮 z≈-2.85 y≈1.0；诱导轮 z≈3.15 y≈0.9。x 排距由数据按轮实测。
// 输出：model/tiger2.glb
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { metalRough, prune } = require('@gltf-transform/functions');

const SRC = 'tankModel/pz.kpfw._vi.glb';
const OUT = 'model/tiger2.glb';

function mulVec(m, v) {
  return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
          m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
          m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
}
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
  const doc = await io.read(SRC);
  const root = doc.getRoot();

  // ── ① 收集轮带顶点（右/左分开），用于轮心精修与 x 排距实测 ──
  const bandR = [], bandL = [];   // [z, y, |x|]
  const nodeWM = new Map();
  for (const node of root.listNodes()) {
    if (!node.getMesh()) continue;
    const wm = worldMat(node);
    nodeWM.set(node, wm);
    for (const prim of node.getMesh().listPrimitives()) {
      const arr = prim.getAttribute('POSITION').getArray();
      for (let i = 0; i < arr.length; i += 3) {
        const w = mulVec(wm, [arr[i], arr[i + 1], arr[i + 2]]);
        if (w[1] < 1.35 && Math.abs(w[0]) > 0.85) (w[0] > 0 ? bandR : bandL).push([w[2], w[1], Math.abs(w[0])]);
      }
    }
  }

  // ── ② 轮心精修（rim 环带 [0.25,0.45] 得分 - 1.2×外带 [0.45,0.55]）──
  function refine(zSeed, yLo, yHi, dzRange) {
    let best = null;
    for (let dz = -dzRange; dz <= dzRange; dz += 0.01) {
      for (let y0 = yLo; y0 <= yHi; y0 += 0.01) {
        const z0 = zSeed + dz;
        let ring = 0, out = 0;
        for (const [z, y] of bandR) {
          const a = z - z0, b = y - y0, d2 = a * a + b * b;
          if (d2 >= 0.0625 && d2 <= 0.2025) ring++;
          else if (d2 > 0.2025 && d2 <= 0.3025) out++;
        }
        const sc = ring - 1.2 * out;
        if (!best || sc > best.sc) best = { sc, z: z0, y: y0 };
      }
    }
    return best;
  }
  const wheels = [];   // {name, z, y, r, xR, xL} —— 仅主动/诱导轮走圆盘分类；外排轮走连通岛
  // S 轮心精修放开 y 下限：旧 yLo=0.85 把轮心顶高 ~0.3m，导致切割盘扣住挡泥板（2026-09-13 修正）
  const sp = refine(-2.85, 0.5, 1.15, 0.35);  wheels.push({ id: 'S', z: sp.z, y: sp.y, r: 0.48, rx: 0.35 });
  const idl = refine(3.15, 0.5, 1.1, 0.3);    wheels.push({ id: 'I', z: idl.z, y: idl.y, r: 0.44, rx: 0.35 });

  // x 排距：每轮取径向 0.34 内、x>1.2 顶点的 |x| 中位数（排除 x≈1.03 车体侧板；右/左各一）
  function median(xs) { xs.sort((a, b) => a - b); return xs[Math.floor(xs.length / 2)] || 0; }
  for (const w of wheels) {
    const xr = bandR.filter(([z, y, x]) => x > 1.2 && (z - w.z) ** 2 + (y - w.y) ** 2 < 0.34 ** 2).map(p => p[2]);
    const xl = bandL.filter(([z, y, x]) => x > 1.2 && (z - w.z) ** 2 + (y - w.y) ** 2 < 0.34 ** 2).map(p => p[2]);
    w.xR = median(xr); w.xL = -median(xl);
  }
  console.log('轮心标定:');
  for (const w of wheels) console.log(`  ${String(w.id).padStart(2)} z=${w.z.toFixed(2)} y=${w.y.toFixed(2)} xR=${w.xR.toFixed(2)} xL=${w.xL.toFixed(2)}`);

  // ── ③ 三角面分类切割（仅主动/诱导轮）：x 双带匹配 [1.04±0.11] ∪ [w.x±0.28]，
  //      (z,y) 圆盘内按最近轮心分配；粗切后再做连通分量精滤（见 ③b）。
  //      外排负重轮不走这里，走 ③f 连通岛整抽。 ──
  function classify(cx, cy, cz) {
    if (cy > 1.4 || Math.abs(cx) < 0.93) return null;
    const ax = Math.abs(cx);
    let best = null, bestD = 1e9;
    for (const w of wheels) {
      const x = cx > 0 ? w.xR : w.xL;
      const inA = Math.abs(ax - 1.04) < 0.11;
      const inB = Math.abs(ax - Math.abs(x)) < (w.id === 'S' || w.id === 'I' ? 0.30 : 0.28);
      if (!inA && !inB) continue;
      // S/I 粗切放宽到 1.25 倍半径（候选集），精滤交给连通分量
      const lim = (w.id === 'S' || w.id === 'I') ? 1.25 : 1;
      const d = Math.hypot(cz - w.z, cy - w.y) / w.r;
      if (d < lim && d < bestD) { bestD = d; best = w; }
    }
    return best;
  }

  // ③b 连通分量精滤（仅 S/I）：以「共享顶点」建邻接，轮圈带 [0.22,0.40] 半径内的
  //     三角面为种子 BFS，只保留与轮圈同属于一个连通体的三角面；
  //     挡泥板/泥瓦是独立几何岛，整片退回车体，不会把轮子削缺。
  function componentFilter(tris /* [{vs, wv:[[x,y,z]×3], c:[x,y,z]}] */, w) {
    const v2t = new Map();   // 顶点 key -> [triIdx]
    const keyOf = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
    // 每三角面世界法线（由顶点叉积算，不依赖 NORMAL 属性）；
    // 挡泥板与轮缘在源模型里共享顶点，纯顶点邻接会把两者判为同一连通体，
    // 因此 BFS 扩展额外要求法线连续（二面角 < 60°），平面板在交界处被断开。
    const normals = tris.map(t => {
      const [a, b, c] = t.wv;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      return [n[0] / l, n[1] / l, n[2] / l];
    });
    const COS60 = 0.5;
    tris.forEach((t, i) => {
      for (const p of t.wv) {
        const k = keyOf(p);
        if (!v2t.has(k)) v2t.set(k, []);
        v2t.get(k).push(i);
      }
    });
    const seeds = [];
    tris.forEach((t, i) => {
      const d = Math.hypot(t.c[2] - w.z, t.c[1] - w.y);
      if (d >= 0.22 && d <= 0.40) seeds.push(i);
    });
    // 硬质半径帽：挡泥弧板与轮同心、法线连续渐变，顶点+法线判据都切不断；
    // 且板子三角形很大，质心可能落在帽内 → 帽子按「全部顶点」判定：
    // 轮体（含齿）顶点不超出 1.2 倍半径，弧板必然有顶点超出。
    const cap = w.r * 1.2;
    const withinCap = (i) => tris[i].wv.every(p => Math.hypot(p[2] - w.z, p[1] - w.y) <= cap);
    const seen = new Set(seeds);
    const queue = [...seeds];
    while (queue.length) {
      const i = queue.pop();
      const ni = normals[i];
      for (const p of tris[i].wv) {
        for (const j of v2t.get(keyOf(p)) || []) {
          if (seen.has(j)) continue;
          const nj = normals[j];
          if (ni[0] * nj[0] + ni[1] * nj[1] + ni[2] * nj[2] < COS60) continue;   // 法线突变 → 断开
          if (!withinCap(j)) continue;                                          // 顶点半径帽 → 断开
          seen.add(j); queue.push(j);
        }
      }
    }
    // ③c 叶剥离：经过法线+半径帽后仍有「细条/碎板」挂在轮缘上（后轮挡泥皮、
    //     切边毛刺），特征是与轮体仅 1 条边相连。迭代剥掉悬挂三角面（共享边 ≤1），
    //     轮体三角形致密互连（≥2 条共享边）不受影响；最多 12 轮，吃透细长附属物。
    {
      const edgeCnt = new Map();   // 规范边 key -> 引用计数
      const triEdges = [];         // triIdx -> [edgeKey×3]
      const eKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
      for (const i of seen) {
        const ks = tris[i].wv.map(keyOf);
        const es = [eKey(ks[0], ks[1]), eKey(ks[1], ks[2]), eKey(ks[2], ks[0])];
        triEdges[i] = es;
        for (const e of es) edgeCnt.set(e, (edgeCnt.get(e) || 0) + 1);
      }
      let peeled = 0;
      for (let round = 0; round < 12; round++) {
        const doomed = [];
        for (const i of seen) {
          const shared = triEdges[i].filter(e => edgeCnt.get(e) > 1).length;
          if (shared <= 1) doomed.push(i);
        }
        if (!doomed.length) break;
        for (const i of doomed) {
          seen.delete(i); peeled++;
          for (const e of triEdges[i]) edgeCnt.set(e, edgeCnt.get(e) - 1);
        }
      }
      if (peeled) console.log(`    叶剥离去掉 ${peeled} 面`);
    }
    // ③d 外圈碎条兜底：实测 S/I 轮体三角面质心半径均 ≤0.42（齿尖 rc 0.35~0.42），
    //     超过 0.43 的只有后轮挡泥皮碎片（扇区 135°、x 1.84+ 的 7 面），直接剔除。
    {
      let n = 0;
      for (const i of [...seen]) {
        if (Math.hypot(tris[i].c[2] - w.z, tris[i].c[1] - w.y) > 0.43) { seen.delete(i); n++; }
      }
      if (n) console.log(`    外圈碎条剔除 ${n} 面`);
    }
    // ③e 长边竖板剔除：挡泥皮竖板的三角形又细又长（边长 0.42~0.43，rc 0.34~0.40），
    //     轮体 legit 大三角面（轮毂盘面）边长 ≤0.39 且 rc ≤0.26；
    //     用「边长>0.40 且 rc>0.30」精准命中竖板，不误伤轮毂。
    {
      let n = 0;
      for (const i of [...seen]) {
        const wv = tris[i].wv;
        let me = 0;
        for (let a = 0; a < 3; a++) {
          const b = (a + 1) % 3;
          me = Math.max(me, Math.hypot(wv[a][0] - wv[b][0], wv[a][1] - wv[b][1], wv[a][2] - wv[b][2]));
        }
        const rc = Math.hypot(tris[i].c[2] - w.z, tris[i].c[1] - w.y);
        if (me > 0.40 && rc > 0.30) { seen.delete(i); n++; }
      }
      if (n) console.log(`    长边竖板剔除 ${n} 面`);
    }
    // ③f 摇臂尖刺剔除（仅 S 后轮）：悬挂摆臂碎片从轮毂向前下方伸出轮缘（rv 0.44~0.53），
    //     导致包围盒偏心 ~8cm、轮转起来晃。判别：齿尖虽也 rv 0.44~0.48 但在齿环 x 位
    //     （≥1.57 或 ≈1.33），摆臂在两环之间 x∈(1.37,1.57) →「rv>0.42 且 x 居间」精准命中。
    if (w.id === 'S') {
      let n = 0;
      for (const i of [...seen]) {
        const wv = tris[i].wv;
        const rv = Math.max(...wv.map(p => Math.hypot(p[2] - w.z, p[1] - w.y)));
        const ax = Math.abs(tris[i].c[0]);
        if (rv > 0.42 && ax > 1.37 && ax < 1.57) { seen.delete(i); n++; }
      }
      if (n) console.log(`    摇臂尖刺剔除 ${n} 面`);
    }
    return { kept: tris.filter((_, i) => seen.has(i)), dropped: tris.filter((_, i) => !seen.has(i)) };
  }

  const wheelTris = new Map();   // key `${side}${id}` -> { mat, data:{attr:[]}, types:{attr:{type,ArrayType}}, node }
  let extracted = 0, kept = 0;

  // ── 第一遍：收集 Object_13/15 全部三角面（连通岛需跨 primitive 分析，先全部入内存）──
  const primJobs = [];   // {node, prim, attrInfo, mat, tris:[{vs,wv,c,bucket}]}
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    // 仅切 Object_13/15（轮系所在）；履带保持完整（UV 滚动），翼子板/车体不参与
    if (node.getName() !== 'Object_13' && node.getName() !== 'Object_15') continue;
    const wm = nodeWM.get(node);
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const posArr = pos.getArray();
      const idxArr = prim.getIndices() ? prim.getIndices().getArray() : null;
      const triCount = (idxArr ? idxArr.length : posArr.length / 3) / 3;
      // 动态枚举全部属性（含 TANGENT 等），避免重建后长度不一致
      const attrInfo = [];   // {sem, acc, arr, n, ArrayType, type}
      for (const sem of prim.listSemantics()) {
        const acc = prim.getAttribute(sem);
        attrInfo.push({ sem, acc, arr: acc.getArray(), n: acc.getElementSize(), ArrayType: acc.getArray().constructor, type: acc.getType() });
      }
      const tris = [];
      for (let t = 0; t < triCount; t++) {
        const vs = [];
        for (let k = 0; k < 3; k++) vs.push(idxArr ? idxArr[t * 3 + k] : t * 3 + k);
        const wv = [], c = [0, 0, 0];
        for (const v of vs) {
          const p = mulVec(wm, [posArr[v * 3], posArr[v * 3 + 1], posArr[v * 3 + 2]]);
          wv.push(p);
          c[0] += p[0] / 3; c[1] += p[1] / 3; c[2] += p[2] / 3;
        }
        tris.push({ vs, wv, c, bucket: null });
      }
      primJobs.push({ node, prim, attrInfo, mat: prim.getMaterial(), tris });
    }
  }

  // ── 第二遍 ③：主动/诱导轮圆盘分类 + 连通精滤 ──
  const buckets = new Map();   // wkey -> [tri]
  for (const job of primJobs) for (const t of job.tris) {
    const w = classify(t.c[0], t.c[1], t.c[2]);
    if (!w) continue;
    const key = (t.c[0] > 0 ? 'R' : 'L') + w.id;
    t.bucket = key;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  // ③b~e：S/I 轮桶连通分量精滤，挡泥板等杂质退回车体（bucket 置空，回到后续池）
  for (const [key, tris] of buckets) {
    const w = wheels.find(x => String(x.id) === key.slice(1));
    const { kept: k2, dropped } = componentFilter(tris, w);
    if (dropped.length) {
      console.log(`  轮桶 ${key}: 连通精滤保留 ${k2.length} / 退回车体 ${dropped.length}`);
      for (const d of dropped) d.bucket = null;
    }
    buckets.set(key, k2);
  }

  // ── ③f 外排负重轮连通岛整抽：剩余三角面中 |x|>1.28 且 cy<1.4 的进全局池做连通分量；
  //      中心匹配 5 个外排位的整岛抽出为轮网格（轮盘+侧壁一体，贴图零误伤）；
  //      内排 4 轮（x 1.13~1.33，偶数位）、轮缘碎弧、翼子板支架一律留车体——
  //      交错内轮贴图切割必坏，静态反而更真实（2026-09-13 用户反馈改）。
  const OUTER = [
    { id: '1', z: -1.94, y: 0.47 }, { id: '3', z: -0.90, y: 0.47 }, { id: '5', z: 0.13, y: 0.47 },
    { id: '7', z: 1.16, y: 0.47 }, { id: '9', z: 2.19, y: 0.47 },
  ];
  {
    const pool = [];
    for (const job of primJobs) for (const t of job.tris)
      if (!t.bucket && Math.abs(t.c[0]) > 1.28 && t.c[1] < 1.4) pool.push(t);
    const keyOf = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
    const v2t = new Map();
    pool.forEach((t, i) => {
      for (const p of t.wv) {
        const k = keyOf(p);
        if (!v2t.has(k)) v2t.set(k, []);
        v2t.get(k).push(i);
      }
    });
    const comp = new Array(pool.length).fill(-1);
    let nc = 0;
    for (let i = 0; i < pool.length; i++) {
      if (comp[i] >= 0) continue;
      const q = [i]; comp[i] = nc;
      while (q.length) {
        const a = q.pop();
        for (const p of pool[a].wv) for (const j of v2t.get(keyOf(p)) || []) {
          if (comp[j] < 0) { comp[j] = nc; q.push(j); }
        }
      }
      nc++;
    }
    const groups = new Map();
    for (let i = 0; i < pool.length; i++) {
      if (!groups.has(comp[i])) groups.set(comp[i], []);
      groups.get(comp[i]).push(i);
    }
    let nWheel = 0, nIsland = 0;
    for (const g of groups.values()) {
      if (g.length < 40) continue;   // 碎岛不切
      nIsland++;
      let xs = [1e9, -1e9], ys = [1e9, -1e9], zs = [1e9, -1e9], mx = 0;
      for (const i of g) for (const p of pool[i].wv) {
        xs = [Math.min(xs[0], p[0]), Math.max(xs[1], p[0])];
        ys = [Math.min(ys[0], p[1]), Math.max(ys[1], p[1])];
        zs = [Math.min(zs[0], p[2]), Math.max(zs[1], p[2])];
      }
      for (const i of g) mx += pool[i].c[0] / g.length;
      const zc = (zs[0] + zs[1]) / 2, yc = (ys[0] + ys[1]) / 2;
      let best = null, bestD = 1e9;
      for (const o of OUTER) {
        const d = Math.hypot(zc - o.z, yc - o.y);
        if (d < bestD) { bestD = d; best = o; }
      }
      if (bestD > 0.4) continue;   // 不是外排轮（翼子板支架/内排轮/碎弧）→ 留车体
      const key = (mx > 0 ? 'R' : 'L') + best.id;
      if (!buckets.has(key)) buckets.set(key, []);
      const arr = buckets.get(key);
      for (const i of g) { pool[i].bucket = key; arr.push(pool[i]); nWheel++; }
    }
    console.log(`  外排轮连通岛：池 ${pool.length} 面 / 大岛 ${nIsland} 个 / 抽出 ${nWheel} 面`);
  }

  // ── 第三遍：逐 primitive 重建（keep = bucket 为空的三角面）──
  for (const job of primJobs) {
    const { node, prim, attrInfo, mat, tris } = job;
    const keepTris = [], wheelBuckets = new Map();
    for (const t of tris) {
      if (!t.bucket) { keepTris.push(t.vs); continue; }
      if (!wheelBuckets.has(t.bucket)) wheelBuckets.set(t.bucket, []);
      wheelBuckets.get(t.bucket).push(t);
    }
    kept += keepTris.length;
    if (keepTris.length === tris.length) continue;   // 该 prim 未被切割，保持原样
    const build = (triList) => {
      const out = {};
      for (const a of attrInfo) out[a.sem] = [];
      for (const vs of triList) for (const v of vs)
        for (const a of attrInfo)
          for (let k = 0; k < a.n; k++) out[a.sem].push(a.arr[v * a.n + k]);
      return out;
    };
    // 源 prim：替换为 keep 部分（非索引汤；独占 accessor，直接改长度）
    const built = build(keepTris);
    for (const a of attrInfo) {
      if (a.acc.listParents().filter(p => p.propertyType === 'Primitive').length > 1) {
        // 共享 accessor：克隆后再改，避免影响其他 primitive
        const clone = doc.createAccessor().setType(a.type).setArray(new a.ArrayType(built[a.sem])).setBuffer(a.acc.getBuffer());
        prim.setAttribute(a.sem, clone);
      } else {
        a.acc.setArray(new a.ArrayType(built[a.sem]));
      }
    }
    prim.setIndices(null);
    // 轮桶：挂到总表（元素为 {vs,wv,c}，build 只取 vs）
    for (const [key, tris2] of wheelBuckets) {
      if (!tris2.length) continue;
      extracted += tris2.length;
      if (!wheelTris.has(key)) wheelTris.set(key, { mat, data: {}, types: {}, node });
      const entry = wheelTris.get(key);
      const builtW = build(tris2.map(t => t.vs));
      for (const a of attrInfo) {
        if (!entry.data[a.sem]) { entry.data[a.sem] = []; entry.types[a.sem] = { ArrayType: a.ArrayType, type: a.type }; }
        entry.data[a.sem].push(...builtW[a.sem]);
      }
    }
  }
  console.log(`切割完成：抽出 ${extracted} 三角面，保留 ${kept}`);

  // ── ③g Object_11 拆分：质心 y>2.2 的车顶高射机枪 → roofMg（游戏内隐藏）；
  //      其余（车体前机枪球座+枪身）留在 Object_11 → 游戏作 hullMg（F 键）──
  {
    const n11 = root.listNodes().find(n => n.getName() === 'Object_11');
    if (n11 && n11.getMesh()) {
      const wm = nodeWM.get(n11);
      for (const prim of n11.getMesh().listPrimitives()) {
        const pos = prim.getAttribute('POSITION'); if (!pos) continue;
        const posArr = pos.getArray();
        const idxArr = prim.getIndices() ? prim.getIndices().getArray() : null;
        const triCount = (idxArr ? idxArr.length : posArr.length / 3) / 3;
        const attrInfo = [];
        for (const sem of prim.listSemantics()) {
          const acc = prim.getAttribute(sem);
          attrInfo.push({ sem, acc, arr: acc.getArray(), n: acc.getElementSize(), ArrayType: acc.getArray().constructor, type: acc.getType() });
        }
        const keepTris = [], roofTris = [];
        for (let t = 0; t < triCount; t++) {
          const vs = [];
          for (let k = 0; k < 3; k++) vs.push(idxArr ? idxArr[t * 3 + k] : t * 3 + k);
          let cy = 0;
          for (const v of vs) cy += mulVec(wm, [posArr[v * 3], posArr[v * 3 + 1], posArr[v * 3 + 2]])[1] / 3;
          (cy > 2.2 ? roofTris : keepTris).push(vs);
        }
        if (!roofTris.length) continue;
        const build = (triList) => {
          const out = {};
          for (const a of attrInfo) out[a.sem] = [];
          for (const vs of triList) for (const v of vs)
            for (const a of attrInfo)
              for (let k = 0; k < a.n; k++) out[a.sem].push(a.arr[v * a.n + k]);
          return out;
        };
        // 源 prim 留车体机枪
        const built = build(keepTris);
        for (const a of attrInfo) {
          if (a.acc.listParents().filter(p => p.propertyType === 'Primitive').length > 1) {
            const clone = doc.createAccessor().setType(a.type).setArray(new a.ArrayType(built[a.sem])).setBuffer(a.acc.getBuffer());
            prim.setAttribute(a.sem, clone);
          } else {
            a.acc.setArray(new a.ArrayType(built[a.sem]));
          }
        }
        prim.setIndices(null);
        // 车顶机枪 → 新节点 roofMg（同父同矩阵）
        const mesh = doc.createMesh('roofMg');
        const p2 = doc.createPrimitive().setMaterial(prim.getMaterial());
        const builtR = build(roofTris);
        const buf = root.listBuffers()[0] || doc.createBuffer();
        for (const a of attrInfo) {
          const acc = doc.createAccessor().setType(a.type).setArray(new a.ArrayType(builtR[a.sem])).setBuffer(buf);
          p2.setAttribute(a.sem, acc);
        }
        mesh.addPrimitive(p2);
        const node = doc.createNode('roofMg').setMesh(mesh).setMatrix(n11.getMatrix());
        const parents = n11.listParents().filter(p => p.propertyType === 'Node');
        (parents[0] || root.listScenes()[0]).addChild(node);
        console.log(`  Object_11 拆分：车体机枪 ${keepTris.length} 面 / 车顶机枪 roofMg ${roofTris.length} 面`);
      }
    }
  }

  // ── ④ 生成轮节点（同父节点 + 同局部矩阵 → 世界变换不变）──
  const buffer = root.listBuffers()[0] || doc.createBuffer();
  for (const [key, entry] of wheelTris) {
    const mesh = doc.createMesh('wheel' + key);
    const prim = doc.createPrimitive().setMaterial(entry.mat);
    for (const sem of Object.keys(entry.data)) {
      const t = entry.types[sem];
      const acc = doc.createAccessor().setType(t.type)
        .setArray(new t.ArrayType(entry.data[sem])).setBuffer(buffer);
      prim.setAttribute(sem, acc);
    }
    mesh.addPrimitive(prim);
    const node = doc.createNode('wheel' + key).setMesh(mesh).setMatrix(entry.node.getMatrix());
    const parents = entry.node.listParents().filter(p => p.propertyType === 'Node');
    (parents[0] || root.listScenes()[0]).addChild(node);
    const n = entry.data.POSITION.length / 3;
    console.log(`  wheel${key}: ${n} verts`);
  }

  // ── ⑤ 材质转换 + 清理 + 写出 ──
  await doc.transform(metalRough(), prune());
  await io.write(OUT, doc);
  console.log('已写出 ' + OUT);
})().catch(e => { console.error(e); process.exit(1); });
