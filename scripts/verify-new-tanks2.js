// 新车复核：敌人存活状态 + 新车瞄具（su2/uk2 分划）渲染
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

  // 玩家开克伦威尔（uk2 分划），敌方应为轴心（tiger1/panther）
  await page.evaluate(() => { window.__game.ui.selectedTank = 'cromwell'; });
  await page.click('.fh-start-btn');
  await sleep(5000);
  const snap1 = await page.evaluate(() => {
    const g = window.__game;
    return {
      state: g.state, player: g.player.cfg.id,
      enemies: (g.enemies || []).map(e => ({
        id: e.cfg.id, alive: e.alive, bailed: e.bailedOut,
        pos: [e.root.position.x | 0, +e.root.position.y.toFixed(2), e.root.position.z | 0],
        crewDead: e.crew ? e.crew.filter(c => c.state === 2).length : null,
      })),
    };
  });
  console.log('开局 5s:', JSON.stringify(snap1));
  await sleep(15000);
  const snap2 = await page.evaluate(() => {
    const g = window.__game;
    return {
      state: g.state,
      enemies: (g.enemies || []).map(e => ({ id: e.cfg.id, alive: e.alive, bailed: e.bailedOut, y: +e.root.position.y.toFixed(2) })),
    };
  });
  console.log('20s 后:', JSON.stringify(snap2));
  // 开镜验证 uk2 分划渲染
  await page.keyboard.down('Shift');
  await sleep(1200);
  await page.screenshot({ path: 'scripts/shot-nt-scope-cromwell.png' });
  await page.keyboard.up('Shift');
  await sleep(400);
  console.log('控制台错误数:', errs.length);
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
