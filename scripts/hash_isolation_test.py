#!/usr/bin/env python3
"""哈希隔离迁移验证：本地真实 PostgreSQL（需 PG13+，pgcrypto 可用）。

模拟生产现状：posts 表带加密四列、v2/teaser 函数在位、anon 持表级授权，
然后执行 supabase/encryption_hash_private.sql 并断言全部预期行为。

运行：python3 scripts/hash_isolation_test.py
（连接本地 /var/run/postgresql，user=postgres；pg_hba 配 trust）
"""
import json
import sys



POSTS_DDL = """
create table posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null default '',
  content text not null default '',
  excerpt text not null default '',
  published boolean not null default true,
  deleted_at timestamptz,
  lang text not null default 'zh',
  is_encrypted boolean not null default false,
  pass_hash text,
  pass_hint text,
  list_visible boolean not null default false
);
"""

# 生产现状：v2 的 post_check_password + teaser 的三个函数
CURRENT_FUNCTIONS = """
create extension if not exists pgcrypto;

create or replace function post_check_password(p_base text, p_pw text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  select (crypt(p_pw, pass_hash) = pass_hash) into ok
  from posts
  where regexp_replace(slug, '-(en|ja)$', '') = p_base
    and is_encrypted = true and pass_hash is not null
    and published = true and deleted_at is null
  limit 1;
  return coalesce(ok, false);
end $$;

create or replace function post_set_password(p_id uuid, p_pw text, p_hint text, p_list_visible boolean default false)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_base text;
begin
  select regexp_replace(slug, '-(en|ja)$', '') into v_base from posts where id = p_id;
  if v_base is null then return; end if;
  update posts set pass_hash = crypt(p_pw, gen_salt('bf', 10)),
      pass_hint = p_hint, is_encrypted = true, list_visible = p_list_visible
  where regexp_replace(slug, '-(en|ja)$', '') = v_base;
end $$;

create or replace function post_set_list_visible(p_id uuid, p_visible boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_base text;
begin
  select regexp_replace(slug, '-(en|ja)$', '') into v_base from posts where id = p_id;
  if v_base is null then return; end if;
  update posts set list_visible = p_visible
  where regexp_replace(slug, '-(en|ja)$', '') = v_base;
end $$;

create or replace function post_clear_encryption(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_base text;
begin
  select regexp_replace(slug, '-(en|ja)$', '') into v_base from posts where id = p_id;
  if v_base is null then return; end if;
  update posts set pass_hash = null, pass_hint = null, is_encrypted = false, list_visible = false
  where regexp_replace(slug, '-(en|ja)$', '') = v_base;
end $$;

-- 模拟"自动重新授权机制"：anon/authenticated 持表级全权限
grant select, insert, update, references on posts to anon, authenticated;
grant execute on function post_check_password(text, text) to anon, authenticated;
grant execute on function post_set_password(uuid, text, text, boolean) to anon, authenticated;
grant execute on function post_set_list_visible(uuid, boolean) to anon, authenticated;
grant execute on function post_clear_encryption(uuid) to anon, authenticated;
"""

import os
MIGRATION = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                               "supabase", "encryption_hash_private.sql"), encoding="utf-8").read()

passed, failed = [], []


def check(name, cond, detail=""):
    (passed if cond else failed).append(name)
    print(("  ✅ " if cond else "  ❌ ") + name + (f"  [{detail}]" if detail and not cond else ""))


def main():
    import psycopg2

    conn = psycopg2.connect("host=/var/run/postgresql user=postgres dbname=postgres")
    conn.autocommit = True
    cur = conn.cursor()

    print("== 0) 建角色与表（模拟生产现状）")
    cur.execute("drop table if exists posts cascade")
    cur.execute("drop schema if exists private cascade")
    cur.execute("drop function if exists post_check_password(text, text)")
    cur.execute("drop function if exists post_set_password(uuid, text, text, boolean)")
    cur.execute("drop function if exists post_set_password(uuid, text, text)")
    cur.execute("drop function if exists post_set_list_visible(uuid, boolean)")
    cur.execute("drop function if exists post_clear_encryption(uuid)")
    for role in ("anon", "authenticated"):
        cur.execute(f"drop role if exists {role}")
        cur.execute(f"create role {role}")
    cur.execute(POSTS_DDL)
    cur.execute(CURRENT_FUNCTIONS)

    print("== 1) 种子数据：普通文章 + 加密中英对")
    cur.execute("insert into posts (slug, title) values ('projecta0', 'A'), ('projecta0-en', 'A en')")
    cur.execute("insert into posts (slug, title) values ('hello-world', 'HW'), ('hello-world-en', 'HW en')")
    cur.execute("select id from posts where slug = 'hello-world'")
    (zh_id,) = cur.fetchone()
    cur.execute("select post_set_password(%s, 'oldpass1234', '提示', false)", (zh_id,))
    cur.execute("select pass_hash from posts where slug = 'hello-world'")
    (h_before,) = cur.fetchone()
    check("迁移前哈希存在（bcrypt）", h_before and h_before.startswith("$2a$"), (h_before or "")[:10])
    cur.execute("select count(*) from posts where is_encrypted")
    check("迁移前 2 行加密", cur.fetchone()[0] == 2)

    print("== 2) 执行迁移脚本")
    try:
        cur.execute(MIGRATION)
    except Exception as e:
        conn.rollback()
        print("迁移执行失败:", e)
        sys.exit(1)

    print("== 2b) 幂等性：原样再跑一遍")
    try:
        cur.execute(MIGRATION)
        check("第二遍执行不报错", True)
    except Exception as e:
        conn.rollback()
        check("第二遍执行不报错", False, str(e))
    cur.execute("select count(*) from private.post_passwords")
    check("第二遍后哈希行数不变", cur.fetchone()[0] == 2)
    cur.execute("select post_check_password('hello-world', 'oldpass1234')")
    check("第二遍后密码仍可校验", cur.fetchone()[0] is True)

    print("== 3) 迁移后结构断言")
    cur.execute("""select count(*) from information_schema.columns
                   where table_schema='public' and table_name='posts' and column_name='pass_hash'""")
    check("posts.pass_hash 列已删除", cur.fetchone()[0] == 0)
    cur.execute("select count(*) from private.post_passwords")
    check("私有表有 2 行哈希", cur.fetchone()[0] == 2)
    cur.execute("select pass_hash from private.post_passwords h join posts p on p.id=h.post_id where p.slug='hello-world'")
    (h_after,) = cur.fetchone()
    check("哈希内容原样迁移", h_after == h_before)
    cur.execute("select has_table_privilege('anon','private.post_passwords','SELECT')")
    check("anon 对私有表无 SELECT", cur.fetchone()[0] is False)
    cur.execute("""select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname='post_set_password'""")
    check("post_set_password 仅剩四参重载", cur.fetchone()[0] == 1)

    print("== 4) 函数行为断言")
    cur.execute("select post_check_password('hello-world', 'oldpass1234')")
    check("旧密码仍可校验（迁移透明）", cur.fetchone()[0] is True)
    cur.execute("select post_check_password('hello-world', 'wrong')")
    check("错误密码被拒", cur.fetchone()[0] is False)
    cur.execute("""select (crypt('oldpass1234', h.pass_hash) = h.pass_hash)
                   from private.post_passwords h join posts p on p.id = h.post_id
                   where p.slug = 'hello-world-en'""")
    check("组级传播：英文行哈希独立存在且有效", cur.fetchone()[0] is True)
    cur.execute("select post_check_password('projecta0', 'x')")
    check("未加密文章校验返回 false", cur.fetchone()[0] is False)

    cur.execute("select post_set_password(%s, 'newpass9999', '新提示', true)", (zh_id,))
    cur.execute("select post_check_password('hello-world', 'newpass9999')")
    check("迁移后改密码生效", cur.fetchone()[0] is True)
    cur.execute("select post_check_password('hello-world', 'oldpass1234')")
    check("旧密码改后失效", cur.fetchone()[0] is False)
    cur.execute("select is_encrypted, pass_hint, list_visible from posts where slug='hello-world'")
    row = cur.fetchone()
    check("posts 行标志位正确（teaser=true）", row == (True, "新提示", True), str(row))
    cur.execute("select count(*) from private.post_passwords")
    check("改密码不产生重复行", cur.fetchone()[0] == 2)

    cur.execute("select post_set_list_visible(%s, false)", (zh_id,))
    cur.execute("select list_visible from posts where slug='hello-world-en'")
    check("teaser 显隐按组传播", cur.fetchone()[0] is False)

    print("== 5) 结构性免疫（模拟自动授权机制再次出手）")
    cur.execute("grant all on all tables in schema public to anon, authenticated")
    cur.execute("set role anon")
    try:
        cur.execute("select * from posts limit 1")
        cols = [d[0] for d in cur.description]
        check("anon select('*') 也拿不到 pass_hash", "pass_hash" not in cols, str(cols))
        try:
            cur.execute("select pass_hash from private.post_passwords limit 1")
            check("anon 读私有表被拒", False, "竟然读到了")
        except psycopg2.Error:
            conn.rollback()
            check("anon 读私有表被拒", True)
    except psycopg2.Error as e:
        conn.rollback()
        check("anon select('*') 不报错", False, str(e))
    finally:
        cur.execute("reset role")

    print("== 6) 解密恢复")
    cur.execute("select post_clear_encryption(%s)", (zh_id,))
    cur.execute("select is_encrypted, pass_hint, list_visible from posts where slug='hello-world'")
    check("解密后 posts 标志位清零", cur.fetchone() == (False, None, False))
    cur.execute("select count(*) from private.post_passwords")
    check("解密后私有表哈希行删除", cur.fetchone()[0] == 0)

    conn.close()
    print(f"\n结果：{len(passed)} 通过 / {len(failed)} 失败")
    if failed:
        print("失败项:", failed)
        sys.exit(1)


if __name__ == "__main__":
    main()
