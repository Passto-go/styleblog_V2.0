import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { makeUnlockCookieValue } from '../../lib/unlock.js';
import { baseSlug } from '../../lib/posts.js';

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
 * 暴力破解防护（两级，均为进程内存态）
 *   1) IP 维度：60s 内最多 10 次请求               → 防高频轰炸
 *   2) 文章维度：同一篇 10 分钟内最多错 5 次，       → 防换 IP 轮询撞同一篇
 *      触发后锁定 10 分钟（指数退避，上限 60 分钟）
 * 内存态不跨 Worker 实例共享（Cloudflare 边缘多 isolate），属「降低成功率」而非
 * 「绝对阻断」；如需强一致，后续可换 KV/Durable Object 或边缘 WAF 规则。
 * ------------------------------------------------------------------ */
const hits = new Map<string, number[]>();
function rateLimit(key: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  return true;
}

type FailState = { fails: number; firstFail: number; lockedUntil: number };
const fails = new Map<string, FailState>();
const FAIL_WINDOW_MS = 10 * 60_000; // 统计窗口
const FAIL_LIMIT = 5; // 窗口内允许的错误次数
const BASE_LOCK_MS = 10 * 60_000; // 首次锁定时长
const MAX_LOCK_MS = 60 * 60_000; // 锁定上限

/** 返回剩余锁定秒数，0 表示未锁定 */
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
    if (!rateLimit(`unlock:${ip}`)) {
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
    const lockSec = lockedFor(failKey);
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
      const lockNow = recordFail(failKey);
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
      const st = fails.get(failKey);
      return json(
        {
          ok: false,
          code: 'wrong_password',
          remaining: st ? Math.max(0, FAIL_LIMIT - st.fails) : FAIL_LIMIT,
          error: '密码错误',
        },
        401
      );
    }

    // 校验通过：清掉该文章的失败计数，签发签名 cookie（base.signature）。
    clearFail(failKey);
    // 本地 dev 为 http，secure 需降级。密钥优先取 Cloudflare 运行时 Secret（locals.runtime.env），
    // 与签发/校验同源，保证 API 与 SSR 页面解出同一把密钥。
    const runtimeEnv = (locals as any).runtime?.env;
    cookies.set('unlocked', await makeUnlockCookieValue(base, runtimeEnv), {
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
