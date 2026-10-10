import { readdirSync, readFileSync } from 'node:fs';

const blocks = new URL('../skill/templates/blocks/', import.meta.url);
const values = { NAME: 'text-check', REPORT: '/tmp/text-check.md', BUDGET: '$1', DATE: '2026-10-10', OUTDIR: '/tmp/text-check/' };
const templates = readdirSync(blocks).filter(name => name.endsWith('.md')).sort().map(name =>
  readFileSync(new URL(name, blocks), 'utf8').trim().replace(/\{([A-Z]+)\}/g, (_, key) => values[key]));
const task = '归类：Gemini 文本任务；理由：核对措辞\nREPORT: /tmp/text-check.md\n## 目标\n请阅读材料并逐条核对措辞是否有依据。';

export const geminiBriefCases = [
  { text: task + '\n' + templates.join('\n\n'), blocked: false },
  { text: [...templates].reverse().join('\n\n') + '\n' + task, blocked: false },
  { text: (templates.join('\n\n') + '\n' + task).replaceAll('\n', '\r\n'), blocked: false },
  ...['修改某文件', '写代码', '实现 UI', 'implement the code', '归类：编码', '归类：code', 'UI', '前端实现'].map(text => ({
    text: task + '\n' + templates.join('\n\n') + '\n## 允许读写/禁止\n' + text, blocked: true,
  })),
  { text: task + '\n' + templates.join('\n\n'), expectChanges: true, blocked: true },
];
