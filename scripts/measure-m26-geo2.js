// M26 补充量测：座圈（篮带质心）、炮盾/耳轴位置、履带 UV 方向（分桶中位数法）
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
function mulVec(m, v) { return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]; }
function worldMat(nd) {
  const p = nd.listParents().filter(p => p.propertyType === 'Node');
  const m = nd.getMatrix();
  if (!p.length) return m;
  const pm = worldMat(p[0]);
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c*4+r] += pm[k*4+r]*m[c*4+k];
  return o;
}
function nodePts(node) {
  const wm = worldMat(node);
  const pts = [];
  for (const prim of node.getMesh().listPrimitives()) {
    const arr = prim.getAttribute('POSITION').getArray();
    for (let i = 0; i < arr.length; i += 3) pts.push(mulVec(wm, [arr[i], arr[i+1], arr[i+2]]));
  }
  return pts;
}
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read('model/m26_pershing.glb');
  const root = doc.getRoot();
  const byName = (n) => root.listNodes().find(x => x.getName() === n);

  // ① 炮塔篮带（Object_9 的 y∈[1.30,1.50]，炮塔吊篮圆柱段）质心
  {
    const pts = nodePts(byName('Object_9')).filter(p => p[1] > 1.30 && p[1] < 1.50);
    let mx = 0, mz = 0;
    for (const p of pts) { mx += p[0] / pts.length; mz += p[2] / pts.length; }
    console.log(`① 炮塔篮带 y[1.30,1.50] (n=${pts.length}): x=${mx.toFixed(3)} z=${mz.toFixed(3)}`);
  }
  // ② Object_22 炮管+炮盾：z 分桶的最大 |x| / y 范围 → 炮盾段定位耳轴
  {
    const pts = nodePts(byName('Object_22'));
    const bins = new Map();
    for (const p of pts) {
      const b = Math.round(p[2] / 0.2) * 0.2;
      const e = bins.get(b) || { mx: 0, ys: [1e9, -1e9], n: 0 };
      e.mx = Math.max(e.mx, Math.abs(p[0]));
      e.ys = [Math.min(e.ys[0], p[1]), Math.max(e.ys[1], p[1])];
      e.n++;
      bins.set(b, e);
    }
    console.log('② Object_22 沿 z 截面（z → max|x| / y范围 / n）:');
    for (const [z, e] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
      if (z > 2.5) break;
      console.log(`   z=${z.toFixed(1)} max|x|=${e.mx.toFixed(2)} y[${e.ys[0].toFixed(2)},${e.ys[1].toFixed(2)}] n=${e.n}`);
    }
  }
  // ⑤ 履带 UV：底段 z 分桶 frac(v) 中位数 → 相邻桶 delta 符号统计
  for (const nm of ['Object_4', 'Object_6']) {
    const node = byName(nm);
    const wm = worldMat(node);
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray();
      const uvAcc = prim.getAttribute('TEXCOORD_0');
      if (!uvAcc) continue;
      const uv = uvAcc.getArray();
      const bins = new Map();
      for (let i = 0; i < pos.length; i += 3) {
        const w = mulVec(wm, [pos[i], pos[i+1], pos[i+2]]);
        if (w[1] >= 0.35) continue;
        const b = Math.round(w[2] / 0.1) * 0.1;
        if (!bins.has(b)) bins.set(b, []);
        bins.get(b).push(uv[i/3*2+1] % 1);
      }
      const rows = [...bins.entries()].sort((a, b) => a[0] - b[0])
        .map(([z, vs]) => { vs.sort((a, b) => a - b); return [z, vs[Math.floor(vs.length / 2)]]; });
      let pos2 = 0, neg = 0;
      for (let i = 1; i < rows.length; i++) {
        const dv = rows[i][1] - rows[i-1][1];
        if (Math.abs(dv) > 0.5) continue;   // 跨砖缝
        if (dv > 0) pos2++; else if (dv < 0) neg++;
      }
      console.log(`⑤ ${nm} 底段桶数=${rows.length} dv 正=${pos2} 负=${neg} → ${neg > pos2 ? 'flip=true' : 'flip=false'}`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
