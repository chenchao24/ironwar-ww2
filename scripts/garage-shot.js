// 车库重做验证：加载中悬浮检查 + 新二战车库多角度截图
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => { errs.push(e.message); console.error('PAGEERROR:', e.message.slice(0, 200)); });
  page.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); console.error('CONSOLE-ERR:', m.text().slice(0, 200)); } });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  // 加载瞬间截图：验证坦克不再悬浮（加载期间场景里应只有车库）
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'scripts/shot-garage-loading.png' });
  await new Promise(r => setTimeout(r, 6000));
  const st = await page.evaluate(() => ({
    state: window.__game.state,
    garageVisible: window.__game.garage && window.__game.garage.visible,
    tankY: window.__game.menuTank ? +window.__game.menuTank.root.position.y.toFixed(3) : null,
  }));
  console.log('车库状态:', JSON.stringify(st));
  await page.screenshot({ path: 'scripts/shot-garage-main.png' });
  // 视角2：转向大门方向（-x）看门洞/标牌/体积光
  await page.evaluate(() => {
    const g = window.__game;
    g._camTheta = -1.62; g._camPhi = 0.28; g._camR = 10.5;
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/shot-garage-door.png' });
  // 视角3：低机位侧面看 A 字架吊发动机 + 道具
  await page.evaluate(() => {
    const g = window.__game;
    g._camTheta = 2.6; g._camPhi = 0.12; g._camR = 7.5;
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/shot-garage-side.png' });
  // 视角4：高位俯瞰看屋顶/桁架下内部
  await page.evaluate(() => {
    const g = window.__game;
    g._camTheta = 0.73; g._camPhi = 0.9; g._camR = 12;
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/shot-garage-high.png' });
  console.log('控制台错误数:', errs.length);
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
