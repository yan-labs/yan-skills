#!/usr/bin/env bash
# Semrush 主题研究 入口页 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [out-dir]
# 注意: 表单 + 历史列表页型，三条机器判据全盲；不传 --ready-text 必然 exit 2，
#       那不等于「没数据」。报表本体在 ../topic-research-report/。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

OUT="${1:-$ROOT/backlink/evidence/ground-truth/semrush-topic-research-$(date +%Y%m%d-%H%M%S)}"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "https://sem.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/topic-research/" \
  --out "$OUT" \
  --budget 120 --max-screens 6 \
  --ready-text "获取内容创意"
