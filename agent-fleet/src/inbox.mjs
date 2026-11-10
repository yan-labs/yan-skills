// 运行中插话收件箱: ~/.agent-fleet/runs/<run-id>.inbox 是 JSONL,
// 每行 {type:"say"|"stop", text, at, grace?}。
// 按字节偏移读新行; fs.watch + 1 秒轮询兜底,避免漏事件。

import { appendFileSync, closeSync, existsSync, openSync, readSync, statSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runsDir } from './progress.mjs';

export function inboxPath(runId) {
  return join(runsDir(), `${runId}.inbox`);
}

/** 解析一行 JSONL。空行、非法 JSON、未知 type 都返回 null。 */
export function parseInboxLine(line) {
  const s = String(line ?? '').trim();
  if (!s) return null;
  let obj;
  try {
    obj = JSON.parse(s);
  } catch {
    return null;
  }
  if (!['say', 'stop', 'ask'].includes(obj?.type)) return null;
  const graceRaw = obj.grace;
  const grace = graceRaw === undefined || graceRaw === null ? undefined : Number(graceRaw);
  return {
    type: obj.type,
    ...(obj.type === 'ask' ? { id: obj.id, runId: obj.runId, kind: obj.kind } : {}),
    text: typeof obj.text === 'string' ? obj.text : '',
    at: typeof obj.at === 'string' ? obj.at : null,
    ...(Number.isFinite(grace) ? { grace } : {}),
  };
}

export function ensureInbox(runId) {
  const path = inboxPath(runId);
  if (!existsSync(path)) writeFileSync(path, '');
  return path;
}

/** 追加一条收件箱记录。调用方(say/stop 子命令)用。 */
export function appendInbox(runId, entry) {
  ensureInbox(runId);
  const rec = {
    type: entry.type,
    ...(entry.type === 'ask' ? { id: entry.id, runId: entry.runId, kind: entry.kind } : {}),
    text: entry.text ?? '',
    at: entry.at ?? new Date().toISOString(),
  };
  if (entry.grace != null) rec.grace = entry.grace;
  appendFileSync(inboxPath(runId), `${JSON.stringify(rec)}\n`);
  return rec;
}

/**
 * 按偏移读新行。partial 行留在 leftover 里等下次。
 * @returns {{ offset: number, leftover: string, entries: object[] }}
 */
export function readInboxSince(path, offset = 0, leftover = '') {
  if (!existsSync(path)) return { offset, leftover, entries: [] };
  const size = statSync(path).size;
  let nextOffset = offset;
  if (size < nextOffset) {
    nextOffset = 0;
    leftover = '';
  }
  if (size === nextOffset) return { offset: nextOffset, leftover, entries: [] };

  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(size - nextOffset);
    const n = readSync(fd, buf, 0, buf.length, nextOffset);
    nextOffset += n;
    const chunk = leftover + buf.subarray(0, n).toString('utf8');
    const parts = chunk.split('\n');
    const nextLeftover = parts.pop() ?? '';
    const entries = [];
    for (const line of parts) {
      const entry = parseInboxLine(line);
      if (entry) entries.push(entry);
    }
    return { offset: nextOffset, leftover: nextLeftover, entries };
  } finally {
    closeSync(fd);
  }
}

/**
 * 监听收件箱。返回 { stop, pump, hasBuffered }。
 * pump 可手动调用(result 到达时先排空再决定关不关输入流)。
 */
export function watchInbox(runId, onEntry, { pollMs = 1000 } = {}) {
  const path = ensureInbox(runId);
  let offset = 0;
  let leftover = '';
  let stopped = false;

  const pump = () => {
    if (stopped) return [];
    const result = readInboxSince(path, offset, leftover);
    offset = result.offset;
    leftover = result.leftover;
    for (const entry of result.entries) onEntry(entry);
    return result.entries;
  };

  pump();

  let watcher = null;
  try {
    watcher = watch(path, () => {
      pump();
    });
    watcher.unref?.();
  } catch {
    watcher = null;
  }

  const timer = setInterval(() => pump(), pollMs);
  timer.unref?.();

  return {
    pump,
    hasBuffered() {
      return leftover.includes('\n');
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      try {
        watcher?.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/** query() streaming input 用的 SDKUserMessage。插话用 priority:'now' 折进当前 turn。 */
export function createUserMessage(text, { priority } = {}) {
  return {
    type: 'user',
    message: { role: 'user', content: String(text ?? '') },
    parent_tool_use_id: null,
    ...(priority ? { priority } : {}),
  };
}

/**
 * 可推入后续 user 消息的 AsyncIterable。
 * close() 后 iterator 结束,query() 才会在没有更多输入时退出。
 */
export function createPromptStream(initialPrompt) {
  const queue = [createUserMessage(initialPrompt)];
  const waiters = [];
  let closed = false;

  const resolveWaiter = (result) => {
    const waiter = waiters.shift();
    if (waiter) waiter(result);
  };

  return {
    get pendingCount() {
      return queue.length;
    },
    get closed() {
      return closed;
    },
    push(text, { priority = 'now' } = {}) {
      if (closed) return false;
      const msg = createUserMessage(text, { priority });
      if (waiters.length) resolveWaiter({ value: msg, done: false });
      else queue.push(msg);
      return true;
    },
    close() {
      if (closed) return;
      closed = true;
      while (waiters.length) resolveWaiter({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
          if (closed) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve) => waiters.push(resolve));
        },
      };
    },
  };
}
