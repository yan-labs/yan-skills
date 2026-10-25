/** Shared process lock and rolling quota: all ChatGPT web probes use the same cache. */
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { isIP } from 'node:net';

export const cacheDir = join(homedir(), '.cache/rankup');
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const randomMs = (min, max, random = Math.random) => Math.round((min + random() * (max - min)) * 1000);
export function windowWait(starts, limit = 18, now = Date.now()) {
  const recent = starts.filter(t => t > now - 3600000).sort((a, b) => a - b);
  return recent.length < limit ? 0 : Math.max(0, recent[recent.length - limit] + 3600000 - now);
}
export function acquireLock(dir = cacheDir, { retainKey } = {}) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, 'chatgpt-web.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(path, JSON.stringify({ pid: process.pid, createdAt: Date.now(), ...(retainKey ? { retainKey } : {}) }), { flag: 'wx', mode: 0o600 });
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        try { if (JSON.parse(readFileSync(path, 'utf8')).pid === process.pid) unlinkSync(path); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        process.removeListener('exit', release);
      };
      // 固定四问的租约跨崩溃保留；只有同一输出目录能续接，用户要求关闭才释放。
      if (!retainKey) process.once('exit', release);
      return release;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let owner, raw;
      try { raw = readFileSync(path, 'utf8'); owner = JSON.parse(raw); } catch { /* Interrupted creation gets a grace period. */ }
      let alive = true;
      if (Number.isInteger(owner?.pid) && owner.pid > 0) {
        try { process.kill(owner.pid, 0); } catch (e) { alive = e.code !== 'ESRCH'; }
      } else {
        alive = Date.now() - statSync(path).mtimeMs < 3600000;
      }
      if (alive || (owner?.retainKey && owner.retainKey !== retainKey) || attempt) throw new Error(`ChatGPT 自动化锁冲突：${path}；PID=${owner?.pid || '未知'}，请先结束原任务。`);
      // Serialize stale cleanup, then re-read ownership; never remove a replacement lock.
      const cleanupPath = path + '.cleanup';
      let claimed = false;
      try {
        writeFileSync(cleanupPath, String(process.pid), { flag: 'wx', mode: 0o600 });
        claimed = true;
        if (readFileSync(path, 'utf8') !== raw) throw new Error('ChatGPT 锁已换主，请稍后重试。');
        unlinkSync(path);
      } catch (e) {
        if (e.code !== 'ENOENT') throw new Error('ChatGPT 过期锁清理冲突；请检查原任务与锁文件。');
      } finally { if (claimed) unlinkSync(cleanupPath); }
    }
  }
}
let releaseGlobal;
export function lockChatgpt(options) { releaseGlobal ||= acquireLock(cacheDir, options); }
export function unlockChatgpt() { releaseGlobal?.(); releaseGlobal = undefined; }

export async function reserveConversation({ limit = 18, dir = cacheDir, now = Date.now, wait = sleep, log = console.error } = {}) {
  const path = join(dir, 'chatgpt-web-starts.json');
  let starts;
  try { starts = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; starts = []; }
  if (!Array.isArray(starts) || !starts.every(Number.isFinite)) throw new Error('ChatGPT 滚动窗口记录损坏；停止，不能忽略历史配额。');
  for (;;) {
    const delay = windowWait(starts, limit, now());
    if (!delay) break;
    log(`每小时新对话上限 ${limit}：等待 ${Math.ceil(delay / 1000)} 秒后再检查空位。`);
    await wait(Math.min(delay, 60000));
  }
  starts = starts.filter(t => t > now() - 3600000);
  starts.push(now());
  writeFileSync(path, JSON.stringify(starts), { mode: 0o600 });
}
export function healthFailure({ text = '', login = false, loggedIn = false } = {}) {
  if (/验证码|captcha|verify you are human|确认您是人类/i.test(text)) return 'captcha';
  if (/too many requests|rate.?limit|usage limit|reached the limit|达到.*上限|请求过多/i.test(text)) return 'rate-limit';
  if (login) return 'auth';
  if (!loggedIn) return 'unknown';
  return null;
}
export async function checkExit(web, fetcher = fetch, log = console.error) {
  const response = await fetcher('https://api.country.is/', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('出口 IP 查询失败；暂停，不发送问题。');
  const exit = await response.json();
  if (!isIP(exit.ip) || !/^[A-Z]{2}$/.test(exit.country)) throw new Error('出口 IP/国家无法确认；暂停，不发送问题。');
  if (web.exit && web.exit.ip !== exit.ip) throw new Error(`出口 IP 变化：${web.exit.ip} → ${exit.ip}；暂停，请固定代理节点后人工续跑。`);
  if (!web.exit) log(`当前出口 IP：${exit.ip}；国家：${exit.country}（Node 进程出口）`);
  web.exit = exit;
  return exit;
}
