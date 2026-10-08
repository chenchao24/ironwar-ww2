// 分析 pz.kpfw._vi 源模型中 S/I 轮位三角面质心分布，定位挡泥板混入区域
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');

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
  const doc = await io.read('tankModel/pz.kpfw._vi.glb');
  const root = doc.getRoot();

  // 与 split 脚本一致的轮心（直接复用其打印值的种子；S/I 用环带精修）
  const bandR = [], bandL = [];
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
  const wheels = [];
  for (let k = 0; k < 9; k++) wheels.push({ id: k + 1, z: -1.955 + 0.544 * k, y: 0.45, r: 0.42 });
  const sp = refine(-2.85, 0.85, 1.15, 0.2); wheels.push({ id: 'S', z: sp.z, y: sp.y, r: 0.48 });
  const idl = refine(3.15, 0.7, 1.1, 0.25); wheels.push({ id: 'I', z: idl.z, y: idl.y, r: 0.44 });
  console.log('S 轮心:', sp.z.toFixed(2), sp.y.toFixed(2), ' I 轮心:', idl.z.toFixed(2), idl.y.toFixed(2));

  // 收集 Object_13/15 中、以 (S/I) 轮心为圆心 r 内、x>0.9 的三角面质心（不做 x 带过滤，看全貌）
  for (const w of [sp && wheels[9], wheels[10]]) {
    const rows = [];
    for (const node of root.listNodes()) {
      if (node.getName() !== 'Object_13' && node.getName() !== 'Object_15') continue;
      const wm = nodeWM.get(node);
      for (const prim of node.getMesh().listPrimitives()) {
        const posArr = prim.getAttribute('POSITION').getArray();
        const idxArr = prim.getIndices() ? prim.getIndices().getArray() : null;
        const triCount = (idxArr ? idxArr.length : posArr.length / 3) / 3;
        for (let t = 0; t < triCount; t++) {
          const c = [0, 0, 0];
          for (let k = 0; k < 3; k++) {
            const v = idxArr ? idxArr[t * 3 + k] : t * 3 + k;
            const wv = mulVec(wm, [posArr[v * 3], posArr[v * 3 + 1], posArr[v * 3 + 2]]);
            c[0] += wv[0] / 3; c[1] += wv[1] / 3; c[2] += wv[2] / 3;
          }
          const d = Math.hypot(c[2] - w.z, c[1] - w.y);
          if (d < 0.75 && Math.abs(c[0]) > 0.9 && c[1] < 1.6) rows.push([+c[2].toFixed(2), +c[1].toFixed(2), +c[0].toFixed(2), +d.toFixed(2)]);
        }
      }
    }
    // 按 (z-y) 网格统计
    const grid = {};
    for (const [z, y] of rows) {
      const k = `${Math.round((z - w.z) * 5) / 5},${Math.round((y - w.y) * 5) / 5}`;
      grid[k] = (grid[k] || 0) + 1;
    }
    console.log(`\n轮 ${w.id} (圆心 z=${w.z.toFixed(2)} y=${w.y.toFixed(2)}) 质心 (dz,dy)→数量：`);
    const keys = Object.keys(grid).sort((a, b) => grid[b] - grid[a]);
    for (const k of keys.slice(0, 40)) console.log(`  dz,dy = ${k}  n=${grid[k]}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
