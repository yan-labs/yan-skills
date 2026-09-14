import test from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  isKnownReportRoute,
  isTransientOpenError,
  parseDataExplorerTotal,
  extractRowUrl,
  mergeDataExplorerRows,
  nextSortingVariant,
  parseScheduledCell,
} from "../scripts/ahrefs-site-audit.mjs";

test("parseArgs: --retries 与 --max-pages 有默认值", () => {
  const { o } = parseArgs(["projects"]);
  assert.equal(o.retries, 2);
  assert.equal(o.maxPages, 5);
});

test("parseArgs: --retries 与 --max-pages 可覆盖", () => {
  const { pos, o } = parseArgs(["report", "123", "overview", "--retries", "4", "--max-pages", "8"]);
  assert.deepEqual(pos, ["report", "123", "overview"]);
  assert.equal(o.retries, 4);
  assert.equal(o.maxPages, 8);
});

// 回归:间歇性 "Navigation rejected" 之前被脚本直接 bail,把偶发问题升级成
// 任务失败——实测原样重跑往往就好,现在命中这类瞬时错误会自动重试。
test("isTransientOpenError: 命中已知的瞬时错误措辞", () => {
  assert.equal(isTransientOpenError("Navigation rejected"), true);
  assert.equal(isTransientOpenError("net::ERR_ABORTED"), true);
  assert.equal(isTransientOpenError("ECONNRESET"), true);
  assert.equal(isTransientOpenError("Frame was detached"), true);
  assert.equal(isTransientOpenError("Target closed"), true);
  assert.equal(isTransientOpenError("request timed out"), true);
});

test("isTransientOpenError: 不该重试的错误（登录态失效等）不命中", () => {
  assert.equal(isTransientOpenError("redirected to login page"), false);
  assert.equal(isTransientOpenError("project not found"), false);
  assert.equal(isTransientOpenError(""), false);
  assert.equal(isTransientOpenError(undefined), false);
});

test("parseDataExplorerTotal: 中文'个 结果'与英文'results'都能解析", () => {
  assert.equal(parseDataExplorerTotal("高级版筛选器 189 个 结果 Patches"), 189);
  assert.equal(parseDataExplorerTotal("Filters 42 results"), 42);
  assert.equal(parseDataExplorerTotal("1 result"), 1);
});

test("parseDataExplorerTotal: 带千分位逗号的数字也能解析", () => {
  assert.equal(parseDataExplorerTotal("1,234 results"), 1234);
});

test("parseDataExplorerTotal: 解析不到时返回 null，不是 0", () => {
  assert.equal(parseDataExplorerTotal("没有总数信息的文本"), null);
  assert.equal(parseDataExplorerTotal(""), null);
});

test("extractRowUrl: 从一行的各格文本里找到第一个 URL", () => {
  assert.equal(
    extractRowUrl(["20", "html title text", "https://example.com/play/x", "0", "200"]),
    "https://example.com/play/x",
  );
});

test("extractRowUrl: 没有 URL 时返回 null", () => {
  assert.equal(extractRowUrl(["20", "no url here", "0"]), null);
  assert.equal(extractRowUrl([]), null);
  assert.equal(extractRowUrl(undefined), null);
});

// 回归:data-explorer 页大小固定 50、没有翻页控件,换排序重抓后要按 URL
// 去重合并,不能重复计数同一行、也不能丢掉解析不出 URL 的行。
test("mergeDataExplorerRows: 跨页去重，重叠的 URL 只保留一份", () => {
  const page1 = [
    ["a", "https://example.com/1"],
    ["b", "https://example.com/2"],
  ];
  const page2 = [
    ["c", "https://example.com/2"], // 与 page1 重叠
    ["d", "https://example.com/3"],
  ];
  const merged = mergeDataExplorerRows([page1, page2]);
  assert.equal(merged.uniqueUrlCount, 3);
  assert.equal(merged.rows.length, 3);
});

test("mergeDataExplorerRows: 抽不出 URL 的行不丢弃，但不计入去重计数", () => {
  const page1 = [["a", "https://example.com/1"], ["no-url-here"]];
  const merged = mergeDataExplorerRows([page1]);
  assert.equal(merged.uniqueUrlCount, 1);
  assert.equal(merged.noUrlCount, 1);
  assert.equal(merged.rows.length, 2);
});

test("mergeDataExplorerRows: 空输入不抛错", () => {
  assert.deepEqual(mergeDataExplorerRows([]), { rows: [], uniqueUrlCount: 0, noUrlCount: 0 });
  assert.deepEqual(mergeDataExplorerRows(undefined), { rows: [], uniqueUrlCount: 0, noUrlCount: 0 });
});

test("nextSortingVariant: 按列顺序依次给出降序、升序，跳过已用过的", () => {
  const used = new Set(["-pageRating"]);
  assert.equal(nextSortingVariant(["pageRating", "url"], used), "pageRating");
  used.add("pageRating");
  assert.equal(nextSortingVariant(["pageRating", "url"], used), "-url");
});

test("nextSortingVariant: 所有变体都用过时返回 null", () => {
  const used = new Set(["-pageRating", "pageRating"]);
  assert.equal(nextSortingVariant(["pageRating"], used), null);
});

test("nextSortingVariant: 空列清单直接返回 null", () => {
  assert.equal(nextSortingVariant([], new Set()), null);
  assert.equal(nextSortingVariant(undefined, new Set()), null);
});

test("parseScheduledCell: 认得中文'月/日,时—时 时段词'格式", () => {
  const cells = ["9月11日03:15 凌晨", "已完成", "39%", "293", "193", "9月18日, 3—4 凌晨", "开始", "基础的"];
  assert.equal(parseScheduledCell(cells), "9月18日, 3—4 凌晨");
});

test("parseScheduledCell: 不会把'最后一次抓取'的单一时间点误判成排程", () => {
  // 只有"最后一次抓取"这一种单一时间点格式的格子,没有真正的排程格子。
  const cells = ["9月11日03:15 凌晨", "已完成", "39%"];
  assert.equal(parseScheduledCell(cells), null);
});

test("parseScheduledCell: 认得英文格式", () => {
  const cells = ["Sep 11 03:15 AM", "Complete", "Sep 18, 3-4 AM", "Start"];
  assert.equal(parseScheduledCell(cells), "Sep 18, 3-4 AM");
});

test("parseScheduledCell: 找不到时返回 null", () => {
  assert.equal(parseScheduledCell(["无关文本", "其他列"]), null);
  assert.equal(parseScheduledCell([]), null);
  assert.equal(parseScheduledCell(undefined), null);
});

test("known report routes preserve crawl-date queries without allowing external or unknown paths", () => {
  assert.equal(isKnownReportRoute("overview?current=10-09-2026T191531"), true);
  assert.equal(isKnownReportRoute("issues?current=10-09-2026T191531"), true);
  assert.equal(isKnownReportRoute("data-explorer?issueId=example"), true);
  for (const route of ["https://evil.test/overview", "//evil.test/overview", "../overview", "unknown?current=x", "__proto__"]) {
    assert.equal(isKnownReportRoute(route), false);
  }
});
