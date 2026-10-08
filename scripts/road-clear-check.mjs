// 压路校验探针：N2_TOWN_HOUSES 每栋旋转包围盒四角到主路/小路距离须 ≥ 半宽+0.4
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
});
const page = await browser.newPage();
await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
const out = await page.evaluate(async () => {
  const m = await import('./js/mapdata-normandy.js');
  const dist = (roads, x, z) => {
    let best = Infinity;
    for (const line of roads) for (let i = 0; i < line.length - 1; i++) {
      const [x1, z1] = line[i], [x2, z2] = line[i + 1];
      const dx = x2 - x1, dz = z2 - z1;
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t)));
    }
    return best;
  };
  const bad = [];
  for (const h of m.N2_TOWN_HOUSES) {
    const [w0, d0] = m.EU_SIZE[h.key];
    const hw = w0 * m.EU_SCALE / 2, hd = d0 * m.EU_SCALE / 2;
    const yaw = h.rot * Math.PI / 180, cy = Math.cos(yaw), sy = Math.sin(yaw);
    let minR = Infinity, minL = Infinity;
    for (const [cx, cz] of [[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd], [0, 0]]) {
      const wx = h.x + cy * cx + sy * cz, wz = h.z - sy * cx + cy * cz;
      minR = Math.min(minR, dist(m.N2_ROADS, wx, wz));
      minL = Math.min(minL, dist(m.N2_LANES, wx, wz));
    }
    if (minR < m.ROAD_HALF + 0.4 || minL < m.LANE_HALF + 0.4)
      bad.push({ key: h.key, x: h.x, z: h.z, minR: +minR.toFixed(1), minL: +minL.toFixed(1) });
  }
  return { total: m.N2_TOWN_HOUSES.length, bad };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
