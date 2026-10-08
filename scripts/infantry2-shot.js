// 步兵 v2 demo 校验：三阵营姿态 + 班组交互 + draw call 统计
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ? e.stack.slice(0, 300) : e.message.slice(0, 160)));
  await page.goto('http://localhost:8081/infantry2-test.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  // 三阵营姿态审查（特写）
  for (const st of ['idle', 'walk_sling', 'stand_fire', 'prone_alert', 'death', 'explode']) {
    await page.evaluate(s => window.__demo.setAnim(s), st);
    await page.evaluate(() => window.__demo.lookAt(0, 1.1, 5, 7));
    await new Promise(r => setTimeout(r, st === 'death' || st === 'explode' ? 2600 : 1300));
    await page.screenshot({ path: `scripts/shot-inf2-${st}.png` });
  }
  // 行军班全景
  await page.evaluate(() => { window.__demo.setAnim('idle'); window.__demo.lookAt(0, 1, 0, 40); });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/shot-inf2-squads.png' });
  // 炮击班组（德班）
  await page.evaluate(() => {
    const d = window.__demo, sq = d.squads[0];
    const s = sq.soldiers[3];
    const p = d.worldToScreen(s.root.position.x, s.root.position.y, s.root.position.z);
    window.__pt = p;
  });
  {
    const pt = await page.evaluate(() => window.__pt);
    await page.mouse.click(pt.x, pt.y);
  }
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => {
    const d = window.__demo, sq = d.squads[0];
    const s = sq.soldiers[3];
    d.lookAt(s.root.position.x, 0.4, s.root.position.z, 12);
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'scripts/shot-inf2-shell.png' });

  const info = await page.evaluate(() => window.__demo.info());
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(n / 2)); };
    requestAnimationFrame(tick);
  }));
  console.log('INFO:', JSON.stringify(info), 'FPS:', fps);
  console.log('ERRORS:', errors.length, errors.slice(0, 4));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
