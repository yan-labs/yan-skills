#!/usr/bin/env bash
# Similarweb 关键词生成器 · YouTube 词库 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [keyword] [out-dir]
# 注意: 引擎下拉实测只有 {Google, YouTube}——searchEngine=amazon 不存在（有枚举+截图双证）。
#       tab= 只验证过 phraseMatch；第二个 tab 的参数值未知，别猜。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

KW="${1:-ai image editor}"
KW_ENC="$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$KW")"
OUT="${2:-$ROOT/backlink/evidence/ground-truth/similarweb-kw-generator-youtube-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/999/28d?searchEngine=youtube&webSource=Total&isWWW=*&tab=phraseMatch&keyword=${KW_ENC}"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 240
