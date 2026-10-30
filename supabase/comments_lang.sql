-- ============================================================
-- 评论双语合并（方案B）缺失迁移
-- 依赖：supabase/schema.sql 已先执行（建好 comments 表与 add_comment RPC）
-- 作用：
--   1. 给 comments 表补 lang 列（default 'zh'），支撑前端 select('...lang') 与语言徽标
--   2. 把 add_comment 改为接受 p_lang，函数内写入 lang
-- 幂等：重复执行安全（add column if not exists / create or replace）
-- ============================================================

-- 1) comments 补 lang 列
alter table if exists comments
  add column if not exists lang text not null default 'zh';   -- 'zh' 或 'en'

-- 2) add_comment 支持 p_lang（保留原 4 参签名 + 兼容默认 'zh'，旧调用不受影响）
create or replace function add_comment(
  p_page text,
  p_author text,
  p_email text,
  p_content text,
  p_lang text default 'zh'
) returns table (id uuid, delete_token text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    insert into comments (page, author, email, content, approved, rejected, delete_token, lang)
    values (
      p_page,
      left(p_author, 40),
      left(coalesce(nullif(p_email, ''), ''), 120),
      left(p_content, 1000),
      false,
      false,
      gen_random_uuid()::text,
      coalesce(nullif(p_lang, ''), 'zh')
    )
    returning comments.id, comments.delete_token;
end;
$$;
