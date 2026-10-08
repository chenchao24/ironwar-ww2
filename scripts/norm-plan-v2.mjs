// 诺曼底 v2 布局核对图：从 js/mapdata-normandy.js 取同源数据（页面上下文 import）→ SVG + PNG
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', defaultViewport: { width: 1500, height: 1660 },
});
const page = await browser.newPage();
await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
const D = await page.evaluate(async () => {
  const m = await import('./js/mapdata-normandy.js');
  const mulberry32 = (seed) => function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rand = mulberry32(19440610);
  const parcels = m.buildParcels(rand);
  const hedges = m.buildHedgeBorders(rand, parcels);
  const hedgeTrees = m.buildHedgeTrees(rand, hedges);
  return {
    roads: m.N2_ROADS, lanes: m.N2_LANES, houses: m.N2_TOWN_HOUSES,
    parcels, hedges, hedgeTrees, treeAreas: m.N2_TREE_AREAS, euSize: m.EU_SIZE,
    plaza: m.N2_PLAZA, town: m.N2_TOWN,
  };
});

const SIZE = 2000, S = SIZE / 2;
const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-S - 60} ${-S - 60} ${SIZE + 120} ${SIZE + 260}" font-family="sans-serif">`);
svg.push(`<rect x="${-S - 60}" y="${-S - 60}" width="${SIZE + 120}" height="${SIZE + 260}" fill="#e8ecdd"/>`);
svg.push(`<rect x="${-S}" y="${-S}" width="${SIZE}" height="${SIZE}" fill="#b3c48e"/>`);
// 坐标网格
svg.push('<g stroke="#ffffff" stroke-width="0.8" opacity="0.5">');
for (let v = -1000; v <= 1000; v += 200) svg.push(`<line x1="${v}" y1="${-S}" x2="${v}" y2="${S}"/><line x1="${-S}" y1="${v}" x2="${S}" y2="${v}"/>`);
svg.push('</g><g font-size="20" fill="#334" opacity="0.9">');
for (let v = -1000; v <= 1000; v += 200) svg.push(`<text x="${v + 4}" y="${-S + 24}">${v}</text><text x="${-S + 6}" y="${v - 5}">${v}</text>`);
svg.push('</g>');
// 田块（cell.edges 首尾相接成多边形；外圈田浅色）
const FC = ['#7fa355', '#8cae5e', '#76a04e', '#97b465'];
const FC_OUT = ['#a4b476', '#adba7c', '#9cae70', '#b5bf85'];
D.parcels.forEach((p, i) => {
  const pts = p.edges.flat();
  svg.push(`<polygon points="${pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')}" fill="${(p.outer ? FC_OUT : FC)[i % 4]}" stroke="#5d7340" stroke-width="1.5"/>`);
});
svg.push(`<text x="-700" y="-200" font-size="34" fill="#3f5228" opacity="0.75">田地</text>`);
// 树篱
svg.push('<g stroke="#2e4d1a" stroke-width="4" stroke-linecap="round">');
for (const [x1, z1, x2, z2] of D.hedges) svg.push(`<line x1="${x1}" y1="${z1}" x2="${x2}" y2="${z2}"/>`);
svg.push('</g>');
// 道路
svg.push('<g fill="none" stroke="#6f6a5e" stroke-width="11" stroke-linecap="round">');
for (const line of D.roads) svg.push(`<polyline points="${line.map(p => p[0] + ',' + p[1]).join(' ')}"/>`);
svg.push('</g><g fill="none" stroke="#8f8a7c" stroke-width="5" stroke-linecap="round">');
for (const line of D.lanes) svg.push(`<polyline points="${line.map(p => p[0] + ',' + p[1]).join(' ')}"/>`);
svg.push('</g>');
svg.push(`<text x="-560" y="620" font-size="22" fill="#4a463c">乡间公路</text>`);
svg.push(`<text x="270" y="-270" font-size="20" fill="#4a463c">小路</text>`);
// 房屋（真实宽×深，旋转）
for (const h of D.houses) {
  const [w, d] = D.euSize[h.key] || [10, 10];
  svg.push(`<rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" fill="#5a6f9a" stroke="#22293a" stroke-width="1.2" transform="translate(${h.x},${h.z}) rotate(${-h.rot})"/>`);
}
svg.push(`<text x="${D.town.x - 60}" y="${D.town.z - 220}" font-size="24" font-weight="bold" fill="#333">小镇（${D.houses.length} 栋）</text>`);
// 硬化广场
svg.push(`<rect x="${-D.plaza.w / 2}" y="${-D.plaza.d / 2}" width="${D.plaza.w}" height="${D.plaza.d}" fill="#9a9a90" stroke="#777" stroke-width="1.5" transform="translate(${D.plaza.x},${D.plaza.z}) rotate(${-D.plaza.rot})"/>`);
svg.push(`<text x="${D.plaza.x - 20}" y="${D.plaza.z + 4}" font-size="14" fill="#555">广场</text>`);
// 树（缘带 + 路旁）
const rnd = (() => { let s = 19440610; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
svg.push('<g fill="#3f8a2a">');
for (const a of D.treeAreas) for (let i = 0; i < a.n; i++)
  svg.push(`<circle cx="${a.x0 + rnd() * (a.x1 - a.x0)}" cy="${a.z0 + rnd() * (a.z1 - a.z0)}" r="5.5"/>`);
svg.push('</g>');
// 篱上树木（穿插）
svg.push('<g fill="#2c5a1e" opacity="0.9">');
for (const [x, z] of D.hedgeTrees) svg.push(`<circle cx="${x}" cy="${z}" r="6.5"/>`);
svg.push('</g>');
// 出生环带对照
svg.push(`<circle cx="0" cy="0" r="810" fill="none" stroke="#c0392b" stroke-width="2" stroke-dasharray="10 10" opacity="0.45"/>`);
svg.push(`<circle cx="0" cy="0" r="590" fill="none" stroke="#c0392b" stroke-width="2" stroke-dasharray="10 10" opacity="0.45"/>`);
svg.push(`<text x="420" y="-850" font-size="20" fill="#c0392b" opacity="0.85">虚线=随机出生环带（手绘稿未标出生位，沿用随机）</text>`);
// 标题图例
svg.push(`<text x="${-S + 10}" y="${-S - 18}" font-size="30" font-weight="bold" fill="#223">诺曼底 v2 · 紧凑镇区 + 随形田块（待核对）</text>`);
const lg = [
  ['#2e4d1a', `灌木墙/树篱 ×${D.hedges.length} 段（内圈每块 ≤2 边；外圈零星点缀）`],
  ['#2c5a1e', `篱上树木 ×${D.hedgeTrees.length}（穿插篱线）`],
  ['#6f6a5e', '乡间公路 ×3（不变）'],
  ['#8f8a7c', `镇内小路 ×${D.lanes.length} + 硬化广场`],
  ['#5a6f9a', `房屋 ×${D.houses.length}（紧凑镇区，丁字口为西南角）`],
  ['#7fa355', `田地 ×${D.parcels.length}（邻路随形；缘带 60~80m 草场）`],
  ['#3f8a2a', `缘带散树 ×${D.treeAreas.reduce((s, a) => s + a.n, 0)}`],
];
svg.push(`<g transform="translate(${-S + 10},${S + 16})">`);
lg.forEach(([col, txt], i) => {
  svg.push(`<rect x="0" y="${i * 26 - 13}" width="26" height="14" fill="${col}"/>`);
  svg.push(`<text x="34" y="${i * 26}" font-size="20" fill="#223">${txt}</text>`);
});
svg.push(`<text x="760" y="0" font-size="19" fill="#445">坐标=游戏世界系（米）：右=+x，下=+z。</text>`);
svg.push(`<text x="760" y="26" font-size="19" fill="#445">数据源：js/mapdata-normandy.js（与游戏同源）。</text>`);
svg.push('</g>');
svg.push('</svg>');

const outSvg = path.join(__dirname, 'norm-plan-v2.svg');
fs.writeFileSync(outSvg, svg.join('\n'));
await page.goto('file:///' + outSvg.replace(/\\/g, '/'));
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: path.join(__dirname, 'norm-plan-v2.png') });
await browser.close();
console.log('OK parcels=' + D.parcels.length + ' hedges=' + D.hedges.length + ' houses=' + D.houses.length, outSvg);
