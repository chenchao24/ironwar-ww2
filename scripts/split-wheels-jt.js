// 猎虎（Jagdtiger）离线轮系切割（wheel-split-playbook 流程，费迪南/猎豹同款「同心环多分量」切法）：
//   ① 材质 specGloss → metalRough（老 Sketchfab 导出）
//   ② 轮件 Object_8/Object_10：外排负重轮 5/侧（x±1.56 盘 + x±1.39 内环同桶）；
//      内排交错轮 4/侧（x±1.22，满盘）留静态（虎王定策）——种子发现加 x≥1.3 外排门；
//      前主动轮（z3.00 y0.87 五件）/ 后诱导轮（z−2.74 y0.70 三件）锚点归桶。
//   ③ 顺带输出 Object_15（炮）/ Object_5（机枪）/ 履带世界包围盒供 config 标定。
// 输出：model/jagdtiger.glb
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { metalRough, prune, getBounds } = require('@gltf-transform/functions');
const path = require('path');

const V = {
  name: 'jagdtiger',
  src: 'tankModel/jagdtiger.glb',
  out: 'model/jagdtiger.glb',
  wheelNodes: ['Object_8', 'Object_10'],
  discSpan: 0.6,         // 满盘分量判定（y/z 跨度；负重轮盘 0.79）
  maxWheelX: 0.45,       // 轮体 x 向最大跨度
  roadMinX: 1.3,         // 外排轮 x 门（内排交错轮 x±1.22 排除留静态）
  anchors: [
    { kind: 'sprocket', z: 3.00,  y: 0.87, r: 0.5, discR: 0.47, zGate: 0.5 },   // 前主动轮（含齿圈）
    { kind: 'idler',    z: -2.74, y: 0.70, r: 0.4, discR: 0.34, zGate: 0.4 },   // 后诱导轮
    { kind: 'road',     z: 0,     y: 0.47, r: 0.3, discR: 0.4 },                // 负重轮（z 由种子发现）
  ],
  roadZone: [-2.4, 2.55],
};

function worldMat(node) {
  const parents = node.listParents().filter(p => p.propertyType === 'Node');
  const m = node.getMatrix();
  if (!parents.length) return m;
  const pm = worldMat(parents[0]);
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++)
    out[c * 4 + r] += pm[k * 4 + r] * m[c * 4 + k];
  return out;
}
function mulVec(m, v) {
  return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
}
const keyOf = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(path.join(__dirname, '..', V.src));
  const root = doc.getRoot();
  const wheelNodes = new Set(V.wheelNodes);

  // ── 参考件世界包围盒（config 标定用）──
  for (const ref of ['Object_15', 'Object_5', 'Object_3', 'Object_7', 'Object_14']) {
    const node = root.listNodes().find(n => n.getName() === ref);
    if (!node || !node.getMesh()) { console.log(`${ref}: 无网格`); continue; }
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    const wm = worldMat(node);
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const pa = pos.getArray();
      for (let v = 0; v < pa.length; v += 3) {
        const p = mulVec(wm, [pa[v], pa[v + 1], pa[v + 2]]);
        for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
      }
    }
    console.log(`${ref} bbox min=[${mn.map(v=>v.toFixed(2))}] max=[${mx.map(v=>v.toFixed(2))}]`);
  }

  // ── ① 收集轮件节点全部三角面（世界坐标）──
  const primJobs = [];
  for (const node of root.listNodes()) {
    if (!wheelNodes.has(node.getName()) || !node.getMesh()) continue;
    const wm = worldMat(node);
    for (const prim of node.getMesh().listPrimitives()) {
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
        tris.push({ vs, wv, c, bucket: null });
      }
      primJobs.push({ node, prim, attrInfo, mat: prim.getMaterial(), tris });
    }
  }
  const allTris = primJobs.flatMap(j => j.tris);
  console.log(`轮件三角面共 ${allTris.length}`);

  // ── ② 连通分量 ──
  const v2t = new Map();
  allTris.forEach((t, i) => { for (const p of t.wv) { const k = keyOf(p); (v2t.get(k) || v2t.set(k, []).get(k)).push(i); } });
  const compId = new Array(allTris.length).fill(-1);
  const comps = [];
  for (let i = 0; i < allTris.length; i++) {
    if (compId[i] >= 0) continue;
    const id = comps.length, stack = [i], member = [];
    compId[i] = id;
    while (stack.length) {
      const cur = stack.pop(); member.push(cur);
      for (const p of allTris[cur].wv) for (const j of v2t.get(keyOf(p)) || [])
        if (compId[j] < 0) { compId[j] = id; stack.push(j); }
    }
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], mxs = 0;
    for (const ti of member) {
      for (const p of allTris[ti].wv) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
      mxs += allTris[ti].c[0] / member.length;
    }
    comps.push({ id, n: member.length, member, mn, mx, ctr: [(mn[0]+mx[0])/2, (mn[1]+mx[1])/2, (mn[2]+mx[2])/2],
      spanX: mx[0]-mn[0], spanY: mx[1]-mn[1], spanZ: mx[2]-mn[2], side: mxs > 0 ? 'R' : 'L' });
  }
  console.log(`连通分量 ${comps.length} 个`);

  // ── ③ 种子发现（外排门 |x|≥roadMinX：内排交错轮不切）──
  const seeds = [];
  const roadAnchor = V.anchors.find(a => a.kind === 'road');
  for (const c of comps) {
    if (c.spanY < V.discSpan || c.spanZ < V.discSpan) continue;
    if (c.ctr[1] > 1.45) continue;
    if (c.spanX > V.maxWheelX) continue;
    if (Math.abs(c.ctr[0]) < V.roadMinX) continue;                      // 内排交错轮留静态
    if (c.ctr[2] < V.roadZone[0] || c.ctr[2] > V.roadZone[1]) continue;
    const near = seeds.find(s => s.kind === 'road' && s.side === c.side && Math.hypot(s.z - c.ctr[2], s.y - c.ctr[1]) < 0.3);
    if (!near) seeds.push({ kind: 'road', side: c.side, z: c.ctr[2], y: c.ctr[1], r: roadAnchor.r,
      discR: Math.max(c.spanY, c.spanZ) / 2 });
  }
  for (const a of V.anchors) {
    if (a.kind === 'road') continue;
    for (const side of ['R', 'L']) seeds.push({ kind: a.kind, side, z: a.z, y: a.y, r: a.r, discR: a.discR, zGate: a.zGate });
  }
  console.log(`种子 ${seeds.length}：` + seeds.map(s => `${s.kind}${s.side}@${s.z.toFixed(2)}`).join(' '));

  // ── ④ 分量归桶 ──
  const buckets = new Map();
  for (const c of comps) {
    let best = null, bestD = 1e9;
    for (const s of seeds) {
      if (s.side !== c.side) continue;
      const d = Math.hypot(s.z - c.ctr[2], s.y - c.ctr[1]);
      const lim = s.kind === 'road' ? s.r : s.r + 0.15;
      if (d < bestD && d <= lim) { bestD = d; best = s; }
    }
    if (!best) continue;
    let maxR = 0;
    for (const ti of c.member) for (const p of allTris[ti].wv)
      maxR = Math.max(maxR, Math.hypot(p[2] - best.z, p[1] - best.y));
    if (maxR > best.discR * 1.25) continue;
    if (best.kind !== 'road' && Math.abs(c.ctr[2] - best.z) > (best.zGate ?? (best.discR + 0.06))) continue;
    if (best.kind === 'road' && bestD > 0.16 && (c.spanY < V.discSpan || c.spanZ < V.discSpan)) continue;
    const name = best.kind === 'road' ? ('wheel' + best.side + '@' + best.z.toFixed(2)) : (best.kind + best.side);
    c.bucket = name;
    if (!buckets.has(name)) buckets.set(name, []);
  }
  for (let i = 0; i < allTris.length; i++) {
    const c = comps[compId[i]];
    if (c.bucket) allTris[i].bucket = c.bucket;
  }
  for (const t of allTris) if (t.bucket) buckets.get(t.bucket).push(t);

  const roadNames = [...buckets.keys()].filter(k => k.startsWith('wheel'))
    .sort((a, b) => parseFloat(a.split('@')[1]) - parseFloat(b.split('@')[1]));
  const renamed = new Map();
  const cnt = { R: 0, L: 0 };
  for (const k of roadNames) {
    const isR = k.startsWith('wheelR@');
    renamed.set(k, (isR ? 'wheelR' : 'wheelL') + (++cnt[isR ? 'R' : 'L']));
  }
  console.log('轮桶：' + [...renamed.entries()].map(([o, n]) => `${o}→${n}(${buckets.get(o).length})`).join(' ')
    + ' ' + [...buckets.keys()].filter(k => !k.startsWith('wheel')).map(k => `${k}(${buckets.get(k).length})`).join(' '));

  // ── ⑤ 逐 primitive 重建 ──
  const wheelTris = new Map();
  let extracted = 0, kept = 0;
  for (const job of primJobs) {
    const { prim, attrInfo, mat, tris } = job;
    const keepTris = [], wb = new Map();
    for (const t of tris) {
      if (!t.bucket) { keepTris.push(t.vs); continue; }
      const outName = renamed.get(t.bucket) || t.bucket;
      if (!wb.has(outName)) wb.set(outName, []);
      wb.get(outName).push(t);
    }
    kept += keepTris.length;
    if (keepTris.length === tris.length) continue;
    const build = (triList) => {
      const out = {};
      for (const a of attrInfo) out[a.sem] = [];
      for (const vs of triList) for (const v of vs)
        for (const a of attrInfo) for (let k = 0; k < a.n; k++) out[a.sem].push(a.arr[v * a.n + k]);
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
    for (const [name, tris2] of wb) {
      extracted += tris2.length;
      if (!wheelTris.has(name)) wheelTris.set(name, { mat, data: {}, types: {}, node: job.node });
      const entry = wheelTris.get(name);
      const b = build(tris2.map(t => t.vs));
      for (const a of attrInfo) {
        if (!entry.data[a.sem]) { entry.data[a.sem] = []; entry.types[a.sem] = { ArrayType: a.ArrayType, type: a.type }; }
        entry.data[a.sem].push(...b[a.sem]);
      }
    }
  }
  console.log(`切割完成：抽出 ${extracted} 面 / 保留 ${kept} 面`);

  // ── ⑥ 生成轮节点 ──
  const buffer = root.listBuffers()[0] || doc.createBuffer();
  for (const [name, entry] of wheelTris) {
    const mesh = doc.createMesh(name);
    const prim = doc.createPrimitive().setMaterial(entry.mat);
    for (const sem of Object.keys(entry.data)) {
      const t = entry.types[sem];
      const acc = doc.createAccessor().setType(t.type).setArray(new t.ArrayType(entry.data[sem])).setBuffer(buffer);
      prim.setAttribute(sem, acc);
    }
    mesh.addPrimitive(prim);
    const node = doc.createNode(name).setMesh(mesh).setMatrix(entry.node.getMatrix());
    const parents = entry.node.listParents().filter(p => p.propertyType === 'Node');
    (parents[0] || root.listScenes()[0]).addChild(node);
    console.log(`  ${name}: ${entry.data.POSITION.length / 3} verts`);
  }

  await doc.transform(metalRough(), prune());
  await io.write(path.join(__dirname, '..', V.out), doc);
  const b = getBounds(root.getDefaultScene() || root.listScenes()[0]);
  console.log('已写出 ' + V.out + `  整车 bounds [${b.min.map(v=>v.toFixed(2))}] ~ [${b.max.map(v=>v.toFixed(2))}]`);
})().catch(e => { console.error(e); process.exit(1); });
