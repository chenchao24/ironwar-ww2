// 炮口指示器对中验证：不同瞄准俯仰角下，收敛后 marker 与屏幕中心的像素偏差（俯仰经 addAim 限位）
// + 缩圈刻度环截图：行驶扩圈（白）→ 静止收敛完成（绿）
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 300)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(400);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate(() => { window.__game.ui.selectedTank = 'tiger1'; });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await page.evaluate(() => {
    window.__game.ais.forEach(ai => { ai.update = () => {}; });   // 冻结 AI 决策
    // 冻结敌车（noop 前若已有速度会一直滑行撞玩家：drive 是积分器，须同时清零速度）
    for (const e of window.__game.enemies) { e.drive = () => {}; e.throttle = 0; e.steer = 0; e.speed = 0; }
  });
  await sleep(2500);

  for (const pitch of [0, 0.15, 0.3, 0.42, -0.1, -0.2, -0.3]) {
    await page.evaluate((pt) => {
      const g = window.__game;
      g.rig.aimPitch = pt;
      g.rig.addAim(0, 0);   // 触发炮架俯仰限位
    }, pitch);
    await sleep(500);   // 让伺服先拉开偏差（避免 waitForFunction 读到上一档的残留 aimOffset=0）
    // 等伺服真正收敛（最多 15s 轮询）
    await page.waitForFunction(() => window.__game.player.aimOffset < 0.006, { timeout: 15000 }).catch(() => {});
    await sleep(150);
    const r = await page.evaluate(() => {
      const g = window.__game;
      const gm = document.getElementById('gun-marker');
      const shown = gm.style.display !== 'none';
      const cx = innerWidth / 2, cy = innerHeight / 2;
      return {
        want: null, pitch: +g.rig.aimPitch.toFixed(3),
        aimOffset: +g.player.aimOffset.toFixed(4),
        shown,
        dx: shown ? +(parseFloat(gm.style.left) - cx).toFixed(1) : null,
        dy: shown ? +(parseFloat(gm.style.top) - cy).toFixed(1) : null,
        range: g.aimDist,
      };
    });
    r.want = pitch;
    console.log(JSON.stringify(r));
  }

  // ── 缩圈刻度环：急转炮塔扩圈 → 白色；静止收敛 → 绿色 ──
  await page.evaluate(() => { const g = window.__game; g.rig.aimPitch = 0; g.rig.addAim(0, 0); });
  await page.evaluate(() => { window.__game.rig.addAim(1.2, 0); });   // 猛甩视角 → 炮塔伺服跟不上 → 扩圈
  await sleep(700);
  const bloom = await page.evaluate(() => {
    const g = window.__game;
    const ch = document.getElementById('crosshair');
    return { w: ch.style.width, aimed: ch.classList.contains('aimed'),
      txt: document.getElementById('aim-progress').textContent };
  });
  await page.screenshot({ path: 'scripts/shot-crosshair-bloom.png' });
  await sleep(8000);
  const conv = await page.evaluate(() => {
    const g = window.__game;
    const ch = document.getElementById('crosshair');
    return { w: ch.style.width, aimed: ch.classList.contains('aimed'),
      txt: document.getElementById('aim-progress').textContent };
  });
  await page.screenshot({ path: 'scripts/shot-crosshair-converged.png' });
  console.log('BLOOM:', JSON.stringify(bloom), ' CONVERGED:', JSON.stringify(conv));
  await browser.close();
})();
