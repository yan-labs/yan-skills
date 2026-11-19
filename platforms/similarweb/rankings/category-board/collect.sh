#!/usr/bin/env bash
# Similarweb 站点排名类目榜 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [slug] [out-dir]
#   slug 形如 大类~子类（可读可猜）；国家段固定 999（深链改国无效，换国走 UI）
# 注意: 主榜列主序 DIV 不产 cells，就绪分支可能不触发（exit 2 不可信为「空」）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

SLUG="${1:-Computers_Electronics_and_Technology~Graphics_Multimedia_and_Web_Design}"
OUT="${2:-$ROOT/backlink/evidence/ground-truth/similarweb-rankings-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/markets/webmarketanalysis/mapping/${SLUG}/999/1m?webSource=Total"

node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300 || [ $? -eq 2 ]
