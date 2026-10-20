-- ============================================================================
-- media 表内容去重（SHA-256）
--
-- 目的：
--   上传前对文件内容做 SHA-256 摘要，命中已有记录则直接复用其 URL，
--   不再落一份新副本。从根本解决「同一张图被上传多次」的问题
--   （旧逻辑用 Date.now() 拼路径，同一文件每次必然得到不同路径，
--    且 upload 用 upsert:true，永远新增、永不命中）。
--
-- 说明：
--   · 幂等：可重复执行
--   · 向后兼容：存量行 sha256 为 null，不影响现有文件的插入/删除/孤儿判定；
--     仅「新上传」的文件会带哈希。旧文件可在后续重新上传时自然补上。
--   · 去重键为 (bucket, sha256)：同一文件作为图片与附件分别上传视为不同资源
--     （两者 bucket、URL 与分发方式不同，合并会破坏前台 img/附件下载语义）。
--
-- 在 Supabase 后台 → SQL Editor 执行本文件。
-- 未执行时后台会自动降级为「会话内去重」，不影响上传功能。
-- ============================================================================

-- 1) 内容哈希列
alter table media add column if not exists sha256 text;

-- 2) 去重查询索引：仅索引非空行（存量 null 不占空间）
create index if not exists media_sha256_idx
  on media (bucket, sha256)
  where sha256 is not null;

-- 3) 自检：应返回两列存在
-- select column_name, data_type
-- from information_schema.columns
-- where table_name = 'media' and column_name in ('sha256','bucket');
