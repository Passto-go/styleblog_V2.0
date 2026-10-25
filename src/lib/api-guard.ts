// AI 类接口（/api/translate、/api/excerpt）共用的鉴权 + 限流。
//
// 为什么需要：
//  - M-02：原实现只验「会话有效」，任何能在该 Supabase 项目注册/登录的人都能调用，
//    直接消耗站长的付费 LLM 额度。这里补上「是否为管理员」的判定。
//  - M-01 / L-11：原来的限流是模块级 Map，Worker 多 isolate + 冷启动即清空，
//    基本形同虚设。现在改为「Supabase 原子计数 + 内存兜底」：
//      · 传入 supabase 配置 → 走 rate_limit_hit / unlock_guard，跨实例强一致；
//      · 未传或数据库异常 → 只用内存兜底，行为与改造前一致（不会因此 500）。
//    同时每次写入顺手清理过期窗口，避免 Map 只增不删（L-11）。
//
//  历史：中间曾用 Cloudflare KV 存计数，已废弃并移除绑定。
//    原因见下方 rateLimitKV 注释（KV 无原子递增，并发下计数互相覆盖）。
//
// 管理员判定规则（按顺序匹配，任一命中即视为管理员）：
//  1. 设置了 ADMIN_EMAILS（逗号分隔）→ 邮箱必须在白名单内；
//  2. 未设置 ADMIN_EMAILS → 回退为「该用户读不到别人的文章草稿则拒绝」的探针无意义，
//     改为直接要求配置：生产环境强制要求 ADMIN_EMAILS，否则一律 403 并打日志。
//     （默认拒绝，避免「忘了配置 = 全开放」这类失败方向。）
import { createClient } from '@supabase/supabase-js';

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** 内存滑窗限流（兜底）。每次调用顺手清掉过期记录，防止 Map 无限增长。 */
const hits = new Map<string, number[]>();
export function memRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  // 轻量自清理：Map 过大时按过期时间扫一遍
  if (hits.size > 500) {
    for (const [k, arr] of hits) {
      if (!arr.some((t) => now - t < windowMs)) hits.delete(k);
    }
  }
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  return true;
}

/**
 * 跨实例限流：Supabase 原子计数，跨 Worker 实例强一致。
 * @returns true = 放行
 *
 * 为什么不再用 KV（2026-10-25 实测结论）：
 *   KV 的 get→+1→put 是非原子读改写，且写入有几十秒全球传播延迟。
 *   实测 14 个并发请求全部读到同一个旧值、各自写回 1，计数永远不涨；
 *   串行请求还会出现 429 闪断（读到未传播的旧值）。KV 无原子递增 API，
 *   官方也不建议用它做计数器。改用 Postgres 的单条 UPSERT 实现原子递增。
 */
export type RateLimitTrace = { path: 'db' | 'mem' | 'no-cfg'; err?: string };

export async function rateLimitKV(
  env: any,
  key: string,
  max: number,
  windowSec: number,
  supabase?: { url: string; anon: string },
  trace?: RateLimitTrace
): Promise<boolean> {
  // 优先走 Supabase 原子计数
  if (supabase?.url && supabase?.anon) {
    try {
      const client = createClient(supabase.url, supabase.anon, {
        auth: { persistSession: false },
        global: {
          fetch: (u: RequestInfo | URL, i?: RequestInit) =>
            fetch(u as any, { ...(i as any), signal: AbortSignal.timeout(4000) }),
        },
      });
      const { data, error } = await client.rpc('rate_limit_hit', {
        p_bucket: key,
        p_max: max,
        p_window_sec: windowSec,
      });
      if (trace) trace.path = 'db';
      if (!error) return data === true;
      if (trace) trace.err = error.message;
      console.warn('[rate-limit] RPC 失败，退回内存限流:', error.message);
    } catch (e: any) {
      if (trace) trace.err = e?.message || String(e);
      console.warn('[rate-limit] RPC 异常，退回内存限流:', e?.message || e);
    }
  } else if (trace) {
    trace.path = 'no-cfg';
  }
  if (trace && !trace.path) trace.path = 'mem';
  return memRateLimit(key, max, windowSec * 1000);
}

/** 带 6s 超时的 Supabase 客户端（与 posts.js 的 sbClient 口径一致，见 L-12） */
export function authClient(url: string, anon: string) {
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: {
      fetch: (u: RequestInfo | URL, i?: RequestInit) =>
        fetch(u as any, { ...(i as any), signal: AbortSignal.timeout(6000) }),
    },
  });
}

export type AuthResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; response: Response };

/**
 * 校验「已登录 + 是管理员」。
 * @param token      Authorization: Bearer <token> 中的 token
 * @param adminEmails 允许的邮箱列表（来自 ADMIN_EMAILS，逗号分隔）
 */
export async function requireAdmin(
  token: string,
  adminEmails: string[]
): Promise<AuthResult> {
  if (!token) {
    return { ok: false, response: json({ error: '未登录或会话已过期，请重新登录后台管理界面' }, 401) };
  }
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    return { ok: false, response: json({ error: '站点未配置 Supabase，无法验证身份' }, 500) };
  }

  let user: { id: string; email?: string } | null = null;
  try {
    const supabase = authClient(supabaseUrl, supabaseAnon);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return { ok: false, response: json({ error: '会话无效，请重新登录后台管理界面' }, 401) };
    }
    user = { id: data.user.id, email: data.user.email || '' };
  } catch {
    return { ok: false, response: json({ error: '身份验证失败，请重新登录' }, 401) };
  }

  const email = (user.email || '').toLowerCase();
  // 白名单为空 = 未配置：默认拒绝（fail-closed），并提示运维去配
  if (adminEmails.length === 0) {
    console.error('[auth] ADMIN_EMAILS 未配置，拒绝 AI 接口调用');
    return {
      ok: false,
      response: json(
        { error: '站点未配置管理员白名单（ADMIN_EMAILS），AI 功能已停用' },
        403
      ),
    };
  }
  if (!adminEmails.includes(email)) {
    console.warn('[auth] 非管理员调用 AI 接口:', email || user.id);
    return { ok: false, response: json({ error: '无权调用该接口（仅限管理员）' }, 403) };
  }
  return { ok: true, userId: user.id, email };
}

/** 解析 ADMIN_EMAILS 环境变量 */
export function parseAdminEmails(raw: string | undefined | null): string[] {
  return String(raw || '')
    .split(/[,\s;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
