import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diff, docTools, engineToolsFromSource, namesFromList, parseArgs } from "../scripts/maintain/engine-tools-diff.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("集成文件的工具清单可解析，且与分组表里出现的工具名一致", async () => {
  const text = await readFile(path.join(skillRoot, "references/integrations/site-engine.md"), "utf8");
  const listed = docTools(text);
  assert.ok(listed.size >= 100, `清单只有 ${listed.size} 个`);
  const table = text.slice(text.indexOf("## 工具分组"), text.indexOf("## 引擎已经替你做了什么"));
  const inTable = new Set([...table.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((m) => m[1]));
  assert.deepEqual([...listed].filter((n) => !inTable.has(n)), [], "清单里有分组表没列的工具");
  assert.deepEqual([...inTable].filter((n) => !listed.has(n)), [], "分组表里有清单没有的工具");
});

test("diff 分别报引擎新增与集成文件里已消失的工具", () => {
  const r = diff(namesFromList("get_guide, page_upsert\nnew_tool"), new Set(["get_guide", "page_upsert", "old_tool"]));
  assert.deepEqual(r.added, ["new_tool"]);
  assert.deepEqual(r.missing, ["old_tool"]);
});

test("从引擎源码的工具定义里取名", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "engine-src-"));
  try {
    await mkdir(path.join(dir, "src/core"), { recursive: true });
    await mkdir(path.join(dir, "src/types/game"), { recursive: true });
    await writeFile(path.join(dir, "src/core/tools.ts"), "export const t = [\n  {\n    name: 'get_guide',\n  },\n  {\n    name: 'check',\n  },\n];\nconst x = { name: 'not_a_tool' };\n");
    await writeFile(path.join(dir, "src/types/game/index.ts"), "  {\n    name: \"game_list\",\n  },\n");
    await writeFile(path.join(dir, "src/core/remind-tools.ts"), "  {\n    name: 'push_send',\n  },\n");
    await writeFile(path.join(dir, "src/core/mcp.ts"), "  {\n    name: 'new_site',\n  },\n");
    assert.deepEqual([...(await engineToolsFromSource(dir))].sort(), ["check", "game_list", "get_guide", "push_send"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--names 与 --engine-src 必须二选一", () => {
  assert.throws(() => parseArgs([]), /二选一/);
  assert.throws(() => parseArgs(["--names", "a", "--engine-src", "b"]), /二选一/);
  assert.equal(parseArgs(["--names", "a"]).names, "a");
});
