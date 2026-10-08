// ═══ 难度参数（docs/ai-redesign-plan.md §0.3/§7.3；原 js/ai.js AI_DIFFICULTY 迁入） ═══
// 新增：obsK=侦查确认距离系数（接入 visibility 自动确认圈）；
//       useDwell/usePlatoon/useDoctrine = 特性总开关（新兵独狼化、标准基础协同、王牌全开）
export const AI_DIFFICULTY = {
  novice: {
    label: '新兵',
    aimErrMul: 2.4,
    hesitMin: 1.6, hesitMax: 3.4,
    weakAim: false,
    switchShell: false,
    useConsumables: false,
    engageRange: 400, preferRange: 280,
    fireRange: 850,
    evade: false,
    obsK: 0.85,
    useDwell: false, usePlatoon: false, useDoctrine: false,
  },
  standard: {
    label: '标准',
    aimErrMul: 1.3,
    hesitMin: 0.9, hesitMax: 2.1,
    weakAim: false,
    switchShell: true,
    useConsumables: true,
    engageRange: 600, preferRange: 380,
    fireRange: 1150,
    evade: true,
    obsK: 1.0,
    useDwell: true, usePlatoon: true, useDoctrine: true,
  },
  ace: {
    label: '王牌',
    aimErrMul: 0.65,
    hesitMin: 0.5, hesitMax: 1.2,
    weakAim: true,
    switchShell: true,
    useConsumables: true,
    engageRange: 680, preferRange: 420,
    fireRange: 1200,
    evade: true,
    shortStop: true, stopSpreadK: 2.2, stopMaxT: 2.5,   // 短停 ≤2.2σ（几乎完全收敛）
    avoidObstacles: true,
    coverUse: true, coverMin: 15, coverMax: 60, coverScoreMin: 1,
    tiltDuel: true,
    peekMax: 12, coverChance: 0.6, coverChanceAfterHit: 0.85,
    obsK: 1.1,
    useDwell: true, usePlatoon: true, useDoctrine: true,
  },
};
