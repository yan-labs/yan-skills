#!/usr/bin/env node
/**
 * Inspect analytics DOM counts, script requests and actual successful sends separately.
 * Existing --wait / --interact / --both modes remain supported. Add a real in-site
 * link selector and expected pathname to check SPA navigation in the same session.
 * Missing navigation or send evidence is needs-verification (exit 2), never pass.
 * Uses existing OpenCLI and lib-scene; does not inject or replay analytics requests.
 */
import { execFileSync } from "node:child_process";
import { resolve as resolvePath } from "node:path";
import { realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { newEvidenceDir, captureScene, writeManifest, sessionSuffix } from "./lib-scene.mjs";

const HOST_PATTERNS = {
  ga4: { label: "GA4", host: "googletagmanager.com" },
  clarity: { label: "Microsoft Clarity", host: "clarity.ms" },
  ahrefs: { label: "Ahrefs WA", host: "analytics.ahrefs.com" },
  cfWebAnalytics: { label: "Cloudflare Web Analytics", host: "cloudflareinsights.com" },
};
function parsedUrl(value) { try { return new URL(value); } catch { return null; } }
function onHost(value, host) {
  const name = parsedUrl(value)?.hostname;
  return name === host || name?.endsWith(`.${host}`);
}
function isEntryPoint(key, value) {
  const url = parsedUrl(value);
  if (!url) return false;
  if (key === "ga4") return onHost(value, "googletagmanager.com") && url.pathname === "/gtag/js";
  // The Clarity tag loader legitimately adds scripts.clarity.ms/<version>/clarity.js.
  if (key === "clarity") return ["clarity.ms", "www.clarity.ms"].includes(url.hostname) && /^\/tag\/[^/]+\/?$/.test(url.pathname);
  if (key === "ahrefs") return url.hostname === "analytics.ahrefs.com" && url.pathname === "/analytics.js";
  return url.hostname === "static.cloudflareinsights.com" && /^\/beacon\.min\.js(?:\/[^/]+)?$/.test(url.pathname);
}
function safeUrl(value) {
  const url = parsedUrl(value);
  if (!url) return null;
  const path = onHost(value, "clarity.ms") ? url.pathname.replace(/\/tag\/[^/]+/, "/tag/[redacted]") : url.pathname;
  return `${url.origin}${path}`; // Never emit query strings, credentials or request bodies.
}
function isSend(key, request, pageUrl) {
  const url = parsedUrl(request.url);
  if (!url) return false;
  const method = request.method ?? (request.initiatorType === "beacon" ? "POST" : null);
  if (key === "ga4" ? !["GET", "POST"].includes(method) : method !== "POST") return false;
  if (key === "ga4") return onHost(request.url, "google-analytics.com") && /\/(?:g\/)?collect$/.test(url.pathname);
  if (key === "clarity") return onHost(request.url, "clarity.ms") && url.pathname === "/collect";
  if (key === "ahrefs") return onHost(request.url, "analytics.ahrefs.com") && url.pathname === "/api/event";
  return url.pathname === "/cdn-cgi/rum" &&
    (onHost(request.url, "cloudflareinsights.com") || url.origin === parsedUrl(pageUrl)?.origin);
}
function successful(status) { return status >= 200 && status < 300; }

/** Legacy URL arrays are still accepted, but cannot establish DOM counts or sends. */
export function classifyBeacons(observation) {
  const legacy = Array.isArray(observation) || !observation;
  const data = legacy ? { resources: (observation || []).map(url => ({ url })) } : observation;
  const resources = data.resources || [];
  const network = data.network || [];
  const result = {};
  for (const [key, { label, host }] of Object.entries(HOST_PATTERNS)) {
    const scripts = legacy ? null : (data.scripts || []).filter(url => isEntryPoint(key, url));
    const requests = resources.filter(entry => onHost(entry.url, host));
    const scriptResponses = [...requests, ...network].filter(entry => isEntryPoint(key, entry.url));
    const scriptLoaded = scriptResponses.some(entry => successful(entry.responseStatus ?? entry.status) &&
      (entry.initiatorType === "script" || scripts?.includes(entry.url)));
    const scriptFailed = scriptResponses.some(entry => (entry.responseStatus ?? entry.status) >= 400 &&
      (entry.initiatorType === "script" || scripts?.includes(entry.url)));
    const sends = [
      ...network.filter(entry => entry.method === "POST" || entry.method === "GET"),
      ...resources.filter(entry => ["beacon", "fetch", "xmlhttprequest"].includes(entry.initiatorType) &&
        (data.sendSince == null || entry.startTime >= data.sendSince)),
    ].filter(entry => isSend(key, entry, data.url));
    const sendingStatus = sends.some(entry => (entry.status ?? entry.responseStatus) >= 400) ? "failed" :
      sends.some(entry => successful(entry.status ?? entry.responseStatus)) ? "verified" : "not_verified";
    const duplicate = scripts != null && scripts.length > 1;
    const status = duplicate || scriptFailed || sendingStatus === "failed" ? "fail" :
      scripts?.length === 1 && scriptLoaded && sendingStatus === "verified" ? "pass" : "needs-verification";
    result[key] = {
      label, host, status,
      // `loaded` remains for callers, now means confirmed script response, not a DOM match.
      loaded: scriptLoaded,
      scriptCount: scripts?.length ?? null,
      scriptPresent: scripts == null ? null : scripts.length > 0,
      scriptUrls: scripts?.map(safeUrl) ?? [], // Keep repeated identical DOM nodes.
      matchedUrls: [...new Set([...(scripts || []), ...requests.map(entry => entry.url)].map(safeUrl).filter(Boolean))],
      resourceRequestObserved: requests.length > 0 || network.some(entry => scripts?.includes(entry.url)),
      scriptLoadStatus: scriptFailed ? "failed" : scriptLoaded ? "verified" : "not_verified",
      sendingStatus,
      sendRequests: sends.map(entry => ({ url: safeUrl(entry.url), method: entry.method ?? (entry.initiatorType === "beacon" ? "POST" : null),
        status: entry.status ?? entry.responseStatus ?? null, initiatorType: entry.initiatorType ?? null })),
    };
  }
  return result;
}

export function assessScenario(initial, afterNavigation, navigation = {}) {
  const before = parsedUrl(initial?.url);
  const after = parsedUrl(afterNavigation?.url);
  let reason = "missing_navigation_input";
  if (navigation.requested && navigation.targetPath) {
    reason = !after || before?.pathname === after.pathname ? "pathname_not_changed" :
      after.origin !== before?.origin || after.pathname !== navigation.targetPath ? "wrong_navigation_target" :
      initial.timeOrigin == null || afterNavigation.timeOrigin !== initial.timeOrigin ? "not_same_document_spa" : null;
  }
  const classified = classifyBeacons(initial);
  const afterClassified = afterNavigation ? classifyBeacons(afterNavigation) : null;
  const statuses = [...Object.values(classified), ...Object.values(afterClassified || {})].map(entry => entry.status);
  const status = statuses.includes("fail") ? "fail" :
    !reason && statuses.every(value => value === "pass") ? "pass" : "needs-verification";
  return { status, classified, afterClassified, navigation: {
    status: reason ? "needs-verification" : "pass", reason,
    from: safeUrl(initial?.url), to: safeUrl(afterNavigation?.url), targetPath: navigation.targetPath || null,
  } };
}

export function formatBeaconTable(classified) {
  return Object.values(classified).map(c =>
    `${c.status === "pass" ? "✅" : c.status === "fail" ? "❌" : "?"} ${c.label}: ${c.status}; DOM=${c.scriptCount ?? "unknown"}; script=${c.scriptLoadStatus}; sending=${c.sendingStatus}`,
  ).join("\n");
}

let url, sessionPrefix;
let waitSeconds = 7, interactWaitSeconds = 3;
let interact = false, both = false, keepSession = false, json = false;
let navigateSelector = null, navigatePath = null;
function usage() {
  console.log(`用法: node analytics-beacon-check.mjs <url> [--wait 7] [--interact | --both] [--json]
  --interact-wait <秒>    交互后等待，默认 3
  --navigate-selector <CSS> --navigate-path </目标pathname>
                         同会话真实点击站内链接，等待路径变化并验证 SPA
  --session <前缀>        独立会话前缀；--keep-session 保留会话
缺导航输入或实际发送证据：needs-verification / exit 2；明确失败 exit 1；完整通过 exit 0。`);
}
function parseArgs(argv) {
  if (!argv.length || ["-h", "--help"].includes(argv[0])) { usage(); return false; }
  url = argv[0];
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--wait" && argv[i + 1]) waitSeconds = Number(argv[++i]);
    else if (arg === "--interact-wait" && argv[i + 1]) interactWaitSeconds = Number(argv[++i]);
    else if (arg === "--session" && argv[i + 1]) sessionPrefix = argv[++i];
    else if (arg === "--navigate-selector" && argv[i + 1]) navigateSelector = argv[++i];
    else if (arg === "--navigate-path" && argv[i + 1]) navigatePath = argv[++i];
    else if (arg === "--interact") interact = true;
    else if (arg === "--both") both = true;
    else if (arg === "--keep-session") keepSession = true;
    else if (arg === "--json") json = true;
    else throw new Error("Unknown or incomplete CLI argument; use --help");
  }
  if (!/^https?:$/.test(parsedUrl(url)?.protocol || "")) throw new Error("url must be an HTTP(S) URL");
  for (const seconds of [waitSeconds, interactWaitSeconds]) {
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60) throw new Error("wait must be 1–60 seconds");
  }
  if (navigatePath && (!navigatePath.startsWith("/") || navigatePath.startsWith("//") || /[?#]/.test(navigatePath))) {
    throw new Error("--navigate-path must be a pathname such as /how-to-play");
  }
  return true;
}

/* Keep the existing OpenCLI/scene path; use argument arrays rather than shell interpolation. */
function cli(session, args, timeout = 30000) {
  try {
    return execFileSync("opencli", ["browser", session, "--window", "dedicated", ...args],
      { encoding: "utf8", timeout, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch { throw new Error(`OpenCLI ${args[0]} failed; observation not verified`); }
}
function evalJs(session, js) { return cli(session, ["eval", `(()=>{${js}})()`]); }
function readJson(raw) {
  const value = JSON.parse(raw);
  return typeof value === "string" ? JSON.parse(value) : value;
}
function settle(session, seconds) {
  cli(session, ["eval", `(async()=>{await new Promise(r=>setTimeout(r,${seconds * 1000}));return true})()`], seconds * 1000 + 30000);
}
function readObservation(session, boundary = null) {
  const data = readJson(evalJs(session, `return {url:location.href,timeOrigin:performance.timeOrigin,
    scripts:[...document.querySelectorAll('script[src]')].map(s=>s.src),
    resources:performance.getEntriesByType('resource').map(r=>({url:r.name,initiatorType:r.initiatorType,responseStatus:r.responseStatus,startTime:r.startTime}))};`));
  try {
    const args = ["network", "--all"];
    if (boundary) args.push("--since", `${Math.max(0.001, (Date.now() - boundary.wallTime) / 1000)}s`);
    const network = readJson(cli(session, args));
    data.network = (network.entries || []).map(entry => ({ url: entry.url, method: entry.method, status: entry.status }));
    data.networkCapture = data.network.length ? "observed" : "not_verified";
  } catch { data.network = []; data.networkCapture = "not_verified"; }
  data.sendSince = boundary?.performanceTime ?? null;
  return data;
}

let evidence = null;
function evidenceDir() { return evidence ||= newEvidenceDir("analytics-beacon-check"); }
function scene(session, tag, extra) {
  try {
    return captureScene({ dir: evidenceDir(), tag, extra,
      screenshot: path => cli(session, ["screenshot", path], 90000),
      pageText: () => evalJs(session, "return document.title"),
    });
  } catch { return { errors: ["evidence_capture_failed"] }; }
}
async function runScenario(scenario) {
  const session = `${sessionPrefix || `abc-${sessionSuffix()}`}-${scenario}`;
  try {
    cli(session, ["open", url]);
    if (scenario === "interaction") cli(session, ["click", "body"]);
    settle(session, scenario === "interaction" ? interactWaitSeconds : waitSeconds);
    const initial = readObservation(session);
    const initialScene = scene(session, `${scenario}-initial`, { url: safeUrl(initial.url), classified: classifyBeacons(initial), networkCapture: initial.networkCapture });
    let afterNavigation = null;
    const requested = Boolean(navigateSelector && navigatePath);
    if (requested) {
      const boundary = { performanceTime: Number(evalJs(session, "return performance.now()")), wallTime: Date.now() };
      cli(session, ["click", navigateSelector]);
      // Observe a native navigation only. Never synthesize history.pushState or a beacon.
      cli(session, ["eval", `(async()=>{const until=Date.now()+15000;while(location.pathname!==${JSON.stringify(navigatePath)}&&Date.now()<until){await new Promise(r=>setTimeout(r,200))}return location.pathname})()`]);
      settle(session, waitSeconds);
      afterNavigation = readObservation(session, boundary);
    }
    const result = { scenario, resourceCount: initial.resources.length,
      ...assessScenario(initial, afterNavigation, { requested, targetPath: navigatePath }) };
    result.networkCapture = { initial: initial.networkCapture, afterNavigation: afterNavigation?.networkCapture ?? "not_verified" };
    result.table = formatBeaconTable(result.classified);
    const finalScene = scene(session, `${scenario}-final`, result);
    result.evidenceStatus = initialScene.errors.length || finalScene.errors.length ? "not_verified" : "captured";
    if (result.evidenceStatus === "not_verified" && result.status !== "fail") result.status = "needs-verification";
    return result;
  } catch (error) {
    const result = { scenario, status: "needs-verification", error: error.message };
    result.evidenceStatus = scene(session, `${scenario}-error`, result).errors.length ? "not_verified" : "captured";
    return result;
  } finally {
    if (!keepSession) { try { cli(session, ["close"]); } catch { /* Own session only. */ } }
  }
}
async function main() {
  if (!parseArgs(process.argv.slice(2))) return;
  const scenarios = both ? ["no-interaction", "interaction"] : [interact ? "interaction" : "no-interaction"];
  const results = [];
  for (const scenario of scenarios) results.push(await runScenario(scenario));
  const status = results.some(r => r.status === "fail") ? "fail" : results.every(r => r.status === "pass") ? "pass" : "needs-verification";
  const output = { url: safeUrl(url), status, evidenceDir: null, results,
    scope: "SDK entrypoint counts, observed script responses, natural collection responses and same-document SPA navigation only",
    limitations: ["Payloads are not inspected", "Site/account ID ownership is not verified", "Duplicate logical events are not detected"],
  };
  try {
    output.evidenceDir = evidenceDir();
    writeManifest(output.evidenceDir, { script: "analytics-beacon-check", ...output, finishedAt: new Date().toISOString() });
  } catch {
    output.evidenceStatus = "not_verified";
    if (output.status !== "fail") output.status = "needs-verification";
  }
  if (json) console.log(JSON.stringify(output, null, 2));
  else {
    for (const r of results) console.log(`${r.scenario}: ${r.status}\n${r.table || r.error}\nNavigation: ${r.navigation?.status || "not_verified"}\n`);
    console.log(`${output.status}; 证据: ${output.evidenceDir || "not_verified"}`);
    console.log(`Scope: ${output.scope}\nLimitations: ${output.limitations.join("; ")}`);
  }
  process.exitCode = output.status === "pass" ? 0 : output.status === "fail" ? 1 : 2;
}
async function invokedAsScript() {
  if (!process.argv[1]) return false;
  try { return pathToFileURL(await realpath(resolvePath(process.argv[1]))).href === import.meta.url; } catch { return false; }
}
if (await invokedAsScript()) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
