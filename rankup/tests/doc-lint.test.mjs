import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { entryStats, lint } from "../scripts/maintain/doc-lint.mjs";

const limits = { lines: 5, chars: 120, lineChars: 20 };

test("entryStats 不把 frontmatter 里的长 description 算作超长行", () => {
  const text = `---\nname: x\ndescription: ${"长".repeat(60)}\n---\n\n# X\n`;
  const stats = entryStats(text, { ...limits, lines: 10 });
  assert.equal(stats.lines, 6);
  assert.deepEqual(stats.longLines, []);
  assert.deepEqual(stats.problems, []);
});

test("entryStats 按码位计字符，分别报行数、字符数与超长行", () => {
  const text = `---\nname: x\n---\n${"一".repeat(25)}\n${"二".repeat(30)}\n三\n四\n`;
  const stats = entryStats(text, limits);
  assert.equal(stats.lines, 7);
  assert.equal(stats.chars, [...text].length);
  assert.deepEqual(stats.longLines.map((l) => l.line), [4, 5]);
  assert.equal(stats.problems.length, 2); // 行数超、两行超长；字符未超
  assert.match(stats.problems.join(), /行数 7 > 5/);
});

test("lint 在有 SKILL.md 的根目录报告入口统计，没有时为 null", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "doc-lint-entry-"));
  try {
    await writeFile(path.join(root, "README.md"), "# r\n");
    assert.equal((await lint({ root })).entry, null);
    await writeFile(path.join(root, "SKILL.md"), `---\nname: x\n---\n${"x".repeat(250)}\n`);
    const report = await lint({ root });
    assert.equal(report.entry.file, "SKILL.md");
    assert.deepEqual(report.entry.longLines, [{ line: 4, chars: 250 }]);
    assert.equal(report.broken.length, 0, "入口超标只是警告，不算断链");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
