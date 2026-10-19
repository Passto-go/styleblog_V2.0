-- ============================================================
-- 文章加密访问（方案 A：服务端密码校验）· 数据层迁移 v2
-- 在 Supabase SQL Editor 执行本文件一次即可（可重复执行）。
--
-- ⚠️ 执行顺序：先部署含「显式列清单」改动的代码，再执行本文件。
--    反过来会导致旧代码的 select('*') 因 pass_hash 权限被拒而降级。
--
-- v2 修订（相对首版）：
--   ① 修 pgcrypto 解析：Supabase 常把 pgcrypto 预装在 extensions 模式，首版函数
--      search_path=public 导致运行时 "function crypt(text, text) does not exist"，
--      设密码/校验密码全部 500。本版 search_path 覆盖 public, extensions 两种位置。
--   ② bcrypt cost 显式 10（gen_salt('bf') 默认仅 6 轮，离线爆破门槛偏低）。
--   ③ 列级收窄：revoke select(pass_hash)——anon 直连 REST 也能读哈希，仅靠前端
--      剥离不设防。应用侧（posts.js / admin）已改为显式列清单（不含 pass_hash）。
--
-- 设计要点：
--   · 密码绝不存明文，用 pgcrypto 的 crypt()/gen_salt('bf') 在 DB 端哈希
--   · pass_hash 不通过任何接口暴露给前端；比对与写入均封装为
--     SECURITY DEFINER 函数，仅授权 anon 执行，函数内以 definer 权限操作
--   · 解锁状态由应用侧 HMAC 签名 cookie 承载，本文件不涉 cookie
-- ============================================================

-- 0) pgcrypto 就位（无论装在 public 还是 extensions，函数搜索路径都能找到）
create schema if not exists extensions;              -- Supabase 默认已有，兜底
create extension if not exists pgcrypto;             -- 新库：装入默认模式（public）

-- 1) 新增字段（幂等）
alter table posts add column if not exists is_encrypted boolean not null default false;
alter table posts add column if not exists pass_hash text;
alter table posts add column if not exists pass_hint text;

-- 2) 比对密码：返回布尔，不暴露 pass_hash；p_base 为去 -en/-ja 后缀的基准 slug
--    security definer + set search_path 防止 search_path 注入。
--    search_path 同时含 extensions：兼容 Supabase 把 pgcrypto 装在 extensions 的部署。
--    pass_hash is not null：同组可能有没有密码的行（如后建的译文行），须跳过，
--    否则 limit 1 可能命中空哈希行把正确密码也判错。
create or replace function post_check_password(p_base text, p_pw text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ok boolean;
begin
  select (crypt(p_pw, pass_hash) = pass_hash) into ok
  from posts
  where regexp_replace(slug, '-(en|ja)$', '') = p_base
    and is_encrypted = true
    and pass_hash is not null
    and published = true
    and deleted_at is null
  limit 1;
  return coalesce(ok, false);
end;
$$;

-- 3) 设置密码：DB 端哈希，明文不落库；同时写提示语并置 is_encrypted=true。
--    按「基准 slug」传播：中英文版同一把锁——在任一行上设/改密码，同组所有行生效，
--    避免只加密中文行、英文行裸奔的泄漏路径。cost=10 显式指定（默认 6 太弱）。
create or replace function post_set_password(p_id uuid, p_pw text, p_hint text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base text;
begin
  select regexp_replace(slug, '-(en|ja)$', '') into v_base
  from posts where id = p_id;
  if v_base is null then return; end if;
  update posts
  set pass_hash = crypt(p_pw, gen_salt('bf', 10)),
      pass_hint = p_hint,
      is_encrypted = true
  where regexp_replace(slug, '-(en|ja)$', '') = v_base;
end;
$$;

-- 4) 取消加密：按 base 清空同组所有行的密码与提示，置 is_encrypted=false
create or replace function post_clear_encryption(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base text;
begin
  select regexp_replace(slug, '-(en|ja)$', '') into v_base
  from posts where id = p_id;
  if v_base is null then return; end if;
  update posts
  set pass_hash = null,
      pass_hint = null,
      is_encrypted = false
  where regexp_replace(slug, '-(en|ja)$', '') = v_base;
end;
$$;

-- 5) 仅授权 anon / authenticated 执行 RPC（前端直连与管理员后台共用）；service_role 本就绕过
revoke execute on function post_check_password(text, text) from public;
revoke execute on function post_set_password(uuid, text, text) from public;
revoke execute on function post_clear_encryption(uuid) from public;

grant execute on function post_check_password(text, text) to anon, authenticated;
grant execute on function post_set_password(uuid, text, text) to anon, authenticated;
grant execute on function post_clear_encryption(uuid) to anon, authenticated;

-- 5b) 列级收窄：哈希列对任何匿名/登录读者不可读。
--     anon key 本就公开，不设防时 GET /rest/v1/posts?select=pass_hash 即可拖走
--     全部哈希做离线爆破。service_role 与函数（security definer）不受影响。
--     依赖：应用侧必须用显式列清单查 posts（已随代码改动），否则 select('*') 会报权限错。
revoke select (pass_hash) on table public.posts from anon, authenticated;

-- 6) 索引：按基准 slug 查加密文章时加速（可选，数据量小影响有限）
create index if not exists posts_base_slug_enc_idx
  on posts (regexp_replace(slug, '-(en|ja)$', '')) where is_encrypted = true;

-- 7) 自检输出：确认 pgcrypto 实际所在模式（应在 extensions 或 public）
select extname, extnamespace::regnamespace as pgcrypto_location
from pg_extension where extname = 'pgcrypto';
