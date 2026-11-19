#!/usr/bin/env bash
# Similarweb AI Traffic 概览 双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [domain] [months] [out-dir]
#   domain 默认 openai.com；months 默认 6m
# 关键: 域名必须走 &key=，路径段保持字面 "*"。少了 key= 页面会呈现「空态等输入」——
#       那不是功能空，是 URL 写错了（第三轮就是这么误判的）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

DOMAIN="${1:-openai.com}"
MONTHS="${2:-6m}"
SLUG="${DOMAIN//./-}"
OUT="${3:-$ROOT/backlink/evidence/ground-truth/similarweb-ai-traffic-${SLUG}-$(date +%Y%m%d-%H%M%S)}"

URL="https://sim.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/#/digitalsuite/ai-traffic/overview/*/999/${MONTHS}?webSource=Total&key=${DOMAIN}"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 240
