import { getAllPosts } from '../lib/posts.js';
import { formatDate } from '../lib/format.js';

export async function GET() {
  const posts = await getAllPosts();
  const items = posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt || '',
    // teaser 加密文章（is_encrypted + list_visible）按设计进索引：标题与摘要公开，
    // 正文绝不进公共索引（否则搜索即可读全文，密码门被绕开）；非 teaser 加密文章
    // 已被 getAllPosts 的组级过滤排除，不会到这里。
    content: p.is_encrypted ? '' : (p.content || ''),
    category: p.category || '',
    lang: p.lang || 'zh',
    date: formatDate(p.published_at, p.lang || 'zh'),
  }));
  return new Response(JSON.stringify(items), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
