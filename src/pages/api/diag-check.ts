// 临时诊断接口：确认 Cloudflare 运行时 env 中是否注入了绑定。
// 只回显「存在哪些 key、类型是什么」，不泄露任何值。
// 验证完立刻删除本文件。
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const env = (locals as any)?.runtime?.env || {};
  const keys = Object.keys(env).sort();
  const detail: Record<string, string> = {};
  for (const k of keys) {
    const v = env[k];
    if (v && typeof v === 'object') {
      const methods = ['get', 'put', 'delete', 'list'].filter((m) => typeof v[m] === 'function');
      detail[k] = methods.length ? `object{binding:${methods.join(',')}}` : 'object';
    } else {
      detail[k] = typeof v;
    }
  }
  let kvProbe = 'no-binding';
  const kv = env.RATE_LIMIT_KV;
  if (kv && typeof kv.get === 'function') {
    try {
      const v = await kv.get('__diag_probe__');
      kvProbe = v === null ? 'binding-ok(key-missing)' : 'binding-ok(key-present)';
    } catch (e: any) {
      kvProbe = 'binding-error: ' + (e?.message || String(e));
    }
  }
  return new Response(
    JSON.stringify(
      {
        envKeyCount: keys.length,
        envKeys: keys,
        detail,
        kvProbe,
        hasRuntime: Boolean((locals as any)?.runtime),
      },
      null,
      2
    ),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  );
};
