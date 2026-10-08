// 三辆新车预处理 → model/：marder/jpz 原样拷贝；IS-2 翻转 Object_40 的 V 轴（两侧履带 UV 同向化）
// 用法: node scripts/prep-new3.js
const { NodeIO } = require('@gltf-transform/core');
const fs = require('fs');
const path = require('path');

const JOBS = [
  { src: 'tankModel/marder_iiim.glb', dst: 'model/marder_iiim.glb' },
  { src: 'tankModel/jagdpanzer_iv_late_prod..glb', dst: 'model/jagdpanzer_iv_late.glb' },
  { src: 'tankModel/is-2_1945.glb', dst: 'model/is-2_1945.glb', flipV: /^Object_40$/ },
];

(async () => {
  const io = new NodeIO();
  for (const job of JOBS) {
    const src = path.join(__dirname, '..', job.src);
    const dst = path.join(__dirname, '..', job.dst);
    if (!job.flipV) {
      fs.copyFileSync(src, dst);
      console.log(`copied ${job.src} → ${job.dst}`);
      continue;
    }
    const doc = await io.read(src);
    const scene = doc.getRoot().getDefaultScene();
    let flipped = 0;
    const walk = (node) => {
      if (job.flipV.test(node.getName()) && node.getMesh()) {
        for (const p of node.getMesh().listPrimitives()) {
          const uv = p.getAttribute('TEXCOORD_0');
          if (!uv) continue;
          const a = uv.getArray();
          for (let i = 0; i < a.length; i += 2) a[i + 1] = -a[i + 1];
          uv.setArray(a);
          flipped++;
        }
      }
      node.listChildren().forEach(walk);
    };
    scene.listChildren().forEach(walk);
    await io.write(dst, doc);
    console.log(`processed ${job.src} → ${job.dst}（翻转 V 的图元数: ${flipped}）`);
  }
})().catch(e => { console.error(e); process.exit(1); });
