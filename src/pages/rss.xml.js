import rss from '@astrojs/rss';
import { getPosts } from '../lib/posts.js';
import { site, pickI18n } from '../data/site.js';

export async function GET(context) {
  const posts = await getPosts('zh');
  return rss({
    title: pickI18n(site.name, 'zh'),
    description: '记录一个普通人视角下的世界 — 中文 RSS 订阅',
    site: context.site,
    items: posts.map((p) => ({
      title: p.title,
      pubDate: new Date(p.published_at),
      description: p.excerpt || '',
      link: `/posts/${p.slug}/`,
    })),
  });
}
