#!/usr/bin/env node
// 把本仓库的每个 Skill 符号链接进全局技能目录,使全局只存在一份真源。
//
//   node scripts/link-skills.mjs           建立或修复链接
//   node scripts/link-skills.mjs --check   只检查,发现漂移时退出 1
//
// `skills add` / `skills update` 会把链接换成实体目录副本,双份维护随之回归。
// 那种情况下重跑本脚本即可恢复;被替换掉的实体目录会先备份,不直接删除。

import { lstat, mkdir, readdir, readlink, realpath, rename, symlink, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const globalSkills = path.join(homedir(), ".agents", "skills");

// --help 必须在任何文件系统写操作之前早退：check-help.mjs 会对全仓 CLI 跑
// `node <script> --help`,没有这个守卫时那次"体检"会真的执行一轮全局重链接+备份。
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`link-skills.mjs —— 把本仓库的每个 Skill 符号链接进 ~/.agents/skills

用法:
  node scripts/link-skills.mjs           建立或修复链接
  node scripts/link-skills.mjs --check   只检查,发现漂移时退出 1
  node scripts/link-skills.mjs --help    显示本帮助(不做任何修改)`);
  process.exit(0);
}

const checkOnly = process.argv.includes("--check");

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

// Skill 独立目录与 agent-fleet 的嵌套 Skill 使用相同的安装名称。
async function discoverSkills() {
  const entries = await readdir(repoRoot, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (await exists(path.join(repoRoot, entry.name, "SKILL.md"))) {
      skills.push({ name: entry.name, source: path.join(repoRoot, entry.name) });
    }
  }
  const runtimeFleet = path.join(homedir(), ".agent-fleet", "runtime", "current", "agent-fleet", "skill");
  const fleet = await exists(path.join(runtimeFleet, "SKILL.md"))
    ? runtimeFleet
    : path.join(repoRoot, "agent-fleet", "skill");
  if (await exists(path.join(fleet, "SKILL.md"))) skills.push({ name: "agent-fleet", source: fleet });
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

// 已经指向本仓库对应目录的链接视为正常,其余一律需要处理。
async function inspect({ name, source }) {
  const target = path.join(globalSkills, name);
  if (!(await exists(target))) return { name, source, target, state: "missing" };

  const info = await lstat(target);
  if (!info.isSymbolicLink()) return { name, source, target, state: "real-directory" };

  const resolved = path.resolve(globalSkills, await readlink(target));
  if ((await realpath(resolved).catch(() => resolved)) === (await realpath(source))) {
    return { name, source, target, state: "linked" };
  }
  return { name, source, target, state: "wrong-target", resolved };
}

// 同一天可能修复多次,而当天的备份目录里已经有同名条目;rename 到非空目录会
// 直接抛 ENOTEMPTY 并中断整轮修复。逐个后缀试到空位为止,保证每次备份都不覆盖。
async function freeBackupPath(stamp, name) {
  const base = path.join(globalSkills, `.backup-${stamp}`);
  for (let suffix = 0; ; suffix += 1) {
    const candidate = path.join(base, suffix === 0 ? name : `${name}-${suffix}`);
    if (!(await exists(candidate))) return candidate;
  }
}

async function relink({ name, source, target, state }, stamp) {
  if (state === "real-directory") {
    // 实体目录可能含有本机专属文件(.env 等),备份而不是删除。
    const backup = await freeBackupPath(stamp, name);
    await mkdir(path.dirname(backup), { recursive: true });
    await rename(target, backup);
    console.log(`  已备份被替换的实体目录 -> ${path.relative(homedir(), backup)}`);
  } else if (state === "wrong-target") {
    await unlink(target);
  }
  await symlink(source, target);
  console.log(`  已链接 ${name} -> ${source}`);
}

const skills = await discoverSkills();
if (skills.length === 0) {
  console.error("仓库里没有找到任何含 SKILL.md 的 Skill 目录");
  process.exit(1);
}

if (!checkOnly) await mkdir(globalSkills, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const drift = [];

for (const skill of skills) {
  const report = await inspect(skill);
  const { name } = report;
  if (report.state === "linked") {
    console.log(`OK   ${name}`);
    continue;
  }
  drift.push(report);
  console.log(`漂移 ${name}: ${report.state}`);
  if (!checkOnly) await relink(report, stamp);
}

if (drift.length === 0) {
  console.log(`\n${skills.length} 个 Skill 全部指向本仓库,全局只有一份真源。`);
} else if (checkOnly) {
  console.error(`\n${drift.length} 个 Skill 未指向本仓库。运行 node scripts/link-skills.mjs 修复。`);
  process.exit(1);
} else {
  console.log(`\n已修复 ${drift.length} 个 Skill。`);
}
