// 文章解锁 cookie 的 HMAC 签名 / 校验工具（WebCrypto 实现）。
// 解锁状态以「基准 slug」为 key：HMAC-SHA256(base, UNLOCK_SECRET) 签名，
// cookie 值形如 `base.signature`。前端无法伪造（不知道密钥），服务端只需本地比对，
// 无需再查库。与现有加密文章的多语言共享口径一致（baseSlug 去 -en/-ja 后缀）。
//
// 为什么用 WebCrypto 而非 node:crypto：本站运行在 Cloudflare Worker 上，
// Workers 运行时原生提供 crypto.subtle（HMAC-SHA256），无 Node 兼容层依赖；
// 本地 dev（Node ≥ 18）同样暴露全局 crypto，两端行为一致。

// UNLOCK_SECRET 仅服务端可读（非 PUBLIC_ 前缀，不会进入客户端包）。
// 取值优先级：① Cloudflare 运行时 env（后台 Secret，改密钥免重建）
//            ② 构建期内联值（本地 .env / Git 构建变量，import.meta.env）
//            ③ 开发期固定值（缺失时告警，仅本地兜底）
const BUILD_SECRET = import.meta.env.UNLOCK_SECRET || '';

const encoder = new TextEncoder();
let warned = false;

// runtimeEnv：Astro 的 locals.runtime.env（Cloudflare 运行时绑定）
function resolveSecret(runtimeEnv?: Record<string, unknown>): string {
  const fromRuntime = runtimeEnv?.UNLOCK_SECRET;
  if (typeof fromRuntime === 'string' && fromRuntime) return fromRuntime;
  if (!BUILD_SECRET && !warned) {
    warned = true;
    console.warn('[unlock] UNLOCK_SECRET 未配置，使用开发期固定密钥——生产环境务必在 Cloudflare 变量中设置');
  }
  return BUILD_SECRET || 'dev-insecure';
}

// HMAC-SHA256(base, secret) → 小写 hex
async function hmacHex(base: string, runtimeEnv?: Record<string, unknown>): Promise<string> {
  const secret = resolveSecret(runtimeEnv);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(base));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 恒定时间字符串比对：防时序攻击（逐字节累积差异，不提前返回）
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 生成写入 cookie 的值（base.signature）
export async function makeUnlockCookieValue(base: string, runtimeEnv?: Record<string, unknown>): Promise<string> {
  return `${base}.${await hmacHex(base, runtimeEnv)}`;
}

// 校验请求携带的 cookie 值是否对应当前文章的 base slug
export async function verifyUnlockCookie(
  value: string | undefined,
  base: string,
  runtimeEnv?: Record<string, unknown>
): Promise<boolean> {
  if (!value) return false;
  const [b, sig] = value.split('.');
  if (b !== base || !sig) return false;
  return timingSafeEqualStr(await hmacHex(base, runtimeEnv), sig);
}
