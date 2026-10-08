// su152 加强筋排查：打印每个负重轮位附近【未入轮桶】的静态分量（找楞线归属）
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
  // 输出模型中各轮的顶点集合（用来判定源三角面是否被抽出）
  const outDoc = await io.read('model/su152.glb');
  const outPts = [];
  for (const node of outDoc.getRoot().listNodes()) {
    if (!node.getMesh() || !/^wheel/.test(node.getName())) continue;
    const wm = worldMat(node);
    for (const prim of node.getMesh().listPrimitives()) {
      const arr = prim.getAttribute('POSITION').getArray();
      for (let i = 0; i < arr.length; i += 3) outPts.push(mulVec(wm, [arr[i], arr[i+1], arr[i+2]]).map(v => v.toFixed(2)).join(','));
    }
  }
  const outSet = new Set(outPts);
  // 源模型全部轮件节点
  const doc = await io.read('tankModel/su-152.glb');
  const tris = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh() || !['Object_12', 'Object_13', 'Object_18'].includes(node.getName())) continue;
    const wm = worldMat(node);
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
  // 轮心
  const centers = [];
  for (const side of [1, -1]) for (const z of [-2.12, -1.30, -0.47, 0.44, 1.37, 2.25]) centers.push([side > 0 ? 1.36 : -1.36, 0.35, z]);
  // 统计轮心 r=0.35 内、不在输出轮集合里的顶点分布
  for (const [cx, cy, cz] of centers) {
    const missed = new Map();
    for (const t of tris) {
      if (Math.hypot(t.c[2] - cz, t.c[1] - cy) > 0.35) continue;
      const key = t.wv[0].map(v => v.toFixed(2)).join(',');
      if (!outSet.has(key)) {
        const bucket = `${t.node}|${Math.round(Math.abs(t.c[0]) / 0.1) * 0.1}`;
        missed.set(bucket, (missed.get(bucket) || 0) + 1);
      }
    }
    if (missed.size) {
      console.log(`轮心(x=${cx.toFixed(1)},z=${cz}) 漏切三角面:`, [...missed.entries()].map(([k, n]) => `${k}×${n}`).join(' '));
    }
  }
  console.log('（无输出=全部轮面带顶点都在轮桶里）');
})().catch(e => { console.error(e); process.exit(1); });
