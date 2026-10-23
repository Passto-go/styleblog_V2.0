// robots.txt 动态生成：域名取自 Astro.site（即 PUBLIC_SITE_URL 环境变量）。
//
// 为什么不用 public/robots.txt 静态文件：
//   静态文件里的域名是写死的，换域名时必须手动改文件再提交；
//   改为路由生成后，换域名只需改 Cloudflare 构建变量 PUBLIC_SITE_URL，代码零改动。
//
// 注意：必须删除 public/robots.txt，否则静态资源会优先命中旧文件。
import type { APIRoute } from 'astro';

export const prerender = false;

function build(site: URL) {
  const sitemapUrl = new URL('sitemap-index.xml', site).href;

  return `# robots.txt — ${site.origin}
# 允许所有爬虫抓取公开内容；后台与内部接口不开放。

User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /search-index.json

Sitemap: ${sitemapUrl}
`;
}

// Astro 的 API 路由不会自动用 GET 处理 HEAD，需显式声明，
// 否则部分爬虫/监控工具发 HEAD 探测会拿到 404。
export const HEAD: APIRoute = ({ site }) =>
  new Response(null, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=1800',
    },
  });

export const GET: APIRoute = ({ site }) => {
  // 兜底地址仅用于本地未配 PUBLIC_SITE_URL 时，不影响线上
  const base = site ?? new URL('http://localhost:4321');

  return new Response(build(base), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // 短缓存：换域名后半小时内自动跟上，不需要手动清 CDN
      'Cache-Control': 'public, max-age=1800',
    },
  });
};
