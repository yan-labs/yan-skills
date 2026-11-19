#!/usr/bin/env bash
# Semrush Keyword Research · Keyword Magic Tool 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [keyword] [type] [db]
#   keyword 默认 "graphic design"（空格自动转 +）
#   type    all|phrase|exact|related|broad，默认 all；broad = 广泛匹配（不带 type 参数）
#   db      默认 us
# 配额纪律: ground-truth.mjs 自动持机器级 semrush 锁; 同一时刻只允许一个采集者。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

KW="${1:-graphic design}"
TYPE="${2:-all}"
DB="${3:-us}"
Q="${KW// /+}"
SLUG="${KW// /-}"
OUT="$ROOT/backlink/evidence/ground-truth/semrush-keywordmagic-${SLUG}-${TYPE}-$(date +%Y%m%d-%H%M%S)"

URL="https://sem.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/analytics/keywordmagic/?db=${DB}&q=${Q}"
if [ "$TYPE" != "broad" ]; then
  URL="${URL}&type=${TYPE}"
fi

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 240
