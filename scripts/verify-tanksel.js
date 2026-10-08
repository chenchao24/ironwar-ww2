// 车库下拉选择器验证：初始状态、国家切换联动、直选坦克、翻页同步
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => { errs.push(e.message); console.error('PAGEERROR:', e.message.slice(0, 200)); });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(6000);

  // ① 初始状态
  let st = await page.evaluate(() => ({
    nations: [...document.querySelectorAll('#fh-sel-nation option')].map(o => `${o.value}:${o.textContent}`),
    tanks: [...document.querySelectorAll('#fh-sel-tank option')].map(o => o.value),
    selN: document.querySelector('#fh-sel-nation').value,
    selT: document.querySelector('#fh-sel-tank').value,
    cur: window.__game.ui.selectedTank,
  }));
  console.log('① 初始:', JSON.stringify(st));

  // ② 国家切到 ru → 坦克列表应变苏系，且自动选第一辆
  await page.select('#fh-sel-nation', 'ru');
  await sleep(2500);
  st = await page.evaluate(() => ({
    tanks: [...document.querySelectorAll('#fh-sel-tank option')].map(o => o.value),
    selT: document.querySelector('#fh-sel-tank').value,
    cur: window.__game.ui.selectedTank,
    menuTank: window.__game.menuTank && window.__game.menuTank.cfg.id,
  }));
  console.log('② 切 ru:', JSON.stringify(st));

  // ③ 坦克下拉直选 is2m
  await page.select('#fh-sel-tank', 'is2m');
  await sleep(3000);
  st = await page.evaluate(() => ({
    cur: window.__game.ui.selectedTank,
    menuTank: window.__game.menuTank && window.__game.menuTank.cfg.id,
    pagerName: document.querySelector('#fh-pager-name').textContent,
  }));
  console.log('③ 直选 is2m:', JSON.stringify(st));
  await page.screenshot({ path: 'scripts/shot-tanksel.png' });

  // ④ 翻页（prev）→ 下拉应同步
  await page.click('.fh-pager-btn[data-action="prev"]');
  await sleep(2500);
  st = await page.evaluate(() => ({
    selT: document.querySelector('#fh-sel-tank').value,
    selN: document.querySelector('#fh-sel-nation').value,
    cur: window.__game.ui.selectedTank,
  }));
  console.log('④ 翻页同步:', JSON.stringify(st));

  // ⑤ 切回 de 并直选 pz4j
  await page.select('#fh-sel-nation', 'de');
  await sleep(2500);
  await page.select('#fh-sel-tank', 'pz4j');
  await sleep(3000);
  st = await page.evaluate(() => ({
    cur: window.__game.ui.selectedTank,
    menuTank: window.__game.menuTank && window.__game.menuTank.cfg.id,
  }));
  console.log('⑤ de→pz4j:', JSON.stringify(st));
  console.log('控制台错误数:', errs.length);
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
