// 新坦克接入验证：车库逐车截图 + 新车实战开局冒烟
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

  // 逐车切换车库截图（全部 6 辆，重点 4 辆新车）
  const keys = await page.evaluate(() => Object.keys(window.__game ? (window.__TANKS_KEYS || []) : []));
  const tankKeys = await page.evaluate(() => {
    // TANKS 经 main.js 模块作用域；从 ui 侧拿不到就直接测 _loadTankThenShow
    return ['tiger1', 'm4a3', 'panther', 'm10', 'cromwell', 't34-85'];
  });
  for (const k of tankKeys) {
    await page.evaluate((key) => {
      const g = window.__game;
      g.ui.selectedTank = key;
      g._loadTankThenShow(key);
    }, k);
    await sleep(3500);
    const st = await page.evaluate(() => {
      const g = window.__game;
      const t = g.menuTank;
      return {
        tank: t && t.cfg.id, y: t ? +t.root.position.y.toFixed(2) : null,
        turretChildren: t ? t.turretGroup.children.length : null,
        barrelChildren: t ? t.barrelGroup.children.length : null,
        wheels: t ? t.wheelGroups.length : null,
        trackMats: t ? t.trackMaterials.length : null,
        mg: !!t.mgGroup, hullMg: !!t.hullMgGroup,
      };
    });
    console.log(k, '→', JSON.stringify(st));
    await page.screenshot({ path: `scripts/shot-nt-${k}.png` });
  }

  // 实战冒烟：T-34-85 出战（1v1，固定阵营应抽到轴心敌）
  await page.evaluate(() => {
    const g = window.__game;
    g.ui.selectedTank = 't34-85';
  });
  await page.click('.fh-start-btn');
  await sleep(9000);
  const bt = await page.evaluate(() => {
    const g = window.__game;
    return {
      state: g.state,
      player: g.player && g.player.cfg.id,
      enemies: (g.enemies || []).map(e => e.cfg.id + (e.alive ? '' : '(dead)')),
      shells: (g.shells || []).length,
    };
  });
  console.log('战斗状态:', JSON.stringify(bt));
  await page.screenshot({ path: 'scripts/shot-nt-battle.png' });
  console.log('控制台错误数:', errs.length);
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
