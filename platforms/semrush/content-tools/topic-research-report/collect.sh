#!/usr/bin/env bash
# Semrush 主题研究 内容创意报表 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh <24hex-savedSearchId> [out-dir]
#   id 没有深链可猜：只能在 /topic-research/ 点「近期搜索」的「查看内容创意」后从 URL 抄。
# 注意: 卡片页型（cells=0 svgText=0 canvas=0），只有 text 分支能接。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

ID="${1:-}"
if [ -z "$ID" ]; then
  echo "用法: collect.sh <24hex-savedSearchId> [out-dir]" >&2
  exit 64
fi
OUT="${2:-$ROOT/backlink/evidence/ground-truth/semrush-topic-research-ideas-$(date +%Y%m%d-%H%M%S)}"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "https://sem.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/topic-research/${ID}/" \
  --out "$OUT" \
  --budget 120 --max-screens 8 \
  --ready-text "Volume:"
