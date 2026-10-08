const puppeteer = require('puppeteer-core');
const sharp = require('sharp');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 4000));
  // 1) 确认 shader 版本
  const v = await page.evaluate(() => {
    const fs = window.__game.world.sky.material.fragmentShader;
    return { hasCluster: fs.includes('cluster'), hasNewLit: fs.includes('1.22') };
  });
  console.log('SHADER_CHECK:', JSON.stringify(v));
  await page.evaluate(() => { window.__game.rig.aimPitch = 0.55; });
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: 'scripts/shot-sky-debug.png' });
  await browser.close();
  // 2) 垂直采样天空颜色带（x 中线，y 0~45%）
  const { data, info } = await sharp('scripts/shot-sky-debug.png').raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  for (let f = 0; f <= 0.45; f += 0.05) {
    const y = Math.round(H * f);
    const i = (y * W + Math.round(W / 2)) * C;
    console.log(`y=${(f * 100).toFixed(0)}%  rgb(${data[i]},${data[i + 1]},${data[i + 2]})`);
  }
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
