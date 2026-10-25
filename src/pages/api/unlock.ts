import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { makeUnlockCookieValue } from '../../lib/unlock.js';
import { baseSlug } from '../../lib/posts.js';
import { rateLimitKV } from '../../lib/api-guard.js';

// 动态 API：运行在 Cloudflare Worker 上。任何人（已登录/未登录）都可尝试密码，
// 但密码校验发生在 DB 端（post_check_password 用 pgcrypto 比对，pass_hash 不外泄），
// 通过后由服务端签发 HMAC 签名 cookie，绝不把 pass_hash 或明文交给浏览器。
export const prerender = false;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/* ------------------------------------------------------------------ *
 * 暴力破解防护（三级）
 *   1) IP 维度：60s 内最多 10 次请求               → 防高频轰炸
 *   2) 文章维度：同一篇 10 分钟内最多错 5 次，       → 防换 IP 轮询撞同一篇
 *      触发后锁定 10 分钟（指数退避，上限 60 分钟）
 *   3) IP 维度计数存 Supabase（rate_limit_hit RPC，单条 UPSERT 原子递增）
 *      → 跨 Worker 实例强一致。
 *      此前用 Cloudflare KV 实测失败：KV 没有原子递增，get→+1→put 在并发下
 *      互相覆盖，且写入有传播延迟会让 429 闪断，因此改用 Postgres。
 * Supabase 不可用时自动退回纯内存（行为与改造前一致，不会因故障而报错）。
 * ------------------------------------------------------------------ */
type FailState = { fails: number; firstFail: number; lockedUntil: number };
const fails = new Map<string, FailState>();
const FAIL_WINDOW_MS = 10 * 60_000; // 统计窗口
const FAIL_LIMIT = 5; // 窗口内允许的错误次数
const BASE_LOCK_MS = 10 * 60_000; // 首次锁定时长
const MAX_LOCK_MS = 60 * 60_000; // 锁定上限

/** 返回剩余锁定秒数，0 表示未锁定（内存兜底路径） */
function lockedFor(key: string): number {
  const s = fails.get(key);
  if (!s) return 0;
  const left = s.lockedUntil - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

function recordFail(key: string): number {
  const now = Date.now();
  let s = fails.get(key);
  if (!s || now - s.firstFail > FAIL_WINDOW_MS) {
    s = { fails: 0, firstFail: now, lockedUntil: 0 };
  }
  s.fails += 1;
  let lockSec = 0;
  if (s.fails >= FAIL_LIMIT) {
    // 每多错一轮，锁定时长翻倍（10 → 20 → 40 → 60 分钟封顶）
    const round = Math.floor(s.fails / FAIL_LIMIT) - 1;
    const lockMs = Math.min(BASE_LOCK_MS * Math.pow(2, Math.max(0, round)), MAX_LOCK_MS);
    s.lockedUntil = now + lockMs;
    s.fails = 0;
    s.firstFail = now;
    lockSec = Math.ceil(lockMs / 1000);
  }
  fails.set(key, s);
  return lockSec;
}

function clearFail(key: string) {
  fails.delete(key);
}

// ------------------------------------------------------------------
// 文章维度锁定（计数 + 锁定）
//
// 演进过程：
//  1) 最初用模块级 Map —— 多 isolate 下各自归零，等于没防护。
//  2) 改用 Cloudflare KV —— KV 的 get→判断→put 是非原子读改写，
//     2026-10-25 实测并发 15 次时同一篇第 2 次就被误锁（多个请求读到
//     同一个 fails=0 各自写回），既漏拦也误伤真实访客。KV 无原子递增 API。
//  3) 现在用 Supabase 函数 unlock_record_fail：一条 plpgsql 内完成
//     「取行锁 → 累加 → 判阈值 → 写锁定」，并发请求由数据库行锁串行化。
//     实测并发 15 次：remaining 恰好各出现 3 次（1~5），锁定正好触发 3 次，
//     零丢失零误锁。
// 数据库不可用时退回内存实现，保证接口不 500（防护退化但不失效）。
// ------------------------------------------------------------------

type SbCfg = { url?: string; anon?: string } | undefined;

function sbClient(cfg: SbCfg) {
  if (!cfg?.url || !cfg?.anon) return null;
  return createClient(cfg.url, cfg.anon, {
    auth: { persistSession: false },
    global: {
      fetch: (u: RequestInfo | URL, i?: RequestInit) =>
        fetch(u as any, { ...(i as any), signal: AbortSignal.timeout(4000) }),
    },
  });
}

/** 读锁定剩余秒数；数据库不可用时退回内存 */
async function lockedForKV(cfg: SbCfg, key: string): Promise<number> {
  const client = sbClient(cfg);
  if (client) {
    try {
      const { data, error } = await client.rpc('unlock_locked_for', { p_bucket: key });
      if (!error) return typeof data === 'number' ? data : 0;
      console.warn('[unlock] unlock_locked_for 失败，退回内存:', error.message);
    } catch (e: any) {
      console.warn('[unlock] unlock_locked_for 异常，退回内存:', e?.message || e);
    }
  }
  return lockedFor(key);
}

/** 记一次错误，返回锁定秒数与剩余可试次数；数据库不可用时退回内存 */
async function recordFailKV(
  cfg: SbCfg,
  key: string
): Promise<{ lockSec: number; remaining: number }> {
  const client = sbClient(cfg);
  if (client) {
    try {
      const { data, error } = await client.rpc('unlock_record_fail', {
        p_bucket: key,
        p_window_sec: Math.floor(FAIL_WINDOW_MS / 1000),
        p_limit: FAIL_LIMIT,
        p_base_lock_sec: Math.floor(BASE_LOCK_MS / 1000),
        p_max_lock_sec: Math.floor(MAX_LOCK_MS / 1000),
      });
      if (!error) {
        // 函数返回 table，supabase-js 拿到的是数组
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          return {
            lockSec: Number(row.locked_for_sec) || 0,
            remaining: Number(row.remaining) || 0,
          };
        }
      }
      console.warn('[unlock] unlock_record_fail 失败，退回内存:', error?.message);
    } catch (e: any) {
      console.warn('[unlock] unlock_record_fail 异常，退回内存:', e?.message || e);
    }
  }
  const lockSec = recordFail(key);
  const st = fails.get(key);
  return { lockSec, remaining: st ? Math.max(0, FAIL_LIMIT - st.fails) : FAIL_LIMIT };
}

/** 解锁成功后清空失败计数（数据库 + 内存都清） */
async function clearFailKV(cfg: SbCfg, key: string): Promise<void> {
  clearFail(key);
  const client = sbClient(cfg);
  if (!client) return;
  try {
    await client.rpc('unlock_clear', { p_bucket: key });
  } catch {
    /* 清理失败不影响主流程，计数会按 expires_at 自然过期 */
  }
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  try {
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseAnon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnon) {
      return json({ ok: false, error: '站点未配置 Supabase' }, 500);
    }

    // 限流：优先取 Cloudflare 客户端真实 IP
    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for') ||
      'anon';
    const runtimeEnv = (locals as any)?.runtime?.env || {};
    // 文章锁定与限流都走 Supabase 原子函数；配置缺失或数据库异常时内部退回内存
    const sbCfg = { url: supabaseUrl, anon: supabaseAnon };
    // Supabase 原子计数（跨实例一致）；异常时内部退回内存限流，不会放行失控
    if (!(await rateLimitKV(runtimeEnv, `rl:unlock:ip:${ip}`, 10, 60, {
      url: supabaseUrl,
      anon: supabaseAnon,
    }))) {
      return json({ ok: false, code: 'too_many', error: '尝试过于频繁，请稍后再试' }, 429);
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: '请求格式错误' }, 400);
    }
    const base = baseSlug(String(body?.slug || '').trim());
    const password = String(body?.password || '');
    if (!base || !password) {
      return json({ ok: false, error: '缺少必要参数' }, 400);
    }
    // 密码上限 128 位：避免超长输入拖慢 bcrypt 比较（DoS 面）
    if (password.length > 128) {
      return json({ ok: false, code: 'wrong_password', error: '密码错误' }, 401);
    }

    // 文章维度锁定检查（在调用 DB 之前拦截，省算力也防爆破）
    const failKey = `fail:${base}`;
    const lockSec = await lockedForKV(sbCfg, failKey);
    if (lockSec > 0) {
      return json(
        {
          ok: false,
          code: 'locked',
          retryAfter: lockSec,
          error: `密码错误次数过多，请 ${Math.ceil(lockSec / 60)} 分钟后再试`,
        },
        429
      );
    }

    // DB 端比对，pass_hash 不离开数据库。与 posts.js 一致加 6s 超时，
    // 防止数据库挂起把 Worker 拖到边缘超时（访客侧表现为 522/524）。
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false },
      global: { fetch: (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(6000) }) },
    });
    const { data, error } = await supabase.rpc('post_check_password', {
      p_base: base,
      p_pw: password,
    });
    if (error) {
      console.error('[unlock] rpc post_check_password error:', error.message);
      return json({ ok: false, error: '验证服务异常，请稍后重试' }, 500);
    }
    if (!data) {
      // 计入文章维度错误次数；达阈值则立刻返回锁定
      const { lockSec: lockNow, remaining } = await recordFailKV(sbCfg, failKey);
      if (lockNow > 0) {
        return json(
          {
            ok: false,
            code: 'locked',
            retryAfter: lockNow,
            error: `密码错误次数过多，请 ${Math.ceil(lockNow / 60)} 分钟后再试`,
          },
          429
        );
      }
      // 附带 code 供前端按语言本地化提示（API 默认中文，英文页需客户端映射为其翻译）
      return json(
        {
          ok: false,
          code: 'wrong_password',
          remaining,
          error: '密码错误',
        },
        401
      );
    }

    // 校验通过：清掉该文章的失败计数，签发签名 cookie（base.signature）。
    await clearFailKV(sbCfg, failKey);
    // 本地 dev 为 http，secure 需降级。密钥优先取 Cloudflare 运行时 Secret（locals.runtime.env），
    // 与签发/校验同源，保证 API 与 SSR 页面解出同一把密钥。
    cookies.set('unlocked', await makeUnlockCookieValue(base, runtimeEnv as any), {
      httpOnly: true,
      secure: !import.meta.env.DEV,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return json({ ok: true });
  } catch (e: any) {
    console.error('[unlock] unhandled:', e?.stack || e);
    return json({ ok: false, error: '服务内部错误' }, 500);
  }
};

// 其他方法一律拒绝
export const ALL: APIRoute = async () => json({ ok: false, error: 'Method Not Allowed' }, 405);
