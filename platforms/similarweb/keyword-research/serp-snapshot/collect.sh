#!/usr/bin/env bash
# Similarweb SERP 快照 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [keyword] [months] [out-dir]
# 注意: 本页机器盲（DOM 列表，无 table 无 svg），exit 2 属预期且不可信为「空」，
#       判读靠 deepText grep + AI 读图。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

KW="${1:-image editor}"
MONTHS="${2:-2026.07-2026.07}"
KW_ENC="$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$KW")"
OUT="${3:-$ROOT/backlink/evidence/ground-truth/similarweb-kw-serpsnapshot-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/acquisition/keyword/organic/search/840/${MONTHS}/serpsnapshot?keyword=${KW_ENC}&tab=0&mtd=false&webSource=Desktop"

node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300 || [ $? -eq 2 ]
