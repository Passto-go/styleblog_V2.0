# 部署指南（Cloudflare Workers · Git 构建 · SSR 动态模式）

> 站点为 Astro SSR：内容页（首页/文章/分类/归档/RSS/sitemap/搜索索引）每请求现查 Supabase，
> **后台发布文章后即时生效，无需重新构建**。读者始终只访问 Cloudflare，不直连 Supabase。
> 代码仓库：https://github.com/<你的用户名>/<仓库名> （分支 `main`）
>
> ⚠️ 本项目是 **Cloudflare Workers（通过 Git 构建，即 Workers Builds）**，不是经典 Pages。
> Dashboard 的 Deploy command 为 `npx wrangler deploy`，由仓库根目录的 `wrangler.toml` 驱动。

## 一、为什么选 Cloudflare Workers

| | Netlify 免费版 | Cloudflare Workers（免费） |
|---|---|---|
| 带宽 | 100 GB/月 | **无限** |
| 构建额度 | 300 分钟/月 | **3,000 构建分钟/月**（1 并发、20 分钟超时） |
| 运行时请求 | 按量 | **10 万次/天**（单调用 CPU ≤ 10ms） |
| 免费子域名 | xxx.netlify.app | xxx.workers.dev |
| 自定义域名 | 免费 | 免费（SSL 自动） |

本站为 SSR 模式：**内容更新走 Supabase（零构建）**，只有改代码才需要构建部署，
3,000 分钟/月对个人博客绰绰有余（每次构建约 1–3 分钟，基本用不完）；带宽无限，无额度焦虑。

> 构建分钟数（build minutes）与线上访问（Requests/CPU）是**两套独立额度**，互不影响。
> 详见文末「免费额度说明」。

## 二、部署：Git 自动部署（唯一推荐路径）

> ⚠️ 必须用 **Git** 方式创建项目（Connect to Git），不要选「直接上传」。
> 本仓库为 SSR（依赖构建生成的 `_worker.js`），且 `npx wrangler deploy` 需要 Git 构建环境。

1. Cloudflare Dashboard → **Workers & Pages → Overview → Create → Connect to Git**
   - 注意：选 **Workers**（不是 Pages 标签）。Workers 现在原生支持静态资源 + Git 构建。
2. 授权 GitHub，选择仓库 `<你的用户名>/<仓库名>`，Production branch 选 `main`
3. 构建设置（Framework preset 选 **Astro** 后通常自动填好）：
   - Framework preset：**Astro**
   - Build command：**npm run build**
   - Build output directory：**dist**
   - Deploy command（自动填）：**npx wrangler deploy**  ← 由 `wrangler.toml` 驱动，不要改
4. **构建环境变量**在 **Settings → Builds → Build environment variables**（不是 Runtime variables 区）添加：

   | 变量 | 值 | 必填 |
   |---|---|---|
   | `PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | 是 |
   | `PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` 那串 anon public key | 是 |
   | `PUBLIC_SITE_URL` | `https://你的正式域名`（如 `https://hxlss.cn`） | **是** |
   | `NODE_VERSION` | `22` | 建议（仓库已有 `.nvmrc`，双保险） |
   | `UNLOCK_SECRET` | `openssl rand -hex 32` 生成的值 | 用文章加密才需（也可配成运行时 Secret，见下） |

   > **`PUBLIC_SITE_URL` 是必填项，不是「建议」**（2026-11-02 起）。它是 canonical / og:url / RSS / sitemap / robots.txt 的唯一域名来源，且**只认这一处**——本地 `.env` 不进仓库，Cloudflare 构建读不到。
   > 漏配时：生产构建直接失败并提示变量名；本地 `dev` 与 `preview` 分支仅告警。值必须带 `https://` 协议头，结尾斜杠会自动归一化。
   > 详见 `域名变更操作手册.md`。

   > `UNLOCK_SECRET` 有两种配法，代码双路兼容（运行时优先）：**① Secret（推荐）**：Settings → Variables and Secrets → Add（Type: Secret），改密钥免重建；**② 构建变量**：加进上表，值随构建内联进 Worker。

   > ⚠️ **文章加密的数据库迁移（`supabase/encryption.sql` v2）必须先部署代码、后执行 SQL**：SQL 含 `pass_hash` 列级 revoke，旧代码的 `select('*')` 会因此报权限错而降级成示例数据。代码上线并确认页面正常后再跑 SQL。
   >
   > ✅ **收尾建议（2026-10 已上线验证）**：跑完 `encryption.sql` 后再执行 `supabase/encryption_hash_private.sql`——它把 `pass_hash` 哈希迁入 `private` 模式私有表并删除 `posts.pass_hash` 列，从结构上消除列级权限的暴露面（线上实测 `?select=pass_hash` 直接返回 42703 列不存在），上述 revoke 顺序坑也随之 moot。三件套都可重复执行（幂等）。

5. **Save and Deploy**，约 1–3 分钟得到 `https://<项目名>.workers.dev`
6. 以后**只有改代码才需要 push**；发文不触发任何构建

> 改完环境变量 / `wrangler.toml` 后，必须 **Retry deployment**（或重新 push）才生效。
> 缺 `PUBLIC_*` 变量也能构建成功（代码有示例数据降级），但那样线上只会显示示例文章、后台读不到你的 Supabase。

### `wrangler.toml` 已带，无需手动配

```toml
name = "mystyle"                 # 必须与 Dashboard 项目名完全一致
# Astro 7 + @astrojs/cloudflare v14：main 用适配器统一入口，不要写构建产物路径！
# 旧值 "dist/_worker.js/index.js" 指向构建后才生成的文件，Cloudflare 在解析配置
# 阶段就找不到该文件 → 构建 0 秒即失败（报错 main field doesn't point to an existing file）。
main = "@astrojs/cloudflare/entrypoints/server"
compatibility_date = "2025-07-18"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./dist"
```

> ⚠️ **`main` 是发布点，不是产物路径（2026-10 踩坑复盘）**：旧 `wrangler.toml` 写
> `main = "dist/_worker.js/index.js"`，该文件要在 `npm run build` 之后才存在。Cloudflare
> 在**读取配置阶段**就会校验该路径，文件尚不存在直接报 `main field doesn't point to an existing file`，
> 构建 0 秒失败（GitHub Checks 显示 `Workers Builds: mystyle failed in 0s`）。
> 升级到 Astro 7 + adapter 14 后改用适配器统一入口 `main = "@astrojs/cloudflare/entrypoints/server"`
> （不以 `.js` 结尾，vite-plugin 不再要求文件预先存在），构建才正常。
> 配套：`astro.config.mjs` 的 adapter 需设 `prerenderEnvironment: 'node'`（worker 预渲染在沙箱/部分 CI 跑不起 workerd，会 ECONNREFUSED）。
> **改 `wrangler.toml` 或 `astro.config.mjs` 后必须 Retry deployment / 重新 push 才生效。**

- `nodejs_compat`：SSR 依赖 Node 兼容层，缺它 Worker 里任何 Node 内建调用会直接 500。
- **不要**加 `disable_nodejs_process_v2`：本地 wrangler 3.x 运行时不识别该标志会启动失败。

## 三、发布文章的完整流程（SSR 版）

1. 打开 `<域名>/admin` 登录后台管理界面
2. 写/改文章 → 点「**发布并上线**」
3. 后台提示「已发布 ✓ 已即时生效」——**到此结束**，读者刷新即可看到

- 写库与上线合一：Supabase 是唯一事实源，不存在"库里改了、线上还是旧的"
- 改错别字同样即时生效
- 评论原本就是 realtime 动态，不受影响
- 下架文章同样即时（`published=false` 后下一请求即消失）
- **修改已发布文章的发布时间**：后台编辑器 →「更多设置」→「发布时间」选新时间保存，前台展示 / 首页归档排序 / RSS `pubDate` 下一请求即更新（留空保存则保持原时间；该时间仅作展示与排序，未启用定时发布）

## 四、自定义域名（自有域名签发后）

### 4.0 先把域名接入 Cloudflare（新版控制台路径）

> 旧版入口「Websites → Add a site」已改名为 **「Domains → Onboard a domain」**（2025 年控制台改版），找不到 Websites 入口是正常的。

1. Cloudflare Dashboard 左侧边栏 → **Domains** → 右上角 **Onboard a domain**（部分账号显示 Add a domain）
2. 输入 apex 域名（如 `example.com`）→ Continue
3. DNS 记录导入：新域名选跳过/自己管理 → Continue
4. 套餐选 **Free** → Continue → 记录确认页直接 Continue（空区域正常）
5. CF 给出两个 NS（`xxx.ns.cloudflare.com`）→ 到注册商处把域名 NS 改为这两个
   - 阿里云：进**域名控制台**（domain.aliyun.com，不是云解析 DNS）→ 域名列表 → 管理 → 左侧菜单 **DNS 修改** → 修改 DNS 服务器 → 填 CF 的两个 NS
6. 等 CF 面板 Domains 列表里域名状态变为 **Active**（通常几分钟到几小时）

### 4.1 绑定到 Worker

1. Workers 项目 → **Settings → Triggers → Custom Domains → Add Custom Domain**（新版界面在 Settings → Domains & Routes）→ 填 `<你的域名>`（示例：`example.com`）
2. DNS 在 Cloudflare 则自动配置；在别处则加 `CNAME` 指向 `<项目名>.workers.dev`
3. SSL 自动签发
4. 把 **Build environment variables** 里的 `PUBLIC_SITE_URL` 改成 `https://example.com`，**重新部署一次**（Deployments 页最新部署 → `···` → Retry deployment；或推送任意代码触发 Git 自动构建）
   （RSS/sitemap/canonical 随之更新；文章内容不受影响）

## 五、上线后验证清单

- [ ] 首页 200，文章列表 = Supabase 已发布文章（不是示例数据）
- [ ] 后台发布一篇测试文章 → **不做任何部署操作**，刷新首页应立刻出现
- [ ] `/posts/<slug>/` 200；乱写的 slug 返回 404（带 404 页面内容）
- [ ] `/en/` 正常，语言切换不 404
- [ ] `/rss.xml`、`/sitemap-index.xml` 域名正确；`/search-index.json` 能返回文章
- [ ] `/admin` 能登录、粘贴图片上传正常；发布提示为「已即时生效」
- [ ] 文章页评论能加载、能发
- [ ] 深色模式、手机宽度正常；设计与此前静态版一致
- [ ] （如用文章加密）后台给测试文章设密码 → 列表/归档/RSS/sitemap/`search-index.json` 均不出现该文；文章页只见密码框，源码无正文；输对密码后正文呈现

## 六、免费额度说明（哪些操作消耗、哪些不消耗）

**消耗「构建分钟（build minutes，免费 3,000/月）」的操作：**
- 每次 push 到 `main` 触发的自动构建（约 1–3 分钟/次）
- 每次 **Retry deployment** / 手动重新部署
- 每次改了环境变量 / `wrangler.toml` 后的重新构建
- ✅ 量级极小：3,000 分钟 = 50 小时，个人博客基本用不完

**不消耗构建分钟的操作：**
- 读者访问页面 → 走「Requests（免费 10 万/天）+ CPU（免费 10ms/调用）」额度，与构建无关
- 后台发布 / 编辑 / 下架文章 → 零构建、零分钟（SSR 现查 Supabase）
- 改环境变量本身（不触发构建就不消耗；但要让其生效需手动重建一次）
- 本地 `wrangler dev` / 本地调试

**其他运行时额度（本博客量级基本碰不到上限）：**
- Requests 10 万/天、单调用 CPU 10ms（SSR 渲染通常 <10ms）
- Observability / Logs 20 万条/天

## 七、常见问题与应对

| 现象 | 原因 | 处理 |
|---|---|---|
| 构建失败，日志提到 `Workers-specific command in a Pages project` | `wrangler.toml` 是 Pages 格式但 Deploy command 是 `npx wrangler deploy` | 用本文的 Workers 格式 `wrangler.toml`（已修复） |
| 构建 0 秒失败，Checks 显示 `Workers Builds: mystyle failed in 0s`，或日志 `main field doesn't point to an existing file` | `wrangler.toml` 的 `main` 指向构建产物路径（如 `dist/_worker.js/index.js`），Cloudflare 在**读配置阶段**就找不到该文件，构建根本没启动 | 把 `main` 改为适配器统一入口 `@astrojs/cloudflare/entrypoints/server`（Astro 7 + adapter 14 标准写法），并保证 `astro.config.mjs` 的 adapter 设了 `prerenderEnvironment: 'node'`；改完 Retry deployment（见上方 ⚠️ 复盘） |
| 全站 500，日志提到 Node 内建模块 | 缺 nodejs_compat | `wrangler.toml` 已带；确认仓库根目录有该文件 |
| 线上只显示示例文章、后台读不到数据 | 没加 `PUBLIC_*` 构建变量 | 在 Settings → Builds → Build environment variables 补齐后 Retry deployment |
| 文章发布了但页面没有 | 几乎不可能（无构建环节）；先确认 `published=true` | 访问 `/search-index.json` 看文章在不在 |
| 页面 404 但文章确实存在 | slug 输错 / 语言不匹配（`/en/posts/` 只列 en 文章） | 从列表页点进去，别手拼 URL |
| Supabase 临时故障 | 拉取失败会回退示例文章（保留的降级逻辑） | 站点不崩，恢复后自动正常 |
| 构建失败，日志提示「缺少环境变量 PUBLIC_SITE_URL」 | 构建环境变量里没配 `PUBLIC_SITE_URL`（L-07 有意阻断，避免 canonical 静默指向 example.com） | 在 Settings → Builds → Build environment variables 补上 `PUBLIC_SITE_URL=https://你的域名`，再 Retry deployment |
| 构建失败，日志提示「不是合法 URL」 | 值漏了协议头（如写成 `hxlss.cn`） | 改成 `https://hxlss.cn` 形式；结尾斜杠会被自动归一化 |
| 构建失败，日志提示「只支持 http/https」 | 值用了 `ftp://`、`file://` 等协议 | 改为 `https://` |
| sitemap / RSS / canonical 里是错域名 | ① `PUBLIC_SITE_URL` 没改；② **只改了本地 `.env`**——该文件不进仓库，Cloudflare 构建读不到 | 改 Settings → Builds 的**构建环境变量**后 Retry deployment。注意 `.env` 只影响本地 `npm run build`/`astro dev` |
| Worker CPU 超限（免费 10ms/调用） | 超长文 marked 渲染耗时 | 当前文章量级远未触顶；真触顶再加边缘缓存 |
| 加密文章输对密码却刷新后回到密码框 | `UNLOCK_SECRET` 被设为「构建变量」后中途改动，新旧 Worker 实例签名不一致；或浏览器未发送 cookie | 改用 Secret 类型配置（运行时统一读取）；确认协议为 https（本地 http 下 secure cookie 不生效属预期） |
| 后台保存加密文章报「请填写访问密码」 | 勾了启用加密但密码框为空，且该文章此前没设过密码 | 填一个 ≥4 位密码再保存；仅想改提示可留空密码（沿用原密码） |
| 想给动态页加缓存 | 默认无缓存，发布零延迟 | 需要时在响应加 `s-maxage=60`；个人博客当前没必要 |
