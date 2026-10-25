// 双语（zh / en）文案与路由辅助
// 默认语言 = 中文（无前缀驻留根路径，如 /about）；英文迁入 /en/（如 /en/about）。
// 见 src/pages 目录结构：根 = 中文，en/ = 英文。
export const defaultLang = 'zh';

// switchLabel = 在“另一种语言”的页面里，这个链接显示的文案（即“切过去”的目标语言）
export const languages = {
  zh: { label: '中文', switchLabel: '中文', htmlLang: 'zh-CN' },
  en: { label: 'English', switchLabel: 'EN', htmlLang: 'en' },
};

export const ui = {
  zh: {
    'site.name': '吾道一以贯之',
    'site.tagline': '记录一个普通人视角下的世界。',
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
    'widget.countdownTz': '北京时间（UTC+8）',

    'profile.posts': '文章',
    'profile.categories': '分类',
    'profile.comments': '评论',
    'profile.visits': '访问',

    'about.title': '关于',
    'about.lead': '你好，我是老一贯。',
    'about.body':
      '这里记录我的日常：跑步、生活，以及一些零散的观察和想法。\n\n不追热点，不刻意更新，只写当下真正想写的东西。文章以中文为主，也提供英文版本，方便海外的朋友阅读。\n\n## **为什么网站名称叫“吾道一以贯之”？**\n\n出自《论语·里仁》——子曰：“参乎！吾道一以贯之。”曾子曰：“唯。”孔子对曾参说：我的道，用一个东西贯穿始终；曾参答：是。后来曾子解释为“忠恕而已矣”。\n\n所以，我认为“一如既往”这个词用来形容是比较贴切的。当然，这看起来有些抽象。\n\n## **到底是什么？**\n\n一个普通人的长期主义；读书、思考、写下去；不追热点，只写主线；忠恕而已；做自己。\n\n## **内容有什么？**\n\n读书笔记、思想随笔、个人成长、长期主义以及自己摸索学习的心路历程。\n\n## **有关我自己：**\n\n男性，90后，已成为中年，大学本科经贸类专业，IT相关并不是我的优势，甚至对我来说一无所知，但我有很大的兴趣。\n\n2015年一个偶然的机会，我接触到了 [GitHub](https://github.com/)，于是新世界的大门被打开了。我在 GitHub 上发现了很多开源的优秀项目，那是我第一次认为自身能力需要提升。对于我这种 I 人而言，更喜欢独自在自己的世界里遨游。自从30岁之后，便不断在 INTJ-A 和 ENTJ-A 反复切换。但这并不影响什么。\n\n后来当我第一次在 GitHub 上找到一个比较适合自己的博客项目，我跟着 README 描述，在本地电脑一步一步操作，最终成功复现项目并在本地运行，非常激动。因为在这个过程中 Linux 语言，DOS 命令，以及错误日志，对于我来讲无疑是天书。解决问题虽然花费了不少时间，但过程中增长了不少知识。\n\n后面当我第一次在阿里云自购域名和服务器，薅着免费的云存储和 CDN，成功在服务器上完成了部署，并且实现了 IP+端口访问的时候，我觉得有极大兴趣继续坚持下去。因监管需要，在完成工信部 ICP 和公安网安双备案之后，这个网站终于成功上云。因成本原因，在5年后，我关闭了网站，注销了备案。而此刻（2026年10月），在 AI 发展日趋成熟的今天，我也再次借助 AI 的力量，再次完成了属于自己的个人网站。\n\n传统的个人网站主要是 [WordPress](https://wordpress.org/) 或者 [Hexo](https://hexo.io/zh-cn/) 作为老大哥，但这些对我来讲，并不契合我的需求。项目代码放在 GitHub 上，用 [Cloudflare](https://www.cloudflare.com/) 托管，加上 [Supabase](https://supabase.com/)免费数据库，前端是一个静态的网页，后端管理页面可以直接新建文章发布，对于我来说是最方便的。基于此，借助 AI 也成功搭建。对于一个访问量级不庞大的个人网站而言，这些免费的均已足够。\n\n**一如既往，一以贯之。**',

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
    'post.attachments': '附件',

    // 加密文章解锁
    'post.locked': '此文章已加密',
    'post.enterPassword': '请输入访问密码以阅读全文',
    'post.passwordPlaceholder': '访问密码',
    'post.unlock': '解锁',
    'post.unlockWrong': '密码错误，请重试',
    'post.unlockNetErr': '网络错误，请稍后重试',

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
    'article.readEn': '阅读英文版 →',
    'article.showingZh': '当前展示的是中文原文。',
    'article.showingEn': '当前展示的是英文版。',

    'footer.copyright': 'Copyright © {year} 老一贯',
    'footer.license': '许可声明',
    'footer.privacy': '隐私说明',
    // {link} 是隐私说明链接的占位符，由 ConsentBanner.astro 替换为 <a>，
    // 保证链接落在句子内部（详见 <a>隐私说明</a>。），而不是句外再挂一个重复入口。
    'consent.text': '本网站使用 Google Analytics 来统计访问量、访客互动与回访情况。若你选择接受，分析类 Cookie 将存储在你的浏览器中；若选择拒绝，不会影响你正常浏览网站。详见{link}。',
    'consent.more': '隐私说明',
    'consent.accept': '同意',
    'consent.reject': '拒绝',
    'footer.powered': 'Powered by Astro',
    'footer.hosted': 'Hosted by Cloudflare',
    'footer.clock': '北京时间 · UTC+8',

    '404.title': '页面不存在',
    '404.desc': '你访问的页面可能已被移除或从未存在。',
    '404.back': '返回首页',
  },
  en: {
    'site.name': 'The Way, One Thread',
    'site.tagline': "A record of the world through an ordinary person's eyes.",
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
    'widget.countdownTz': 'Beijing time (UTC+8)',

    'profile.posts': 'Posts',
    'profile.categories': 'Cats',
    'profile.comments': 'Comments',
    'profile.visits': 'Views',

    'about.title': 'About',
    'about.lead': 'Hello, I’m Lao Yiguan.',
    'about.body':
      'This is where I keep a record of my everyday life: running, living, and the occasional observation or passing thought.\n\nNo chasing hot topics. No posting just for the sake of keeping things updated. I write about what I genuinely want to write about, when I feel I have something to say.\n\nMost of my posts are in Chinese, with English versions available for friends and readers overseas.\n\n## **Why This Name?**\n\n“吾道一以贯之” comes from the Analects, Book IV, Li Ren.\n\nConfucius once said to his disciple Zengzi, “Shen, there is one thread that runs through my teachings.” Zengzi replied, “Yes.”\n\nLater, when other disciples asked what Confucius had meant, Zengzi explained it in two words: zhong and shu — doing one’s best and being considerate of others, extending to them the same consideration one would wish for oneself.\n\nThe idea of a single thread running through everything has stayed with me. It suggests that beneath the many things we learn, experience, and do, there can be a principle that holds them together.\n\nThat is what I hope this name conveys. To me, **一如既往** — staying true to the same path over time — comes close to capturing the spirit of this site. It may sound a little abstract at first, but the idea is simple enough: keep learning, keep thinking, and keep writing, without losing sight of what matters.\n\n## **What This Site Is About**\n\n**An ordinary person’s commitment to the long game.**\n\n**Read, think, and keep writing.**\n\n**No chasing hot topics — stay on the main thread.**\n\n**Do your best, and be considerate of others.**\n\n**Be yourself.**\n\nThese are not grand principles, nor are they rules I have mastered. They are reminders to myself — ideas I want to keep returning to as life moves along.\n\nHere, you’ll find reading notes, personal essays, reflections on life and personal growth, thoughts on long-term thinking, and occasional accounts of things I’ve taught myself along the way.\n\nSome pieces may be little more than fragments of thought. Others may grow out of a question that has stayed with me for a long time. I don’t intend to cover everything or write about whatever happens to be trending. I’d rather follow the questions that genuinely interest me and see where they lead.\n\n## **A Little About Me**\n\nI’m a man born in the 1990s, already beginning to feel middle-aged.\n\nI have a bachelor’s degree in economics and trade. IT has never been my strong suit, and I started out knowing very little about it. But my interest in technology is genuine, and it has stayed with me for years.\n\nI’m introverted by nature. In MBTI terms, I’ve found myself switching between INTJ-A and ENTJ-A since turning thirty. Apparently, even my personality type can’t quite make up its mind. In the end, though, labels are just labels. They can be useful for reflection, but they don’t tell the whole story of who we are.\n\n## **How This Website Came to Be**\n\nIn 2015, I stumbled across GitHub by chance, and a whole new world opened up.\n\nI discovered open-source projects built and shared by people from all over the world. Seeing what they had created made me want to learn more and try things for myself. I began to wonder whether I, too, could build something of my own.\n\nEventually, I came across a GitHub project for creating a personal blog. I followed the README step by step, trying to get it running. At the time, Linux commands, DOS commands, and error logs were all Greek to me. I often had no idea what had gone wrong, let alone how to fix it. Still, I kept trying, searching for answers and figuring things out as I went.\n\nOnce I had a working site, I bought a domain name and a server from Alibaba Cloud. I pieced the setup together using free cloud storage and CDN services. Eventually, I could access my website through its IP address and port number. It wasn’t much to look at, perhaps, but getting it to work felt like a small personal victory.\n\nThere was another hurdle before I could make the site fully accessible: China’s regulatory filing requirements. I completed both the ICP filing with the Ministry of Industry and Information Technology (MIIT) and the public security network-security filing. Only then was the site ready to go fully live.\n\nI kept that website running for five years. Eventually, the ongoing costs no longer seemed worthwhile, so I shut it down and cancelled the associated filings.\n\nBut the interest never really went away.\n\nIn October 2026, I decided to build a personal website again, this time with AI as a helping hand. The tools had changed, and so had I. What once required me to puzzle over commands and error messages could now be approached in a very different way.\n\nFor this new version, the code is hosted on GitHub, the website is hosted on Cloudflare, and Supabase provides the database. The frontend is a static site, with an admin dashboard that lets me write and publish articles directly. It’s the setup that works best for me. With AI helping along the way, I was able to put the pieces together without needing to become a professional developer first.\n\nFor a small personal website without massive traffic, the free tiers of these services are more than enough.\n\nLooking back, the technology is only part of the story. What matters more to me is that, after all these years, I’m still curious enough to learn something new and stubborn enough to see it through.\n\nThe tools may change. The way I do things may change. But the thread connecting it all remains much the same: learning, thinking, and making something of my own.\n\nThat’s what this little corner of the internet is for.\n\nWelcome, and thanks for stopping by.\n\n**As always, one thread through it all.**',

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
    'post.attachments': 'Attachments',

    // Encrypted post unlock
    'post.locked': 'This post is encrypted',
    'post.enterPassword': 'Enter the access password to read the full post',
    'post.passwordPlaceholder': 'Access password',
    'post.unlock': 'Unlock',
    'post.unlockWrong': 'Wrong password, please try again',
    'post.unlockNetErr': 'Network error, please try again later',

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
    'article.readEn': 'Read the English version →',
    'article.showingZh': 'You are reading the Chinese original.',
    'article.showingEn': 'You are reading the English version.',

    'footer.copyright': 'Copyright © {year} Lao Yiguan',
    'footer.license': 'Terms of Use',
    'footer.privacy': 'Privacy Policy',
    // {link} 占位符，同样落在句内：See our <a>Privacy Policy</a>.
    'consent.text': 'This website uses Google Analytics to measure traffic, visitor engagement, and repeat visits. If you accept, analytics cookies will be stored in your browser. You can decline them without affecting normal browsing. See our {link}.',
    'consent.more': 'Privacy Policy',
    'consent.accept': 'Accept',
    'consent.reject': 'Decline',
    'footer.powered': 'Powered by Astro',
    'footer.hosted': 'Hosted by Cloudflare',
    'footer.clock': 'Beijing time · UTC+8',

    '404.title': 'Page not found',
    '404.desc': 'The page you requested may have been removed or never existed.',
    '404.back': 'Back to home',
  },
};

export function getLangFromUrl(url) {
  const seg = url.pathname.split('/').filter(Boolean)[0];
  // 仅 zh / en 为合法语言前缀；其余（含空段，即根路径）一律回退默认语言（en）
  return seg === 'zh' || seg === 'en' ? seg : defaultLang;
}

export function useTranslations(lang) {
  const dict = ui[lang] || ui[defaultLang];
  // 次级回退到中文：缺失英文串时回落中文（落实「无英文内容→中文」），而非回退默认语言自身
  const fallback = ui['zh'];
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
