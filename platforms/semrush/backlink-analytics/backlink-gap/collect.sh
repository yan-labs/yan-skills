#!/usr/bin/env bash
# Semrush Backlink Gap 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [you] [comp1] [comp2]
#   默认 canva.com figma.com adobe.com
# 注意: compareWith 条目 = <域名>%3Adomain（比 Keyword Gap 少 :organic 段），
#   条目间用管道 %7C —— 逗号会触发假付费墙（详见 PAGE.md 已知坑）。
#   落点会 302 到 /analytics/gap/backlinks/report/，前缀自检天然通过。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

YOU="${1:-canva.com}"
COMP1="${2:-figma.com}"
COMP2="${3:-adobe.com}"

OUT="$ROOT/backlink/evidence/ground-truth/semrush-backlinkgap-${YOU//./-}-$(date +%Y%m%d-%H%M%S)"

URL="https://sem.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/analytics/gap/backlinks/?q=${YOU}&searchType=domain&compareWith=${COMP1}%3Adomain%7C${COMP2}%3Adomain"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 240
