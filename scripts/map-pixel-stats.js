const sharp = require('sharp');
// 像素统计验证：蓝天占比 / 白云占比 / 地面色调 / 昏黄残留
async function stats(file, label) {
  const img = sharp(`scripts/${file}`);
  const { width: W, height: H } = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const i = (y * W + x) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };
  // 上 45% 区域 = 天空带：分类像素
  let blue = 0, cloud = 0, hazy = 0, skyTotal = 0, yellowish = 0;
  for (let y = 0; y < H * 0.45; y += 3) {
    for (let x = 0; x < W; x += 3) {
      const [r, g, b] = px(x, y);
      skyTotal++;
      if (b > 120 && b > r + 25 && b >= g + 10) blue++;                       // 蓝天
      else if (r > 200 && g > 200 && b > 195 && Math.abs(r - b) < 30) cloud++; // 白云
      else if (r > 190 && g > 185 && b > 175) hazy++;                          // 地平线灰白霾
      if (r > 140 && r > b + 45 && g > 110 && g < r) yellowish++;              // 昏黄残留
    }
  }
  // 下 35% = 地面带：平均色 + 绿意
  let gr = 0, gg = 0, gb = 0, n = 0;
  for (let y = H * 0.65; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      const [r, g, b] = px(x, y);
      gr += r; gg += g; gb += b; n++;
    }
  }
  const avg = `rgb(${gr / n | 0},${gg / n | 0},${gb / n | 0})`;
  console.log(`${label}: 蓝天 ${(blue / skyTotal * 100).toFixed(1)}% | 白云 ${(cloud / skyTotal * 100).toFixed(1)}% | 灰白霾 ${(hazy / skyTotal * 100).toFixed(1)}% | 昏黄残留 ${(yellowish / skyTotal * 100).toFixed(1)}% | 地面均色 ${avg}`);
}
(async () => {
  await stats('shot-map-sky.png', '抬头天空图 ');
  await stats('shot-map-horizon.png', '斜上地平线');
  await stats('shot-map-landscape.png', '平视地貌图');
  await stats('shot-map-cover.png', '树丛近景  ');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
