// 普罗霍罗夫卡布局核对图：从 js/mapdata-prokhorovka.js 取同源数据 → SVG + PNG
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', defaultViewport: { width: 1200, height: 1560 },
});
const page = await browser.newPage();
await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
const D = await page.evaluate(async () => {
  const m = await import('./js/mapdata-prokhorovka.js');
  return {
    roads: m.PK_ROADS, ravines: m.PK_RAVINES, village: m.A_VILLAGE,
    houses: m.PK_VILLAGE_HOUSES, farms: m.PK_FARMS, trees: m.PK_TREES,
    spawns: m.PK_SPAWNS,
  };
});

const W = 1140, H = 1500, M = 55;
const SX = 1500, SZ = 2000;
const px = (v) => (v + SX / 2) / SX * (W - 2 * M) + M;
const py = (v) => (v + SZ / 2) / SZ * (H - 2 * M) + M;
const poly = (pts) => pts.map(([x, z]) => `${px(x).toFixed(1)},${py(z).toFixed(1)}`).join(' ');

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
svg += `<rect width="${W}" height="${H}" fill="#e8ead8"/>`;
// 冲沟（宽岸坡带 + 沟底线）
for (const r of D.ravines) {
  svg += `<polyline points="${poly(r.pts)}" fill="none" stroke="#b0a878" stroke-width="${(r.half + r.slopeW) * 2 / SX * (W - 2 * M)}" stroke-linecap="round" opacity="0.55"/>`;
  svg += `<polyline points="${poly(r.pts)}" fill="none" stroke="#7c8c56" stroke-width="${r.half * 2 / SX * (W - 2 * M)}" stroke-linecap="round"/>`;
  svg += `<text x="${px(r.pts[Math.floor(r.pts.length / 2)][0]) + 14}" y="${py(r.pts[Math.floor(r.pts.length / 2)][1])}" font-size="16" fill="#8a7c50">${r.id} 冲沟（深${r.depth}m）</text>`;
}
// 路
for (const r of D.roads.main ? [D.roads.main] : []) svg += `<polyline points="${poly(r)}" fill="none" stroke="#8a8178" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
for (const r of [D.roads.east, D.roads.south]) svg += `<polyline points="${poly(r)}" fill="none" stroke="#9a9488" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
// 田块拼块（台地大田示意）
const fields = [
  [-560, -940, 340, 200], [-160, -950, 380, 210], [230, -930, 300, 190],
  [-620, -220, 320, 260], [-240, -200, 300, 240], [110, -180, 300, 220],
  [-600, 320, 320, 240], [-220, 300, 340, 260], [180, 320, 300, 220],
  [-560, 620, 340, 260], [-180, 600, 320, 280], [200, 580, 320, 300],
  [560, -400, 240, 220], [600, -160, 220, 180],
];
for (const [fx, fz, fw, fh] of fields) {
  svg += `<rect x="${px(fx)}" y="${py(fz)}" width="${fw / SX * (W - 2 * M)}" height="${fh / SZ * (H - 2 * M)}" fill="#c8cc9a" opacity="0.5" transform="rotate(${((fx * 7) % 6) - 3} ${px(fx)} ${py(fz)})"/>`;
}
// 出生带
svg += `<rect x="${px(D.spawns.a.x0)}" y="${py(D.spawns.a.z0)}" width="${px(D.spawns.a.x1) - px(D.spawns.a.x0)}" height="${py(D.spawns.a.z1) - py(D.spawns.a.z0)}" fill="none" stroke="#d2691e" stroke-width="3" stroke-dasharray="8 5"/>`;
svg += `<rect x="${px(D.spawns.b.x0)}" y="${py(D.spawns.b.z0)}" width="${px(D.spawns.b.x1) - px(D.spawns.b.x0)}" height="${py(D.spawns.b.z1) - py(D.spawns.b.z0)}" fill="none" stroke="#d2691e" stroke-width="3" stroke-dasharray="8 5"/>`;
svg += `<text x="${px(-270)}" y="${py(-905)}" font-size="17" fill="#b05a1e">出生（北）</text>`;
svg += `<text x="${px(-270)}" y="${py(918)}" font-size="17" fill="#b05a1e">出生（南）</text>`;
// 建筑
for (const h of D.houses) svg += `<circle cx="${px(h.x)}" cy="${py(h.z)}" r="10" fill="#4a86d8"/>`;
for (const f of D.farms) svg += `<circle cx="${px(f.x)}" cy="${py(f.z)}" r="10" fill="#4a86d8"/>`;
svg += `<circle cx="${px(D.village.x)}" cy="${py(D.village.z)}" r="${(D.village.r / SX) * (W - 2 * M)}" fill="none" stroke="#4a86d8" stroke-width="2" stroke-dasharray="5 4" opacity="0.6"/>`;
svg += `<text x="${px(D.village.x) - 52}" y="${py(D.village.z) - 30}" font-size="18" fill="#2c5aa0">沟口村（×7）</text>`;
// 树
for (const [x, z] of D.trees) svg += `<circle cx="${px(x)}" cy="${py(z)}" r="5" fill="#57b357"/>`;
// 网格 + 标题
for (let v = -750; v <= 750; v += 250) {
  svg += `<line x1="${px(v)}" y1="${py(-1000)}" x2="${px(v)}" y2="${py(1000)}" stroke="#d0d4bc" stroke-width="1"/>`;
  svg += `<text x="${px(v) + 3}" y="${py(-1000) + 16}" font-size="14" fill="#98a088">${v}</text>`;
}
for (let v = -1000; v <= 1000; v += 250) {
  svg += `<line x1="${px(-750)}" y1="${py(v)}" x2="${px(750)}" y2="${py(v)}" stroke="#d0d4bc" stroke-width="1"/>`;
  svg += `<text x="${px(-750) + 3}" y="${py(v) - 4}" font-size="14" fill="#98a088">${v}</text>`;
}
svg += `<text x="${px(-740)}" y="${py(-1000) - 12}" font-size="20" fill="#3a4552">普罗霍罗夫卡 · 1500×2000m 核对图（+x 右 / +z 下）· 冲沟台地 1943 夏</text>`;
svg += `<text x="${px(-740)}" y="${py(1000) + 28}" font-size="16" fill="#5f5b56">春季黑土草原 · 台地大田块（犁地/返青麦）· 冲沟底野草灌丛 · 土路（草原路速=越野）</text>`;
svg += '</svg>';
fs.writeFileSync(path.join(__dirname, 'prokhorovka-plan.svg'), svg);
await page.setContent(svg);
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: path.join(__dirname, 'prokhorovka-plan.png') });
console.log('saved scripts/prokhorovka-plan.svg / .png');
await browser.close();
