#!/usr/bin/env node
// 跨项目资产登记表:把各项目 .rankup/ 里已经沉淀的脚本与经验汇总成一张名单,
// 让不同项目不再是信息孤岛——在 A 项目工作时能看到 B 项目已经写好了 GSC 导出脚本,
// 直接去那个仓库取,而不是从头再摸索一遍。
//
//   node scripts/registry.mjs scan --roots <存放项目的目录> [更多目录...]
//   node scripts/registry.mjs list
//
// 名单写在 Skill 目录下的 registry.md,**绝不进 Git**:它必须写出项目名与绝对路径
// 才有用,而 Skill 要保持项目中立且要开源。rankup/.gitignore 排除它,
// validate-rankup.mjs 再断言它未被追踪,连 `git add -f` 也会当场构建失败。
//
// 名单是扫描生成的,不靠手工维护——手写的索引一定会过期(这是本 Skill 经验库里
// 反复验证过的结论),所以每次 scan 都整表重建,读到的永远是磁盘上的当前事实。

import { experienceEntry } from "./maintain/memory-lint.mjs";
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from 'node:fs';

// 名单默认就放在 Skill 目录里,挨着 SKILL.md,用的时候一眼看得到。
// 它含项目名与绝对路径,因此被 rankup/.gitignore 排除,并由 validate-rankup.mjs
// 断言"绝不能被 git 追踪"——豁免它参与项目中立扫描的前提,正是这条断言成立。
const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 用户全局层：默认 ~/.rankup/，可用 RANKUP_HOME 覆盖（与 references/maintenance.md「七」一致）。
const userRankup = process.env.RANKUP_HOME ? path.resolve(process.env.RANKUP_HOME) : path.join(homedir(), ".rankup");
const registryPath = process.env.RANKUP_REGISTRY_PATH
  ? path.resolve(process.env.RANKUP_REGISTRY_PATH)
  : path.join(skillDir, "registry.md");
const configPath = path.join(userRankup, "config.json");

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

// 扫描根目录从命令行、环境变量或本机配置读取,绝不写死在脚本里——
// 写死就意味着把某台机器的目录结构带进要开源的 Skill。
//
// 导出给 validate-rankup.mjs 复用(2026-09-13):项目中立守卫要拦"项目代号
// 泄漏进 Skill",与其手工维护一张会过期的项目名黑名单(黑名单只能拦住它
// 认识的词,新开项目忘了加就等于没有这道防线),不如运行时读这里的扫描根,
// 把根目录下的子目录名当额外泄露词——同一份"扫描根在哪"逻辑,不重复实现。
export async function resolveRoots(args) {
  const flagIndex = args.indexOf("--roots");
  if (flagIndex !== -1) {
    const roots = args.slice(flagIndex + 1).filter((value) => !value.startsWith("--"));
    if (roots.length > 0) return roots.map((root) => path.resolve(root));
  }
  if (process.env.RANKUP_PROJECT_ROOTS) {
    return process.env.RANKUP_PROJECT_ROOTS.split(path.delimiter)
      .filter(Boolean)
      .map((root) => path.resolve(root));
  }
  if (await exists(configPath)) {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (Array.isArray(config.projectRoots) && config.projectRoots.length > 0) {
      return config.projectRoots.map((root) => path.resolve(root));
    }
  }
  return [];
}

// 脚本的用途取头部第一行注释。这样登记表的说明和脚本本身同源,不会各自漂移。
async function describeScript(file) {
  try {
    const text = await readFile(file, "utf8");
    for (const line of text.split("\n").slice(0, 12)) {
      const comment = line.match(/^\s*(?:\/\/|#)\s*(.+?)\s*$/);
      if (comment && !comment[1].startsWith("!")) return comment[1];
    }
  } catch {
    /* 读不到就留空,不阻断扫描 */
  }
  return "";
}

async function countEntries(file) {
  try {
    const text = await readFile(file, "utf8");
    return [...text.matchAll(new RegExp(experienceEntry.source, "gm"))].length;
  } catch {
    return 0;
  }
}

async function inspectProject(projectPath) {
  const rankupDir = path.join(projectPath, ".rankup");
  if (!(await exists(rankupDir))) return null;

  const scripts = [];
  const scriptsDir = path.join(rankupDir, "scripts");
  if (await exists(scriptsDir)) {
    for (const entry of await readdir(scriptsDir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith(".")) continue;
      scripts.push({
        name: entry.name,
        purpose: await describeScript(path.join(scriptsDir, entry.name)),
      });
    }
  }

  const notes = [];
  for (const file of ["roadmap.md", "iterations.md", "decisions.md", "keywords.md", "baseline.md"]) {
    if (await exists(path.join(rankupDir, file))) notes.push(file);
  }

  return {
    name: path.basename(projectPath),
    path: projectPath,
    scripts: scripts.sort((a, b) => a.name.localeCompare(b.name)),
    experienceCount: await countEntries(path.join(rankupDir, "experience.md")),
    notes,
  };
}

// 项目不一定都平铺在根目录下,也可能装在一层容器目录里(如 <root>/<组>/<项目>)。
// 向下多找一层即可覆盖这种布局;再深就会扫进 node_modules 之类的目录,得不偿失。
const MAX_SCAN_DEPTH = 2;

async function walk(directory, depth, projects) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }
    const candidate = path.join(directory, entry.name);
    const report = await inspectProject(candidate);
    if (report) {
      projects.push(report);
      continue; // 已是项目,不再往它内部找
    }
    if (depth < MAX_SCAN_DEPTH) await walk(candidate, depth + 1, projects);
  }
}

async function scanRoots(roots) {
  const projects = [];
  for (const root of roots) {
    if (!(await exists(root))) {
      console.warn(`跳过不存在的根目录: ${root}`);
      continue;
    }
    await walk(root, 1, projects);
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

function render(projects, roots, stamp) {
  const lines = [
    "# 跨项目资产登记表",
    "",
    "> 由 `rankup/scripts/registry.mjs scan` 扫描生成，**不要手工编辑**——下次扫描会整表重建。",
    "> 本文件不进任何 Git 仓库：它含项目名与绝对路径，而 Skill 要保持项目中立且要开源。",
    "> 已被 `rankup/.gitignore` 排除，并由 `validate-rankup.mjs` 断言绝不能被 git 追踪。",
    "> 在别的项目里看到可复用的脚本或经验，直接去对应路径取，不要重写一遍。",
    "",
    `扫描根目录：${roots.join("、") || "（未配置）"}`,
    `更新时间：${stamp}`,
    "",
  ];

  const withScripts = projects.filter((project) => project.scripts.length > 0);
  lines.push("## 可复用脚本", "");
  if (withScripts.length === 0) {
    lines.push("暂无。任何会做第二次的操作，第一次跑通就应该固化到 `<项目>/.rankup/scripts/`。", "");
  } else {
    lines.push("| 脚本 | 所属项目 | 用途 | 取用路径 |", "|---|---|---|---|");
    for (const project of withScripts) {
      for (const script of project.scripts) {
        const location = path.join(project.path, ".rankup", "scripts", script.name);
        lines.push(`| \`${script.name}\` | ${project.name} | ${script.purpose || "—"} | \`${location}\` |`);
      }
    }
    lines.push("");
  }

  lines.push("## 各项目沉淀概览", "");
  if (projects.length === 0) {
    lines.push("未发现任何带 `.rankup/` 的项目。", "");
  } else {
    lines.push("| 项目 | 经验条目 | 脚本 | 已有文件 | 路径 |", "|---|---|---|---|---|");
    for (const project of projects) {
      lines.push(
        `| ${project.name} | ${project.experienceCount} | ${project.scripts.length} | ${project.notes.join("、") || "—"} | \`${project.path}\` |`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## 使用约定",
    "",
    "- 通用规则属于 Skill，项目可归属的内容属于各自 `.rankup/`，本表只是**索引**，不复制内容。",
    "- 取用别的项目的脚本时，连同它的参数约定一起看；登录态、property ID、账号配置不要跨项目照抄。",
    "- 某个脚本被第二个项目用上后，说明它足够通用，考虑把**做法**提炼成规则回流 Skill（仍然不带项目信息）。",
    "",
  );
  return lines.join("\n");
}

// ── CLI 入口 ─────────────────────────────────────────────────────
//
// 2026-09-13 修复:这一段(连同下面的 --help 处理)曾经是模块顶层直接执行的
// 代码——validate-rankup.mjs 为了复用 resolveRoots() 而 `import` 本文件时,
// 这段代码会跟着 import 一起跑,把本机真实的 registry.md(含真实项目名和
// 绝对路径)整份打印到 validate-rankup.mjs 的 stdout 上,而 validate-rankup.mjs
// 恰恰是那道"不许项目信息泄漏"的守卫——等于守卫自己在犯它要拦的错。
// 现在收进 invokedAsScript() 守卫:只有直接 `node scripts/registry.mjs ...`
// 运行时才执行 CLI 逻辑,被其他文件 import 时只取纯函数(resolveRoots 等),
// 不会有任何副作用。写法与 cf-zone-setup.mjs 的 invokedAsScript() 一致。

async function invokedAsScript() {
  if (process.argv[1] === undefined) return false;
  try {
    const resolved = await realpath(path.resolve(process.argv[1]));
    return pathToFileURL(resolved).href === import.meta.url;
  } catch {
    return false;
  }
}

async function runCli() {
  // `--help` 是成功，不是用法错误。放在命令分发之前：本文件在任何参数解析之前
  // 就会开工（起服务 / 读文件 / 校验必填），走到那里再判就已经晚了。
  // 帮助文案直接取本文件头部注释，不另写一份——两份必然漂移。
  if (process.argv.slice(2).some((a) => a === '--help' || a === '-h')) {
    const src = readFileSync(new URL(import.meta.url).pathname, 'utf8');
    const block = src.match(/\/\*\*([\s\S]*?)\*\//)
      ? src.match(/\/\*\*([\s\S]*?)\*\//)[1].split('\n').map((l) => l.replace(/^\s*\* ?/, ''))
      : src.split('\n').slice(1).filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, ''));
    console.log(block.join('\n').trim());
    process.exit(0);
  }

  const [command = "list", ...args] = process.argv.slice(2);

  if (command === "scan") {
    const roots = await resolveRoots(args);
    if (roots.length === 0) {
      console.error(
        "未指定扫描根目录。用 --roots <目录>，或设 RANKUP_PROJECT_ROOTS，" +
          `或在 ${configPath} 写 {"projectRoots": ["..."]}`,
      );
      process.exit(1);
    }
    const projects = await scanRoots(roots);
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(registryPath, render(projects, roots, new Date().toISOString().slice(0, 10)), "utf8");
    const scriptCount = projects.reduce((total, project) => total + project.scripts.length, 0);
    console.log(`已登记 ${projects.length} 个项目、${scriptCount} 个可复用脚本 -> ${registryPath}`);
  } else if (command === "list") {
    if (!(await exists(registryPath))) {
      console.error(`登记表尚不存在。先运行:\n  node scripts/registry.mjs scan --roots <存放项目的目录>`);
      process.exit(1);
    }
    process.stdout.write(await readFile(registryPath, "utf8"));
  } else {
    console.error(`未知命令: ${command}（可用: scan、list）`);
    process.exit(1);
  }
}

if (await invokedAsScript()) {
  await runCli();
}
