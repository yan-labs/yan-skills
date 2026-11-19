#!/usr/bin/env bash
# Semrush Site Audit · 已抓取页面（review/pagereport）双证人采集（见同目录 PAGE.md）
# 用法: collect.sh [campaign-id] [out-dir]
#   campaign-id 必填，也可通过 SEMRUSH_CAMPAIGN_ID 提供
# 注意: 本路由 302 到 /review/pagereport/pages，必须放行该具体路径；
#       accept 的是真别名，绝不是 "/"（放行 "/" 等于把空白页当数据采）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

CID="${1:-${SEMRUSH_CAMPAIGN_ID:?传入 campaign ID 或设置 SEMRUSH_CAMPAIGN_ID}}"
OUT="${2:-$ROOT/backlink/evidence/ground-truth/semrush-siteaudit-pagereport-$(date +%Y%m%d-%H%M%S)}"

URL="https://sem.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/siteaudit/campaign/${CID}/review/pagereport"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 180 --max-screens 16 \
  --accept-redirect "/siteaudit/campaign/${CID}/review/pagereport/pages"
