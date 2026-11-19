#!/usr/bin/env bash
# Similarweb 关键词概况 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [keyword] [months] [out-dir]
#   keyword 默认 "image editor"；months 默认 2026.07-2026.07
# 注意: 关键词只能走 ?keyword= query，写进路径段会被静默重定向（hijack, exit 3）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

KW="${1:-image editor}"
MONTHS="${2:-2026.07-2026.07}"
KW_ENC="$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$KW")"
OUT="${3:-$ROOT/backlink/evidence/ground-truth/similarweb-kw-overview-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/acquisition/keyword/organic/search/999/${MONTHS}/overview_2?keyword=${KW_ENC}&tab=0&mtd=false&webSource=Total&graphGranularity=Weekly&graphDuration=1m&keywordIdeasTab=relatedKeywords"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300
