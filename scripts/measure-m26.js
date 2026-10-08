// 量测 model/m26_pershing.glb：轮 bbox 对中性（偏心 ≤5cm 硬指标）、枢轴/炮口/履带UV/排气
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
function nodeBBox(node) {
  const wm = worldMat(node);
  let xs=[1e9,-1e9], ys=[1e9,-1e9], zs=[1e9,-1e9], n=0;
  const pts = [];
  for (const prim of node.getMesh().listPrimitives()) {
    const arr = prim.getAttribute('POSITION').getArray();
    for (let i = 0; i < arr.length; i += 3) {
      const w = mulVec(wm, [arr[i], arr[i+1], arr[i+2]]);
      pts.push(w); n++;
      xs=[Math.min(xs[0],w[0]),Math.max(xs[1],w[0])];
      ys=[Math.min(ys[0],w[1]),Math.max(ys[1],w[1])];
      zs=[Math.min(zs[0],w[2]),Math.max(zs[1],w[2])];
    }
  }
  return { xs, ys, zs, pts };
}
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read('model/m26_pershing.glb');
  const root = doc.getRoot();
  // ① 轮对中性
  console.log('── 轮 bbox 对中性（z/y 范围关于中心的偏差）──');
  for (const node of root.listNodes()) {
    if (!node.getMesh() || !/^wheel/.test(node.getName())) continue;
    const { xs, ys, zs } = nodeBBox(node);
    const zc = (zs[0]+zs[1])/2, yc = (ys[0]+ys[1])/2;
    const rz = (zs[1]-zs[0])/2, ry = (ys[1]-ys[0])/2;
    console.log(`  ${node.getName().padEnd(9)} x[${xs[0].toFixed(2)},${xs[1].toFixed(2)}] y[${ys[0].toFixed(2)},${ys[1].toFixed(2)}] z[${zs[0].toFixed(2)},${zs[1].toFixed(2)}] 中心(z=${zc.toFixed(3)},y=${yc.toFixed(3)}) r=(z${rz.toFixed(3)}/y${ry.toFixed(3)}) ${Math.abs(rz-ry)>0.04?'⚠非圆':''}`);
  }
  // ② 机枪拆分后 bbox
  for (const nm of ['Object_23', 'coaxMg']) {
    const n = root.listNodes().find(x => x.getName() === nm);
    if (!n) { console.log('缺节点 ' + nm); continue; }
    const { xs, ys, zs } = nodeBBox(n);
    console.log(`── ${nm}: x[${xs[0].toFixed(2)},${xs[1].toFixed(2)}] y[${ys[0].toFixed(2)},${ys[1].toFixed(2)}] z[${zs[0].toFixed(2)},${zs[1].toFixed(2)}]`);
  }
  // ③ 炮塔底环带中心（炮塔节点 y∈[1.45,1.75] 顶点质心 x/z）
  {
    const pts = [];
    for (const nm of ['Object_9', 'Object_10']) {
      const n = root.listNodes().find(x => x.getName() === nm);
      if (n) pts.push(...nodeBBox(n).pts.filter(p => p[1] > 1.45 && p[1] < 1.75));
    }
    // 环带：取半径最大的外圈点
    let mx = 0, mz = 0, cnt = 0;
    const rs = pts.map(p => Math.hypot(p[0], p[2]));
    const rMax = Math.max(...rs);
    for (const p of pts) if (Math.hypot(p[0], p[2]) > rMax * 0.8) { mx += p[0]; mz += p[2]; cnt++; }
    console.log(`── 炮塔底环带中心: x=${(mx/cnt).toFixed(3)} z=${(mz/cnt).toFixed(3)} (n=${cnt}, rMax=${rMax.toFixed(2)})`);
  }
  // ④ 炮管轴线 + 炮口（Object_22 前段 z>4 的顶点）
  {
    const n = root.listNodes().find(x => x.getName() === 'Object_22');
    const { pts, zs } = nodeBBox(n);
    const front = pts.filter(p => p[2] > 4);
    let my = 0, mx = 0;
    for (const p of front) { my += p[1] / front.length; mx += p[0] / front.length; }
    console.log(`── 炮管: 前段轴线 x=${mx.toFixed(3)} y=${my.toFixed(3)}，炮口 z=${zs[1].toFixed(3)}`);
    // 炮尾 z 最小处（耳轴参考）
    const rear = pts.filter(p => p[2] < 0.6);
    let ry = 0; for (const p of rear) ry += p[1] / rear.length;
    console.log(`   炮尾段 y 均值=${ry.toFixed(3)}（z<0.6，n=${rear.length}）`);
  }
  // ⑤ 履带 UV（Object_4 右 / Object_6 左）：底段 y<0.35 顶点 u/v 与 z 相关性
  for (const nm of ['Object_4', 'Object_6']) {
    const n = root.listNodes().find(x => x.getName() === nm);
    if (!n) continue;
    const wm = worldMat(n);
    for (const prim of n.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray();
      const uvAcc = prim.getAttribute('TEXCOORD_0');
      if (!uvAcc) continue;
      const uv = uvAcc.getArray();
      const rows = [];
      let uMin=1e9,uMax=-1e9,vMin=1e9,vMax=-1e9;
      for (let i = 0; i < pos.length; i += 3) {
        const w = mulVec(wm, [pos[i], pos[i+1], pos[i+2]]);
        const u = uv[i/3*2], v = uv[i/3*2+1];
        uMin=Math.min(uMin,u);uMax=Math.max(uMax,u);vMin=Math.min(vMin,v);vMax=Math.max(vMax,v);
        rows.push({ z: w[2], y: w[1], u, v });
      }
      const bottom = rows.filter(r => r.y < 0.35);
      // corr(z,u)、corr(z,v)（底段）
      const corr = (a, b) => {
        const ma = a.reduce((s,x)=>s+x,0)/a.length, mb = b.reduce((s,x)=>s+x,0)/b.length;
        let num=0, da=0, db=0;
        for (let i=0;i<a.length;i++){ num+=(a[i]-ma)*(b[i]-mb); da+=(a[i]-ma)**2; db+=(b[i]-mb)**2; }
        return num/Math.sqrt(da*db||1);
      };
      console.log(`── 履带 ${nm}: uRange=${(uMax-uMin).toFixed(2)} vRange=${(vMax-vMin).toFixed(2)} 底段(n=${bottom.length}) corr(z,u)=${corr(bottom.map(r=>r.z),bottom.map(r=>r.u)).toFixed(2)} corr(z,v)=${corr(bottom.map(r=>r.z),bottom.map(r=>r.v)).toFixed(2)}`);
    }
  }
  // ⑥ 整车范围 + 排气点核对（md 排气 ×2.56 = (±0.08, 0.85, -3.04)）
  {
    let xs=[1e9,-1e9], ys=[1e9,-1e9], zs=[1e9,-1e9];
    for (const node of root.listNodes()) {
      if (!node.getMesh()) continue;
      const b = nodeBBox(node);
      xs=[Math.min(xs[0],b.xs[0]),Math.max(xs[1],b.xs[1])];
      ys=[Math.min(ys[0],b.ys[0]),Math.max(ys[1],b.ys[1])];
      zs=[Math.min(zs[0],b.zs[0]),Math.max(zs[1],b.zs[1])];
    }
    console.log(`── 整车: x[${xs[0].toFixed(2)},${xs[1].toFixed(2)}] y[${ys[0].toFixed(2)},${ys[1].toFixed(2)}] z[${zs[0].toFixed(2)},${zs[1].toFixed(2)}] 全长含炮=${(zs[1]-zs[0]).toFixed(2)}m`);
  }
})().catch(e => { console.error(e); process.exit(1); });
