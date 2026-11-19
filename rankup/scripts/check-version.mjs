import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import {
  lstat,
  mkdtemp,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const TRUSTED_SKILLS_PACKAGE = "skills@1.5.21";
const MAX_MANIFEST_BYTES = 128 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const execFileAsync = promisify(execFile);
const skillDirectory = path.dirname(
  fileURLToPath(new URL("../skill.json", import.meta.url)),
);

function parseSemver(version) {
  const match = SEMVER_PATTERN.exec(version);
  if (!match) {
    throw new TypeError(
      `Invalid semantic version "${version}": expected three numeric components`,
    );
  }
  return match.slice(1).map(Number);
}

export function compareSemver(left, right) {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] < rightParts[index]) return -1;
    if (leftParts[index] > rightParts[index]) return 1;
  }
  return 0;
}

export function isCheckDue(
  lastCheckedAt,
  now,
  intervalMs = DEFAULT_CHECK_INTERVAL_MS,
) {
  if (lastCheckedAt === null) return true;
  const lastCheckedTime = new Date(lastCheckedAt).getTime();
  if (!Number.isFinite(lastCheckedTime)) return true;
  if (lastCheckedTime > now.getTime()) return true;
  return now.getTime() - lastCheckedTime >= intervalMs;
}

export function updateArgs(scope) {
  if (scope !== "global" && scope !== "project") {
    throw new TypeError(`Invalid scope "${scope}": expected global or project`);
  }
  return ["skills", "update", "rankup", scope === "global" ? "-g" : "-p", "-y"];
}

export function createInitialState(manifest, { scope, now }) {
  parseSemver(manifest.version);
  if (scope !== "global" && scope !== "project") {
    throw new TypeError(`Invalid scope "${scope}": expected global or project`);
  }
  const installedAt = now.toISOString();
  return {
    schemaVersion: 1,
    skill: manifest.name,
    source: manifest.source,
    installedVersion: manifest.version,
    latestVersion: manifest.version,
    installedAt,
    lastCheckedAt: null,
    lastUpdatedAt: null,
    lastOutcome: null,
    lastReason: null,
    scope,
  };
}

function isPathContained(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function detectedScope(projectRoot, executingDirectory) {
  return isPathContained(projectRoot, executingDirectory)
    ? "project"
    : "global";
}

async function secureRankupDirectory(projectRoot) {
  const realProjectRoot = await realpath(path.resolve(projectRoot));
  const rankupDirectory = path.join(realProjectRoot, ".rankup");
  try {
    const before = await lstat(rankupDirectory);
    if (before.isSymbolicLink()) {
      throw new Error("Refusing symlinked .rankup directory");
    }
    if (!before.isDirectory()) {
      throw new Error("Refusing non-directory .rankup path");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await mkdir(rankupDirectory, { mode: 0o700, recursive: true });
  }

  const realRankupDirectory = await realpath(rankupDirectory);
  if (
    path.dirname(realRankupDirectory) !== realProjectRoot ||
    !isPathContained(realProjectRoot, realRankupDirectory)
  ) {
    throw new Error("Refusing .rankup path outside project root");
  }
  return { realProjectRoot, rankupDirectory: realRankupDirectory };
}

async function checkedStatePath(projectRoot) {
  const paths = await secureRankupDirectory(projectRoot);
  const destination = path.join(paths.rankupDirectory, "skill-state.json");
  try {
    if ((await lstat(destination)).isSymbolicLink()) {
      throw new Error("Refusing symlinked skill-state.json");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { ...paths, destination };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function writeState(projectRoot, state) {
  const { rankupDirectory, destination } =
    await checkedStatePath(projectRoot);
  const temporary = path.join(
    rankupDirectory,
    `.skill-state.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, destination);
  } finally {
    await handle?.close();
    await rm(temporary, { force: true });
  }
}

export async function loadOrCreateState(
  projectRoot,
  manifest,
  scope,
  now,
) {
  const { destination } = await checkedStatePath(projectRoot);
  try {
    const state = await readJson(destination);
    let changed = false;
    if (scope !== undefined && scope !== state.scope) {
      updateArgs(scope);
      state.scope = scope;
      changed = true;
    }
    if (state.installedVersion !== manifest.version) {
      parseSemver(manifest.version);
      state.installedVersion = manifest.version;
      state.lastUpdatedAt = now.toISOString();
      if (
        state.latestVersion === undefined ||
        compareSemver(manifest.version, state.latestVersion) >= 0
      ) {
        state.latestVersion = manifest.version;
        state.lastOutcome = "updated";
        state.lastReason = null;
      }
      changed = true;
    }
    if (changed) {
      await writeState(projectRoot, state);
    }
    return state;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const state = createInitialState(manifest, {
    scope: scope ?? "global",
    now,
  });
  await writeState(projectRoot, state);
  return state;
}

function validateRemoteManifest(remoteManifest, localManifest) {
  if (
    remoteManifest === null ||
    typeof remoteManifest !== "object" ||
    Array.isArray(remoteManifest)
  ) {
    throw new TypeError("Invalid remote manifest: expected a JSON object");
  }
  if (remoteManifest.name !== localManifest.name) {
    throw new TypeError("Invalid remote manifest: Skill name does not match");
  }
  if (remoteManifest.source !== localManifest.source) {
    throw new TypeError("Invalid remote manifest: source does not match");
  }
  parseSemver(remoteManifest.version);
  return remoteManifest;
}

export async function fetchRemoteManifest(manifest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  timeout.unref?.();
  try {
    let manifestUrl = manifest.manifestUrl;
    if (manifestUrl.includes("example-owner")) {
      const source = process.env.SKILLS_SOURCE || "";
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source)) {
        throw new Error("Set SKILLS_SOURCE to the GitHub owner/repository for version checks");
      }
      manifestUrl = `https://raw.githubusercontent.com/${source}/main/${encodeURIComponent(manifest.name)}/skill.json`;
    }
    const response = await fetch(manifestUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Remote manifest request failed with HTTP ${response.status}`,
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (
      !/(?:application\/json|\+json|text\/plain)(?:\s*;|$)/i.test(
        contentType,
      )
    ) {
      throw new Error("Remote manifest response is not JSON");
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_MANIFEST_BYTES) {
      throw new Error("Remote manifest response is too large");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Remote manifest response has no body");
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_MANIFEST_BYTES) {
        await reader.cancel();
        throw new Error("Remote manifest response is too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally {
    clearTimeout(timeout);
  }
}

async function readCurrentInstalledManifest(directory = skillDirectory) {
  return readJson(path.join(directory, "skill.json"));
}

function spawnCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Skills CLI update failed (${signal ? `signal ${signal}` : `exit ${code}`})`,
        ),
      );
    });
  });
}

export async function runTrustedSkills(
  args,
  {
    cwd,
    stdio = "inherit",
    spawnProcess = spawnCommand,
  },
) {
  const isolatedPrefix = await mkdtemp(
    path.join(tmpdir(), "rankup-skills-cli-"),
  );
  try {
    await spawnProcess(
      "npm",
      [
        "exec",
        "--yes",
        `--package=${TRUSTED_SKILLS_PACKAGE}`,
        "--prefix",
        isolatedPrefix,
        "--",
        ...args,
      ],
      { cwd, stdio },
    );
  } finally {
    await rm(isolatedPrefix, { recursive: true, force: true });
  }
}

// 从源码仓库运行时,这份 Skill 目录本身就是真源(通常还被全局技能目录符号链接过来)。
// 此时执行 `skills update` 会把远端副本写回来,既覆盖未发布的改动,也会把符号链接
// 换成实体目录,重新变回双份维护。源码检出一律拒绝自更新,由 git 负责同步。
//
// 判定依据是仓库根的 `.skill-source` 标记文件:`skills add/update` 只复制单个 Skill
// 子目录,该标记位于仓库根,永远不会随安装副本分发。因此它能可靠区分源码与安装副本,
// 且不会误伤项目级(`-p`)安装——那种安装的 Skill 虽然也在 git 仓库里,但仓库根没有标记。
async function isSourceCheckout(directory = skillDirectory) {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      directory,
      "rev-parse",
      "--show-toplevel",
    ]);
    await lstat(path.join(stdout.trim(), ".skill-source"));
    return true;
  } catch {
    return false;
  }
}

async function isDirtySkillCheckout(directory = skillDirectory) {
  let repositoryRoot;
  try {
    const result = await execFileAsync("git", [
      "-C",
      directory,
      "rev-parse",
      "--show-toplevel",
    ]);
    repositoryRoot = result.stdout.trim();
  } catch {
    return false;
  }

  const result = await execFileAsync("git", [
    "-C",
    repositoryRoot,
    "status",
    "--porcelain",
    "--",
    path.relative(repositoryRoot, directory),
  ]);
  return result.stdout.trim().length > 0;
}

export async function checkForUpdate({
  projectRoot,
  manifest,
  scope,
  now = new Date(),
  force = false,
  apply = false,
  fetchManifest = fetchRemoteManifest,
  runUpdate = runTrustedSkills,
  readInstalledManifest = readCurrentInstalledManifest,
  dirtySkillCheckout = isDirtySkillCheckout,
  sourceCheckout = isSourceCheckout,
  executingSkillDirectory = skillDirectory,
}) {
  const resolvedRoot = await realpath(path.resolve(projectRoot));
  const resolvedSkillDirectory = await realpath(
    path.resolve(executingSkillDirectory),
  );
  const autoScope = detectedScope(resolvedRoot, resolvedSkillDirectory);
  if (scope !== undefined && scope !== autoScope) {
    return {
      status: "blocked",
      reason: "scope-target-mismatch",
      installedVersion: manifest.version,
      latestVersion: manifest.version,
      scope,
    };
  }
  const selectedScope = scope ?? autoScope;
  const state = await loadOrCreateState(
    resolvedRoot,
    manifest,
    selectedScope,
    now,
  );

  const result = (status, reason = undefined) => ({
    status,
    ...(reason ? { reason } : {}),
    installedVersion: state.installedVersion,
    latestVersion: state.latestVersion,
    scope: state.scope,
  });
  const finish = async (status, reason = null) => {
    state.lastOutcome = status;
    state.lastReason = reason;
    await writeState(resolvedRoot, state);
    return result(status, reason ?? undefined);
  };

  const checkDue = force || isCheckDue(state.lastCheckedAt, now);
  if (checkDue) {
    let remoteManifest;
    try {
      remoteManifest = validateRemoteManifest(
        await fetchManifest(manifest),
        manifest,
      );
    } catch {
      return finish("blocked", "remote-check-failed");
    }
    state.lastCheckedAt = now.toISOString();
    state.latestVersion = remoteManifest.version;
  }

  if (compareSemver(state.installedVersion, state.latestVersion) >= 0) {
    if (!checkDue && state.lastOutcome === "blocked") {
      return result("blocked", state.lastReason ?? "previous-check-blocked");
    }
    if (!checkDue) {
      return result("skipped", "check-not-due");
    }
    return finish("current");
  }

  if (!apply) {
    return finish("update-available");
  }

  if (await sourceCheckout(resolvedSkillDirectory)) {
    return finish("blocked", "source-checkout");
  }

  if (await dirtySkillCheckout(resolvedSkillDirectory)) {
    return finish("blocked", "dirty-skill-checkout");
  }

  try {
    await runUpdate(updateArgs(state.scope), {
      cwd: resolvedRoot,
      targetDirectory: resolvedSkillDirectory,
    });
  } catch {
    return finish("blocked", "update-command-failed");
  }

  let updatedManifest;
  try {
    updatedManifest = await readInstalledManifest(resolvedSkillDirectory);
    validateRemoteManifest(updatedManifest, manifest);
  } catch {
    return finish("blocked", "update-verification-failed");
  }

  if (compareSemver(updatedManifest.version, state.latestVersion) < 0) {
    return finish("blocked", "update-verification-failed");
  }

  state.installedVersion = updatedManifest.version;
  state.lastUpdatedAt = now.toISOString();
  return finish("updated");
}

function parseCliArgs(args) {
  const options = {
    projectRoot: process.cwd(),
    force: false,
    apply: false,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--project-root") {
      const value = args[index + 1];
      if (!value) throw new TypeError("--project-root requires a path");
      options.projectRoot = value;
      index += 1;
    } else if (argument === "--scope") {
      const value = args[index + 1];
      if (!value) throw new TypeError("--scope requires global or project");
      updateArgs(value);
      options.scope = value;
      index += 1;
    } else if (argument === "--force") {
      options.force = true;
    } else if (argument === "--apply") {
      options.apply = true;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "-h" || argument === "--help") {
      // 显式 `--help` 是成功，不是用法错误——批处理里 set -e 会把非零码当脚本坏了。
      console.log("用法: check-version.mjs [--apply] [--json]");
      process.exit(0);
    } else {
      throw new TypeError(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function exitCodeFor(status) {
  if (status === "update-available") return 2;
  if (status === "blocked") return 3;
  return 0;
}

async function main() {
  let options;
  try {
    options = parseCliArgs(process.argv.slice(2));
    const manifest = await readCurrentInstalledManifest();
    const result = await checkForUpdate({
      ...options,
      manifest,
      runUpdate: options.json
        ? (args, runOptions) =>
            runTrustedSkills(args, {
              ...runOptions,
              stdio: ["ignore", "ignore", "ignore"],
            })
        : runTrustedSkills,
    });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      process.stdout.write(
        `rankup: ${result.status} (${result.installedVersion} → ${result.latestVersion})\n`,
      );
    }
    process.exitCode = exitCodeFor(result.status);
  } catch (error) {
    const result = { status: "blocked", reason: "invalid-arguments" };
    if (options?.json || process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      process.stderr.write(`rankup: ${error.message}\n`);
    }
    process.exitCode = 3;
  }
}

// argv[1] 保留调用时写的路径,而 import.meta.url 已经过符号链接解析。
// 全局技能目录符号链接到源码仓库时,两者不相等,main() 会被静默跳过并退出 0——
// 版本检查看起来跑过了,实际什么都没做。两边都取真实路径再比较。
async function invokedAsScript() {
  if (process.argv[1] === undefined) return false;
  try {
    const resolved = await realpath(path.resolve(process.argv[1]));
    return pathToFileURL(resolved).href === import.meta.url;
  } catch {
    return false;
  }
}

if (await invokedAsScript()) {
  await main();
}
