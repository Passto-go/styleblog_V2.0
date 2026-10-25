// 临时诊断接口：用与 unlock.ts 完全相同的参数打满一个窗口，观察翻转点。
// 验证完立刻删除本文件。
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const GET: APIRoute = async ({ request, url }) => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const out: any = {};

  const ip = request.headers.get('cf-connecting-ip') || 'anon';
  // 用独立前缀，避免污染真实 rl:unlock:ip 桶
  const bucket = url.searchParams.get('bucket') || `diag:same:${ip}:${Date.now()}`;
  out.bucket = bucket;

  if (!supabaseUrl || !supabaseAnon) {
    out.verdict = 'BUILD_ENV_MISSING';
    return new Response(JSON.stringify(out, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const client = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false },
    global: {
      fetch: (u: RequestInfo | URL, i?: RequestInit) =>
        fetch(u as any, { ...(i as any), signal: AbortSignal.timeout(4000) }),
    },
  });

  // 与 unlock.ts 同参数：max=10, window=60
  const seq: any[] = [];
  for (let i = 0; i < 13; i++) {
    const { data, error } = await client.rpc('rate_limit_hit', {
      p_bucket: bucket,
      p_max: 10,
      p_window_sec: 60,
    });
    seq.push(error ? { err: error.message } : data);
  }
  out.seqMax10 = seq;
  out.firstFalseAt = seq.findIndex((v) => v === false) + 1;

  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
