// su152 轮面旋转实证 v2：冻结 rig，怼右前轮放大拍 0 / 1.5 rad 两帧
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('ERR', e.message.slice(0, 300)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(400);
  await page.click('#btn-hunt-mode');
  await sleep(5000);
  await page.evaluate(() => {
    const g = window.__game;
    g.ui.selectedTank = 'su152';
    g._loadTankThenShow('su152');
  });
  await sleep(4000);
  await page.evaluate(() => {
    const g = window.__game;
    // 冻结展示相机逻辑（garage 的相机会被 showcase 覆盖；直接篡改其参数轮询）
    if (g.garage && g.garage.update) g.garage.update = () => {};
    const t = g.menuTank;
    t.root.updateMatrixWorld(true);
    // 右前轮（x>0, z 最大）轮组世界位置
    const wg = t.wheelGroups.reduce((a, w) => {
      const p = w.group.getWorldPosition(new (t.root.position.constructor)());
      return (p.x > 0.5 && (!a || p.z > a.p.z)) ? { w, p } : a;
    }, null);
    window.__wg = wg;
    const c = g.camera;
    c.position.set(wg.p.x + 2.6, wg.p.y + 0.7, wg.p.z + 2.2);
    c.lookAt(wg.p.x, wg.p.y, wg.p.z);
    c.fov = 32; c.updateProjectionMatrix();
  });
  await sleep(200);
  await page.screenshot({ path: 'scripts/shot-su152-spinB1.png', clip: { x: 400, y: 200, width: 700, height: 500 } });
  await page.evaluate(() => {
    const t = window.__game.menuTank;
    for (const w of t.wheelGroups) w.group.rotation.x += 1.5;
    t.root.updateMatrixWorld(true);
  });
  await sleep(150);
  await page.screenshot({ path: 'scripts/shot-su152-spinB2.png', clip: { x: 400, y: 200, width: 700, height: 500 } });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
