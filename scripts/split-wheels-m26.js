// M26 潘兴（tankModel/m26_pershing.glb）离线预处理：
//   ① 材质 specGloss → metalRough（three 新版不支持 spec-gloss，否则无贴图）
//   ② 负重轮切割（§12 费迪南变体：轮在 md 标注的独立轮件节点 Object_11/12/14/15 内，
//      但每轮 = 内/外两盘 + 螺栓等多个互不连通的同心分量）：
//      - 满盘分量（y/z 跨度 ≥0.5）发现轮心种子；同中心分量归并
//      - 回转轮（跨度 0.25~0.5）自立种子
//      - 其余分量按质心最近种子归桶（径向帽/spanX 帽防悬挂臂混入）
//      - 轮位实测（2026-09-21 analyze-m26.js）：负重轮 y=0.39 r=0.33，
//        R 侧 z=-1.72/-0.98/-0.25/0.49/1.22/2.01，L 侧整体后错 0.06（z=-1.78/-1.04/-0.31/0.43/1.16/2.01）；
//        主动轮（后）z=-2.52 y=0.67 r=0.35；诱导轮（前）z=2.56 y=0.85 r=0.33；
//        回转轮 y=0.99 r=0.185，R z=-1.38/-0.66/0.06/0.79/1.51，L z=-1.44/-0.72/0/0.72/1.45
//   ③ Object_23 拆分：质心 y>1.6 的炮塔同轴机枪 → coaxMg（随炮塔，右键发射）；
//      其余（车体前机枪球座+枪身，y 1.02~1.24）留 Object_23 → hullMg（F 键）
// 输出：model/m26_pershing.glb
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { metalRough, prune } = require('@gltf-transform/functions');

const SRC = 'tankModel/m26_pershing.glb';
const OUT = 'model/m26_pershing.glb';
const WHEEL_NODES = ['Object_11', 'Object_12', 'Object_14', 'Object_15'];

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
  const buffer = root.listBuffers()[0] || doc.createBuffer();

  // ── ① 收集轮件三角面（世界坐标）──
  const primJobs = [];   // {node, prim, attrInfo, mat, tris:[{vs,wv,c,bucket}]}
  const allTris = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    if (!WHEEL_NODES.includes(node.getName())) continue;
    const wm = worldMat(node);
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const posArr = pos.getArray();
      const idxArr = prim.getIndices() ? prim.getIndices().getArray() : null;
      const triCount = (idxArr ? idxArr.length : posArr.length / 3) / 3;
      const attrInfo = [];
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
          wv.push(p); c[0] += p[0] / 3; c[1] += p[1] / 3; c[2] += p[2] / 3;
        }
        const tri = { vs, wv, c, bucket: null };
        tris.push(tri); allTris.push(tri);
      }
      primJobs.push({ node, prim, attrInfo, mat: prim.getMaterial(), tris });
    }
  }
  console.log('轮件三角面:', allTris.length);

  // ── ② 连通分量聚类（共享顶点）──
  const v2t = new Map();
  const keyOf = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
  allTris.forEach((t, i) => {
    for (const p of t.wv) {
      const k = keyOf(p);
      if (!v2t.has(k)) v2t.set(k, []);
      v2t.get(k).push(i);
    }
  });
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
  // 分量摘要 {tris, c:[x,y,z] 质心, bbox, spanX/spanY/spanZ, maxR(相对 bbox 中心 z/y)}
  const comps = [...groups.values()].map(g => {
    let xs = [1e9, -1e9], ys = [1e9, -1e9], zs = [1e9, -1e9], cx = 0, cy = 0, cz = 0;
    for (const i of g) for (const p of allTris[i].wv) {
      xs = [Math.min(xs[0], p[0]), Math.max(xs[1], p[0])];
      ys = [Math.min(ys[0], p[1]), Math.max(ys[1], p[1])];
      zs = [Math.min(zs[0], p[2]), Math.max(zs[1], p[2])];
    }
    for (const i of g) { cx += allTris[i].c[0] / g.length; cy += allTris[i].c[1] / g.length; cz += allTris[i].c[2] / g.length; }
    return { idxs: g, c: [cx, cy, cz], bbox: { xs, ys, zs }, spanX: xs[1] - xs[0], spanY: ys[1] - ys[0], spanZ: zs[1] - zs[0] };
  });
  console.log(`连通分量: ${comps.length} 个`);

  // ── ③ 种子发现：满盘（spanY,spanZ ∈[0.55,0.8]）或回转轮盘（0.25~0.5 且 |x|>1.1）──
  // 同中心多分量归并：满盘分量归并进已有种子时把 kind 升级为 disc
  // （轮心螺栓圈等小分量可能先建种子；span 上限 0.8 防悬挂臂/挡泥大连通体成种子）
  const seeds = [];   // {z, y, r, side, kind, x}
  for (const cp of comps) {
    const discR = Math.max(cp.spanY, cp.spanZ) / 2;
    const isFullDisc = cp.spanY >= 0.55 && cp.spanZ >= 0.55 && cp.spanY <= 0.8 && cp.spanZ <= 0.8 && cp.spanX <= 0.5;
    const isRoller = cp.spanY >= 0.25 && cp.spanZ >= 0.25 && cp.spanY < 0.5 && cp.spanZ < 0.5 && Math.abs(cp.c[0]) > 1.1 && cp.c[1] < 1.3;
    if (!isFullDisc && !isRoller) continue;
    const zc = (cp.bbox.zs[0] + cp.bbox.zs[1]) / 2, yc = (cp.bbox.ys[0] + cp.bbox.ys[1]) / 2;
    let s = seeds.find(s => Math.hypot(s.z - zc, s.y - yc) < 0.1 && (s.side === (cp.c[0] > 0 ? 'R' : 'L')));
    if (!s) {
      s = { z: zc, y: yc, r: 0, side: cp.c[0] > 0 ? 'R' : 'L', kind: isRoller ? 'roller' : 'disc', x: Math.abs(cp.c[0]), n: 0 };
      seeds.push(s);
    }
    if (isFullDisc) s.kind = 'disc';   // 升级：螺栓圈先建的 roller 种子实为满盘轮
    s.r = Math.max(s.r, discR); s.n++;
  }
  console.log('种子轮:');
  for (const s of seeds.sort((a, b) => a.side.localeCompare(b.side) || a.z - b.z))
    console.log(`  ${s.side} z=${s.z.toFixed(2)} y=${s.y.toFixed(2)} r=${s.r.toFixed(2)} kind=${s.kind} x=${s.x.toFixed(2)} 分量数=${s.n}`);

  // ── ④ 分量归桶：质心最近种子 + 径向帽 + spanX 帽 + 碎件剔除 ──
  // 判别依据（§12.1 + 2026-09-21 M26 支臂碎件实测）：
  //  - 跨车体件（悬挂臂/扭杆）留静态：spanX > 0.5
  //  - 逐顶点半径帽 r×1.35 防长臂/挡泥混入
  //  - 弧段碎件（支臂尖/翼子板支架）：角向扇区 <6 且质心偏心 > max(r×0.6, 0.12) 剔除——
  //    轮体螺栓圈偏心恒 ≈0.41~0.57r 且贴面紧凑；支臂碎件偏心 ≥0.64r 且只占 1~3 扇区
  //  - 越出轮面外缘的支架件：minAx > 轮面 maxAx + 0.05 剔除（回转轮 x≈1.74 支架实测）
  for (const cp of comps) {
    if (cp.spanX > 0.5) continue;                        // 跨车体件（悬挂臂/扭杆）留静态
    let best = null, bestD = 1e9;
    for (const s of seeds) {
      if ((s.side === 'R') !== (cp.c[0] > 0)) continue;  // 左右不串
      const d = Math.hypot(cp.c[2] - s.z, cp.c[1] - s.y);
      const lim = s.kind === 'roller' ? s.r + 0.08 : s.r + 0.12;
      if (d < lim && d < bestD) { bestD = d; best = s; }
    }
    if (!best) continue;
    // 逐顶点半径帽
    const cap = best.r * 1.35;
    let ok = true;
    for (const i of cp.idxs) for (const p of allTris[i].wv) {
      if (Math.hypot(p[2] - best.z, p[1] - best.y) > cap) { ok = false; break; }
    }
    if (!ok) continue;
    // 轮面外缘（种子的满盘分量 max|x|）
    if (best.maxAx == null) best.maxAx = 0;
    cp.seed = best;   // 暂挂，碎件剔除在下方统一做
  }
  // 先统计各种子轮面外缘
  for (const cp of comps) {
    if (!cp.seed) continue;
    const s = cp.seed;
    const mx = Math.max(Math.abs(cp.bbox.xs[0]), Math.abs(cp.bbox.xs[1]));
    if (cp.spanY >= 0.5 * s.r * 2) s.maxAx = Math.max(s.maxAx, mx);   // 只计大盘面
  }
  // 碎件剔除（退回车体静态）
  let droppedJunk = 0;
  for (const cp of comps) {
    const s = cp.seed;
    if (!s) continue;
    const minAx = Math.min(Math.abs(cp.bbox.xs[0]), Math.abs(cp.bbox.xs[1]));
    const sec = new Set();
    for (const i of cp.idxs) for (const p of allTris[i].wv) {
      sec.add(Math.floor((Math.atan2(p[1] - s.y, p[2] - s.z) + Math.PI) / (Math.PI / 6)));
    }
    const ecc = Math.hypot(cp.c[2] - s.z, cp.c[1] - s.y);
    const junkArc = sec.size < 6 && ecc > Math.max(s.r * 0.6, 0.12);
    const junkOutboard = minAx > s.maxAx + 0.05;
    if (junkArc || junkOutboard) { cp.seed = null; droppedJunk++; }
  }
  const bucketed = comps.filter(c => c.seed);
  console.log(`归桶分量 ${bucketed.length}/${comps.length}（剔除支臂/支架碎件 ${droppedJunk} 个退回车体）`);

  // ── ⑤ 命名：side + 种类 + 序号 ──
  // disc 种子按 z 排序：z 最小=主动轮(S，后置车尾)、z 最大=诱导轮(I)、中间=负重轮 1..N、roller=T1..N
  const wheelTris = new Map();   // name -> { mat, data, types, node }
  let extracted = 0, kept = 0;
  for (const side of ['R', 'L']) {
    const ss = seeds.filter(s => s.side === side).sort((a, b) => a.z - b.z);
    const discs = ss.filter(s => s.kind === 'disc');
    const rollers = ss.filter(s => s.kind === 'roller');
    discs.forEach((s, i) => {
      s.name = 'wheel' + side + (i === 0 ? 'S' : i === discs.length - 1 ? 'I' : String(i));
    });
    rollers.forEach((s, i) => { s.name = 'wheel' + side + 'T' + (i + 1); });
  }
  console.log('命名:');
  for (const s of seeds) console.log(`  ${s.name} z=${s.z.toFixed(2)} y=${s.y.toFixed(2)} r=${s.r.toFixed(2)}`);
  for (const cp of bucketed) {
    const key = cp.seed.name;
    for (const i of cp.idxs) allTris[i].bucket = key;
  }

  // ── ⑥ 逐 primitive 重建 ──
  for (const job of primJobs) {
    const { node, prim, attrInfo, mat, tris } = job;
    const keepTris = [], wheelBuckets = new Map();
    for (const t of tris) {
      if (!t.bucket) { keepTris.push(t.vs); continue; }
      if (!wheelBuckets.has(t.bucket)) wheelBuckets.set(t.bucket, []);
      wheelBuckets.get(t.bucket).push(t);
    }
    kept += keepTris.length;
    if (keepTris.length === tris.length) continue;
    const build = (triList) => {
      const out = {};
      for (const a of attrInfo) out[a.sem] = [];
      for (const vs of triList) for (const v of vs)
        for (const a of attrInfo)
          for (let k = 0; k < a.n; k++) out[a.sem].push(a.arr[v * a.n + k]);
      return out;
    };
    if (keepTris.length === 0) {
      // 整 prim 都是轮件：移除该 primitive（不生成空 accessor）
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
      const mesh = node.getMesh();
      mesh.removePrimitive(prim);
      prim.dispose();
      continue;
    }
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
  console.log(`轮系切割完成：抽出 ${extracted} 三角面，车体保留 ${kept}`);

  // ── ⑦ Object_23 拆分：上簇（质心 y>1.6）= 炮塔同轴机枪 → coaxMg；下簇留作 hullMg ──
  {
    const n23 = root.listNodes().find(n => n.getName() === 'Object_23');
    if (n23 && n23.getMesh()) {
      const wm = worldMat(n23);
      let nCoax = 0, nHull = 0;
      for (const prim of [...n23.getMesh().listPrimitives()]) {
        const pos = prim.getAttribute('POSITION'); if (!pos) continue;
        const posArr = pos.getArray();
        const idxArr = prim.getIndices() ? prim.getIndices().getArray() : null;
        const triCount = (idxArr ? idxArr.length : posArr.length / 3) / 3;
        const attrInfo = [];
        for (const sem of prim.listSemantics()) {
          const acc = prim.getAttribute(sem);
          attrInfo.push({ sem, acc, arr: acc.getArray(), n: acc.getElementSize(), ArrayType: acc.getArray().constructor, type: acc.getType() });
        }
        const keepTris = [], coaxTris = [];
        for (let t = 0; t < triCount; t++) {
          const vs = [];
          for (let k = 0; k < 3; k++) vs.push(idxArr ? idxArr[t * 3 + k] : t * 3 + k);
          let cy = 0;
          for (const v of vs) cy += mulVec(wm, [posArr[v * 3], posArr[v * 3 + 1], posArr[v * 3 + 2]])[1] / 3;
          (cy > 1.6 ? coaxTris : keepTris).push(vs);
        }
        if (!coaxTris.length) continue;
        const build = (triList) => {
          const out = {};
          for (const a of attrInfo) out[a.sem] = [];
          for (const vs of triList) for (const v of vs)
            for (const a of attrInfo)
              for (let k = 0; k < a.n; k++) out[a.sem].push(a.arr[v * a.n + k]);
          return out;
        };
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
        const mesh = doc.createMesh('coaxMg');
        const p2 = doc.createPrimitive().setMaterial(prim.getMaterial());
        const builtC = build(coaxTris);
        for (const a of attrInfo) {
          const acc = doc.createAccessor().setType(a.type).setArray(new a.ArrayType(builtC[a.sem])).setBuffer(buffer);
          p2.setAttribute(a.sem, acc);
        }
        mesh.addPrimitive(p2);
        const node = doc.createNode('coaxMg').setMesh(mesh).setMatrix(n23.getMatrix());
        const parents = n23.listParents().filter(p => p.propertyType === 'Node');
        (parents[0] || root.listScenes()[0]).addChild(node);
        nCoax += coaxTris.length; nHull += keepTris.length;
      }
      console.log(`  Object_23 拆分：车体机枪 hullMg ${nHull} 面 / 同轴机枪 coaxMg ${nCoax} 面`);
    }
  }

  // ── ⑧ 生成轮节点（同父节点 + 同局部矩阵 → 世界变换不变）──
  for (const [key, entry] of wheelTris) {
    const mesh = doc.createMesh(key);
    const prim = doc.createPrimitive().setMaterial(entry.mat);
    for (const sem of Object.keys(entry.data)) {
      const t = entry.types[sem];
      const acc = doc.createAccessor().setType(t.type)
        .setArray(new t.ArrayType(entry.data[sem])).setBuffer(buffer);
      prim.setAttribute(sem, acc);
    }
    mesh.addPrimitive(prim);
    const node = doc.createNode(key).setMesh(mesh).setMatrix(entry.node.getMatrix());
    const parents = entry.node.listParents().filter(p => p.propertyType === 'Node');
    (parents[0] || root.listScenes()[0]).addChild(node);
    const n = entry.data.POSITION.length / 3;
    console.log(`  ${key}: ${n} verts`);
  }

  // ── ⑨ 材质转换 + 清理 + 写出 ──
  await doc.transform(metalRough(), prune());
  await io.write(OUT, doc);
  console.log('已写出 ' + OUT);
})().catch(e => { console.error(e); process.exit(1); });
