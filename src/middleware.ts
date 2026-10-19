import { defineMiddleware } from 'astro:middleware';

// 统一错误兜底：SSR 渲染抛未捕获异常、或返回 5xx 时，改写为站点自己的 404 页面，
// 避免访客直接看到 Cloudflare 的裸错误页（如 522 / 1101 / 500）。
// 说明：
//   · 静态路径的 404 本就由 Cloudflare 直接 serve 预渲染的 404.html，不经过这里；
//   · 本中间件只覆盖 _routes.json 中经 Worker 的 SSR 路径；
//   · 原始错误已 console.error 输出，可在 Cloudflare 日志 / wrangler tail 中排查，
//     兜底不会掩盖问题，只是不让访客面对错误码裸页。
export const onRequest = defineMiddleware(async (context, next) => {
  try {
    const response = await next();
    if (response.status >= 500) {
      console.error('[middleware] SSR 5xx → 改写为 404：', context.url.pathname);
      return to404(context);
    }
    return response;
  } catch (err) {
    console.error('[middleware] SSR 异常 → 改写为 404：', context.url.pathname, err);
    return to404(context);
  }
});

async function to404(context) {
  try {
    // rewrite 到预渲染的 /404 页面；成功后 status 为 200，显式改回 404 保持 HTTP 语义
    const notFound = await context.rewrite('/404');
    return new Response(notFound.body, {
      status: 404,
      headers: notFound.headers,
    });
  } catch {
    // 兜底的兜底：连 404 页面都渲染不了，至少返回纯文本 404，绝不出错误码裸页
    return new Response('404 Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
