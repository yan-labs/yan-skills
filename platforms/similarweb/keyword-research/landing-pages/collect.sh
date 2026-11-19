#!/usr/bin/env bash
# Similarweb 着陆页 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [domain] [months] [out-dir]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

DOMAIN="${1:-canva.com}"
MONTHS="${2:-2026.07-2026.07}"
SLUG="${DOMAIN//./-}"
OUT="${3:-$ROOT/backlink/evidence/ground-truth/similarweb-landing-pages-${SLUG}-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/organicsearch/pageAnalysis/landing-pages-v2/${DOMAIN}/999/${MONTHS}?webSource=Total&selectedPageTab=Organic&key=${DOMAIN}"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300
