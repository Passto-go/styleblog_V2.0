import { getAllPostsEveryLang, getAllCategorySlugs } from '../lib/posts.js';

const LANGS = ['zh', 'en'];

// 每种语言的静态页（zh 用无前缀根路径）
const staticPaths = ['/', '/about/', '/categories/', '/archive/', '/search/', '/copyright/', '/privacy/'];

// 文章 URL 前缀：en 无前缀（默认语言，驻留根路径），zh 带 /zh 段
const prefix = (lang, path) => (lang === 'en' ? path : `/${lang}${path}`);

export async function GET(context) {
  // 域名唯一来源：Astro.site（由 PUBLIC_SITE_URL 构建变量注入）。
  // 不再写死域名兜底——换域名只需改环境变量，此处零改动。
  // 本地未配置时，Astro.site 为空，加载的是 localhost 兜底地址（不影响线上）。
  const base = context.site ?? new URL('http://localhost:4321');

  const urls = [];

  // ① 各语言静态页
  for (const lang of LANGS) {
    for (const p of staticPaths) {
      urls.push({ loc: prefix(lang, p), lastmod: null, priority: '0.7' });
    }
  }

  // ② 各语言分类详情页（从文章分类 + 后台注册表汇总，含 0 篇的分类）
  const catSlugs = await getAllCategorySlugs();
  for (const lang of LANGS) {
    for (const slug of catSlugs) {
      urls.push({ loc: prefix(lang, `/categories/${slug}/`), lastmod: null, priority: '0.5' });
    }
  }

  // ③ 全部语言版本的文章（不按语言挑拣，中英双语都进 sitemap）
  const posts = await getAllPostsEveryLang();
  for (const p of posts) {
    const lang = p.lang || 'zh';
    const loc = prefix(lang, `/posts/${p.slug}/`);
    const lastmod = p.updated_at || p.published_at || null;
    urls.push({
      loc,
      lastmod: lastmod ? new Date(lastmod).toISOString().slice(0, 10) : null,
      priority: '0.8',
    });
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${new URL(u.loc, base).href}</loc>` +
      (u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : '') +
      `\n    <priority>${u.priority}</priority>\n  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
