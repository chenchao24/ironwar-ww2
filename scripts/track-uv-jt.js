// 猎虎履带 UV 方向探针：底段/顶段 v-z 相关 → trackScrollAxis + flip 判定
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
(async () => {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('model/jagdtiger.glb');
  for (const nm of ['Object_3', 'Object_7']) {
    const node = doc.getRoot().listNodes().find(n => n.getName() === nm);
    const wm = node.getWorldMatrix();
    const pts = [];
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0');
      if (!pos || !uv) continue;
      const v3 = [0, 0, 0], uv2 = [0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v3); uv.getElement(i, uv2);
        pts.push({
          y: wm[1]*v3[0]+wm[5]*v3[1]+wm[9]*v3[2]+wm[13],
          z: wm[2]*v3[0]+wm[6]*v3[1]+wm[10]*v3[2]+wm[14],
          u: uv2[0], v: uv2[1],
        });
      }
    }
    const bot = pts.filter(p => p.y < 0.35), top = pts.filter(p => p.y > 1.1);
    const slope = (a, kx, ky) => {
      const n = a.length; let mx = 0, my = 0;
      for (const p of a) { mx += p[kx]; my += p[ky]; } mx /= n; my /= n;
      let num = 0, den = 0;
      for (const p of a) { num += (p[kx]-mx)*(p[ky]-my); den += (p[kx]-mx)*(p[kx]-mx); }
      return num / den;
    };
    console.log(`${nm} 底段(n=${bot.length}) dv/dz=${slope(bot,'z','v').toFixed(2)} du/dz=${slope(bot,'z','u').toFixed(2)}` +
      `  顶段(n=${top.length}) dv/dz=${slope(top,'z','v').toFixed(2)}`);
  }
})();
