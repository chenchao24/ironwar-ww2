// 诺曼底 v3 验收：地形起伏/地面贴图/镇区密度/路灯/绿化
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('Missing')) errors.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 140)));
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
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 6000));
  await page.evaluate(() => { const g = window.__game; g.player.applyHit = () => {}; g.player.resolveHit = () => null; });
  const v = await page.evaluate(() => {
    const g = window.__game, w = g.world;
    return { obstacles: w.obstacles.length, sightBlockers: w.sightBlockers.length,
      hedges: w.hedgeField ? w.hedgeField.stats : null,
      townH: +w.groundY(-230, -110).toFixed(2), fieldH: +w.groundY(200, 300).toFixed(2),
      lowH: +w.groundY(-620, 520).toFixed(2) };
  });
  console.log('WORLD:', JSON.stringify(v));
  // 1. 主街平视（路灯/立面/尺度）
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(-330, 90, 0);
    g.rig.aimYaw = Math.atan2(-250 - (-330), 30 - 90);
    g.rig.aimPitch = 0.03; g.rig.dist = 15;
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'scripts/shot-norm3-street.png' });
  // 2. 镇区俯瞰（密度/绿化）
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(-230, 130, 0);
    g.rig.aimYaw = Math.PI; g.rig.aimPitch = -0.8; g.rig.dist = 160;
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-norm3-town-top.png' });
  // 3. 远眺镇台地（起伏 + 地面贴图）
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(-230, 420, 0);
    g.rig.aimYaw = Math.PI; g.rig.aimPitch = -0.02; g.rig.dist = 20;
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-norm3-relief.png' });
  // 4. 低空俯瞰地面贴图（绿度/纹理/杂色）
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(-400, -500, 0);
    g.rig.aimYaw = Math.atan2(300, 200);
    g.rig.aimPitch = -0.7; g.rig.dist = 260;
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-norm3-ground.png' });
  console.log('ERRORS:', errors.length ? errors.slice(0, 6).join(' | ') : 'none');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
