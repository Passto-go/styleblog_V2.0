import type { APIRoute } from 'astro';
import { json, requireAdmin, rateLimitKV, parseAdminEmails } from '../../lib/api-guard.js';
import { aiExcerpt } from '../../lib/excerpt.js';

// 动态 API：运行在 Cloudflare Worker 上，LLM 的 API key 只存在于服务端
// 环境变量（TRANSLATE_API_KEY 等），不会暴露给浏览器。
export const prerender = false;


const MAX_CONTENT = 20_000; // 与翻译一致：防滥用的护栏（实际只送前 6000 字给模型）
const MAX_LEN_CAP = 500;    // 摘要长度上限（防止误填巨大值导致 prompt 畸形）

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // 1. 鉴权：校验 Supabase 会话，并确认是管理员（M-02：此前只验「已登录」，
    //    任何能注册该 Supabase 项目的用户都能调用，白嫖站长付费 LLM 额度）
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    const runtimeEnv = (locals as any)?.runtime?.env || {};
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
    const content = String(body?.content || '');
    const lang = String(body?.lang || 'zh');
    const style = String(body?.style || 'plain');
    const maxLen = Math.min(Math.max(Number(body?.maxLen) || 200, 20), MAX_LEN_CAP);

    if (!content.trim()) {
      return json({ error: '正文不能为空' }, 400);
    }
    if (content.length > MAX_CONTENT) {
      return json({ error: `正文超过 ${MAX_CONTENT} 字，请拆成多篇` }, 400);
    }
    if (!['zh', 'en'].includes(lang)) {
      return json({ error: '文章语言仅支持 zh / en' }, 400);
    }
    if (!['plain', 'points', 'hook'].includes(style)) {
      return json({ error: '风格参数无效' }, 400);
    }

    // 4. 调用 LLM 生成摘要
    try {
      const env = (locals as any).runtime?.env || {};
      const result = await aiExcerpt({ title, content, lang, maxLen, style }, env);
      return json({ ok: true, ...result, source: 'ai' });
    } catch (e: any) {
      if (e?.code === 'NO_API_KEY') {
        return json(
          { error: '服务端未配置翻译 API key。请在 Cloudflare 项目设置中添加 secret：TRANSLATE_API_KEY' },
          503
        );
      }
      // AI 不可用时不留空白：回退到本地规则截取，并在响应里标明来源，
      // 前台据此提示「已按正文自动截取」。这样模型/网络异常都不会阻塞写作。
      console.error('[excerpt] AI 生成失败，回退本地截取:', e?.message || e);
      try {
        const { localExcerpt } = await import('../../lib/excerpt.js');
        const fallback = localExcerpt(content, maxLen);
        if (fallback) {
          return json({ ok: true, excerpt: fallback, source: 'local', reason: e?.message || '未知错误' });
        }
      } catch (e2: any) {
        console.error('[excerpt] 本地截取也失败:', e2?.message || e2);
      }
      // 连本地截取都拿不到（正文过短）时，才如实报错，并说明下一步怎么做
      return json(
        {
          error:
            'AI 摘要生成失败：' +
            (e?.message || '未知错误') +
            '。可稍后重试，或手动填写摘要',
        },
        502
      );
    }
  } catch (e: any) {
    console.error('[excerpt] unhandled:', e?.stack || e);
    return json({ error: '服务内部错误，请稍后重试：' + (e?.message || '未知错误') }, 500);
  }
};

// 其他方法一律拒绝
export const ALL: APIRoute = async () => json({ error: 'Method Not Allowed' }, 405);
