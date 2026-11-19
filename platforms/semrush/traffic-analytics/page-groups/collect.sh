#!/usr/bin/env bash
# Semrush Traffic Analytics · Page Groups 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [domain] [out-dir]
#   domain  默认 canva.com
#   out-dir 默认 backlink/evidence/ground-truth/semrush-page-groups-<域名前缀>-<时间戳>
# 配额纪律: ground-truth.mjs 自动持机器级 semrush 锁; 同一时刻只允许一个采集者。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

DOMAIN="${1:-canva.com}"
SLUG="${DOMAIN//./-}"
OUT="${2:-$ROOT/backlink/evidence/ground-truth/semrush-page-groups-${SLUG}-$(date +%Y%m%d-%H%M%S)}"

URL="https://sem.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/analytics/traffic/page-groups/?q=${DOMAIN}&searchType=domain"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 240
