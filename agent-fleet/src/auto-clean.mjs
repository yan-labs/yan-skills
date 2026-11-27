import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const protectedName = /backup|evidence|snapshot|pg_dump/i;
const active = new Set(['running', 'queued', 'parked', 'waiting', 'abnormal']);
const canonical = p => { try { return realpathSync(p); } catch { return resolve(p); } };
const overlaps = (a, b) => a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
function references(rec) {
  const result = [rec.cwd];
  if (!rec.briefPath) return result;
  // An unreadable active brief cannot establish that deletion is safe.
  const brief = readFileSync(rec.briefPath, 'utf8');
  result.push(brief);
  const meta = rec.briefPath.replace(/\.md$/, '.json');
  if (existsSync(meta)) result.push(readFileSync(meta, 'utf8'));
  return result.filter(Boolean);
}
function cwdPaths() {
  // lsof returns 1 when there are no matches; any failure is unsafe.
  const out = execFileSync('lsof', ['-n', '-d', 'cwd', '-Fn'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return out.split('\n').filter(s => s.startsWith('n/')).map(s => canonical(s.slice(1)));
}
function protectedContents(p) {
  const st = lstatSync(p);
  if (st.isSymbolicLink()) return '符号链接';
  if (!st.isDirectory()) return null;
  for (const entry of readdirSync(p)) {
    if (protectedName.test(entry) || entry === '.git') return `含受保护内容 ${entry}`;
    const reason = protectedContents(join(p, entry));
    if (reason) return reason;
  }
  return null;
}
export function autoClean(rec, records, { root = '/tmp', getCwds = cwdPaths, prune = name => execFileSync('fleet-go', ['worktree', 'prune', name], { encoding: 'utf8', stdio: 'pipe' }) } = {}) {
  const notes = [];
  const name = rec.name;
  if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) || protectedName.test(name)) return ['跳过：单名无效或受保护'];
  let refs, cwds;
  try {
    refs = records.filter(r => r.runId !== rec.runId && active.has(r.status)).flatMap(references);
    cwds = getCwds().map(canonical);
  } catch (e) { return [`跳过：无法确认在途引用或进程工作目录：${e.message}`]; }
  const safe = p => {
    const c = canonical(p);
    if (protectedName.test(p) || protectedName.test(c)) return '受保护名称';
    if (refs.some(r => r.includes(p) || r.includes(c) || [...r.matchAll(/\/(?:[^\s\"'，。；、)]+)+/g)].some(m => overlaps(canonical(m[0]), c)))) return '被在途任务引用';
    if (cwds.some(cwd => cwd === c || cwd.startsWith(c + sep))) return '有进程工作目录';
    return null;
  };
  let wt;
  try { wt = JSON.parse(readFileSync(rec.briefPath.replace(/\.md$/, '.json'), 'utf8')).worktree; } catch { /* no registered worktree */ }
  if (wt?.path && existsSync(wt.path)) {
    const reason = safe(wt.path);
    if (reason) notes.push(`跳过 worktree ${wt.path}：${reason}`);
    else try { prune(name); notes.push(`已清理 worktree ${wt.path}`); } catch (e) { notes.push(`跳过 worktree ${wt.path}：${e.message}`); }
  }
  const actualRoot = canonical(root);
  for (const entry of readdirSync(actualRoot)) {
    if (entry !== name && !entry.startsWith(name + '-')) continue;
    const p = join(actualRoot, entry);
    let reason = safe(p);
    if (!reason && wt?.path && existsSync(wt.path) && overlaps(canonical(wt.path), canonical(p))) reason = '含未清理的 worktree';
    if (!reason) { try { reason = protectedContents(p); } catch (e) { reason = `无法检查内容：${e.message}`; } }
    if (reason) notes.push(`跳过 ${p}：${reason}`);
    else { try { rmSync(p, { recursive: true }); notes.push(`已清理 ${p}`); } catch (e) { notes.push(`跳过 ${p}：${e.message}`); } }
  }
  return notes;
}
export function appendResidual(rec, notes) {
  if (!rec.reportPath || !existsSync(rec.reportPath)) return;
  appendFileSync(rec.reportPath, `\n\n残留清单：${notes.length ? notes.join('；') : '未发现本单临时目录；worktree 和进程需人工核查'}\n`);
}
export function temporaryEntries(name, root = '/tmp') {
  if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) return [];
  try { return readdirSync(root).filter(n => n === name || n.startsWith(name + '-')).map(n => join(root, n)); } catch { return []; }
}

export function finishCleanup(rec, records, options = {}) {
  if (rec.status === 'done' && rec.verdict === 'ok' && rec.pending === 'none') return autoClean(rec, records, options);
  const items = temporaryEntries(rec.name, options.root);
  appendResidual(rec, [...items, `worktree: ${rec.cwd || '未确认'}`, `进程组: ${rec.childPid || '未确认'}`]);
  return [];
}
