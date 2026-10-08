// 全流程冒烟测试：封面→菜单→车库→战斗（截图 + 控制台错误收集）
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--window-size=1600,900', '--use-angle=default', '--enable-unsafe-webgpu'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  // 等待加载完成（loading-overlay done → cover）
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/shot-cover.png' });

  // → 菜单
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'scripts/shot-menu.png' });

  // → 车库
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.screenshot({ path: 'scripts/shot-hangar.png' });

  // 切车（看 M4）
  await page.click('#screen-hangar [data-action="next"]');
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: 'scripts/shot-hangar-m4.png' });
  // 切回虎式
  await page.click('#screen-hangar [data-action="prev"]');
  await new Promise(r => setTimeout(r, 1200));

  // → 战斗
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: 'scripts/shot-battle.png' });

  // 开车前进 + 开镜
  await page.keyboard.down('KeyW');
  await new Promise(r => setTimeout(r, 3000));
  await page.keyboard.up('KeyW');
  await page.keyboard.press('Shift');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/shot-scope.png' });

  // 开一炮（鼠标左键）
  await page.mouse.click(800, 450);
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-fire.png' });

  const state = await page.evaluate(() => {
    const g = window.__game;
    return {
      state: g.state,
      playerPos: g.player ? [g.player.pos.x.toFixed(1), g.player.pos.z.toFixed(1)] : null,
      playerCrew: g.player ? g.player.crew.map(c => c.state).join('') : null,
      enemies: g.enemies.map(e => ({ pos: [e.pos.x.toFixed(0), e.pos.z.toFixed(0)], destroyed: e.destroyed, crew: e.crewAlive() })),
      shellsInFlight: g.shells.shells.length,
      fps: g._fpsEl ? g._fpsEl.textContent : null,
    };
  });
  console.log('STATE:', JSON.stringify(state, null, 1));
  console.log('CONSOLE ERRORS (' + errors.length + '):');
  errors.slice(0, 15).forEach(e => console.log('  ', e.slice(0, 300)));
  await browser.close();
})().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
