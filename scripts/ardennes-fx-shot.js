// 雪地特效校验：AP/HE 落地、尘堆、倒树落雪 —— 阿登（雪白）vs 库尔斯克（土色，回归对照）
const puppeteer = require('puppeteer-core');

async function boot(page, mapId) {
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3000));
  await page.select('#fh-map-select', mapId);
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game && window.__game.player, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => { const g = window.__game; g.player.applyHit = () => {}; g.player.resolveHit = () => null; });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));

  // ══ 阿登 ══
  await boot(page, 'ardennes');
  const theme = await page.evaluate(() => window.__game.effects.theme);
  console.log('ardennes theme =', theme);

  // 视点：村内空地，效果打在前方 45m
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(-160, 55, 90);
    g.rig.aimYaw = Math.PI / 2; g.rig.aimPitch = -0.04; g.rig.dist = 13;
  });
  // 1) AP 落地 + HE 落地（左右两点）
  await page.evaluate(() => {
    const g = window.__game, V3 = g.player.root.position.constructor;
    g.effects.dirtHit(new V3(-118, 0, 45), 1);                    // AP
    g.effects.dirtHit(new V3(-118, 0, 68), 1.8);                  // HE 土柱
    g.effects.heGround(new V3(-118, 0, 68));                      // HE 爆压尘幕
  });
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: 'scripts/shot-fx-snow-aphe.png' });
  // 2) 尘堆（0.5s 延迟腾起，2s 到顶）
  await page.evaluate(() => {
    const g = window.__game, V3 = g.player.root.position.constructor;
    g.effects.dustMound(new V3(-125, 0, 56), 88);
  });
  await new Promise(r => setTimeout(r, 2200));
  await page.screenshot({ path: 'scripts/shot-fx-snow-mound.png' });
  // 3) 倒树落雪（炮击毁树：烟 + 落雪碎片）
  await page.evaluate(() => {
    const g = window.__game, w = g.world, V3 = g.player.root.position.constructor;
    const t = w.destructibles.list.find(d => d.kind === 'inst' && d.type === 'snowpine' && d.alive && Math.hypot(d.x + 160, d.z - 55) < 160);
    window.__tree = t;
    if (t) w.destructibles.damageDestructible(t, new V3(t.x, t.y + 2, t.z));
    // 把玩家挪到树旁看
    if (t) { g.player.place(t.x - 26, t.z + 6, 0); g.rig.aimYaw = Math.PI / 2 + 0.2; g.rig.aimPitch = 0.06; g.rig.dist = 12; }
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-fx-snow-tree.png' });
  const treeState = await page.evaluate(() => window.__tree ? { alive: window.__tree.alive, type: window.__tree.type } : null);
  console.log('tree felled:', JSON.stringify(treeState));

  // ══ 库尔斯克回归对照 ══
  await boot(page, 'kursk');
  const theme2 = await page.evaluate(() => window.__game.effects.theme);
  console.log('kursk theme =', theme2);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(0, -40, 0);
    g.rig.aimYaw = 0; g.rig.aimPitch = -0.04; g.rig.dist = 13;
    const V3 = g.player.root.position.constructor;
    for (let i = 0; i < 8; i++) {   // 环玩家一圈放 HE 落点，保证入镜
      const a = i / 8 * Math.PI * 2;
      const px = Math.sin(a) * 50, pz = -40 + Math.cos(a) * 50;
      g.effects.dirtHit(new V3(px, 0, pz), 1.8);
      g.effects.heGround(new V3(px, 0, pz));
    }
  });
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: 'scripts/shot-fx-kursk-he.png' });

  console.log('ERRORS:', errors.length, errors.slice(0, 4));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
