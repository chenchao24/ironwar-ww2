// M26 装甲板/枢轴几何量测（第二部分）：炮塔座圈、首上倾角、侧壁、炮塔轮廓、履带UV方向
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

  // ① 炮塔座圈：Object_9（炮塔体）y∈[1.50,1.62] 带内的外圈顶点质心（剔除炮盾区 |z|>1.2）
  {
    const pts = nodePts(byName('Object_9')).filter(p => p[1] > 1.50 && p[1] < 1.62 && Math.abs(p[2]) < 1.2);
    let mx = 0, mz = 0;
    for (const p of pts) { mx += p[0] / pts.length; mz += p[2] / pts.length; }
    console.log(`① 炮塔座圈带(n=${pts.length}): x=${mx.toFixed(3)} z=${mz.toFixed(3)}`);
  }
  // ② 首上倾角：车体前部顶点（z>2.2, |x|<1.1, 0.5<y<1.6）在 (z,y) 平面按 y 分段取最大 z → 斜率
  {
    const hull = ['Object_13', 'Object_16', 'Object_17', 'Object_18'].map(byName).filter(Boolean);
    let pts = [];
    for (const n of hull) pts.push(...nodePts(n));
    const front = pts.filter(p => p[2] > 2.0 && Math.abs(p[0]) < 1.1 && p[1] > 0.4 && p[1] < 1.65);
    // y 分桶取 z 最大（最前缘）
    const bins = new Map();
    for (const p of front) {
      const b = Math.round(p[1] / 0.05) * 0.05;
      if (!bins.has(b) || bins.get(b) < p[2]) bins.set(b, p[2]);
    }
    const rows = [...bins.entries()].sort((a, b) => a[0] - b[0]);
    console.log('② 前缘轮廓 (y → z_max):');
    for (const [y, z] of rows) console.log(`   y=${y.toFixed(2)} z=${z.toFixed(3)}`);
  }
  // ③ 车体侧壁 x：侧带 |x|>1.2, 0.9<y<1.5, -2<z<2 的 |x| 分布
  {
    const hull = ['Object_13', 'Object_16', 'Object_17'].map(byName).filter(Boolean);
    let pts = [];
    for (const n of hull) pts.push(...nodePts(n));
    const side = pts.filter(p => Math.abs(p[0]) > 1.2 && p[1] > 0.9 && p[1] < 1.5 && p[2] > -2 && p[2] < 2).map(p => Math.abs(p[0])).sort((a, b) => a - b);
    const q = (f) => side[Math.floor(side.length * f)];
    console.log(`③ 侧壁 |x| 分位: 10%=${q(0.1).toFixed(2)} 50%=${q(0.5).toFixed(2)} 90%=${q(0.9).toFixed(2)} (n=${side.length})`);
    // 车体顶板 y：|x|<1.0, -2.5<z<2.5 高 y 分位
    const top = pts.filter(p => Math.abs(p[0]) < 1.0 && p[1] > 1.2 && p[1] < 1.7).map(p => p[1]).sort((a, b) => a - b);
    console.log(`   车顶 y 分位: 50%=${top[Math.floor(top.length*0.5)].toFixed(2)} 90%=${top[Math.floor(top.length*0.9)].toFixed(2)}`);
  }
  // ④ 炮塔轮廓：Object_9/10 在 y∈[1.9,2.6] 的前/侧/后缘
  {
    let pts = [...nodePts(byName('Object_9')), ...nodePts(byName('Object_10'))];
    const band = pts.filter(p => p[1] > 1.9 && p[1] < 2.6);
    let xs=[1e9,-1e9], zs=[1e9,-1e9], ys=[1e9,-1e9];
    for (const p of band) {
      xs=[Math.min(xs[0],p[0]),Math.max(xs[1],p[0])];
      ys=[Math.min(ys[0],p[1]),Math.max(ys[1],p[1])];
      zs=[Math.min(zs[0],p[2]),Math.max(zs[1],p[2])];
    }
    console.log(`④ 炮塔带 y[${ys[0].toFixed(2)},${ys[1].toFixed(2)}]: x[${xs[0].toFixed(2)},${xs[1].toFixed(2)}] z[${zs[0].toFixed(2)},${zs[1].toFixed(2)}]`);
    // 炮塔顶 y：z∈[-1,0.8] 内最高点分布
    const top = pts.filter(p => p[2] > -1 && p[2] < 0.8 && Math.abs(p[0]) < 0.9).map(p => p[1]).sort((a, b) => a - b);
    console.log(`   炮塔顶 y 90%分位=${top[Math.floor(top.length*0.9)].toFixed(2)} max=${top[top.length-1].toFixed(2)}`);
  }
  // ⑤ 履带 UV 方向：底段 frac(v) 锯齿斜率符号
  for (const nm of ['Object_4', 'Object_6']) {
    const node = byName(nm);
    const wm = worldMat(node);
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray();
      const uvAcc = prim.getAttribute('TEXCOORD_0');
      if (!uvAcc) continue;
      const uv = uvAcc.getArray();
      const rows = [];
      for (let i = 0; i < pos.length; i += 3) {
        const w = mulVec(wm, [pos[i], pos[i+1], pos[i+2]]);
        if (w[1] < 0.35) rows.push({ z: w[2], v: uv[i/3*2+1] % 1 });
      }
      rows.sort((a, b) => a.z - b.z);
      // 相邻点 dv/dz（排除跨砖缝 |dv|>0.5）
      let pos2 = 0, neg = 0;
      for (let i = 1; i < rows.length; i++) {
        const dz = rows[i].z - rows[i-1].z;
        if (dz < 0.005 || dz > 0.05) continue;
        const dv = rows[i].v - rows[i-1].v;
        if (Math.abs(dv) > 0.5) continue;
        if (dv > 0.001) pos2++; else if (dv < -0.001) neg++;
      }
      console.log(`⑤ 履带 ${nm} 底段: dv/dz 正=${pos2} 负=${neg} → ${neg > pos2 ? 'V 朝车尾递增（flip=true）' : 'V 朝车头递增（flip=false）'}`);
    }
  }
  // ⑥ 车尾排气管口：z<-2.9 且 0.3<y<1.3 的顶点簇（|x|<1.3）
  {
    const hull = ['Object_13', 'Object_16', 'Object_17'].map(byName).filter(Boolean);
    let pts = [];
    for (const n of hull) pts.push(...nodePts(n));
    const rear = pts.filter(p => p[2] < -2.9 && p[1] > 0.3 && p[1] < 1.3 && Math.abs(p[0]) < 1.3);
    // x 直方图找管口簇
    const hx = new Map();
    for (const p of rear) { const b = Math.round(p[0] / 0.1) * 0.1; hx.set(b, (hx.get(b) || 0) + 1); }
    console.log('⑥ 车尾下带顶点 x 直方图:');
    for (const [b, c] of [...hx.entries()].sort((a, b) => a[0] - b[0])) console.log(`   x=${b.toFixed(1)}: ${'#'.repeat(Math.min(60, c))} ${c}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
