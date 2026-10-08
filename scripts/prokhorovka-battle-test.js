// 普罗霍罗夫卡实机验证：进战 / 南北出生带 / 冲沟地形（深度+可渡）/ 田块纹理 / 目检
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
  let failed = 0;
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' | ' + extra : '')); if (!ok) failed++; };
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 260)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 400)));
  await page.evaluateOnNewDocument(() => {
    const s = JSON.parse(localStorage.getItem('ironwar3_settings') || '{}');
    s.mapId = 'prokhorovka';
    localStorage.setItem('ironwar3_settings', JSON.stringify(s));
  });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate(() => document.querySelector('[data-map="prokhorovka"]').click());
  await sleep(300);
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(5000);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);

  // 1) 地图 / 出生带（南北短边走廊）
  const a1 = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    return {
      mapId: g.world.mapId,
      sizeX: g.world.mapSizeX, sizeZ: g.world.mapSizeZ,
      pSpawn: [+p.pos.x.toFixed(0), +p.pos.z.toFixed(0)],
      eSpawn: g.enemies.map((e) => [+e.pos.x.toFixed(0), +e.pos.z.toFixed(0)]),
      inN: p.pos.x >= -280 && p.pos.x <= 280 && p.pos.z >= -740 && p.pos.z <= -640,
    };
  });
  check('map is prokhorovka (1500×1500)', a1.mapId === 'prokhorovka' && a1.sizeX === 1500 && a1.sizeZ === 1500, `${a1.mapId} ${a1.sizeX}×${a1.sizeZ}`);
  check('player spawns in north corridor', a1.inN, JSON.stringify(a1.pSpawn));
  check('enemies spawn in south corridor', a1.eSpawn.every(([x, z]) => x >= -280 && x <= 280 && z >= 640 && z <= 740), JSON.stringify(a1.eSpawn));

  // 2) 冲沟地形：G2 中央冲沟剖面（沿 x=−300 南北采样的最低点应下切 ≥12m）
  const a2 = await page.evaluate(() => {
    const g = window.__game;
    let minH = 99, maxH = -99;
    for (let z = 45; z <= 245; z += 8) {
      const h = g.world.groundY(-300, z);
      minH = Math.min(minH, h); maxH = Math.max(maxH, h);
    }
    return { minH: +minH.toFixed(1), maxH: +maxH.toFixed(1), cut: +(maxH - minH).toFixed(1) };
  });
  check('G2 ravine cuts ≥12m below plateau', a2.cut >= 12, JSON.stringify(a2));

  // 3) 草原速度：虎式 0.53×0.95×38 ≈ 19.1km/h
  await page.evaluate(() => {
    const g = window.__game, pl = g.player;
    pl.place(300, -600, 180);   // 北台地开阔处朝南
    pl.speed = 0;
  });
  await page.keyboard.down('KeyW');
  let steppeTop = 0;
  for (let i = 0; i < 8; i++) {
    await sleep(1500);
    const s = await page.evaluate(() => +(window.__game.player.speed * 3.6).toFixed(1));
    steppeTop = Math.max(steppeTop, s);
  }
  await page.keyboard.up('KeyW');
  check('steppe speed ≈19.1km/h (0.53×0.95×38)', steppeTop > 17 && steppeTop < 21.5, 'max=' + steppeTop.toFixed(1));

  // 4) 目检：沟口村（G2 渡口台沿）+ 冲沟棱线视角
  await page.evaluate(() => {
    const g = window.__game, pl = g.player;
    pl.place(-60, -20, 180);   // 沟口村北缘面南看渡口
    g.rig.aimYaw = Math.PI; g.rig.aimPitch = 0.04; g.rig.dist = 15;
  });
  await sleep(1200);
  await page.screenshot({ path: 'scripts/shot-pk-village.png' });
  await page.evaluate(() => {
    const g = window.__game, pl = g.player;
    pl.place(-500, -240, 155);   // 中央台地西段面南看 G2 冲沟全景
    g.rig.aimYaw = Math.PI; g.rig.aimPitch = -0.12; g.rig.dist = 30;
  });
  await sleep(1200);
  await page.screenshot({ path: 'scripts/shot-pk-ravine.png' });

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  console.log(failed === 0 && errors.length === 0 ? 'PROKHOROVKA BATTLE TEST: ALL PASS' : `FAILED (${failed})`);
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
