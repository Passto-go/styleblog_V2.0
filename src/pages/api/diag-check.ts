// 临时诊断接口：验证限流链路在哪一步断掉。
// 只回显布尔值、计数、错误消息，不泄露密钥。
// 验证完立刻删除本文件。
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const GET: APIRoute = async ({ locals, url, request }) => {
  const env = (locals as any)?.runtime?.env || {};
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  const out: any = { step: {} };

  // 1) 请求头来源
  const h = request.headers;
  out.step.headers = {
    cfConnectingIp: h.get('cf-connecting-ip'),
    xForwardedFor: h.get('x-forwarded-for'),
    cfIpcountry: h.get('cf-ipcountry'),
    userAgent: (h.get('user-agent') || '').slice(0, 40),
  };

  // 2) 构建期常量
  out.step.envResolved = {
    urlPresent: Boolean(supabaseUrl),
    anonPresent: Boolean(supabaseAnon),
    urlHost: supabaseUrl ? String(supabaseUrl).replace(/^https?:\/\//, '').split('/')[0] : null,
  };

  if (!supabaseUrl || !supabaseAnon) {
    out.verdict = 'BUILD_ENV_MISSING';
    return new Response(JSON.stringify(out, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // 3) 用和 unlock.ts 完全相同的 bucket 规则打 5 次，看返回序列
  const ip = h.get('cf-connecting-ip') || h.get('x-forwarded-for') || 'anon';
  const bucket = `rl:unlock:ip:${ip}`;
  out.step.bucket = bucket;

  const client = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false },
    global: {
      fetch: (u: RequestInfo | URL, i?: RequestInit) =>
        fetch(u as any, { ...(i as any), signal: AbortSignal.timeout(4000) }),
    },
  });

  const seq: any[] = [];
  for (let i = 0; i < 5; i++) {
    try {
      const { data, error } = await client.rpc('rate_limit_hit', {
        p_bucket: bucket,
        p_max: 1000,          // 故意放大，只观察 hits 序列是否递增
        p_window_sec: 60,
      });
      seq.push(error ? { err: error.message } : { data });
    } catch (e: any) {
      seq.push({ threw: e?.message || String(e) });
    }
  }
  out.step.seqMax1000 = seq;

  // 4) 再打 3 次 p_max=1 的独立 bucket，验证 true/false 翻转
  const probeBucket = `diag:flip:${Date.now()}`;
  const flip: any[] = [];
  for (let i = 0; i < 3; i++) {
    const { data, error } = await client.rpc('rate_limit_hit', {
      p_bucket: probeBucket,
      p_max: 1,
      p_window_sec: 60,
    });
    flip.push(error ? { err: error.message } : { data });
  }
  out.step.flipMax1 = flip;

  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
