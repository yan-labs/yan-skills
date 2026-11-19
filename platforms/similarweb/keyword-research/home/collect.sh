#!/usr/bin/env bash
# Similarweb Keyword Research 首页 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [out-dir]
# 注意: 本页机器盲（cells=0 且 svgText=0），ground-truth 会以 exit 2 结束——
#       exit 2 在本页不可信为「空」，判读靠 deepText grep + AI 读图。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

OUT="${1:-$ROOT/backlink/evidence/ground-truth/similarweb-kw-home-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/organicsearch/websiteanalysis/home"

node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300 || [ $? -eq 2 ]
