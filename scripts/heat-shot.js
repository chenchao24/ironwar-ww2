// 热浪区域特写 + 两帧差分热图（确认扭曲范围/形状/边界无缝，视觉核对用）
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--use-angle=default'],
    defaultViewport: { width: 1280, height: 720 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await sleep(400);
  await page.click('#screen-cover'); await sleep(400);
  await page.click('#btn-hunt-mode');
  await page.waitForFunction(() => window.__game.state === 'hangar' && window.__game.menuTank, { timeout: 30000 });
  await sleep(1500);
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(3500);

  // 放大位移 + 冻结战场（paused 只停物理/相机；热浪 uTime 独立推进 → 差分即纯热浪图案）
  await page.evaluate(() => { window.__game.heat.debugBoost = 3; window.__game.paused = true; });
  const r = await page.evaluate(() => {
    const g = window.__game;
    const q = g.heat._quads.find(q => q.visible);
    const p = q.position.clone().project(g.camera);
    return { sx: (p.x * 0.5 + 0.5) * innerWidth, sy: (-p.y * 0.5 + 0.5) * innerHeight, n: g.heat._n };
  });
  const S = 150;
  const clip = { x: Math.max(0, r.sx - S / 2), y: Math.max(0, r.sy - S / 2), width: S, height: S };
  const a = await page.screenshot({ clip });
  await sleep(120);
  const b = await page.screenshot({ clip });
  await page.screenshot({ clip: { x: Math.max(0, clip.x - 30), y: Math.max(0, clip.y - 30), width: S + 60, height: S + 60 }, path: 'scripts/shot-heat-closeup.png' });

  // 差分热图：abs diff ×6 增益
  const [ra, rb] = await Promise.all([a, b].map(x => sharp(x).raw().toBuffer({ resolveWithObject: true })));
  const { data: da, info } = ra, db = rb.data;
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0, j = 0; i < da.length; i += info.channels, j += 3) {
    out[j] = Math.min(255, (Math.abs(da[i] - db[i])) * 6);
    out[j + 1] = Math.min(255, (Math.abs(da[i + 1] - db[i + 1])) * 6);
    out[j + 2] = Math.min(255, (Math.abs(da[i + 2] - db[i + 2])) * 6);
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
    .resize(S * 3, S * 3, { kernel: 'nearest' }).png().toFile('scripts/shot-heat-diffmap.png');
  console.log('closeup + diffmap saved', JSON.stringify(r));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
