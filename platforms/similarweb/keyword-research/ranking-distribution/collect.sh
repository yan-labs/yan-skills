#!/usr/bin/env bash
# Similarweb 排名分配 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [domain] [months] [out-dir]
# 注意: 本页机器盲（摘要条+DIV 榜），exit 2 属预期且不可信为「空」。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

DOMAIN="${1:-canva.com}"
MONTHS="${2:-2026.07-2026.07}"
SLUG="${DOMAIN//./-}"
OUT="${3:-$ROOT/backlink/evidence/ground-truth/similarweb-ranking-distribution-${SLUG}-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/organicsearch/pageAnalysis/ranking-distribution-v2/${DOMAIN}/840/${MONTHS}?webSource=Total&key=${DOMAIN}"

node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300 || [ $? -eq 2 ]
