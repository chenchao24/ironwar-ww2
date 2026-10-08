// T-34 履带顶段 x→v 散点（判断贴图绕向）
const { NodeIO } = require('@gltf-transform/core');
const path = require('path');
(async () => {
  const io = new NodeIO();
  const doc = await io.read(path.join(__dirname, '../model/t-34-85_85_mm.glb'));
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  scene.traverse(n => {
    if (n.getName() !== 'Object_6' || !n.getMesh()) return;
    const prim = n.getMesh().listPrimitives()[0];
    const pa = prim.getAttribute('POSITION').getArray();
    const ua = prim.getAttribute('TEXCOORD_0').getArray();
    const N = pa.length / 3;
    let yMin = 1e9, yMax = -1e9;
    for (let i = 0; i < N; i++) { yMin = Math.min(yMin, pa[i * 3 + 1]); yMax = Math.max(yMax, pa[i * 3 + 1]); }
    const yCut = yMax - (yMax - yMin) * 0.25;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const x = pa[i * 3], y = pa[i * 3 + 1];
      if (y >= yCut) pts.push([+x.toFixed(2), +ua[i * 2].toFixed(3), +ua[i * 2 + 1].toFixed(3)]);
    }
    pts.sort((a, b) => a[0] - b[0]);
    console.log(`顶段(上25%)共 ${pts.length} 点，按 x 排序 [x, u, v]:`);
    // 等距抽 40 个
    const step = Math.max(1, Math.floor(pts.length / 40));
    for (let i = 0; i < pts.length; i += step) console.log(' ', JSON.stringify(pts[i]));
  });
})().catch(e => { console.error(e); process.exit(1); });
