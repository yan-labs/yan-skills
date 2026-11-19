#!/usr/bin/env bash
# Similarweb 行业选择器首页 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [out-dir]
# 注意: 本页三条就绪分支全盲，exit 2 是【预期收尾】而不是「空」——
#       217 个行业名全在 deepText 里。判读靠 grep deepText + AI 读图。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

OUT="${1:-$ROOT/backlink/evidence/ground-truth/similarweb-rankings-home-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/markets/webmarketanalysis/home"

node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 180 || [ $? -eq 2 ]
