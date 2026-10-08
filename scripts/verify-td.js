// M18/M36 接入验证：车库断言（轮/机枪/炮塔分组）+ 实战行驶（轮转/履带UV/极速）+ 截图
// 用法: node scripts/verify-td.js m18  （或 m36）
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ID = process.argv[2] || 'm18';
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
  await page.evaluate((id) => {
    const g = window.__game;
    g.ui.selectedTank = id;
    g._loadTankThenShow(id);
  }, ID);
  await sleep(4000);
  const st = await page.evaluate(() => {
    const t = window.__game.menuTank;
    return {
      tank: t && t.cfg.id, y: t ? +t.root.position.y.toFixed(2) : null,
      turretChildren: t ? t.turretGroup.children.length : null,
      barrelChildren: t ? t.barrelGroup.children.length : null,
      wheels: t ? t.wheelGroups.length : null,
      trackMats: t ? t.trackMaterials.length : null,
      mg: !!(t && t.mgGroup), hullMg: !!(t && t.hullMgGroup),
      shellType: t ? t.shellType : null,
    };
  });
  console.log(`车库 ${ID} →`, JSON.stringify(st));
  await page.screenshot({ path: `scripts/shot-${ID}-garage.png` });

  await page.click('.fh-start-btn');
  await sleep(9000);
  const bt = await page.evaluate(() => {
    const g = window.__game;
    return { state: g.state, player: g.player && g.player.cfg.id };
  });
  console.log('战斗状态:', JSON.stringify(bt));
  await page.screenshot({ path: `scripts/shot-${ID}-battle.png` });

  // 行驶测试：W 前进 3 秒
  const before = await page.evaluate(() => {
    const p = window.__game.player;
    return {
      wheel0: p.wheelGroups[0] ? p.wheelGroups[0].group.rotation.x : null,
      track: p.trackMaterials.map(t => ({ u: +t.offset.x.toFixed(3), v: +t.offset.y.toFixed(3) })),
    };
  });
  await page.keyboard.down('KeyW');
  await sleep(3000);
  const during = await page.evaluate(() => {
    const p = window.__game.player;
    return {
      wheel0: p.wheelGroups[0] ? p.wheelGroups[0].group.rotation.x : null,
      track: p.trackMaterials.map(t => ({ u: +t.offset.x.toFixed(3), v: +t.offset.y.toFixed(3) })),
      speed: +p.speed.toFixed(2),
      kmh: +(p.speed * 3.6).toFixed(1),
    };
  });
  await page.screenshot({ path: `scripts/shot-${ID}-driving.png` });
  await page.keyboard.up('KeyW');
  console.log('行驶前:', JSON.stringify(before));
  console.log('行驶中:', JSON.stringify(during));
  console.log('轮转角变化:', during.wheel0 - before.wheel0);
  console.log('履带UV变化:', JSON.stringify(during.track.map((t, i) => ({ du: +(t.u - before.track[i].u).toFixed(3), dv: +(t.v - before.track[i].v).toFixed(3) }))));
  console.log('控制台错误数:', errs.length);
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
