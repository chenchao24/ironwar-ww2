// 诊断 wheelRS/wheelLS 网格里的大三角面：位置、半径、法线
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');

function mulVec(m, v) {
  return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],
          m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],
          m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
}

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read('model/tiger2.glb');
  for (const name of ['wheelRS', 'wheelLS']) {
    const node = doc.getRoot().listNodes().find(n => n.getName() === name);
    if (!node) { console.log(name, 'missing'); continue; }
    // 世界矩阵：沿父链累乘（与 split 脚本一致）
    const worldMat = (nd) => {
      const parents = nd.listParents().filter(p => p.propertyType === 'Node');
      const m = nd.getMatrix();
      if (!parents.length) return m;
      const pm = worldMat(parents[0]);
      const out = new Array(16).fill(0);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c*4+r] += pm[k*4+r] * m[c*4+k];
      return out;
    };
    const wm = worldMat(node);
    const prim = node.getMesh().listPrimitives()[0];
    const arr = prim.getAttribute('POSITION').getArray();
    const tris = [];
    for (let t = 0; t < arr.length / 9; t++) {
      const wv = [];
      for (let k = 0; k < 3; k++) wv.push(mulVec(wm, [arr[t*9+k*3], arr[t*9+k*3+1], arr[t*9+k*3+2]]));
      const area = (() => {
        const u = [wv[1][0]-wv[0][0], wv[1][1]-wv[0][1], wv[1][2]-wv[0][2]];
        const v = [wv[2][0]-wv[0][0], wv[2][1]-wv[0][1], wv[2][2]-wv[0][2]];
        const c = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
        return Math.hypot(...c) / 2;
      })();
      const c = [(wv[0][0]+wv[1][0]+wv[2][0])/3, (wv[0][1]+wv[1][1]+wv[2][1])/3, (wv[0][2]+wv[1][2]+wv[2][2])/3];
      tris.push({ area, c, wv });
    }
    tris.sort((a, b) => b.area - a.area);
    // 轮心（脚本标定值）
    const WC = name === 'wheelRS' ? { z: -2.54, y: 0.64 } : { z: -2.54, y: 0.64 };
    let xs = [1e9, -1e9], ys = [1e9, -1e9], zs = [1e9, -1e9];
    for (const t of tris) for (const p of t.wv) {
      xs = [Math.min(xs[0], p[0]), Math.max(xs[1], p[0])];
      ys = [Math.min(ys[0], p[1]), Math.max(ys[1], p[1])];
      zs = [Math.min(zs[0], p[2]), Math.max(zs[1], p[2])];
    }
    console.log(`\n${name}: ${tris.length} tris, bbox x[${xs.map(v=>v.toFixed(2))}] y[${ys.map(v=>v.toFixed(2))}] z[${zs.map(v=>v.toFixed(2))}]`);
    console.log('最大的 12 个三角面（area, 质心 x/y/z, 质心到轮心半径, 最大顶点半径）:');
    for (const t of tris.slice(0, 12)) {
      const rc = Math.hypot(t.c[2] - WC.z, t.c[1] - WC.y);
      const rv = Math.max(...t.wv.map(p => Math.hypot(p[2] - WC.z, p[1] - WC.y)));
      console.log(`  area=${t.area.toFixed(4)} c=(${t.c.map(v=>v.toFixed(2))}) rc=${rc.toFixed(2)} rv=${rv.toFixed(2)}`);
    }
    // 面积分布
    const big = tris.filter(t => t.area > 0.01);
    console.log(`area>0.01 的三角面: ${big.length}，总面积 ${big.reduce((s,t)=>s+t.area,0).toFixed(3)}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
