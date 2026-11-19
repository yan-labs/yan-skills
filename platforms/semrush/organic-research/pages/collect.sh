#!/usr/bin/env bash
# Semrush Organic Research · 主要页面(toppages) 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [domain]   # 默认 canva.com
# 注意: 正主 URL 是 /analytics/toppages/;用 /analytics/organic/pages/ 会 302
#       并被 collector 的落点自检判成 hijack(exit 3)。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

DOMAIN="${1:-canva.com}"

OUT="$ROOT/backlink/evidence/ground-truth/semrush-organic-pages-${DOMAIN//./-}-$(date +%Y%m%d-%H%M%S)"

URL="https://sem.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/analytics/toppages/?db=us&q=${DOMAIN}&searchType=domain"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 240
