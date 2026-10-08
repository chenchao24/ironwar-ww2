// 循环接缝波形分析：解码虎王引擎 PCM，计算 20ms 窗 RMS/过零率包络，
// 搜索巡航段 [3.5, 7.87] 内最优循环边界（电平匹配 + 避开瞬态 + 越长越好）
const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.__audio, { timeout: 60000, polling: 300 });
  await page.evaluate(() => { if (!window.__audio.started) window.__audio.init(); });

  const files = process.argv.slice(2).length ? process.argv.slice(2) : ['tiger2-egUp.mp3', 'tiger2-eg.mp3', 'pz5a-egAll.mp3'];
  const env = await page.evaluate(async (names) => {
    const out = {};
    const ctx = window.__audio.ctx;
    for (const n of names) {
      const res = await fetch('/tankSound/' + n);
      const buf = await res.arrayBuffer();
      const audio = await ctx.decodeAudioData(buf.slice(0));
      const ch = audio.getChannelData(0);
      const sr = audio.sampleRate;
      const win = Math.floor(sr * 0.02);   // 20ms 窗
      const envs = [];
      for (let s = 0; s + win <= ch.length; s += win) {
        let sum = 0, zc = 0, prev = ch[s];
        for (let i = 0; i < win; i++) { const v = ch[s + i]; sum += v * v; if ((v >= 0) !== (prev >= 0)) zc++; prev = v; }
        envs.push({ t: +(s / sr).toFixed(3), rms: +Math.sqrt(sum / win).toFixed(4), zc: zc / win });
      }
      out[n] = { dur: +audio.duration.toFixed(2), sr, envs };
    }
    return out;
  }, files);
  await browser.close();
  fs.writeFileSync('scripts/_loop_env.json', JSON.stringify(env));
  console.log('envelopes written for:', files.join(', '));

  // ── 节点侧分析 ──
  for (const n of files) {
    const d = env[n];
    console.log('\n══ ' + n + ' dur=' + d.dur + 's ══');
    const E = d.envs;
    const rmsAt = (t) => { const i = Math.min(E.length - 1, Math.max(0, Math.round(t / 0.02))); return E[i].rms; };
    const zcAt = (t) => { const i = Math.min(E.length - 1, Math.max(0, Math.round(t / 0.02))); return E[i].zc; };
    // 输出 0.2s 粒度包络（供人工核对）
    let line = '';
    for (let t = 0; t < d.dur; t += 0.2) line += t.toFixed(1) + ':' + rmsAt(t).toFixed(3) + '  ';
    console.log('RMS包络: ' + line);
    // 最优循环搜索：在 [lo, hi] 内选 (a, b)，a∈[seg0, seg0+1.0]，b∈[bLo, dur-0.05]
    function bestLoop(seg0, bLo, hi, tag) {
      let best = null, top = [];
      for (let a = seg0; a <= seg0 + 1.0 + 1e-9; a += 0.02) {
        for (let b = bLo; b <= hi + 1e-9; b += 0.02) {
          const len = b - a;
          if (len < 2.0) continue;
          // 接缝电平差（两侧各 120ms 均值）与过零率差（音色代理）
          const ra = (rmsAt(a) + rmsAt(a + 0.06) + rmsAt(a + 0.12)) / 3;
          const rb = (rmsAt(b - 0.12) + rmsAt(b - 0.06) + rmsAt(b)) / 3;
          const za = (zcAt(a) + zcAt(a + 0.06) + zcAt(a + 0.12)) / 3;
          const zb = (zcAt(b - 0.12) + zcAt(b - 0.06) + zcAt(b)) / 3;
          const lvl = Math.abs(ra - rb) / Math.max(0.01, (ra + rb) / 2);
          const tone = Math.abs(za - zb) / Math.max(0.01, (za + zb) / 2);
          // 边界 250ms 内的瞬态惩罚（相邻窗跳变 >35%）
          let spike = 0;
          for (let t = b - 0.25; t < b; t += 0.02) spike = Math.max(spike, Math.abs(rmsAt(t + 0.02) - rmsAt(t)) / Math.max(0.01, rmsAt(t)));
          for (let t = a; t < a + 0.25; t += 0.02) spike = Math.max(spike, Math.abs(rmsAt(t + 0.02) - rmsAt(t)) / Math.max(0.01, rmsAt(t)));
          const score = lvl * 2.0 + tone * 0.6 + spike * 1.5 - len * 0.012;   // 电平为主，音色/瞬态次之，长度奖励小
          top.push({ a: +a.toFixed(2), b: +b.toFixed(2), len: +len.toFixed(2), lvl: +lvl.toFixed(3), tone: +tone.toFixed(3), spike: +spike.toFixed(2), score: +score.toFixed(3) });
          if (!best || score < best.score) best = top[top.length - 1];
        }
      }
      top.sort((x, y) => x.score - y.score);
      console.log(tag + ' 最优接缝 TOP5:');
      top.slice(0, 5).forEach((c) => console.log('  ', JSON.stringify(c)));
      return best;
    }
    if (n === 'tiger2-egUp.mp3') bestLoop(3.5, 5.0, d.dur - 0.05, '巡航段');
    if (n === 'tiger2-eg.mp3') bestLoop(0.0, 2.0, d.dur - 0.05, '怠速段');
    if (n === 'pz5a-egAll.mp3') bestLoop(7.0, 9.0, 15.0, '巡航段(7-15)');
    if (n === 'tiger2-start-egUp.mp3') bestLoop(3.0, 12.0, d.dur - 0.05, '猎虎循环段');
    if (n === 'usa/m26-egDown.mp3') bestLoop(4.0, 6.0, d.dur - 0.3, 'm26巡航接缝');
    if (n === 'usa/m4-egDown.mp3') bestLoop(3.0, 5.0, 20.0, 'm4巡航接缝(17前)');
    if (n === 'rus/t34-egAll.mp3') bestLoop(4.0, 6.0, 14.0, 't34巡航接缝(14前)');
  }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
