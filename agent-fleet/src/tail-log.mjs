// tail 子命令的核心:找 ~/.agent-fleet/runs 下最新的进度日志,把内容打印出来;
// --follow 时持续轮询新增内容,直到出现 done ok / done error 行——runTask 在任务收尾
// 时(包括失败路径)必然写这一行,所以它就是"这次 run 结束了"的可靠信号。

import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

import { runsDir } from './progress.mjs';

/** 结束行判定:日志行形如 `[agent-fleet 12s] done ok cost=$0.0012`。 */
const DONE_LINE_RE = /\] done (ok|error)(\s|$)/;
const POLL_MS = 500;

/** 目录下 mtime 最新的 .log 文件;目录不存在或没有日志时返回 null。 */
export function latestRunLogPath() {
  const dir = runsDir();
  if (!existsSync(dir)) return null;
  let best = null;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.log')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (!best || st.mtimeMs > best.mtimeMs) best = { path: p, mtimeMs: st.mtimeMs };
  }
  return best ? best.path : null;
}

/**
 * 打印最新日志;follow 时持续追加新内容直到出现 done 行。
 *
 * @param {object} [options]
 * @param {boolean}  [options.follow]  持续跟随输出
 * @param {(s:string)=>void} [options.out] 输出函数(默认 stdout,测试可注入)
 * @param {number}   [options.pollMs]  follow 模式的轮询间隔
 * @returns {Promise<{ok:boolean, path?:string, reachedDone?:boolean, error?:string}>}
 */
export async function tailLatestLog({ follow = false, out = process.stdout.write.bind(process.stdout), pollMs = POLL_MS } = {}) {
  const path = latestRunLogPath();
  if (!path) {
    return { ok: false, error: `在 ${runsDir()} 下没有找到任何日志文件(先跑一次 run / run-many 才会有日志)。` };
  }

  const fd = openSync(path, 'r');
  // StringDecoder 保住跨轮询边界被劈开的多字节字符(assistant 文本里中文很常见)。
  const decoder = new StringDecoder('utf8');
  let offset = 0;
  let seenDone = false;
  let allText = '';

  const pump = () => {
    const size = statSync(path).size;
    if (size < offset) offset = 0; // 文件被截断/重建,从头再来
    if (size === offset) return;
    const buf = Buffer.alloc(size - offset);
    const n = readSync(fd, buf, 0, buf.length, offset);
    offset += n;
    const chunk = decoder.write(buf.subarray(0, n));
    allText += chunk;
    out(chunk);
    if (DONE_LINE_RE.test(allText)) seenDone = true;
  };

  try {
    pump(); // 先把已有内容全部吐出来
    if (!follow || seenDone) return { ok: true, path, reachedDone: seenDone };
    while (!seenDone) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      pump();
    }
    return { ok: true, path, reachedDone: true };
  } finally {
    closeSync(fd);
  }
}
