import type { APIRoute } from 'astro';
import { json, requireAdmin, rateLimitKV, parseAdminEmails, getCloudflareEnv } from '../../lib/api-guard.js';
import { translateArticle } from '../../lib/translate.js';

// 动态 API：运行在 Cloudflare Worker 上，LLM 的 API key 只存在于服务端
// 环境变量（TRANSLATE_API_KEY 等），不会暴露给浏览器。
export const prerender = false;


const MAX_CONTENT = 20_000; // 单次翻译的正文上限（字符）

export const POST: APIRoute = async ({ request, locals }) => {
  // 最外层兜底：任何漏网异常都返回规范 JSON，绝不让 worker 裸崩
  // （worker 崩溃时浏览器只会看到 Failed to fetch，排查困难）
  try {
    // 1. 鉴权：校验 Supabase 会话，并确认是管理员（M-02：此前只验「已登录」，
    //    任何能注册该 Supabase 项目的用户都能调用，白嫖站长付费 LLM 额度）
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    // Astro v6+：运行时 Secret 改由 cloudflare:workers 读取（见 getCloudflareEnv）
    const runtimeEnv = (await getCloudflareEnv()) || {};
    const adminEmails = parseAdminEmails(
      runtimeEnv.ADMIN_EMAILS || (import.meta as any).env.ADMIN_EMAILS
    );
    const guard = await requireAdmin(token, adminEmails);
    if (!guard.ok) return guard.response;
    const userId = guard.userId;

    // 2. 限流：走 Supabase 原子计数（跨实例一致），异常时退回内存兜底（M-01 / L-11）
    if (!(await rateLimitKV(runtimeEnv, `ai:${userId}`, 8, 60, {
      url: (import.meta as any).env.PUBLIC_SUPABASE_URL,
      anon: (import.meta as any).env.PUBLIC_SUPABASE_ANON_KEY,
    }))) {
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
      const env = (await getCloudflareEnv()) || {};
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
