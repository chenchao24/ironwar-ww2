// 猎虎战斗室正面细测：排除炮（Object_15/Object_2），y 0.1 步进，x 分带
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
  for (const [xa, xb] of [[0, 0.55], [0.55, 1.2]]) {
    console.log(`\n── x ${xa}~${xb} 带：各 y 层最前 z（无炮）──`);
    for (let y = 1.5; y <= 2.9; y += 0.1) {
      const b = pts.filter(p => Math.abs(p[0]) >= xa && Math.abs(p[0]) < xb && p[1] >= y && p[1] < y + 0.1);
      if (!b.length) continue;
      let fz = -1e9; for (const p of b) fz = Math.max(fz, p[2]);
      console.log(`y ${y.toFixed(1)}~${(y + 0.1).toFixed(1)}: z=${fz.toFixed(2)}  (${b.length})`);
    }
  }
})();
