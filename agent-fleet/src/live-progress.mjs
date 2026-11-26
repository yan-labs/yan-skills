import { existsSync, openSync, closeSync, fstatSync, readSync, readFileSync } from 'node:fs';
import { redactEvidence } from './brief.mjs';

export function progressLine(line, model = 'fleet') {
  const json = line.slice(line.indexOf('{'));
  let event;
  try { event = JSON.parse(json); } catch { return null; }
  const item = event.params?.item || event.item || event;
  const kind = item.type || '';
  const input = item.input || item.rawInput || {};
  const name = item.name || item.toolName || '';
  let text, label = /codex|gpt/i.test(model) ? 'codex' : /grok/i.test(model) ? 'grok' : String(model).replace(/[^\w.-]/g, '-');
  if (/^fleet\/(park|wake|queued)$/.test(event.method || '')) {
    label = event.method.slice(6); text = { park: '等待外部条件', wake: '已唤醒', queued: '等待执行槽位' }[label];
  } else if ((event.method === 'item/started' || event.type === 'item.started') && /commandExecution|command_execution/.test(kind)) {
    text = `运行 ${item.command || ''}`;
  } else if ((event.method === 'item/started' || event.type === 'item.completed') && /fileChange|file_change/.test(kind)) {
    text = `改 ${item.changes?.map(x => x.path).join(', ') || item.path || '文件'}`;
  } else if (kind === 'tool_use' || kind === 'tool_call') {
    if (/bash|shell|command|terminal/i.test(name) || input.command) text = `运行 ${input.command || ''}`;
    else if (/edit|write|patch/i.test(name)) text = `改 ${input.file_path || input.path || '文件'}`;
    else if (/plan|todo/i.test(name)) text = '更新计划';
  } else if (/plan/i.test(kind) && /started|completed|updated/.test(event.method || event.type || '')) text = '更新计划';
  if (!text) return null;
  const safe = redactEvidence(text).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${new Date().toTimeString().slice(0, 8)} [${label}] ${safe}`.slice(0, 160);
}

export function readProgress(path, offset = 0, model = 'fleet') {
  if (!path || !existsSync(path)) return { offset, lines: [] };
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    if (offset > size) offset = 0;
    const buffer = Buffer.alloc(size - offset);
    readSync(fd, buffer, 0, buffer.length, offset);
    const end = buffer.lastIndexOf(10);
    if (end < 0) return { offset, lines: [] };
    const lines = buffer.subarray(0, end + 1).toString('utf8').split('\n').map(line => progressLine(line, model)).filter(Boolean);
    return { offset: offset + end + 1, lines };
  } finally { closeSync(fd); }
}

export function progressLimiter(write) {
  let last, repeated = 0, count = 0, omitted = 0;
  const flush = () => { if (repeated) { if (count < 300) { write(`           [progress] 同类事件另有 ${repeated} 条`); count++; } else omitted += repeated; repeated = 0; } };
  return {
    add(line) {
      const key = line.replace(/^\S+ /, '').match(/^\[[^\]]+\] (运行|改|更新计划|等待外部条件|已唤醒|等待执行槽位)/)?.[0] || line;
      if (key === last) { repeated++; return; }
      flush(); last = key;
      if (count < 300) { write(line); count++; } else omitted++;
    },
    finish() { flush(); if (omitted) write(`           [progress] 超出上限，省略 ${omitted} 条事件`); }
  };
}

export function reportProgress(path) {
  if (!path || !existsSync(path)) return [];
  try {
    return readFileSync(path, 'utf8').split('\n').filter(line => /^V\d+\s*[｜|]\s*(?:已过|未过|等外部|待下游|已回滚|不适用)/.test(line)).map(line => `${new Date().toTimeString().slice(0, 8)} [report] ${redactEvidence(line).replace(/[\r\n\t]+/g, ' ')}`.slice(0, 160));
  } catch { return []; }
}
