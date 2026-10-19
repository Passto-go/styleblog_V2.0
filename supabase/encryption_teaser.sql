-- ============================================================
-- 文章加密 · teaser 模式（列表显标题摘要，点击输密码看正文）
-- 数据层迁移 v3 —— 在 Supabase SQL Editor 执行本文件一次即可（可重复执行）。
--
-- ⚠️ 执行顺序：代码（含 list_visible 改动）可先于或后于本文件，双向安全：
--    · 先跑 SQL 后部署：新列就位，旧代码不读它 → 行为等同加密全隐身（旧行为）
--    · 先部署后跑 SQL：新代码对缺列的库自动降级 → 同样维持旧行为，不会报错
--    两侧都就位后，teaser 勾选才真正生效。
--
-- 与 v2（encryption.sql）的关系：v2 必须已执行（本文件只增量，不重复 v2 内容）。
--
-- 设计要点：
--   · list_visible 仅表示「加密文章是否在列表露出标题摘要」，绝不放松正文门禁
--   · 与 is_encrypted 同款组级传播：按基准 slug 同步中英所有行，防止单语言行裸奔
--   · 列表/归档/分类/首页/搜索索引/RSS 走 posts.js 统一过滤；详情页仍由
--     HMAC 签名 cookie 把关，teaser 文章未解锁同样只给标题 + 摘要 + 密码框
-- ============================================================

-- 1) 新列（幂等）：默认 false = 不露出，维持 v2 行为
alter table posts add column if not exists list_visible boolean not null default false;

-- 2) post_set_password 增加 p_list_visible（带默认值 → 旧签名三参调用仍可用，
--    但显式传四参才能真正开启 teaser；PostgREST 按提供的参数个数匹配函数）
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
  from posts where id = p_id;
  if v_base is null then return; end if;
  update posts
  set pass_hash = crypt(p_pw, gen_salt('bf', 10)),
      pass_hint = p_hint,
      is_encrypted = true,
      list_visible = p_list_visible
  where regexp_replace(slug, '-(en|ja)$', '') = v_base;
end;
$$;

-- 3) 只改列表显隐（不碰密码）：用户勾选/取消 teaser 但未重设密码时走这条。
--    按 base 传播，保证中英行一致。
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
  from posts where id = p_id;
  if v_base is null then return; end if;
  update posts
  set list_visible = p_visible
  where regexp_replace(slug, '-(en|ja)$', '') = v_base;
end;
$$;

-- 4) 取消加密时一并清零（解密后该列无意义，保持干净；下次加密默认不露出）
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
      is_encrypted = false,
      list_visible = false
  where regexp_replace(slug, '-(en|ja)$', '') = v_base;
end;
$$;

-- 5) 授权：新函数同样仅 anon / authenticated 可执行（先 revoke public 再 grant）
revoke execute on function post_set_password(uuid, text, text, boolean) from public;
revoke execute on function post_set_list_visible(uuid, boolean) from public;
revoke execute on function post_clear_encryption(uuid) from public;

grant execute on function post_set_password(uuid, text, text, boolean) to anon, authenticated;
grant execute on function post_set_list_visible(uuid, boolean) to anon, authenticated;
grant execute on function post_clear_encryption(uuid) to anon, authenticated;

-- 6) list_visible 不是敏感列（true/false 本身即前台行为），无需列级 revoke；
--    应用侧显式列清单已包含它，与 is_encrypted / pass_hint 同等对待。

-- 7) 自检：确认列与函数就位
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'posts' and column_name = 'list_visible';

select proname, pg_get_function_identity_arguments(proname) as args
from pg_proc
where proname in ('post_set_password', 'post_set_list_visible', 'post_clear_encryption')
order by proname;
