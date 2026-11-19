#!/usr/bin/env bash
# Similarweb 搜索广告(关键词) 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [keyword] [months] [out-dir]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

KW="${1:-image editor}"
MONTHS="${2:-2026.07-2026.07}"
KW_ENC="$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$KW")"
OUT="${3:-$ROOT/backlink/evidence/ground-truth/similarweb-kw-ads-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/acquisition/keyword/organic/search/999/${MONTHS}/ads?keyword=${KW_ENC}&tab=0&mtd=false&webSource=Desktop&selectedPageTab=Text"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300
