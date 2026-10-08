const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 400)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 400)); });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover'); await sleep(400);
  await page.click('#btn-hunt-mode'); await sleep(3500);
  await page.evaluate(() => {
    const ui = window.__game.ui;
    ui.selectedTank = 'm4a3'; ui.settings.factionLock = false;
    ui.settings.enemyTanks = ['tiger1', 'panther'];
    ui.settings.difficulty = 'ace';
  });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(1500);
  const r = await page.evaluate(() => {
    const g = window.__game;
    return {
      enemies: g.enemies.length,
      diffLabel: g.ais[0].diff.label,
      usePlatoon: g.ais[0].diff.usePlatoon,
      platoon: !!g.platoon,
      settingsDiff: g.ui.settings.difficulty,
      aiDiff: g.ui.aiDifficulty,
    };
  });
  console.log(JSON.stringify(r));
  await browser.close();
})();
