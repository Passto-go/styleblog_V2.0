// 摘要生成：本地规则截取（零成本兜底）+ AI 生成（复用翻译链路的 LLM 调用）。
// 消费方：后台编辑器（发布兜底 / 手动 AI 生成）；结果落 posts.excerpt，
// 读者端（列表卡片 / 文章首段 / 搜索 / RSS / OG 卡片）只读该字段，不做实时计算。

// ---------------------------------------------------------------------------
// 1) Markdown 剥离：把正文还原成「可读纯文本」，供截取与句界判断
// ---------------------------------------------------------------------------

/** 去掉行内的 Markdown 标记符号（标题、引用、列表、表格等由调用方按行处理） */
function stripInline(text) {
  return String(text || '')
    // 图片 ![alt](url) → 丢掉（图片不是文字）
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // 链接 [text](url) → 保留 text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 行内代码 `code` → 保留内容
    .replace(/`([^`]*)`/g, '$1')
    // 加粗/斜体 **x** *x* __x__ _x_ → 保留内容
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // 删除线 ~~x~~
    .replace(/~~(.*?)~~/g, '$1')
    // 转义字符 \* → *
    .replace(/\\([\\`*_{}\[\]()#+\-.!>|~])/g, '$1')
    .trim();
}

/**
 * 把 Markdown 正文转成纯文本行数组，跳过非叙述内容：
 *  · 代码围栏 ``` ... ``` 整块丢弃（代码不是文章语言）
 *  · 表格行（| 开头）丢弃——表格信息密度高但不成句，塞进摘要很难读
 *  · 图片行、水平线、HTML 注释丢弃
 */
export function markdownToText(content) {
  const lines = String(content || '').split('\n');
  const out = [];

  // 预扫描：找出所有「成对」的代码围栏区间。
  // 只有存在匹配关闭行的围栏才被当作代码块——草稿里常见的未闭合围栏
  // （写了一半）不会把后半篇文章吞掉，这是与 CommonMark 的刻意差异：
  // 摘要宁可多收一段正文，也不能把正文当代码丢掉。
  const fenceLines = [];
  lines.forEach((raw, idx) => {
    const t = raw.trim();
    const f = t.match(/^(`{3,}|~{3,})/);
    if (f) fenceLines.push({ idx, marker: f[1][0].repeat(3), full: f[1] });
  });
  const inFenceAt = new Array(lines.length).fill(false);
  let open = null;
  for (const fl of fenceLines) {
    if (open === null) open = fl;
    else if (fl.full[0] === open.full[0] && fl.full.length >= open.full.length) {
      for (let i = open.idx; i <= fl.idx; i++) inFenceAt[i] = true;
      open = null;
    }
  }
  // open !== null 说明有未闭合围栏：不当成代码块处理

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].replace(/\s+$/, '');
    const trimmed = line.trim();

    if (inFenceAt[li]) continue;                       // 成对代码围栏内
    const fence = trimmed.match(/^(`{3,}|~{3,})/);
    if (fence) continue;                               // 围栏行本身

    if (!trimmed) continue;                       // 空行
    if (trimmed.startsWith('|')) continue;        // 表格
    if (/^!\[/.test(trimmed)) continue;           // 图片
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) continue; // 分隔线
    if (/^<!--/.test(trimmed)) continue;          // HTML 注释
    if (/^</.test(trimmed) && /^<\/?[a-z]/i.test(trimmed)) {
      // 裸 HTML 行：保留其文字部分（去掉标签）
      const txt = stripInline(trimmed.replace(/<[^>]+>/g, ''));
      if (txt) out.push(txt);
      continue;
    }

    // 标题行（# 文字）跳过：标题是结构不是叙述，混进摘要会产生
    // 「…完整部署记录写在前面这篇文章…」这种标题与正文连读的歧义。
    // 摘要从第一个正文段落开始，读起来才像一句话。
    if (/^#{1,6}\s+/.test(trimmed)) continue;
    // 引用块 > 文字
    let t = trimmed.replace(/^>\s?/, '');
    // 列表符号 - * + 或 1. / 1) / 1、 —— 编号剥离后摘要才是连贯叙述
    t = t.replace(/^[-*+]\s+/, '').replace(/^\d+[.)、]\s*/, '');
    // 表格分隔行兜底（|---|---| 已被上面 | 开头拦掉，这里防缩进表格）
    if (/^:?-{2,}:?(\s*\|?\s*:?-{2,}:?)+$/.test(t)) continue;

    const txt = stripInline(t);
    if (txt) out.push(txt);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2) 本地截取：按句界聚合到目标字数
// ---------------------------------------------------------------------------

/** 中英日通用的句子边界：。！？；.!?; 及其后空白 */
const SENT_END = /([。！？；!?;])/;

/**
 * 把文本行数组切成句子序列（保留句末标点）。
 * 英文没有句号的长行（如标题）按整行处理，不会硬切。
 */
function toSentences(lines) {
  const sents = [];
  for (const line of lines) {
    if (/[。！？；!?;]/.test(line)) {
      // 按句末标点切，标点保留在前句末尾
      const parts = line.split(/(?<=[。！？；!?;])/);
      for (const p of parts) {
        const s = p.trim();
        if (s) sents.push(s);
      }
    } else {
      sents.push(line.trim());
    }
  }
  return sents;
}

/**
 * 生成本地摘要：从正文第一个有效句开始，逐句累积到不超过 maxLen。
 * 规则：
 *   · 正文总长 ≤ maxLen 且 ≤ 20 字 → 返回 ''（太短，宁可不显示）
 *   · 正文总长 ≤ maxLen → 返回全文（不加省略号）
 *   · 超长 → 累积到临界，若下一句会超出则停止，末尾补 '…'
 *     （累积时预留 1 字给省略号；句子本身已以句末标点结尾时不再补）
 *   · 单句本身就超长（罕见，如无标点长段）→ 在词/字边界硬截
 */
export function localExcerpt(content, maxLen = 200) {
  const lines = markdownToText(content);
  if (!lines.length) return '';
  const full = lines.join('');
  if (full.length <= 20) return '';                 // 太短：不生成
  if (full.length <= maxLen) return full;           // 整篇就够短：全文即摘要

  // 省略号只在「句子被截断」时出现；正好停在句界则不补，避免「。…」连用
  const withEllipsis = (s) => (/[。！？；!?;…]$/.test(s) ? s : s + '…');
  const budget = maxLen - 1;                        // 给省略号留 1 字

  const sents = toSentences(lines);
  let acc = '';
  for (const s of sents) {
    if (!acc) {
      // 首句就超长：硬截到预算
      if (s.length > budget) return withEllipsis(cutAtBoundary(s, budget));
      acc = s;
      continue;
    }
    if (acc.length + s.length > budget) break;
    acc += s;
  }
  if (!acc) return withEllipsis(cutAtBoundary(full, budget));
  // 累积结果过短（< 40% 目标）时放宽一档：说明前几句都极短，补到 80% 更有信息量
  if (acc.length < maxLen * 0.4) {
    for (const s of sents) {
      if (acc.includes(s)) continue;
      if (acc.length + s.length > budget * 0.8) break;
      acc += s;
    }
  }
  return withEllipsis(acc);
}

/** 在词边界（英文空格）/ 字边界（CJK）附近硬截，避免切断单词 */
function cutAtBoundary(text, maxLen) {
  const slice = text.slice(0, maxLen);
  // 英文：回退到最后一个空格
  const sp = slice.lastIndexOf(' ');
  if (sp > maxLen * 0.6) return slice.slice(0, sp);
  return slice;
}

// ---------------------------------------------------------------------------
// 3) AI 生成摘要（复用 translate.js 的 chat/extractJSON，密钥只在服务端）
// ---------------------------------------------------------------------------

const EXCERPT_STYLE = {
  plain: '陈述式：客观概括文章主旨与要点，不卖关子',
  points: '要点式：保留原文关键信息点，可用顿号串联，信息密度优先',
  hook: '悬念式：点出最有意思的切入点，引发阅读兴趣，不剧透结论',
};

/**
 * AI 生成摘要。content 只送前 AI_CONTENT_LIMIT 字——概括全文不需要全文，
 * 也顺带把超长文的耗时与费用压到与单段翻译相当。
 */
export async function aiExcerpt({ title, content, lang = 'zh', maxLen = 200, style = 'plain' }, env) {
  const apiKey = env?.TRANSLATE_API_KEY;
  if (!apiKey) {
    const err = new Error('服务端未配置 TRANSLATE_API_KEY');
    err.code = 'NO_API_KEY';
    throw err;
  }
  const { chat, extractJSON } = await import('./translate.js');
  const AI_CONTENT_LIMIT = 6000;
  const body = String(content || '').slice(0, AI_CONTENT_LIMIT);
  if (!body.trim()) throw new Error('正文为空，无法生成摘要');

  const LANG = { zh: '简体中文', en: 'English' };
  const styleText = EXCERPT_STYLE[style] || EXCERPT_STYLE.plain;

  const messages = [
    {
      role: 'system',
      content:
        `你是一位资深的中外双语编辑。请为下面这篇博客文章写一段摘要。\n` +
        `要求：\n` +
        `1. 输出语言：${LANG[lang] || '简体中文'}（与文章语言一致）。\n` +
        `2. 字数严格不超过 ${maxLen} 字（${LANG[lang] || '中文'}计数，含标点）。\n` +
        `3. 风格：${styleText}。\n` +
        `4. 只输出一个 JSON 对象：{"excerpt":"摘要内容"}。不要任何解释文字，不要 Markdown 代码围栏。\n` +
        `5. 摘要必须是连贯的一句话或两句话，不要列表、不要换行、不要引号包裹自身。\n` +
        `6. 不得添加文章中没有的信息，不得使用「本文介绍了」这类元描述套话。`,
    },
    {
      role: 'user',
      content: `标题：${String(title || '').slice(0, 200)}\n正文：\n${body}`,
    },
  ];

  const raw = await chat({
    baseUrl: env.TRANSLATE_BASE_URL,
    apiKey,
    model: env.TRANSLATE_MODEL || 'deepseek-chat',
    messages,
    // 推理型模型（如智谱 glm-4.7-flash）会先输出 reasoning_content，
    // max_tokens 是「思考 + 答案」的共享预算。给 1024 会被思考吃光、
    // 导致 content 为空且 finish_reason=length；这里留足冗余，
    // chat() 内部还有「截断则翻倍预算重试」的兜底。
    maxTokens: 4096,
    temperature: 0.4,
  });
  const obj = extractJSON(raw);
  let text = String(obj?.excerpt || '').trim();
  if (!text) throw new Error('模型未返回摘要');
  // 兜底修剪：模型偶尔不守字数，这里按字界硬截
  if (text.length > maxLen) text = cutAtBoundary(text, maxLen);
  return { excerpt: text };
}
