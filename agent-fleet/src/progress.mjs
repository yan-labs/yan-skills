// 执行进度实时输出:每条关键事件(assistant 文本、tool_use、done、still waiting)都写一行,
// 同时落到两个地方——stderr(实时看)和 ~/.agent-fleet/runs/<ISO时间>-<label>.log(事后 tail)。
//
// 设计要点:
// - 日志文件永远写:它是 tail 子命令的数据源,也是 --quiet 时唯一的进度出口;
//   --quiet 只静音 stderr 这一侧,不关文件。
// - 行首时间戳是「本次任务已用秒数」,一眼看出卡了多久。
// - 60 秒没有任何新输出时打一行 still waiting…,让人知道进程还活着、不是挂了;
//   定时器必须 stop()(runTask 的 finally 负责),否则会把 CLI 进程吊住不退出。

import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 进度日志目录。测试或特殊场景可以用 AGENT_FLEET_RUNS_DIR 挪走,默认落在用户家目录。 */
export function runsDir() {
  return process.env.AGENT_FLEET_RUNS_DIR || join(homedir(), '.agent-fleet', 'runs');
}

const STILL_WAITING_MS = 60_000;

/**
 * 建一个进度输出对象。
 *
 * @param {object} [options]
 * @param {boolean} [options.quiet]  true 时不写 stderr(含启动的日志路径行),文件照写
 * @param {string}  [options.label]  日志文件名后缀;run 用模型名,run-many 用「#序号-模型名」
 * @returns {{ logPath: string, log: (line: string) => void, stop: () => void }}
 */
export function createProgress({ quiet = false, label = 'run' } = {}) {
  const startedAt = Date.now();
  const dir = runsDir();
  mkdirSync(dir, { recursive: true });

  // 文件名里的 ISO 时间把冒号和点换成横杠:跨平台文件名安全,且仍保持字典序≈时间序。
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // label 只可能来自模型名/序号,但调用方传什么不归这里管,统一白名单净化一次。
  const safeLabel = String(label).replace(/[^\p{L}\p{N}#._-]+/gu, '-') || 'run';
  const logPath = join(dir, `${stamp}-${safeLabel}.log`);
  // 先建出空文件:进度还没来时 tail 也能 stat 到这份日志,而不是"目录里什么都没有"。
  appendFileSync(logPath, '');

  const stderrWrite = (text) => {
    if (!quiet) process.stderr.write(text);
  };
  // 启动行:告诉用户这份 run 的日志写在哪,方便直接 tail -f 它。
  stderrWrite(`[agent-fleet 0s] log: ${logPath}\n`);

  let lastActivityAt = Date.now();
  const write = (line) => {
    lastActivityAt = Date.now();
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    const full = `[agent-fleet ${elapsedSec}s] ${line}`;
    stderrWrite(`${full}\n`);
    appendFileSync(logPath, `${full}\n`);
  };

  const timer = setInterval(() => {
    if (Date.now() - lastActivityAt >= STILL_WAITING_MS) write('still waiting…');
  }, STILL_WAITING_MS);
  // unref 兜底:心跳只负责报平安,不该在正常 stop() 之外把进程吊住。
  timer.unref?.();

  let stopped = false;
  return {
    logPath,
    log: write,
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
  };
}
