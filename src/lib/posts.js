import { createClient } from '@supabase/supabase-js';
import { marked } from 'marked';
import { samplePosts } from '../data/sample.js';
import { site } from '../data/site.js';

const URL = import.meta.env.PUBLIC_SUPABASE_URL;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// 构建时（服务端）从 Supabase 拉取已发布文章。
// 未配置或拉取失败则回退到本地示例数据，保证站点始终能构建。
async function fetchAll() {
  if (!URL || !KEY) {
    console.warn('[posts] 未检测到 Supabase 环境变量，使用本地示例数据。');
    return samplePosts;
  }
  const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
  // 显式排除垃圾箱文章（deleted_at is null）：RLS 已据此过滤，此处再挡一道，
  // 即使策略未及时更新也安全。若数据库尚未执行 posts_trash.sql（无该列），
  // 回退为不带该条件的查询，避免整个前台因缺列而取不到文章。
  let query = supabase
    .from('posts')
    .select('*')
    .eq('published', true);
  let { data, error } = await query.is('deleted_at', null).order('published_at', { ascending: false });
  if (error && /deleted_at/.test(error.message || '')) {
    console.warn('[posts] 未找到 deleted_at 列（请执行 supabase/posts_trash.sql），回退查询');
    ({ data, error } = await query.order('published_at', { ascending: false }));
  }

  if (error) {
    console.warn('[posts] 拉取失败，回退示例数据:', error.message);
    return samplePosts;
  }
  return data ?? [];
}

const byDateDesc = (a, b) =>
  new Date(b.published_at).getTime() - new Date(a.published_at).getTime();

// 兼容 Supabase(下划线字段)与本地示例(camelCase)，统一成 camelCase
function normalize(p) {
  return {
    ...p,
    lang: p.lang || 'zh',
    category: p.category || null,
    categorySlug: p.category_slug || p.categorySlug || 'uncategorized',
  };
}

// 文章为「语言中立」：同一篇文章在所有语言视图下都展示，仅 UI 文案随语言切换。
// 同一篇文章的多个语言版本按「基准 slug」归组（hello / hello-en / hello-ja 的基准都是 hello），
// 每个语言视图只挑选最匹配的一个版本展示，避免列表出现同篇多语言的重复条目。
export async function getPosts(lang = 'zh') {
  const all = (await fetchAll()).map(normalize);
  return pickPerArticle(all, lang);
}

export async function getAllPosts(lang = 'zh') {
  return pickPerArticle((await fetchAll()).map(normalize), lang);
}

// sitemap / RSS 等需要覆盖全部语言版本的场景：不按语言挑选，返回全部已发布版本。
export async function getAllPostsEveryLang() {
  return (await fetchAll()).map(normalize);
}

// 全部出现过的分类 slug（含注册表里 0 篇文章的分类），供 sitemap 等枚举使用。
export async function getAllCategorySlugs() {
  const slugs = new Set();
  for (const p of await fetchAll()) {
    slugs.add(normalize(p).categorySlug || 'uncategorized');
  }
  try {
    const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from('categories')
      .select('slug');
    if (!error && data) for (const r of data) if (r.slug) slugs.add(r.slug);
  } catch { /* 表尚未创建：忽略，按文章推导 */ }
  return [...slugs];
}

// 按基准 slug 归组，每组挑出最符合目标语言的版本；组内排序稳定，结果按发布时间倒序
function pickPerArticle(all, lang) {
  const groups = new Map();
  for (const p of all) {
    const base = baseSlug(p.slug);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(p);
  }
  const out = [];
  for (const versions of groups.values()) out.push(pickLangVersion(versions, lang));
  return out.sort(byDateDesc);
}

// 从同一篇文章的多个语言版本中挑最匹配的一个。优先级：
//   ① 基准 slug 且 lang 字段匹配（「同 slug + lang 区分」约定）
//   ② slug 后缀 base-lang（「hello-en」约定，后台未设语言时 lang 常为默认 'zh'）
//   ③ 任意 slug 但 lang 字段匹配
//   ④ 基准 slug 本身（中文原文）
//   ⑤ 第一个（兜底）
function pickLangVersion(versions, lang) {
  const base = baseSlug(versions[0].slug);
  return (
    versions.find((p) => p.slug === base && (p.lang || 'zh') === lang) ||
    versions.find((p) => p.slug === `${base}-${lang}`) ||
    versions.find((p) => (p.lang || 'zh') === lang) ||
    versions.find((p) => p.slug === base) ||
    versions[0]
  );
}

// 语言无关的文章查找：保证任何语言视图下都能取到内容（中文原文兜底），永不空页。
// 同时兼容两种翻译命名约定：
//   ① 「同 slug + lang 字段」：英文版 slug 与中文版相同，靠 lang='en' 区分
//   ② 「slug 后缀」：英文版 slug 为 base-en（后台未提供语言选择，lang 常为默认 'zh'）
// 中文视图优先解析基准 slug，避免误命中 -en/-ja 版本；非中文视图优先 slug 后缀约定。
export async function getPost(slug, lang = 'zh') {
  const all = (await fetchAll()).map(normalize);
  const base = baseSlug(slug);
  if (lang === 'zh') {
    return (
      all.find((x) => x.slug === base && (x.lang || 'zh') === 'zh') ||
      all.find((x) => x.slug === base) ||
      all.find((x) => x.slug === slug && (x.lang || 'zh') === 'zh') ||
      all.find((x) => x.slug === slug) ||
      null
    );
  }
  return (
    all.find((x) => x.slug === `${base}-${lang}`) ||
    all.find((x) => x.slug === slug && (x.lang || 'zh') === lang) ||
    all.find((x) => x.slug === base) ||
    all.find((x) => x.slug === slug) ||
    null
  );
}

// 其它语言视图下「相邻文章」的展示标题：优先用该文章在目标语言下的已发布版本标题。
// 背景：getAllPosts(lang) 里缺译文的条目会回退其它语言版本（中文原文兜底），
// 于是英文/日文文章页的「上一篇 / 下一篇」会直接露出中文标题。这里在展示层做一次
// 标题级回退：有译文用译文标题，无译文保持原文标题（不隐藏导航、不改变相邻关系）。
// 相邻关系本身与语言无关，因此仅替换标题、不动顺序与链接。
export function titleResolver(allRows, lang) {
  const groups = new Map();
  for (const p of allRows) {
    const b = baseSlug(p.slug);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(p);
  }
  return function displayTitle(p) {
    const group = groups.get(baseSlug(p.slug));
    if (!group || (p.lang || 'zh') === lang) return p.title;
    const dl = pickDisplayLang(group, baseSlug(p.slug), lang);
    // 回退仅为缺失译文兜底：显示语言仍等于该条自身语言时无需替换
    if (!dl || dl === (p.lang || 'zh')) return p.title;
    const picked = pickLangVersion(group, dl);
    return (picked && picked.title) || p.title;
  };
}

// 文章组内某语言「有已发布译文」的判定（兼容双约定）：
//   · 外语：lang 字段匹配，或 slug 为 base-语言（后台未设语言时 lang 常为默认 'zh'）
//   · 中文：只认 base slug 且 lang 为 zh（不能靠 lang 字段——后缀约定的英文版 lang 也是 'zh'）
export function hasVersion(group, base, lang) {
  if (lang === 'zh') {
    return group.some((x) => x.slug === base && (x.lang || 'zh') === 'zh');
  }
  return group.some((x) => (x.lang || 'zh') === lang || x.slug === `${base}-${lang}`);
}

// 正文语言级联（详情页用）：
//   目标语言有译文 → 目标；否则（目标≠en 且有英文译文）→ 英文；否则中文原文。
//   刻意不对称：英语缺失只退中文（对英语读者退日文更冷门）；
//   日语缺失先退英文（日本读者英语接受度最高，且英文版是「次优成品」）。
export function pickDisplayLang(group, base, lang) {
  if (hasVersion(group, base, lang)) return lang;
  if (lang !== 'en' && hasVersion(group, base, 'en')) return 'en';
  if (hasVersion(group, base, 'zh')) return 'zh';
  return null;
}

// 文章详情专用：返回当前语言应展示的版本 + 各语言可用性 + 译文兄弟链接。
// available 只认已发布版本（fetchAll 已过滤 published），草稿译文对读者视为不存在。
export async function getPostWithVersions(slug, lang = 'zh') {
  const all = (await fetchAll()).map(normalize);
  const base = baseSlug(slug);
  const group = all.filter((x) => baseSlug(x.slug) === base);
  if (!group.length) return null;

  const versionSlug = (l) => {
    const row =
      l === 'zh'
        ? group.find((x) => x.slug === base && (x.lang || 'zh') === 'zh')
        : group.find((x) => (x.lang || 'zh') === l || x.slug === `${base}-${l}`);
    return row ? row.slug : null;
  };

  const available = { en: hasVersion(group, base, 'en'), ja: hasVersion(group, base, 'ja') };
  const displayLang = pickDisplayLang(group, base, lang);
  const post = (displayLang && pickLangVersion(group, displayLang)) || group[0];
  return {
    post,
    displayLang: displayLang || 'zh',
    available,
    siblings: { en: versionSlug('en'), ja: versionSlug('ja') },
    base,
  };
}

// 读取站点动态配置（如倒计时）。表不存在 / 未配置时返回 null，调用方回退默认值。
// noStore：跳过 fetch 缓存。后台「保存后立即看效果」的场景要传 true，
// 否则 fetch 层缓存会把旧值再喂回来。
export async function getSetting(key, opts = {}) {
  if (!URL || !KEY) return null;
  try {
    const supabase = createClient(URL, KEY, {
      auth: { persistSession: false },
      global: opts.noStore ? { fetch: (u, i) => fetch(u, { ...i, cache: 'no-store' }) } : {},
    });
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return null;
    return data.value;
  } catch {
    return null;
  }
}

// 站点头像地址（后台「站点设置 → 头像」上传后存 site_settings.avatar）。
// 未配置 / 读取失败 / 上传通道未就绪时，回退源码里的 site.avatar（public/avatar.png），
// 保证头像永远有内容可渲染：读取失败绝不能把线上头像弄丢。
const AVATAR_FALLBACK = site.avatar || '';
export async function getAvatar(opts = {}) {
  const v = await getSetting('avatar', opts);
  const url = v && typeof v === 'object' ? String(v.url || '').trim() : '';
  if (!url) return AVATAR_FALLBACK;
  // 只接受 http(s) 与「站内单斜杠绝对路径」。
  // 注意：不能写成 /^\/，//evil.com/a.png 也以 / 开头，但浏览器会当成协议相对外链；
  // 这里要求 / 后面不是 /，把跨域 svg/data/javascript 之类的脏值统统挡在外面。
  if (!/^(https?:\/\/|\/(?!\/))/i.test(url)) return AVATAR_FALLBACK;
  return url;
}

// 资料卡头像加载失败时的兜底字（与源码配置一致）
export function avatarFallbackChar() {
  return (site.avatarFallback || (site.author || 'A').slice(0, 1) || 'A');
}
export { site as siteConfig };

// 分类列表（含每类文章数）。
// 以 categories 注册表为「名称/Slug 权威源」，叠加已发布文章的实际计数；
// 注册表缺失或查询失败时，降级为纯文章推导，保证站点不崩。
//
// 多语言名称：categories 表用 name(中文) / name_en / name_ja 三列分别存，
// 这里按当前 lang 选出对应名称并回退中文（缺失绝不显示空白）。
// 注意 slug 是全站唯一标识，与语言无关——三语共用同一个分类 slug。
export function pickCategoryName(row, lang = 'zh') {
  if (!row) return '';
  const zh = (row.name || '').trim();
  if (lang === 'en') return (row.name_en || '').trim() || zh || row.slug || '';
  if (lang === 'ja') return (row.name_ja || '').trim() || zh || row.slug || '';
  return zh || row.slug || '';
}

// opts.skipPosts：只取注册表、不查文章计数。调用方只用到「名称 / 是否存在」（如分类详情页
// 校验 slug、文章页显示分类名）时用它，避免为此多读一次 posts（SSR 每请求都会执行）。
export async function getCategories(lang = 'zh', opts = {}) {
  const posts = opts.skipPosts ? [] : await getPosts(lang);

  // 文章推导的计数（按 slug 归组）
  const counts = new Map();
  for (const p of posts) {
    const slug = p.categorySlug || 'uncategorized';
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }

  // 注册表（后台「新增分类」产生，可能 0 篇）
  let registry = [];
  try {
    const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
    // 先尝试带多语言列查询；若数据库尚未执行迁移（无 name_en/name_ja 列），
    // 回退为只取 name，保证上线顺序不受影响（先发代码、后执行 SQL 也不会 500）。
    let { data, error } = await supabase
      .from('categories')
      .select('name, name_en, name_ja, slug')
      .order('created_at', { ascending: true });
    if (error && /name_en|name_ja|column/i.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('categories')
        .select('name, slug')
        .order('created_at', { ascending: true }));
    }
    if (!error && data) registry = data;
  } catch {
    registry = []; // 表尚未创建：忽略，按纯文章推导
  }

  const map = new Map();
  // 先放注册表（名称权威，count 先 0）
  for (const r of registry) {
    if (!r.slug) continue;
    map.set(r.slug, {
      // name = 当前语言下的显示名；names = 三语全量（后台/其他地方复用）
      name: pickCategoryName(r, lang),
      names: {
        zh: (r.name || '').trim(),
        en: (r.name_en || '').trim(),
        ja: (r.name_ja || '').trim(),
      },
      slug: r.slug,
      count: 0,
      fromRegistry: true,
    });
  }
  // 再用文章计数叠加；文章里有但注册表没有的（历史脏数据）用文章名兜底
  for (const [slug, n] of counts) {
    if (!map.has(slug)) {
      const sample = posts.find((x) => (x.categorySlug || 'uncategorized') === slug);
      const fallback = sample?.category || slug;
      map.set(slug, {
        name: fallback,
        names: { zh: sample?.category || '', en: '', ja: '' },
        slug,
        count: 0,
        fromRegistry: false,
      });
    }
    map.get(slug).count += n;
  }

  return [...map.values()].sort(
    (a, b) => (b.count - a.count) || String(a.name).localeCompare(String(b.name))
  );
}

// slug → { name, names, slug } 的字典，供「渲染时按 category_slug 反查注册表」使用。
// 与 getCategories 共用同一套回退规则（缺译文回退中文 → 回退 slug），保证全站口径一致。
export function toCategoryMap(list) {
  const map = new Map();
  for (const c of list || []) if (c && c.slug) map.set(c.slug, c);
  return map;
}

// 已注册分类的 slug 列表。与 getAllCategorySlugs 的区别：只认注册表，不含「文章里出现但
// 注册表没有」的历史脏数据——用于 301 兼容层，避免把这类 slug 误跳到错误地址。
export async function getRegisteredCategorySlugs() {
  const list = await getCategories('zh', { skipPosts: true });
  return list.filter((c) => c.fromRegistry).map((c) => c.slug);
}

export async function getPostsByCategory(slug, lang = 'zh') {
  const posts = await getPosts(lang);
  return posts.filter((p) => (p.categorySlug || 'uncategorized') === slug);
}

// 旧分类 slug → 新 slug 的 301 映射（重命名分类时写入）。前台分类页 SSR 用 anon key 查询。
export async function getCategoryAlias(oldSlug) {
  try {
    const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
    const { data } = await supabase
      .from('category_aliases')
      .select('new_slug')
      .eq('old_slug', oldSlug)
      .maybeSingle();
    return data?.new_slug || null;
  } catch {
    return null;
  }
}

export function slugify(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-\u4e00-\u9fa5]/g, '');
}

// 去掉语言后缀（-en/-ja）得到基准 slug：hello-en / hello-ja -> hello
export function baseSlug(slug) {
  return String(slug).replace(/-(en|ja)$/, '');
}

// 查找文章在其他语言下的对应版本（用于文章页的语言切换按钮）。
// 与 getPost 保持同一套优先级（同样走 pickLangVersion），确保「切换链接」与
// 「点击后取到的内容」严格一致：链接用返回版本的 slug 生成，getPost 再按该 slug
// 必然解析回同一版本。
// 找不到该文章的任何版本时返回 null，调用方回退该语言首页（避免 404）。
export async function findTranslation(slug, targetLang) {
  const all = (await fetchAll()).map(normalize);
  const base = baseSlug(slug);
  const versions = all.filter((p) => baseSlug(p.slug) === base);
  if (!versions.length) return null;
  return pickLangVersion(versions, targetLang);
}

// 渲染 Markdown，并为 h2/h3 生成锚点 id；返回 { html, headings(用于目录) }
export function renderMarkdown(content = '') {
  const raw = marked.parse(content || '');
  const headings = [];
  const html = String(raw).replace(/<h([23])>(.*?)<\/h\1>/g, (m, lvl, inner) => {
    const text = inner.replace(/<[^>]+>/g, '');
    const id = slugify(text);
    headings.push({ level: Number(lvl), id, text });
    return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
  });
  return { html, headings };
}
