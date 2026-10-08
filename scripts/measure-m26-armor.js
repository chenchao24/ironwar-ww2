// M26 装甲几何精测：首上倾角（分位回归抗突起干扰）、侧壁分层、车尾、前特写截图
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
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read('model/m26_pershing.glb');
  const root = doc.getRoot();
  const byName = (n) => root.listNodes().find(x => x.getName() === n);
  let hull = [];
  for (const nm of ['Object_13', 'Object_16', 'Object_17', 'Object_18', 'Object_8', 'Object_20']) {
    const n = byName(nm); if (!n) continue;
    const wm = worldMat(n);
    for (const prim of n.getMesh().listPrimitives()) {
      const arr = prim.getAttribute('POSITION').getArray();
      for (let i = 0; i < arr.length; i += 3) hull.push(mulVec(wm, [arr[i], arr[i+1], arr[i+2]]));
    }
  }
  // ① 首上：y∈[0.85,1.55] 前缘（z 85 分位/桶 0.05）线性拟合 z = a*y + b
  {
    const front = hull.filter(p => p[2] > 2.2 && Math.abs(p[0]) < 1.05 && p[1] > 0.8 && p[1] < 1.6);
    const bins = new Map();
    for (const p of front) {
      const b = Math.round(p[1] / 0.05) * 0.05;
      if (!bins.has(b)) bins.set(b, []);
      bins.get(b).push(p[2]);
    }
    const rows = [...bins.entries()].map(([y, zs]) => { zs.sort((a, b) => a - b); return [y, zs[Math.floor(zs.length * 0.85)]]; }).sort((a, b) => a[0] - b[0]);
    // 拟合主段 y∈[0.9,1.55]
    const seg = rows.filter(r => r[0] >= 0.9 && r[0] <= 1.55);
    let sy = 0, sz = 0, syy = 0, syz = 0;
    for (const [y, z] of seg) { sy += y; sz += z; syy += y * y; syz += y * z; }
    const n = seg.length, my = sy / n, mz = sz / n;
    const a = (syz - n * my * mz) / (syy - n * my * my);
    const tiltV = Math.atan(-a) * 180 / Math.PI;   // a=dz/dy 负 → 上缘后倾；角度=距垂直
    console.log(`① 首上: dz/dy=${a.toFixed(2)} → 距垂直 ${tiltV.toFixed(1)}°（rot≈${(-tiltV).toFixed(0)}）；过 (y=1.2, z=${(mz + a * (1.2 - my)).toFixed(2)})`);
    console.log('   分段:', seg.map(r => `y${r[0].toFixed(2)}/z${r[1].toFixed(2)}`).join(' '));
    // 首下段 y∈[0.35,0.85]
    const seg2 = rows.filter(r => r[0] >= 0.35 && r[0] < 0.85);
    console.log('   首下段:', seg2.map(r => `y${r[0].toFixed(2)}/z${r[1].toFixed(2)}`).join(' '));
  }
  // ② 侧壁分层：y∈[1.05,1.45] 与 y∈[0.5,1.0] 的 |x| 直方图（z∈[-2.4,2.2]）
  for (const [yLo, yHi, label] of [[1.05, 1.45, '侧上带'], [0.45, 1.0, '行走部带']]) {
    const hx = new Map();
    for (const p of hull) {
      if (p[1] < yLo || p[1] > yHi || p[2] < -2.4 || p[2] > 2.2 || Math.abs(p[0]) < 1.0) continue;
      const b = Math.round(Math.abs(p[0]) / 0.05) * 0.05;
      hx.set(b, (hx.get(b) || 0) + 1);
    }
    console.log(`② ${label} |x| 直方图:`);
    for (const [b, c] of [...hx.entries()].sort((a, b) => a[0] - b[0])) console.log(`   |x|=${b.toFixed(2)}: ${'#'.repeat(Math.min(60, Math.ceil(c / 40)))} ${c}`);
  }
  // ③ 车尾轮廓：z<-2.6, |x|<1.05 后缘（z 15 分位/桶）
  {
    const rear = hull.filter(p => p[2] < -2.6 && Math.abs(p[0]) < 1.05);
    const bins = new Map();
    for (const p of rear) {
      const b = Math.round(p[1] / 0.1) * 0.1;
      if (!bins.has(b)) bins.set(b, []);
      bins.get(b).push(p[2]);
    }
    const rows = [...bins.entries()].map(([y, zs]) => { zs.sort((a, b) => a - b); return [y, zs[Math.floor(zs.length * 0.15)]]; }).sort((a, b) => a[0] - b[0]);
    console.log('③ 车尾轮廓 (y → z_15%):', rows.map(r => `y${r[0].toFixed(1)}/z${r[1].toFixed(2)}`).join(' '));
  }
})().catch(e => { console.error(e); process.exit(1); });
