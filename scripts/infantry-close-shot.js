// 步兵 demo 特写：行军 → 炮击卧倒 → 点杀（镜头跟踪美军班）
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  await page.goto('http://localhost:8081/infantry-test.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3500));

  // 特写：跟拍美军班排头
  await page.evaluate(() => {
    const d = window.__demo, sq = d.squads[1];
    const s = sq.soldiers[2];
    d.lookAt(s.root.position.x, 1.0, s.root.position.z, 10);
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'scripts/shot-inf-close-march.png' });

  // 朝美军班脚下开一炮 → 卧倒
  await page.evaluate(() => {
    const d = window.__demo, sq = d.squads[1];
    const s = sq.soldiers[4];
    const p = d.worldToScreen(s.root.position.x, 0, s.root.position.z);
    window.__pt = p;
  });
  {
    const pt = await page.evaluate(() => window.__pt);
    await page.mouse.click(pt.x, pt.y);
  }
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => {
    const d = window.__demo, sq = d.squads[1];
    const s = sq.soldiers[2];
    d.lookAt(s.root.position.x, 0.3, s.root.position.z, 8);
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: 'scripts/shot-inf-close-prone.png' });

  // 等恢复后点杀排头
  await new Promise(r => setTimeout(r, 4500));
  const pt2 = await page.evaluate(() => {
    const d = window.__demo, sq = d.squads[1];
    const s = sq.soldiers.find(x => x.state !== 'dead');
    d.lookAt(s.root.position.x, 1.0, s.root.position.z, 8);
    const p = s.root.position.clone(); p.y += 1.0;
    return d.worldToScreen(p.x, p.y, p.z);
  });
  await new Promise(r => setTimeout(r, 400));
  await page.mouse.click(pt2.x, pt2.y);
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: 'scripts/shot-inf-close-kill.png' });

  // 德军班特写（看钢盔/罩衫差异）
  await page.evaluate(() => {
    const d = window.__demo, sq = d.squads[0];
    const s = sq.soldiers.find(x => x.state !== 'dead');
    d.lookAt(s.root.position.x, 1.0, s.root.position.z, 8);
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: 'scripts/shot-inf-close-de.png' });

  console.log('ERRORS:', errors.length, errors.slice(0, 5));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
