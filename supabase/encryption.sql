-- ============================================================
-- 文章加密访问（方案 A：服务端密码校验）· 数据层迁移
-- 在 Supabase SQL Editor 执行本文件一次即可。
-- 设计要点：
--   · 密码绝不存明文，用 pgcrypto 的 crypt()/gen_salt('bf') 在 DB 端哈希
--   · pass_hash 不通过任何视图/select 暴露给前端；比对与写入均封装为
--     SECURITY DEFINER 函数，仅授权 anon 执行，函数内以 definer 权限操作
--   · 解锁状态由应用侧 HMAC 签名 cookie 承载，本文件不涉 cookie
-- ============================================================

create extension if not exists pgcrypto;

-- 1) 新增字段（幂等）
alter table posts add column if not exists is_encrypted boolean not null default false;
alter table posts add column if not exists pass_hash text;
alter table posts add column if not exists pass_hint text;

-- 2) 比对密码：返回布尔，不暴露 pass_hash；p_base 为去 -en/-ja 后缀的基准 slug
--    security definer + set search_path 防止 search_path 注入
--    pass_hash is not null：同组可能有没有密码的行（如后建的译文行），须跳过，
--    否则 limit 1 可能命中空哈希行把正确密码也判错。
create or replace function post_check_password(p_base text, p_pw text)
returns boolean
language plpgsql
security definer
set search_path = public
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
--    避免只加密中文行、英文行裸奔的泄漏路径。
create or replace function post_set_password(p_id uuid, p_pw text, p_hint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
begin
  select regexp_replace(slug, '-(en|ja)$', '') into v_base
  from posts where id = p_id;
  if v_base is null then return; end if;
  update posts
  set pass_hash = crypt(p_pw, gen_salt('bf')),
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
set search_path = public
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

-- 5) 仅授权 anon / authenticated 执行（前端直连与管理员后台共用）；service_role 本就绕过
revoke execute on function post_check_password(text, text) from public;
revoke execute on function post_set_password(uuid, text, text) from public;
revoke execute on function post_clear_encryption(uuid) from public;

grant execute on function post_check_password(text, text) to anon, authenticated;
grant execute on function post_set_password(uuid, text, text) to anon, authenticated;
grant execute on function post_clear_encryption(uuid) to anon, authenticated;

-- 6) 索引：按基准 slug 查加密文章时加速（可选，数据量小影响有限）
create index if not exists posts_base_slug_enc_idx
  on posts (regexp_replace(slug, '-(en|ja)$', '')) where is_encrypted = true;
