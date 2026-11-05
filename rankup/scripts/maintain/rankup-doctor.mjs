#!/usr/bin/env node
// rankup-doctor.mjs —— `/rankup doctor` 的只读诊断：把一个项目 .rankup/ 的整理线索列成清单。
//
//   node scripts/maintain/rankup-doctor.mjs --project-root <项目目录> [--portfolio-root <工作区根>] [--stale-days 30] [--json]
//   node scripts/maintain/rankup-doctor.mjs --rankup-dir <某个 .rankup 目录>   # 直接指定目录（例如一份副本）
//
// 用途：references/maintenance.md「六、/rankup doctor」第 1、2 步与「三、可检查判据」的机械部分。
// 只读，不改任何文件；判断和动手归执行者：每条发现带建议分类
//   A 安全直接改 / B 下沉并保留证据 / C 需要用户决定（只列不动）。
// 检查项：
//   1. 目录外文件：顶层不在 project-memory.md「目录规范」里的文件或目录；带日期的一次性文件；
//   2. 备份与临时副本：*.bak* / *backup* / *.orig / *~；
//   3. INDEX.md：存在、四个导航字段、「接力」一节存在且 ≤ 20 行、全文 ≤ 60 行、接力里的完成标记（任务型残留）；
//   4. 体积与过程数据：常驻 Markdown 按 LIMITS 的逐文件上限检查（默认 > 300 行或 > 24 KB）；journal/ 单篇 > 200 行或 > 16 KB；复用 rankup-clean 检查过程数据残留（A 类），证据与脚本产物目录里超过 --stale-days 的旧运行（B 类），备份副本仍归 C 类；
//   5. 断链：复用 doc-lint 检查 .rankup/ 内相对链接与锚点；
//   6. 过期日期：时效契约文件里出现的最新日期早于 --stale-days；
//   7. rejected.md：理由或复活条件为空的行、旧口径 revived 行；
//   8. 根层登记（给 --portfolio-root 时）：portfolio.md 表格行数、projects.json 条目数、本项目是否两边都在；
//   9. 经验分拣候选：experience.md 条目、topics/ 标题、INDEX / plan / decisions / 最近 journal 里的坑与推翻记录；
//  10. 用户全局层（$RANKUP_HOME，默认 ~/.rankup/）现状，以及当前 Skill 是源码检出还是安装副本（决定 ④ 怎么回流）。
// 阈值是【经验·起步阈值】，与 references/maintenance.md「三」一致；改阈值两处一起改。
// 退出码：0 诊断完成（有无发现都算）；2 参数错误或找不到 .rankup/。
// 已验证：2026-09-30 在本 Skill 自身 .rankup 与一个项目 .rankup 副本上运行。

import { readdir, readFile, stat, lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { lint, stripFences } from "./doc-lint.mjs";
import { formatBytes, planClean } from "./rankup-clean.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const RESIDENT = new Set([
  "INDEX.md", "PROJECT.md", "architecture.md", "infrastructure.md", "integrations.md", "secrets.md",
  "skill-state.json", "baseline.md", "keywords.md", "decisions.md", "rejected.md", "competitors.md",
  "audit.md", "plan.md", "roadmap.md", "iterations.md", "experiments.md", "releases.md", "experience.md",
  "checks.md", "review-state.json", "indexnow-last.json", "backlink-targets.json",
]);
// 脚本产物目录（由 rankup / backlink 脚本写入）也算规范内，只按「证据」规则清旧运行。
const RESIDENT_DIRS = new Set([
  "research", "scripts", "journal", "topics", "evidence", "agentic", "tasks",
  "demand", "selection", "leading-indicator", "provider-audit", "state", "data", "backlink", "archive",
]);
const TIMELY = ["INDEX.md", "plan.md", "keywords.md", "baseline.md", "integrations.md", "infrastructure.md"];
// 上限与 references/project-memory.md「目录规范」一致（2026-09-30 以一个用了一个多月的项目为参照定的起步值）。
const LIMITS = {
  indexLines: 60, indexKb: 6, relayLines: 20, relayKb: 2, lineChars: 400,
  journalLines: 200, journalKb: 16, userLines: 200, userKb: 16,
  perFile: {
    "PROJECT.md": [120, 12], "plan.md": [100, 10], "roadmap.md": [150, 16], "decisions.md": [150, 16],
    "rejected.md": [200, 20], "keywords.md": [300, 32], "checks.md": [300, 32],
  },
  resident: [300, 24],
};

function parseArgs(argv) {
  const o = { staleDays: 30, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-root") o.projectRoot = path.resolve(argv[++i] ?? "");
    else if (a === "--rankup-dir") o.rankupDir = path.resolve(argv[++i] ?? "");
    else if (a === "--portfolio-root") o.portfolioRoot = path.resolve(argv[++i] ?? "");
    else if (a === "--stale-days") o.staleDays = Number(argv[++i]);
    else if (a === "--json") o.json = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (!o.help && !o.projectRoot && !o.rankupDir) o.projectRoot = process.cwd();
  if (!o.rankupDir && o.projectRoot) o.rankupDir = path.basename(o.projectRoot) === ".rankup" ? o.projectRoot : path.join(o.projectRoot, ".rankup");
  return o;
}

const readText = (p) => readFile(p, "utf8").catch(() => null);

function section(text, heading) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^##\s/.test(l) && l.includes(heading));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^##?\s/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end);
}

const isBackup = (name) => /\.(bak|orig)\b|backup|~$/i.test(name);
const inBackup = (name) => name.split(path.sep).some(isBackup);

async function walkMd(dir, backups = []) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (isBackup(e.name)) { backups.push(p); continue; }
    if (e.isDirectory()) out.push(...(await walkMd(p, backups)));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

export async function diagnose({ rankupDir, portfolioRoot, staleDays = 30, now = new Date() }) {
  const findings = [];
  const add = (bucket, check, where, detail) => findings.push({ bucket, check, where, detail });
  let top;
  try {
    rankupDir = await realpath(rankupDir);
    top = await readdir(rankupDir, { withFileTypes: true });
  } catch {
    throw new Error(`找不到 .rankup 目录：${rankupDir}`);
  }

  if (portfolioRoot) portfolioRoot = await realpath(portfolioRoot).catch(() => portfolioRoot);
  const index = await readText(path.join(rankupDir, "INDEX.md"));
  const rootLayer = (portfolioRoot && path.resolve(rankupDir) === path.resolve(portfolioRoot, ".rankup")) || top.some((e) => ["portfolio.md", "projects.json"].includes(e.name));
  const rootFiles = new Set(["README.md", "portfolio.md", "projects.json", "log.md"]);
  const registered = new Set((section(index ?? "", "文件状态") ?? []).filter((l) => /^\|/.test(l)).map((l) => l.split("|")[1]?.trim().replace(/`/g, "").replace(/\/$/, "")));

  const backups = [];
  const mdFiles = await walkMd(rankupDir, backups);
  for (const file of backups) add("C", "备份副本", path.relative(rankupDir, file), "只列不动；由用户决定是否移至 $RANKUP_HOME/trash/ 等可恢复位置");

  // 1 & 2 目录外文件、备份
  for (const e of top) {
    const name = e.name;
    if (name.startsWith(".")) continue;
    if (isBackup(name)) continue;
    if ((e.isDirectory() ? RESIDENT_DIRS.has(name) : RESIDENT.has(name)) || (rootLayer && rootFiles.has(name)) || registered.has(name)) continue;
    if (/\d{4}-\d{2}-\d{2}|\d{8}/.test(name)) add("B", "带日期的一次性文件", name, "归入 research/ 或 journal/，同步引用（ref-scan）");
    else add("C", "目录外文件", name + (e.isDirectory() ? "/" : ""), "不在目录规范里：并入规范文件、下沉，或请用户决定是否保留");
  }

  // 3 INDEX
  if (!index) add("A", "INDEX 缺失", "INDEX.md", "按 project-memory.md 初始化模板补建");
  else {
    const lines = index.split("\n");
    const indexKb = Buffer.byteLength(index) / 1024;
    if (lines.length > LIMITS.indexLines || indexKb > LIMITS.indexKb) add("A", "INDEX 超长", "INDEX.md", `${lines.length} 行 / ${indexKb.toFixed(1)} KB > ${LIMITS.indexLines} 行 / ${LIMITS.indexKb} KB：事实移回专题文件，最近变化只留 5 条`);
    const longLines = lines.filter((l) => [...l].length > LIMITS.lineChars);
    if (longLines.length) add("A", "单行塞太多", "INDEX.md", `${longLines.length} 行超过 ${LIMITS.lineChars} 字：一行一件事，坑与经验按四层归属分拣出去`);
    for (const field of ["当前阶段", "上一个完成的关卡", "下一步动作", "当前阻塞"]) {
      if (!lines.some((line) => new RegExp(`^\\s*-\\s*(?:\\*\\*)?${field}(?:\\*\\*)?[：:]`).test(line))) add("A", "INDEX 缺导航字段", "INDEX.md", `缺「${field}」`);
    }
    const relay = section(index, "接力");
    if (!relay) add("A", "缺接力节", "INDEX.md", "按接力协议补「## 接力」");
    else {
      const body = relay.filter((l) => l.trim());
      const relayKb = Buffer.byteLength(body.join("\n")) / 1024;
      if (body.length > LIMITS.relayLines || relayKb > LIMITS.relayKb) add("A", "接力超长", "INDEX.md#接力", `${body.length} 行 / ${relayKb.toFixed(1)} KB > ${LIMITS.relayLines} 行 / ${LIMITS.relayKb} KB：压到当前状态`);
      const done = body.filter((l) => /✅|已完成|完成：|done\b|已收回|已合入/i.test(l));
      if (done.length > 3) add("A", "任务型残留", "INDEX.md#接力", `${done.length} 行带完成标记：只留一行结论加报告路径`);
      if (!body.some((line) => /^\s*-\s*(?:\*\*)?下一条要执行的动作(?:\*\*)?[：:]/.test(line))) add("A", "接力缺下一步", "INDEX.md#接力", "缺「下一条要执行的动作」");
    }
  }

  // 4 体积
  for (const file of mdFiles) {
    const rel = path.relative(rankupDir, file);
    const text = (await readText(file)) ?? "";
    const n = text.split("\n").length;
    const kb = Buffer.byteLength(text) / 1024;
    if (rel.startsWith("journal" + path.sep)) {
      if (n > LIMITS.journalLines || kb > LIMITS.journalKb) add("A", "journal 超长", rel, `${n} 行 / ${Math.round(kb)} KB > ${LIMITS.journalLines} 行 / ${LIMITS.journalKb} KB：压缩流水，保留判断原文与依据`);
    } else if (rel.includes(path.sep) && !rel.startsWith("topics" + path.sep)) {
      continue;
    } else {
      const [maxLines, maxKb] = LIMITS.perFile[rel] ?? LIMITS.resident;
      if (n > maxLines || kb > maxKb) {
        const how = rel === "decisions.md" ? "superseded 与已执行完的决策压成一行（编号 + 被谁取代 + 日期），全文移到决定当天的 journal/" : rel === "rejected.md" ? "先归档已复活或已过期条目，保留否决理由、复活条件与证据，不硬删；仍超标标注待用户决定" : "过程下沉到 journal/ 或 research/，已完成项压成一行";
        add("B", "常驻文件超标", rel, `${n} 行 / ${Math.round(kb)} KB > ${maxLines} 行 / ${maxKb} KB：${how}`);
      }
    }
  }

  // 4b 旧运行证据：evidence/ 与脚本产物目录下超过 --stale-days 未改动的子目录
  for (const dir of ["evidence", "agentic", "demand", "selection", "leading-indicator", "provider-audit", "backlink"]) {
    const base = path.join(rankupDir, dir);
    let entries;
    try {
      entries = await readdir(base, { withFileTypes: true });
    } catch {
      continue;
    }
    let old = 0;
    for (const e of entries) {
      if (isBackup(e.name)) continue;
      const st = await stat(path.join(base, e.name)).catch(() => null);
      const stamp = e.name.match(/(?:20\d{2})-\d{2}-\d{2}/)?.[0];
      const dated = stamp ? new Date(`${stamp}T00:00:00Z`) : null;
      const observed = dated && !Number.isNaN(dated.getTime()) ? dated : st?.mtime;
      if (observed && (now - observed) / 86400000 > staleDays) old++;
    }
    if (old) add("B", "旧运行证据", `${dir}/`, `${old} 项运行日期超过 ${staleDays} 天（优先目录日期，无日期用 mtime）：先 ref-scan 确认无人引用，再移到可恢复位置`);
  }

  // 4c 过程数据残留（复用 rankup-clean.mjs 计划；备份副本仍在上方按 C 类单独列出）
  const cleanPlan = await planClean({ projectRoot: path.dirname(rankupDir), rankupDir });
  if (cleanPlan.cleanFilesCount > 0) {
    const breakdown = Object.entries(cleanPlan.byCategory)
      .map(([cat, info]) => `${cat} ${info.count} 项/${formatBytes(info.bytes)}`)
      .join("，");
    add(
      "A",
      "过程数据残留",
      ".rankup/",
      `可清理过程数据 ${cleanPlan.cleanFilesCount} 个文件（${formatBytes(cleanPlan.cleanBytes)}：${breakdown}）：运行 node scripts/maintain/rankup-clean.mjs --project-root <项目目录> --apply 移入 $RANKUP_HOME/trash/ 并重写 md 断链`,
    );
  }

  // 5 断链
  const lr = await lint({ root: rankupDir, maxLines: 1e9, maxKb: 1e9 });
  for (const b of lr.broken.filter((b) => !inBackup(b.where))) add("A", "断链", b.where, `${b.target}（${b.reason}）`);

  // 5b 反引号路径：仅扫记录中的具体相对路径，忽略命令、模板与代码块；缺证据只列 C 类。
  let codePathsChecked = 0;
  for (const file of mdFiles) {
    // 脚本采集的网页原文里的示例路径不属于项目指针，宁可少报。
    if (/^(?:demand|selection|leading-indicator|provider-audit|backlink|agentic|data|state)\//.test(path.relative(rankupDir, file))) continue;
    const lines = stripFences((await readText(file)) ?? "");
    for (const [i, line] of lines.entries()) {
      for (const m of line.matchAll(/`([^`]+)`/g)) {
        const target = m[1];
        if (!target.includes("/") || /[\s*?<>$|{}\[\]~]/.test(target) || /^(?:[a-z]+:|\/)/i.test(target) || target.includes("…")) continue;
        const relative = target.replace(/#.*$|:\d+(?::\d+)?$/, "");
        if (!/^(?:\.\.?\/|\.rankup\/|[\w.-]+\/)/.test(relative)) continue;
        // 没有项目代码的记录副本无法判断外部源码路径；只报已知目录下的具体文件。
        if (!relative.startsWith(".rankup/")) {
          const head = relative.split("/")[0];
          if (!head || !((await stat(path.resolve(rankupDir, head)).catch(() => null))?.isDirectory()
            || (await stat(path.resolve(path.dirname(file), head)).catch(() => null))?.isDirectory()
            || (await stat(path.resolve(path.dirname(rankupDir), head)).catch(() => null))?.isDirectory()
            || (await stat(path.resolve(skillRoot, head)).catch(() => null))?.isDirectory())) continue;
        }
        // .rankup/ 映射当前记录目录（兼容改名副本），其余兼容文件相对、项目根相对与 Skill 指针。
        const candidates = relative.startsWith(".rankup/")
          ? [path.resolve(rankupDir, relative.slice(".rankup/".length))]
          : [path.resolve(path.dirname(file), relative), path.resolve(rankupDir, relative), path.resolve(path.dirname(rankupDir), relative), path.resolve(skillRoot, relative)];
        codePathsChecked++;
        if ((await Promise.all(candidates.map((p) => stat(p).catch(() => null)))).some(Boolean)) continue;
        add("C", "反引号路径缺失", `${path.relative(rankupDir, file)}:${i + 1}`, `${target}：本副本未找到；核对证据或指针，保留旧引用并在 INDEX 标明缺失，不直接删除`);
      }
    }
  }

  // 6 过期日期
  for (const name of TIMELY) {
    const text = await readText(path.join(rankupDir, name));
    if (!text) continue;
    const dates = [...text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)].map((m) => new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)).filter((d) => !Number.isNaN(d.getTime()) && d <= now);
    if (!dates.length) continue;
    const newest = new Date(Math.max(...dates));
    const age = Math.floor((now - newest) / 86400000);
    if (age > staleDays) add("A", "可能过期", name, `最新日期 ${newest.toISOString().slice(0, 10)}，距今 ${age} 天：重新核实或标「待核实」`);
  }

  // 7 rejected
  const rejected = await readText(path.join(rankupDir, "rejected.md"));
  if (rejected) {
    const rows = rejected.split("\n").filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l));
    const header = rows.shift()?.split("|").map((c) => c.trim()) ?? [];
    const reasonIdx = header.findIndex((c) => /理由/.test(c));
    const reviveIdx = header.findIndex((c) => /复活/.test(c));
    rows.forEach((row) => {
      const cells = row.split("|").map((c) => c.trim());
      if (/\brevived\b/i.test(row)) add("A", "rejected 旧口径", "rejected.md", `${cells[1] ?? ""}：按新口径移出表格、写 decisions、末尾留指针`);
      if ((reasonIdx > 0 && !cells[reasonIdx]) || (reviveIdx > 0 && !cells[reviveIdx])) add("C", "rejected 缺理由或复活条件", "rejected.md", `${cells[1] ?? ""}：请补理由与可判定的复活条件`);
    });
  }

  // 8 根层登记
  let portfolio = null;
  if (portfolioRoot) {
    const rootRankup = path.join(portfolioRoot, ".rankup");
    const md = await readText(path.join(rootRankup, "portfolio.md"));
    const jsonText = await readText(path.join(rootRankup, "projects.json"));
    const projectName = path.basename(path.dirname(rankupDir));
    portfolio = { portfolioRows: null, projectsCount: null, inPortfolio: null, inProjects: null };
    if (md) {
      const rows = md.split("\n").filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l));
      portfolio.portfolioRows = Math.max(0, rows.length - 1);
      portfolio.inPortfolio = rootLayer ? null : md.includes(projectName);
    }
    if (jsonText) {
      try {
        const data = JSON.parse(jsonText);
        const list = Array.isArray(data) ? data : data.projects;
        portfolio.projectsCount = Array.isArray(list) ? list.length : list && typeof list === "object" ? Object.keys(list).length : null;
        portfolio.inProjects = rootLayer ? null : jsonText.includes(projectName);
      } catch (e) {
        add("C", "projects.json 无法解析", "projects.json", e.message);
      }
    }
    if (portfolio.inPortfolio === false || portfolio.inProjects === false) add("C", "根层登记缺本项目", "portfolio.md / projects.json", `未找到「${projectName}」：请确认登记名`);
    for (const e of await readdir(rootRankup).catch(() => [])) {
      if (path.resolve(rootRankup) !== path.resolve(rankupDir) && isBackup(e)) add("C", "根层备份副本", e, "根层属于所有项目：列给用户决定是否移出");
    }
  }

  // 9 经验分拣候选：doctor 第 2 步的起点（判归属归执行者，见 maintenance.md「七」）
  const experiences = [];
  const pushExp = (source, text) => experiences.push({ source, text: text.trim().slice(0, 200) });
  const expText = await readText(path.join(rankupDir, "experience.md"));
  for (const m of (expText ?? "").matchAll(/^- \*\*\[[^\]]+\][^\n]*/gm)) pushExp("experience.md", m[0]);
  for (const file of await walkMd(path.join(rankupDir, "topics"))) {
    for (const m of ((await readText(file)) ?? "").matchAll(/^#{2,3} .*/gm)) pushExp(path.relative(rankupDir, file), m[0]);
  }
  const keyword = /坑|踩|教训|推翻|作废|失败|断开|不给|parse error|假阳性|假阴性|误判/;
  for (const file of mdFiles) {
    const name = path.relative(rankupDir, file);
    if (name.includes(path.sep) && !/^(?:tasks|research)\//.test(name)) continue;
    const t = await readText(file);
    for (const line of (t ?? "").split("\n")) if (keyword.test(line) && line.trim().length > 8) pushExp(name, line);
  }
  for (const file of (await walkMd(path.join(rankupDir, "journal"))).sort().slice(-10)) {
    if (/archive/i.test(path.basename(file))) continue;
    for (const line of ((await readText(file)) ?? "").split("\n")) if (keyword.test(line) && line.trim().length > 8) pushExp(path.relative(rankupDir, file), line);
  }

  // 10 用户全局层（③）与 Skill 回流方式（④）
  const userHome = process.env.RANKUP_HOME ? path.resolve(process.env.RANKUP_HOME) : path.join(homedir(), ".rankup");
  const userLayer = { dir: userHome, exists: false, files: [] };
  for (const name of ["preferences.md", "lessons.md", "upstream-candidates.md", "config.json"]) {
    const t = await readText(path.join(userHome, name));
    if (t === null) continue;
    userLayer.exists = true;
    const n = t.split("\n").length;
    const kb = Buffer.byteLength(t) / 1024;
    userLayer.files.push({ name, lines: n });
    if (name.endsWith(".md") && (n > LIMITS.userLines || kb > LIMITS.userKb)) add("B", "用户全局层超标", `${userHome}/${name}`, `${n} 行 > ${LIMITS.userLines}：按清理判据压缩`);
  }
  let sourceCheckout = false;
  for (let dir = skillRoot; ; dir = path.dirname(dir)) {
    if (await lstat(path.join(dir, ".skill-source")).catch(() => null)) { sourceCheckout = true; break; }
    if (path.dirname(dir) === dir) break;
  }

  const order = { A: 0, B: 1, C: 2 };
  findings.sort((a, b) => order[a.bucket] - order[b.bucket]);
  return {
    rankupDir,
    staleDays,
    findings,
    cleanSummary: {
      cleanFilesCount: cleanPlan.cleanFilesCount,
      cleanBytes: cleanPlan.cleanBytes,
      byCategory: cleanPlan.byCategory,
    },
    portfolio,
    experiences,
    userLayer,
    sourceCheckout,
    codePathsChecked,
  };
}

function render(r) {
  const out = [`rankup doctor（只读诊断）：${r.findings.length} 条发现`];
  const names = { A: "A 安全直接改", B: "B 下沉并保留证据", C: "C 需要用户决定（只列不动）" };
  for (const bucket of ["A", "B", "C"]) {
    const list = r.findings.filter((f) => f.bucket === bucket);
    out.push(`\n${names[bucket]}：${list.length}`);
    for (const f of list) out.push(`  [${f.check}] ${f.where} — ${f.detail}`);
  }
  out.push(`\n反引号路径检查：检查 ${r.codePathsChecked} 处，缺失 ${r.findings.filter((f) => f.check === "反引号路径缺失").length} 处（只读，命令 / 通配符 / 占位路径不查）`);
  if (r.portfolio) {
    const p = r.portfolio;
    out.push(`\n根层登记：portfolio.md 表格 ${p.portfolioRows ?? "未知"} 行；projects.json ${p.projectsCount ?? "未知"} 条（回写前后必须相等）`);
  }
  out.push(`\n经验分拣候选：${r.experiences.length} 条（逐条按 maintenance.md「七」判去向：① 项目 / ② 项目稳定经验 / ③ 用户全局层 / ④ Skill 源码 / ⑤ 别的 Skill 或全局规则 / 待观察）`);
  for (const e of r.experiences.slice(0, 40)) out.push(`  [${e.source}] ${e.text}`);
  if (r.experiences.length > 40) out.push(`  …另有 ${r.experiences.length - 40} 条，用 --json 看全部`);
  out.push(`\n用户全局层（③）：${r.userLayer.dir}${r.userLayer.exists ? `，已有 ${r.userLayer.files.map((f) => `${f.name}（${f.lines} 行）`).join("、")}` : "：还没有 preferences.md / lessons.md（首次写入时再按需创建，不预建空文件）"}`);
  out.push(`回流到 Skill（④）：${r.sourceCheckout ? "当前是源码检出；先查已有规则，任务允许时按晋升门改现有文件，否则只列候选或写允许的 upstream-candidates.md" : "当前是安装副本，只追加到用户全局层的 upstream-candidates.md，不改安装副本"}`);
  out.push("\n下一步：按 references/maintenance.md「六」出整理计划 → 经验分拣与回流 → 执行 A、B → 再跑本脚本与 doc-lint 回读校验 → journal 写一行。");
  return out.join("\n");
}

if (process.argv[1]?.endsWith("rankup-doctor.mjs")) {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (o.help) {
    console.log("用法：node scripts/maintain/rankup-doctor.mjs --project-root <项目目录> | --rankup-dir <.rankup 目录> [--portfolio-root <工作区根>] [--stale-days 30] [--json]");
    console.log("在 .rankup 目录内 --project-root . 也可用；副本直接传 --rankup-dir <复制目录>。只读，无 --fix / --backup；备份与整理前后登记计数由执行者写进报告。");
    process.exit(0);
  }
  try {
    const r = await diagnose(o);
    console.log(o.json ? JSON.stringify(r, null, 2) : render(r));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
