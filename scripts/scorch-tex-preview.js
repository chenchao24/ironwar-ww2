// 焦痕纹理预览：游戏页内生成 makeScorchTexture 同参数纹理（借 effects.scorch 触发），导出 PNG 供目检调参
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=800,600', '--use-angle=default'],
    defaultViewport: { width: 800, height: 600 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(6000);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(1000);
  const dataUrl = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player.root.position;
    g.effects.scorch(p.x + 30, p.z, 18);   // 触发生成纹理
    return g.effects._scorchMat.map.image.toDataURL('image/png');
  });
  fs.writeFileSync('scripts/scorch-tex-preview.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('saved scripts/scorch-tex-preview.png');
  await browser.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
