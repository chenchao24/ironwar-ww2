// 小镇布局探针：列出建筑类型/坐标 + 镇区俯拍
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const warns = [];
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warns.push(m.type() + ': ' + m.text().slice(0, 140)); });
  page.on('pageerror', (e) => warns.push('PAGEERROR: ' + e.message.slice(0, 140)));
  await page.evaluateOnNewDocument(() => {
    const s = JSON.parse(localStorage.getItem('ironwar3_settings') || '{}');
    s.mapId = 'normandy';
    localStorage.setItem('ironwar3_settings', JSON.stringify(s));
  });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3000));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 5000));
  const list = await page.evaluate(() => {
    const g = window.__game;
    g.player.applyHit = () => {}; g.player.resolveHit = () => null;
    return g.world.destructibles.list.filter(d => d.kind === 'group')
      .map(d => ({ type: d.type, cx: +(d.cx ?? d.x ?? NaN).toFixed(0), cz: +(d.cz ?? d.z ?? NaN).toFixed(0), hp: d.hp, keys: undefined }));
  });
  console.log('BUILDINGS:', JSON.stringify(list, null, 1));
  // 镇区高空俯拍（南北向）
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(5, 90, 0);
    g.rig.aimYaw = Math.PI; g.rig.aimPitch = -0.75; g.rig.dist = 150;
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-norm-town-aerial.png' });
  console.log('WARNS:', warns.length ? warns.join(' | ') : 'none');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
