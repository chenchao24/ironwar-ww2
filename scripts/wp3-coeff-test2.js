// WP3 补测：固定敌车（关阵营锁）验证重型 ×1.15（tiger1）与低矮 ×0.85（jpz4l70）
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  for (const [enemy, expect] of [['tiger1', 1.15], ['jpz4l70', 0.85]]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
    await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
    await page.click('#screen-cover');
    await sleep(500);
    await page.click('#btn-hunt-mode');
    await sleep(3500);
    await page.evaluate((enemy) => {
      const ui = window.__game.ui;
      ui.selectedTank = 'm4a3';
      ui.settings.factionLock = false;       // 关阵营锁：允许同阵营敌车（测试用）
      ui.settings.enemyTanks = [enemy];
    }, enemy);
    await page.click('#screen-hangar [data-action="start"]');
    await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
    await sleep(2000);
    const r = await page.evaluate((expect) => {
      const g = window.__game, v = g.visibility, e = g.enemies[0];
      return `${e.cfg.id}: tgtK=${v._tgtK(e, false)} (期望 ${expect}) turretTop=${e.cfg.dims.turretTop} hullFront=${e.cfg.armor.hullFront}`;
    }, expect);
    console.log('COEFF', r);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
    await page.close();
  }
  await browser.close();
})();
