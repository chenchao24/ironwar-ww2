// M26 潘兴（tankModel/m26_pershing.glb）结构分析：
//   ① 全节点清单（世界 bbox、三角面数、材质类型）
//   ② 轮件 Object_11/12/14/15 连通分量分析（轮带布局）
//   ③ Object_23（同轴机枪合并件）y/z 簇分布 → 找车体/炮塔机枪分离面
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
function mulVec(m, v) { return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[1]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]; }
function worldMat(nd) {
  const p = nd.listParents().filter(p => p.propertyType === 'Node');
  const m = nd.getMatrix();
  if (!p.length) return m;
  const pm = worldMat(p[0]);
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c*4+r] += pm[k*4+r]*m[c*4+k];
  return o;
}
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read('tankModel/m26_pershing.glb');
  const root = doc.getRoot();
  // 材质体系
  const mats = root.listMaterials();
  console.log('材质数:', mats.length, mats.map(m => m.getName()).join(', '));
  const exts = root.listExtensionsUsed().map(e => e.extensionName);
  console.log('扩展:', exts.join(', ') || '(无)');
  // ① 节点清单
  console.log('\n── 节点清单 ──');
  const nodeWM = new Map();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    const wm = worldMat(node);
    nodeWM.set(node, wm);
    if (!mesh) { console.log(`  ${node.getName()} [无网格] children=${node.listChildren().length}`); continue; }
    let xs=[1e9,-1e9], ys=[1e9,-1e9], zs=[1e9,-1e9], nVerts=0, nTris=0;
    for (const prim of mesh.listPrimitives()) {
      const arr = prim.getAttribute('POSITION').getArray();
      const idx = prim.getIndices() ? prim.getIndices().getArray() : null;
      nTris += (idx ? idx.length : arr.length / 3) / 3;
      nVerts += arr.length / 3;
      for (let i = 0; i < arr.length; i += 3) {
        const w = mulVec(wm, [arr[i], arr[i+1], arr[i+2]]);
        xs=[Math.min(xs[0],w[0]),Math.max(xs[1],w[0])];
        ys=[Math.min(ys[0],w[1]),Math.max(ys[1],w[1])];
        zs=[Math.min(zs[0],w[2]),Math.max(zs[1],w[2])];
      }
    }
    const p = node.getTranslation();
    console.log(`  ${node.getName().padEnd(12)} tris=${String(Math.round(nTris)).padStart(6)} verts=${String(Math.round(nVerts)).padStart(6)} localT=(${p.map(v=>v.toFixed(2))}) x[${xs[0].toFixed(2)},${xs[1].toFixed(2)}] y[${ys[0].toFixed(2)},${ys[1].toFixed(2)}] z[${zs[0].toFixed(2)},${zs[1].toFixed(2)}]`);
  }
  // ② 轮件连通分量：全部轮件节点的三角面，按 |x| 分层 + 连通聚类
  const WHEEL_NODES = ['Object_11', 'Object_12', 'Object_14', 'Object_15'];
  const tris = [];
  for (const node of root.listNodes()) {
    if (!node.getMesh() || !WHEEL_NODES.includes(node.getName())) continue;
    const wm = nodeWM.get(node);
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray();
      const idx = prim.getIndices() ? prim.getIndices().getArray() : null;
      const n = (idx ? idx.length : pos.length / 3) / 3;
      for (let t = 0; t < n; t++) {
        const wv = [], c = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          const v = idx ? idx[t*3+k] : t*3+k;
          const p = mulVec(wm, [pos[v*3], pos[v*3+1], pos[v*3+2]]);
          wv.push(p); c[0]+=p[0]/3; c[1]+=p[1]/3; c[2]+=p[2]/3;
        }
        tris.push({ wv, c, node: node.getName() });
      }
    }
  }
  console.log('\n── 轮件三角面总数:', tris.length, '──');
  // 连通分量（共享顶点，全轮带）
  const v2t = new Map();
  const keyOf = p => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
  tris.forEach((t, i) => { for (const p of t.wv) { const k = keyOf(p); if (!v2t.has(k)) v2t.set(k, []); v2t.get(k).push(i); } });
  const comp = new Array(tris.length).fill(-1);
  let nc = 0;
  for (let i = 0; i < tris.length; i++) {
    if (comp[i] >= 0) continue;
    const q = [i]; comp[i] = nc;
    while (q.length) {
      const a = q.pop();
      for (const p of tris[a].wv) for (const j of v2t.get(keyOf(p)) || []) {
        if (comp[j] < 0) { comp[j] = nc; q.push(j); }
      }
    }
    nc++;
  }
  const groups = new Map();
  for (let i = 0; i < tris.length; i++) {
    if (!groups.has(comp[i])) groups.set(comp[i], []);
    groups.get(comp[i]).push(i);
  }
  const big = [...groups.values()].filter(g => g.length > 20).sort((a, b) => b.length - a.length);
  console.log(`连通分量: 共 ${groups.size} 个，>20 面的大分量 ${big.length} 个`);
  for (const g of big) {
    let xs=[1e9,-1e9], ys=[1e9,-1e9], zs=[1e9,-1e9], mx=0;
    for (const i of g) for (const p of tris[i].wv) {
      xs=[Math.min(xs[0],p[0]),Math.max(xs[1],p[0])];
      ys=[Math.min(ys[0],p[1]),Math.max(ys[1],p[1])];
      zs=[Math.min(zs[0],p[2]),Math.max(zs[1],p[2])];
    }
    for (const i of g) mx += tris[i].c[0] / g.length;
    console.log(`  n=${String(g.length).padStart(5)} 源=${tris[g[0]].node.padEnd(10)} x[${xs[0].toFixed(2)},${xs[1].toFixed(2)}] y[${ys[0].toFixed(2)},${ys[1].toFixed(2)}] z[${zs[0].toFixed(2)},${zs[1].toFixed(2)}] 中心(z=${((zs[0]+zs[1])/2).toFixed(2)},y=${((ys[0]+ys[1])/2).toFixed(2)}) 质心x=${mx.toFixed(2)}`);
  }
  // ③ Object_23 机枪簇：y/z 直方图
  const n23 = root.listNodes().find(n => n.getName() === 'Object_23');
  if (n23 && n23.getMesh()) {
    const wm = nodeWM.get(n23);
    const pts = [];
    for (const prim of n23.getMesh().listPrimitives()) {
      const arr = prim.getAttribute('POSITION').getArray();
      for (let i = 0; i < arr.length; i += 3) pts.push(mulVec(wm, [arr[i], arr[i+1], arr[i+2]]));
    }
    console.log('\n── Object_23 顶点数:', pts.length, '──');
    // y 直方图（0.05 桶）
    const hy = new Map();
    for (const p of pts) { const b = Math.round(p[1] / 0.05) * 0.05; hy.set(b, (hy.get(b) || 0) + 1); }
    console.log('y 直方图:');
    for (const [b, c] of [...hy.entries()].sort((a, b) => a[0] - b[0])) console.log(`  y=${b.toFixed(2)}: ${'#'.repeat(Math.min(80, Math.ceil(c / Math.max(1, pts.length / 300))))} ${c}`);
    // 按 y 分两段打印各自 x/z 范围
    const ysArr = pts.map(p => p[1]).sort((a, b) => a - b);
    console.log(`y 范围 [${ysArr[0].toFixed(3)}, ${ysArr[ysArr.length-1].toFixed(3)}]`);
  }
})().catch(e => { console.error(e); process.exit(1); });
