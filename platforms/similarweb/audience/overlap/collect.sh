#!/usr/bin/env bash
# Similarweb 受众重叠 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [d1] [d2] [d3] [out-dir]
#   默认 canva.com figma.com adobe.com；key= 逗号多域一次深链即三站对比。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

D1="${1:-canva.com}"
D2="${2:-figma.com}"
D3="${3:-adobe.com}"
OUT="${4:-$ROOT/backlink/evidence/ground-truth/similarweb-audience-overlap-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/websiteanalysis/website-audience/*/999/6m?webSource=Total&key=${D1},${D2},${D3}&selectedTab=overlap"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300
