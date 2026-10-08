// WP1 数据层冒烟验证：页面加载无错 → 机库 → 开战（1v1）→ 读 AI/角色剖面
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 400)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  // 机库配置检查：13 车 aiRole 标注 + roles 解析
  const cfgCheck = await page.evaluate(async () => {
    const { TANKS } = await import('./js/config.js');
    const { roleProfile } = await import('./js/ai/roles.js');
    const { doctrineOf } = await import('./js/ai/doctrine.js');
    const rows = Object.keys(TANKS).map(k => {
      const p = roleProfile(TANKS[k]);
      return `${k}:${TANKS[k].aiRole}/${p.aiHull}/dwell${p.dwellRange}/scoot${p.scootChance}`;
    });
    return { rows, de: doctrineOf('de').contactReaction, ru: doctrineOf('ru').contactReaction };
  });
  console.log('ROLES', JSON.stringify(cfgCheck, null, 1));
  // 开战 1v1（猎豹 vs 随机），确认战斗循环无错
  await page.evaluate(() => { window.__game.ui.selectedTank = 'jagdpanther'; });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(6000);
  const battle = await page.evaluate(() => {
    const g = window.__game;
    return { enemies: g.enemies.map(e => e.cfg.id), aiStates: g.ais.map(a => a.state), diff: g.ais[0].diff.label };
  });
  console.log('BATTLE', JSON.stringify(battle));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
