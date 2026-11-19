#!/usr/bin/env bash
# Semrush Site Audit · 网页可爬性（review/crawlability）双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [campaign-id] [out-dir]
#   campaign-id 必填，也可通过 SEMRUSH_CAMPAIGN_ID 提供
# 配额纪律: ground-truth.mjs 自动持机器级 semrush 锁; 同一时刻只允许一个采集者。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

CID="${1:-${SEMRUSH_CAMPAIGN_ID:?传入 campaign ID 或设置 SEMRUSH_CAMPAIGN_ID}}"
OUT="${2:-$ROOT/backlink/evidence/ground-truth/semrush-siteaudit-crawlability-$(date +%Y%m%d-%H%M%S)}"

URL="https://sem.3ue.co/siteaudit/campaign/${CID}/review/crawlability"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 180 --max-screens 8 \
  --ready-text "分数："
