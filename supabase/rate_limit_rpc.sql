-- ============================================================
-- 限流 / 文章密码防爆破 RPC（补齐 / 校正签名迁移）
-- 依赖：supabase/encryption*.sql 已先执行（unlock_verify 内部调用
--        post_check_password）。schema.sql 非硬依赖（本脚本自建两表）。
-- 背景：线上数据库可能已存在同名函数，但返回类型(RETURNS TABLE 列)
--        与当前代码(api-guard.ts / unlock.ts)不一致，直接
--        create or replace 会报 "cannot change return type"。
--        故先 DROP 再 CREATE，强制对齐到代码期望的签名（对应 M-17）。
-- 幂等：drop if exists + create + create table if not exists + grant
--        （可重跑；重复执行只会重建为一致签名）。
-- ============================================================

-- 0) 先落下旧函数（无论其返回类型如何），避免 create or replace 改返回类型报错
drop function if exists rate_limit_hit(text, int, int);
drop function if exists unlock_locked_for(text);
drop function if exists unlock_record_fail(text, int, int, int, int);
drop function if exists unlock_clear(text);
drop function if exists unlock_guard(text, text, int, int, int);
drop function if exists unlock_verify(text, text, text, int, int, int, int);

create table if not exists rate_limit_state (
  bucket       text primary key,
  hits         int not null default 1,
  window_start timestamptz not null default now()
);

create table if not exists unlock_fail_state (
  bucket       text primary key,
  fails        int not null default 0,
  first_fail   timestamptz not null default now(),
  locked_until timestamptz not null default now()
);

-- 原子限流计数：窗口内命中数 >= p_max 返回 false（拒绝），否则递增并返回 true（放行）
create function rate_limit_hit(p_bucket text, p_max int, p_window_sec int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := now();
  v_row record;
begin
  select hits, window_start into v_row from rate_limit_state where bucket = p_bucket;
  if not found then
    insert into rate_limit_state(bucket, hits, window_start) values (p_bucket, 1, v_now);
    return true;
  end if;
  if v_now - v_row.window_start > (p_window_sec || ' seconds')::interval then
    update rate_limit_state set hits = 1, window_start = v_now where bucket = p_bucket;
    return true;
  end if;
  if v_row.hits >= p_max then
    return false;
  end if;
  update rate_limit_state set hits = hits + 1 where bucket = p_bucket;
  return true;
end;
$$;

-- 查询剩余锁定秒数（0 = 未锁定）
create function unlock_locked_for(p_bucket text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_locked timestamptz;
begin
  select locked_until into v_locked from unlock_fail_state where bucket = p_bucket;
  if not found or v_locked <= now() then
    return 0;
  end if;
  return ceil(extract(epoch from (v_locked - now())))::int;
end;
$$;

-- 记录一次失败；超阈值则指数退避锁定（p_base_lock_sec → 翻倍 → p_max_lock_sec 封顶）
create function unlock_record_fail(
  p_bucket text, p_window_sec int, p_limit int, p_base_lock_sec int, p_max_lock_sec int
) returns table(locked_for_sec int, remaining int)
language plpgsql security definer set search_path = public as $$
declare
  v_now    timestamptz := now();
  v_fails  int := 0;
  v_first  timestamptz := v_now;
  v_locked timestamptz := v_now;
  v_round  int;
  v_lock_ms int;
begin
  select fails, first_fail into v_fails, v_first from unlock_fail_state where bucket = p_bucket;
  if not found or v_now - v_first > (p_window_sec || ' seconds')::interval then
    v_fails := 0; v_first := v_now;
  end if;
  v_fails := v_fails + 1;
  if v_fails >= p_limit then
    v_round := floor(v_fails / p_limit) - 1;
    v_lock_ms := least(p_base_lock_sec * pow(2, greatest(0, v_round)), p_max_lock_sec)::int;
    v_locked := v_now + (v_lock_ms || ' seconds')::interval;
    v_fails := 0; v_first := v_now;
  end if;
  insert into unlock_fail_state(bucket, fails, first_fail, locked_until)
    values (p_bucket, v_fails, v_first, v_locked)
    on conflict (bucket) do update set fails = excluded.fails, first_fail = excluded.first_fail, locked_until = excluded.locked_until;
  return query select
    case when v_locked > v_now then ceil(extract(epoch from (v_locked - v_now)))::int else 0 end,
    greatest(0, p_limit - v_fails);
end;
$$;

-- 解锁成功后清空失败计数
create function unlock_clear(p_bucket text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from unlock_fail_state where bucket = p_bucket;
end;
$$;

-- 合并前置检查：文章级失败锁定（优先）+ IP 级限流
create function unlock_guard(
  p_ip_bucket text, p_fail_bucket text, p_ip_max int, p_window_sec int, p_fail_limit int
) returns table(allowed boolean, block_reason text, retry_after int)
language plpgsql security definer set search_path = public as $$
declare
  v_lock int;
  v_ip_ok boolean;
begin
  select unlock_locked_for(p_fail_bucket) into v_lock;
  if v_lock > 0 then
    return query select false, 'locked'::text, v_lock; return;
  end if;
  select rate_limit_hit(p_ip_bucket, p_ip_max, p_window_sec) into v_ip_ok;
  if not v_ip_ok then
    return query select false, 'rate_limit'::text, p_window_sec; return;
  end if;
  return query select true, null::text, 0;
end;
$$;

-- 合并验密 + 记失败：成功则清计数，失败则记录并锁定
create function unlock_verify(
  p_base text, p_pw text, p_fail_bucket text, p_window_sec int, p_fail_limit int, p_base_lock_sec int, p_max_lock_sec int
) returns table(ok boolean, locked_for_sec int, remaining int)
language plpgsql security definer set search_path = public as $$
declare
  v_lock int;
  v_ok boolean;
  v_rec record;
begin
  select unlock_locked_for(p_fail_bucket) into v_lock;
  if v_lock > 0 then
    return query select false, v_lock, 0; return;
  end if;
  select post_check_password(p_base, p_pw) into v_ok;
  if v_ok then
    perform unlock_clear(p_fail_bucket);
    return query select true, 0, p_fail_limit; return;
  end if;
  select * into v_rec from unlock_record_fail(p_fail_bucket, p_window_sec, p_fail_limit, p_base_lock_sec, p_max_lock_sec);
  return query select false, v_rec.locked_for_sec, v_rec.remaining;
end;
$$;

-- 授权：前端用 anon key 调用 /api/unlock，api-guard 用 anon key 调 rate_limit_hit
grant execute on function rate_limit_hit(text,int,int) to anon, authenticated;
grant execute on function unlock_locked_for(text) to anon, authenticated;
grant execute on function unlock_record_fail(text,int,int,int,int) to anon, authenticated;
grant execute on function unlock_clear(text) to anon, authenticated;
grant execute on function unlock_guard(text,text,int,int,int) to anon, authenticated;
grant execute on function unlock_verify(text,text,text,int,int,int,int) to anon, authenticated;

-- 表本身不暴露给客户端，仅通过上面的 security definer RPC 访问
revoke all on rate_limit_state from anon, authenticated;
revoke all on unlock_fail_state from anon, authenticated;
