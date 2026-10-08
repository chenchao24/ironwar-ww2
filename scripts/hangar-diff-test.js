// 机库难度直选冒烟：点击进入王牌 → settings 生效 → 刷新后保持 + 主菜单弹窗一致
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
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover'); await sleep(400);
  await page.click('#btn-hunt-mode'); await sleep(3000);
  await page.click('#fh-diff-row [data-diff="ace"]');
  await sleep(300);
  const s1 = await page.evaluate(() => window.__game.ui.settings.difficulty);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover'); await sleep(400);
  await page.click('#btn-hunt-mode'); await sleep(3000);
  const s2 = await page.evaluate(() => ({
    diff: window.__game.ui.settings.difficulty,
    active: document.querySelector('#fh-diff-row .fh-diff-btn.active').dataset.diff,
  }));
  // 主菜单弹窗一致性
  const s3 = await page.evaluate(() => {
    window.__game.ui._syncGameUI();
    return document.getElementById('set-difficulty').value;
  });
  console.log(JSON.stringify({ afterClick: s1, afterReload: s2, menuModal: s3 }));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
