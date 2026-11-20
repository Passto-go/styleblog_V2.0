# 多语种个人博客系统（Demo）

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](LICENSE)

> 一个支持**中文 / English**双语、内容存于 Supabase、以 **Cloudflare Workers（SSR）** 运行的个人博客系统演示项目。

---

## 一、项目说明

本仓库是一个轻量级博客引擎演示：文章内容存放于 Supabase，前端以 **SSR（服务端渲染）** 在每次请求时实时查询，因此发布或编辑文章**即时生效，无需重新构建**。代码与内容分离，双语同源，并自带一个独立后台管理界面。

技术栈：**Astro 7.3.8 + @astrojs/cloudflare 14.3.0 + Supabase + Cloudflare Workers**，Node 22。

> 本项目为**演示用途**，仓库内不含任何个人原创文章。未配置 Supabase 时，站点使用 `src/data/sample.js` 中的双语示例文章，预览和构建均可正常进行。

---

## 二、Demo 功能与范围

### 前台
- **双语**：`/`（中文）与 `/en/`（英文）两套路由，导航可切换语言；某语言缺译文时显示提示并保留原文可读。
- **文章**：Markdown 正文、摘要、封面、分类、目录、字数与预计阅读时长、上一篇/下一篇、相关文章。
- **浏览**：归档、分类列表与详情、纯前端站内搜索、各语言独立的 RSS 与站点地图。
- **小部件**：今日寄语（按日轮换）、倒计时（目标日与名称由后台配置）。
- **文章加密**：单篇可设访问密码；未解锁时正文、附件与评论不进入页面 HTML。可开启 teaser 模式，仅露出标题与摘要。
- **体验**：深色模式、响应式布局、文章分享面板。

### 后台（`/admin`，独立页面）
用 Supabase 账号登录，分四个模块：

| 模块 | 能力 |
|---|---|
| **文章管理** | 新建 / 编辑 / 删除文章，多语言版本合并显示；Markdown 实时预览、一键翻译、修改发布时间、设置访问加密 |
| **评论管理** | 审核（通过 / 驳回）、管理员回复、删除；访客可凭令牌管理自己的评论 |
| **分类管理** | 新增 / 重命名 / 合并 / 删除分类，旧链接 301 跳转 |
| **其他功能** | 倒计时、摘要生成规则、头像上传、第三方统计（GA4 / Clarity）开关与 ID、页面水印配置 |

### 评论系统
先审后放（待审核 / 已通过 / 未通过三态）；匿名访客凭随机 `delete_token` 管理自己的评论；管理员回复可多级嵌套。

---

## 三、使用方式

### 本地预览

```bash
git clone <your-fork> styleblog_V2.0
cd styleblog_V2.0
npm install
npm run dev          # 打开 http://localhost:4321
```

未配置 `.env` 时直接使用示例文章，可正常预览与 `npm run build`。

### 配置 Supabase（使用真实数据才需要）

1. 在 Supabase 新建项目，进入 **SQL Editor**，依次执行：
   - `supabase/schema.sql`（建表、RLS、图床桶、评论 RPC）
   - `supabase/categories.sql`（分类注册表）
   - `supabase/posts_author.sql`（文章作者字段）
   - `supabase/encryption.sql`、`encryption_teaser.sql`、`encryption_hash_private.sql`（仅在使用文章加密时按需执行）
2. 在 **Project Settings → API** 复制 `Project URL` 与 `anon public` key。
3. 复制 `.env.example` 为 `.env` 并填入：

```bash
PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJ...你的anon key
PUBLIC_SITE_URL=
```

### 配置环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | 是 | Supabase 项目 URL（不带 `/rest/v1/` 后缀） |
| `PUBLIC_SUPABASE_ANON_KEY` | 是 | Supabase `anon` key，构建时内联进 Worker |
| `PUBLIC_SITE_URL` | 建议 | 站点对外地址，影响 sitemap / RSS / canonical |
| `UNLOCK_SECRET` | 用加密才需 | 解锁签名密钥，`openssl rand -hex 32` 生成；服务端专用 |

翻译接口与解锁密钥建议以 Cloudflare Secret 添加（`TRANSLATE_API_KEY`、`UNLOCK_SECRET`），仅在服务端可见。翻译走 OpenAI 兼容协议，可改 `TRANSLATE_BASE_URL` / `TRANSLATE_MODEL` 换成任意兼容服务。

### 部署

站点为 Astro SSR，构建产物为 Cloudflare Worker，推荐 **Cloudflare Workers + Git 构建**：

1. Cloudflare Dashboard → **Workers & Pages → Create → Connect to Git**，选 **Workers**，指向 `main` 分支。
2. 构建设置：Framework `Astro`，Build `npm run build`，Output `dist`，Deploy `npx wrangler deploy`。
3. 在 **Build environment variables** 填入上表的 `PUBLIC_*` 变量与 `NODE_VERSION=22`；需要的 Secret 在 **Variables and Secrets** 添加。
4. **Save and Deploy** 后得到 `https://<项目名>.workers.dev`；可在 **Custom Domains** 绑定自定义域名。

详细步骤见 `DEPLOY.md`。

---

## 四、注意事项

- **`PUBLIC_*` 是构建期内联变量**：值在 `npm run build` 时写入产物。构建后改 Cloudflare 后台变量不会生效，务必先填真值再构建。
- **发布文章不触发构建**：文章在数据库里，前台 SSR 现查，保存即生效；只有改代码才需重新构建部署。
- **示例数据**：未接 Supabase 时展示的是 `sample.js` 的示例文章，不代表任何真实内容。
- **Node 版本**：需 Node 22（仓库 `.nvmrc` 已锁定）。
- **后台登录依赖 Supabase**：需能连通 Supabase 才能进 `/admin`；读者侧走 Cloudflare 边缘，不受影响。
- **文章加密**：需先执行对应 SQL 并配置 `UNLOCK_SECRET`；未解锁的正文与附件不会输出到页面。
- **第三方统计**：GA4 / Clarity 的 ID 与开关在后台「其他功能」填写，仅在访客同意后加载；Cloudflare Web Analytics 由平台边缘注入，不在此列。

---

## 五、许可证

源代码采用 [CC BY-NC-SA 4.0](LICENSE)（署名—非商业性使用—相同方式共享 4.0 国际）。该许可含非商业限制，属「源码公开」，非 OSI 定义的开源许可。CC 许可一经发布不可撤销。

---

> 由 **Astro + Supabase + Cloudflare** 构建。
