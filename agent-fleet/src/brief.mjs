// 简报与结果落盘:完整最终回复写进 ~/.agent-fleet/runs/<run-id>.result.md,
// stdout 默认只给简报。git 快照用于判断运行期间有没有新提交/未提交改动。

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { judgeTask } from './judge-task.mjs';
import { computeVerdict, hasControlTokens } from './verdict.mjs';

export const DEFAULT_BRIEF_LINES = 3;

function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** 运行前拍一张 HEAD。空仓库 / 非 git 目录都算拍到,不抛。 */
export function snapshotGit(cwd) {
  if (!cwd) return { isRepo: false, head: null };
  const inside = git(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') return { isRepo: false, head: null };
  const head = git(cwd, ['rev-parse', 'HEAD']);
  return { isRepo: true, head: head || null };
}

/** 对比运行前快照,列出新提交短 hash、是否有未提交改动。运行期间 git init 也算。 */
export function inspectGit(cwd, before = { isRepo: false, head: null }) {
  const now = snapshotGit(cwd);
  if (!now.isRepo) {
    return { newCommits: [], hasUncommittedChanges: false, isRepo: false };
  }
  let newCommits = [];
  if (before?.isRepo && before.head) {
    const log = git(cwd, ['log', '--pretty=%h', `${before.head}..HEAD`]);
    newCommits = log ? log.split('\n').filter(Boolean) : [];
  } else {
    const log = git(cwd, ['log', '--pretty=%h']);
    newCommits = log ? log.split('\n').filter(Boolean) : [];
  }
  const porcelain = git(cwd, ['status', '--porcelain']);
  return {
    newCommits,
    hasUncommittedChanges: Boolean(porcelain),
    isRepo: true,
  };
}

export function resultPathFromLog(logPath) {
  if (!logPath) return null;
  return logPath.endsWith('.log') ? `${logPath.slice(0, -4)}.result.md` : `${logPath}.result.md`;
}

/** 把完整最终回复写进与日志同源的 .result.md,返回路径。 */
export function writeResultFile(logPath, text) {
  const resultPath = resultPathFromLog(logPath);
  if (!resultPath) return null;
  writeFileSync(resultPath, text == null ? '' : String(text));
  return resultPath;
}

export function previewLines(text, n = DEFAULT_BRIEF_LINES) {
  const limit = Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : DEFAULT_BRIEF_LINES;
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .filter((line, i, arr) => !(i === arr.length - 1 && line === ''));
  return lines.slice(0, limit);
}

/**
 * 给 runTask 的返回值补上 git / 结果文件路径。不计算 verdict(那还依赖 CLI 标志)。
 * @param {object} result
 * @param {string} logPath
 * @param {{ newCommits: string[], hasUncommittedChanges: boolean }} gitInfo
 */
export function redactEvidence(value) {
  const redactText = text => {
    for (const [name, secret] of Object.entries(process.env)) {
      if (/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name) && secret?.length >= 4) text = text.split(secret).join('[REDACTED]');
    }
    return text.replace(/\b(?:Bearer\s+|sk-)[\w.+/=-]+/gi, '[REDACTED]')
      .replace(/((?:api[_-]?key|token|password|secret|authorization)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[REDACTED]');
  };
  if (typeof value === 'string') {
    try { value = JSON.parse(value); }
    catch { return redactText(value); }
  }
  return JSON.stringify(value ?? null, (key, item) =>
    /(?:api[_-]?key|token|password|secret|authorization)$/i.test(key) ? '[REDACTED]'
      : typeof item === 'string' ? redactText(item) : item);
}

export function failureReport(result) {
  if (result?.ok) return null;
  const tail = value => redactEvidence(value).split(/\r?\n/).slice(-20).join('\n').slice(-4000);
  return {
    executor: result?.model ?? null,
    tier: result?.tier ?? result?.resolvedModel ?? result?.model ?? null,
    error: result?.error ? tail(result.error) : null,
    ...(result?.stderr ? { stderr: tail(result.stderr) } : {}),
    ...(result?.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}),
    ...(result?.errorObject ? { errorObject: JSON.parse(redactEvidence(result.errorObject)) } : {}),
    ...(result?.errors?.length ? { errors: JSON.parse(redactEvidence(result.errors)) } : {}),
    progress: result?.progress ? JSON.parse(redactEvidence(result.progress)) : { phase: result?.subtype ?? '执行结束', numTurns: result?.numTurns ?? null, stopReason: result?.stopReason ?? null },
    artifacts: { resultPath: result?.resultPath ?? null, logPath: result?.logPath ?? null, newCommits: result?.newCommits ?? [] },
    dirty: Boolean(result?.hasUncommittedChanges),
  };
}

export function attachArtifacts(result, logPath, gitInfo) {
  const output = {
    ...result,
    logPath: logPath ?? null,
    resultPath: resultPathFromLog(logPath),
    newCommits: gitInfo?.newCommits ?? [],
    hasUncommittedChanges: Boolean(gitInfo?.hasUncommittedChanges),
  };
  if (!output.ok) {
    for (const key of ['error', 'stderr', 'errors', 'errorObject', 'progress', 'result']) {
      if (output[key] !== undefined) output[key] = typeof output[key] === 'string' ? redactEvidence(output[key]) : JSON.parse(redactEvidence(output[key]));
    }
    output.failureReport = failureReport(output);
  }
  const body = output.result ?? output.error ?? '';
  writeResultFile(logPath, output.failureReport ? `${redactEvidence(body)}\n\n## 失败事实\n${JSON.stringify(output.failureReport, null, 2)}\n` : body);
  return output;
}

/**
 * 可选 --judge:进程内调 judgeTask,不起子进程。
 * TYPESAFE_API_KEY 缺失或 jev 未配置时跳过,由简报注明。
 */
export async function maybeJudge(result, config) {
  if (!process.env.TYPESAFE_API_KEY) {
    return { skipped: 'TYPESAFE_API_KEY 缺失,已跳过 --judge' };
  }
  if (!config?.jev || config.jev.protocol !== 'typesafe-systemone') {
    return { skipped: 'models.config.json 未配置 jev,已跳过 --judge' };
  }
  try {
    const jr = await judgeTask({
      friendlyModel: 'jev',
      state: `任务要求:\n${result.prompt ?? ''}\n\n最终回复:\n${result.result ?? ''}`,
      questions: {
        meets_requirement: {
          type: 'noul',
          instructions: '最终回复是否满足任务要求',
        },
      },
      config,
    });
    if (!jr.ok) return { skipped: `judge 调用失败: ${jr.error}` };
    const answer = jr.answers?.meets_requirement ?? null;
    return { answer, confidence: typeof answer?.confidence === 'number' ? answer.confidence : undefined };
  } catch (err) {
    return { skipped: `judge 调用失败: ${err.message}` };
  }
}

export function buildBrief(result, { briefLines = DEFAULT_BRIEF_LINES, expectChanges = false, judge = null } = {}) {
  const control = hasControlTokens(result?.result);
  const judged = computeVerdict({
    ok: Boolean(result?.ok),
    subtype: result?.subtype ?? null,
    result: result?.result ?? null,
    error: result?.error ? redactEvidence(result.error) : (Array.isArray(result?.errors) && result.errors.length ? redactEvidence(result.errors.join('; ')) : null),
    expectChanges,
    hasNewCommits: (result?.newCommits ?? []).length > 0,
    hasUncommittedChanges: Boolean(result?.hasUncommittedChanges),
    judgeConfidence: judge && !judge.skipped ? judge.confidence : undefined,
    stopped: Boolean(result?.stopped),
  });

  const preview = previewLines(result?.ok ? result?.result : redactEvidence(result?.result ?? ''), briefLines);
  return {
    ok: Boolean(result?.ok),
    verdict: !result?.ok && !result?.stopped ? 'fail' : judged.verdict,
    verdictNote: !result?.ok ? null : judged.note ?? null,
    durationMs: result?.durationMs ?? null,
    sdkDurationMs: result?.sdkDurationMs ?? null,
    totalCostUsd: result?.totalCostUsd ?? null,
    numTurns: result?.numTurns ?? null,
    preview,
    resultPath: result?.resultPath ?? null,
    logPath: result?.logPath ?? null,
    newCommits: result?.newCommits ?? [],
    hasUncommittedChanges: Boolean(result?.hasUncommittedChanges),
    hasControlTokens: control,
    model: result?.model ?? null,
    resolvedModel: result?.resolvedModel ?? null,
    stopReason: result?.stopReason ?? null,
    subtype: result?.subtype ?? null,
    error: result?.error ? redactEvidence(result.error) : null,
    ...(!result?.ok ? { failureReport: failureReport(result) } : {}),
    judgeSkipped: judge?.skipped ?? null,
    stopped: Boolean(result?.stopped),
    signal: result?.signal ?? null,
    resumedFrom: result?.resumedFrom ?? null,
  };
}

export function formatBriefHuman(brief) {
  const previewBlock = (brief.preview ?? []).map((l) => `  ${l}`).join('\n');
  const commits = (brief.newCommits ?? []).join(' ') || '(none)';
  const lines = [
    `ok: ${brief.ok}  verdict: ${brief.verdict}${brief.verdictNote ? ` (${brief.verdictNote})` : ''}`,
    `duration: ${brief.durationMs ?? '?'}ms  cost: ${fmtCost(brief.totalCostUsd)}  turns: ${brief.numTurns ?? '?'}`,
    `preview:`,
    previewBlock || '  (empty)',
    `result: ${brief.resultPath ?? '(none)'}`,
    `log: ${brief.logPath ?? '(none)'}`,
    `commits: ${commits}`,
    `dirty: ${brief.hasUncommittedChanges ? 'yes' : 'no'}  controlTokens: ${brief.hasControlTokens ? 'yes' : 'no'}`,
  ];
  if (brief.model) lines.push(`model: ${brief.model}`);
  if (brief.failureReport) lines.push(`失败事实: ${JSON.stringify(brief.failureReport)}`);
  if (brief.judgeSkipped) lines.push(`judge: ${brief.judgeSkipped}`);
  if (brief.resumedFrom) lines.push(`resumedFrom: ${brief.resumedFrom}`);
  if (brief.signal) lines.push(`signal: ${brief.signal}`);
  if (brief.error && !brief.ok) lines.push(`error: ${brief.error}`);
  return `${lines.join('\n')}\n`;
}

export function formatBriefJson(brief) {
  return `${JSON.stringify(brief)}\n`;
}

export function formatFullHuman(result) {
  const lines = [
    `${'='.repeat(60)}`,
    `模型: ${result.model}${result.resolvedModel ? ` (${result.resolvedModel})` : ''}`,
  ];
  if (result.cwd) lines.push(`工作目录: ${result.cwd}`);
  lines.push(`状态: ${result.ok ? '成功' : '失败'}`);
  if (result.ok) {
    lines.push(`耗时: ${result.durationMs}ms | 轮数: ${result.numTurns} | 预估成本: ${fmtCost(result.totalCostUsd)}`);
    lines.push('-'.repeat(60));
    lines.push(result.result ?? '(没有文本结果)');
  } else {
    lines.push(`失败事实: ${JSON.stringify(failureReport(result))}`);
  }
  lines.push('='.repeat(60));
  return `${lines.join('\n')}\n`;
}

function fmtCost(cost) {
  return typeof cost === 'number' && Number.isFinite(cost) ? `$${cost.toFixed(4)}` : String(cost ?? '?');
}

/**
 * 把一次 run / run-many 条目格式化成 stdout 文本。
 * --json 且非 --full 时永远是单个 JSON 值(对象);调用方负责把数组 JSON.stringify 一次。
 */
async function briefsFor(results, { briefLines, expectChanges, judge, config }) {
  const out = [];
  for (const result of results) {
    let judgeInfo = null;
    if (judge && result.ok) judgeInfo = await maybeJudge(result, config);
    out.push(buildBrief(result, { briefLines, expectChanges, judge: judgeInfo }));
  }
  return out;
}

export async function renderRunOutput(result, opts = {}) {
  const briefLines = opts.briefLines ?? DEFAULT_BRIEF_LINES;
  const [brief] = await briefsFor([result], { ...opts, briefLines });
  opts.onBrief?.(brief);
  if (opts.full) {
    if (opts.json) {
      return `${JSON.stringify({ ...result, verdict: brief.verdict, verdictNote: brief.verdictNote, hasControlTokens: brief.hasControlTokens, preview: brief.preview }, null, 2)}\n`;
    }
    return formatFullHuman(result);
  }
  if (opts.json) return formatBriefJson(brief);
  return formatBriefHuman(brief);
}

export async function renderManyOutput(results, opts = {}) {
  const briefLines = opts.briefLines ?? DEFAULT_BRIEF_LINES;
  const briefs = await briefsFor(results, { ...opts, briefLines });
  opts.onBrief?.(briefs);
  if (opts.full) {
    if (opts.json) return `${JSON.stringify(results.map((r, i) => ({ ...r, verdict: briefs[i].verdict })), null, 2)}\n`;
    return `${results.map(formatFullHuman).join('\n')}\n共 ${results.length} 个任务,成功 ${results.filter((r) => r.ok).length} 个,失败 ${results.filter((r) => !r.ok).length} 个。\n`;
  }
  if (opts.json) return `${JSON.stringify(briefs, null, 2)}\n`;
  return briefs.map((b, i) => `--- task ${i + 1} ${b.model ?? ''} ---\n${formatBriefHuman(b)}`).join('\n');
}
