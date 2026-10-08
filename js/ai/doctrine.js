// ═══ 阵营战术模板 FACTION_DOCTRINE（docs/ai-redesign-plan.md §2） ═══
// 叠在难度参数之上、per-tank aiTraits 之下；新兵档整体关闭（difficulty.useDoctrine=false）
export const FACTION_DOCTRINE = {
  de: {   // 防御-反击/伏击
    preferRangeK: 1.2,
    contactReaction: 'ambush',      // 就地展开伏击扇面、电台静默
    retreat: 'bound',               // 交替掩护撤退
    fireDiscipline: 'strict',       // 疑似绝不开火
    dwellHabit: 'eager',            // 疑似即停车细搜
    coordination: 'anchor-hunt',    // 锚点+猎杀组
  },
  ru: {   // 密集冲击
    preferRangeK: 0.6,
    contactReaction: 'charge',      // 全队转向+提速
    retreat: 'never',
    fireDiscipline: 'suppressive',  // 疑似即压制（§4.3 盲射）
    suppressiveFire: { maxDist: 800, rateK: 0.75, spreadK: 2, maxShots: 2 },   // 盲射 3/4 速（用户 2026-09-21 调校）
    dwellHabit: 'never',            // 不 dwell，直接推进
    coordination: 'wave',           // 波次冲击；节奏总监 L1 合并 L2
  },
  us: {   // 火力+机动协同
    preferRangeK: 1.0,
    contactReaction: 'fixAndFlank', // 一辆压制一辆迂回
    retreat: 'evaluate',
    retreatThreshold: 1 / 3,        // 减员 1/3 评估撤退
    fireDiscipline: 'normal',
    dwellHabit: 'base',             // 压制车 dwell
    coordination: 'fire-maneuver',
  },
  uk: {   // 巡航穿插
    preferRangeK: 1.1,
    contactReaction: 'probe',       // 试探-拉开
    retreat: 'early',               // 谨慎早退
    fireDiscipline: 'normal',
    dwellHabit: 'occasional',
    coordination: 'harass',
  },
};

export function doctrineOf(nation) {
  return FACTION_DOCTRINE[nation] || FACTION_DOCTRINE.us;
}
