const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 4000));

  const r1 = await page.evaluate(async () => {
    const g = window.__game, e = g.enemies[0];
    const wait = ms => new Promise(r => setTimeout(r, ms));
    // 用例1：开阔地 350m —— 应正常点亮
    g.player.place(0, 0, Math.PI / 2);   // 朝 +x（heading 约定见 place）
    e.place(350, 0, 0);
    await wait(3500);
    const openSpotted = e.spotted === true;

    // 用例2：树丛掩体 —— 找一个「丛成员」树（12m 内有 ≥4 棵同伴），敌藏其后 12m
    const list = g.world.destructibles.list.filter(d => d.kind === 'inst' && d.type === 'leaf' && d.alive);
    let T = null;
    for (const t of list) {
      if (Math.hypot(t.x, t.z) > 400 || t.x < 60) continue;   // 玩家以东，别太远
      const nb = list.filter(o => o !== t && Math.hypot(o.x - t.x, o.z - t.z) < 12).length;
      if (nb >= 4) { T = t; break; }
    }
    if (!T) return { openSpotted, groveFound: false };
    const dx = T.x - 0, dz = T.z - 0, L = Math.hypot(dx, dz);
    e.place(T.x + dx / L * 12, T.z + dz / L * 12, 0);
    // 重置点亮状态再等检测周期
    e.spotted = false; e.lostContact = false;
    await wait(3500);
    return { openSpotted, groveFound: true, groveSpotted: e.spotted === true, treeX: T.x | 0, treeZ: T.z | 0 };
  });
  console.log('SPOT_PROBE:', JSON.stringify(r1));
  console.log('ERRORS:', errors.length, errors.slice(0, 3));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
