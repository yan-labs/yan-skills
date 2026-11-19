#!/usr/bin/env bash
# Semrush .Trends 行业与批量分析（Bulk Analysis）双证人快照（见同目录 PAGE.md）
# 用法: collect.sh
#   打开本页做双证人快照——页面带 lid 记忆,采到的是上次提交批次的结果;
#   判读前核对域名集合。提交新一批域名要走 PAGE.md 的文件上传配方
#   (自绘行编辑器打字丢行,只有 File+DataTransfer 上传可靠),尚无独立脚本。
# 配额纪律: ground-truth.mjs 自动持机器级 semrush 锁; 同一时刻只允许一个采集者。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"

OUT="$ROOT/backlink/evidence/ground-truth/semrush-bulk-analysis-$(date +%Y%m%d-%H%M%S)"

URL="https://sem.${TOOLS_SHARE_DOMAIN:?Set TOOLS_SHARE_DOMAIN}/analytics/traffic/industry-and-bulk-analysis/"

exec node "$ROOT/backlink/scripts/ground-truth.mjs" \
  --url "$URL" \
  --out "$OUT" \
  --budget 300
