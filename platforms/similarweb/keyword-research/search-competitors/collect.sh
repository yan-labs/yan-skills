#!/usr/bin/env bash
# Similarweb 搜索竞争对手 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [domain] [out-dir]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

DOMAIN="${1:-canva.com}"
SLUG="${DOMAIN//./-}"
OUT="${2:-$ROOT/backlink/evidence/ground-truth/similarweb-search-competitors-${SLUG}-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/acquisition/websiteanalysis/website-competitors/${DOMAIN}/999/3m?webSource=Total&selectedPageTab=Organic&key=${DOMAIN}"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300
