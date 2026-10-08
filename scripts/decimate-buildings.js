// 诺曼底建筑 GLB 离线减面：扫描资产三角量过高（133k~309k），按目标比例 meshopt 简化
// 输出 houseModel/opt/*.glb（原文件不动），main.js PROPS 改指 opt 版
const { NodeIO } = require('@gltf-transform/core');
const { weld, simplify, prune } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');
const path = require('path');
const fs = require('fs');

const JOBS = [
  ['houseModel/【6】church.glb', 0.45],
  ['houseModel/【6】town_house.glb', 0.35],
  ['houseModel/【6】war_damaged.glb', 0.30],
  ['houseModel/【6】war_damaged_building_2.glb', 0.35],
  ['houseModel/【6】war_damaged_hall.glb', 0.30],
];

(async () => {
  await MeshoptSimplifier.ready;
  fs.mkdirSync('houseModel/opt', { recursive: true });
  const io = new NodeIO();
  for (const [src, ratio] of JOBS) {
    const doc = await io.read(src);
    const before = doc.getRoot().listMeshes().reduce((s, m) =>
      s + m.listPrimitives().reduce((t, p) => t + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);
    await doc.transform(
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 }),
      prune(),
    );
    const after = doc.getRoot().listMeshes().reduce((s, m) =>
      s + m.listPrimitives().reduce((t, p) => t + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);
    const out = 'houseModel/opt/' + path.basename(src).replace(/【6】/, '');
    await io.write(out, doc);
    const sz = (fs.statSync(out).size / 1e6).toFixed(1);
    console.log(`${path.basename(src)}: ${(before/1000).toFixed(0)}k → ${(after/1000).toFixed(0)}k tris (${sz}MB) → ${out}`);
  }
})();
