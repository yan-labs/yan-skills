#!/usr/bin/env bash
# Similarweb 网站关键词 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [domain] [out-dir]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

DOMAIN="${1:-canva.com}"
SLUG="${DOMAIN//./-}"
OUT="${2:-$ROOT/backlink/evidence/ground-truth/similarweb-site-keywords-${SLUG}-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/organicsearch/pageAnalysis/website-keyword-v2/${DOMAIN}/999/3m?webSource=Total&selectedPageTab=Total&key=${DOMAIN}"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300
