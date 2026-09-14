import test from "node:test";
import assert from "node:assert/strict";
import { classifyBeacons, formatBeaconTable, assessScenario } from "../scripts/analytics-beacon-check.mjs";

const scripts = [
  "https://www.googletagmanager.com/gtag/js?id=G-PRIVATE",
  "https://www.clarity.ms/tag/private-id",
  "https://analytics.ahrefs.com/analytics.js",
  "https://static.cloudflareinsights.com/beacon.min.js",
];
const sends = [
  "https://www.google-analytics.com/g/collect?tid=G-PRIVATE",
  "https://c.clarity.ms/collect",
  "https://analytics.ahrefs.com/api/event",
  "https://cloudflareinsights.com/cdn-cgi/rum",
];
function snapshot(overrides = {}) {
  return { url: "https://example.com/", timeOrigin: 123, scripts,
    resources: scripts.map(url => ({ url, initiatorType: "script", responseStatus: 200 })),
    network: sends.map(url => ({ url, method: "POST", status: 204 })), ...overrides };
}
const navigation = { requested: true, targetPath: "/play/2" };

test("same-URL duplicate DOM nodes survive resource classification and fail", () => {
  const c = classifyBeacons(snapshot({ scripts: [...scripts, scripts[3]] }));
  assert.equal(c.cfWebAnalytics.scriptCount, 2);
  assert.equal(c.cfWebAnalytics.scriptUrls.length, 2);
  assert.equal(c.cfWebAnalytics.status, "fail");
});

test("normal SDK children and a separate GTM loader are not duplicate entrypoints", () => {
  const children = ["https://scripts.clarity.ms/0.8.69/clarity.js", "https://www.googletagmanager.com/gtm.js?id=GTM-PRIVATE"];
  const c = classifyBeacons(snapshot({ scripts: [...scripts, ...children], resources: [
    ...snapshot().resources, ...children.map(url => ({ url, initiatorType: "script", responseStatus: 200 })),
  ] }));
  assert.equal(c.clarity.scriptCount, 1);
  assert.equal(c.clarity.status, "pass");
  assert(c.clarity.matchedUrls.includes(children[0]));
  assert.equal(c.ga4.scriptCount, 1);
  assert.equal(c.ga4.status, "pass");
});

test("four separate providers each have one script and independently verified sends", () => {
  const c = classifyBeacons(snapshot());
  for (const provider of Object.values(c)) {
    assert.equal(provider.scriptCount, 1);
    assert.equal(provider.scriptLoadStatus, "verified");
    assert.equal(provider.sendingStatus, "verified");
    assert.equal(provider.status, "pass");
  }
  assert(!JSON.stringify(c).includes("PRIVATE"));
  assert(!JSON.stringify(c).includes("private-id"));
});

test("script presence and resource requests do not prove load or successful sending", () => {
  const c = classifyBeacons(snapshot({ network: [], resources: scripts.map(url => ({ url, responseStatus: 0 })) }));
  assert.equal(c.cfWebAnalytics.scriptPresent, true);
  assert.equal(c.cfWebAnalytics.resourceRequestObserved, true);
  assert.equal(c.cfWebAnalytics.scriptLoadStatus, "not_verified");
  assert.equal(c.cfWebAnalytics.sendingStatus, "not_verified");
  assert.equal(c.cfWebAnalytics.status, "needs-verification");
});

test("legacy URL arrays remain accepted but cannot prove DOM counts or sending", () => {
  const c = classifyBeacons([...scripts, scripts[3]]);
  assert.equal(c.cfWebAnalytics.scriptCount, null);
  assert.equal(c.cfWebAnalytics.sendingStatus, "not_verified");
  assert.equal(c.cfWebAnalytics.status, "needs-verification");
  assert.equal(classifyBeacons(null).ga4.loaded, false);
  assert.match(formatBeaconTable(c), /needs-verification/);
});

test("substring lookalike host does not count as a provider", () => {
  const c = classifyBeacons(snapshot({ scripts: ["https://googletagmanager.com.attacker.test/x.js"] }));
  assert.equal(c.ga4.scriptCount, 0);
});

test("missing navigation, unchanged pathname and full reload never pass SPA validation", () => {
  const before = snapshot();
  for (const [after, request] of [[null, {}], [before, navigation],
    [snapshot({ url: "https://example.com/play/2", timeOrigin: 456 }), navigation]]) {
    assert.equal(assessScenario(before, after, request).status, "needs-verification");
  }
});

test("real same-document pathname change passes only with verified sends in both observations", () => {
  const before = snapshot();
  const after = snapshot({ url: "https://example.com/play/2" });
  assert.equal(assessScenario(before, after, navigation).status, "pass");
  assert.equal(assessScenario(before, { ...after, network: [] }, navigation).status, "needs-verification");
  const duplicate = { ...after, scripts: [...scripts, scripts[0]] };
  assert.equal(assessScenario(before, duplicate, navigation).status, "fail");
});

test("actual failed RUM response fails, while a script GET is not a send", () => {
  const c = classifyBeacons(snapshot({ network: [{ url: "https://example.com/cdn-cgi/rum", method: "POST", status: 404 }] }));
  assert.equal(c.cfWebAnalytics.sendingStatus, "failed");
  assert.equal(c.cfWebAnalytics.status, "fail");
  const scriptOnly = classifyBeacons(snapshot({ network: [{ url: scripts[3], method: "GET", status: 200 }] }));
  assert.equal(scriptOnly.cfWebAnalytics.sendingStatus, "not_verified");
});

test("an old performance send cannot verify the post-navigation observation", () => {
  const c = classifyBeacons(snapshot({ network: [], sendSince: 200,
    resources: [{ url: sends[3], initiatorType: "beacon", responseStatus: 204, startTime: 100 }] }));
  assert.equal(c.cfWebAnalytics.sendingStatus, "not_verified");
});

test("GET 200 on a POST collector, or methodless fetch timing, does not prove sending", () => {
  for (const network of [[{ url: sends[3], method: "GET", status: 200 }], []]) {
    const c = classifyBeacons(snapshot({ network,
      resources: [{ url: sends[3], initiatorType: "fetch", responseStatus: 200 }] }));
    assert.equal(c.cfWebAnalytics.sendingStatus, "not_verified");
  }
});
