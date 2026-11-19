#!/usr/bin/env bash
# Similarweb 关键词生成器 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [keyword] [tab] [out-dir]
#   tab 默认 phraseMatch，可选 related|trending|questions
# 注意: 本页机器盲（DIV 榜），exit 2 属预期且不可信为「空」；
#       searchEngine=amazon/youtube 冷深链落错误页（未验证成功，别用）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

KW="${1:-image editor}"
TAB="${2:-phraseMatch}"
KW_ENC="$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$KW")"
OUT="${3:-$ROOT/backlink/evidence/ground-truth/similarweb-kw-generator-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/999/28d?searchEngine=google&webSource=Total&isWWW=*&tab=${TAB}&keyword=${KW_ENC}"

node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300 || [ $? -eq 2 ]
