// 履带可见侧面（外缘 z 极值带 + 中段 y）的 纵向x 与 u/v 斜率标定
// 虎式 = 参照（offset.x 递增=正确）；T-34 用同规则推符号
const { NodeIO } = require('@gltf-transform/core');
const path = require('path');

function matMul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
const apply = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

async function probe(file, names) {
  const io = new NodeIO();
  const doc = await io.read(path.join(__dirname, '../model/', file));
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const walk = (node, pm) => {
    const m = matMul(pm, node.getMatrix());
    if (node.getMesh() && names.some(t => node.getName().startsWith(t))) {
      const prim = node.getMesh().listPrimitives()[0];
      const pa = prim.getAttribute('POSITION').getArray();
      const ua = prim.getAttribute('TEXCOORD_0').getArray();
      const N = pa.length / 3;
      const pts = [];
      for (let i = 0; i < N; i++) {
        const w = apply(m, pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]);
        pts.push([w[0], w[1], w[2], ua[i * 2], ua[i * 2 + 1]]);
      }
      let xMin = 1e9, xMax = -1e9, yMin = 1e9, yMax = -1e9, zMin = 1e9, zMax = -1e9;
      for (const p of pts) {
        xMin = Math.min(xMin, p[0]); xMax = Math.max(xMax, p[0]);
        yMin = Math.min(yMin, p[1]); yMax = Math.max(yMax, p[1]);
        zMin = Math.min(zMin, p[2]); zMax = Math.max(zMax, p[2]);
      }
      // 可见外侧面：|z| 极值侧 0.08m 带；y 取中间 60%；x 去掉前后 25% 弧度段
      const zEdge = Math.abs(zMax) > Math.abs(zMin) ? zMax : zMin;
      const zLo = zEdge - Math.sign(zEdge) * 0.08;
      const yLo = yMin + (yMax - yMin) * 0.2, yHi = yMax - (yMax - yMin) * 0.2;
      const xLo = xMin + (xMax - xMin) * 0.25, xHi = xMax - (xMax - xMin) * 0.25;
      const sel = pts.filter(p =>
        (Math.sign(zEdge) > 0 ? (p[2] >= zLo) : (p[2] <= zLo)) &&
        p[1] >= yLo && p[1] <= yHi && p[0] >= xLo && p[0] <= xHi);
      for (const [label, ai] of [['u', 3], ['v', 4]]) {
        if (sel.length < 4) { console.log(`  ${node.getName()} ${label}: 样本不足 ${sel.length}`); continue; }
        let sx = 0, sa = 0;
        for (const p of sel) { sx += p[0]; sa += p[ai]; }
        sx /= sel.length; sa /= sel.length;
        let sxx = 0, saa = 0, sxa = 0;
        for (const p of sel) { const dx = p[0] - sx, da = p[ai] - sa; sxx += dx * dx; saa += da * da; sxa += dx * da; }
        console.log(`  ${node.getName()} 侧面 n=${sel.length} d${label}/dx 斜率=${(sxa / (sxx + 1e-12)).toFixed(3)} corr=${(sxa / Math.sqrt(sxx * saa + 1e-12)).toFixed(3)}`);
      }
    }
    node.listChildren().forEach(c => walk(c, m));
  };
  scene.listChildren().forEach(c => walk(c, I));
}

(async () => {
  console.log('虎式（参照：滚 U / offset.x 递增 = 前进正确）:');
  await probe('tiger1.glb', ['track1_pz', 'track2_pz']);
  console.log('T-34-85（待标定）:');
  await probe('t-34-85_85_mm.glb', ['Object_4', 'Object_6']);
})().catch(e => { console.error(e); process.exit(1); });
