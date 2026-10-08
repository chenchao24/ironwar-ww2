// 程序化灌木丛模块 —— 从 showcase.html 固化（2026-09-11 定稿调参），供地图布置使用。
//
// ══ 地图集成用法 ══
//   import { buildHedgeTemplate, instantiateHedges, updateHedge } from './hedge.js';
//   const tpl = buildHedgeTemplate({ len: 10, seed: 1234 });          // 种子化 → 布局可复现
//   const { group, stats } = instantiateHedges(group, tpl, placements, {
//     chunkSize: 120,            // 分块合并网格（米）；地图级必须分块，实测见下
//     groundY: (x, z) => 0,      // 地形高度（kurskHeight），灌木基部贴地
//     mipmaps: false,            // ⚠ 地图必须 false：alphaTest 下高层 mip 把 alpha 平均到
//                                //   阈值以下，150m 外整丛凭空消失只剩影子（旧灌木带实测教训）
//     groundTrack: true,         // 若后续要整体旋转 group（如灌木带随出生角旋转）：记录每实例
//                                //   采样坐标，旋转后用返回值 reground(prevA, newA, groundY) 重贴地
//   });
//   // 主循环每帧：updateHedge(elapsedTime);
//
// ══ 性能契约（实测，scripts/showcase-perf.js / showcase-stress.js / showcase-wind-perf.js） ══
//   - 单条 10m 丛 ≈ 5-7k 卡片 / 2-3 万三角 / 6 draw call（每变体一个 InstancedMesh）；
//   - 开销大头是叶片卡片元 overdraw（正常观察距离 -10% 帧率量级）；阴影 pass 与风摆顶点
//     shader 实测零影响；
//   - 多丛布置必须"分块合并"（每 chunkSize 网格、每变体一个 InstancedMesh、逐块
//     computeBoundingSphere）：整图合并会让包围球跨全图、视锥剔除失效（比朴素克隆还慢）；
//   - 阴影盒（游戏 90m）外的丛自动不进 shadow pass，无需额外处理。
//
// ══ 观感契约（已定稿，勿随手改） ══
//   - 高度带 2.0~2.8m（视觉高度），相邻鼓包落差 0.5~1.0m，两端收低（×0.82/×0.78）；
//   - 长度方向侧向错落 0.5m（峰谷），端点回正；
//   - 四种绿色分层：深橄榄(内层)/中绿(主层)/黄绿(受光·低占比)/灰绿(掺混)，
//     饱和度已压至哑光灰橄榄档（2026-09-11 用户定稿）；
//   - 叶色需保持 G 通道可辨：暗橄榄叶长在橄榄草地上色相不分时会"看起来像影子"。

import * as THREE from 'three';

// ── 可调参数（默认值 = showcase 定稿值） ──
export const HEDGE_DEFAULTS = {
  hMin: 2.0, hMax: 2.8,        // 高度带（视觉高度，米）
  wander: 0.5,                 // 侧向错落峰谷（米）
  bandHalf: 0.52,              // 半宽软限（米）→ 整丛厚约 1.5m
  cardSize: [0.3, 0.52],       // 叶片卡尺寸
  twigPerMeter: 15,            // 基部枝条卡密度
  tuftPerMeter: 26,            // 草丛密度（沿两肩）
  alphaTest: 0.4,
  chunkSize: 120,              // 地图分块（米）
};

// ── 风摆全局 uniforms（主循环驱动） ──
export const hedgeUniforms = {
  uTime: { value: 0 },
  uWindAmp: { value: 1 },
};

// 阵风状态机：间歇阵风（10~15s 随机间隔，4~6.5s 持续，缓起 30% / 缓停 45%），
// 间歇期保留 0.16 微动（树叶不会完全静止）。仅每帧写一个 uniform，性能零影响。
const _wind = { next: 3.5, gustT: -1, gustDur: 5, peak: 1 };
function _smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
export function updateHedge(elapsedTime, dt = 0.016) {
  hedgeUniforms.uTime.value = elapsedTime;
  let amp;
  if (_wind.gustT < 0) {
    _wind.next -= dt;
    amp = 0.16 + 0.05 * Math.sin(elapsedTime * 0.9);          // 微动（气流涟漪）
    if (_wind.next <= 0) {
      _wind.gustT = 0;
      _wind.gustDur = 4 + Math.random() * 2.5;
      _wind.peak = 0.7 + Math.random() * 0.35;
    }
  } else {
    _wind.gustT += dt;
    const k = _wind.gustT / _wind.gustDur;
    const env = _smooth(0, 0.3, k) * (1 - _smooth(0.55, 1, k));   // 缓起-维持-缓停
    amp = 0.16 + _wind.peak * env;
    if (k >= 1) { _wind.gustT = -1; _wind.next = 10 + Math.random() * 5; }
  }
  hedgeUniforms.uWindAmp.value = amp;
}

// 树木风摆注入（外部 GLB 模型用）：高度权重（树干下部不动、树冠摆）+ 世界坐标做相位。
// 与灌木共用 uTime/uWindAmp —— 同一阵风。height = 烘焙后几何总高（米）。
export function injectTreeWind(mat, height) {
  const h0 = (height * 0.15).toFixed(2), hh = (height * 0.85).toFixed(2);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = hedgeUniforms.uTime;
    sh.uniforms.uWindAmp = hedgeUniforms.uWindAmp;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWindAmp;\n' +
      sh.vertexShader.replace('#include <project_vertex>', `
        vec4 hPos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          hPos = instanceMatrix * hPos;
        #endif
        float wW = pow(clamp((transformed.y - ${h0}) / ${hh}, 0.0, 1.0), 2.0);
        float wPh = hPos.x * 0.31 + hPos.z * 0.47;
        vec3 wOff = vec3(0.17, 0.03, 0.30) * 0.4 * wW * uWindAmp * (
          0.6 * sin(uTime * 1.05 + wPh) + 0.4 * sin(uTime * 2.2 + wPh * 1.6));
        vec4 mvPosition = hPos + vec4(wOff, 0.0);
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
      `);
  };
  mat.customProgramCacheKey = () => 'windtree|' + height.toFixed(1);
}

// ── 种子化随机（与 maps.js mulberry32 同实现，地图布局可复现） ──
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ═══════════════ 程序化贴图（canvas；document 仅此处使用，maps.js 同例） ═══════════════ */
function canvasTex(size, draw, mipmaps) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = mipmaps;
  if (!mipmaps) t.minFilter = THREE.LinearFilter;
  return t;
}

// 叶片簇贴图：深底色块（叶隙暗部）+ 叶片 + 少量高光小叶
function leafTexture(rng, hBase, sBase, lBase, leafCount, sizeRange) {
  return canvasTex(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `hsla(${hBase - rr(rng, 6, 14)},${sBase - 8}%,${Math.max(8, lBase - rr(rng, 12, 18))}%,0.9)`;
      g.beginPath(); g.ellipse(rr(rng, 18, s - 18), rr(rng, 18, s - 18), rr(rng, 5, 16), rr(rng, 4, 12), rng() * 3.14, 0, 6.29); g.fill();
    }
    const drawLeaf = (x, y, r, a, light) => {
      g.save(); g.translate(x, y); g.rotate(a);
      const w = r * 0.62;
      if (light >= 0) {
        g.fillStyle = `hsla(${hBase},${sBase}%,${lBase - 9}%,0.85)`;
        g.beginPath(); g.ellipse(1.5, 2.5, r, w, 0, 0, 6.29); g.fill();
      }
      g.fillStyle = `hsla(${hBase + rr(rng, -9, 9)},${sBase + rr(rng, -8, 10)}%,${lBase + rr(rng, -6, 7) + (light > 0 ? 4 : 0)}%,1)`;
      g.beginPath(); g.ellipse(0, 0, r, w, 0, 0, 6.29); g.fill();
      if (light > 0) {
        g.fillStyle = `hsla(${hBase - 10},${sBase + 8}%,${lBase + 11}%,0.9)`;
        g.beginPath(); g.ellipse(-r * 0.22, -w * 0.24, r * 0.42, w * 0.4, -0.5, 0, 6.29); g.fill();
      }
      g.restore();
    };
    for (let i = 0; i < leafCount; i++) {
      const x = s / 2 + (rng() + rng() + rng() - 1.5) / 1.5 * s * 0.42;
      const y = s / 2 + (rng() + rng() + rng() - 1.5) / 1.5 * s * 0.42;
      drawLeaf(x, y, rr(rng, sizeRange[0], sizeRange[1]) * (s / 256), rng() * 6.29, rng() < 0.25 ? 1 : 0);
    }
  }, false);
}

// 基部枝条贴图
function twigTexture(rng) {
  return canvasTex(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    const branch = (x, y, a, len, w, depth) => {
      if (depth <= 0 || len < 8) return;
      const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
      g.strokeStyle = `hsl(${26 + rr(rng, -4, 5)},${26 + rr(rng, -6, 8)}%,${17 + rr(rng, 0, 8)}%)`;
      g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      branch(nx, ny, a + rr(rng, -0.55, 0.55), len * rr(rng, 0.55, 0.8), w * 0.65, depth - 1);
      if (rng() < 0.7) branch(nx, ny, a + rr(rng, -0.9, 0.9), len * rr(rng, 0.5, 0.75), w * 0.6, depth - 1);
    };
    for (let i = 0; i < 7; i++) branch(rr(rng, 30, s - 30), s + 4, -1.57 + rr(rng, -0.5, 0.5), rr(rng, 60, 110), rr(rng, 3.5, 6), 4);
    for (let i = 0; i < 46; i++) {
      g.fillStyle = `hsla(${82 + rr(rng, -8, 10)},${28 + rr(rng, -6, 8)}%,${18 + rr(rng, 0, 10)}%,0.95)`;
      g.save(); g.translate(rr(rng, 20, s - 20), rr(rng, 20, s - 20)); g.rotate(rng() * 3.14);
      g.beginPath(); g.ellipse(0, 0, rr(rng, 7, 13), rr(rng, 4, 8), 0, 0, 6.29); g.fill(); g.restore();
    }
  }, false);
}

// 草丛贴图（叶片向上）
function tuftTexture(rng) {
  return canvasTex(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      const x0 = s / 2 + rr(rng, -16, 16), a = -1.57 + rr(rng, -0.75, 0.75), l = rr(rng, 0.4, 0.95) * s;
      const dry = rng() < 0.22;
      g.strokeStyle = dry ? `hsla(${52 + rr(rng, -6, 8)},30%,${44 + rr(rng, 0, 14)}%,1)` : `hsla(${84 + rr(rng, -10, 12)},${23 + rr(rng, -6, 10)}%,${28 + rr(rng, 0, 16)}%,1)`;
      g.lineWidth = rr(rng, 1.6, 3.2); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, s);
      g.quadraticCurveTo(x0 + Math.cos(a) * l * 0.3 + rr(rng, -6, 6), s - l * 0.55, x0 + Math.cos(a) * l, s + Math.sin(a) * l);
      g.stroke();
    }
  }, false);
}

// 四种绿色变体（哑光灰橄榄档，2026-09-11 定稿）：深橄榄内层 / 中绿主层 / 黄绿受光(低占比) / 灰绿掺混
const LEAF_PALETTES = [
  { h: 84, s: 19, l: 23, n: 240, size: [9, 17], label: '深橄榄(内层)' },
  { h: 97, s: 26, l: 35, n: 230, size: [9, 18], label: '中绿(主层)' },
  { h: 76, s: 32, l: 46, n: 220, size: [8, 17], label: '黄绿(受光)' },
  { h: 116, s: 15, l: 34, n: 235, size: [8, 15], label: '灰绿(掺混)' },
];

let _texCache = null;
export function getHedgeTextures({ mipmaps = false } = {}) {
  const key = mipmaps ? 'mip' : 'flat';
  if (_texCache && _texCache.key === key) return _texCache.tex;
  const rng = mulberry32(20895);   // 贴图纹理固定种子
  const tex = {
    leaf: LEAF_PALETTES.map(p => leafTexture(rng, p.h, p.s, p.l, p.n, p.size)),
    twig: twigTexture(rng),
    tuft: tuftTexture(rng),
  };
  _texCache = { key, tex };
  return tex;
}

/* ═══════════════ 材质与风摆 ═══════════════ */
const W_HEDGE = 'pow(clamp(hPos.y / 2.8, 0.0, 1.0), 1.5)';
const W_TUFT = 'pow(clamp(transformed.y / 0.6, 0.0, 1.0), 2.0)';

function injectWind(mat, weightGLSL, ampGLSL) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = hedgeUniforms.uTime;
    sh.uniforms.uWindAmp = hedgeUniforms.uWindAmp;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWindAmp;\nattribute float aPhase;\n' +
      sh.vertexShader.replace('#include <project_vertex>', `
        vec4 hPos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          hPos = instanceMatrix * hPos;
        #endif
        float wW = ${weightGLSL};
        vec3 wOff = vec3(0.17, 0.05, 0.30) * (${ampGLSL}) * wW * uWindAmp * (
          0.5 * sin(uTime * 1.15 + aPhase) + 0.3 * sin(uTime * 2.40 + aPhase * 1.73) + 0.2 * sin(uTime * 4.90 + aPhase * 2.41));
        wOff.x += 0.07 * wW * uWindAmp * sin(uTime * 0.63 + hPos.x * 0.60 + hPos.z * 0.35);
        vec4 mvPosition = hPos + vec4(wOff, 0.0);
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
      `);
  };
  mat.customProgramCacheKey = () => 'wind|' + weightGLSL + '|' + ampGLSL;
}

function makeCrossGeo(w, h, anchorBottom) {
  const y0 = anchorBottom ? h / 2 : 0;
  const pos = [], uv = [], nrm = [], idx = [];
  const quad = (verts, n) => {
    const b = pos.length / 3;
    for (const v of verts) pos.push(...v);
    for (let i = 0; i < 4; i++) { nrm.push(...n); uv.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  quad([[-w / 2, -y0, 0], [w / 2, -y0, 0], [w / 2, h - y0, 0], [-w / 2, h - y0, 0]], [0, 0, 1]);
  quad([[0, -y0, -w / 2], [0, -y0, w / 2], [0, h - y0, w / 2], [0, h - y0, -w / 2]], [1, 0, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const crossGeo = makeCrossGeo(1, 1, false);
const twigGeo = makeCrossGeo(1, 1, true);
const tuftGeo = makeCrossGeo(0.62, 0.55, true);

/* ═══════════════ 模板生成（局部空间卡片数据） ═══════════════ */

// 高度剖面：控制点高低交替，相邻落差 0.5~1.0m（30% 连同级 → 鼓包宽窄不一），
// smoothstep 插值，端部收低。profile 值即"视觉高度"（含卡片半宽补偿换算）
function heightProfile(rng, len, hMin, hMax) {
  const n = Math.max(4, Math.ceil(len / 2.2) + 1);
  const hs = [];
  let high = rng() < 0.5;
  let cur = hMax - rr(rng, 0.05, 0.3);
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      if (rng() < (n <= 5 ? 0 : 0.3)) {   // 连同级：轻微抖动（短排禁用，保证起伏可见）
        cur = THREE.MathUtils.clamp(cur + rr(rng, -0.12, 0.12), hMin, hMax);
      } else {
        high = !high;
        cur = high ? hMax - rr(rng, 0, 0.3) : Math.max(hMin, cur - rr(rng, 0.5, 1.0));
      }
    }
    hs.push(cur);
  }
  hs[0] *= 0.82; hs[n - 1] *= 0.78;   // 两端收低（幅度放缓，贴近 2m 下限）
  return (t) => {
    const f = THREE.MathUtils.clamp(t, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    const u = f - i, s = u * u * (3 - 2 * u);
    return hs[i] + (hs[i + 1] - hs[i]) * s;
  };
}

// 横向错落：控制点正负交替（峰谷 ≈ amp），端点回正；长排 25% 连同级避免规则锯齿
function lateralWander(rng, len, amp) {
  const n = Math.max(4, Math.ceil(len / 2.6) + 1);
  const zs = [];
  let side = rng() < 0.5 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    if (i > 0 && rng() >= (n <= 5 ? 0 : 0.25)) side = -side;
    zs.push(side * (amp / 2) * rr(rng, 0.75, 1));
  }
  zs[0] = zs[n - 1] = 0;
  return (x) => {
    const t = THREE.MathUtils.clamp(x / (len * 0.97) + 0.5, 0, 1);
    const f = t * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    const u = f - i, s = u * u * (3 - 2 * u);
    return zs[i] + (zs[i + 1] - zs[i]) * s;
  };
}

// 丛级阳光方向（世界系，固定：showcase/游戏太阳同向 (42,55,28)）
const SUN_DIR = new THREE.Vector3(42, 55, 28).normalize();

/**
 * 生成一条灌木丛模板（局部空间：沿 +X，轴线 z=0，基部 y=0）。
 * @param {object} opts { len, hMin, hMax, wander, seed, twigPerMeter, tuftPerMeter, cardSize, bandHalf }
 * @returns template —— 传给 instantiateHedges 使用；stats 供验证
 */
export function buildHedgeTemplate(opts = {}) {
  const cfg = {
    len: opts.len ?? 10,
    hMin: opts.hMin ?? HEDGE_DEFAULTS.hMin,
    hMax: opts.hMax ?? HEDGE_DEFAULTS.hMax,
    wander: opts.wander ?? HEDGE_DEFAULTS.wander,
    bandHalf: opts.bandHalf ?? HEDGE_DEFAULTS.bandHalf,
    cardSize: opts.cardSize ?? HEDGE_DEFAULTS.cardSize,
    twigPerMeter: opts.twigPerMeter ?? HEDGE_DEFAULTS.twigPerMeter,
    tuftPerMeter: opts.tuftPerMeter ?? HEDGE_DEFAULTS.tuftPerMeter,
    cardDensity: opts.cardDensity ?? 1,   // 卡片密度系数（地图大量布置时 ~0.42 控制三角量）
    seed: opts.seed ?? (Math.random() * 0xffffffff) >>> 0,
  };
  const rng = mulberry32(cfg.seed);
  const profile = heightProfile(rng, cfg.len, cfg.hMin, cfg.hMax);
  const wanderAt = lateralWander(rng, cfg.len, cfg.wander);

  // ── 椭球丛链：主丛（沿剖面起伏）+ 基部填充 ──
  const clumps = [];
  const N = Math.max(8, Math.round(cfg.len * 2.2));
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const edge = THREE.MathUtils.smoothstep(t, 0, 0.08) * (1 - THREE.MathUtils.smoothstep(t, 0.92, 1));
    const jitter = 0.8 + rng() * 0.45;
    // profile 是"视觉高度"（含卡片半宽补偿：卡顶 ≈ 1.24×topY + 0.19）
    const topY = (profile(t) * (0.6 + 0.4 * edge) * (0.94 + rng() * 0.12) - 0.19) / 1.24;
    const ry = topY * 0.62;
    const cx0 = (t - 0.5) * cfg.len * 0.97 + rr(rng, -0.12, 0.12);
    clumps.push({
      x: cx0, y: ry - 0.07, z: wanderAt(cx0) + rr(rng, -0.08, 0.08), zw: wanderAt(cx0),
      rx: (0.55 + rng() * 0.3) * jitter * (0.72 + 0.28 * edge),
      ry,
      rz: (0.36 + rng() * 0.16) * jitter,
      patch: rng(),
    });
  }
  for (let i = 0; i < Math.round(N * 0.55); i++) {
    const t = rng();
    const cx0 = (t - 0.5) * cfg.len * 0.95 + rr(rng, -0.2, 0.2);
    clumps.push({
      x: cx0, y: 0.17, z: wanderAt(cx0) + rr(rng, -0.1, 0.1), zw: wanderAt(cx0),
      rx: rr(rng, 0.45, 0.8), ry: rr(rng, 0.24, 0.34), rz: rr(rng, 0.4, 0.52), patch: rng(),
    });
  }

  // ── 撒卡片 ──
  const up = new THREE.Vector3(0, 0, 1);
  const qFace = new THREE.Quaternion(), qRoll = new THREE.Quaternion(), qTilt = new THREE.Quaternion(), qE = new THREE.Euler();
  const buckets = [[], [], [], []];
  for (const cp of clumps) {
    const isSkirt = cp.ry < 0.4;
    const count = isSkirt ? Math.max(6, Math.round(58 * cfg.cardDensity)) : Math.max(6, Math.round(240 * cfg.cardDensity * (cp.rx * cp.ry * cp.rz) / 0.30));
    for (let k = 0; k < count; k++) {
      const d = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
      if (d.lengthSq() < 1e-4 || d.lengthSq() > 1) { k--; continue; }
      d.normalize();
      const shell = rng() < 0.7 ? Math.pow(rng(), 0.28) : rng() * 0.72;
      const p = new THREE.Vector3(
        cp.x + d.x * cp.rx * shell,
        cp.y + d.y * cp.ry * shell,
        cp.z + d.z * cp.rz * shell
      );
      if (p.y < 0.03) p.y = 0.03 + rng() * 0.05;
      // 顶面自由起伏（保留剖面落差），只削极端尖峰；5% 毛边窜出
      if (p.y > 2.95) p.y = 2.9 - rng() * 0.06;
      else if (p.y > 2.55 && rng() < 0.05) p.y += 0.04 + rng() * 0.12;
      // 宽度软限（基准=侧摆中线），目标带宽 ~1.5m（卡片半宽再叠加 ~0.26）
      const zRel = p.z - cp.zw;
      if (Math.abs(zRel) > cfg.bandHalf) p.z = cp.zw + Math.sign(zRel) * (cfg.bandHalf - 0.03 + rng() * 0.05);
      p.x = THREE.MathUtils.clamp(p.x, -(cfg.len / 2 - 0.32), cfg.len / 2 - 0.32);   // 控制总长
      // 变体分层：内层深橄榄/灰绿，外壳按阳光面分黄绿/中绿，丛级 patch 调偏
      const sunF = Math.max(0, d.dot(SUN_DIR));
      let vi;
      if (shell < 0.55) {
        const r0 = rng();
        vi = r0 < 0.58 + cp.patch * 0.1 ? 0 : r0 < 0.8 ? 3 : 1;
      } else {
        const roll = rng();
        const wHi = 0.16 + cp.patch * 0.15, wSa = 0.14 + (1 - cp.patch) * 0.2;   // 受光黄绿比率压低
        vi = roll < wHi ? 2 : roll < wHi + (1 - wHi - wSa) ? 1 : 3;
        if (sunF > 0.42 && rng() < 0.16) vi = 2;
        if (sunF < 0.12 && rng() < 0.3) vi = 0;
      }
      // 染色：内层压暗 + 底部 AO + 卡级抖动 + 受光微提亮
      let tint = shell < 0.5 ? 0.68 + shell * 0.32 : 0.92 + rng() * 0.18;
      tint *= 0.8 + 0.2 * THREE.MathUtils.smoothstep(p.y, 0, 1.3);
      tint *= 0.92 + rng() * 0.16;
      if (vi === 2 && shell > 0.6) tint *= 1 + 0.08 * sunF;
      // 朝向：径向朝外 + 随机滚转 + 小倾角；内层完全随机
      const n = shell < 0.4 ? new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize() : d;
      qFace.setFromUnitVectors(up, n);
      qRoll.setFromAxisAngle(n, rng() * Math.PI * 2);
      qTilt.setFromEuler(qE.set(rr(rng, -0.3, 0.3), rr(rng, -0.3, 0.3), rr(rng, -0.3, 0.3)));
      qTilt.multiply(qRoll).multiply(qFace);
      const size = rr(rng, cfg.cardSize[0], cfg.cardSize[1]) * (isSkirt ? 0.82 : 1);
      buckets[vi].push({ p: [p.x, p.y, p.z], q: [qTilt.x, qTilt.y, qTilt.z, qTilt.w], s: size, t: Math.min(tint, 1.25) });
    }
  }
  const twigCards = [];
  for (let k = 0; k < Math.round(cfg.len * cfg.twigPerMeter * cfg.cardDensity); k++) {
    const tx = rr(rng, -cfg.len / 2, cfg.len / 2);
    qE.set(rr(rng, -0.4, 0.4), rng() * Math.PI * 2, rr(rng, -0.4, 0.4));
    qTilt.setFromEuler(qE);
    twigCards.push({
      p: [tx, rr(rng, 0.08, 0.75), wanderAt(tx) + rr(rng, -0.48, 0.48)],
      q: [qTilt.x, qTilt.y, qTilt.z, qTilt.w],
      s: rr(rng, 0.4, 0.66), t: rr(rng, 0.75, 1.1),
    });
  }
  const tuftCards = [];
  for (let k = 0; k < Math.round(cfg.len * cfg.tuftPerMeter * Math.max(cfg.cardDensity, 0.6)); k++) {
    const lx = rr(rng, -cfg.len / 2 - 0.8, cfg.len / 2 + 0.8);
    const lz = (rng() < 0.5 ? -1 : 1) * rr(rng, 0.9, 2.1);
    qE.set(rr(rng, -0.12, 0.12), rng() * Math.PI * 2, rr(rng, -0.12, 0.12));
    qTilt.setFromEuler(qE);
    tuftCards.push({
      p: [lx, 0, wanderAt(lx) + lz],
      q: [qTilt.x, qTilt.y, qTilt.z, qTilt.w],
      s: rr(rng, 0.35, 0.7), t: rr(rng, 0.8, 1.15),
    });
  }

  return {
    len: cfg.len, seed: cfg.seed, hMin: cfg.hMin, hMax: cfg.hMax, wander: cfg.wander,
    cards: buckets, twigCards, tuftCards,
    profile, wanderAt,
  };
}

/* ═══════════════ 实例化（分块合并 → 视锥剔除友好） ═══════════════ */

/**
 * 把模板实例化到一批摆放点（世界系，朝向/贴地烘焙进实例矩阵）。
 * @param {THREE.Object3D} target 挂载父节点
 * @param {object} tpl buildHedgeTemplate 产物
 * @param {Array<{x,z,yaw?}>} placements 摆放点（yaw 度）
 * @param {object} opts { chunkSize=120, groundY=(x,z)=>0, mipmaps=false, alphaTest=0.4,
 *                        groundTrack=false } —— groundTrack 记录每实例采样坐标并返回
 *   reground(prevAngle,newAngle,groundY)：整组绕 Y 旋转（如灌木带随出生角旋转）后，
 *   按新位置重采样地形高度平移实例 Y，保持贴地（旋转前烘焙的高度在新位置会悬空/入土）
 * @returns { group, stats, chunkCount, reground? }
 * @returns { group, stats, chunkCount }
 *   stats: { cards, tris, min:[3], max:[3], zMin, zMax, env, zEnv } —— min/max 为世界包围盒，
 *   env/zEnv 为顶面轮廓/侧摆中线（0.5m 分箱，验证用）
 */
export function instantiateHedges(target, tpl, placements, opts = {}) {
  const chunkSize = opts.chunkSize ?? HEDGE_DEFAULTS.chunkSize;
  const groundY = opts.groundY ?? (() => 0);
  const alphaTest = opts.alphaTest ?? HEDGE_DEFAULTS.alphaTest;
  const tex = getHedgeTextures({ mipmaps: opts.mipmaps ?? false });
  const rng = mulberry32((tpl.seed ^ 0x51ed270b) >>> 0);
  const group = new THREE.Group();
  target.add(group);

  // 分块
  const chunks = new Map();
  placements.forEach((p, i) => {
    const k = chunkSize === Infinity ? 'all'
      : Math.floor((p.x + 1e5) / chunkSize) + ',' + Math.floor((p.z + 1e5) / chunkSize);
    if (!chunks.has(k)) chunks.set(k, []);
    chunks.get(k).push({ ...p, _i: i });
  });

  const stats = { cards: 0, tris: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], zMin: 1e9, zMax: -1e9, env: {}, zEnv: {} };
  const groundMeshes = [];   // groundTrack 收集：{ im, gCoords }
  const m4 = new THREE.Matrix4(), pm = new THREE.Matrix4(), q = new THREE.Quaternion(),
    v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const trackW = (px, py, pz, r, wx, wz) => {
    stats.min[0] = Math.min(stats.min[0], wx - r); stats.max[0] = Math.max(stats.max[0], wx + r);
    stats.min[1] = Math.min(stats.min[1], py - r); stats.max[1] = Math.max(stats.max[1], py + r);
    stats.min[2] = Math.min(stats.min[2], wz - r); stats.max[2] = Math.max(stats.max[2], wz + r);
    const bin = Math.round(px / 0.5) * 0.5;
    stats.env[bin] = Math.max(stats.env[bin] || 0, py + r);
  };

  const buildSet = (cards, geo, texture, variantLabel, track) => {
    if (!cards.length) return;
    for (const [ckey, plist] of chunks) {
      const count = cards.length * plist.length;
      const geo2 = geo.clone();
      const phases = new Float32Array(count);
      for (let i = 0; i < count; i++) phases[i] = rng() * Math.PI * 2;
      geo2.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
      const mat = new THREE.MeshLambertMaterial({
        map: texture, alphaTest, side: THREE.DoubleSide,
      });
      injectWind(mat, variantLabel.weight, variantLabel.amp);
      const im = new THREE.InstancedMesh(geo2, mat, count);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      // groundTrack：记录每实例构建系（group 局部）水平采样坐标，供旋转后重贴地
      const gCoords = opts.groundTrack ? new Float32Array(count * 2) : null;
      let k = 0;
      for (const pl of plist) {
        const yaw = (pl.yaw ?? 0) * Math.PI / 180;
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        const gy = groundY(pl.x, pl.z);
        for (const c of cards) {
          // 卡片旋转后的世界水平位置（rotY：x' = x cosθ + z sinθ；z' = -x sinθ + z cosθ）
          const wx = pl.x + cy * c.p[0] + sy * c.p[2];
          const wz = pl.z - sy * c.p[0] + cy * c.p[2];
          // 逐卡片贴地：卡片垂向跟随地形起伏（丛中心单点贴地在坡地上会两端悬空/入土）
          const dy = groundY(wx, wz) - gy;
          // 实例矩阵 = T(摆放点+逐卡贴地) · R_y(yaw) · T(p) · R(q) · S(s)
          v.set(c.p[0], c.p[1], c.p[2]);
          q.set(c.q[0], c.q[1], c.q[2], c.q[3]);
          sc.set(c.s, c.s, c.s);
          m4.compose(v, q, sc);
          pm.makeRotationY(yaw);
          pm.multiply(m4);
          pm.elements[12] += pl.x;
          pm.elements[13] += gy + dy - 0.04;   // 微沉 0.04，盖掉地面网格 11m 线性插值与解析高度的厘米级差
          pm.elements[14] += pl.z;
          im.setMatrixAt(k, pm);
          col.setRGB(c.t, c.t, c.t);
          im.setColorAt(k, col);
          if (gCoords) { gCoords[k * 2] = wx; gCoords[k * 2 + 1] = wz; }
          // 世界统计（卡片中心 ± 半卡；草丛不计入）
          const wy = gy + dy + c.p[1];
          if (track) {
            trackW(c.p[0], wy, wz, 0.26, wx, wz);
            stats.zMin = Math.min(stats.zMin, c.p[2] - 0.26);
            stats.zMax = Math.max(stats.zMax, c.p[2] + 0.26);
            const zb = Math.round(c.p[0] / 0.5) * 0.5;
            const ze = stats.zEnv[zb] || (stats.zEnv[zb] = [1e9, -1e9]);
            ze[0] = Math.min(ze[0], c.p[2] - 0.26); ze[1] = Math.max(ze[1], c.p[2] + 0.26);
          }
          k++;
        }
      }
      im.castShadow = im.receiveShadow = true;
      im.customDepthMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest,
      });
      im.computeBoundingSphere();
      group.add(im);
      stats.cards += count;
      stats.tris += count * 4;
      if (gCoords) groundMeshes.push({ im, gCoords });
    }
  };

  const VARIANTS = [
    { weight: W_HEDGE, amp: '1.0' },
    { weight: W_HEDGE, amp: '1.0' },
    { weight: W_HEDGE, amp: '1.0' },
    { weight: W_HEDGE, amp: '1.0' },
  ];
  tpl.cards.forEach((list, i) => buildSet(list, crossGeo, tex.leaf[i], VARIANTS[i], true));
  buildSet(tpl.twigCards, twigGeo, tex.twig, { weight: '0.25', amp: '0.4' }, true);
  buildSet(tpl.tuftCards, tuftGeo, tex.tuft, { weight: W_TUFT, amp: '1.2' }, false);

  const result = { group, stats, chunkCount: chunks.size };
  if (opts.groundTrack) {
    // 整组绕 Y 从 prevAngle 转到 newAngle 后重贴地：按新位置重采样 groundY 平移实例 Y。
    // （group 绕 Y 旋转不改变局部 Y，可直接平移 elements[13]；高度差 = 新采样 - 旧采样）
    result.reground = (prevAngle, newAngle, gY = groundY) => {
      if (prevAngle === newAngle) return;
      const c0 = Math.cos(prevAngle), s0 = Math.sin(prevAngle);
      const c1 = Math.cos(newAngle), s1 = Math.sin(newAngle);
      for (const { im, gCoords } of groundMeshes) {
        const arr = im.instanceMatrix.array;
        const n = gCoords.length / 2;
        for (let i = 0; i < n; i++) {
          const x = gCoords[i * 2], z = gCoords[i * 2 + 1];
          // rotY 约定（同 applyBattle）：wx = x cos + z sin；wz = -x sin + z cos
          const yOld = gY(x * c0 + z * s0, -x * s0 + z * c0);
          const yNew = gY(x * c1 + z * s1, -x * s1 + z * c1);
          arr[i * 16 + 13] += yNew - yOld;
        }
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      }
    };
  }
  return result;
}

function rr(rng, a, b) { return a + rng() * (b - a); }
