#!/usr/bin/env bash
# Similarweb 需求分析首页 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [out-dir]
# 注意: 本页无表格，就绪分支可能不触发（exit 2 不可信为「空」）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

OUT="${1:-$ROOT/backlink/evidence/ground-truth/similarweb-demand-home-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/marketresearch/keywordmarketresearch/home"

node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300 || [ $? -eq 2 ]
