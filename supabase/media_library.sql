-- ============================================================================
-- 文件管理（媒体库）与文章生命周期联动
-- 目的：
--   1) 记录每个上传文件与「所属文章」的归属关系，删除文章时据此精确清理，
--      避免存储残留（当前痛点：正文删图/删文章后 bucket 内文件仍留着）
--   2) 为后台「文件管理」模块提供数据源：列出、筛选、手动删除
--   3) 新增 attachments bucket，支持 pdf/word/ppt/excel 等附件上传
-- 在 Supabase 后台 → SQL Editor 执行本文件（一次性，幂等，可重复执行）。
--
-- 设计要点：
--   · media 表以 storage 路径为主键（bucket 内唯一），记录归属文章基准 slug、
--     原始文件名、MIME、大小、上传时间
--   · post_slug 存「基准 slug」（去掉 -en/-ja），故一篇文章的多语言版本共享归属，
--     删除整组时按 base slug 一并清理
--   · 上传时前端写入记录；删除文章时按 base slug 删除记录 + 清 storage 对象
--   · 孤儿检测：media_orphans 视图给出「未被任何文章正文或封面引用」的文件，供后台一键清理
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) media 表：文件归属记录
-- ---------------------------------------------------------------------------
create table if not exists media (
  path          text primary key,              -- storage 内路径，如 1792136312057-shot.png
  bucket        text not null default 'images',-- images / attachments
  post_slug     text,                          -- 所属文章基准 slug；null = 未关联（如后台上传未指定文章）
  original_name text not null default '',      -- 用户原始文件名（仅展示用）
  mime          text not null default '',      -- MIME 类型
  size_bytes    bigint not null default 0,     -- 字节数
  created_at    timestamptz not null default now()
);

create index if not exists media_post_slug_idx on media (post_slug);
create index if not exists media_bucket_idx on media (bucket);
create index if not exists media_created_idx on media (created_at desc);

alter table media enable row level security;

-- 读者端无需读 media（前台直接用 public URL），仅登录用户可管理
drop policy if exists "media auth all" on media;
create policy "media auth all"
  on media for all
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 2) attachments bucket：附件存储（公开读，登录用户可写）
--    支持 pdf / word / ppt / excel / 文本 / 压缩包等常见格式
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', true,
  52428800,  -- 单文件上限 50MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv', 'text/markdown',
    'application/zip', 'application/x-zip-compressed',
    'application/octet-stream',
    -- 附件不限于文档：图片也可作为附件上传（2026-10-19 补，
    -- 否则图片附件被 storage 的 MIME 白名单直接拒收）
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- attachments：公开读
drop policy if exists "public read attachments" on storage.objects;
create policy "public read attachments"
  on storage.objects for select
  using (bucket_id = 'attachments');

-- attachments：登录用户可上传
drop policy if exists "auth upload attachments" on storage.objects;
create policy "auth upload attachments"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'attachments');

-- attachments：登录用户可删除
drop policy if exists "auth delete attachments" on storage.objects;
create policy "auth delete attachments"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'attachments');

-- ---------------------------------------------------------------------------
-- 3) images bucket：补一条删除策略（原本只有 select/insert，删不掉图）
-- ---------------------------------------------------------------------------
drop policy if exists "auth delete images" on storage.objects;
create policy "auth delete images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'images');

-- ---------------------------------------------------------------------------
-- 4) 孤儿文件视图：media 里存在、但没有任何文章引用它的文件
--    判定方式：
--      · 图片/一般文件：posts.content 与 posts.cover 任一包含该 path 即视为已引用
--        （封面图只进 cover 列、不进正文，只查 content 会把它误判为孤儿，
--         后台一键清理时误删——2026-10-18 修复）
--      · 附件（bucket='attachments'）：不进正文/封面，靠 post_slug 归属判定，
--        post_slug 非空即「已归属某篇文章」，不算孤儿（2026-10-19 修复；
--        否则正常附件会被误判为孤儿，一键清理直接删）
--    注意：仅用于后台提示，删除仍需人工确认（可能刚上传、尚未插入正文/设为封面）
-- ---------------------------------------------------------------------------
create or replace view media_orphans as
select m.*
from media m
where not (
        m.bucket = 'attachments' and m.post_slug is not null  -- 已归属文章的附件：非孤儿
      )
  and not exists (
    select 1 from posts p
    where p.content like '%' || m.path || '%'
       or coalesce(p.cover, '') like '%' || m.path || '%'
  );

-- 视图本身不设 RLS；底层 media 已限登录用户，故匿名读不到内容
grant select on media_orphans to authenticated;

-- ============================================================================
-- 自查（可选）：
--   select count(*) from media;
--   select * from media_orphans limit 20;
--   select id, public from storage.buckets where id in ('images','attachments');
-- ============================================================================
