#!/usr/bin/env bash
# Similarweb 关键词列表（monitorkeywords）双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [out-dir]
# 只读: 本页有两个写入口（「+ 创建新列表」与行尾 ⋯），都在页面边缘，采集不触碰。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

OUT="${1:-$ROOT/backlink/evidence/ground-truth/similarweb-monitorkeywords-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/acquisition/monitorkeywords/home"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 180
