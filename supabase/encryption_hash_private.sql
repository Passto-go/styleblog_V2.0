-- ============================================================
-- 加密哈希隔离：pass_hash 迁出 posts 表 → private.post_passwords
-- 在 Supabase SQL Editor 执行本文件一次即可（可重复执行）。
--
-- 背景：posts.pass_hash 的列级 revoke 多次执行后，目录查询显示
--   anon / authenticated 仍持有 SELECT（该环境存在自动重新授权机制，
--   列级权限不可靠）。改为结构性隔离，暴露面归零：
--     · private 模式不在 PostgREST 的 db-schemas（默认仅 public）→ API 层不可见
--     · 不对 anon / authenticated 授予 private 模式 usage 及表任何权限，并开启 RLS
--     · 全部读写经 security definer 函数（属主权限）完成，应用代码零改动
--     · 末尾 drop column posts.pass_hash，即使将来 public 上出现自动授权也无列可授
--
-- 兼容性：
--   · 函数签名全部不变（post_check_password(text,text) /
--     post_set_password(uuid,text,text,boolean) / post_clear_encryption(uuid)），
--     RPC 调用方无感；三参旧重载 post_set_password(uuid,text,text) 一并移除
--   · 顺带修复 v2 遗留隐患：此后即使代码用 select('*') 查 posts 也不会碰哈希
-- ============================================================

-- 1) 私有模式与表（幂等）
create schema if not exists private;

create table if not exists private.post_passwords (
  post_id uuid primary key references public.posts(id) on delete cascade,
  pass_hash text not null
);

-- 双保险：显式收回一切权限 + 开启 RLS（函数以属主身份访问，不受影响）
revoke all on table private.post_passwords from anon, authenticated;
alter table private.post_passwords enable row level security;

-- 2) 迁移存量哈希（幂等 upsert；列已删时跳过——新写入本就直发私有表）
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'pass_hash'
  ) then
    insert into private.post_passwords (post_id, pass_hash)
    select id, pass_hash from public.posts
    where pass_hash is not null
    on conflict (post_id) do update set pass_hash = excluded.pass_hash;
  end if;
end $$;

-- 3) 比对密码：哈希改从私有表读（组级/发布/软删过滤逻辑不变）
create or replace function post_check_password(p_base text, p_pw text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ok boolean;
begin
  select (crypt(p_pw, h.pass_hash) = h.pass_hash) into ok
  from public.posts p
  join private.post_passwords h on h.post_id = p.id
  where regexp_replace(p.slug, '-(en|ja)$', '') = p_base
    and p.is_encrypted = true
    and p.published = true
    and p.deleted_at is null
  limit 1;
  return coalesce(ok, false);
end;
$$;

-- 4) 设密码：posts 行只置标志位；哈希 upsert 进私有表
create or replace function post_set_password(p_id uuid, p_pw text, p_hint text, p_list_visible boolean default false)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base text;
begin
  select regexp_replace(slug, '-(en|ja)$', '') into v_base
  from public.posts where id = p_id;
  if v_base is null then return; end if;
  update public.posts
  set pass_hint = p_hint,
      is_encrypted = true,
      list_visible = p_list_visible
  where regexp_replace(slug, '-(en|ja)$', '') = v_base;

  insert into private.post_passwords (post_id, pass_hash)
  select id, crypt(p_pw, gen_salt('bf', 10))
  from public.posts
  where regexp_replace(slug, '-(en|ja)$', '') = v_base
  on conflict (post_id) do update set pass_hash = excluded.pass_hash;
end;
$$;

-- 5) 取消加密：清 posts 标志位 + 删私有表哈希行
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
  from public.posts where id = p_id;
  if v_base is null then return; end if;
  update public.posts
  set pass_hint = null,
      is_encrypted = false,
      list_visible = false
  where regexp_replace(slug, '-(en|ja)$', '') = v_base;

  delete from private.post_passwords
  where post_id in (
    select id from public.posts
    where regexp_replace(slug, '-(en|ja)$', '') = v_base
  );
end;
$$;

-- 6) 只改列表显隐（不碰密码）：沿用 teaser 版实现（哈希已不在 posts，无需改动，
--    此处重列一遍以保证本文件独立可读）
create or replace function post_set_list_visible(p_id uuid, p_visible boolean)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base text;
begin
  select regexp_replace(slug, '-(en|ja)$', '') into v_base
  from public.posts where id = p_id;
  if v_base is null then return; end if;
  update public.posts
  set list_visible = p_visible
  where regexp_replace(slug, '-(en|ja)$', '') = v_base;
end;
$$;

-- 7) 移除三参旧重载（其函数体引用 posts.pass_hash，删列后调用会运行时报错）
drop function if exists post_set_password(uuid, text, text);

-- 8) 授权：与既有体系一致（先 revoke public 再 grant）
revoke execute on function post_check_password(text, text) from public;
revoke execute on function post_set_password(uuid, text, text, boolean) from public;
revoke execute on function post_set_list_visible(uuid, boolean) from public;
revoke execute on function post_clear_encryption(uuid) from public;

grant execute on function post_check_password(text, text) to anon, authenticated;
grant execute on function post_set_password(uuid, text, text, boolean) to anon, authenticated;
grant execute on function post_set_list_visible(uuid, boolean) to anon, authenticated;
grant execute on function post_clear_encryption(uuid) to anon, authenticated;

-- 9) 删除 posts.pass_hash 列——暴露面归零
alter table public.posts drop column if exists pass_hash;

-- 10) 自检
select
  (select count(*) from private.post_passwords) as migrated_hashes,
  (select count(*) from public.posts where is_encrypted = true) as encrypted_posts,
  has_table_privilege('anon', 'private.post_passwords', 'SELECT') as anon_can_read_hashes,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'pass_hash'
  ) as pass_hash_column_still_exists;

select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('post_check_password', 'post_set_password', 'post_set_list_visible', 'post_clear_encryption')
order by p.proname;
