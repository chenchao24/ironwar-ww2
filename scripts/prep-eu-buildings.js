// 欧洲小镇建筑离线预处理（otherModel/EuropeCity → otherModel/EuropeCity/opt）：
//   ① specGloss → metalRough（three 0.185 已不支持 spec-gloss，不转无法加载）
//   ② 统计包围盒/三角量 → scripts/eu-stats.json（使用文档数据源）
//   ③ 超 3 万三角的做 meshopt 减面（本批均为低模，预计不触发）
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { getBounds, metalRough, prune, weld, simplify } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');
const fs = require('fs');
const path = require('path');

const SRC = 'otherModel/EuropeCity';
const OUT = path.join(SRC, 'opt');
const DECIMATE_OVER = 30000;

(async () => {
  await MeshoptSimplifier.ready;
  fs.mkdirSync(OUT, { recursive: true });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const stats = [];
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.glb')).sort();
  for (const f of files) {
    const doc = await io.read(path.join(SRC, f));
    await doc.transform(metalRough(), prune());
    const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];

    // ── 单位归一：个别模型 Sketchfab_model 缩放缺失/错误（romedenne/romeree s=1、moncontour s=0.229
    //    导致几百米巨物）——高度 >30m 即按厘米模型处理：根节点缩放补正到 0.01 ──
    let b = getBounds(scene);
    const h = b.max[1] - b.min[1];
    let unitFixed = false;
    if (h > 30) {
      const root0 = scene.listChildren()[0];
      const k = 0.01 / root0.getScale()[0];
      for (const child of scene.listChildren()) {
        const s = child.getScale();
        child.setScale([s[0] * k, s[1] * k, s[2] * k]);
      }
      unitFixed = true;
      b = getBounds(scene);
    }

    // ── 枢轴归一：XZ 包围盒中心移到原点、minY 贴 0（placeKit 会把首子件 position 归零） ──
    const cx = (b.max[0] + b.min[0]) / 2, cz = (b.max[2] + b.min[2]) / 2, y0 = b.min[1];
    if (Math.abs(cx) > 0.05 || Math.abs(cz) > 0.05 || Math.abs(y0) > 0.05) {
      for (const child of scene.listChildren()) {
        const t = child.getTranslation();
        child.setTranslation([t[0] - cx, t[1] - y0, t[2] - cz]);
      }
      b = getBounds(scene);
    }

    const countTris = () => {
      let t = 0;
      for (const m of doc.getRoot().listMeshes())
        for (const p of m.listPrimitives()) { const i = p.getIndices(); if (i) t += i.getCount() / 3; }
      return Math.round(t);
    };
    let tris = countTris();
    let decimated = false;
    if (tris > DECIMATE_OVER) {
      await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.001 }), prune());
      tris = countTris();
      decimated = true;
    }
    // 网格节点名（placeKit 模板键参考）
    const meshNodes = [];
    const walk = (n) => { if (n.getMesh()) meshNodes.push(n.getName()); n.listChildren().forEach(walk); };
    scene.listChildren().forEach(walk);
    await io.write(path.join(OUT, f), doc);
    stats.push({
      file: f,
      sizeX: +(b.max[0] - b.min[0]).toFixed(2),
      sizeY: +(b.max[1] - b.min[1]).toFixed(2),
      sizeZ: +(b.max[2] - b.min[2]).toFixed(2),
      tris, unitFixed, decimated, meshNodes,
      kb: Math.round(fs.statSync(path.join(OUT, f)).size / 1024),
    });
    console.log(`${f}: ${(b.max[0] - b.min[0]).toFixed(1)}×${(b.max[1] - b.min[1]).toFixed(1)}×${(b.max[2] - b.min[2]).toFixed(1)}m, ${tris} tris${unitFixed ? ' [单位修正]' : ''}${decimated ? ' [减面]' : ''}`);
  }
  fs.writeFileSync('scripts/eu-stats.json', JSON.stringify(stats, null, 2));
  console.log('→ otherModel/EuropeCity/opt/ (' + stats.length + ' 件), stats → scripts/eu-stats.json');
})();
