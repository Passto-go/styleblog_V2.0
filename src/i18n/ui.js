// 双语（zh / en / ja）文案与路由辅助
export const defaultLang = 'zh';

// switchLabel = 在“另一种语言”的页面里，这个链接显示的文案（即“切过去”的目标语言）
export const languages = {
  zh: { label: '中文', switchLabel: '中文', htmlLang: 'zh-CN' },
  en: { label: 'English', switchLabel: 'EN', htmlLang: 'en' },
  ja: { label: '日本語', switchLabel: '日本語', htmlLang: 'ja' },
};

export const ui = {
  zh: {
    'site.name': '吾道一以贯之',
    'site.tagline': '记录跑步、生活，以及一些零散的观察和想法。',
    'site.description': '一个普通人的个人博客，记录生活随笔、跑步与日常观察。',

    'nav.home': '主页',
    'nav.categories': '分类',
    'nav.about': '关于',
    'nav.archive': '归档',
    'nav.login': '登录',

    'icon.rss': 'RSS 订阅',
    'icon.sitemap': '站点地图',
    'icon.search': '搜索',
    'icon.login': '登录',
    'icon.theme': '切换日间 / 夜间',

    'home.hero.title': '生活随笔',
    'home.readMore': '阅读最新文章',
    'home.latest': '最新随笔',
    'home.empty': '还没有文章。',

    'widget.quote': '今日寄语',
    'widget.countdown': '倒计时',
    'widget.countdownTo': '距 {label}',

    'profile.posts': '文章',
    'profile.categories': '分类',
    'profile.comments': '评论',
    'profile.visits': '访问',

    'about.title': '关于',
    'about.lead': '你好，我是老一贯。',
    'about.body':
      '这里记录我的日常：跑步、生活，以及一些零散的观察和想法。\n\n不追热点，不刻意更新，只写当下真正想写的东西。文章以中文为主，也提供英文/日语版本，方便海外的朋友阅读。\n\n## **为什么网站名称叫“吾道一以贯之”？**\n\n出自《论语·里仁》——子曰：“参乎！吾道一以贯之。”曾子曰：“唯。”孔子对曾参说：我的道，用一个东西贯穿始终；曾参答：是。后来曾子解释为“忠恕而已矣”。\n\n所以，我认为“一如既往”这个词用来形容是比较贴切的。当然，这看起来有些抽象。\n\n## **到底是什么？**\n\n一个普通人的长期主义；读书、思考、写下去；不追热点，只写主线；忠恕而已；做自己。\n\n## **内容有什么？**\n\n读书笔记、思想随笔、个人成长、长期主义以及自己摸索学习的心路历程。\n\n## **有关我自己：**\n\n男性，90后，已成为**中年**，大学本科经贸类专业，不过并没有在这个行业深耕。IT相关并不是我的优势，甚至对我来说一无所知，但我有很大的兴趣。\n\n2018年一个偶然的机会，我接触到了 [GitHub](https://github.com)，于是新世界的大门被打开了。我在 GitHub 上发现了很多开源的优秀项目，那是我第一次认为自身能力需要提升。对于我这种 I 人而言，更喜欢独自在自己的世界里遨游。自从30岁之后，便不断在 INTJ-A 和 ENTJ-A 反复切换。但这并不影响什么。\n\n后来当我第一次在 GitHub 上找到一个比较适合自己的博客项目，我跟着 README 描述，在本地电脑一步一步操作，最终成功复现项目并在本地运行，非常激动。因为在这个过程中 Linux 语言，DOS 命令，以及错误日志，对于我来讲无疑是天书。解决问题虽然花费了不少时间，但过程中增长了不少知识。\n\n于是当我第一次在 [阿里云](https://aliyun.com) 自购域名和服务器，薅着免费的云存储和 CDN，成功在服务器上完成了部署，并且实现了 IP+端口访问的时候，我觉得有极大兴趣继续坚持下去。因监管需要，在完成工信部 ICP 和公安网安双备案之后，这个网站终于成功上云。因成本原因，在5年后，我关闭了网站，注销了备案。而此刻（2026年10月），在 AI 发展日趋成熟的今天，我也再次借助 AI 的力量，再次完成了属于自己的个人网站。\n\n传统的个人网站主要是 [WordPress](https://wordpress.org/) 或者 [Hexo](https://hexo.io/) 作为老大哥，但这些对我来讲，并不契合我的需求。项目代码放在 GitHub 上，用 [Cloudflare](https://www.cloudflare.com/) 托管，加上 [Supabase](https://supabase.com/) 免费数据库，前端是一个静态的网页，后端管理页面可以直接新建文章发布，对于我来说是最方便的。基于此，借助 AI 也成功搭建。对于一个访问量级不庞大的个人网站而言，这些免费的均已足够。\n\n**一如既往，一以贯之。**',

    'categories.title': '分类',
    'categories.intro': '按主题浏览全部文章。',
    'categories.count': '共 {n} 篇',
    'categories.empty': '暂无分类。',

    'archive.title': '归档',
    'archive.intro': '按时间回溯所有文章。',
    'archive.count': '共 {n} 篇文章',
    'archive.empty': '暂无文章。',
    'archive.uncategorized': '未分类',

    'search.title': '搜索',
    'search.intro': '输入关键词，检索站内全部文章。',
    'search.placeholder': '输入关键词…',
    'search.tip': '输入关键词开始搜索。',
    'search.noResults': '没有找到相关文章。',
    'search.results': '找到 {n} 篇相关文章',
    'search.reading': '正在加载…',

    'post.back': '← 返回首页',
    'post.filed': '分类：',
    'post.toc': '目录',
    'post.hot': '热门文章',
    'post.catDir': '分类目录',
    'post.words': '约 {n} 字',
    'post.readTime': '约 {n} 分钟读完',
    'post.prev': '← 上一篇',
    'post.next': '下一篇 →',
    'post.navLabel': '上一篇 / 下一篇',

    'share.title': '分享这篇文章',
    'share.copy': '复制链接',
    'share.copied': '已复制',
    'share.copyFail': '复制失败，请手动复制',
    'share.email': '邮件',
    'share.wechat': '微信',
    'share.wechatHint': '打开微信扫一扫，分享这篇文章',
    'share.native': '系统分享',
    'share.weibo': '微博',
    'share.qq': 'QQ',
    'share.x': 'X',
    'share.telegram': 'Telegram',
    'share.whatsapp': 'WhatsApp',
    'share.facebook': 'Facebook',

    'post.comments': '评论',
    'post.commentName': '昵称（必填）',
    'post.commentEmail': '邮箱（必填）',
    'post.commentPlaceholder': '说点什么吧…（理性发言，友善交流）',
    'post.commentSubmit': '发表评论',
    'post.commentSending': '发送中…',
    'post.commentEmpty': '还没有评论，来抢沙发吧。',
    'post.commentDisabled': '评论功能未启用（站点未配置 Supabase）。',
    'post.commentError': '评论发送失败，请稍后重试。',
    'post.commentRequired': '评论内容不能为空哦。',
    'post.commentNameRequired': '昵称不能为空。',
    'post.commentEmailInvalid': '请输入有效的邮箱地址。',
    'post.commentLoadFailed': '评论加载失败',
    'post.commentRetry': '重试',

    'post.commentPending': '评论已提交，审核通过后会公开展示。',
    'post.commentMyTitle': '我的评论',
    'post.commentMineHint': '仅你本人可见与管理自己提交的评论。',
    'post.commentStatusPending': '待审核',
    'post.commentStatusApproved': '已通过',
    'post.commentStatusRejected': '未通过',
    'post.commentStatusRejectedNote': '该评论未通过审核，已隐藏。',
    'post.commentDelete': '删除',
    'post.commentDeleteConfirm': '确定删除这条评论吗？此操作不可恢复。',
    'post.commentDeleted': '已删除',
    'post.commentTokenMissing': '注意：未能保存删除凭证，日后可能无法删除此评论。',

    // 无译文提示（文章页横幅）：当前语言缺已发布译文时说明现状
    'article.missingEn': '本文暂无英文版。',
    'article.missingEnJa': '本文暂无英文版与日文版。',
    'article.missingJa': '本文暂无日文版。',
    'article.missingJaEn': '本文暂无日文版与英文版。',
    'article.readJa': '阅读日文版 →',
    'article.readEn': '阅读英文版 →',
    'article.showingZh': '当前展示的是中文原文。',
    'article.showingEn': '当前展示的是英文版。',

    'footer.copyright': 'Copyright © {year} 老一贯',
    'footer.license': 'Licensed under CC BY-NC 4.0',
    'footer.powered': 'Powered by Astro',
    'footer.hosted': 'Hosted by Cloudflare',

    '404.title': '页面不存在',
    '404.desc': '你访问的页面可能已被移除或从未存在。',
    '404.back': '返回首页',
  },
  en: {
    'site.name': '吾道一以贯之',
    'site.tagline': 'Notes on running, life, and scattered thoughts.',
    'site.description': 'A personal blog about everyday life, running, and quiet observations.',

    'nav.home': 'Home',
    'nav.categories': 'Categories',
    'nav.about': 'About',
    'nav.archive': 'Archive',
    'nav.login': 'Login',

    'icon.rss': 'RSS feed',
    'icon.sitemap': 'Sitemap',
    'icon.search': 'Search',
    'icon.login': 'Login',
    'icon.theme': 'Toggle light / dark',

    'home.hero.title': 'Life Notes',
    'home.readMore': 'Read the latest',
    'home.latest': 'Latest posts',
    'home.empty': 'No posts yet.',

    'widget.quote': "Today's Note",
    'widget.countdown': 'Countdown',
    'widget.countdownTo': 'To {label}',

    'profile.posts': 'Posts',
    'profile.categories': 'Cats',
    'profile.comments': 'Comments',
    'profile.visits': 'Views',

    'about.title': 'About',
    'about.lead': "Hi, I'm 老一贯.",
    'about.body':
      'This is where I keep my everyday notes: running, life, and scattered observations and thoughts.\n\nNo chasing trends, no forced schedule — I only write what I actually want to write. Posts are mainly in Chinese, with English and Japanese versions for friends abroad.\n\n## **Why is the site called “吾道一以贯之” (One Thread Through It All)?**\n\nFrom the Analects, Book IV (Li Ren) — Confucius said, “Shen! My way is bound together by one single thread.” Master Zeng replied, “Yes.” Confucius told Zeng Shen that his way runs through everything by means of one thing; Zeng answered that it was so. Zeng later explained it as “loyalty and reciprocity (zhong shu), that is all.”\n\nSo I think the phrase “一如既往” (yī rú jì wǎng — just as always) describes it rather aptly. Of course, it still sounds a little abstract.\n\n## **So what is it, really?**\n\nAn ordinary person’s long-termism: read, think, keep writing; don’t chase trends, just follow the main thread; loyalty and reciprocity; be yourself.\n\n## **What’s in here?**\n\nReading notes, reflective essays, personal growth, long-termism, and the winding record of figuring things out on my own.\n\n## **About me:**\n\nMale, born in the ’90s, now middle-aged. I majored in economics and trade at university, but never went deep into that field. IT was never my strength — I even knew nothing about it at all — but I have a deep interest in it.\n\nIn 2018, by a chance encounter, I came across [GitHub](https://github.com), and a door to a new world swung open. On GitHub I found many excellent open-source projects — the first time I felt my own abilities needed to improve. As an introvert (an “I” person), I prefer roaming alone in my own world. Since turning 30, I have kept switching back and forth between INTJ-A and ENTJ-A. None of it really matters, though.\n\nLater, when I first found a blog project on GitHub that suited me, I followed the README, step by step on my local machine, and finally got it reproduced and running locally — I was thrilled. In the process, the Linux shell, DOS commands, and error logs were all gibberish to me. Solving problems took a lot of time, but I picked up plenty of knowledge along the way.\n\nSo when I first bought a domain and server of my own from [Alibaba Cloud](https://aliyun.com), scraping by on free cloud storage and a CDN, and finally completed the deployment and got the site accessible via IP + port, I felt a strong urge to keep at it. As required by regulation, after completing the dual filings — the MIIT ICP filing and the public security network security filing — the site finally went live on the cloud. Because of the costs, five years later I shut the site down and cancelled the filings. And now, in October 2026, with AI maturing day by day, I have once again built a personal website of my own with the help of AI.\n\nTraditional personal websites are mainly built on [WordPress](https://wordpress.org/) or [Hexo](https://hexo.io/) as the old guards, but neither really fits my needs. The code lives on GitHub, hosted by [Cloudflare](https://www.cloudflare.com/), plus a free database from [Supabase](https://supabase.com/). The frontend is a static page, and the backend admin page lets me create and publish posts directly — the most convenient setup for me. On that basis, I built it successfully with AI’s help. For a personal site without massive traffic, all these free tiers are more than enough.\n\n**As always. One thread through it all.**',

    'categories.title': 'Categories',
    'categories.intro': 'Browse all posts by topic.',
    'categories.count': '{n} posts',
    'categories.empty': 'No categories yet.',

    'archive.title': 'Archive',
    'archive.intro': 'All posts, in reverse chronological order.',
    'archive.count': '{n} posts in total',
    'archive.empty': 'No posts yet.',
    'archive.uncategorized': 'Uncategorized',

    'search.title': 'Search',
    'search.intro': 'Search every post on this site.',
    'search.placeholder': 'Type a keyword…',
    'search.tip': 'Type a keyword to start searching.',
    'search.noResults': 'No matching posts found.',
    'search.results': '{n} posts found',
    'search.reading': 'Loading…',

    'post.back': '← Back to home',
    'post.filed': 'Filed under:',
    'post.toc': 'Contents',
    'post.hot': 'Popular',
    'post.catDir': 'Categories',
    'post.words': '~{n} words',
    'post.readTime': '~{n} min read',
    'post.prev': '← Previous',
    'post.next': 'Next →',
    'post.navLabel': 'Previous / Next post',

    'share.title': 'Share this post',
    'share.copy': 'Copy link',
    'share.copied': 'Copied',
    'share.copyFail': 'Copy failed — please copy manually',
    'share.email': 'Email',
    'share.wechat': 'WeChat',
    'share.wechatHint': 'Scan with WeChat to share this post',
    'share.native': 'Share',
    'share.weibo': 'Weibo',
    'share.qq': 'QQ',
    'share.x': 'X',
    'share.telegram': 'Telegram',
    'share.whatsapp': 'WhatsApp',
    'share.facebook': 'Facebook',

    'post.comments': 'Comments',
    'post.commentName': 'Name (required)',
    'post.commentEmail': 'Email (required)',
    'post.commentPlaceholder': 'Say something… (be kind, be civil)',
    'post.commentSubmit': 'Post comment',
    'post.commentSending': 'Sending…',
    'post.commentEmpty': 'No comments yet — be the first.',
    'post.commentDisabled': 'Comments are disabled (Supabase not configured).',
    'post.commentError': 'Failed to post. Please try again later.',
    'post.commentRequired': 'Comment cannot be empty.',
    'post.commentNameRequired': 'Name is required.',
    'post.commentEmailInvalid': 'Please enter a valid email address.',
    'post.commentLoadFailed': 'Failed to load comments',
    'post.commentRetry': 'Retry',

    'post.commentPending': 'Comment submitted. It will appear after moderation.',
    'post.commentMyTitle': 'My comments',
    'post.commentMineHint': 'Only you can see and manage the comments you submitted.',
    'post.commentStatusPending': 'Pending',
    'post.commentStatusApproved': 'Approved',
    'post.commentStatusRejected': 'Rejected',
    'post.commentStatusRejectedNote': 'This comment was rejected and is hidden.',
    'post.commentDelete': 'Delete',
    'post.commentDeleteConfirm': 'Delete this comment? This cannot be undone.',
    'post.commentDeleted': 'Deleted',
    'post.commentTokenMissing': 'Note: the deletion token was not saved — you may be unable to delete this comment later.',

    // Translation notice (article banner): shown when the current language has no published version
    'article.missingEn': 'This article is not yet available in English.',
    'article.missingEnJa': 'This article is not yet available in English or Japanese.',
    'article.missingJa': 'This article is not yet available in Japanese.',
    'article.missingJaEn': 'This article is not yet available in Japanese or English.',
    'article.readJa': 'Read the Japanese version →',
    'article.readEn': 'Read the English version →',
    'article.showingZh': 'You are reading the Chinese original.',
    'article.showingEn': 'You are reading the English version.',

    'footer.copyright': 'Copyright © {year} 老一贯',
    'footer.license': 'Licensed under CC BY-NC 4.0',
    'footer.powered': 'Powered by Astro',
    'footer.hosted': 'Hosted by Cloudflare',

    '404.title': 'Page not found',
    '404.desc': 'The page you requested may have been removed or never existed.',
    '404.back': 'Back to home',
  },
  ja: {
    'site.name': '吾道一以贯之',
    'site.tagline': 'ランニング、暮らし、そしてちょっとした想いの記録。',
    'site.description': '普通の人の個人ブログ。日常の雑記、ランニング、日々の気づきを綴る。',

    'nav.home': 'ホーム',
    'nav.categories': 'カテゴリ',
    'nav.about': 'About',
    'nav.archive': 'アーカイブ',
    'nav.login': 'ログイン',

    'icon.rss': 'RSS 購読',
    'icon.sitemap': 'サイトマップ',
    'icon.search': '検索',
    'icon.login': 'ログイン',
    'icon.theme': 'ライト / ダーク切替',

    'home.hero.title': '日常の雑記',
    'home.readMore': '最新記事を読む',
    'home.latest': '最新記事',
    'home.empty': 'まだ記事がありません。',

    'widget.quote': '今日のことば',
    'widget.countdown': 'カウントダウン',
    'widget.countdownTo': '{label}まで',

    'profile.posts': '記事',
    'profile.categories': 'カテゴリ',
    'profile.comments': 'コメント',
    'profile.visits': '閲覧',

    'about.title': 'About',
    'about.lead': 'こんにちは、老一贯です。',
    'about.body':
      'ここには僕の日常——ランニング、暮らし、ちょっとした観察や想い——を綴ります。\n\n流行は追わず、無理に更新もしません。今ほんとうに書きたいことだけを書く。記事は中国語が中心で、海外の友だちのために英語版と日本語版も用意しています。\n\n## **なぜサイト名は「吾道一以貫之（吾が道は一以て之を貫く）」なのか**\n\n『論語』里仁篇より——子曰く、「参や、吾が道は一以て之を貫く。」曾子曰く、「唯。」孔子は曾参に、自分の道はひとつのものですべてを貫いている、と語った。曾子はそれに応えた。のちに曾子はそれを「忠恕のみ」と解した。\n\nだから、「一如既往（いつもの通り、昔からずっと変わらず）」という言葉をあてるのは、なかなかふさわしいと思う。もちろん、まだ少し抽象的ではあるけれど。\n\n## **結局、何なのか**\n\n一人の普通の人の長期主義。読み、考え、書き続ける。流行は追わず、ただ本筋を書く。忠恕のみ。自分らしくあること。\n\n## **何が書いてあるのか**\n\n読書ノート、思想エッセイ、個人の成長、長期主義、そして自分で手探りに学んでいく心の軌跡。\n\n## **僕について：**\n\n男性、90年代生まれ、今や中年に差し掛かった。大学では経済貿易系の学部に通っていたが、この業界を深く究めたわけではない。ITは僕の得意分野ではなく、それどころか何ひとつ知らなかったが、とても大きな興味がある。\n\n2018年のある偶然のきっかけで、[GitHub](https://github.com) に触れ、新世界への扉が開いた。GitHub 上には優れたオープンソースプロジェクトがたくさんあり、自分の能力を上げる必要があると初めて感じた。僕のような I 人間（内向型）にとっては、自分の世界でひとり漂う方が好きだ。30歳を過ぎてからは、INTJ-A と ENTJ-A のあいだを往復している。だが、それが何かに影響するわけではない。\n\nその後、GitHub で自分に合いそうなブログプロジェクトを初めて見つけたとき、README の手順に従い、ローカルのパソコンで一歩ずつ操作し、ついにプロジェクトを再現してローカルで動かすことに成功して、とても興奮した。この過程で、Linux のシェル、DOS コマンド、エラーログは、僕にとってまさに天書だった。問題解決には時間がかかったが、その分たくさんの知識が増えた。\n\nそこで、[阿里云](https://aliyun.com)（Alibaba Cloud）で初めて自前のドメインとサーバーを購入し、無料のクラウドストレージと CDN を利用しながら、サーバー上へのデプロイを完了し、IP+ポートでのアクセスを実現したとき、この活動を続けていきたいという強い思いを抱いた。規制の要件に従い、工業情報化部の ICP 备案と公安の網安备案を完了したのち、このサイトはついにクラウド上で公開された。コストの都合により、5年後にサイトを閉じ、备案を注销した。そして今（2026年10月）、AI が日ごとに成熟するなかで、再び AI の力で自分だけの個人サイトを完成させた。\n\n従来の個人サイトは主に [WordPress](https://wordpress.org/) や [Hexo](https://hexo.io/) が長老として君臨しているが、僕のニーズには合わない。コードは GitHub に置き、[Cloudflare](https://www.cloudflare.com/) でホストし、[Supabase](https://supabase.com/) の無料データベースを加える。フロントエンドは静的ページで、バックエンドの管理画面から直接記事を作成・公開できる——僕にとって最も便利な構成だ。これを基に、AI の助けも借りて無事に構築できた。アクセス規模の大きくない個人サイトにとって、これらの無料枠は十分すぎる。\n\n**いつもの通り。吾が道は一以て之を貫く。**',

    'categories.title': 'カテゴリ',
    'categories.intro': 'テーマ別にすべての記事を眺める。',
    'categories.count': '全 {n} 件',
    'categories.empty': 'まだカテゴリがありません。',

    'archive.title': 'アーカイブ',
    'archive.intro': 'これまでのすべての記事を時系列に。',
    'archive.count': '全 {n} 件の記事',
    'archive.empty': 'まだ記事がありません。',
    'archive.uncategorized': '未分類',

    'search.title': '検索',
    'search.intro': 'キーワードを入力して、サイト内の記事を検索。',
    'search.placeholder': 'キーワードを入力…',
    'search.tip': 'キーワードを入力して検索。',
    'search.noResults': '該当する記事が見つかりませんでした。',
    'search.results': '{n} 件の記事が見つかりました',
    'search.reading': '読み込み中…',

    'post.back': '← ホームへ',
    'post.filed': 'カテゴリ：',
    'post.toc': '目次',
    'post.hot': '人気記事',
    'post.catDir': 'カテゴリ',
    'post.words': '約 {n} 文字',
    'post.readTime': '約 {n} 分で読めます',
    'post.prev': '← 前の記事',
    'post.next': '次の記事 →',
    'post.navLabel': '前の記事 / 次の記事',

    'share.title': 'この記事をシェア',
    'share.copy': 'リンクをコピー',
    'share.copied': 'コピーしました',
    'share.copyFail': 'コピーに失敗しました',
    'share.email': 'メール',
    'share.wechat': '微信',
    'share.wechatHint': 'WeChat でスキャンしてこの記事をシェア',
    'share.native': 'シェア',
    'share.weibo': '微博',
    'share.qq': 'QQ',
    'share.x': 'X',
    'share.telegram': 'Telegram',
    'share.whatsapp': 'WhatsApp',
    'share.facebook': 'Facebook',

    'post.comments': 'コメント',
    'post.commentName': 'ニックネーム（必須）',
    'post.commentEmail': 'メールアドレス（必須）',
    'post.commentPlaceholder': '何か書いてください…（冷静に、丁寧に）',
    'post.commentSubmit': 'コメントする',
    'post.commentSending': '送信中…',
    'post.commentEmpty': 'まだコメントはありません。最初の一本を。',
    'post.commentDisabled': 'コメントは無効です（Supabase が未設定）。',
    'post.commentError': '送信に失敗しました。後ほどお試しください。',
    'post.commentRequired': 'コメントを入力してください。',
    'post.commentNameRequired': 'ニックネームは必須です。',
    'post.commentEmailInvalid': '有効なメールアドレスを入力してください。',
    'post.commentLoadFailed': 'コメントの読み込みに失敗しました',
    'post.commentRetry': '再試行',

    'post.commentPending': 'コメントを送信しました。承認後に公開されます。',
    'post.commentMyTitle': '自分のコメント',
    'post.commentMineHint': '自分が投稿したコメントだけが表示・管理できます。',
    'post.commentStatusPending': '承認待ち',
    'post.commentStatusApproved': '承認済み',
    'post.commentStatusRejected': '非公開',
    'post.commentStatusRejectedNote': 'このコメントは非承認となり非表示です。',
    'post.commentDelete': '削除',
    'post.commentDeleteConfirm': 'このコメントを削除しますか？元に戻せません。',
    'post.commentDeleted': '削除しました',
    'post.commentTokenMissing': '注意：削除トークンを保存できませんでした。後からこのコメントを削除できない可能性があります。',

    // 翻訳なし告知（記事ページのバナー）：現在の言語に公開済み訳がない場合に现状を説明
    'article.missingEn': 'この記事にはまだ英語版がありません。',
    'article.missingEnJa': 'この記事にはまだ英語版と日本語版がありません。',
    'article.missingJa': 'この記事にはまだ日本語版がありません。',
    'article.missingJaEn': 'この記事にはまだ日本語版と英語版がありません。',
    'article.readJa': '日本語版を読む →',
    'article.readEn': '英語版を読む →',
    'article.showingZh': '現在中国語版を表示しています。',
    'article.showingEn': '現在英語版を表示しています。',

    'footer.copyright': 'Copyright © {year} 老一贯',
    'footer.license': 'Licensed under CC BY-NC 4.0',
    'footer.powered': 'Powered by Astro',
    'footer.hosted': 'Hosted by Cloudflare',

    '404.title': 'ページが見つかりません',
    '404.desc': 'お探しのページは削除されたか、存在しません。',
    '404.back': 'ホームへ',
  },
};

export function getLangFromUrl(url) {
  const seg = url.pathname.split('/').filter(Boolean)[0];
  return seg === 'en' || seg === 'ja' ? seg : defaultLang;
}

export function useTranslations(lang) {
  const dict = ui[lang] || ui[defaultLang];
  const fallback = ui[defaultLang];
  return function t(key, vars) {
    let str = dict[key] ?? fallback[key] ?? key;
    if (vars) {
      for (const k of Object.keys(vars)) str = str.replaceAll(`{${k}}`, String(vars[k]));
    }
    return str;
  };
}

// 把「默认语言」的路径（如 '/about'、'/posts/hello'）转成目标语言路径
export function localizePath(path, lang) {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (lang === defaultLang) return clean;
  return clean === '/' ? `/${lang}/` : `/${lang}${clean}`;
}

export function altLang(lang) {
  return lang === 'zh' ? 'en' : 'zh';
}

// 从当前 pathname 生成「切换到目标语言」的链接（用于导航里的语言菜单）
export function switchLangPath(pathname, targetLang) {
  const nonDefault = Object.keys(languages).filter((l) => l !== defaultLang);
  let p = pathname.replace(new RegExp(`^/(${nonDefault.join('|')})(?=/|$)`), '');
  if (p === '') p = '/';
  return localizePath(p, targetLang);
}
