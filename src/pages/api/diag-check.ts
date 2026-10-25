// 临时诊断接口：把 unlock 一次请求里的 4 段 Supabase 往返拆开计时。
// 验证完立刻删除本文件。
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const GET: APIRoute = async ({ request }) => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const out: any = { stages: [] };
  if (!supabaseUrl || !supabaseAnon) {
    out.verdict = 'BUILD_ENV_MISSING';
    return new Response(JSON.stringify(out, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const ip = request.headers.get('cf-connecting-ip') || 'anon';
  const t0 = Date.now();
  const marks: Record<string, number> = {};
  const mark = (k: string) => { marks[k] = Date.now() - t0; };

  // A) 构造客户端本身要多久（空跑，不发请求）
  const mk = () => createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false },
    global: {
      fetch: (u: RequestInfo | URL, i?: RequestInit) =>
        fetch(u as any, { ...(i as any), signal: AbortSignal.timeout(6000) }),
    },
  });
  const c1 = mk(); mark('construct#1');
  const c2 = mk(); mark('construct#2');

  // B) 纯 RPC
  await c1.rpc('rate_limit_hit', { p_bucket: `perf:${ip}:${Date.now()}`, p_max: 1000, p_window_sec: 60 });
  mark('rpc_rate_limit_hit');

  await c1.rpc('unlock_locked_for', { p_bucket: `perf:lock:${ip}` });
  mark('rpc_unlock_locked_for');

  await c1.rpc('post_check_password', { p_base: '__perf_probe__', p_pw: 'x' });
  mark('rpc_post_check_password');

  await c1.rpc('unlock_record_fail', {
    p_bucket: `perf:fail:${ip}:${Date.now()}`,
    p_window_sec: 600, p_limit: 5, p_base_lock_sec: 600, p_max_lock_sec: 3600,
  });
  mark('rpc_unlock_record_fail');

  out.totalMs = Date.now() - t0;
  out.marks = marks;
  out.deltas = {
    construct1: marks['construct#1'],
    construct2: marks['construct#2'] - marks['construct#1'],
    rateLimitHit: marks['rpc_rate_limit_hit'] - marks['construct#2'],
    lockedFor: marks['rpc_unlock_locked_for'] - marks['rpc_rate_limit_hit'],
    checkPassword: marks['rpc_post_check_password'] - marks['rpc_unlock_locked_for'],
    recordFail: marks['rpc_unlock_record_fail'] - marks['rpc_post_check_password'],
  };

  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
