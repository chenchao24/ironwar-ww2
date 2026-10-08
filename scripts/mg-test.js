// 新机枪系统验证：前机枪挂载/射界/发射 + 同轴右键 + UI 元素
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 2500));

  const r = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const out = {};
    out.state = g.state;
    // 1. 前机枪组挂载（车体，不在炮塔组内）
    out.hullMg = !!p.hullMgGroup;
    out.hullMgParentIsModel = p.hullMgGroup ? p.hullMgGroup.parent === p.model : false;
    out.mgOnTurret = p.mgGroup ? p.mgGroup.parent === p.turretGroup : false;
    out.hullMuzzle = p.hullMgMuzzleLocal ? p.hullMgMuzzleLocal.toArray().map(v => +v.toFixed(2)) : null;
    // 2. 射界：正前 50m 目标应可瞄准
    const fwd = new (Object.getPrototypeOf(p.pos).constructor)(p.pos.x + Math.sin(p.heading) * 50, 0, p.pos.z + Math.cos(p.heading) * 50);
    fwd.y = p.root.position.y + 1.5;
    out.inArc = p.updateHullMg(0.016, fwd);
    out.inArcHullYaw = +p.hullYaw.toFixed(3);
    // 侧后 90° 目标应超界
    const side = new (Object.getPrototypeOf(p.pos).constructor)(p.pos.x + Math.sin(p.heading + Math.PI / 2) * 50, 0, p.pos.z + Math.cos(p.heading + Math.PI / 2) * 50);
    side.y = p.root.position.y + 1.5;
    out.outArc = p.updateHullMg(0.016, side) === false;
    p.updateHullMg(0.016, fwd); // 复位
    // 3. MG 弹药池
    out.mgAmmo = p.mgAmmo;
    // 4. UI 元素
    out.ui = {
      gunMarker: !!document.getElementById('gun-marker'),
      gsBar: !!document.querySelector('#gs-reload-bar i'),
      btBar: !!document.querySelector('#reload-bar-bottom i'),
      btWrap: !!document.getElementById('reload-wrap-bottom'),
      ammoRows: [...document.querySelectorAll('#ammo-panel .am-row')].map(el => el.className),
      reloadRingGone: !document.getElementById('reload-ring'),
      gsRingGone: !document.querySelector('.gsr-fg'),
    };
    // 5. 敌人点亮（AI 视线对称）→ 前机枪自动瞄准目标后开火计数
    return out;
  });

  // 模拟按住 F（前机枪）与中键（同轴）各 1.2s，看 MG 弹药消耗
  const ammoBefore = await page.evaluate(() => window.__game.player.mgAmmo);
  await page.keyboard.down('KeyF');
  await new Promise(r => setTimeout(r, 1200));
  await page.keyboard.up('KeyF');
  const afterF = await page.evaluate(() => window.__game.player.mgAmmo);
  await page.mouse.move(800, 450);
  await page.mouse.down({ button: 'middle' });
  await new Promise(r => setTimeout(r, 1200));
  await page.mouse.up({ button: 'middle' });
  const afterR = await page.evaluate(() => window.__game.player.mgAmmo);
  r.mgConsumedF = ammoBefore - afterF;
  r.mgConsumedCoax = afterF - afterR;
  console.log(JSON.stringify(r, null, 1));
  console.log('CONSOLE ERRORS:', errors.length, errors.slice(0, 5));
  await browser.close();
})().catch(e => { console.error('TEST FAIL:', e.message); process.exit(1); });
