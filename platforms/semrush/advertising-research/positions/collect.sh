#!/usr/bin/env bash
# Semrush Advertising Research · 排名（adwords positions）双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [domain] [db]
#   domain 默认 canva.com
#   db     默认 us
# 配额纪律: ground-truth.mjs 自动持机器级 semrush 锁; 同一时刻只允许一个采集者。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

DOMAIN="${1:-canva.com}"
DB="${2:-us}"
SLUG="${DOMAIN//./-}"
OUT="$ROOT/backlink/evidence/ground-truth/semrush-adwords-positions-${SLUG}-$(date +%Y%m%d-%H%M%S)"

URL="https://sem.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/analytics/adwords/positions/?db=${DB}&q=${DOMAIN}&searchType=domain"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 240
