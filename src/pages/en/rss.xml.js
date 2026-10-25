import rss from '@astrojs/rss';
import { getPosts } from '../../lib/posts.js';
import { site, pickI18n } from '../../data/site.js';

export async function GET(context) {
  const posts = await getPosts('en');
  return rss({
    title: pickI18n(site.name, 'en'),
    description: 'A record of the world through an ordinary person’s eyes — English feed',
    site: context.site,
    items: posts.map((p) => ({
      title: p.title,
      pubDate: new Date(p.published_at),
      description: p.excerpt || '',
      link: `/en/posts/${p.slug}/`,
    })),
  });
}
