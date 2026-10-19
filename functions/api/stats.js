/**
 * 首页统计接口：点赞数 + 访问量（PV）。
 *
 * 路由：functions/api/stats.js → Cloudflare Pages 部署后为 /api/stats
 * 存储：Cloudflare Pages KV 绑定，变量名 STATS
 *      · KV 里只存"增量"，展示值 = 种子值 + 增量，改种子不用清库
 * 去重：由前端负责（点赞 localStorage、访问 sessionStorage 每会话一次），
 *      服务端只做自增（没有用户体系，不做服务端去重）
 *
 * GET  /api/stats            → { likes, views }
 * POST /api/stats {action}   → action: 'like' | 'view'，返回最新计数
 */

/** 起始值：点赞 130、访问 1000（改这里即可调整基数） */
const BASE = { likes: 130, views: 1000 };
const KEYS = { likes: 'likes:home', views: 'views:home' };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

async function readCount(kv, key, base) {
  if (!kv) return base;
  const n = parseInt(await kv.get(key), 10);
  return base + (Number.isFinite(n) ? n : 0);
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env && env.STATS;

  if (request.method === 'GET') {
    const [likes, views] = await Promise.all([
      readCount(kv, KEYS.likes, BASE.likes),
      readCount(kv, KEYS.views, BASE.views),
    ]);
    return json({ likes, views });
  }

  if (request.method === 'POST') {
    // 未绑定 KV 时明确失败，避免"看起来点成功了但没存"
    if (!kv) return json({ error: 'storage_unavailable' }, 503);

    let body = null;
    try { body = await request.json(); } catch { /* 空 body 交给下面的校验 */ }
    const action = body && body.action;
    if (action !== 'like' && action !== 'view') return json({ error: 'bad_action' }, 400);

    const key = action === 'like' ? KEYS.likes : KEYS.views;
    const base = action === 'like' ? BASE.likes : BASE.views;
    const cur = parseInt(await kv.get(key), 10) || 0;
    const next = cur + 1;
    await kv.put(key, String(next));

    // 刚写过的那个用本地结果，避免 KV 最终一致性读到旧值
    const [likes, views] = await Promise.all([
      action === 'like' ? base + next : readCount(kv, KEYS.likes, BASE.likes),
      action === 'view' ? base + next : readCount(kv, KEYS.views, BASE.views),
    ]);
    return json({ likes, views });
  }

  return json({ error: 'method_not_allowed' }, 405);
}
