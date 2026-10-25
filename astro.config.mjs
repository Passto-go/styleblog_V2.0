import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { loadEnv } from 'vite';

// 站点真实地址（用于生成正确的 sitemap / RSS / canonical 链接）
// 注意：Astro 不会把 .env 自动注入 config 加载时的 process.env（只有 import.meta.env 能拿到），
// 必须用 Vite 的 loadEnv 显式读取；Cloudflare Git 构建等 CI 环境下构建变量在 process.env 里，两者都兜。
const fileEnv = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), '');
// 环境变量优先级：平台注入的 process.env > .env 文件。
// 注意 Cloudflare 构建容器里可能残留一个「空字符串」的 process.env.PUBLIC_SITE_URL，
// 直接用 `a || b` 判断时，空串会走到 `||` 的右侧，这里显式 trim 后再判空。
const RAW_SITE = String(process.env.PUBLIC_SITE_URL || fileEnv.PUBLIC_SITE_URL || '').trim();

/**
 * L-07：PUBLIC_SITE_URL 是 canonical / og:url / RSS / sitemap 的唯一来源。
 *
 * 为什么不再兜底 example.com：
 *   原实现的兜底让「配置错误」看起来像「一切正常」——构建成功、部署成功、页面能打开，
 *   但 canonical、og:url、og:image、RSS、sitemap 的 <loc> 全指向别人域名，
 *   只有从搜索引擎/分享卡片的外部视角才能发现，往往已经错了两周。
 *
 * 现在的策略（分环境，避免误伤本地开发与预览部署）：
 *   · dev（astro dev）        → 告警 + 用 localhost，本地随时能跑；
 *   · preview（wrangler dev 等）→ 告警 + 用 localhost，预览环境没有正式域名；
 *   · production（正式构建）   → 直接抛错，把错误挡在上线之前。
 * 判定依据是 Cloudflare 注入的 CF_PAGES_BRANCH：preview 分支的构建不阻断。
 */
function resolveSiteUrl() {
  if (RAW_SITE) {
    let parsed;
    try {
      parsed = new URL(RAW_SITE);
    } catch {
      throw new Error(
        `[astro.config] PUBLIC_SITE_URL 不是合法 URL：${JSON.stringify(RAW_SITE)}。` +
          '正确写法形如 https://hxlss.cn（必须带协议头，结尾不要带斜杠和路径）'
      );
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error(
        `[astro.config] PUBLIC_SITE_URL 只支持 http/https，当前为 ${parsed.protocol}。` +
          '它会被写进 canonical 与 sitemap，必须是对外可访问的站点地址。'
      );
    }
    // 归一化：去掉结尾斜杠，避免拼出 https://hxlss.cn//posts/xxx
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  }

  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('dev');
  const isPreviewBranch = process.env.CF_PAGES_BRANCH === 'preview';
  const msg =
    '缺少环境变量 PUBLIC_SITE_URL：canonical / og:url / RSS / sitemap 都依赖它。\n' +
    '  本地：在项目根目录 .env 中加一行 PUBLIC_SITE_URL=https://你的域名\n' +
    '  线上：部署平台 → Settings → Build → Build environment variables 添加同名变量，' +
    '然后 Retry deployment';

  if (isDev || isPreviewBranch) {
    console.warn(`[astro.config] ${msg}\n  （当前为 ${isDev ? 'dev' : 'preview'} 环境，暂用 http://localhost:4321 继续）`);
    return 'http://localhost:4321';
  }

  throw new Error(`[astro.config] ${msg}`);
}

const SITE_URL = resolveSiteUrl();

export default defineConfig({
  site: SITE_URL,
  // SSR：所有路由每请求现查 Supabase，后台发布文章后即时生效，无需重新构建。
  // 实际无预渲染页面（无 prerender = true）：首页/文章/分类/归档/关于/隐私/搜索/RSS/
  // sitemap/搜索索引全部走 SSR；站点没有 /login 路由，登录入口是 /admin/（静态后台页）。
  // 由于全部走 SSR，_routes.json 的 include 为 ["/*"]，静态资源同样经过 Worker。
  output: 'server',
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  trailingSlash: 'ignore',
});
