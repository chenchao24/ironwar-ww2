// 阿登校验：炮弹穿树（树倒弹不停）+ 压实雪路系数 + 复查截图
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3000));
  await page.select('#fh-map-select', 'ardennes');
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game && window.__game.player, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => { const g = window.__game; g.player.applyHit = () => {}; g.player.resolveHit = () => null; });

  const res = await page.evaluate(() => {
    const g = window.__game, w = g.world, des = w.destructibles;
    const T = window.__THREE_VEC3 || null;
    // 造 Vector3 用游戏内类：从 player.root.position 构造器拿
    const V3 = g.player.root.position.constructor;
    const out = {};
    // 1) 炮弹穿树：取一棵活雪松，线段穿树干
    const tree = des.list.find(d => d.kind === 'inst' && d.type === 'snowpine' && d.alive);
    const prev = new V3(tree.x - 25, tree.y + 2.2, tree.z);
    const pos = new V3(tree.x + 25, tree.y + 2.2, tree.z);
    const blocked = des.shellHit(prev, pos, { shellType: 'ap' });
    out.treePassThrough = { blocked, treeAlive: tree.alive };   // 期望 blocked=false, alive=false（倒而不挡）
    // 2) 房屋仍挡弹：找一栋村屋，线段穿其包围盒（y 用地面高——实战 hitPos 来自弹道点，必为有限值）
    const house = des.list.find(d => d.kind === 'group' && d.type.startsWith('eu_') && d.alive);
    const hy = des.groundY(house.cx, house.cz) + 2;
    const hp = new V3(house.cx - 30, hy, house.cz);
    const hq = new V3(house.cx + 30, hy, house.cz);
    out.houseBlocks = des.shellHit(hp, hq, { shellType: 'ap' });   // 期望 true
    // 3) 压实雪路系数
    out.roadK = { main: w.roadSpeedAt(0, 64), lane: w.roadSpeedAt(-20, -30), off: w.roadSpeedAt(0, 500) };
    // 4) 出生带净高差（不卡坡）
    let mn = 1e9, mx = -1e9;
    for (let i = 0; i < 40; i++) {
      const h = w.groundY(-740 + Math.random() * 60, -160 + Math.random() * 320);
      mn = Math.min(mn, h); mx = Math.max(mx, h);
    }
    out.spawnBandRelief = +(mx - mn).toFixed(2);
    return out;
  });
  console.log('VERIFY:', JSON.stringify(res));

  // 复查截图：西界外（原白墙位）+ 主路 + 村
  const shots = [
    ['border-west', -700, 0, -Math.PI / 2, 0.05, 14],
    ['road2', -600, 132, Math.PI / 2, -0.02, 15],
    ['village2', -160, 60, Math.PI / 2 + 0.3, -0.03, 16],
  ];
  for (const [name, x, z, yaw, pitch, dist] of shots) {
    await page.evaluate((x2, z2, y2, p2, d2) => {
      const g = window.__game;
      g.player.place(x2, z2, 0);
      g.rig.aimYaw = y2; g.rig.aimPitch = p2; g.rig.dist = d2;
    }, x, z, yaw, pitch, dist);
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: 'scripts/shot-ardennes-' + name + '.png' });
  }
  console.log('ERRORS:', errors.length, errors.slice(0, 4));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
