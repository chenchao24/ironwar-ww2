// 开镜完全收敛后的炮口指示器错位测量（等足收敛时间）
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 150)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 5000));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 2500));
  // 敌 300m 正前，开镜，等 14s 完全收敛
  await page.evaluate(() => {
    const g = window.__game, p = g.player, e = g.enemies[0];
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    e.pos.set(p.pos.x + fx * 300, 0, p.pos.z + fz * 300);
    e._syncTransform(1);
    g.rig.aimYaw = p.heading; g.rig.aimPitch = 0;
  });
  await page.keyboard.press('Shift');
  await new Promise(r => setTimeout(r, 14000));
  const m = await page.evaluate(() => {
    const g = window.__game;
    const gm = document.getElementById('gun-marker');
    return {
      aimOffset: +g.player.aimOffset.toFixed(5),
      gmX: parseFloat(gm.style.left), gmY: parseFloat(gm.style.top),
      cx: innerWidth / 2, cy: innerHeight / 2, scoped: g.rig.aiming,
      aimDist: g.aimDist,
    };
  });
  console.log('开镜完全收敛:', JSON.stringify(m),
    '| 错位px:', Math.hypot(m.gmX - m.cx, m.gmY - m.cy).toFixed(1));
  // 不同距离复测：100m / 800m / 1200m
  for (const d of [100, 800, 1200]) {
    await page.evaluate((dd) => {
      const g = window.__game, p = g.player, e = g.enemies[0];
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      e.pos.set(p.pos.x + fx * dd, 0, p.pos.z + fz * dd);
      e._syncTransform(1);
    }, d);
    await new Promise(r => setTimeout(r, 5000));
    const mm = await page.evaluate(() => {
      const g = window.__game;
      const gm = document.getElementById('gun-marker');
      return {
        aimOffset: +g.player.aimOffset.toFixed(5),
        gmX: parseFloat(gm.style.left), gmY: parseFloat(gm.style.top),
        cx: innerWidth / 2, cy: innerHeight / 2,
      };
    });
    console.log(`距 ${d}m:`, JSON.stringify(mm),
      '| 错位px:', Math.hypot(mm.gmX - mm.cx, mm.gmY - mm.cy).toFixed(1));
  }
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
