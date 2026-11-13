#!/usr/bin/env node
// rankup-clean.mjs —— 清理 .rankup/ 中的过程数据，只保留结论文档、代码脚本、规范状态文件与被常驻文件引用的小体积结构化数据。
//
// 用法：
//   node scripts/maintain/rankup-clean.mjs --project-root <含 .rankup 的目录> [--older-than <N>d|<N>w] [--workspace <目录>] [--include-backups <路径…>] [--dry-run] [--apply] [--staged] [--install-hook] [--write-gitignore] [--json]
//
// 结构化数据保留体积阈值（写死在本头注与导出常量 MAX_RETAINED_DATA_BYTES）：
//   MAX_RETAINED_DATA_BYTES = 100 * 1024（100 KB）
//   - <= 100 KB 且被常驻文件（INDEX.md、plan.md、decisions.md、leftovers.md、PROJECT.md、roadmap.md、
//     tasks/*.md、topics/**/*.md、architecture/**/*.md、infra/**/*.md 等）直接引用的结构化数据（json/jsonl/csv/tsv/psv/txt/yaml/toml）予以保留；
//   - 只被其他报告（reports/**、research/**、journal/**、evidence/**、agentic/**、tasks/briefs/**）引用的过程数据不计入常驻引用，按规则清理；
//   - 超出 100 KB 的原始数据（即使被引用）除非列入 .rankup/.keep-data 白名单，一律视为过程数据直接删除。
//
// 清理与保留边界：
//   1. 清理（过程数据）：截图与图片（png/jpg/jpeg/webp/gif/svg/bmp/ico/avif/tiff）、日志与补丁（log/out/err/patch/diff 及未引用 txt）、
//      trace/har（har/trace/*trace*.json/*trace*.zip/cpuprofile/heapsnapshot）、测试输出（如 surefire xml/junit/tap）、
//      压缩包（gz/tgz/tar/zip/bz2/xz/zst/7z）、超阈值或未被常驻文件引用的原始数据（json/jsonl/csv/tsv/psv）及失效数据符号链接。
//   2. 保留：Markdown（.md）、脚本与代码（mjs/js/cjs/ts/mts/cts/tsx/jsx/py/sh/sql）、规范状态与配置文件
//      （skill-state.json、review-state.json、projects.json、indexnow-last.json、backlink-targets.json、config.json、
//      state/** 及 *state*.json / *checkpoint*.json / *watermark*.json / *cursor*.json）、
//      .rankup/.keep-data 列出的相对路径或 glob（支持行尾注释或原因说明）、<=100KB 且被常驻文件直接引用的结构化数据。
//   默认 --older-than 7d，仅预览；历史 trash 同时限。
//   3. --apply 直接删除，不建回收目录或清单，并清空历史 trash 中的普通内容；证据与备份默认列待确认，用户同意后 --include-backups 显式纳入；
//      并将 .rankup/**/*.md 中指向被清文件的相对链接替换为行内文字“（原始数据已清理 <YYYY-MM-DD>）”，保证 doc-lint 0 断链。
//   4. 提交时自动化：--staged 仅检查本轮候选；Git 已跟踪/已暂存文件一律不删除，列待确认。
//      --install-hook 安装/追加幂等带标记的 pre-commit hook（兼容已有 hook 与 core.hooksPath 如 husky）；
//      --write-gitignore 写入/更新 .rankup/.gitignore 模板。

import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { chmod, lstat, mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_RETAINED_DATA_BYTES = 100 * 1024; // 100 KB

const scriptPath = fileURLToPath(import.meta.url);

const CODE_EXTENSIONS = new Set([
  ".mjs", ".js", ".cjs", ".ts", ".mts", ".cts", ".tsx", ".jsx", ".py", ".sh", ".sql",
]);

const CONFIG_BASENAMES = new Set([
  ".gitignore", ".keep-data", ".gitkeep", "package.json", "tsconfig.json",
]);

const PROTOCOL_STATE_BASENAMES = new Set([
  "skill-state.json",
  "review-state.json",
  "projects.json",
  "indexnow-last.json",
  "backlink-targets.json",
  "config.json",
]);

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".ico", ".avif", ".tiff",
]);

const ARCHIVE_EXTENSIONS = new Set([
  ".gz", ".tgz", ".tar", ".zip", ".bz2", ".xz", ".zst", ".7z",
]);

const TRACE_EXTENSIONS = new Set([
  ".har", ".trace", ".cpuprofile", ".heapsnapshot",
]);

const TEST_OUTPUT_EXTENSIONS = new Set([
  ".xml", ".junit", ".tap",
]);

const LOG_EXTENSIONS = new Set([
  ".log", ".out", ".err", ".patch", ".diff",
]);

const STRUCTURED_DATA_EXTENSIONS = new Set([
  ".json", ".jsonl", ".ndjson", ".csv", ".tsv", ".psv", ".txt", ".yaml", ".yml", ".toml",
]);

const PROCESS_DATA_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...ARCHIVE_EXTENSIONS,
  ...TRACE_EXTENSIONS,
  ...TEST_OUTPUT_EXTENSIONS,
  ...LOG_EXTENSIONS,
  ...STRUCTURED_DATA_EXTENSIONS,
]);

export const GITIGNORE_START = "# >>> rankup-clean >>>";
export const GITIGNORE_END = "# <<< rankup-clean <<<";
export const HOOK_START = "# >>> rankup-clean pre-commit >>>";
export const HOOK_END = "# <<< rankup-clean pre-commit <<<";

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function parseArgs(argv) {
  const opts = {
    projectRoot: process.cwd(),
    includeBackups: [],
    olderThan: "7d",
    rankupDir: null,
    apply: false,
    staged: false,
    installHook: false,
    writeGitignore: false,
    json: false,
    help: false,
    date: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-root") opts.projectRoot = path.resolve(argv[++i] ?? "");
    else if (a === "--rankup-dir") opts.rankupDir = path.resolve(argv[++i] ?? "");
    else if (a === "--older-than") opts.olderThan = argv[++i];
    else if (a === "--include-backups") {
      const start = i;
      while (argv[i + 1] && !argv[i + 1].startsWith("--")) opts.includeBackups.push(path.resolve(argv[++i]));
      if (i === start) throw new Error("--include-backups 需要显式路径");
    }
    else if (a === "--workspace") opts.workspace = path.resolve(argv[++i]);
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--apply") opts.apply = true;
    else if (a === "--staged") opts.staged = true;
    else if (a === "--install-hook") opts.installHook = true;
    else if (a === "--write-gitignore") opts.writeGitignore = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--date") opts.date = argv[++i] ?? null;
    else if (a === "-h" || a === "--help") opts.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (opts.dryRun) opts.apply = false;
  if (argv.includes("--older-than")) parseAge(opts.olderThan);
  if (opts.rankupDir) {
    opts.projectRoot = path.basename(opts.rankupDir) === ".rankup"
      ? path.dirname(opts.rankupDir)
      : opts.rankupDir;
  } else if (path.basename(opts.projectRoot) === ".rankup") {
    opts.rankupDir = opts.projectRoot;
    opts.projectRoot = path.dirname(opts.projectRoot);
  } else {
    opts.rankupDir = path.join(opts.projectRoot, ".rankup");
  }
  return opts;
}

export function parseAge(value) {
  if (!/^[1-9]\d*[dw]$/.test(value ?? "")) throw new Error("--older-than 需要正整数 Nd 或 Nw");
  return Number(value.slice(0, -1)) * (value.endsWith("w") ? 7 : 1) * 86400000;
}

export async function workspaceProjects(root) {
  const projects = [];
  async function visit(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.isSymbolicLink() || [".git", "node_modules"].includes(e.name)) continue;
      if (e.name === ".rankup") projects.push(dir);
      else await visit(path.join(dir, e.name));
    }
  }
  await visit(root);
  return projects;
}

export function resolveRankupHome() {
  return process.env.RANKUP_HOME
    ? path.resolve(process.env.RANKUP_HOME)
    : path.join(homedir(), ".rankup");
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

// 去掉围栏代码块，保留行号（与 doc-lint.mjs 一致）。
export function stripFences(text) {
  const lines = text.split("\n");
  let fence = null;
  return lines.map((line) => {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (m) {
      if (!fence) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      return "";
    }
    return fence ? "" : line;
  });
}

// 判断一个 .rankup 内的相对路径是否属于「常驻文件」（直接引用结构化小数据时可保留）。
// reports/**、research/**、journal/**、evidence/**、agentic/**、tasks/briefs/** 等属于报告/研究/流水，不算常驻文件。
export function isResidentDoc(relPosix) {
  if (!relPosix.endsWith(".md")) return false;
  if (!relPosix.includes("/")) return true; // 顶层常驻文档：INDEX.md、plan.md、decisions.md、leftovers.md 等
  if (relPosix.startsWith("topics/")) return true;
  if (relPosix.startsWith("architecture/")) return true;
  if (relPosix.startsWith("infra/")) return true;
  if (/^tasks\/[^/]+\.md$/.test(relPosix)) return true; // 顶层任务单（不含 tasks/briefs/**）
  return false;
}

// 将 glob 转为正则表达式，支持 **、*、? 及目录前缀。
export function globToRegExp(globPattern) {
  const normalized = globPattern.replace(/^\/+/, "").replace(/\/+$/, "");
  let regexStr = "^";
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === "*") {
      if (normalized[i + 1] === "*") {
        if (normalized[i + 2] === "/") {
          regexStr += "(?:.*/)?";
          i += 2;
        } else {
          regexStr += ".*";
          i += 1;
        }
      } else {
        regexStr += "[^/]*";
      }
    } else if (ch === "?") {
      regexStr += "[^/]";
    } else if (".+^${}()|[]\\".includes(ch)) {
      regexStr += `\\${ch}`;
    } else {
      regexStr += ch;
    }
  }
  regexStr += "(?:$|/.*$)";
  return new RegExp(regexStr);
}

// 解析 .rankup/.keep-data：一行一个相对路径或 glob，可带 # 注释或空白分隔的原因。
export async function loadKeepDataRules(rankupDir) {
  const keepFile = path.join(rankupDir, ".keep-data");
  let raw = "";
  try {
    raw = await readFile(keepFile, "utf8");
  } catch {
    return [];
  }
  const rules = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    let patternPart = trimmed;
    let reason = "";
    const hashIdx = trimmed.indexOf("#");
    if (hashIdx !== -1) {
      patternPart = trimmed.slice(0, hashIdx).trim();
      reason = trimmed.slice(hashIdx + 1).trim();
    }
    const spaceMatch = patternPart.match(/^(\S+)(?:\s+(.*))?$/);
    if (!spaceMatch) continue;
    const rawPattern = spaceMatch[1].replace(/^\.\/+/, "").replace(/^\.rankup\/+/, "");
    if (!reason && spaceMatch[2]) reason = spaceMatch[2].replace(/^[—\-:]+\s*/, "").trim();
    if (!rawPattern) continue;
    rules.push({
      pattern: rawPattern,
      reason: reason || "列于 .keep-data",
      regex: globToRegExp(rawPattern),
    });
  }
  return rules;
}

function matchKeepData(relPosix, rules) {
  for (const rule of rules) {
    if (rule.pattern === relPosix || rule.regex.test(relPosix)) return rule;
  }
  return null;
}

// 扫描常驻 Markdown 文件，提取它们直接引用的 .rankup 内部文件相对路径 -> Set<常驻文件名>。
export async function collectResidentReferences(rankupDir, allRelPathsSet) {
  const refs = new Map();
  const addRef = (targetRel, sourceRel) => {
    if (!allRelPathsSet.has(targetRel)) return;
    if (!refs.has(targetRel)) refs.set(targetRel, new Set());
    refs.get(targetRel).add(sourceRel);
  };

  for (const rel of allRelPathsSet) {
    if (!isResidentDoc(rel)) continue;
    let text = "";
    try {
      text = await readFile(path.join(rankupDir, rel), "utf8");
    } catch {
      continue;
    }
    const strippedLines = stripFences(text);
    for (const rawLine of strippedLines) {
      if (!rawLine) continue;
      // 1. 标准 Markdown 链接 [label](target) 或 ![label](target)
      const lineNoCode = rawLine.replace(/`[^`]*`/g, (s) => " ".repeat(s.length));
      for (const m of lineNoCode.matchAll(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = m[3];
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        const [rawPath] = target.split("#");
        if (!rawPath) continue;
        let decodedPath = rawPath;
        try {
          decodedPath = decodeURIComponent(rawPath);
        } catch {}
        const resolved = path.resolve(rankupDir, path.dirname(rel), decodedPath);
        const targetRel = toPosix(path.relative(rankupDir, resolved));
        if (!targetRel.startsWith("..")) addRef(targetRel, rel);
      }
      // 2. 行内代码或正文中直接写出的相对路径（如 `reports/foo.json` 或 `.rankup/reports/foo.json`）
      for (const m of rawLine.matchAll(/(?:^|[\s`"'([（])((?:\.rankup\/)?(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.[A-Za-z0-9]+)(?=$|[\s`"')\]），。；：！？,.;:!?])/g)) {
        const cleaned = m[1].replace(/^\.rankup\/+/, "").replace(/^\.\/+/, "");
        if (allRelPathsSet.has(cleaned)) {
          addRef(cleaned, rel);
        } else {
          const resolved = path.resolve(rankupDir, path.dirname(rel), cleaned);
          const targetRel = toPosix(path.relative(rankupDir, resolved));
          if (!targetRel.startsWith("..")) addRef(targetRel, rel);
        }
      }
    }
  }
  return refs;
}

async function walkRankupFiles(rankupDir) {
  const results = [];
  try {
    const root = await lstat(rankupDir);
    if (root.isSymbolicLink()) {
      return [{ rel: ".", fullPath: rankupDir, size: 0, mtimeMs: root.mtimeMs, targetExists: true, protectedRoot: true }];
    }
  } catch (e) { if (e.code === "ENOENT") return []; throw e; }
  async function walk(currentDir) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const fullPath = path.join(currentDir, entry.name);
      let lst;
      try {
        lst = await lstat(fullPath);
      } catch {
        continue;
      }
      if (lst.isDirectory() && !lst.isSymbolicLink()) {
        const before = results.length;
        await walk(fullPath);
        if (before === results.length && isSensitive(fullPath)) results.push({ rel: toPosix(path.relative(rankupDir, fullPath)), fullPath, size: 0, mtimeMs: lst.mtimeMs, targetExists: true, isDirectory: true });
        continue;
      }
      let targetStat = null;
      let targetExists = true;
      if (lst.isSymbolicLink()) {
        try {
          targetStat = await stat(fullPath);
        } catch {
          targetExists = false;
        }
      } else {
        targetStat = lst;
      }
      if (targetStat && targetStat.isDirectory()) continue;
      const rel = toPosix(path.relative(rankupDir, fullPath));
      results.push({
        rel,
        fullPath,
        size: lst.size,
        mtimeMs: lst.mtimeMs,
        isSymbolicLink: lst.isSymbolicLink(),
        targetExists,
      });
    }
  }
  await walk(rankupDir);
  results.sort((a, b) => a.rel.localeCompare(b.rel));
  return results;
}

function isStateOrCheckpointJson(rel, base, ext, size, targetExists) {
  if (!targetExists) return false;
  if (PROTOCOL_STATE_BASENAMES.has(base)) return true;
  if (ext !== ".json") return false;
  if (rel.startsWith("state/")) return true;
  if (/(?:^|[-_.])(state|checkpoint|watermark|cursor)s?(?:[-_.]|\.json$)/i.test(base)) return true;
  return false;
}

export function classifyEntry(entry, { keepRules, residentRefs }) {
  const { rel, size, targetExists } = entry;
  const base = path.basename(rel);
  const ext = path.extname(base).toLowerCase();

  if (entry.protectedRoot) return { action: "keep", kind: "backup", category: "root", reason: "符号链接根目录跳过" };
  // 1. Markdown 文档常驻保留
  if (ext === ".md") {
    return { action: "keep", kind: "doc", category: "markdown", reason: "Markdown 文档" };
  }

  // 2. 脚本与代码保留
  if (CODE_EXTENSIONS.has(ext)) {
    return { action: "keep", kind: "code", category: "code", reason: "脚本与代码" };
  }

  // 3. 规范配置文件与白名单本身保留
  if (CONFIG_BASENAMES.has(base)) {
    return { action: "keep", kind: "config", category: "config", reason: "规范配置与白名单文件" };
  }

  // 3b. 备份副本（*.bak* / *.orig / *.backup / *~）归 C 类，只列不动，由用户决定
  if (/\.(?:bak|orig|backup)(?:\.[^/]+)?$|~$/i.test(base)) {
    return { action: "keep", kind: "backup", category: "backup", reason: "备份副本（C 类，只列不动，由用户决定）" };
  }

  // 4. .rankup/.keep-data 显式白名单保留
  const matchedRule = matchKeepData(rel, keepRules);
  if (matchedRule && targetExists) {
    return {
      action: "keep",
      kind: "data",
      category: "keep-data",
      reason: `.keep-data 白名单（${matchedRule.reason}）`,
    };
  }

  // 5. 规范指明保留的状态/断点文件
  if (isStateOrCheckpointJson(rel, base, ext, size, targetExists)) {
    const isProtocol = PROTOCOL_STATE_BASENAMES.has(base);
    return {
      action: "keep",
      kind: "data",
      category: "state",
      reason: isProtocol ? "规范保留状态/配置文件" : "断点与运行状态文件",
    };
  }

  // 6. 失效符号链接（非代码/非 md）直接清理
  if (!targetExists) {
    return {
      action: "clean",
      kind: "process-data",
      category: "broken-symlink",
      reason: "指向已不存在目标的过程数据符号链接",
    };
  }

  // 7. 截图与图片
  if (IMAGE_EXTENSIONS.has(ext)) {
    return {
      action: "clean",
      kind: "process-data",
      category: "image",
      reason: "截图与图片过程数据",
    };
  }

  // 8. trace / har 录制产物
  if (
    TRACE_EXTENSIONS.has(ext) ||
    (/trace/i.test(base) && (ext === ".json" || ext === ".zip"))
  ) {
    return {
      action: "clean",
      kind: "process-data",
      category: "trace-har",
      reason: "trace/har 录制数据",
    };
  }

  // 9. 测试输出（如 surefire xml）
  if (TEST_OUTPUT_EXTENSIONS.has(ext)) {
    return {
      action: "clean",
      kind: "process-data",
      category: "test-output",
      reason: "测试输出（如 surefire xml）",
    };
  }

  // 10. 压缩包
  if (ARCHIVE_EXTENSIONS.has(ext)) {
    return {
      action: "clean",
      kind: "process-data",
      category: "archive",
      reason: "压缩包过程数据",
    };
  }

  // 11. 日志与补丁输出
  if (LOG_EXTENSIONS.has(ext)) {
    return {
      action: "clean",
      kind: "process-data",
      category: "log",
      reason: "运行日志与补丁输出",
    };
  }

  // 12. 结构化数据与文本：仅当 <= 100 KB 且被常驻文件直接引用时保留
  const refSources = residentRefs.get(rel);
  if (STRUCTURED_DATA_EXTENSIONS.has(ext)) {
    if (refSources && refSources.size > 0) {
      if (size <= MAX_RETAINED_DATA_BYTES) {
        return {
          action: "keep",
          kind: "data",
          category: "referenced-data",
          reason: `常驻文件直接引用（${Array.from(refSources).join(", ")}，<= 100 KB）`,
        };
      }
      return {
        action: "clean",
        kind: "process-data",
        category: "raw-data",
        reason: `超出常驻引用体积阈值（${formatBytes(size)} > 100 KB）`,
      };
    }
    if (ext === ".txt") {
      return {
        action: "clean",
        kind: "process-data",
        category: "log",
        reason: "未被常驻文件引用的日志/文本输出",
      };
    }
    return {
      action: "clean",
      kind: "process-data",
      category: "raw-data",
      reason: size > MAX_RETAINED_DATA_BYTES
        ? `超阈值原始数据（${formatBytes(size)} > 100 KB）`
        : "未被常驻文件引用的过程原始数据",
    };
  }

  // 13. 其他未知文件：若 <= 100 KB 且被常驻文件直接引用则保留，否则按过程数据清理
  if (refSources && refSources.size > 0 && size <= MAX_RETAINED_DATA_BYTES) {
    return {
      action: "keep",
      kind: "data",
      category: "referenced-data",
      reason: `常驻文件直接引用（${Array.from(refSources).join(", ")}，<= 100 KB）`,
    };
  }
  return {
    action: "clean",
    kind: "process-data",
    category: "raw-data",
    reason: "未被常驻文件引用的过程数据文件",
  };
}

function safeRealpath(p) {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function getGitCandidates(projectRoot, rankupDir) {
  let gitRoot;
  try {
    gitRoot = safeRealpath(
      execFileSync("git", ["-C", rankupDir, "rev-parse", "--show-toplevel"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    return { gitRoot: null, rankupRelToGit: "", stagedRelSet: new Set(), candidateRelSet: new Set() };
  }

  const realRankupDir = safeRealpath(rankupDir);
  const rankupRelToGit = toPosix(path.relative(gitRoot, realRankupDir));
  const prefix = rankupRelToGit && rankupRelToGit !== "." ? `${rankupRelToGit}/` : "";
  const pathspec = rankupRelToGit || ".";

  const toRankupRel = (gitRelPath) => {
    const posixPath = toPosix(gitRelPath);
    if (!prefix) return posixPath;
    if (posixPath.startsWith(prefix)) return posixPath.slice(prefix.length);
    return null;
  };

  const stagedRelSet = new Set();
  const candidateRelSet = new Set();

  try {
    const stagedOut = execFileSync(
      "git",
      ["-C", gitRoot, "diff", "--cached", "--name-only", "-z", "--", pathspec],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    for (const item of stagedOut.split("\0")) {
      if (!item) continue;
      const rel = toRankupRel(item);
      if (rel) {
        stagedRelSet.add(rel);
        candidateRelSet.add(rel);
      }
    }
  } catch {}

  try {
    const statusOut = execFileSync(
      "git",
      ["-C", gitRoot, "status", "--porcelain", "-z", "-uall", "--", pathspec],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const tokens = statusOut.split("\0");
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (!tok || tok.length < 4) continue;
      const status = tok.slice(0, 2);
      const filePath = tok.slice(3);
      const rel = toRankupRel(filePath);
      if (rel) {
        candidateRelSet.add(rel);
        if (status[0] !== " " && status[0] !== "?") stagedRelSet.add(rel);
      }
      if (status.includes("R") || status.includes("C")) i += 1;
    }
  } catch {}

  return { gitRoot, rankupRelToGit, stagedRelSet, candidateRelSet };
}

export async function planClean({ projectRoot, rankupDir, staged = false, olderThan = "7d", includeBackups = [] }) {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedRankup = rankupDir ? path.resolve(rankupDir) : path.join(resolvedRoot, ".rankup");
  const allEntries = await walkRankupFiles(resolvedRankup);
  const allRelPathsSet = new Set(allEntries.map((e) => e.rel));
  const keepRules = await loadKeepDataRules(resolvedRankup);
  const residentRefs = await collectResidentReferences(resolvedRankup, allRelPathsSet);

  const gitInfo = staged
    ? getGitCandidates(resolvedRoot, resolvedRankup)
    : { gitRoot: null, rankupRelToGit: "", stagedRelSet: new Set(), candidateRelSet: new Set() };

  const tracked = trackedFiles(resolvedRankup);
  const residentNames = new Set(["INDEX.md", "plan.md", "decisions.md", "leftovers.md", "PROJECT.md", "roadmap.md"]);
  const cutoff = olderThan ? Date.now() - parseAge(olderThan) : null;
  const toClean = [];
  const toKeep = [];
  const pendingConfirmation = [];
  let pendingDocs;
  const retainedDataFiles = [];

  let totalBytesBefore = 0;
  let cleanBytes = 0;

  for (const entry of allEntries) {
    totalBytesBefore += entry.size;
    let decision = classifyEntry(entry, { keepRules, residentRefs });
    const base = path.basename(entry.rel);
    if (cutoff !== null && /^(research|journal|reports|evidence)\//.test(entry.rel)
        && !residentNames.has(base)
        && !/\.(?:bak|orig)(?:\.[^/]+)?$|~$/i.test(base)
        && !matchKeepData(entry.rel, keepRules)
        && (path.extname(base) === ".md" || CODE_EXTENSIONS.has(path.extname(base)))) {
      decision = { action: "clean", kind: "process-data", category: "old-report-code", reason: "超时报告与临时脚本" };
    }
    const hardProtected = entry.protectedRoot || entry.rel.startsWith("state/") || residentNames.has(base)
      || isResidentDoc(entry.rel) || CONFIG_BASENAMES.has(base)
      || matchKeepData(entry.rel, keepRules) || isStateOrCheckpointJson(entry.rel, base, path.extname(base), entry.size, entry.targetExists);
    if (isSensitive(entry.fullPath)) {
      if (!isIncluded(entry.fullPath, includeBackups)) {
        decision = { action: "keep", kind: "pending", category: "pending-confirmation", reason: "待确认：证据/备份" };
        pendingConfirmation.push(await pendingInfo(entry, pendingDocs ??= await readDocs(allEntries), resolvedRoot, hardProtected));
      } else if (!hardProtected && !entry.isDirectory) {
        decision = { action: "clean", kind: "process-data", category: "approved-backup", reason: "显式纳入的证据/备份" };
      }
    }
    if (entry.isDirectory) decision = { action: "keep", kind: "pending", category: "pending-confirmation", reason: "空证据/备份目录保留" };
    if (entry.rel.startsWith("state/")) decision = { action: "keep", kind: "data", category: "state", reason: "状态目录" };
    if (cutoff !== null && entry.mtimeMs >= cutoff && decision.action === "clean") {
      decision = { action: "keep", kind: "recent", category: "recent", reason: "未超过时限" };
    }
    if (tracked === null || tracked.has(entry.rel)) {
      decision = { action: "keep", kind: "pending", category: "tracked", reason: tracked === null ? "Git 状态无法核实，禁止删除，待确认" : "Git 已跟踪，禁止删除，待确认" };
      const existing = pendingConfirmation.find(e => e.path === entry.fullPath);
      if (existing) { existing.hardProtected = true; existing.usefulness = tracked === null ? "Git 状态无法核实，禁止删除" : "Git 已跟踪，显式纳入仍保留"; }
      else pendingConfirmation.push({ ...await pendingInfo(entry, pendingDocs ??= await readDocs(allEntries), resolvedRoot, true), usefulness: tracked === null ? "Git 状态无法核实，禁止删除" : "Git 已跟踪，显式纳入仍保留" });
    }
    const record = {
      rel: entry.rel,
      size: entry.size,
      ext: path.extname(entry.rel).toLowerCase() || "(no-ext)",
      isSymbolicLink: entry.isSymbolicLink,
      ...decision,
    };

    if (decision.action === "clean") {
      if (!staged || gitInfo.candidateRelSet.has(entry.rel)) {
        toClean.push(record);
        cleanBytes += entry.size;
      } else {
        toKeep.push({ ...record, action: "keep", reason: "非本次暂存/工作区变更文件（--staged 跳过）" });
      }
    } else {
      toKeep.push(record);
      if (decision.kind === "data") {
        retainedDataFiles.push(record);
      }
    }
  }

  retainedDataFiles.sort((a, b) => b.size - a.size || a.rel.localeCompare(b.rel));

  const byCategory = {};
  const byExtension = {};
  for (const item of toClean) {
    if (!byCategory[item.category]) byCategory[item.category] = { count: 0, bytes: 0 };
    byCategory[item.category].count += 1;
    byCategory[item.category].bytes += item.size;

    if (!byExtension[item.ext]) byExtension[item.ext] = { count: 0, bytes: 0, category: item.category };
    byExtension[item.ext].count += 1;
    byExtension[item.ext].bytes += item.size;
  }

  return {
    projectRoot: resolvedRoot,
    rankupDir: resolvedRankup,
    projectName: path.basename(resolvedRoot),
    thresholdBytes: MAX_RETAINED_DATA_BYTES,
    staged,
    includeBackups,
    pendingConfirmation,
    pendingGroups: groupPending(pendingConfirmation, resolvedRankup),
    olderThan,
    gitTrackingUnavailable: tracked === null,
    gitInfo,
    totalFilesBefore: allEntries.length,
    totalBytesBefore,
    cleanFilesCount: toClean.length,
    cleanBytes,
    totalFilesAfter: allEntries.length - toClean.length,
    totalBytesAfter: totalBytesBefore - cleanBytes,
    byCategory,
    byExtension,
    toClean,
    toKeep,
    retainedDataFiles,
  };
}

// 将 .rankup/**/*.md 中指向被清理文件（或已移除的过程数据文件）的相对链接替换为「（原始数据已清理 <YYYY-MM-DD>）」。
export async function rewriteCleanedLinksInMarkdown(rankupDir, cleanedRelSet, dateStr) {
  const allEntries = await walkRankupFiles(rankupDir);
  const mdEntries = allEntries.filter((e) => e.rel.endsWith(".md") && e.targetExists && !e.isSymbolicLink && !isSensitive(e.fullPath));
  const replacementText = `（原始数据已清理 ${dateStr}）`;
  const modifiedMdFiles = [];
  let replacedLinksCount = 0;

  for (const mdEntry of mdEntries) {
    let content;
    try {
      content = await readFile(mdEntry.fullPath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    let fence = null;
    let fileChanged = false;

    const updatedLines = lines.map((line) => {
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceMatch) {
        if (!fence) fence = fenceMatch[1][0];
        else if (fenceMatch[1][0] === fence) fence = null;
        return line;
      }
      if (fence) return line;

      // 保护行内代码 `...`，只替换行内代码之外的 Markdown 链接
      const codeSpans = [];
      const masked = line.replace(/`[^`]*`/g, (match) => {
        const idx = codeSpans.length;
        codeSpans.push(match);
        return `\x00CODE_${idx}\x00`;
      });

      const replaced = masked.replace(
        /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
        (fullMatch, _bang, _label, target) => {
          if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return fullMatch;
          const [rawPath] = target.split("#");
          if (!rawPath) return fullMatch;
          let decodedPath = rawPath;
          try {
            decodedPath = decodeURIComponent(rawPath);
          } catch {}
          const resolved = path.resolve(path.dirname(mdEntry.fullPath), decodedPath);
          const relToRankup = toPosix(path.relative(rankupDir, resolved));
          if (relToRankup.startsWith("..")) return fullMatch;

          if (cleanedRelSet.has(relToRankup)) {
            fileChanged = true;
            replacedLinksCount += 1;
            return replacementText;
          }

          // 若历史已清理过该过程数据文件但遗留了断链，同步收敛为已清理文本，确保 doc-lint 0 断链
          const targetExt = path.extname(relToRankup).toLowerCase();
          if (PROCESS_DATA_EXTENSIONS.has(targetExt) && !allEntries.some((e) => e.rel === relToRankup && e.targetExists)) {
            fileChanged = true;
            replacedLinksCount += 1;
            return replacementText;
          }

          return fullMatch;
        },
      );

      if (!fileChanged) return line;
      return replaced.replace(/\x00CODE_(\d+)\x00/g, (_, idx) => codeSpans[Number(idx)]);
    });

    if (fileChanged) {
      await writeFile(mdEntry.fullPath, updatedLines.join("\n"), "utf8");
      modifiedMdFiles.push(mdEntry.rel);
    }
  }

  return { modifiedMdFiles, replacedLinksCount };
}

async function pruneEmptyDirs(rankupDir, includeBackups = []) {
  async function walk(dir) {
    try { if ((await lstat(dir)).isSymbolicLink()) return; } catch { return; }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if ((isSensitive(path.join(dir, e.name)) && !isIncluded(path.join(dir, e.name), includeBackups)) || [".git", "node_modules", "state"].includes(e.name)) continue;
      if (e.isDirectory() && !e.isSymbolicLink()) {
        await walk(path.join(dir, e.name));
      }
    }
    if (dir === rankupDir) return;
    try {
      const remaining = await readdir(dir);
      if (remaining.length === 0) await rmdir(dir);
    } catch {}
  }
  await walk(rankupDir);
}

export async function applyClean(plan, { date = null } = {}) {
  const now = new Date();
  const dateStr = date || now.toISOString().slice(0, 10);
  const cleanedRelSet = new Set();
  let deletedCount = 0;
  const tracked = trackedFiles(plan.rankupDir);
  for (const item of plan.toClean) {
    if (tracked === null || tracked.has(item.rel)) continue;
    await rm(path.join(plan.rankupDir, item.rel), { force: true });
    cleanedRelSet.add(item.rel);
    deletedCount += 1;
  }
  const trash = await planTrash(plan.includeBackups, plan.olderThan);
  for (const item of trash.toClean) await rm(item.fullPath, { force: true });
  await pruneEmptyDirs(path.join(resolveRankupHome(), "trash"), plan.includeBackups);
  const trashRoot = path.join(resolveRankupHome(), "trash");
  try { if ((await readdir(trashRoot)).length === 0) await rmdir(trashRoot); } catch (e) { if (e.code !== "ENOENT") throw e; }

  const linkRewrite = await rewriteCleanedLinksInMarkdown(plan.rankupDir, cleanedRelSet, dateStr);
  await pruneEmptyDirs(plan.rankupDir, plan.includeBackups);

  const unstagedFiles = [];
  if (plan.staged && plan.gitInfo?.gitRoot) {
    const { gitRoot, rankupRelToGit, stagedRelSet } = plan.gitInfo;
    const toGitRel = (rel) => (rankupRelToGit ? `${rankupRelToGit}/${rel}` : rel);
    const gitPathsToUnstage = plan.toClean
      .filter((item) => stagedRelSet.has(item.rel))
      .map((item) => toGitRel(item.rel));

    if (gitPathsToUnstage.length > 0) {
      try {
        execFileSync(
          "git",
          ["-C", gitRoot, "rm", "--cached", "-f", "--ignore-unmatch", "-q", "--", ...gitPathsToUnstage],
          { stdio: ["ignore", "pipe", "ignore"] },
        );
        unstagedFiles.push(...gitPathsToUnstage);
      } catch {}
    }

    // 若已暂存的 Markdown 文件因重写断链而更新，重新 git add 以免提交进旧断链
    const stagedMdToRestage = linkRewrite.modifiedMdFiles
      .filter((rel) => stagedRelSet.has(rel))
      .map((rel) => toGitRel(rel));
    if (stagedMdToRestage.length > 0) {
      try {
        execFileSync("git", ["-C", gitRoot, "add", "--", ...stagedMdToRestage], {
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {}
    }
  }

  return {
    applied: true,
    date: dateStr,
    deletedCount,
    trashDeletedCount: trash.cleanFilesCount,
    trashDeletedBytes: trash.cleanBytes,
    pendingConfirmation: trash.pendingConfirmation,
    replacedLinksCount: linkRewrite.replacedLinksCount,
    modifiedMdFiles: linkRewrite.modifiedMdFiles,
    unstagedFiles,
  };
}

export function buildGitignoreBlock() {
  return [
    GITIGNORE_START,
    "# 过程数据（截图/图片、日志、trace/har、测试输出、压缩包、原始数据）：原始数据不常驻，结论进文档",
    "*.png",
    "*.jpg",
    "*.jpeg",
    "*.webp",
    "*.gif",
    "*.svg",
    "*.bmp",
    "*.ico",
    "*.avif",
    "*.tiff",
    "*.log",
    "*.out",
    "*.err",
    "*.har",
    "*.trace",
    "*trace*.json",
    "*trace*.zip",
    "*.cpuprofile",
    "*.heapsnapshot",
    "*.xml",
    "*.junit",
    "*.tap",
    "*.gz",
    "*.tgz",
    "*.tar",
    "*.zip",
    "*.bz2",
    "*.xz",
    "*.zst",
    "*.7z",
    "*.jsonl",
    "*.ndjson",
    "*.csv",
    "*.tsv",
    "*.psv",
    "*.patch",
    "*.diff",
    "reports/**/*.json",
    "reports/**/*.txt",
    "research/**/*.json",
    "research/**/*.txt",
    "evidence/**/*.json",
    "evidence/**/*.txt",
    "agentic/**/*.json",
    "agentic/**/*.txt",
    "!skill-state.json",
    "!review-state.json",
    "!projects.json",
    "!indexnow-last.json",
    "!backlink-targets.json",
    "!config.json",
    "!package.json",
    "!tsconfig.json",
    GITIGNORE_END,
  ].join("\n");
}

function upsertMarkedBlock(existingContent, startMarker, endMarker, newBlock) {
  const startIdx = existingContent.indexOf(startMarker);
  const endIdx = existingContent.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existingContent.slice(0, startIdx);
    const after = existingContent.slice(endIdx + endMarker.length);
    return `${before}${newBlock}${after}`;
  }
  const trimmedEnd = existingContent.replace(/\s*$/, "");
  if (!trimmedEnd) return `${newBlock}\n`;
  return `${trimmedEnd}\n\n${newBlock}\n`;
}

export async function writeRankupGitignore(rankupDir) {
  await mkdir(rankupDir, { recursive: true });
  const gitignorePath = path.join(rankupDir, ".gitignore");
  let existing = "";
  try {
    existing = await readFile(gitignorePath, "utf8");
  } catch {}
  const block = buildGitignoreBlock();
  const updated = upsertMarkedBlock(existing, GITIGNORE_START, GITIGNORE_END, block);
  if (updated !== existing) {
    await writeFile(gitignorePath, updated, "utf8");
  }
  return { gitignorePath, changed: updated !== existing };
}

export function resolvePreCommitHookPath(projectRoot) {
  const gitRoot = execFileSync("git", ["-C", projectRoot, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  let hooksDir = "";
  try {
    const configuredHooksPath = execFileSync("git", ["-C", gitRoot, "config", "--get", "core.hooksPath"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (configuredHooksPath) {
      hooksDir = path.isAbsolute(configuredHooksPath)
        ? configuredHooksPath
        : path.resolve(gitRoot, configuredHooksPath);
    }
  } catch {}

  if (!hooksDir) {
    const gitHooksPath = execFileSync("git", ["-C", gitRoot, "rev-parse", "--git-path", "hooks"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    hooksDir = path.isAbsolute(gitHooksPath)
      ? gitHooksPath
      : path.resolve(gitRoot, gitHooksPath);
  }

  return { gitRoot, hookPath: path.join(hooksDir, "pre-commit") };
}

export function buildPreCommitHookBlock({ gitRoot, projectRoot }) {
  const relProject = toPosix(path.relative(safeRealpath(gitRoot), safeRealpath(projectRoot)));
  const targetExpr = relProject && relProject !== "."
    ? `"$RANKUP_GIT_ROOT/${relProject}"`
    : `"$RANKUP_GIT_ROOT"`;
  return [
    HOOK_START,
    "if command -v node >/dev/null 2>&1; then",
    "  RANKUP_GIT_ROOT=\"$(git rev-parse --show-toplevel 2>/dev/null || pwd)\"",
    `  RANKUP_PROJECT_ROOT=${targetExpr}`,
    `  RANKUP_CLEAN_SCRIPT=${JSON.stringify(scriptPath)}`,
    "  if { [ -d \"$RANKUP_PROJECT_ROOT/.rankup\" ] || [ \"$(basename \"$RANKUP_PROJECT_ROOT\")\" = \".rankup\" ]; } && [ -f \"$RANKUP_CLEAN_SCRIPT\" ]; then",
    "    node \"$RANKUP_CLEAN_SCRIPT\" --project-root \"$RANKUP_PROJECT_ROOT\" --staged --apply >/dev/null",
    "  fi",
    "fi",
    HOOK_END,
  ].join("\n");
}

export async function installPreCommitHook(projectRoot) {
  const { gitRoot, hookPath } = resolvePreCommitHookPath(projectRoot);
  await mkdir(path.dirname(hookPath), { recursive: true });
  let existing = "";
  try {
    existing = await readFile(hookPath, "utf8");
  } catch {}

  const block = buildPreCommitHookBlock({ gitRoot, projectRoot });
  let updated;
  if (!existing.trim()) {
    updated = `#!/usr/bin/env sh\n\n${block}\n`;
  } else if (existing.includes(HOOK_START) && existing.includes(HOOK_END)) {
    updated = upsertMarkedBlock(existing, HOOK_START, HOOK_END, block);
  } else if (/(?:^|\n)\s*exit\s+0\s*$/.test(existing.trimEnd())) {
    updated = existing.trimEnd().replace(/(\n\s*exit\s+0\s*)$/, `\n\n${block}$1\n`);
  } else {
    updated = upsertMarkedBlock(existing, HOOK_START, HOOK_END, block);
  }

  if (updated !== existing) {
    await writeFile(hookPath, updated, "utf8");
  }
  await chmod(hookPath, 0o755);
  return { gitRoot, hookPath, changed: updated !== existing };
}

function renderReport(plan, applyResult, hookResult, gitignoreResult) {
  const lines = [];
  lines.push(`# rankup-clean（${plan.projectName}）`);
  lines.push(`目录：${plan.rankupDir}`);
  lines.push(`模式：${applyResult ? "apply（已直接删除并重写断链）" : "dry-run（仅列计划，加 --apply 执行）"}${plan.staged ? " [staged]" : ""}`);
  lines.push(`结构化数据保留体积阈值：${formatBytes(plan.thresholdBytes)}`);
  lines.push(
    `总览：清理前 ${plan.totalFilesBefore} 个文件（${formatBytes(plan.totalBytesBefore)}） → `
    + `待清 ${plan.cleanFilesCount} 个文件（${formatBytes(plan.cleanBytes)}） → `
    + `清理后 ${plan.totalFilesAfter} 个文件（${formatBytes(plan.totalBytesAfter)}）`,
  );

  if (Object.keys(plan.byCategory).length > 0) {
    lines.push("\n## 按过程数据类别统计");
    for (const [cat, info] of Object.entries(plan.byCategory)) {
      lines.push(`- ${cat}：${info.count} 个文件，${formatBytes(info.bytes)}`);
    }
  }

  if (plan.trash) {
    lines.push(`历史 trash：${plan.trash.cleanFilesCount} 个文件（${formatBytes(plan.trash.cleanBytes)}），apply 时直接删除`);
    for (const e of plan.trash.skipped) lines.push(`- 跳过：${e.fullPath}（backup 或符号链接根目录）`);
  }
  if (plan.retainedDataFiles.length > 0) {
    lines.push("\n## 保留的最大数据文件（Top 10）");
    for (const item of plan.retainedDataFiles.slice(0, 10)) {
      lines.push(`- ${item.rel}（${formatBytes(item.size)}）：${item.reason}`);
    }
  }

  for (const item of groupPending([...plan.pendingConfirmation, ...(plan.trash?.pendingConfirmation ?? [])], [plan.rankupDir, path.join(resolveRankupHome(), "trash")])) {
    lines.push(`- 待确认组：${item.prefix}；${item.fileCount} 文件；${formatBytes(item.bytes)}；最新修改 ${item.newestModifiedAt}；文档引用 ${item.referenced ? "有" : "扫描范围内未发现"}；保护项 ${item.protectedCount}。逐项核查后才可确认，明细用 --json 查看。`);
  }
  if (applyResult) {
    lines.push("\n## 执行结果");
    lines.push(`- 直接删除：${applyResult.deletedCount} 个文件；历史 trash：${applyResult.trashDeletedCount} 个文件`);
    lines.push(`- 替换 Markdown 相对链接：${applyResult.replacedLinksCount} 处（涉及 ${applyResult.modifiedMdFiles.length} 个 .md 文件）`);
    if (plan.staged) lines.push(`- 移出 Git 暂存区：${applyResult.unstagedFiles.length} 个文件`);
  }

  if (hookResult) {
    lines.push(`- pre-commit hook：${hookResult.hookPath}（${hookResult.changed ? "已写入/更新" : "已是最新"}）`);
  }
  if (gitignoreResult) {
    lines.push(`- .rankup/.gitignore：${gitignoreResult.gitignorePath}（${gitignoreResult.changed ? "已写入/更新" : "已是最新"}）`);
  }

  return lines.join("\n");
}

function trackedFiles(rankupDir) {
  try {
    return new Set(execFileSync("git", ["-C", rankupDir, "ls-files", "-z", "--cached", "--", "."], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter(Boolean));
  } catch (e) {
    let current = path.resolve(rankupDir);
    while (true) {
      if (existsSync(path.join(current, ".git"))) return null;
      if (current === path.dirname(current)) break;
      current = path.dirname(current);
    }
    if (e.status === 128) return new Set();
    return null;
  }
}

export function groupPending(items, root) {
  const roots = Array.isArray(root) ? root : [root];
  const groups = new Map();
  const within = (p, parent) => p === parent || p.startsWith(parent + path.sep);
  for (const item of [...items].sort((a, b) => a.path.length - b.path.length)) {
    const boundary = roots.filter(r => within(item.path, r)).sort((a, b) => b.length - a.length)[0] ?? path.dirname(item.path);
    const prefix = item.path === boundary || path.dirname(item.path) === boundary ? item.path : path.dirname(item.path);
    const ancestor = [...groups.keys()].find(p => within(prefix, p));
    if (ancestor) groups.get(ancestor).items.push(item);
    else {
      const children = [...groups.keys()].filter(p => within(p, prefix));
      const merged = children.flatMap(p => groups.get(p).items);
      for (const p of children) groups.delete(p);
      groups.set(prefix, { boundary, items: [...merged, item] });
    }
  }
  while (groups.size > 50) {
    const candidates = new Set();
    for (const [prefix, g] of groups) {
      for (let p = path.dirname(prefix); within(p, g.boundary); p = path.dirname(p)) {
        candidates.add(p);
        if (p === g.boundary) break;
      }
    }
    const parent = [...candidates].sort((a, b) => b.length - a.length || a.localeCompare(b)).find(p => [...groups.keys()].filter(k => within(k, p)).length > 1);
    if (!parent) break;
    const keys = [...groups.keys()].filter(p => within(p, parent));
    const merged = keys.flatMap(p => groups.get(p).items);
    const boundary = groups.get(keys[0]).boundary;
    for (const p of keys) groups.delete(p);
    groups.set(parent, { boundary, items: merged });
  }
  return [...groups].map(([prefix, g]) => ({ prefix,
    fileCount: g.items.filter(i => !i.isDirectory).length,
    bytes: g.items.reduce((n, i) => n + i.bytes, 0),
    newestModifiedAt: g.items.map(i => i.modifiedAt).sort().at(-1),
    referenced: g.items.some(i => i.referencedBy.length),
    protectedCount: g.items.filter(i => i.hardProtected).length,
  })).sort((a, b) => a.prefix.localeCompare(b.prefix));
}

export function isSensitive(p) {
  return /backup|evidence|snapshot|dump|\.(?:bak|orig|sql|rdb|sqlite3?|db)(?:\.|$)|~$/i.test(p);
}

function isIncluded(p, approved) {
  return approved.some(a => path.resolve(p) === path.resolve(a) || path.resolve(p).startsWith(path.resolve(a) + path.sep));
}

async function readDocs(entries) {
  return Promise.all(entries.filter(e => e.rel.endsWith(".md") && !e.isSymbolicLink && !e.isDirectory).map(async e => [e, await readFile(e.fullPath, "utf8")]));
}

async function pendingInfo(entry, docs, projectRoot, hardProtected = false) {
  const referencedBy = [];
  for (const [doc, text] of docs) {
    if (doc.fullPath === entry.fullPath) continue;
    let found = text.includes(entry.fullPath) || text.includes(entry.rel);
    for (const m of text.matchAll(/\]\(([^)\s]+)/g)) {
      let target = m[1].split("#")[0];
      try { target = decodeURIComponent(target); } catch {}
      if (path.resolve(path.dirname(doc.fullPath), target) === entry.fullPath) found = true;
    }
    if (found) referencedBy.push(doc.fullPath);
  }
  return { path: entry.fullPath, bytes: entry.size, modifiedAt: new Date(entry.mtimeMs).toISOString(), taskOrProject: projectRoot,
    isDirectory: Boolean(entry.isDirectory), referencedBy, referenceScope: "本清理目录内 Markdown；未发现引用不代表无用", hardProtected: Boolean(hardProtected),
    usefulness: hardProtected ? "常驻/白名单/状态文件，显式纳入仍保留" : "无法自动判断无用，需主线程核实并取得用户同意" };
}

export async function planTrash(includeBackups = [], olderThan = "7d") {
  const trashDir = path.join(resolveRankupHome(), "trash");
  const entries = await walkRankupFiles(trashDir);
  const cutoff = Date.now() - parseAge(olderThan);
  const tracked = trackedFiles(trashDir);
  const pendingConfirmation = [];
  let docs;
  const toClean = [];
  const skipped = [];
  for (const e of entries) {
    if (e.protectedRoot || e.isDirectory) skipped.push(e);
    if (tracked === null || tracked.has(e.rel)) {
      pendingConfirmation.push({ ...await pendingInfo(e, docs ??= await readDocs(entries), trashDir, true), usefulness: tracked === null ? "Git 状态无法核实，禁止删除" : "Git 已跟踪，显式纳入仍保留" });
    } else if (isSensitive(e.fullPath) && !isIncluded(e.fullPath, includeBackups)) {
      pendingConfirmation.push(await pendingInfo(e, docs ??= await readDocs(entries), path.join(trashDir, e.rel.split("/")[0])));
    } else if (!e.protectedRoot && !e.isDirectory && e.mtimeMs < cutoff) toClean.push(e);
    else if (e.mtimeMs >= cutoff) skipped.push({ ...e, reason: "未超过时限" });
  }
  return { toClean, cleanFilesCount: toClean.length, cleanBytes: toClean.reduce((n, e) => n + e.size, 0), skipped, pendingConfirmation, pendingGroups: groupPending(pendingConfirmation, trashDir) };
}

const isMain = process.argv[1] && (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1].endsWith("rankup-clean.mjs")
);

if (isMain) {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  if (opts.help) {
    console.log(
      "用法：node scripts/maintain/rankup-clean.mjs --project-root <含 .rankup 的目录> [--older-than <N>d|<N>w] [--workspace <目录>] [--include-backups <路径…>] [--dry-run] [--apply] [--staged] [--install-hook] [--write-gitignore] [--json]",
    );
    process.exit(0);
  }

  if (opts.workspace) {
    if (opts.staged || opts.installHook || opts.writeGitignore) throw new Error("--workspace 不支持 hook/staged 操作");
    const results = [];
    const trash = await planTrash(opts.includeBackups, opts.olderThan);
    for (const projectRoot of await workspaceProjects(opts.workspace)) {
      const plan = await planClean({ projectRoot, olderThan: opts.olderThan, includeBackups: opts.includeBackups });
      const applied = opts.apply ? await applyClean(plan, { date: opts.date }) : null;
      results.push({ projectRoot, cleanFilesCount: plan.cleanFilesCount, cleanBytes: plan.cleanBytes, skipped: plan.toKeep, pendingConfirmation: plan.pendingConfirmation, gitTrackingUnavailable: plan.gitTrackingUnavailable, applyResult: applied });
    }
    if (opts.apply && results.length === 0) {
      for (const item of trash.toClean) await rm(item.fullPath, { force: true });
      const trashRoot = path.join(resolveRankupHome(), "trash");
      await pruneEmptyDirs(trashRoot, opts.includeBackups);
      if ((await readdir(trashRoot).catch(() => ["missing"])).length === 0) await rmdir(trashRoot);
    }
    const pendingGroups = groupPending([...results.flatMap(r => r.pendingConfirmation), ...trash.pendingConfirmation], [opts.workspace, path.join(resolveRankupHome(), "trash")]);
    if (opts.json) await new Promise(resolve => process.stdout.write(JSON.stringify({ projects: results, trash, pendingGroups }, null, 2) + "\n", resolve));
    else {
      const lines = results.map(r => `${r.projectRoot}：待清 ${r.cleanFilesCount} 文件，${formatBytes(r.cleanBytes)}`);
      lines.push(`trash：待清 ${trash.cleanFilesCount} 文件，${formatBytes(trash.cleanBytes)}`);
      for (const g of pendingGroups) lines.push(`待确认组：${g.prefix}；${g.fileCount} 文件；${formatBytes(g.bytes)}；最新 ${g.newestModifiedAt}；文档引用 ${g.referenced ? "有" : "未发现"}；保护项 ${g.protectedCount}`);
      await new Promise(resolve => process.stdout.write(lines.join("\n") + "\n", resolve));
    }
    process.exit(0);
  }

  let hookResult = null;
  let gitignoreResult = null;
  if (opts.installHook) {
    hookResult = await installPreCommitHook(opts.rankupDir);
  }
  if (opts.writeGitignore) {
    gitignoreResult = await writeRankupGitignore(opts.rankupDir);
  }

  let plan = null;
  let applyResult = null;
  let rankupExists = false;
  try {
    const st = await stat(opts.rankupDir);
    rankupExists = st.isDirectory();
  } catch {}

  if (rankupExists) {
    plan = await planClean({
      projectRoot: opts.projectRoot,
      rankupDir: opts.rankupDir,
      staged: opts.staged,
      olderThan: opts.olderThan,
      includeBackups: opts.includeBackups,
    });
    plan.trash = await planTrash(opts.includeBackups, opts.olderThan);
    if (opts.apply) {
      applyResult = await applyClean(plan, { date: opts.date });
    }
  } else if (!opts.installHook && !opts.writeGitignore) {
    console.error(`未找到 .rankup 目录：${opts.rankupDir}`);
    process.exit(1);
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ...(plan
            ? {
                projectRoot: plan.projectRoot,
                rankupDir: plan.rankupDir,
                projectName: plan.projectName,
                thresholdBytes: plan.thresholdBytes,
                staged: plan.staged,
                totalFilesBefore: plan.totalFilesBefore,
                totalBytesBefore: plan.totalBytesBefore,
                cleanFilesCount: plan.cleanFilesCount,
                cleanBytes: plan.cleanBytes,
                totalFilesAfter: plan.totalFilesAfter,
                totalBytesAfter: plan.totalBytesAfter,
                byCategory: plan.byCategory,
                byExtension: plan.byExtension,
                retainedDataTop10: plan.retainedDataFiles.slice(0, 10),
                toClean: plan.toClean,
                skipped: plan.toKeep,
                pendingConfirmation: plan.pendingConfirmation,
                pendingGroups: plan.pendingGroups,
                gitTrackingUnavailable: plan.gitTrackingUnavailable,
                trash: plan.trash,
              }
            : {}),
          applyResult,
          hookResult,
          gitignoreResult,
        },
        null,
        2,
      ),
    );
  } else if (plan) {
    console.log(renderReport(plan, applyResult, hookResult, gitignoreResult));
  } else {
    const out = [];
    if (hookResult) out.push(`pre-commit hook：${hookResult.hookPath}（${hookResult.changed ? "已写入/更新" : "已是最新"}）`);
    if (gitignoreResult) out.push(`.rankup/.gitignore：${gitignoreResult.gitignorePath}（${gitignoreResult.changed ? "已写入/更新" : "已是最新"}）`);
    console.log(out.join("\n"));
  }
}
