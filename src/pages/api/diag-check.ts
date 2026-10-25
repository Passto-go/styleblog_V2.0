// 临时诊断接口：验证限流链路在哪一步断掉。
// 只回显布尔值、计数、错误消息，不泄露密钥。
// 验证完立刻删除本文件。
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const GET: APIRoute = async ({ locals, url }) => {
  const env = (locals as any)?.runtime?.env || {};
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  const bucket = url.searchParams.get('bucket') || `diag:${Date.now()}`;
  const out: any = {
    step: {},
  };

  // 1) 构建期常量是否注入成功
  out.step.envResolved = {
    urlPresent: Boolean(supabaseUrl),
    anonPresent: Boolean(supabaseAnon),
    urlHost: supabaseUrl ? String(supabaseUrl).replace(/^https?:\/\//, '').split('/')[0] : null,
    anonLen: supabaseAnon ? String(supabaseAnon).length : 0,
  };

  if (!supabaseUrl || !supabaseAnon) {
    out.verdict = 'BUILD_ENV_MISSING';
    return new Response(JSON.stringify(out, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // 2) 直接调用 RPC，把完整错误抛出来
  try {
    const client = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false },
      global: {
        fetch: (u: RequestInfo | URL, i?: RequestInit) =>
          fetch(u as any, { ...(i as any), signal: AbortSignal.timeout(4000) }),
      },
    });
    const { data, error } = await client.rpc('rate_limit_hit', {
      p_bucket: bucket,
      p_max: 3,
      p_window_sec: 60,
    });
    out.step.rpc = error
      ? { ok: false, message: error.message, code: (error as any).code, details: (error as any).details, hint: (error as any).hint }
      : { ok: true, data };
  } catch (e: any) {
    out.step.rpc = { ok: false, threw: true, message: e?.message || String(e), name: e?.name };
  }

  // 3) 运行时 env 里是否有意外覆盖
  out.step.runtimeEnvHasPublic =
    Object.keys(env).filter((k) => k.startsWith('PUBLIC_'));
  out.step.hasRuntime = Boolean((locals as any)?.runtime);

  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
