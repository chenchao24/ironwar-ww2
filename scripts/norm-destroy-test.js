// 诺曼底建筑击毁效果测试：AP 命中（效果不扣血）→ HE ×3（终击倾斜倒塌 → 废墟）
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 150)));
  await page.evaluateOnNewDocument(() => {
    const s = JSON.parse(localStorage.getItem('ironwar3_settings') || '{}');
    s.mapId = 'normandy';
    localStorage.setItem('ironwar3_settings', JSON.stringify(s));
  });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 6000));

  // 选一栋主街北排建筑，把玩家停到它正前方
  const target = await page.evaluate(() => {
    const g = window.__game;
    g.player.applyHit = () => ({ type: 'bounce', pen: false }); g.player.resolveHit = () => null;
    for (const e of g.enemies) e.place(900, 900, 0);
    const d = g.world.destructibles.list.find(d => d.kind === 'group' && d.type === 'eu_le_mans_row');
    if (!d) return null;
    g.player.place(d.cx, d.cz + 40, 0);
    g.rig.aimYaw = Math.PI; g.rig.aimPitch = 0.08; g.rig.dist = 16;
    return { type: d.type, hp: d.hp, x: d.cx, z: d.cz };
  });
  console.log('TARGET:', JSON.stringify(target));
  await new Promise(r => setTimeout(r, 1200));

  const hitAt = (type) => page.evaluate(({ type, x, z }) => {
    const g = window.__game;
    const d = g.world.destructibles.list.find(d => d.kind === 'group' && d.type === 'eu_le_mans_row');
    const pos = new (Object.getPrototypeOf(g.camera.position).constructor)(x, g.world.groundY(x, z) + 3, z + 12);
    g.world.destructibles.damageDestructible(d, pos, type);
    return d.hp;
  }, { type, x: target.x, z: target.z });

  // AP 命中：只出效果不扣血
  let hp = await hitAt('ap');
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'scripts/shot-dest-ap.png' });
  console.log('AP hit → hp:', hp, '(应不变=3)');

  // HE ×3：第 1、2 发灰化+烟尘，第 3 发终击倒塌
  hp = await hitAt('he');
  await page.screenshot({ path: 'scripts/shot-dest-he1.png' });
  hp = await hitAt('he');
  await new Promise(r => setTimeout(r, 400));
  hp = await hitAt('he');
  console.log('HE×3 → hp:', hp, '(应 0)');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/shot-dest-collapse1.png' });   // 浓烟全罩+开始下沉
  await new Promise(r => setTimeout(r, 1600));
  await page.screenshot({ path: 'scripts/shot-dest-collapse2.png' });   // 倾斜沉降中
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: 'scripts/shot-dest-rubble.png' });      // 废墟定型
  const fin = await page.evaluate(() => {
    const g = window.__game;
    const d = g.world.destructibles.list.find(d => d.type === 'eu_le_mans_row');
    return { alive: d.alive, collapsing: g.world.destructibles.collapsing?.length ?? -1 };
  });
  console.log('FINAL:', JSON.stringify(fin), 'ERRORS:', errors.join('|') || 'none');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
