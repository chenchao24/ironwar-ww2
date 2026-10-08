// 收敛分档视觉验证：未就位（红脉动+分划弱化） vs 就位（白圈+分划全亮）
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 150)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 5000));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 2500));
  // 开镜后猛转 60°：炮塔伺服中 → unconv 状态截图
  await page.evaluate(() => {
    const g = window.__game;
    g.rig.aimYaw = g.player.heading; g.rig.aimPitch = 0;
  });
  await page.keyboard.press('Shift');
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => { window.__game.rig.aimYaw += Math.PI / 3; });
  await new Promise(r => setTimeout(r, 1500));   // 虎式 0.18rad/s，仍在转
  const s1 = await page.evaluate(() => ({
    aimOffset: +window.__game.player.aimOffset.toFixed(4),
    unconv: document.getElementById('gun-marker').classList.contains('unconv'),
    reticleDim: document.getElementById('gs-reticle').classList.contains('unconv'),
  }));
  console.log('未就位态:', JSON.stringify(s1));
  await page.screenshot({ path: 'scripts/shot-conv-unconv.png' });
  // 等收敛
  await new Promise(r => setTimeout(r, 12000));
  const s2 = await page.evaluate(() => ({
    aimOffset: +window.__game.player.aimOffset.toFixed(4),
    unconv: document.getElementById('gun-marker').classList.contains('unconv'),
    near: document.getElementById('gun-marker').classList.contains('near'),
    reticleDim: document.getElementById('gs-reticle').classList.contains('unconv'),
  }));
  console.log('就位态:', JSON.stringify(s2));
  await page.screenshot({ path: 'scripts/shot-conv-locked.png' });
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
