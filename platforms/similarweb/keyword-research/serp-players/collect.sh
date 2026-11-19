#!/usr/bin/env bash
# Similarweb SERP 市场参与者 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [keyword] [out-dir]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

KW="${1:-image editor}"
KW_ENC="$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$KW")"
OUT="${2:-$ROOT/backlink/evidence/ground-truth/similarweb-kw-serp-players-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/acquisition/keyword/organic/search/999/28d/keywordAnalysis_2?keyword=${KW_ENC}&tab=0&mtd=false&webSource=Desktop&selectedPageTab=Total&graphDuration=28d&timeGranularity=Weekly"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300
