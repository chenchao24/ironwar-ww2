// 临时 v3：战斗室正面投影轮廓——z 切片 × 战斗室高度层(y>1.9) 的 x 范围
const { NodeIO } = require('@gltf-transform/core');
const file = process.argv[2] || 'model/ferdinand.glb';
const yLo = parseFloat(process.argv[3] || '1.9');
const xform = (m, v) => [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
(async () => {
  const doc = await new NodeIO().read(file);
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const pts = [];
  const walk = (node) => {
    if (node.getMesh()) for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const m = node.getWorldMatrix(); const v3 = [0,0,0];
      for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v3); pts.push(xform(m, v3)); }
    }
    node.listChildren().forEach(walk);
  };
  scene.listChildren().forEach(walk);
  let mnY = 1e9; for (const p of pts) if (p[1] < mnY) mnY = p[1];
  console.log(`战斗室高度层 y>${yLo}（y0=${mnY.toFixed(2)}）：z 切片 x 范围`);
  for (let z = -3.6; z <= 3.6; z += 0.2) {
    const b = pts.filter(p => p[2] >= z && p[2] < z + 0.2 && p[1] - mnY >= yLo);
    if (!b.length) { console.log(`z ${z.toFixed(1)}: —`); continue; }
    let mnX = 1e9, mxX = -1e9, mnYl = 1e9, mxYl = -1e9;
    for (const p of b) { if (p[0] < mnX) mnX = p[0]; if (p[0] > mxX) mxX = p[0]; if (p[1] < mnYl) mnYl = p[1]; if (p[1] > mxYl) mxYl = p[1]; }
    console.log(`z ${z.toFixed(1)}: x ${mnX.toFixed(2)} ~ ${mxX.toFixed(2)}  (y ${mnYl.toFixed(2)}~${mxYl.toFixed(2)}, ${b.length})`);
  }
})();
