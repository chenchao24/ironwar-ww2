// 猎虎补充实测：①战斗室侧面内倾角（z 中段，x|max| 随 y 变化）②前甲板高度/范围
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const xform = (m, v) => [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
(async () => {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('model/jagdtiger.glb');
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const SKIP = new Set(['Object_3', 'Object_7', 'Object_15', 'Object_2', 'Object_4', 'Object_6']);
  const pts = [];
  const walk = (node) => {
    const nm = node.getName();
    if (node.getMesh() && !SKIP.has(nm) && !/^(wheel|sprocket|idler)/.test(nm)) {
      for (const prim of node.getMesh().listPrimitives()) {
        const pos = prim.getAttribute('POSITION'); if (!pos) continue;
        const m = node.getWorldMatrix(); const v3 = [0, 0, 0];
        for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v3); pts.push(xform(m, v3)); }
      }
    }
    node.listChildren().forEach(walk);
  };
  scene.listChildren().forEach(walk);

  console.log('── ① 战斗室侧面 x|max|（z −1.6~1.3，y 0.1 步进；内倾 = x 随 y 减小）──');
  for (let y = 1.8; y <= 2.7; y += 0.1) {
    const b = pts.filter(p => p[2] >= -1.6 && p[2] < 1.3 && p[1] >= y && p[1] < y + 0.1);
    if (!b.length) continue;
    let mx = 0; for (const p of b) mx = Math.max(mx, Math.abs(p[0]));
    console.log(`y ${y.toFixed(1)}~${(y + 0.1).toFixed(1)}: xmax=${mx.toFixed(3)}  (${b.length})`);
  }

  console.log('\n── ② 前甲板（z 1.5~3.4，x 分带，y 1.6~2.1 顶面高度）──');
  for (const [xa, xb] of [[0, 0.6], [0.6, 1.6]]) {
    for (let z = 1.5; z <= 3.3; z += 0.3) {
      const b = pts.filter(p => Math.abs(p[0]) >= xa && Math.abs(p[0]) < xb && p[2] >= z && p[2] < z + 0.3 && p[1] > 1.6 && p[1] < 2.1);
      if (!b.length) { console.log(`x${xa}~${xb} z ${z.toFixed(1)}~${(z + 0.3).toFixed(1)}: —`); continue; }
      let my = 0, cnt = 0;
      for (const p of b) { if (p[1] > my) my = p[1]; cnt++; }
      console.log(`x${xa}~${xb} z ${z.toFixed(1)}~${(z + 0.3).toFixed(1)}: maxY=${my.toFixed(2)} (${cnt})`);
    }
  }

  console.log('\n── ③ 战斗室侧面后段（z −3.0~−1.8）x|max| 随 y（查后部是否斜收）──');
  for (let y = 1.8; y <= 2.7; y += 0.2) {
    const b = pts.filter(p => p[2] >= -3.0 && p[2] < -1.8 && p[1] >= y && p[1] < y + 0.2);
    if (!b.length) continue;
    let mx = 0; for (const p of b) mx = Math.max(mx, Math.abs(p[0]));
    console.log(`y ${y.toFixed(1)}~${(y + 0.2).toFixed(1)}: xmax=${mx.toFixed(3)}`);
  }
})();
