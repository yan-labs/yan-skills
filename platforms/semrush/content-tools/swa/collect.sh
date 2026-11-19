#!/usr/bin/env bash
# Semrush SEO Writing Assistant 文档列表 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [out-dir]
# 注意: 本页是卡片列表型（cells=0 且 svgText=0），三条机器判据只有 text 能接；
#       不传 --ready-text 必然烧满预算 exit 2，那不等于「没数据」。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

OUT="${1:-$ROOT/backlink/evidence/ground-truth/semrush-swa-$(date +%Y%m%d-%H%M%S)}"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "https://sem.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/swa/" \
  --out "$OUT" \
  --budget 120 --max-screens 8 \
  --ready-text "质量分数为"
