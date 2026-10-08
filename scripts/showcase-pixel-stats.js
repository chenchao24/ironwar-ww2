// showcase 截图像素检查（三排灌木版）
const sharp = require('sharp');

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const l = (mx + mn) / 2, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [h, s * 100, l * 100];
}

async function analyze(file, rois) {
  const img = sharp(`scripts/${file}`);
  const { width: W, height: H } = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  const out = {};
  for (const [name, rx0, ry0, rx1, ry1] of rois) {
    const x0 = Math.round(rx0 * W), x1 = Math.round(rx1 * W), y0 = Math.round(ry0 * H), y1 = Math.round(ry1 * H);
    let n = 0, green = 0, lum = [], detail = 0, dn = 0, sSum = 0;
    const hueBands = [0, 0, 0, 0, 0];   // <55 / 55-75 / 75-95 / 95-115 / >=115
    for (let y = y0 + 1; y < y1 - 1; y += 2) for (let x = x0 + 1; x < x1 - 1; x += 2) {
      const i = (y * W + x) * 3, r = data[i], g = data[i + 1], b = data[i + 2];
      n++;
      const [h, s, l] = rgbToHsl(r, g, b);
      if (h >= 45 && h <= 160 && s > 14 && l > 8 && l < 80) {
        green++; lum.push(l); sSum += s;
        hueBands[h < 55 ? 0 : h < 75 ? 1 : h < 95 ? 2 : h < 115 ? 3 : 4]++;
      }
      const i2 = i + 3, i3 = i + W * 3;
      detail += Math.abs(data[i] - data[i2]) + Math.abs(data[i] - data[i3]);
      dn += 2;
    }
    lum.sort((a, b) => a - b);
    const pct = (p) => lum.length ? +lum[Math.floor(p * (lum.length - 1))].toFixed(0) : 0;
    out[name] = {
      greenPct: +(green / n * 100).toFixed(1),
      hueBands_lt55_55_75_75_95_95_115_ge115: hueBands.map(v => +(v / Math.max(green, 1) * 100).toFixed(1)),
      avgSat: +(sSum / Math.max(green, 1)).toFixed(1),
      lumP10_P50_P90: [pct(0.1), pct(0.5), pct(0.9)],
      detail: +(detail / dn).toFixed(1),
    };
  }
  console.log(file.padEnd(24), JSON.stringify(out));
}

(async () => {
  await analyze('shot-sc-rowA.png', [['hedge', 0.15, 0.3, 0.85, 0.85]]);
  await analyze('shot-sc-rowB.png', [['hedge', 0.15, 0.3, 0.85, 0.85]]);
  await analyze('shot-sc-rowC.png', [['hedge', 0.15, 0.3, 0.85, 0.85]]);
  await analyze('shot-sc-hedgeAll.png', [['group', 0.15, 0.25, 0.85, 0.85]]);
  await analyze('shot-sc-tiger.png', [['tank', 0.25, 0.3, 0.75, 0.85]]);
  await analyze('shot-sc-sherman.png', [['tank', 0.25, 0.3, 0.75, 0.85]]);
})();
