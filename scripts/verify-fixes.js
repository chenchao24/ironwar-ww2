// 修复验证：克伦威尔炮塔内部件随转 + T-34 履带纵向滚动
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => { errs.push(e.message); console.error('PAGEERROR:', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); console.error('CONSOLE-ERR:', m.text().slice(0, 300)); } });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(6000);

  // ① 克伦威尔：炮塔转 90°，内部件应随转
  await page.evaluate(() => {
    const g = window.__game;
    g.ui.selectedTank = 'cromwell';
    g._loadTankThenShow('cromwell');
  });
  await sleep(3500);
  const info = await page.evaluate(() => {
    const t = window.__game.menuTank;
    const names = [];
    t.turretGroup.traverse(o => { if (o.isMesh) names.push(o.name); });
    return { turretChildren: t.turretGroup.children.length, turretMeshes: names };
  });
  console.log('cromwell 炮塔组:', JSON.stringify(info));
  await page.evaluate(() => {
    const g = window.__game;
    g.menuTank.turretGroup.rotation.y = Math.PI / 2;
    g._camTheta = 2.2; g._camPhi = 0.25; g._camR = 8;
  });
  await sleep(600);
  await page.screenshot({ path: 'scripts/shot-fix-cromwell-t90.png' });

  // ② T-34 实战：前进中侧拍履带两帧
  await page.evaluate(() => { window.__game.ui.selectedTank = 't34-85'; });
  await page.click('.fh-start-btn');
  await sleep(7000);
  // 低速跟拍机位拉近到车身侧面
  await page.keyboard.down('w');
  await sleep(1500);
  await page.evaluate(() => {
    const g = window.__game;
    // 相机拉近侧面看履带
    g.camera.fov = 40; g.camera.updateProjectionMatrix();
  });
  await sleep(600);
  await page.screenshot({ path: 'scripts/shot-fix-t34-track-a.png' });
  await sleep(500);
  await page.screenshot({ path: 'scripts/shot-fix-t34-track-b.png' });
  await page.keyboard.up('w');
  const tr = await page.evaluate(() => {
    const g = window.__game;
    const t = g.player;
    return {
      speed: +t.speed.toFixed(2),
      offsets: t.trackMaterials.map(m => [+m.offset.x.toFixed(3), +m.offset.y.toFixed(3)]),
    };
  });
  console.log('t34 履带 offset:', JSON.stringify(tr));
  console.log('控制台错误数:', errs.length);
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
