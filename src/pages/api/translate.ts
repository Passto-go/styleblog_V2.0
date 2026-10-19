import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { translateArticle } from '../../lib/translate.js';

// 动态 API：运行在 Cloudflare Worker 上，LLM 的 API key 只存在于服务端
// 环境变量（TRANSLATE_API_KEY 等），不会暴露给浏览器。
export const prerender = false;

// 内存限流：每用户 60 秒 8 次。Worker 实例级，防手滑连点足够；
// 也顺带避开免费层每分钟请求数的上限。真正的访问门槛是
// 「只有管理员能登录后台」这一事实。
const hits = new Map<string, number[]>();
function rateLimit(key: string, max = 8, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  hits.set(key, arr);
  return true;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

const MAX_CONTENT = 20_000; // 单次翻译的正文上限（字符）

export const POST: APIRoute = async ({ request, locals }) => {
  // 最外层兜底：任何漏网异常都返回规范 JSON，绝不让 worker 裸崩
  // （worker 崩溃时浏览器只会看到 Failed to fetch，排查困难）
  try {
    // 1. 鉴权：校验 Supabase 会话 token，确保是已登录的管理员
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: '未登录或会话已过期，请重新登录后台管理界面' }, 401);

    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseAnon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnon) {
      return json({ error: '站点未配置 Supabase，无法验证身份' }, 500);
    }

    let userId = '';
    try {
      const supabase = createClient(supabaseUrl, supabaseAnon);
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return json({ error: '会话无效，请重新登录后台管理界面' }, 401);
      }
      userId = data.user.id;
    } catch {
      return json({ error: '身份验证失败，请重新登录' }, 401);
    }

    // 2. 限流
    if (!rateLimit(userId)) {
      return json({ error: '操作太频繁，请一分钟后重试' }, 429);
    }

    // 3. 参数校验
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: '请求格式错误' }, 400);
    }
    const title = String(body?.title || '').trim();
    const excerpt = String(body?.excerpt || '').trim();
    const content = String(body?.content || '');
    const targetLang = String(body?.targetLang || '');

    if (!title || !content.trim()) {
      return json({ error: '标题和正文不能为空' }, 400);
    }
    if (!['en'].includes(targetLang)) {
      return json({ error: '目标语言仅支持 en（英文）' }, 400);
    }
    if (content.length > MAX_CONTENT) {
      return json({ error: `正文超过 ${MAX_CONTENT} 字，请拆成多篇或手动分段翻译` }, 400);
    }

    // 4. 调用 LLM 翻译（端点/模型/key 来自 Cloudflare 环境变量）
    try {
      const env = (locals as any).runtime?.env || {};
      const result = await translateArticle({ title, excerpt, content, targetLang }, env);
      return json({ ok: true, ...result });
    } catch (e: any) {
      if (e?.code === 'NO_API_KEY') {
        return json(
          { error: '服务端未配置翻译 API key。请在 Cloudflare 项目设置中添加 secret：TRANSLATE_API_KEY' },
          503
        );
      }
      console.error('[translate] failed:', e?.message || e);
      return json({ error: '翻译失败：' + (e?.message || '未知错误') }, 502);
    }
  } catch (e: any) {
    console.error('[translate] unhandled:', e?.stack || e);
    return json({ error: '服务内部错误，请稍后重试：' + (e?.message || '未知错误') }, 500);
  }
};

// 其他方法一律拒绝
export const ALL: APIRoute = async () => json({ error: 'Method Not Allowed' }, 405);
