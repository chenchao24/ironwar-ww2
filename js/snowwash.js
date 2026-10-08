// ═══ 冬季白洗涂装（阿登等 snow 图）：运行时给坦克材质注入"石灰浆粉刷"层 ═══
// 史实风格（1944 阿登）：白垩浆在原有涂装上刷/喷——半透明盖不实、斑块不均、
// 边缘喷溅颗粒、磨损掉漆严重；每车独立随机种子（各车组自刷，掉漆分布不同）；
// 行动装置（履带/负重轮）不上白洗（浆在行动装置上留不住，史实吻合）。
// 隔离：仅 world.snowWash（maps.js 按图设置）时由 tank.js 调用；
// 坦克材质本就逐车克隆（tank.js 材质独立化段），不污染其他图/其他车。

// 片元噪声（3D value-noise fbm；对象局部空间采样——车行不滑图）
const SW_NOISE = `
uniform float uSwSeed, uSwCover, uSwAlpha, uSwGrain, uSwScale, uSwScale2, uSwWear;
varying vec3 vSwP;
varying vec3 vSwN;
float swHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float swVn(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = swHash(i);
  float n100 = swHash(i + vec3(1, 0, 0));
  float n010 = swHash(i + vec3(0, 1, 0));
  float n110 = swHash(i + vec3(1, 1, 0));
  float n001 = swHash(i + vec3(0, 0, 1));
  float n101 = swHash(i + vec3(1, 0, 1));
  float n011 = swHash(i + vec3(0, 1, 1));
  float n111 = swHash(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float swFbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * swVn(p); p *= 2.03; a *= 0.5; }
  return v;
}`;

// 白洗混合（注入在 map_fragment 之后：diffuseColor 已含原涂装贴图）
// 团块场定"刷没刷"，颗粒场打散边缘（喷溅感）；朝上平面磨损加重（甲板踩踏掉漆）；
// 白浆色随基底明度压暗——半透明浆盖不实深色底，烧黑处白洗也随之变暗（烧色压白洗）
const SW_APPLY = `
{
  float swF = swFbm(vSwP * uSwScale + uSwSeed);
  float swE = swFbm(vSwP * uSwScale2 + uSwSeed * 1.71);
  float swM = smoothstep(1.0 - uSwCover - 0.20, 1.0 - uSwCover + 0.20, swF + (swE - 0.5) * uSwGrain);
  swM *= mix(1.0, 0.5, clamp(vSwN.y, 0.0, 1.0) * uSwWear);
  float swBaseL = clamp(dot(diffuseColor.rgb, vec3(0.333)) * 1.7, 0.0, 1.0);
  vec3 swCol = vec3(0.88, 0.90, 0.92) * (0.35 + 0.65 * swBaseL);
  diffuseColor.rgb = mix(diffuseColor.rgb, swCol, swM * uSwAlpha);
}`;

// 默认参数（可通过 applySnowWash opts.tune 覆盖做观感调校）
const SW_DEFAULTS = {
  uSwCover: 0.62,     // 目标覆盖率（阈值中位）
  uSwAlpha: 0.70,     // 白浆不透明度上限（半透明）
  uSwGrain: 0.55,     // 边缘颗粒强度（喷溅感）
  uSwScale: 0.8,      // 团块尺度（~1.2m 斑块）
  uSwScale2: 7.0,     // 颗粒尺度（~14cm 喷点）
  uSwWear: 0.5,       // 水平面额外磨损
};

function patchMaterial(m, seed, tune) {
  if (m.userData.swPatched) return;
  m.userData.swPatched = true;
  m.onBeforeCompile = (sh) => {
    for (const k of Object.keys(SW_DEFAULTS)) sh.uniforms[k] = { value: (tune && tune[k]) ?? SW_DEFAULTS[k] };
    sh.uniforms.uSwSeed = { value: seed };
    sh.vertexShader = 'varying vec3 vSwP;\nvarying vec3 vSwN;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\tvSwP = position;\n\tvSwN = normal;');
    sh.fragmentShader = SW_NOISE + '\n' + sh.fragmentShader.replace(
      '#include <map_fragment>',
      '#include <map_fragment>\n' + SW_APPLY);
  };
  m.needsUpdate = true;
}

/**
 * 给坦克模型注入白洗层（逐网格材质补丁）
 * @param model   坦克模型 Group（tank.js 材质独立化之后调用）
 * @param opts.skip     跳过的网格名（履带/负重轮等行动装置）
 * @param opts.seed     每车随机种子（缺省随机）
 * @param opts.tune     观感参数覆盖（uSwCover/uSwAlpha/...）
 */
export function applySnowWash(model, opts = {}) {
  const skip = new Set(opts.skip || []);
  const seed = opts.seed ?? Math.random() * 100;
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (skip.has(o.name) || /interior|internal/i.test(o.name)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { if (m && m.isMeshStandardMaterial) patchMaterial(m, seed, opts.tune); }
  });
}
