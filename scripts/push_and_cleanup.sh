#!/usr/bin/env bash
#
# push_and_cleanup.sh — 推送功能后自动清理沙箱预览图
#
# 用法：
#   bash scripts/push_and_cleanup.sh [REPO]
# 默认 REPO=/tmp/blog-deploy
#
# 流程：
#   1. git push origin main        （推送失败则脚本中止，不清理）
#   2. cleanup_previews.py --repo  （推送成功后，guard 校验通过才清理）
#
# 说明：
#   - 仅在「推送成功」后才会执行清理（push 失败 -> set -e 中止）。
#   - cleanup 脚本内置 guard：若仓库仍有未推送提交则拒绝删除。
#   - 单个预览图删除失败不影响其余文件，并汇总报告。
set -euo pipefail

REPO="${1:-/tmp/blog-deploy}"
REMOTE="${2:-origin}"
BRANCH="${3:-main}"

echo ">> [1/2] 推送代码：git -C ${REPO} push ${REMOTE} ${BRANCH}"
git -C "${REPO}" push "${REMOTE}" "${BRANCH}"

echo ">> [2/2] 清理沙箱预览图（仅推送成功后触发）"
python3 "${REPO}/scripts/cleanup_previews.py" --repo "${REPO}"

echo ">> 完成。"
