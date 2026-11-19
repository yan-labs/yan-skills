#!/usr/bin/env bash
# Similarweb 需求分析主题报表 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [topic] [out-dir]
#   topic 默认 "image editor"（先在首页联想里确认主题存在再深链）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

TOPIC="${1:-image editor}"
TOPIC_ENC="$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$TOPIC")"
OUT="${2:-$ROOT/backlink/evidence/ground-truth/similarweb-demand-topic-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/marketresearch/keywordmarketanalysissearch/demand-search-trends?country=999&webSource=Total&duration=12m&id=AiTopic%3B${TOPIC_ENC}%3B999"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300
