// 临时诊断接口：测量「Worker 边缘 → Supabase」的真实往返延迟。
// 只回显耗时数字与布尔值，不泄露密钥。
// 验证完立刻删除本文件。
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, locals }) => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const out: any = { build: 'rt2' };

  out.edge = {
    colo: (request as any).cf?.colo ?? null,
    city: (request as any).cf?.city ?? null,
    country: (request as any).cf?.country ?? null,
  };

  if (!supabaseUrl || !supabaseAnon) {
    out.verdict = 'BUILD_ENV_MISSING';
    return new Response(JSON.stringify(out, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const headers = {
    apikey: supabaseAnon,
    Authorization: `Bearer ${supabaseAnon}`,
    'Content-Type': 'application/json',
  };

  // 直接 fetch，绕过 supabase-js，测最原始的往返
  const rtts: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    try {
      await fetch(`${supabaseUrl}/rest/v1/`, { headers, signal: AbortSignal.timeout(6000) });
      rtts.push(Date.now() - t);
    } catch {
      rtts.push(-1);
    }
  }
  out.rawRttMs = rtts;

  // 测两个组合函数各自的耗时
  const timeRpc = async (fn: string, body: any) => {
    const t = Date.now();
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      const json = await r.json();
      return { ms: Date.now() - t, ok: r.ok, data: json };
    } catch (e: any) {
      return { ms: Date.now() - t, ok: false, err: e?.message || String(e) };
    }
  };

  const nonce = Date.now();
  out.guard = await timeRpc('unlock_guard', {
    p_ip_bucket: `diag:guard:${nonce}`,
    p_fail_bucket: `fail:diag:${nonce}`,
    p_ip_max: 100,
    p_window_sec: 60,
    p_fail_limit: 5,
  });
  out.verify = await timeRpc('unlock_verify', {
    p_base: '__diag_probe__',
    p_pw: 'x',
    p_fail_bucket: `fail:diag:${nonce}`,
    p_window_sec: 600,
    p_fail_limit: 5,
    p_base_lock_sec: 600,
    p_max_lock_sec: 3600,
  });

  out.totalMs = out.guard.ms + out.verify.ms;

  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
