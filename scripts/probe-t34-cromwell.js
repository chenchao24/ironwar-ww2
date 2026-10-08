// T-34 履带 UV 轴向 + 克伦威尔 interior 节点精确名核查
const { NodeIO } = require('@gltf-transform/core');
const path = require('path');
(async () => {
  const io = new NodeIO();
  // T-34: Object_4 / Object_6 履带 —— 顶点 x（纵向）与 u/v 相关性
  const doc = await io.read(path.join(__dirname, '../model/t-34-85_85_mm.glb'));
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  for (const target of ['Object_4', 'Object_6']) {
    scene.traverse(n => {
      if (n.getName() !== target || !n.getMesh()) return;
      const prim = n.getMesh().listPrimitives()[0];
      const pa = prim.getAttribute('POSITION').getArray();
      const uv = prim.getAttribute('TEXCOORD_0');
      if (!uv) { console.log(target, '无 UV'); return; }
      const ua = uv.getArray();
      const N = uv.getCount();
      let mx = 0, mu = 0, mv = 0;
      for (let i = 0; i < N; i++) { mx += pa[i * 3]; mu += ua[i * 2]; mv += ua[i * 2 + 1]; }
      mx /= N; mu /= N; mv /= N;
      let sxx = 0, suu = 0, svv = 0, sxu = 0, sxv = 0, uMin = 9, uMax = -9, vMin = 9, vMax = -9;
      for (let i = 0; i < N; i++) {
        const x = pa[i * 3] - mx, u = ua[i * 2] - mu, v = ua[i * 2 + 1] - mv;
        sxx += x * x; suu += u * u; svv += v * v; sxu += x * u; sxv += x * v;
        uMin = Math.min(uMin, ua[i * 2]); uMax = Math.max(uMax, ua[i * 2]);
        vMin = Math.min(vMin, ua[i * 2 + 1]); vMax = Math.max(vMax, ua[i * 2 + 1]);
      }
      const corr = (a, b, c) => (c / Math.sqrt(a * b + 1e-12)).toFixed(3);
      console.log(`${target}: corr(x,u)=${corr(sxx, suu, sxu)} corr(x,v)=${corr(sxx, svv, sxv)} uRange=[${uMin.toFixed(2)},${uMax.toFixed(2)}] vRange=[${vMin.toFixed(2)},${vMax.toFixed(2)}]`);
    });
  }
  // 克伦威尔: 所有含 interior 的节点精确名（含空格/点）
  const doc2 = await io.read(path.join(__dirname, '../model/cromwell_iv.glb'));
  const scene2 = doc2.getRoot().getDefaultScene() || doc2.getRoot().listScenes()[0];
  console.log('--- cromwell interior/turret 节点原始名 ---');
  scene2.traverse(n => {
    const nm = n.getName();
    if (/interior|turret|mount/i.test(nm) && n.getMesh()) console.log(JSON.stringify(nm));
  });
})().catch(e => { console.error(e); process.exit(1); });
