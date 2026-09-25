import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const script = new URL("../scripts/webcafe-api.mjs", import.meta.url).pathname;

test("official CLI discovers and calls a tool with Bearer auth", async () => {
  let called = false;
  const server = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/tools") return res.end(JSON.stringify({ tools: [{ id: "domain_dr", title: "DR", group: "raw", required: ["domains"], params: { domains: { type: "array" } } }] }));
    assert.equal(req.url, "/api/v1/domain_dr");
    assert.equal(req.headers.authorization, "Bearer test-token");
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.deepEqual(JSON.parse(body), { domains: ["a.com", "b.com"] });
    called = true;
    res.end(JSON.stringify({ ok: true, tool: "domain_dr", data: { count: 2 }, credits: { charged: 1 }, requestId: "req_test" }));
  });
  const dir = await mkdtemp(join(tmpdir(), "rankup-webcafe-test-"));
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { stdout } = await run(process.execPath, [script, "domain_dr", "a.com,b.com", "--json"], {
      env: { ...process.env, WEBCAFE_API: `http://127.0.0.1:${server.address().port}`, WEBCAFE_TOKEN: "test-token", XDG_CONFIG_HOME: dir },
    });
    assert.equal(JSON.parse(stdout).count, 2);
    assert.equal(called, true);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
