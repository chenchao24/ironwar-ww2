// 步兵 demo 截图：行军全景 → 炮击卧倒 → 点杀倒地
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
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: 'scripts/shot-inf-march.png' });

  // 炮击：在页面内用世界坐标→屏幕坐标转换，往德班附近地面开一炮
  const pt = await page.evaluate(() => {
    const w = window.__demo;
    if (!w) return null;
    return w.worldToScreen(-10, 0, 8);
  });
  if (pt) {
    await page.mouse.click(pt.x, pt.y);
  } else {
    // fallback：直接点画面中央偏左
    await page.mouse.click(700, 480);
  }
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: 'scripts/shot-inf-shell.png' });
  // 卧倒姿态近景（拖近镜头）
  await page.evaluate(() => window.__demo && window.__demo.lookAt(-12, 0.4, 10, 9));
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'scripts/shot-inf-prone.png' });
  // 等卧倒恢复后再点杀一名士兵
  await new Promise(r => setTimeout(r, 4000));
  const sp = await page.evaluate(() => window.__demo ? window.__demo.firstAliveSoldierScreen() : null);
  if (sp) await page.mouse.click(sp.x, sp.y);
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/shot-inf-kill.png' });
  console.log('ERRORS:', errors.length, errors.slice(0, 5));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
