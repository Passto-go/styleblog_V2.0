# 吾道一以贯之 · 多语种个人博客

> 一个支持**中文 / English**双语、内容存于 Supabase、以 **Cloudflare Workers（SSR）** 零成本托管的个人博客系统。

---

## 一、项目简介

本仓库是一个面向个人写作的轻量级博客引擎，核心设计目标是：

- **内容与代码分离**：文章、评论、站点动态配置全部存放在 Supabase 云端数据库；前端以 **SSR（服务端渲染）** 方式在每次请求时实时查询，发布/编辑文章**即时生效，无需重新构建**。
- **双语同源**：同一篇文章可用 `lang` 字段区分语言版本，前台按 `/`（中文）、`/en/`（英文）路由切换，缺失译文时给出友好提示。
- **自带后台管理界面**：`/admin` 提供文章写作、评论审核、分类管理、倒计时配置等能力，无需登录第三方 CMS。
- **零成本部署**：构建产物为标准 Cloudflare Worker，部署到 Workers 免费额度（无限带宽、3,000 构建分钟/月、10 万请求/天）。

技术栈：**Astro 4 + @astrojs/cloudflare + Supabase + Cloudflare Workers**。

---

## 二、主要功能特性

### 内容与前台
- **双语支持**（中文 / English）：导航语言切换 + `hreflang` SEO 标记；当某语言缺已发布译文时，文章页显示「暂无译文」横幅并保留原文可阅读。
- **文章系统**：Markdown 正文、摘要、封面图、分类标签、按发布时间排序；支持文章目录（TOC）、字数统计、**预计阅读时长**（中英混合检测：CJK 字符 400 字/分 + 拉丁词 220 词/分，代码块不计入）、上一篇/下一篇、热门文章、相关分类。
- **分类体系**：分类以「注册表（`categories` 表）」为权威来源，支持**新增 / 重命名 / 合并 / 删除**；重命名改动 Slug 后，旧链接通过 `category_aliases` 表做**严格 301 跳转**，不会 404。
- **归档 / 分类 / 搜索**：按时间归档页、分类列表与分类详情页、纯前端站内搜索（读取 `/search-index.json`）。
- **订阅与 SEO**：每语言独立的 RSS（`/rss.xml`、`/en/rss.xml`）、站点地图（`/sitemap-index.xml`）、canonical / Open Graph 元数据。
- **小部件**：「今日寄语」（按语言每日轮换）、「倒计时」（目标日与名称由后台写入 `site_settings`）。
- **体验细节**：深色模式、响应式布局、文章分享面板（微信 / 微博 / X / Telegram 等）、无译文提示。

### 后台管理界面（`/admin`，独立页面）
后台拆分为三个模块，顶部不经过前台导航栏：

| 模块 | 能力 |
|---|---|
| **文章管理** | 文章列表**每个「篇」只占一行**：同一篇文章的各语言版本（zh/en）合并显示，语言以可点击标签排列在同行（点标签直接载入该语言版进编辑器）；标题链接**默认跳中文页面**；行尾「编辑 / 删除」（始终同行排列、不换行——「编辑」打开中文版，删除仅删中文版）；列表右侧「＋ 新建文章」；支持「全部 / 已发布 / 草稿」筛选与标题搜索（跨语言版本命中）。编辑器默认隐藏，仅点「＋ 新建文章」或行内「编辑」时以弹窗出现（点右上角 ✕ 关闭，点空白处或按 Esc 均不会关闭，防止误触丢失未保存内容），内含标题、语言、分类下拉（可新建）、作者、状态、Markdown 实时预览、一键翻译；「更多设置」内可**修改发布时间**（datetime 选择器，回填当前时间；留空保存则保持原时间——前台展示、首页/归档排序、RSS 的 pubDate 随之更新） |
| **评论管理** | 查看全部评论（含待审 / 未通过）；审核（通过 / 驳回）、管理员回复（嵌套）、删除；「我的评论」面板凭令牌管理自己提交的评论 |
| **其他功能** | 倒计时配置（目标日 + 事件名）；分类管理（新增 / 重命名 / 合并 / 删除，严格 301 联动） |

后台还提供「进入前端首页」入口，退出登录后自动回到登录界面（会话监听）。

### 评论系统
- **先审后放**：新评论默认进入「待审核」，通过后才对外展示；三态（待审核 / 已通过 / 未通过）。
- **本人管理**：匿名提交时分配随机 `delete_token`（存浏览器 `localStorage`），凭令牌查看与删除自己的评论（经 `security definer` RPC，绕过 RLS 取回）。
- **管理员回复**：后台回复标记为 `is_admin=true`，匿名用户无法伪造；支持多级嵌套。
- **数据校验**：昵称/邮箱/内容长度与邮箱格式在数据库策略层（RLS）强制校验。

### 一键翻译（可选）
后台管理界面可调用翻译接口，把文章译成英文 / 日文版本（需配置翻译 key，详见配置章节）。翻译走 **OpenAI 兼容协议**，可搭配任意兼容服务（Gemini / DeepSeek / 智谱 GLM 等）：换服务只需改 `TRANSLATE_BASE_URL` / `TRANSLATE_MODEL` 两个变量，代码零改动。长文自动按二级标题分段翻译（段间 2 秒间隔防限流），失败指数退避重试。

---

## 三、技术栈

| 类别 | 选型 |
|---|---|
| 框架 | Astro `^4.16.0`（SSR：`output: 'server'`） |
| 适配器 | `@astrojs/cloudflare` `~11.2.0`（`nodejs_compat`） |
| 数据库 / 鉴权 | Supabase（Postgres + RLS + Auth + Storage + Realtime） |
| Markdown | `marked` `^12.0.2` |
| 订阅 / 站点地图 | `@astrojs/rss` `^4.0.7`、`@astrojs/sitemap` `^3.2.1` |
| 运行时 | Cloudflare Workers（`npx wrangler deploy`） |
| Node | 22（仓库 `.nvmrc` 已锁定） |

---

## 四、目录结构

```
styleblog_V2.0/
├─ src/
│  ├─ i18n/ui.js            # 中英双语文案 + 路由辅助（localizePath / switchLangPath 等）
│  ├─ data/
│  │  ├─ site.js            # 站名 / 作者 / 版权 / 社交 / 寄语 / 倒计时默认值
│  │  └─ sample.js          # 未配置 Supabase 时的示例文章（双语）
│  ├─ lib/
│  │  ├─ posts.js           # 从 Supabase 取文章 / 分类（注册表合并文章计数）/ 归档 / 别名 301
│  │  ├─ format.js          # 日期 / 分组格式化
│  │  ├─ quotes.js          # 今日寄语按「年内第几天」轮换
│  │  ├─ reading-time.js    # 预计阅读时长（CJK 字符 + 拉丁词混合加权，剔除代码块）
│  │  └─ translate.js       # 翻译封装（分段 / 重试 / JSON 提取）
│  ├─ layouts/
│  │  ├─ Base.astro         # 前台页面骨架（头/尾/SEO/hreflang）
│  │  └─ AdminLayout.astro  # 后台独立外壳（不挂前台导航）
│  ├─ components/
│  │  ├─ Header.astro Footer.astro Icon.astro
│  │  ├─ PostCard.astro ProfileCard.astro Share.astro Toc.astro
│  │  ├─ Comments.astro Countdown.astro TodayQuote.astro
│  │  └─ pages/             # 各页面体：Home / Archive / Categories / Category / About / Search / Post
│  └─ pages/
│     ├─ index.astro about.astro archive.astro search.astro
│     ├─ categories/index.astro categories/[category].astro   # 分类列表 / 分类详情
│     ├─ posts/[slug].astro rss.xml.js sitemap-index.xml.js search-index.json.js
│     ├─ en/  ja/           # 英文 / 日文全量镜像（index/about/archive/categories/posts/search/rss）
│     ├─ admin.astro         # 后台管理界面（三模块）
│     ├─ api/translate.ts    # 一键翻译接口
│     └─ 404.astro
├─ supabase/
│  ├─ schema.sql            # 建表 + RLS + 图床 + 评论 RPC（最先跑）
│  ├─ categories.sql        # 分类注册表 + 自愈回填（其次）
│  └─ posts_author.sql      # 给 posts 增加 author 列（文章作者字段）
├─ public/
│  ├─ styles.css            # 前台样式（含 .wb-* 后台作用域样式）
│  ├─ avatar.png            # 头像（放入即启用）
│  └─ _headers              # 静态资源缓存头
├─ astro.config.mjs         # output:'server' + Cloudflare 适配器；site 用 Vite loadEnv 显式读取 PUBLIC_SITE_URL（Astro 不会把 .env 注入 config 加载期的 process.env）
├─ wrangler.toml           # Cloudflare Workers 配置（main / assets / nodejs_compat / vars）
├─ DEPLOY.md               # 部署指南（Cloudflare Workers · Git 构建 · SSR）
├─ .env.example            # 环境变量样例
├─ .nvmrc                  # Node 22
└─ package.json            # scripts: dev / build / preview
```

---

## 五、快速开始（本地预览）

```bash
git clone <your-fork> styleblog_V2.0
cd styleblog_V2.0
npm install
npm run dev          # 打开 http://localhost:4321
```

未配置 `.env` 时，站点使用 `src/data/sample.js` 的示例文章（中英双语），预览、构建均可正常进行。

---

## 六、配置 Supabase（必做）

1. 在 [Supabase](https://supabase.com) 新建项目，进入 **SQL Editor**。
2. 依次执行仓库内三个 SQL 文件（建议按此顺序，均可重复执行）：
   - **`supabase/schema.sql`**：建 `posts` / `comments`（含 `add_comment`、`list_my_comments`、`delete_own_comment` 三个 RPC）/ `site_settings` / `category_aliases` 表，配置 RLS、图床桶 `images`、Realtime。
   - **`supabase/categories.sql`**：建 `categories` 注册表，自愈历史脏数据，并把现有文章去重分类种子化进去。
   - **`supabase/posts_author.sql`**：给 `posts` 增加 `author` 列（文章作者字段；不加此列时后台「发布 / 存草稿」会报错）。
3. 进入 **Project Settings → API**，复制 `Project URL` 与 `anon public` key。
4. 复制 `.env.example` 为 `.env` 并填入：

```bash
PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJ...你的anon key
# 站点对外地址（用于 sitemap / RSS / canonical）；部署后可设为 https://<项目名>.workers.dev
PUBLIC_SITE_URL=
```

> `anon` key 本就公开、前端使用安全；读者端读受 RLS 限制，仅对**已发布文章**与**已审核评论**开放。

---

## 七、环境变量与配置说明

### 构建期 / 运行时变量（`.env` 或构建环境变量）

| 变量 | 必填 | 说明 |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | 是 | Supabase 项目 URL（不要带 `/rest/v1/` 后缀） |
| `PUBLIC_SUPABASE_ANON_KEY` | 是 | Supabase `anon` key，构建时内联进 Worker |
| `PUBLIC_SITE_URL` | 建议 | 站点对外地址，影响 sitemap / RSS / canonical 准确性 |

> ⚠️ `PUBLIC_*` 为**构建时内联**变量，值在 `npm run build` 那一刻写入产物；构建后改 Cloudflare 后台变量无法补救，务必先填真值再构建。

### `wrangler.toml` 的 `[vars]`（随代码提交）

| 变量 | 当前值 | 说明 |
|---|---|---|
| `TRANSLATE_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4/` | 翻译接口（OpenAI 兼容端点，当前指向智谱 GLM；可换成 DeepSeek / Moonshot / Gemini 等任意兼容服务，改这两个值即可，代码零改动） |
| `TRANSLATE_MODEL` | `glm-4.7-flash` | 翻译模型名（智谱 GLM-4.7-Flash 为模型级永久免费，个人博客用量足够；换服务时同步改为对应模型名） |

### Cloudflare Secret（敏感，**不**写进代码）

| 变量 | 说明 |
|---|---|
| `TRANSLATE_API_KEY` | 翻译服务密钥。Cloudflare 后台 → 项目 → **Settings → Variables and Secrets → Add（Type: Secret）** 添加；保存后 **Retry deployment** 生效，仅在服务端可见 |

---

## 八、数据库结构

| 表 / 对象 | 作用 |
|---|---|
| `posts` | 文章：`title / slug / content(MD) / excerpt / cover / author / published / published_at / lang / category / category_slug` |
| `comments` | 评论：`page / author / email / content / approved / rejected / parent_id / is_admin / delete_token`；含匿名提交与本人删除 RPC |
| `site_settings` | 站点动态配置（如倒计时 `{name, target}`），键值对 `jsonb` |
| `category_aliases` | 分类 Slug 旧→新映射，前台分类页 SSR 先查此表做 301 |
| `categories` | 分类注册表（`name / slug`），名称显示权威源，支持 0 篇文章也展示 |
| `storage.buckets.images` | 图床（公开读，仅登录可上传） |

---

## 九、后台使用说明

1. 浏览器打开 `<域名>/admin`，用 Supabase 账号登录。
2. **文章管理**：文章列表每个「篇」只占一行——同一篇文章的多语言版本合并显示，语言以标签排列在同行（点标签直接编辑该语言版），点标题默认打开中文页面，行尾可「编辑 / 删除」（始终同行排列、不换行）；用「全部 / 已发布 / 草稿」筛选（跨语言版本命中）。点「＋ 新建文章」或行内「编辑」才会弹出编辑器窗口（只能点右上角 ✕ 关闭；点空白处或按 Esc 不会关闭，防止误触丢失未保存内容），其中填标题、语言、分类（可新建）、作者、正文，「发布并上线」即写库生效，读者刷新即可见。**修改已发布文章的发布时间**：编辑器 →「更多设置」→「发布时间」，选新时间保存即可（前台展示、排序、RSS 同步更新；留空则保持原时间）。
3. **评论管理**：审核待审评论（通过 / 驳回）、管理员回复、删除不当评论。
4. **其他功能**：设置首页倒计时；管理分类（新增 / 重命名 / 合并 / 删除），重命名改动 Slug 后旧链接自动 301。

> 发布文章**不触发任何构建**；只有改代码才需推送并重新部署。

---

## 十、页面与路由

| 路径 | 说明 |
|---|---|
| `/`、`/en/` | 各语言首页（Hero + 最新随笔卡片） |
| `/about/`、`/en/about/` | 关于 |
| `/categories/`、`/en/categories/` | 分类列表 |
| `/categories/<slug>/` | 单个分类下的文章（旧 slug 走 301） |
| `/archive/`、`/en/archive/` | 按时间归档 |
| `/search/`、`/en/search/` | 站内搜索（读 `/search-index.json`） |
| `/posts/<slug>/` | 单篇文章（Markdown 渲染） |
| `/rss.xml`、`/en/rss.xml` | 各语言 RSS |
| `/sitemap-index.xml` | 站点地图 |
| `/search-index.json` | 搜索索引（构建生成） |
| `/admin` | 后台管理界面 |

顶部导航：主页 / 分类 / 关于 / 归档 / 语言切换（中 / EN）；右侧图标：RSS / 站点地图 / 搜索 / 登录 / 主题切换。

---

## 十一、部署到线上（Cloudflare Workers）

站点为 **Astro SSR**，构建产物含 Cloudflare Worker 运行时（`dist/_worker.js/index.js`），部署到 **Cloudflare Workers（Git 构建）**。详细步骤、额度说明、排错表见 **`DEPLOY.md`**，要点：

1. Cloudflare Dashboard → **Workers & Pages → Create → Connect to Git**，选 **Workers**（不是 Pages），仓库 `main` 分支。
2. 构建设置：Framework `Astro`，Build `npm run build`，Output `dist`，Deploy `npx wrangler deploy`（由 `wrangler.toml` 驱动）。
3. **Settings → Builds → Build environment variables** 添加 `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` / `PUBLIC_SITE_URL` / `NODE_VERSION=22`。
4. **Save and Deploy** → 得到 `https://<项目名>.workers.dev`。
5. 绑定自定义域名：**Settings → Triggers → Custom Domains**（免费 HTTPS）。

> 国内访问预期：Cloudflare 在大陆「能用但偏慢」；后台管理界面需能连通 Supabase（必要时在可联网环境登录），读者侧走 Cloudflare 边缘现查不受影响。

---

## 十二、自定义与扩展

- **站名 / 作者 / 版权 / 社交 / 寄语 / 倒计时默认值**：编辑 `src/data/site.js`。
- **导航与文案（双语）**：编辑 `src/i18n/ui.js`（中 / 英两栏）。
- **样式**：编辑 `public/styles.css`（后台样式以 `.wb-*` 作用域隔离，不影响前台）。
- **头像**：替换 `public/avatar.png` 即自动启用。
- **新增翻译语言**：在 `src/i18n/ui.js` 的 `languages`、`ui` 与 `src/data/site.js` 的 `quotes` 增加对应语言，并补充 `src/pages/<lang>/` 镜像路由。

---

## 十三、许可证

本项目内容采用 **CC BY-NC 4.0**（署名-非商业性使用）许可。

> 由 **Astro + Supabase + Cloudflare** 构建。
