#!/usr/bin/env bash
# Semrush .Trends 市场概览 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [lid]
#   lid 市场列表 id（页面身份所在；q= 参数不被吃）。默认 1234565（canva.com 市场,
#   2026-08-30 表单生成）。新建市场没有现成 lid——先走表单配方(见 PAGE.md),
#   隔 15-60 分钟再用生成的 lid 跑本脚本。
# 注意: 新列表异步计算可空骨架 40+ 分钟——exit 2 是 computing 不是空页,回访即可。
# 配额纪律: ground-truth.mjs 自动持机器级 semrush 锁; 同一时刻只允许一个采集者。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

LID="${1:-1234565}"
OUT="$ROOT/backlink/evidence/ground-truth/semrush-market-overview-lid${LID}-$(date +%Y%m%d-%H%M%S)"

URL="https://sem.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/analytics/traffic/market-overview/?lid=${LID}"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300
