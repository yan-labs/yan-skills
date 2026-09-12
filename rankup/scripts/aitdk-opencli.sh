#!/usr/bin/env bash
#
# aitdk-opencli.sh — extract SEO audit data from a webpage via opencli, both
# from the page's own HTML (no extension needed) and from the AITDK Chrome
# extension's analysis panel (Overview/Traffic/Backlinks/… sidebar).
#
# ============================================================================
# PART A — page HTML extraction
# ============================================================================
#
# Opens the target URL and evaluates JS in the page's own default (main world)
# execution context to pull every SEO-relevant signal straight out of the live
# DOM. It also checks robots.txt and sitemap.xml via in-page fetch() (so
# cookies/auth carry over), tries a local `whois` lookup for domain age/expiry,
# and flags the known "example.com placeholder leaked into canonical/og:url"
# failure mode in `issues`.
#
# ============================================================================
# PART B — AITDK panel extraction via frame-eval
# ============================================================================
#
# Verified working path (2026-09-11, real Chrome + AITDK extension):
#
#   1. The AITDK panel lives in a cross-origin iframe (https://extension.aitdk.com/)
#      mounted inside a `plasmo-csui#aitdk-csui` shadow host in the page.
#      opencli CAN reach it: `browser <s> frames` lists it and
#      `browser <s> eval --frame <idx>` runs JS inside it. Everything below is
#      plain DOM work in that frame — no clipboard, no coordinates, no probes.
#
#   2. WHY A SYNTHETIC KEY EVENT: the panel's hotkey is Alt+D, but opencli's
#      `keys` (a CDP Input.dispatchKeyEvent) does not reach the extension's
#      content-script listener. Dispatching a DOM KeyboardEvent on `document`
#      via eval does. The hotkey is a TOGGLE, so the script probes the iframe's
#      getBoundingClientRect().width first and only sends the event while the
#      panel is closed — firing it blindly twice closes what it just opened.
#      It also always CLOSES a panel the extension restored on its own and
#      re-opens it: a self-restored panel's iframe is never addressable by
#      `eval --frame` (opencli silently falls back to the main page instead),
#      while a panel toggled open after load attaches a frame target opencli
#      can reach. This was the single biggest source of empty runs.
#      COROLLARY — never RELOAD the page to recover the frame. Each reload
#      re-creates exactly the unaddressable load-attached iframe; a run that
#      reloaded on every hiccup spent 17 minutes and lost its first six
#      sections to main-page fallback. Recovery is toggle-only.
#
#   3. WHY A FULL POINTER SEQUENCE: the sidebar rows are React-controlled
#      <button>s. `el.click()` is ignored; the handler only runs on the whole
#      pointerdown → mousedown → pointerup → mouseup → click sequence, so
#      click_section() dispatches all five MouseEvents.
#
#   4. Section text is read as `document.body.innerText` inside the frame, with
#      the leading sidebar list (which ends at the "Twitter" row) sliced off.
#      Every eval must be wrapped in an IIFE: a top-level `const` persists in
#      that frame's execution context and the next eval fails with
#      "has already been declared".
#
#   5. opencli binary: the globally-installed `opencli` on PATH is a different
#      npm install that lacks the frame support this needs. Override with
#      OPENCLI_BIN if the local checkout moves.
#
# Parsing is best-effort. AITDK renders labels and values as separate innerText
# lines, sometimes label-run-then-value-run (Overview) and sometimes
# value-then-label (Traffic), so parse_section_text() pairs equal-length
# adjacent runs and leaves anything it cannot align in `unpaired`. The full
# text is always kept in `raw`.
#
# Usage:
#   aitdk-opencli.sh <url> [session-name] [output-file] [--skip-panel]
#
#   url            website to audit (required)
#   session-name   opencli browser session name (default: aitdk)
#   output-file    where to write the JSON (default: ./aitdk-report-<domain>-<ts>.json)
#   --skip-panel   skip Part B (AITDK extension panel) entirely, Part A only
#
set -euo pipefail

# ---------- opencli binary ----------
# The global `opencli` on PATH is a separate npm install without the iframe
# support this script needs — always use the local checkout's build.
OPENCLI_BIN="${OPENCLI_BIN:-node /Users/kcsx/Project/kcsx/opencli/dist/src/main.js}"

# ---------- args ----------
URL="${1:-}"
SESSION="${2:-aitdk}"
OUTFILE="${3:-}"
SKIP_PANEL=0
for a in "$@"; do
  [[ "$a" == "--skip-panel" ]] && SKIP_PANEL=1
done

if [[ -z "$URL" ]]; then
  echo "Usage: $(basename "$0") <url> [session-name] [output-file] [--skip-panel]" >&2
  exit 1
fi

# ---------- color output (fall back to plain text when not a tty) ----------
if [[ -t 2 ]]; then
  C_INFO=$'\033[36m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_RESET=$'\033[0m'
else
  C_INFO=''; C_OK=''; C_WARN=''; C_ERR=''; C_RESET=''
fi
log()  { printf '%s[*]%s %s\n' "$C_INFO" "$C_RESET" "$*" >&2; }
ok()   { printf '%s[+]%s %s\n' "$C_OK" "$C_RESET" "$*" >&2; }
warn() { printf '%s[!]%s %s\n' "$C_WARN" "$C_RESET" "$*" >&2; }
err()  { printf '%s[x]%s %s\n' "$C_ERR" "$C_RESET" "$*" >&2; }

# ---------- prerequisites ----------
if ! $OPENCLI_BIN browser --help >/dev/null 2>&1; then
  err "opencli not runnable via OPENCLI_BIN=\"$OPENCLI_BIN\""
  exit 1
fi

HAVE_JQ=1
command -v jq >/dev/null 2>&1 || HAVE_JQ=0
if [[ "$HAVE_JQ" -eq 0 ]]; then
  warn "jq not found — falling back to manual JSON assembly (less robust escaping); Part B (AITDK panel) requires jq and will be skipped"
  SKIP_PANEL=1
fi

HAVE_PY=1
command -v python3 >/dev/null 2>&1 || HAVE_PY=0
if [[ "$HAVE_PY" -eq 0 ]]; then
  warn "python3 not found — Part B's section-text parser needs it; Part B will be skipped"
  SKIP_PANEL=1
fi

HAVE_WHOIS=1
command -v whois >/dev/null 2>&1 || HAVE_WHOIS=0

DOMAIN="$(printf '%s' "$URL" | sed -E 's#^[a-zA-Z]+://##; s#^www\.##; s#[/:].*$##')"
if [[ -z "$OUTFILE" ]]; then
  OUTFILE="./aitdk-report-${DOMAIN}-$(date -u +%Y%m%dT%H%M%SZ).json"
  log "No output file given — will write to $OUTFILE"
fi

# ---------- 1. open the URL ----------
log "Opening $URL (session: $SESSION)"
# --window foreground: a backgrounded/hidden tab gets its cross-origin iframes
# throttled, and opencli then cannot address the AITDK panel frame at all
# (`eval --frame` silently falls back to the main page). Raising the tab makes
# the panel frame a real, addressable OOPIF target.
$OPENCLI_BIN browser "$SESSION" open "$URL" --window foreground >/dev/null

# ---------- 2. let the page settle ----------
sleep 6

# ---------- 3. main SEO data extraction (one big IIFE, default context) ----------
# Everything the skill needs from the live DOM, in a single round trip.
read -r -d '' SEO_EXTRACT_JS <<'JS_EOF' || true
(function() {
  function meta(sel) {
    const el = document.querySelector(sel);
    return el ? (el.getAttribute('content') || el.getAttribute('href') || null) : null;
  }
  function attr(sel, name) {
    const el = document.querySelector(sel);
    return el ? el.getAttribute(name) : null;
  }

  const data = {};

  data.url = window.location.href;
  data.title = document.title || null;
  data.titleLength = data.title ? data.title.length : 0;

  data.metaDescription = meta('meta[name="description"]');
  data.descriptionLength = data.metaDescription ? data.metaDescription.length : 0;
  data.metaKeywords = meta('meta[name="keywords"]');
  data.canonical = meta('link[rel="canonical"]');

  data.ogTitle = meta('meta[property="og:title"]');
  data.ogDescription = meta('meta[property="og:description"]');
  data.ogImage = meta('meta[property="og:image"]');
  data.ogUrl = meta('meta[property="og:url"]');
  data.ogType = meta('meta[property="og:type"]');

  data.twitterCard = meta('meta[name="twitter:card"]');
  data.twitterTitle = meta('meta[name="twitter:title"]');
  data.twitterDescription = meta('meta[name="twitter:description"]');
  data.twitterImage = meta('meta[name="twitter:image"]');

  data.robots = meta('meta[name="robots"]');
  data.viewport = meta('meta[name="viewport"]');

  const charsetEl = document.querySelector('meta[charset]');
  data.charset = charsetEl ? charsetEl.getAttribute('charset') : meta('meta[http-equiv="content-type"]');

  data.lang = document.documentElement ? document.documentElement.getAttribute('lang') : null;

  data.favicon = meta('link[rel="icon"]') || meta('link[rel="shortcut icon"]');

  data.hreflang = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).map(el => ({
    lang: el.getAttribute('hreflang'),
    href: el.getAttribute('href')
  }));

  data.headings = {};
  ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(level => {
    const els = Array.from(document.querySelectorAll(level));
    data.headings[level] = {
      count: els.length,
      text: els.map(el => el.textContent.trim())
    };
  });

  const allLinks = Array.from(document.querySelectorAll('a[href]'));
  let internal = 0, external = 0, nofollow = 0;
  allLinks.forEach(a => {
    let href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    try {
      const u = new URL(href, window.location.href);
      if (u.hostname === window.location.hostname) internal++; else external++;
    } catch (e) { /* ignore unparsable */ }
    const rel = (a.getAttribute('rel') || '').toLowerCase();
    if (rel.includes('nofollow')) nofollow++;
  });
  data.links = { internal, external, nofollow };

  const allImages = Array.from(document.querySelectorAll('img'));
  const withAlt = allImages.filter(img => (img.getAttribute('alt') || '').trim().length > 0).length;
  data.images = {
    total: allImages.length,
    withAlt: withAlt,
    withoutAlt: allImages.length - withAlt
  };

  data.structuredData = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(el => {
    try { return JSON.parse(el.textContent); } catch (e) { return { parseError: true, raw: el.textContent.substring(0, 500) }; }
  });

  return JSON.stringify(data);
})()
JS_EOF

log "Extracting on-page SEO data from default page context"
SEO_JSON="$($OPENCLI_BIN browser "$SESSION" eval "$SEO_EXTRACT_JS" 2>/dev/null || echo '{}')"

if [[ "$HAVE_JQ" -eq 1 ]]; then
  if ! echo "$SEO_JSON" | jq -e . >/dev/null 2>&1; then
    warn "on-page extraction did not return valid JSON — wrapping as raw string"
    SEO_JSON="$(jq -n --arg raw "$SEO_JSON" '{parseError: true, raw: $raw}')"
  fi
fi
ok "Captured on-page SEO data"

# ---------- 3b. placeholder-domain detection (example.com leakage) ----------
# Known failure mode on this workspace's TanStack Start sites (nonogram-jp,
# crossword-ar): SITE_URL isn't injected at build time, so og:url / canonical
# / twitter:image etc. fall back to a literal "example.com" placeholder that
# then ships to production. Flag it instead of silently reporting bad data.
ISSUES_JSON='[]'
if [[ "$HAVE_JQ" -eq 1 ]]; then
  PLACEHOLDER_FIELDS="$(echo "$SEO_JSON" | jq -r '
    [ {k:"ogUrl", v:.ogUrl}, {k:"canonical", v:.canonical}, {k:"ogImage", v:.ogImage},
      {k:"twitterImage", v:.twitterImage}, {k:"url", v:.url} ]
    | map(select(.v != null and (.v | tostring | test("example\\.com"))))
    | map(.k) | join(",")
  ' 2>/dev/null || true)"
  if [[ -n "$PLACEHOLDER_FIELDS" ]]; then
    warn "placeholder domain (example.com) leaked into: $PLACEHOLDER_FIELDS"
    ISSUES_JSON="$(jq -n --arg fields "$PLACEHOLDER_FIELDS" '
      [{
        code: "placeholder-domain-leak",
        message: ("example.com placeholder leaked into: " + $fields + " — likely SITE_URL not injected at build time"),
        fields: ($fields | split(","))
      }]
    ')"
  fi
fi

# ---------- 4. robots.txt (in-page fetch, preserves cookies/auth) ----------
ROBOTS_JS='(function(){ return fetch("/robots.txt").then(r => r.ok ? r.text() : null).catch(() => null); })()'
log "Fetching /robots.txt"
ROBOTS_TXT="$($OPENCLI_BIN browser "$SESSION" eval "$ROBOTS_JS" 2>/dev/null || echo 'null')"
if [[ -z "$ROBOTS_TXT" || "$ROBOTS_TXT" == "null" ]]; then
  warn "robots.txt not found or fetch failed"
  ROBOTS_TXT="null"
  ROBOTS_IS_RAW=0
else
  ROBOTS_IS_RAW=1
  ok "Captured robots.txt"
fi

# ---------- 5. sitemap.xml (first 2000 chars, in-page fetch) ----------
SITEMAP_JS='(function(){ return fetch("/sitemap.xml").then(r => r.ok ? r.text().then(t => t.substring(0, 2000)) : null).catch(() => null); })()'
log "Fetching /sitemap.xml (first 2000 chars)"
SITEMAP_XML="$($OPENCLI_BIN browser "$SESSION" eval "$SITEMAP_JS" 2>/dev/null || echo 'null')"
if [[ -z "$SITEMAP_XML" || "$SITEMAP_XML" == "null" ]]; then
  warn "sitemap.xml not found or fetch failed"
  SITEMAP_XML="null"
  SITEMAP_IS_RAW=0
else
  SITEMAP_IS_RAW=1
  ok "Captured sitemap.xml excerpt"
fi

# ---------- 6. WHOIS (local, best-effort) ----------
WHOIS_CREATED=""
WHOIS_EXPIRES=""
WHOIS_RAW_AVAILABLE=0

if [[ "$HAVE_WHOIS" -eq 1 && -n "$DOMAIN" ]]; then
  log "Running whois $DOMAIN (5s timeout)"
  _whois_tmp="/tmp/_aitdk_whois_$$.txt"
  rm -f "$_whois_tmp"
  whois "$DOMAIN" > "$_whois_tmp" 2>/dev/null &
  _wpid=$!
  (sleep 5; kill "$_wpid" 2>/dev/null) &
  _tpid=$!
  set +e; wait "$_wpid" 2>/dev/null; set -e
  # Under `set -e`, an unguarded `kill` on a pid that has already exited (the
  # timeout subshell can finish/self-reap right around here) aborts the whole
  # script with no further output. Both calls need `|| true`.
  kill "$_tpid" 2>/dev/null || true
  wait "$_tpid" 2>/dev/null || true
  WHOIS_OUT=""
  if [[ -s "$_whois_tmp" ]]; then WHOIS_OUT="$(cat "$_whois_tmp")"; fi
  rm -f "$_whois_tmp"
  if [[ -n "$WHOIS_OUT" ]]; then
    WHOIS_RAW_AVAILABLE=1
    WHOIS_CREATED="$(printf '%s\n' "$WHOIS_OUT" | grep -iE '(Creation Date|Created On|Domain Registration Date|Registered on):' | tail -1 | awk -F': ' '{$1=""; print}' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true)"
    WHOIS_EXPIRES="$(printf '%s\n' "$WHOIS_OUT" | grep -iE '(Registry Expiry Date|Expiration Date|Expiry Date|Registrar Registration Expiration Date):' | tail -1 | awk -F': ' '{$1=""; print}' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true)"
    ok "Captured whois creation/expiry dates for $DOMAIN"
  else
    warn "whois returned no output for $DOMAIN"
  fi
else
  warn "whois not available or domain could not be parsed — skipping"
fi

WHOIS_JSON="$(jq -n \
  --arg created "$WHOIS_CREATED" --arg expires "$WHOIS_EXPIRES" \
  --argjson available "$([[ "$WHOIS_RAW_AVAILABLE" -eq 1 ]] && echo true || echo false)" \
  '{ available: $available, created: (if $created == "" then null else $created end), expires: (if $expires == "" then null else $expires end) }' \
  2>/dev/null || echo '{"available":false,"created":null,"expires":null}')"

# ---------- helper: assemble + write the report so far (incremental) ----------
READ_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PANEL_JSON='{"attempted": false}'

write_partial() {
  if [[ "$HAVE_JQ" -eq 1 ]]; then
    local robots_arg=() robots_jq='null' sitemap_arg=() sitemap_jq='null'
    if [[ "$ROBOTS_IS_RAW" -eq 1 ]]; then robots_arg=(--arg robotsTxt "$ROBOTS_TXT"); robots_jq='$robotsTxt'; fi
    if [[ "$SITEMAP_IS_RAW" -eq 1 ]]; then sitemap_arg=(--arg sitemapExcerpt "$SITEMAP_XML"); sitemap_jq='$sitemapExcerpt'; fi
    jq -n \
      --arg url "$URL" --arg domain "$DOMAIN" --arg readAt "$READ_AT" \
      --argjson seo "$SEO_JSON" \
      "${robots_arg[@]}" "${sitemap_arg[@]}" \
      --argjson whois "$WHOIS_JSON" \
      --argjson issues "$ISSUES_JSON" \
      --argjson panel "$PANEL_JSON" \
      "{ url: \$url, domain: \$domain, readAt: \$readAt, seo: \$seo, robotsTxt: ${robots_jq}, sitemapExcerpt: ${sitemap_jq}, whois: \$whois, issues: \$issues, aitdkPanel: \$panel }" \
      > "$OUTFILE"
  else
    # Manual fallback (Part B is always skipped when jq is missing, see above)
    json_escape() { local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\n'/\\n}"; s="${s//$'\r'/}"; s="${s//$'\t'/\\t}"; printf '%s' "$s"; }
    local robots_field sitemap_field
    if [[ "$ROBOTS_IS_RAW" -eq 1 ]]; then robots_field="\"$(json_escape "$ROBOTS_TXT")\""; else robots_field="null"; fi
    if [[ "$SITEMAP_IS_RAW" -eq 1 ]]; then sitemap_field="\"$(json_escape "$SITEMAP_XML")\""; else sitemap_field="null"; fi
    printf '{"url":"%s","domain":"%s","readAt":"%s","seo":%s,"robotsTxt":%s,"sitemapExcerpt":%s,"whois":%s,"issues":[]}\n' \
      "$(json_escape "$URL")" "$(json_escape "$DOMAIN")" "$READ_AT" "$SEO_JSON" "$robots_field" "$sitemap_field" "$WHOIS_JSON" \
      > "$OUTFILE"
  fi
}

write_partial
ok "Wrote Part A report to $OUTFILE (Part B follows if enabled)"

# ---------- Part B helpers ----------
oc() { $OPENCLI_BIN browser "$SESSION" "$@"; }

# Merge the current section map + errors into PANEL_JSON and rewrite the report.
write_panel() {
  PANEL_JSON="$(jq -n \
    --argjson sections "$PANEL_SECTIONS_JSON" \
    --argjson errs "$(printf '%s\n' "${panel_errors[@]:-}" | jq -R 'select(length>0)' | jq -s .)" \
    --arg frame "${FRAME_IDX:-}" \
    '{attempted:true, ok:true, frameIndex:$frame, errors:$errs, sections:$sections}')"
  write_partial
}

# Parse one section's innerText into {raw, fields, unpaired, bodyLength}.
# AITDK emits labels and values as separate lines; the order flips per section
# (Overview: label-run then value-run; Traffic: value then label). Strategy:
# take inline "Label: Value" lines first, then split what is left into runs of
# value-like vs label-like lines and zip adjacent runs of equal length.
parse_section_text() {
  python3 - "$1" <<'PY'
import sys, json, re

raw = sys.argv[1] if len(sys.argv) > 1 else ""
lines = [l.strip() for l in raw.splitlines() if l.strip()]

# Drop the sponsor blurbs AITDK injects at the top of a section body, e.g.
# "Zens.AI / AI Customer Support…" or "AIsa.one / Official Similarweb API…".
AD = re.compile(r'^[A-Za-z0-9][\w.\-]*\.(ai|one|com|io|co|app|dev)(\s*/\s|\s*$)', re.I)
while lines and AD.match(lines[0]):
    lines.pop(0)
    # a bare sponsor domain on its own line is followed by its tagline line
    if lines and not AD.match(lines[0]) and len(lines[0]) > 12 and not re.search(r'\d', lines[0]):
        lines.pop(0)

VALUE = re.compile(
    r'^(?:'
    r'-?[\d,]+(?:\.\d+)?%?'          # 0 | 1,234 | 0.00% | -3
    r'|\d+\s*/\s*\d+'                # 29/60
    r'|\d{2}:\d{2}:\d{2}'            # 00:00:00
    r'|\d{4}-\d{1,2}-\d{1,2}[\w :+\-]*'  # 2026-09-10 16:51:46 UTC | 2026-9-11
    r'|\d+\s*(?:days?|weeks?|months?|years?)'
    r'|--|N/?A'
    r'|Available|Missing|Yes|No|None|True|False|Enabled|Disabled|Found|Passed|Failed|Valid|Invalid|OK'
    r')$', re.I)

fields, order, leftover = {}, [], []

def put(k, v):
    k = k.strip()
    if not k:
        return
    if k in fields:
        if isinstance(fields[k], list):
            fields[k].append(v)
        else:
            fields[k] = [fields[k], v]
    else:
        fields[k] = v
        order.append(k)

rest = []
for line in lines:
    m = re.match(r'^([^:：]{1,60})[:：]\s*(.+)$', line)
    # A colon inside a prose sentence is not a field: require a short key.
    if (m and not VALUE.match(line)
            and not re.match(r'^[a-z][a-z0-9+.\-]*://', line, re.I)
            and len(m.group(1).split()) <= 5):
        put(m.group(1), m.group(2).strip())
    else:
        rest.append(line)

# group consecutive lines into runs of the same kind
runs = []
for line in rest:
    kind = 'v' if VALUE.match(line) else 'l'
    if runs and runs[-1][0] == kind:
        runs[-1][1].append(line)
    else:
        runs.append([kind, [line]])

# Two plausible layouts: "labels then values" (Overview) and "value then label"
# (Traffic). Mixing the two mid-section produces garbage, so score both over the
# whole section and keep the one that pairs more lines.
def zip_runs(label_first):
    pairs, left, widest, i = [], [], 0, 0
    while i < len(runs):
        kind, items = runs[i]
        nxt = runs[i + 1] if i + 1 < len(runs) else None
        want = 'l' if label_first else 'v'
        if kind == want and nxt and nxt[0] != kind and len(nxt[1]) == len(items):
            labels = items if label_first else nxt[1]
            values = nxt[1] if label_first else items
            pairs.extend(zip(labels, values))
            widest = max(widest, len(items))
            i += 2
            continue
        left.extend(items)
        i += 1
    return pairs, left, widest

a_pairs, a_left, a_wide = zip_runs(True)
b_pairs, b_left, b_wide = zip_runs(False)
if len(a_pairs) != len(b_pairs):
    use_a = len(a_pairs) > len(b_pairs)
else:
    # A dead tie means the section is a column of 1-line runs, which is how
    # AITDK renders stat cards — and there the number sits ABOVE its caption.
    use_a = a_wide > 1
pairs, leftover_lines = (a_pairs, a_left) if use_a else (b_pairs, b_left)
layout = "label-first" if use_a else "value-first"
for k, v in pairs:
    put(k, v)
leftover.extend(leftover_lines)

body = "\n".join(lines)
print(json.dumps({
    "raw": body,
    "bodyLength": len(body),
    "fields": fields,
    "fieldOrder": order,
    "unpaired": leftover,
    "layout": layout,
}, ensure_ascii=False))
PY
}
# ============================================================================
# PART B — AITDK extension panel via opencli frame-eval
# ============================================================================

if [[ "$SKIP_PANEL" -eq 1 ]]; then
  warn "--skip-panel set (or jq/python3 missing) — skipping AITDK panel extraction"
  echo "$OUTFILE"
  if [[ -z "${3:-}" ]]; then cat "$OUTFILE"; fi
  exit 0
fi

log "Part B: driving the AITDK extension panel (frame-eval path)"

# Sections to read, in sidebar order. These are the exact button labels inside
# the panel iframe. Deliberately omitted: Settings, Archive (local UI),
# Similarweb / Semrush / Ahrefs / PageSpeed / Twitter (navigate off-site).
PANEL_SECTIONS=(
  Overview Traffic Backlinks Adsense Issues GEO SERP Density
  Headings Images Links Social Hreflangs Structured Whois
)
# Sections that fetch remote data and need a longer settle.
SLOW_SECTIONS=" Traffic Backlinks Adsense GEO SERP "

panel_errors=()
panel_fail() {
  panel_errors+=("$1")
  PANEL_JSON="$(jq -n --argjson errs "$(printf '%s\n' "${panel_errors[@]}" | jq -R . | jq -s .)" \
    '{attempted:true, ok:false, errors:$errs, sections:{}}')"
  write_partial
  err "Part B aborted: $1"
  close_panel || true
  oc close >/dev/null 2>&1 || true
  echo "$OUTFILE"
  exit 0
}

# --- step 1: open the AITDK panel -------------------------------------------
# The panel's hotkey is Alt+D, but a CDP-level key dispatch (opencli's `keys`)
# does NOT reach the extension's content script — the listener only ever sees a
# synthetic DOM KeyboardEvent dispatched on `document`. So we dispatch one
# ourselves via eval. The hotkey is a TOGGLE, so the iframe's width is probed
# before every dispatch — sending it blindly twice closes what it just opened.
# A panel the extension restored by itself at page load is NOT usable (see
# reopen_panel below), so it is always closed and re-opened first.
PANEL_STATE_JS='(function(){var h=document.querySelector("plasmo-csui#aitdk-csui");var f=h&&h.shadowRoot&&h.shadowRoot.querySelector("iframe");if(!f)return JSON.stringify({open:false,w:0});var r=f.getBoundingClientRect();return JSON.stringify({open:r.width>0,w:r.width});})()'
TOGGLE_JS='(function(){for(var i=0,ts=["keydown","keyup"];i<ts.length;i++){document.dispatchEvent(new KeyboardEvent(ts[i],{key:"d",code:"KeyD",keyCode:68,which:68,altKey:true,bubbles:true}));}return "sent";})()'

panel_state() { oc eval "$PANEL_STATE_JS" 2>/dev/null || echo '{"open":false}'; }
panel_is_open() { echo "$1" | grep -q '"open":true\|"open": true'; }

# Force a FRESH mount of the panel iframe. Critical: if the extension restored
# the panel by itself at page load, opencli never sees that iframe as an
# addressable cross-origin target (`frames` lists nothing usable and
# `eval --frame` falls back to the main page). Toggling it closed and open
# again makes Chrome attach a new OOPIF target that opencli can address.
close_panel() {
  local st i
  for i in 1 2 3; do
    st="$(panel_state)"
    panel_is_open "$st" || return 0
    oc eval "$TOGGLE_JS" >/dev/null 2>&1 || true
    sleep 3
  done
  return 1
}

open_panel() {
  local st i
  for i in 1 2 3; do
    st="$(panel_state)"
    panel_is_open "$st" && return 0
    oc eval "$TOGGLE_JS" >/dev/null 2>&1 || true
    sleep 5
  done
  st="$(panel_state)"
  panel_is_open "$st"
}

# Toggle-only recycle: close the panel and open it again WITHOUT reloading the
# page. Do not be tempted to reload here — an earlier version reloaded the tab
# to "remount" the panel, and that is precisely what makes the iframe
# unaddressable: an iframe the extension restores during page load never
# becomes an `eval --frame` target, and opencli then silently evaluates against
# the MAIN page instead (symptom: every section reads the host site's own text
# and sidebar buttons come back "missing"). Toggling in a tab that is already
# loaded attaches a fresh, addressable OOPIF.
retoggle_panel() {
  close_panel || true
  sleep 2
  open_panel
}

log "Opening the AITDK panel (synthetic Alt+D)"
if panel_is_open "$(panel_state)"; then
  log "Panel was restored by the extension at page load — toggling it off and on so opencli can address the frame"
  close_panel || true
  sleep 2
fi
open_panel || panel_fail "AITDK panel did not open (plasmo-csui#aitdk-csui iframe width stayed 0) — is the extension installed and enabled?"
ok "AITDK panel is open"

# --- step 2: locate the panel iframe among opencli's cross-origin frames -----
# `eval --frame <n>` silently falls back to the MAIN page when index <n> is not
# a live cross-origin target at eval time (observed: a whole run's "Overview"
# came back as the game page's own text). So never trust the index from
# `frames` alone — probe location.href inside it and require extension.aitdk.com.
FRAME_IDX=""
frame_is_panel() {
  local idx="$1" href
  href="$(oc eval --frame "$idx" '(function(){return location.href;})()' 2>/dev/null || true)"
  [[ "$href" == *extension.aitdk.com* ]]
}
# Light scan: find the index that currently IS the panel. The index is
# positional in opencli's frame snapshot, and it MOVES during a run — the panel
# loads sponsor iframes of its own, which shift the numbering — so never trust
# a cached index, re-verify it before every use.
scan_frame() {
  local raw cands idx
  raw="$(oc frames 2>/dev/null || echo '[]')"
  cands="$(echo "$raw" | jq -r '
    (if type == "array" then . else (.frames // []) end)
    | to_entries
    | map(select((.value.url // "") | test("extension\\.aitdk\\.com")))
    | map((.value.index // .key) | tostring) | .[]' 2>/dev/null || true)"
  for idx in $cands 0 1 2 3 4 5 6 7; do
    if frame_is_panel "$idx"; then FRAME_IDX="$idx"; return 0; fi
  done
  return 1
}

# Cheap guard used before every frame call.
ensure_frame() {
  [[ -n "$FRAME_IDX" ]] && frame_is_panel "$FRAME_IDX" && return 0
  scan_frame
}

# Full resolution: rescan a few times, and once in the middle toggle the panel
# off and on (never reload — see retoggle_panel) to force a fresh OOPIF.
resolve_frame() {
  local attempt
  for attempt in 1 2 3 4; do
    scan_frame && return 0
    log "AITDK frame not addressable ($attempt/4)"
    [[ "$attempt" -eq 2 ]] && { retoggle_panel || true; }
    sleep 2
  done
  scan_frame
}
resolve_frame || panel_fail "could not address the extension.aitdk.com iframe via opencli eval --frame"
ok "AITDK panel iframe is frame index $FRAME_IDX"

fe() { oc eval --frame "$FRAME_IDX" "$1"; }

# The sidebar mounts progressively: for the first seconds the panel renders a
# stub with none of the section rows, and clicking then reports every label as
# "missing". Wait for the first section row to exist before the loop starts.
wait_sidebar() {
  local i n
  for i in 1 2 3 4 5 6; do
    n="$(fe '(function(){return Array.prototype.slice.call(document.querySelectorAll("button")).filter(function(e){return e.textContent.trim()==="Overview";}).length;})()' 2>/dev/null || echo 0)"
    [[ "$n" == *1* ]] && return 0
    sleep 2
    ensure_frame || true
  done
  return 1
}
wait_sidebar || warn "sidebar section rows did not appear within ~12s — continuing anyway"

# --- helper: click a sidebar section button ---------------------------------
# The sidebar entries are React-controlled <button>s: element.click() alone is
# ignored, the handler only fires on a full pointer/mouse event sequence.
click_section() {
  local label="$1" js
  js=$(cat <<JS
(function(){
  var b = Array.prototype.slice.call(document.querySelectorAll('button'))
    .filter(function(e){ return e.textContent.trim() === '${label}'; })[0];
  if (!b) return 'missing';
  ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(function(t){
    b.dispatchEvent(new MouseEvent(t, {bubbles:true, cancelable:true, button:0}));
  });
  return 'ok';
})()
JS
)
  fe "$js" 2>/dev/null || echo 'error'
}

# --- helper: read the currently-shown section's text ------------------------
# body.innerText starts with the sidebar list ("AITDK…Twitter"); everything
# after the "Twitter" entry is the section body. Every eval must be wrapped in
# an IIFE — a top-level `const` persists in the frame's context and the next
# eval dies with "has already been declared".
READ_JS='(function(){var t=document.body.innerText;var i=t.indexOf("Twitter\n");return t.slice(i>0?i+8:0);})()'

PANEL_SECTIONS_JSON='{}'
captured=0

for label in "${PANEL_SECTIONS[@]}"; do
  key="$(echo "$label" | tr '[:upper:]' '[:lower:]')"
  log "Section '$label': clicking sidebar button"
  ensure_frame || resolve_frame || true
  cres="$(click_section "$label")"
  if [[ "$cres" != *ok* ]]; then
    # Either the React tree is still mounting, or --frame drifted off the panel.
    sleep 2
    ensure_frame || resolve_frame || true
    cres="$(click_section "$label")"
  fi
  if [[ "$cres" != *ok* ]]; then
    warn "Section '$label': sidebar button not found (got: $cres); buttons present: $(fe '(function(){return document.querySelectorAll("button").length;})()' 2>/dev/null || echo "?")"
    panel_errors+=("$key: sidebar button not found")
    PANEL_SECTIONS_JSON="$(jq --arg k "$key" '. + {($k): {error:"sidebar button not found", raw:null, fields:{}}}' <<<"$PANEL_SECTIONS_JSON")"
    write_panel
    continue
  fi
  if [[ "$SLOW_SECTIONS" == *" $label "* ]]; then sleep 5; else sleep 4; fi

  ensure_frame || true
  SECTION_TEXT="$(fe "$READ_JS" 2>/dev/null || true)"
  SECTION_JSON="$(parse_section_text "$SECTION_TEXT" 2>/dev/null || echo '{}')"
  BODY_LEN="$(jq -r '(.bodyLength // 0)' <<<"$SECTION_JSON" 2>/dev/null || echo 0)"
  if [[ "${BODY_LEN:-0}" -lt 10 ]]; then
    warn "Section '$label': empty / ads-only on first read — waiting 3s and re-reading"
    sleep 3
    ensure_frame || true
  SECTION_TEXT="$(fe "$READ_JS" 2>/dev/null || true)"
    SECTION_JSON="$(parse_section_text "$SECTION_TEXT" 2>/dev/null || echo '{}')"
    BODY_LEN="$(jq -r '(.bodyLength // 0)' <<<"$SECTION_JSON" 2>/dev/null || echo 0)"
  fi
  if [[ "${BODY_LEN:-0}" -eq 0 ]]; then
    warn "Section '$label': still empty after retry"
    panel_errors+=("$key: empty content")
  else
    captured=$((captured + 1))
    ok "Captured section '$label' (${BODY_LEN} chars)"
  fi
  PANEL_SECTIONS_JSON="$(jq --arg k "$key" --argjson v "$SECTION_JSON" '. + {($k): $v}' <<<"$PANEL_SECTIONS_JSON")"
  write_panel
done

ok "Part B complete: $captured/${#PANEL_SECTIONS[@]} sections with content, ${#panel_errors[@]} errors"

# Leave the panel closed: the extension persists this, and a page that loads
# with the panel already restored produces an iframe opencli cannot address.
close_panel || warn "could not close the AITDK panel before exiting"

# ---------- close the session, leave no tab lease ----------
oc close >/dev/null 2>&1 || warn "opencli browser $SESSION close failed"

# ---------- final output ----------
echo "$OUTFILE"
if [[ -z "${3:-}" ]]; then cat "$OUTFILE"; fi
