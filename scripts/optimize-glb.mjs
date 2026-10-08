// GLB 离线瘦身：贴图 WebP/≤1024 + 几何量化 + meshopt 压缩
// 用法：node scripts/optimize-glb.mjs   （输出 model/opt/*.glb，原文件不动；config.js 切路径后生效，回退只还原路径）
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const cfg = fs.readFileSync('js/config.js', 'utf8');
const models = [...new Set([...cfg.matchAll(/model: '([^']+)'/g)].map(m => m[1]))];
const OUT = 'model/opt';
fs.mkdirSync(OUT, { recursive: true });

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': (await import('meshoptimizer')).MeshoptDecoder });

let totalIn = 0, totalOut = 0;
for (const m of models) {
  const name = path.basename(m);
  const outPath = path.join(OUT, name);
  if (!fs.existsSync(m)) { console.log('MISS', m); continue; }
  const inSize = fs.statSync(m).size;
  const doc = await io.read(m);
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [1024, 1024] }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
    // meshopt 曾试：部分模型 index 布局触发 encoder assert，收益不如贴图量化，弃用
  );
  await io.write(outPath, doc);
  const outSize = fs.statSync(outPath).size;
  totalIn += inSize; totalOut += outSize;
  console.log(`${name}: ${(inSize / 1048576).toFixed(1)}MB → ${(outSize / 1048576).toFixed(1)}MB`);
}
console.log(`═══ 合计: ${(totalIn / 1048576).toFixed(0)}MB → ${(totalOut / 1048576).toFixed(0)}MB（-${Math.round((1 - totalOut / totalIn) * 100)}%）`);
