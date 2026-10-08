const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1280, height: 720 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 200)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await sleep(1500);
  const out = await page.evaluate(async () => {
    const hedge = await import('./js/hedge.js');
    const t1 = hedge.hedgeUniforms.uTime.value;
    await new Promise(r => setTimeout(r, 800));
    const t2 = hedge.hedgeUniforms.uTime.value;
    return { t1: +t1.toFixed(2), t2: +t2.toFixed(2), amp: hedge.hedgeUniforms.uWindAmp.value, advancing: t2 > t1 };
  });
  console.log('风摆 uniforms:', JSON.stringify(out));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
