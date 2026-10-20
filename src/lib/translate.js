// 文章翻译服务端库：提示词工程 + 长文分段 + OpenAI 兼容协议调用。
// 仅在 Cloudflare Worker 运行时使用（API key 只存在于服务端环境变量，绝不下发前端）。

// 站点固定术语表：站名、作者、栏目等专有名词的译法，保证全站译文一致。
// 可用环境变量 TRANSLATE_GLOSSARY_JSON 覆盖/扩展（JSON 对象，键为原文）。
const DEFAULT_GLOSSARY = {
  '吾道一以贯之': { en: 'The Way, One Thread' },
  '老一贯': { en: 'Lao Yiguan' },
  '跑步': { en: 'running' },
};

const LANG_NAMES = { en: '英语（English）' };

// 单次请求的内容上限（约数）：超过则按二级标题分段翻译，避免超出模型输出长度。
const SINGLE_SHOT_MAX_CHARS = 4000;

function glossaryText(targetLang) {
  const entries = Object.entries(DEFAULT_GLOSSARY)
    .map(([zh, map]) => `  ${zh} → ${map[targetLang] || zh}`)
    .join('\n');
  return entries || '  （无）';
}

function buildSystemPrompt(targetLang) {
  return `你是一位资深的中外双语编辑，为一位中文个人博客的作者翻译文章。你的译文会被外国读者直接阅读，质量必须达到「信达雅」：准确传达原意，表达地道流畅，并保留作者的个人风格与语气。

翻译规则：
1. 目标语言：${LANG_NAMES[targetLang] || targetLang}。译文必须达到母语出版级水准，杜绝翻译腔（逐字直译、欧化中文、日式中文等一律禁止）。
2. 完整保留 Markdown 结构：标题层级、有序/无序列表、表格、引用块、分隔线、链接、图片、行内代码、代码块，逐一对应，不得增删、合并或降级。
3. 以下内容保持原样，绝不翻译：
   - 代码块（三个反引号围栏）内的全部内容
   - 行内代码（反引号包裹）内容
   - URL、邮箱地址、HTML 标签
   - 数字与单位（如 5km、10kg、2024年）
4. 专有名词：采用目标语言的通用译名；无通用译名或作者自创的名词保留原文。术语表中的译法必须严格遵守，全文一致。
5. 文化适配：按目标语言读者的习惯归化比喻、俗语、歇后语、网络用语，使译文读起来像母语作者原创，而非翻译作品。
6. 语气与文风和原文保持一致：第一人称、口语化、幽默感等作者特质必须在译文中保留。
7. 日期格式本地化（如 2024年3月5日译为 March 5, 2024 / 2024年3月5日）。
8. 不得添加译注、解释或任何原文没有的内容；不得遗漏任何信息。
9. 若原文含 YAML front matter（--- 之间的内容），原样保留，键名不翻译。

术语表（严格遵守）：
${glossaryText(targetLang)}

输出要求（极其重要）：
- 只输出一个 JSON 对象。不要任何解释文字，不要 Markdown 代码围栏。
- 格式：{"title":"译文标题","excerpt":"译文摘要（一两句话，译自原文摘要）","content":"译文正文"}
- content 是完整 Markdown 字符串，字符串内的换行必须写成 \\n 转义，双引号写成 \\" 转义。`;
}

function buildUserPrompt(title, excerpt, content, targetLang, partInfo, contextTail) {
  const parts = [];
  if (partInfo) {
    parts.push(
      `【长文分段翻译】本文较长，分 ${partInfo.total} 段发送，当前是第 ${partInfo.index} 段。` +
        `只翻译当前这一部分，保持这部分原有的全部结构与顺序；不要重复翻译其他部分，也不要添加承上启下的过渡句。`
    );
  }
  // 上文参考：仅用于理解「如前所述」这类跨段指代与保持术语一致，明确禁止翻译
  if (contextTail) {
    parts.push(
      `【上文参考】以下是上一段原文的结尾（仅用于理解指代关系与术语一致性，绝对不要翻译、不要复述、不要纳入输出）：\n` +
        `……${contextTail}`
    );
  }
  parts.push(
    `请将下面的中文博客文章翻译成${LANG_NAMES[targetLang] || targetLang}。`,
    `标题：${title}`,
    excerpt ? `摘要：${excerpt}` : '摘要：（无，请根据正文生成一两句话的译文摘要）',
    `正文：\n${content}`,
    '请严格按系统要求输出 JSON：{"title":"...","excerpt":"...","content":"..."}'
  );
  return parts.join('\n\n');
}

// 按二级标题（## ）把正文切成若干段；尽量在阈值内合并小段，减少上下文断裂。
// 结构感知版（v2）：代码围栏与表格绝不从中间腰斩——
//   · 代码块：整块进出（拆散的代码无法翻译也无法还原）
//   · 表格：整表进出；单表超阈值时按行切，且每片都重复表头+分隔行，
//     使每一片自身就是一张合法表格（修复 v1 把 12 列大表切成
//     「| PT |」这类 15 字残片、拼接后一张表碎成四张的问题）
//   · 超长段落：在句界处切，不切断句子
export function splitContent(content, maxChars = SINGLE_SHOT_MAX_CHARS) {
  const lines = String(content || '').split('\n');
  if (lines.join('\n').length <= maxChars) return [String(content || '')];

  // ---- 1) 分块：围栏 / 表格 / 散文 ----
  const blocks = [];
  let prose = [];
  const flushProse = () => { if (prose.length) { blocks.push({ type: 'prose', lines: prose }); prose = []; } };

  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    const fence = t.match(/^(`{3,}|~{3,})/);
    if (fence) {
      // 找到配对闭合行；未闭合则不当围栏（草稿写了一半，按散文处理）
      const marker = fence[1];
      let close = -1;
      for (let j = i + 1; j < lines.length; j++) {
        const tj = lines[j].trim();
        if (tj.startsWith(marker[0].repeat(3)) && tj.length >= 3) { close = j; break; }
      }
      if (close !== -1) {
        flushProse();
        blocks.push({ type: 'fence', text: lines.slice(i, close + 1).join('\n') });
        i = close + 1;
        continue;
      }
    }
    if (t.startsWith('|')) {
      // 连续表格行（含缩进表格）
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('|')) j++;
      flushProse();
      blocks.push({ type: 'table', lines: lines.slice(i, j) });
      i = j;
      continue;
    }
    prose.push(lines[i]);
    i++;
  }
  flushProse();

  // ---- 2) 打包进 chunk ----
  const chunks = [];
  let cur = [];
  let curLen = 0;
  const flush = () => { if (cur.length) { chunks.push(cur.join('\n')); cur = []; curLen = 0; } };
  const push = (text) => {
    if (curLen && curLen + text.length + 1 > maxChars) flush();
    cur.push(text);
    curLen += text.length + 1;
    if (curLen >= maxChars) flush();
  };

  for (const b of blocks) {
    if (b.type === 'fence') { push(b.text); continue; }
    if (b.type === 'table') {
      if (b.lines.join('\n').length <= maxChars) { push(b.lines.join('\n')); continue; }
      // 超大表：按行切，每片重复表头与分隔行。
      // 关键：分片必须走 push() 统一入队——直接 chunks.push() 会把
      // 尚未落地的前文（cur）甩到表格后面，造成整篇内容顺序错乱。
      const header = b.lines[0];
      const sep = b.lines[1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(b.lines[1]) ? b.lines[1] : null;
      const rows = b.lines.slice(sep ? 2 : 1);
      const headBlock = sep ? header + '\n' + sep : header;
      let piece = [headBlock];
      let pieceLen = headBlock.length;
      const emitPiece = () => { push(piece.join('\n')); piece = [headBlock]; pieceLen = headBlock.length; };
      for (const row of rows) {
        if (pieceLen + row.length + 1 > maxChars && piece.length > (sep ? 2 : 1)) emitPiece();
        if (row.length > maxChars) {
          // 单行就超限（超长单元格）：硬切，每片仍带表头
          for (let k = 0; k < row.length; k += maxChars) {
            const seg = row.slice(k, k + maxChars);
            if (pieceLen + seg.length + 1 > maxChars && piece.length > (sep ? 2 : 1)) emitPiece();
            piece.push(seg); pieceLen += seg.length + 1;
          }
          continue;
        }
        piece.push(row);
        pieceLen += row.length + 1;
      }
      if (piece.length > (sep ? 2 : 1)) emitPiece();
      continue;
    }
    // 散文：逐行推进，标题处优先切；超长行按句界切
    for (const line of b.lines) {
      if (/^##\s/.test(line) && curLen > maxChars * 0.5) flush();
      if (line.length + 1 > maxChars) {
        flush();
        for (const seg of sliceAtSentence(line, maxChars)) push(seg);
        continue;
      }
      push(line);
    }
  }
  flush();

  // 兜底：极端情况下仍超限的 chunk（如单个超大代码块），保持原样——
  // 拆散代码块比超预算更糟，交给模型按「原样保留」规则处理。
  return chunks.length ? chunks : [String(content || '')];
}

/** 把超长无标点行按句界（中英日句末标点）切成 ≤ max 的片 */
function sliceAtSentence(text, max) {
  const out = [];
  let rest = text;
  while (rest.length > max) {
    const win = rest.slice(0, max);
    const m = [...win.matchAll(/[。！？；!?;]/g)];
    let cut = m.length ? m[m.length - 1].index + 1 : -1;
    if (cut < max * 0.5) cut = -1;          // 句界太靠前则不用
    if (cut === -1) {
      const sp = win.lastIndexOf(' ');
      cut = sp > max * 0.6 ? sp : max;
    }
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

// 把模型写的字符串值按「常见转义」还原。
// 与 JSON.parse 的区别：遇到裸控制字符、裸双引号都原样保留，不报错。
function unescapeLoose(s) {
  const map = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f' };
  let out = '';
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1];
      if (map[n] !== undefined) { out += map[n]; i += 2; continue; }
      if (n === 'u' && i + 5 < s.length) {
        const hex = s.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); i += 6; continue; }
      }
      out += n; i += 2; continue;
    }
    out += c; i += 1;
  }
  return out;
}

// 兜底解析：只认 title / excerpt / content 三个字段，按字段名定位取值。
//
// 解决什么：模型（尤其 glm-4-flash）常把这三个值写成「未转义换行 + 未转义双引号」
// 的伪 JSON，例如 content 里含代码块 compatibility_flags = ["nodejs_compat"]，
// 引号没写成 \"，换行也没写成 \n。此时 JSON.parse 必然抛
// 「Bad control character」或「Expecting ',' delimiter」，三层容错全废。
// 因此不再依赖 JSON 语法，只按字段名切段，裸引号/裸换行原样保留——
// 对「外层围栏」「未转义换行」「未转义双引号」三种畸形全部免疫。
const LOOSE_FIELDS = ['title', 'excerpt', 'content'];
function parseByFields(raw) {
  let text = String(raw || '').trim();
  text = text.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '').trim();

  const hits = [];
  for (const f of LOOSE_FIELDS) {
    const m = new RegExp(`"${f}"\\s*:\\s*"`).exec(text);
    if (m) hits.push({ start: m.index, valStart: m.index + m[0].length, field: f });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.start - b.start);

  const out = {};
  hits.forEach((h, idx) => {
    const end = idx + 1 < hits.length ? hits[idx + 1].start : text.length;
    let seg = text.slice(h.valStart, end);
    // 去掉段尾的 `"` / `",` / `"}` 之类结构噪声
    seg = seg.replace(/"\s*[,}]?\s*$/, '');
    out[h.field] = unescapeLoose(seg);
  });
  // 与 normalizeTranslation 的判据一致：标题和正文必须有
  if (String(out.title || '').trim() && String(out.content || '').trim()) return out;
  return null;
}

// 从模型输出中提取 JSON。容错：围栏包裹、前后废话、未转义换行/引号。
export function extractJSON(raw) {
  const text = String(raw || '').trim();
  try {
    return JSON.parse(text);
  } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch {}
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }
  // 最后一层：放弃 JSON 语法，按字段名宽松切分（应对未转义换行 / 裸双引号）
  const loose = parseByFields(text);
  if (loose) return loose;
  throw new Error('模型未返回有效的 JSON');
}

// 校验并规范化模型输出，确保三项齐全。
export function normalizeTranslation(obj) {
  const title = String(obj?.title || '').trim();
  const content = String(obj?.content || '').trim();
  if (!title || !content) {
    throw new Error('翻译结果不完整（缺少标题或正文）');
  }
  return { title, excerpt: String(obj?.excerpt || '').trim(), content };
}

// OpenAI 兼容协议调用（DeepSeek / OpenAI / Moonshot / 智谱 / Gemini 兼容端点均可）。
// 导出供摘要生成（src/lib/excerpt.js）复用——两处共用同一套退避重试与容错，
// 避免复制粘贴两份逻辑后行为漂移。
export async function chat({ baseUrl, apiKey, model, messages, maxTokens = 8192, temperature = 0.3 }) {
  const url = String(baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '') + '/chat/completions';
  const payload = { model, messages, max_tokens: maxTokens, temperature };
  const doFetch = (body) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 免费层容量波动（503 "high demand"）与偶发 5xx/429：指数退避重试，最多 6 次尝试
  // （3+8+20+45+90 ≈ 166 秒覆盖窗口，对抗持续几分钟的容量波动）。
  // 前端超时护栏相应放宽到 200 秒。
  const RETRY_DELAYS = [3000, 8000, 20000, 45000, 90000];
  let status = 0;
  let lastDetail = '';

  // ---------------------------------------------------------------------------
  // 空返回（content 为空）的自愈：推理型模型的「思考预算吃光答案」问题
  // ---------------------------------------------------------------------------
  // 智谱 GLM-4.x-Flash / DeepSeek-R 等推理模型会先在 message.reasoning_content
  // 里思考，而 max_tokens 是「思考 + 回答」的**共享总预算**，不是只给答案的。
  // 预算不足时它们**不报错**：HTTP 200、content 为 ""、finish_reason 为 "length"
  // （实测 glm-4.7-flash 的 reasoning_content 可长到 1300~1600 字符，
  //  给 1024 会在思考阶段就耗尽，答案一个字都写不出来）。
  // 判据：content 为空 + finish_reason === 'length' → 是预算不足，不是端点故障。
  // 对策：把 max_tokens 翻倍重试（最多 3 次），通常第一次翻倍即可拿到答案。
  const budgetRetries = [maxTokens * 2, maxTokens * 4, maxTokens * 8];

  for (let attempt = 0; ; attempt++) {
    let resp = await doFetch(payload);

    // 容错：部分兼容端点（如 Gemini）对 max_tokens 字段挑剔，报 400 且指向该字段时去掉重试一次
    if (resp.status === 400) {
      const detail = await resp.text().catch(() => '');
      if (/max_tokens|max_completion_tokens|unsupported parameter/i.test(detail)) {
        const retry = { ...payload };
        delete retry.max_tokens;
        resp = await doFetch(retry);
      }
    }

    if (resp.ok) {
      const data = await resp.json();
      const choice = data?.choices?.[0];
      const msg = choice?.message;
      const text = msg?.content;
      if (text) return text;

      // —— 走到这里说明 content 为空，区分「预算不足」与「真的没内容」——
      const finish = choice?.finish_reason;
      const reasoning = typeof msg?.reasoning_content === 'string' ? msg.reasoning_content : '';
      const truncated = finish === 'length';

      if (truncated && budgetRetries.length) {
        const next = budgetRetries.shift();
        payload.max_tokens = next;
        console.warn(
          `[chat] 响应被 max_tokens 截断（content 为空，reasoning ${reasoning.length} 字符），` +
            `预算提升至 ${next} 重试`
        );
        continue;
      }

      // 预算已翻到上限仍拿不到答案：给出能指向问题本身的错误，而不是笼统的「返回为空」
      if (truncated) {
        throw new Error(
          `模型思考耗尽了输出预算（已提升至 ${payload.max_tokens} tokens 仍不足）。` +
            `请改用非推理模型，或调低摘要长度后重试`
        );
      }
      if (reasoning) {
        throw new Error(
          `模型只返回了思考过程、没有返回答案（reasoning_content ${reasoning.length} 字符）。请重试`
        );
      }
      throw new Error(`模型返回了空内容（finish_reason: ${finish || '未知'}）。请重试`);
    }

    status = resp.status;
    lastDetail = await resp.text().catch(() => '');
    const overloaded = status === 503 || status === 429 || status >= 500;
    if (!overloaded || attempt >= RETRY_DELAYS.length) break;
    await sleep(RETRY_DELAYS[attempt]);
  }

  let msg = `翻译服务返回 ${status}`;
  try {
    const j = JSON.parse(lastDetail);
    if (j?.error?.message) msg += `：${j.error.message}`;
  } catch {
    if (lastDetail) msg += `：${lastDetail.slice(0, 300)}`;
  }
  throw new Error(msg);
}

// 并发度：2 路。段与段无数据依赖（每段自带上文原文参考），可安全并行；
// 2 路足以把 5 段从 ~233s 压到 ~140s（落在前端 200s 超时线内），
// 又不至于并发太高踩中免费层 RPM 限流。
const TRANSLATE_CONCURRENCY = 2;
const TRANSLATE_BATCH_GAP_MS = 1500;
// 送给模型的「上文参考」长度：压住「如前所述」这类跨段指代与术语漂移。
// 取**原文**尾部而非译文——译文要等上一段返回，会重新引入串行依赖。
const CONTEXT_TAIL_CHARS = 400;

// 翻译一篇（或一段）文章。env 提供 OpenAI 兼容端点配置。
export async function translateArticle({ title, excerpt, content, targetLang }, env) {
  if (!['en'].includes(targetLang)) {
    throw new Error('仅支持翻译为英文(en)');
  }
  const apiKey = env?.TRANSLATE_API_KEY;
  if (!apiKey) {
    const err = new Error('服务端未配置 TRANSLATE_API_KEY，请在 Cloudflare 添加 secret 后重新部署');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const chunks = splitContent(content);
  const multi = chunks.length > 1;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 摘要兜底：原文没填摘要时，模型「根据正文生成」只会看到自己那一段，
  // 导致 results[0].excerpt 只概括开头（修复：先用本地截取算出全文摘要，
  // 再作为「给定摘要」交给每一段翻译，各段译的是同一份全文摘要）。
  let excerptForPrompt = String(excerpt || '').trim();
  if (multi && !excerptForPrompt) {
    try {
      const { localExcerpt } = await import('./excerpt.js');
      excerptForPrompt = localExcerpt(content, 200);
    } catch { /* 摘要库缺失不阻断翻译 */ }
  }

  const translatePart = async (i) => {
    const partInfo = multi ? { index: i + 1, total: chunks.length } : null;
    // 上文参考：上一段原文的尾部，明确标注「不要翻译」
    const contextTail = i > 0 ? chunks[i - 1].slice(-CONTEXT_TAIL_CHARS) : '';
    const messages = [
      { role: 'system', content: buildSystemPrompt(targetLang) },
      {
        role: 'user',
        content: buildUserPrompt(title, excerptForPrompt, chunks[i], targetLang, partInfo, contextTail),
      },
    ];
    const raw = await chat({
      baseUrl: env.TRANSLATE_BASE_URL,
      apiKey,
      model: env.TRANSLATE_MODEL || 'deepseek-chat',
      messages,
    });
    return normalizeTranslation(extractJSON(raw));
  };

  // 分批并发。任一一段失败 → Promise.all 整体 reject → 调用方抛错，
  // 不返回半成品译文（原子性：数据库里绝不会出现译了一半的文章）。
  const results = new Array(chunks.length);
  for (let i = 0; i < chunks.length; i += TRANSLATE_CONCURRENCY) {
    const batch = [];
    for (let k = i; k < Math.min(i + TRANSLATE_CONCURRENCY, chunks.length); k++) batch.push(k);
    const rs = await Promise.all(batch.map((k) => translatePart(k)));
    batch.forEach((k, idx) => { results[k] = rs[idx]; });
    if (i + TRANSLATE_CONCURRENCY < chunks.length) await sleep(TRANSLATE_BATCH_GAP_MS);
  }

  if (results.length === 1) return { ...results[0], parts: 1 };
  return {
    title: results[0].title,
    excerpt: results[0].excerpt,
    content: results.map((r) => r.content).join('\n\n'),
    parts: results.length,
  };
}
