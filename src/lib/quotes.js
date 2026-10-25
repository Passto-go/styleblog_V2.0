// 今日寄语：接入第三方数据源（一言 hitokoto.cn，免费无需注册），服务端拉取。
// 失败（网络/超时/接口异常）时回退到本地静态寄语，保证页面始终有内容。
//
// L-08：此前首页/文章页每次 SSR 都同步外呼 hitokoto，最坏要等 3 秒才吐首字节，
// 而且完全依赖第三方可用性。现在的策略：
//   1) 同一 isolate 内缓存成功结果 30 分钟（每日寄语本就不需要秒级新鲜）；
//   2) 失败后熔断 5 分钟，期间直接走本地静态池，不再打第三方；
//   3) 第三方超时收紧到 1.5 秒——它只是锦上添花，不值得拖慢首屏；
//   4) 模块级状态全部在 try/catch 内，任何异常都只会退到静态池，不会让页面 5xx。
import { site } from '../data/site.js';

const ENDPOINT = 'https://v1.hitokoto.cn/?encode=json';
const TIMEOUT = 1500;
const TTL_OK = 30 * 60 * 1000; // 成功结果缓存 30 分钟
const TTL_FAIL = 5 * 60 * 1000; // 失败后熔断 5 分钟

// Worker 在请求间复用 isolate，模块级缓存天然生效；多 isolate 不共享，
// 但每个 isolate 各自收敛，已足够把外呼次数压到可忽略。
let cache = { at: 0, ok: false, text: '', source: '' };

function staticFallback(lang) {
  const pool = site.quotes[lang] || site.quotes.zh || [];
  if (!pool.length) return { text: '', source: '' };
  // 取静态池里「年内第几天」对应的一条，行为稳定、可离线
  const start = new Date(new Date().getFullYear(), 0, 0);
  const day = Math.floor((Date.now() - start) / 86400000);
  return { text: pool[day % pool.length] || pool[0] || '', source: '' };
}

export async function getDailyQuote(lang = 'zh') {
  const now = Date.now();
  const age = now - cache.at;

  // 命中缓存：成功的按 TTL_OK、失败的按 TTL_FAIL
  if (cache.at && age < (cache.ok ? TTL_OK : TTL_FAIL)) {
    if (cache.ok) return { text: cache.text, source: cache.source };
    return staticFallback(lang);
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    const res = await fetch(ENDPOINT, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    const text = (data.hitokoto || '').toString().trim();
    if (!text) throw new Error('empty');
    const source = [data.from_who, data.from].filter(Boolean).join(' · ');
    cache = { at: now, ok: true, text, source: source || '' };
    return { text: cache.text, source: cache.source };
  } catch {
    cache = { at: now, ok: false, text: '', source: '' };
    return staticFallback(lang);
  }
}
