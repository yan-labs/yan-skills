#!/usr/bin/env bash
# Semrush Keyword Gap 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [you] [comp1] [comp2] [bucket]
#   you/comp1/comp2 默认 canva.com figma.com express.adobe.com（必须凑满对比集，
#   单域名只会采到退化表单态）
#   bucket 默认 missing，可选 common|missing|weak|strong|untapped|unique|all
# 注意: compareWith 条目用管道 %7C 分隔——逗号会触发假付费墙（详见 PAGE.md 已知坑）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

YOU="${1:-canva.com}"
COMP1="${2:-figma.com}"
COMP2="${3:-express.adobe.com}"
BUCKET="${4:-missing}"

OUT="$ROOT/backlink/evidence/ground-truth/semrush-keywordgap-${YOU//./-}-${BUCKET}-$(date +%Y%m%d-%H%M%S)"

URL="https://sem.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/analytics/keywordgap/?q=${YOU}&searchType=domain&rankType=${BUCKET}&db=us&compareWith=${COMP1}%3Adomain%3Aorganic%7C${COMP2}%3Adomain%3Aorganic"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 240
