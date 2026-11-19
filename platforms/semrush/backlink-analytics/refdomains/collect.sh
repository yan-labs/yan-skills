#!/usr/bin/env bash
# Semrush Backlink Analytics · 引荐域名 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [domain] [out-dir]
#   domain  默认 canva.com
# 注意: 正路是 /analytics/refdomains/report/ —— /analytics/backlinks/refdomains/ 是
#   死路由 302 回 overview（详见 PAGE.md 已知坑）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

DOMAIN="${1:-canva.com}"
SLUG="${DOMAIN//./-}"
OUT="${2:-$ROOT/backlink/evidence/ground-truth/semrush-backlinks-refdomains-${SLUG}-$(date +%Y%m%d-%H%M%S)}"

URL="https://sem.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/analytics/refdomains/report/?q=${DOMAIN}&searchType=domain"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 240
