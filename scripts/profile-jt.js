// 猎虎装甲轮廓实测：前/后/侧面逐层扫描（世界顶点，+z 前 / y 上）
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const xform = (m, v) => [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
(async () => {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('model/jagdtiger.glb');
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const SKIP = new Set(['Object_3', 'Object_7']);   // 履带不参与板面轮廓
  const pts = [];
  const walk = (node) => {
    if (node.getMesh() && !SKIP.has(node.getName()) && !node.getName().startsWith('wheel')
        && !node.getName().startsWith('sprocket') && !node.getName().startsWith('idler')) {
      for (const prim of node.getMesh().listPrimitives()) {
        const pos = prim.getAttribute('POSITION'); if (!pos) continue;
        const m = node.getWorldMatrix(); const v3 = [0, 0, 0];
        for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v3); pts.push(xform(m, v3)); }
      }
    }
    node.listChildren().forEach(walk);
  };
  scene.listChildren().forEach(walk);
  console.log(`顶点 ${pts.length}`);

  // ① 前面轮廓：y 层 × 中央带（|x|<1.3）最前 z
  console.log('\n── 正面（中央 |x|<1.3，各 y 层最前 z）──');
  for (let y = 0.2; y <= 2.8; y += 0.2) {
    const b = pts.filter(p => Math.abs(p[0]) < 1.3 && p[1] >= y && p[1] < y + 0.2);
    if (!b.length) continue;
    let fz = -1e9; for (const p of b) fz = Math.max(fz, p[2]);
    console.log(`y ${y.toFixed(1)}~${(y+0.2).toFixed(1)}: 最前 z=${fz.toFixed(2)}  (${b.length})`);
  }
  // ② 后面轮廓：y 层最后 z
  console.log('\n── 后面（|x|<1.3，各 y 层最后 z）──');
  for (let y = 0.2; y <= 2.8; y += 0.2) {
    const b = pts.filter(p => Math.abs(p[0]) < 1.3 && p[1] >= y && p[1] < y + 0.2);
    if (!b.length) continue;
    let rz = 1e9; for (const p of b) rz = Math.min(rz, p[2]);
    console.log(`y ${y.toFixed(1)}~${(y+0.2).toFixed(1)}: 最后 z=${rz.toFixed(2)}`);
  }
  // ③ 侧面轮廓：z 切片 × y 层的 |x| 极值（车体板，排除翼子板 y<1.0）
  console.log('\n── 侧面 |x|max（z 切片，车体层 y 1.0~2.0 / 战斗室层 2.0~2.7）──');
  for (let z = -3.8; z <= 3.6; z += 0.4) {
    const b1 = pts.filter(p => p[2] >= z && p[2] < z + 0.4 && p[1] >= 1.0 && p[1] < 2.0);
    const b2 = pts.filter(p => p[2] >= z && p[2] < z + 0.4 && p[1] >= 2.0 && p[1] < 2.7);
    const f = (b) => { let m = 0; for (const p of b) m = Math.max(m, Math.abs(p[0])); return b.length ? m.toFixed(2) : '—'; };
    console.log(`z ${z.toFixed(1)}~${(z+0.4).toFixed(1)}: hull x=${f(b1)}  case x=${f(b2)}`);
  }
  // ④ 顶面：z 切片的最高 y（|x|<1.2）
  console.log('\n── 顶面（z 切片 max y）──');
  for (let z = -3.8; z <= 3.6; z += 0.4) {
    const b = pts.filter(p => Math.abs(p[0]) < 1.2 && p[2] >= z && p[2] < z + 0.4);
    if (!b.length) continue;
    let my = 0; for (const p of b) my = Math.max(my, p[1]);
    console.log(`z ${z.toFixed(1)}~${(z+0.4).toFixed(1)}: maxY=${my.toFixed(2)}`);
  }
})();
