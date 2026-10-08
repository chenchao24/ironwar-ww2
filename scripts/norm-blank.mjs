// 空白地图底图：2000×2000m 坐标网格（200m 主格/100m 副格），供打印手绘布局
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIZE = 2000, S = SIZE / 2;

const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-S - 90} ${-S - 90} ${SIZE + 180} ${SIZE + 180}" font-family="sans-serif">`);
svg.push(`<rect x="${-S - 90}" y="${-S - 90}" width="${SIZE + 180}" height="${SIZE + 180}" fill="#ffffff"/>`);
svg.push(`<rect x="${-S}" y="${-S}" width="${SIZE}" height="${SIZE}" fill="#f7f5ec" stroke="#333" stroke-width="3"/>`);
// 100m 副格
svg.push('<g stroke="#c9c9bb" stroke-width="0.6">');
for (let v = -1000; v <= 1000; v += 100) {
  svg.push(`<line x1="${v}" y1="${-S}" x2="${v}" y2="${S}"/><line x1="${-S}" y1="${v}" x2="${S}" y2="${v}"/>`);
}
svg.push('</g>');
// 200m 主格
svg.push('<g stroke="#8a8a76" stroke-width="1.2">');
for (let v = -1000; v <= 1000; v += 200) {
  svg.push(`<line x1="${v}" y1="${-S}" x2="${v}" y2="${S}"/><line x1="${-S}" y1="${v}" x2="${S}" y2="${v}"/>`);
}
svg.push('</g>');
// 坐标标注（每 200m，四边）
svg.push('<g font-size="26" fill="#445">');
for (let v = -1000; v <= 1000; v += 200) {
  svg.push(`<text x="${v - 26}" y="${-S - 18}">${v}</text>`);
  svg.push(`<text x="${v - 26}" y="${S + 46}">${v}</text>`);
  svg.push(`<text x="${-S - 76}" y="${v + 8}">${v}</text>`);
  svg.push(`<text x="${S + 16}" y="${v + 8}">${v}</text>`);
}
svg.push('</g>');
// 中心十字
svg.push(`<g stroke="#b03a2e" stroke-width="1.5" opacity="0.6"><line x1="-14" y1="0" x2="14" y2="0"/><line x1="0" y1="-14" x2="0" y2="14"/></g>`);
// 指北针
svg.push(`<g transform="translate(${S + 45},${-S - 40})">
  <circle r="30" fill="#fff" stroke="#334" stroke-width="2"/>
  <path d="M0,-20 L7,10 L0,4 L-7,10 Z" fill="#b03a2e"/>
  <text x="-7" y="54" font-size="22" fill="#334">N</text>
</g>`);
svg.push(`<text x="${-S - 60}" y="${-S - 50}" font-size="24" fill="#667">诺曼底 · 2000×2000m　坐标=米（右 +x / 下 +z）　主格 200m · 副格 100m</text>`);
svg.push('</svg>');

const outSvg = path.join(__dirname, 'norm-blank.svg');
fs.writeFileSync(outSvg, svg.join('\n'));
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', defaultViewport: { width: 1600, height: 1600 },
});
const page = await browser.newPage();
await page.goto('file:///' + outSvg.replace(/\\/g, '/'));
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: path.join(__dirname, 'norm-blank.png') });
await browser.close();
console.log('OK', outSvg);
