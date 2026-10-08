// ═══ 战术角色表 aiRole（docs/ai-redesign-plan.md §1）：行为参数与历史特性默认值 ═══
// 解析顺序：AI_ROLES[cfg.aiRole] → cfg.aiTraits 覆盖；doctrine/difficulty 修饰在行为层另行应用

export const AI_ROLES = {
  scout: {   // 前出侦查、保持 400m+、被确认即蛇形撤离、绝不站桩
    dwellRange: 1100, dwellTime: 2.0, preferRangeK: 1.2, autoConfirmK: 1.1,
    fleeOnConfirm: true,
  },
  brawler: { // 中近距环绕机动、打了就换位、成群冲击
    dwellRange: 900, dwellTime: 3.0, preferRangeK: 0.7, autoConfirmK: 0.9,
  },
  anchor: {  // 正面摆角站桩、吸引火力、远距精度射击
    dwellRange: 1000, dwellTime: 2.5, preferRangeK: 1.0, autoConfirmK: 1.0,
  },
  ambusher: { // 伏击 + shoot & scoot（开火后换位 15~30m）
    dwellRange: 1100, dwellTime: 2.0, preferRangeK: 1.2, autoConfirmK: 1.0,
    scootChance: 0.6,
  },
  sniper: {  // 阵地化：选好射位基本不动，靠甲吃饭，严格伏击纪律
    dwellRange: 1200, dwellTime: 2.0, preferRangeK: 1.3, autoConfirmK: 1.0,
    scootChance: 0, aimErrMulRole: 0.8,
  },
};

// aiTraits 全集默认值（cfg.aiTraits 逐项覆盖；docs/ai-redesign-plan.md §1.4）
const TRAIT_DEFAULTS = {
  tiltPref: null,          // 摆角偏好 rad（null=不摆）
  scootChance: null,       // 开火后换位概率 0~1（null=用角色默认）
  scootDist: [15, 30],     // 换位距离区间 m
  fireAndCover: false,     // 开火后必退入掩
  fleeOnConfirm: false,    // 被确认即撤
  movingFire: false,       // 行进间开火许可（稳定器）
  panicOnFlank: false,     // 被绕侧恐慌转向
  preferRangeK: null,      // 偏好交战距离系数（null=用角色默认）
  aimErrMulRole: 1,        // 角色精度微调
};

// 缺省角色推导（未显式标注 aiRole 时；现 13 车均已标注，仅为未来新车兜底）
export function deriveRole(cfg) {
  if (cfg.casemate) return (cfg.maxSpeed || 40) <= 32 ? 'sniper' : 'ambusher';
  if ((cfg.maxSpeed || 0) >= 50) return 'scout';
  if (cfg.armor && cfg.armor.hullFront >= 100) return 'anchor';
  return 'brawler';
}

// 解析单车最终角色剖面：{ role, aiHull, ...traits }
export function roleProfile(cfg) {
  const role = cfg.aiRole || deriveRole(cfg);
  const base = AI_ROLES[role] || AI_ROLES.brawler;
  const merged = { ...TRAIT_DEFAULTS, ...base, ...(cfg.aiTraits || {}) };
  return { role, aiHull: cfg.casemate ? 'casemate' : 'turreted', ...merged };
}
