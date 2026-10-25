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

// 轻量内存限流（防暴力破解，见评估文档「暴力破解防护」坑）：
// 每客户端 IP 60 秒内最多 10 次解锁尝试。内存态不跨 Worker 实例共享，仅作补充；
// 完整限流需 KV/边缘规则，超出本轮 MVP 范围。
const hits = new Map<string, number[]>();
function rateLimit(key: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  hits.set(key, arr);
  return true;
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
      return json({ ok: false, error: '尝试过于频繁，请稍后再试' }, 429);
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
      return json({ ok: false, error: '密码错误' }, 401);
    }

    // 校验通过：签发签名 cookie（base.signature）。本地 dev 为 http，secure 需降级。
    // 密钥优先取 Cloudflare 运行时 Secret（locals.runtime.env），
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
