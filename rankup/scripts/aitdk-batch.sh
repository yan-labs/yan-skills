#!/usr/bin/env bash
#
# aitdk-batch.sh — run aitdk-opencli.sh over several URLs concurrently.
#
# Each concurrent worker gets its own OpenCLI `--window dedicated` slot, explicitly
# tiled (via --window-bounds) into a non-overlapping rectangle of the automation
# display so N windows can render at once without covering each other — Chromium's
# render throttling is driven by physical occlusion, not focus (rankup discipline.md
# 十九), so "not covered" is the actual requirement, not "in front". No window is ever
# raised to the OS foreground and the user's own window/tab is never touched. See the
# "window modes" comment at the top of aitdk-opencli.sh for the full story on why this
# script exists (it used to hardcode `--window foreground`, serializing every run and
# stealing the user's active tab each time).
#
# Usage:
#   aitdk-batch.sh [options] <url> [<url> ...]
#
# Options:
#   --concurrency N     number of parallel workers (default: 3)
#   --out-dir DIR        where reports + manifest.json go (default:
#                        ./aitdk-batch-<timestamp>/)
#   --retries N          retries per URL after the first attempt (default: 1, i.e. up
#                        to 2 attempts total)
#   --skip-panel         pass through to aitdk-opencli.sh (Part A only, no AITDK panel)
#   --window <mode>      dedicated (default) | foreground. foreground cannot run more
#                        than one window at once (it raises a single OS window), so
#                        --concurrency is forced to 1 and a warning is printed.
#   --dry-run            compute and print the worker/tiling/URL plan, touch nothing
#                        (no opencli or Chrome calls) — use this to validate the script
#                        before Chrome is actually free for real automation.
#
# Output: prints the manifest path to stdout on success. <out-dir>/manifest.json is a
# JSON array, one object per URL: {url, worker, slot, session, attempts, status,
# output, duration_sec, error}. `status` is "ok" (panel captured, well-formed report),
# "ok-with-warnings" (report written but aitdkPanel.ok is false — inspect
# aitdkPanel.errors before trusting scores), or a failure reason string — a failed URL
# is NEVER silently recorded as a zero/empty score, only as one of these explicit
# statuses. The script's own exit code is 0 as long as it completed the whole batch and
# wrote a manifest, regardless of individual URL outcomes — check the manifest for
# per-URL results, don't infer them from this process's exit code.
#
set -uo pipefail
# Job control on, even though this runs non-interactively: it's the only portable way
# to give each backgrounded worker its OWN process group, so an interrupt can kill
# exactly that worker's whole subtree (`kill -TERM -- -$pid`) instead of either doing
# nothing to its grandchildren (a plain `kill $pid` on a shell blocked on a foreground
# child does not reach that child — the classic orphaned-process failure mode from
# discipline.md 八) or `kill 0`, which would hit THIS script's own process group and
# risk killing whatever invoked it.
set -m

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AITDK_SCRIPT="$SCRIPT_DIR/aitdk-opencli.sh"
OPENCLI_BIN="${OPENCLI_BIN:-node /Users/kcsx/Project/kcsx/opencli/dist/src/main.js}"

if [[ -t 2 ]]; then
  C_INFO=$'\033[36m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_RESET=$'\033[0m'
else
  C_INFO=''; C_OK=''; C_WARN=''; C_ERR=''; C_RESET=''
fi
log()  { printf '%s[*]%s %s\n' "$C_INFO" "$C_RESET" "$*" >&2; }
ok()   { printf '%s[+]%s %s\n' "$C_OK" "$C_RESET" "$*" >&2; }
warn() { printf '%s[!]%s %s\n' "$C_WARN" "$C_RESET" "$*" >&2; }
err()  { printf '%s[x]%s %s\n' "$C_ERR" "$C_RESET" "$*" >&2; }

usage() {
  cat >&2 <<'EOF'
Usage: aitdk-batch.sh [options] <url> [<url> ...]
  --concurrency N    parallel workers (default 3)
  --out-dir DIR       output directory (default ./aitdk-batch-<ts>/)
  --retries N         retries per URL after the first attempt (default 1)
  --skip-panel        Part A only, passed through to aitdk-opencli.sh
  --window <mode>     dedicated (default) | foreground (forces --concurrency 1)
  --dry-run           print the plan, make no opencli/Chrome calls
EOF
}

# ---------- args ----------
CONCURRENCY=3
OUT_DIR=""
RETRIES=1
SKIP_PANEL=0
WINDOW_MODE="dedicated"
DRY_RUN=0
URLS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --concurrency) CONCURRENCY="${2:-}"; shift 2 ;;
    --out-dir) OUT_DIR="${2:-}"; shift 2 ;;
    --retries) RETRIES="${2:-}"; shift 2 ;;
    --skip-panel) SKIP_PANEL=1; shift ;;
    --window) WINDOW_MODE="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; while [[ $# -gt 0 ]]; do URLS+=("$1"); shift; done ;;
    -*) err "Unknown option: $1 (see --help)"; exit 1 ;;
    *) URLS+=("$1"); shift ;;
  esac
done

if [[ ${#URLS[@]} -eq 0 ]]; then
  usage
  exit 1
fi
if [[ ! "$CONCURRENCY" =~ ^[0-9]+$ || "$CONCURRENCY" -lt 1 ]]; then
  err "--concurrency must be a positive integer (got: $CONCURRENCY)"
  exit 1
fi
if [[ ! "$RETRIES" =~ ^[0-9]+$ ]]; then
  err "--retries must be a non-negative integer (got: $RETRIES)"
  exit 1
fi
if [[ "$WINDOW_MODE" != "dedicated" && "$WINDOW_MODE" != "foreground" ]]; then
  err "--window must be 'dedicated' or 'foreground' (got: $WINDOW_MODE)"
  exit 1
fi
if [[ "$WINDOW_MODE" == "foreground" && "$CONCURRENCY" -gt 1 ]]; then
  warn "--window foreground raises one OS window at a time — forcing --concurrency 1 (was $CONCURRENCY)"
  CONCURRENCY=1
fi
if [[ "$CONCURRENCY" -gt "${#URLS[@]}" ]]; then
  CONCURRENCY=${#URLS[@]}
fi
if [[ "$CONCURRENCY" -gt 8 ]]; then
  warn "--concurrency $CONCURRENCY is high for a single display — dedicated windows will be tiled very narrow; verify the reports are actually complete, not just that the run finished"
fi

command -v jq >/dev/null 2>&1 || { err "jq is required (used to parse window status and verify reports)"; exit 1; }
[[ -x "$AITDK_SCRIPT" || -f "$AITDK_SCRIPT" ]] || { err "aitdk-opencli.sh not found next to this script ($AITDK_SCRIPT)"; exit 1; }

RUN_ID="$(date +%s)$((RANDOM % 100))"
OUT_DIR="${OUT_DIR:-./aitdk-batch-$(date -u +%Y%m%dT%H%M%SZ)}"
if [[ "$DRY_RUN" -eq 1 ]]; then
  # Don't touch the filesystem for a plan-only run — print the path as given/defaulted,
  # not its resolved realpath (the directory may not exist yet).
  :
else
  mkdir -p "$OUT_DIR/logs" "$OUT_DIR/.fragments"
  OUT_DIR="$(cd "$OUT_DIR" && pwd)"
fi

# ---------- capacity + tiling: split the automation display into a non-overlapping grid ----------
# Explicit --window-bounds does NOT bypass OpenCLI's own capacity gate — this was this
# script's original design assumption and it is WRONG, disproved by a real run
# (2026-09-25): `assertDedicatedCapacity()` in the extension (background.ts) runs before
# ANY new dedicated window is created, for every slot, regardless of whether the caller
# gave explicit bounds — it only checks `live >= dedicatedCapacity(displayArea)`, where
# dedicatedCapacity is computed from the display's pixel area divided by a hardcoded
# 900x620 minimum tile. A 2nd/3rd worker's `open` therefore fails immediately with
# `dedicated-pool-exhausted`, not "renders in a squeezed window" as the tiling math
# below would suggest. On this machine's single ~1512x949 display that hard limit is
# exactly 1 concurrent dedicated window — verified via `window status -f json`'s
# `pool.capacity` and by hitting the real error. There is no CLI flag or env var to
# raise it (the 900x620 constant is not configurable) — doing so would require changing
# OpenCLI's extension source, which is out of this script's scope.
#
# So: read the REAL capacity before deciding how many workers to actually launch, and
# clamp down to it rather than optimistically firing N workers that mostly fail. cols/rows
# below (ceil(sqrt(N)) grid, same shape as the extension's own `dedicatedGrid`) are sized
# to the clamped worker count, not the originally requested one — on a machine whose
# automation display is bigger (or that has a second display OpenCLI can target), the
# same mechanism gives genuine N-way concurrency; on a single laptop-sized display it
# safely degrades to running one worker at a time instead of failing.
AREA_LEFT=0; AREA_TOP=0; AREA_WIDTH=1512; AREA_HEIGHT=900
if [[ "$WINDOW_MODE" == "dedicated" ]]; then
  STATUS_JSON="$($OPENCLI_BIN browser "aitdk-batch-probe-${RUN_ID}" window status -f json 2>/dev/null || echo '{}')"
  if echo "$STATUS_JSON" | jq -e '.supported == true' >/dev/null 2>&1; then
    AREA_JSON="$(echo "$STATUS_JSON" | jq -c '.pool.automationDisplay.area // (.displays[0].workArea // .displays[0].bounds) // empty' 2>/dev/null)"
    if [[ -n "$AREA_JSON" && "$AREA_JSON" != "null" ]]; then
      AREA_LEFT="$(echo "$AREA_JSON" | jq -r '.left // 0')"
      AREA_TOP="$(echo "$AREA_JSON" | jq -r '.top // 0')"
      AREA_WIDTH="$(echo "$AREA_JSON" | jq -r '.width // 1512')"
      AREA_HEIGHT="$(echo "$AREA_JSON" | jq -r '.height // 900')"
    else
      warn "opencli window status returned no usable display area — falling back to a conservative 1512x900 assumption; tiles may not match the real screen"
    fi
    REAL_CAPACITY="$(echo "$STATUS_JSON" | jq -r '.pool.capacity // empty' 2>/dev/null)"
    if [[ -n "$REAL_CAPACITY" && "$REAL_CAPACITY" =~ ^[0-9]+$ && "$REAL_CAPACITY" -ge 1 && "$REAL_CAPACITY" -lt "$CONCURRENCY" ]]; then
      warn "OpenCLI's dedicated-window pool can only show $REAL_CAPACITY window(s) at once on this display (900x620 minimum tile, hard limit — not something this script can raise) — clamping --concurrency $CONCURRENCY down to $REAL_CAPACITY. Workers beyond that still run, just one at a time as a slot frees up"
      CONCURRENCY="$REAL_CAPACITY"
    fi
  else
    warn "this OpenCLI/extension does not report dedicated-window support (window status -f json didn't say supported:true) — dedicated tiling may not work; consider --window foreground with --concurrency 1"
  fi
fi

cols=1
while (( cols * cols < CONCURRENCY )); do cols=$((cols + 1)); done
rows=$(( (CONCURRENCY + cols - 1) / cols ))
TILE_W=$(( AREA_WIDTH / cols ))
TILE_H=$(( AREA_HEIGHT / rows ))
if [[ "$WINDOW_MODE" == "dedicated" && ( "$TILE_W" -lt 250 || "$TILE_H" -lt 250 ) ]]; then
  warn "computed tile is ${TILE_W}x${TILE_H} for $CONCURRENCY workers on a ${AREA_WIDTH}x${AREA_HEIGHT} area — likely too narrow for AITDK's panel to render; lower --concurrency"
fi

log "Plan: ${#URLS[@]} URL(s), concurrency=$CONCURRENCY, window=$WINDOW_MODE, retries=$RETRIES, out-dir=$OUT_DIR"
[[ "$WINDOW_MODE" == "dedicated" ]] && log "Tiling: ${cols}x${rows} grid, ${TILE_W}x${TILE_H} per window, area ${AREA_WIDTH}x${AREA_HEIGHT}+${AREA_LEFT}+${AREA_TOP}"

# ---------- partition URLs round-robin across workers ----------
declare -a WORKER_URLS_STR
for ((i = 0; i < CONCURRENCY; i++)); do WORKER_URLS_STR[i]=""; done
for ((i = 0; i < ${#URLS[@]}; i++)); do
  w=$(( i % CONCURRENCY ))
  WORKER_URLS_STR[w]+="${URLS[i]}"$'\n'
done

slugify() { printf '%s' "$1" | sed -E 's#^[a-zA-Z]+://##; s#^www\.##; s#[^A-Za-z0-9._-]+#-#g; s#-+$##' | cut -c1-60; }

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "DRY RUN — no opencli/Chrome calls made"
  for ((w = 0; w < CONCURRENCY; w++)); do
    col=$(( w % cols )); row=$(( w / cols ))
    left=$(( AREA_LEFT + col * TILE_W )); top=$(( AREA_TOP + row * TILE_H ))
    slot="aitdkb${RUN_ID}w${w}"
    printf '%s[worker %d]%s slot=%s bounds=%d,%d,%d,%d\n' "$C_INFO" "$w" "$C_RESET" "$slot" "$left" "$top" "$TILE_W" "$TILE_H" >&2
    while IFS= read -r u; do
      [[ -n "$u" ]] && printf '    %s -> %s/%s.json\n' "$u" "$OUT_DIR" "$(slugify "$u")" >&2
    done <<< "${WORKER_URLS_STR[w]}"
  done
  exit 0
fi

# ---------- run every worker's queue, retrying failures once ----------
# jq-only verification (no dependence on aitdk-opencli.sh's own exit code, which is 0
# even on a soft Part-B failure via panel_fail — see that script's header comment): a
# report only counts as "ok" when it actually has content, never just "the process
# didn't crash".
verify_report() {
  local file="$1" skip_panel="$2"
  if [[ ! -s "$file" ]] || ! jq -e . "$file" >/dev/null 2>&1; then
    echo "invalid-or-missing-json"; return
  fi
  local seo_ok
  seo_ok="$(jq -r '(.seo.title != null and .seo.parseError != true)' "$file" 2>/dev/null)"
  if [[ "$seo_ok" != "true" ]]; then echo "seo-incomplete"; return; fi
  if [[ "$skip_panel" == "1" ]]; then echo "ok"; return; fi
  local attempted ok_flag n_sections
  attempted="$(jq -r '.aitdkPanel.attempted // false' "$file" 2>/dev/null)"
  ok_flag="$(jq -r '.aitdkPanel.ok // false' "$file" 2>/dev/null)"
  n_sections="$(jq -r '(.aitdkPanel.sections // {}) | length' "$file" 2>/dev/null)"
  if [[ "$attempted" != "true" || "${n_sections:-0}" -lt 10 ]]; then
    echo "panel-incomplete"; return
  fi
  [[ "$ok_flag" == "true" ]] && echo "ok" || echo "ok-with-warnings"
}

run_worker() {
  local w="$1" col row left top slot session frag
  col=$(( w % cols )); row=$(( w / cols ))
  left=$(( AREA_LEFT + col * TILE_W )); top=$(( AREA_TOP + row * TILE_H ))
  slot="aitdkb${RUN_ID}w${w}"
  session="$slot"
  frag="$OUT_DIR/.fragments/worker-$w.ndjson"
  : > "$frag"

  local extra=()
  [[ "$SKIP_PANEL" -eq 1 ]] && extra+=(--skip-panel)
  [[ "$WINDOW_MODE" == "dedicated" ]] && extra+=(--window dedicated --slot "$slot" --window-bounds "${left},${top},${TILE_W},${TILE_H}")
  [[ "$WINDOW_MODE" == "foreground" ]] && extra+=(--window foreground)

  while IFS= read -r url; do
    [[ -z "$url" ]] && continue
    local url_slug out_file log_file
    url_slug="$(slugify "$url")"
    out_file="$OUT_DIR/${url_slug}.json"
    log_file="$OUT_DIR/logs/${url_slug}.log"
    local attempt=1 max_attempts=$(( RETRIES + 1 )) status="" t_start t_end duration err_tail=""
    t_start="$(date +%s)"
    while true; do
      : > "$log_file"
      if bash "$AITDK_SCRIPT" "$url" "$session" "$out_file" "${extra[@]}" >"$log_file" 2>&1; then
        status="$(verify_report "$out_file" "$SKIP_PANEL")"
      else
        status="script-error"
        err_tail="$(tail -n 5 "$log_file" 2>/dev/null | tr '\n' ' ')"
      fi
      if [[ "$status" == "ok" || "$status" == "ok-with-warnings" || "$attempt" -ge "$max_attempts" ]]; then
        break
      fi
      # `dedicated-pool-exhausted` (another slot still holding the display's one
      # capacity — from a stray previous window, or genuine contention with someone
      # else's concurrent OpenCLI use) is a transient resource wait, not a bug in this
      # URL — retrying instantly just re-hits the same wall. Back off long enough for a
      # slot to plausibly free (the idle-reap default is 15 minutes, but a session that
      # finishes cleanly releases its lease immediately, which is the common case).
      if grep -q "dedicated-pool-exhausted" "$log_file" 2>/dev/null; then
        warn "[worker $w] retry $attempt/$RETRIES for $url (status: $status — dedicated window pool was full, waiting 20s for a slot)"
        sleep 20
      else
        warn "[worker $w] retry $attempt/$RETRIES for $url (status: $status)"
      fi
      attempt=$((attempt + 1))
    done
    t_end="$(date +%s)"; duration=$(( t_end - t_start ))
    if [[ "$status" == "invalid-or-missing-json" || "$status" == "seo-incomplete" || "$status" == "panel-incomplete" ]]; then
      err_tail="$(tail -n 5 "$log_file" 2>/dev/null | tr '\n' ' ')"
    fi
    jq -nc --arg url "$url" --arg worker "$w" --arg slot "$slot" --arg session "$session" \
      --argjson attempts "$attempt" --arg status "$status" --arg output "$out_file" \
      --argjson duration "$duration" --arg error "$err_tail" \
      '{url:$url, worker:($worker|tonumber), slot:$slot, session:$session, attempts:$attempts, status:$status, output:$output, duration_sec:$duration, error:(if $error=="" then null else $error end)}' \
      >> "$frag"
    if [[ "$status" == "ok" ]]; then ok "[worker $w] $url -> $status (${duration}s)"
    else warn "[worker $w] $url -> $status (${duration}s)"; fi
  done <<< "${WORKER_URLS_STR[$w]}"

  if [[ "$WINDOW_MODE" == "dedicated" ]]; then
    $OPENCLI_BIN browser "$session" window close --slot "$slot" >/dev/null 2>&1 || true
  fi
}

PIDS=()
cleanup_batch() {
  local rc=$?
  if [[ "${1:-}" == "INT" || "${1:-}" == "TERM" ]]; then
    warn "interrupted — killing all worker process groups"
    # `set -m` above gave each `run_worker &` its own process group, so
    # `-$pid` (negative = the group, not just the leader) reaches that worker's
    # whole subtree — including whatever `bash aitdk-opencli.sh ...` and opencli CLI
    # child it's currently blocked on — without touching this script's own group,
    # which is what a bare `kill 0` would have done (and could hit whatever invoked
    # this script, if it shares the same group).
    for pid in "${PIDS[@]:-}"; do
      [[ -n "$pid" ]] && kill -TERM -- "-$pid" 2>/dev/null
    done
  fi
  exit "$rc"
}
trap 'cleanup_batch INT' INT
trap 'cleanup_batch TERM' TERM

BATCH_START="$(date +%s)"
for ((w = 0; w < CONCURRENCY; w++)); do
  run_worker "$w" &
  PIDS+=($!)
done
for pid in "${PIDS[@]}"; do
  wait "$pid" || true
done
BATCH_END="$(date +%s)"

# ---------- merge per-worker fragments into one manifest ----------
MANIFEST="$OUT_DIR/manifest.json"
jq -s --argjson total_sec "$((BATCH_END - BATCH_START))" \
  '{ generatedAt: (now | todate), totalDurationSec: $total_sec,
     summary: { total: length, ok: [.[] | select(.status=="ok")] | length,
                okWithWarnings: [.[] | select(.status=="ok-with-warnings")] | length,
                failed: [.[] | select(.status!="ok" and .status!="ok-with-warnings")] | length },
     results: . }' \
  "$OUT_DIR"/.fragments/*.ndjson > "$MANIFEST" 2>/dev/null \
  || { err "failed to build manifest from fragments in $OUT_DIR/.fragments/"; exit 1; }

N_OK="$(jq -r '.summary.ok' "$MANIFEST")"
N_WARN="$(jq -r '.summary.okWithWarnings' "$MANIFEST")"
N_FAIL="$(jq -r '.summary.failed' "$MANIFEST")"
N_TOTAL="$(jq -r '.summary.total' "$MANIFEST")"
log "Done in $((BATCH_END - BATCH_START))s: $N_OK ok, $N_WARN ok-with-warnings, $N_FAIL failed, $N_TOTAL total"
[[ "$N_FAIL" -gt 0 ]] && warn "$N_FAIL URL(s) failed after retries — see $MANIFEST for status/error per URL, do not treat them as zero scores"
echo "$MANIFEST"
