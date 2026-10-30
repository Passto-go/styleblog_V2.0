#!/usr/bin/env python3
"""
cleanup_previews.py — 功能推送/提交成功后清理沙箱预览图

设计约束
--------
1. 触发约束（仅在功能提交完成后删除）：
   - 本脚本只负责「删除预览图 + 容错」，是否「功能已提交并推送」由调用方保证。
   - 传入 --repo 时，会校验该仓库是否存在未推送的本地提交
     （origin/<upstream>..HEAD 非空）。若有未推送提交，则视为触发条件不满足，
     拒绝删除并以退出码 2 退出，防止在功能尚未上线时误删预览证据。
2. 容错处理：
   - 逐个文件删除，单文件失败（权限/不存在/IO 错误）不影响其余文件。
   - 全程不抛出未捕获异常，统一汇总成功/失败结果。
   - 退出码：0 = 全部成功或无匹配文件；1 = 部分失败；2 = 触发条件不满足（未推送）。
3. 默认只扫描指定目录的顶层（不递归），避免误删子目录中的非预览资源
   （如布局快照、预览构建产物等）。

集成方式
--------
方式 A（命令链，推荐）：
    git push origin main && python3 scripts/cleanup_previews.py --repo /tmp/blog-deploy

方式 B（wrapper 一键串联）：
    bash scripts/push_and_cleanup.sh /tmp/blog-deploy

使用 --dry-run 可先预览将被删除的文件清单而不实际删除。
"""

import argparse
import glob
import os
import subprocess
import sys


# 预览图的文件名模式（大小写不敏感匹配由调用方路径决定，此处用常见命名）
DEFAULT_PATTERNS = ["shot*.png", "截屏*.png", "preview*.png", "screenshot*.png"]


def check_pushed(repo: str):
    """检查仓库是否存在未推送的本地提交。

    返回 (status, message)：
      - (True,  msg)：已完全推送（无未推送提交），可清理。
      - (False, msg)：存在未推送提交，应拒绝清理。
      - (None,  msg)：无法确定上游（无 upstream 或 git 异常），交由 --strict 决定。
    """
    try:
        up = subprocess.run(
            ["git", "-C", repo, "rev-parse", "--abbrev-ref", "HEAD@{upstream}"],
            capture_output=True, text=True, timeout=15,
        )
        if up.returncode != 0 or not up.stdout.strip():
            return None, "无法确定上游分支（无 upstream），跳过推送校验"
        rng = f"{up.stdout.strip()}..HEAD"
        out = subprocess.run(
            ["git", "-C", repo, "rev-list", "--count", rng],
            capture_output=True, text=True, timeout=15,
        )
        count = int((out.stdout or "0").strip() or 0)
        return (count == 0, f"未推送提交数 = {count}")
    except Exception as e:  # noqa: BLE001 - 校验失败不应中断清理流程
        return None, f"推送校验异常：{e}"


def collect_targets(dirs, patterns, recursive):
    targets = []
    for d in dirs:
        if not os.path.isdir(d):
            print(f"[warn] 目录不存在，跳过：{d}", file=sys.stderr)
            continue
        for pat in patterns:
            for f in sorted(glob.glob(os.path.join(d, pat), recursive=recursive)):
                if os.path.isfile(f):
                    targets.append(f)
    # 去重并保持稳定顺序
    seen = set()
    uniq = []
    for f in targets:
        if f not in seen:
            seen.add(f)
            uniq.append(f)
    return uniq


def main():
    parser = argparse.ArgumentParser(
        description="功能推送/提交成功后清理沙箱预览图（仅顶层，逐文件容错）",
    )
    parser.add_argument(
        "--dirs", nargs="+", default=["/workspace"],
        help="要扫描的目录（默认 /workspace）。",
    )
    parser.add_argument(
        "--patterns", nargs="+", default=DEFAULT_PATTERNS,
        help="文件名匹配模式（默认 shot*/截屏*/preview*/screenshot*）。",
    )
    parser.add_argument(
        "--recursive", action="store_true",
        help="递归子目录（默认关闭，避免误删非预览资源）。",
    )
    parser.add_argument(
        "--repo", default=None,
        help="Git 仓库路径；传入后做「未推送提交」校验，未推送则拒绝清理。",
    )
    parser.add_argument(
        "--strict", action="store_true",
        help="当 --repo 无法确定上游时也拒绝清理（默认无法确定时放行并告警）。",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="只打印将删除的文件，不实际删除。",
    )
    args = parser.parse_args()

    # —— 触发条件 guard ——
    if args.repo:
        status, msg = check_pushed(args.repo)
        if status is False:
            print(f"[guard] 触发条件不满足：{msg}，拒绝清理预览图。", file=sys.stderr)
            sys.exit(2)
        elif status is None:
            if args.strict:
                print(f"[guard] 严格模式：{msg}，拒绝清理。", file=sys.stderr)
                sys.exit(2)
            print(f"[guard] 警告：{msg}，放行。", file=sys.stderr)
        else:
            print(f"[guard] 推送校验通过：{msg}")

    # —— 收集目标 ——
    targets = collect_targets(args.dirs, args.patterns, args.recursive)
    if not targets:
        print("[done] 未找到匹配的预览图，无需清理。")
        sys.exit(0)

    if args.dry_run:
        print(f"[dry-run] 将删除 {len(targets)} 个文件：")
        for f in targets:
            print(f"  - {f}")
        sys.exit(0)

    # —— 逐个删除（容错）——
    ok, fail = [], []
    for f in targets:
        try:
            os.remove(f)
            ok.append(f)
        except OSError as e:
            fail.append((f, str(e)))

    print(f"[done] 成功删除 {len(ok)} 个，失败 {len(fail)} 个。")
    for f in ok:
        print(f"  [OK]   {f}")
    for f, err in fail:
        print(f"  [FAIL] {f}: {err}", file=sys.stderr)

    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
