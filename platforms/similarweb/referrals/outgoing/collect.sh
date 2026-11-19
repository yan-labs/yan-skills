#!/usr/bin/env bash
# Similarweb 引荐出站 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [domain] [out-dir]
# 注意: 本页机器盲（cells=0 且 svgText=0），exit 2 属预期且不可信为「空」。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

DOMAIN="${1:-canva.com}"
SLUG="${DOMAIN//./-}"
OUT="${2:-$ROOT/backlink/evidence/ground-truth/similarweb-referrals-outgoing-${SLUG}-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/websiteanalysis/referrals/*/999/1m?webSource=Total&selectedTab=outgoingTraffic&key=${DOMAIN}"

node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300 || [ $? -eq 2 ]
