// 假成功检测:根据 SDK 收尾状态、是否改了文件、最终回复文本,给出一个 verdict。
// 纯函数,不读盘、不发网,方便单测。--judge 的 JEV 调用在 brief.mjs 里做完后再 overlay。

export const CONTROL_TOKEN_MARKERS = [
  '<|tool_calls_section_begin|>',
  '<|tool_call_begin|>',
  '<|tool_call_end|>',
  '<|tool_calls_section_end|>',
  '<minimax:tool_call>',
  '<tool_call>',
];

const INTRO_MARKERS = ['## 核心命令', '什么时候用', '本 Skill', '本 skill'];

export function hasControlTokens(text) {
  if (!text) return false;
  const s = String(text);
  return CONTROL_TOKEN_MARKERS.some((m) => s.includes(m));
}

/** 启发式:最终回复在复述 Skill/项目介绍,而不是任务结果。 */
export function looksLikeSkillIntro(text) {
  if (!text) return false;
  const s = String(text);
  return INTRO_MARKERS.some((m) => s.includes(m));
}

export function isEmptyResult(text) {
  return !String(text ?? '').trim();
}

/**
 * @param {object} input
 * @param {boolean} [input.ok]
 * @param {string} [input.subtype]
 * @param {string|null} [input.result]
 * @param {string} [input.error]
 * @param {boolean} [input.expectChanges]
 * @param {boolean} [input.hasNewCommits]
 * @param {boolean} [input.hasUncommittedChanges]
 * @param {number} [input.judgeConfidence]  JEV noul 的 confidence;缺省表示没跑 judge
 * @param {boolean} [input.stopped]  被本工具 stop 或外部信号打断
 * @returns {{ verdict: 'ok'|'partial'|'suspect'|'fail'|'needs-review'|'stopped', note?: string }}
 */
export function computeVerdict({
  ok = false,
  subtype = null,
  result = null,
  error = null,
  expectChanges = false,
  hasNewCommits = false,
  hasUncommittedChanges = false,
  judgeConfidence = undefined,
  stopped = false,
} = {}) {
  const hasChanges = Boolean(hasNewCommits || hasUncommittedChanges);
  const hitMaxTurns = subtype === 'error_max_turns';
  const text = result ?? '';
  const empty = isEmptyResult(text);
  const control = hasControlTokens(text);

  if (stopped) return { verdict: 'stopped', note: error || '任务被停止' };
  if (control) return { verdict: 'fail', note: '最终回复含裸 tool-call 控制 token' };
  if (error && !hitMaxTurns) return { verdict: 'fail', note: error };
  if (!ok && !hitMaxTurns) return { verdict: 'fail', note: error || '任务失败' };
  if (empty && !hitMaxTurns) return { verdict: 'fail', note: '结果为空' };

  if (looksLikeSkillIntro(text) && !hasChanges) {
    return { verdict: 'suspect', note: '最终回复像在复述 Skill/项目介绍' };
  }
  if (expectChanges && !hasChanges) {
    return { verdict: 'suspect', note: '声明需要改文件,但运行期间零提交、零改动' };
  }

  if (hitMaxTurns && hasChanges) {
    return { verdict: 'partial', note: '可能已完成' };
  }
  if (hitMaxTurns) {
    return { verdict: empty ? 'fail' : 'suspect', note: '撞到 max-turns 且没有文件改动' };
  }

  if (!ok) return { verdict: 'fail', note: error || '任务失败' };
  if (empty) return { verdict: 'fail', note: '结果为空' };

  if (typeof judgeConfidence === 'number' && judgeConfidence < 0.55) {
    return { verdict: 'needs-review', note: `JEV 置信度 ${judgeConfidence} < 0.55` };
  }

  return { verdict: 'ok' };
}

function hasEvidence(value) {
  const normalized = String(value ?? '').replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '').trim();
  return normalized !== '' && !/^(?:无|暂无|没有|n\/?a|none|略|同上|待补)$/i.test(normalized);
}

export function acceptanceResult(brief = '', report = '', yielded = null) {
  const items = new Map();
  const sections = [...brief.matchAll(/^## (?:验收|派单场景 · [^\r\n]+)[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)];
  for (const [, section] of sections) {
    for (const [, id, owner] of section.matchAll(/^[ \t]*(?:- )?(V\d+) +[^\r\n｜|]+[｜|]owner[：:] *(本单|外部[:：][^\r\n｜|]+|下游[:：][^\r\n｜|]+)(?=[｜|]|\r?$)/gm)) {
      items.set(id, owner.trim());
    }
  }
  const conclusion = report.match(/^## 结论[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
  const handoff = yielded?.type === 'handoff' || /^巡检换班[，,:：]/m.test(conclusion);
  if (handoff) return { verdict: 'ok', pending: 'handoff', unmet: [], counts: null, table: '' };
  if (!items.size) return null;
  const rows = new Map();
  const reviewComplete = /(?:只读复核|只读审查)/.test(brief) && (/^LEDGER:[ \t]*blockers=\d+[ \t]+verdict=(?:pass|fail)[ \t]*$/im.test(report) || /不可放行/.test(conclusion));
  for (const [, id, status, deviation, evidence] of conclusion.matchAll(/^[ \t]*(?:- )?(V\d+)[ \t]*[｜|][ \t]*(已过|未过|等外部|待下游|已回滚|不适用)(?:[（(]([^）)\r\n]+)[）)])?[ \t]*[｜|][ \t]*([^\s\r\n][^\r\n]*)/gm)) {
    rows.set(id, { status, evidence: evidence.trim(), ...(deviation ? { deviation } : {}) });
  }
  const rollback = /^(?:[- ]*回滚(?:条件|出口|方案)[：:] *[^\s]|授权块：[^\r\n]*deploy-prod\b)|正文没写回滚条件时，用/m.test(brief);
  const unmet = [], missing = [];
  const counts = { passed: 0, failed: 0, external: 0, downstream: 0, rolledBack: 0, na: 0, missing: 0, total: items.size };
  let pending = 'none';
  for (const [id, owner] of items) {
    const status = rows.get(id)?.status;
    if (!status) counts.missing++;
    else if (status === '已过') {
      if (owner === '本单' && !hasEvidence(rows.get(id)?.evidence)) counts.missing++;
      else counts.passed++;
    } else if (status === '未过') counts.failed++;
    else if (status === '等外部') counts.external++;
    else if (status === '待下游') counts.downstream++;
    else if (status === '已回滚') counts.rolledBack++;
    else if (status === '不适用') counts.na++;
    if (owner === '本单') {
      if (status === '未过' && !reviewComplete) unmet.push(id);
      else if (!status || status === '等外部' || status === '待下游' || (status === '已回滚' && !rollback) || (status === '已过' && !hasEvidence(rows.get(id)?.evidence))) missing.push(id);
    }
    if (status === '等外部' || (!status && owner.startsWith('外部'))) pending = 'external';
    else if ((status === '待下游' || (!status && owner.startsWith('下游'))) && pending !== 'external') pending = 'downstream';
    else if (status === '已回滚' && rollback && pending === 'none') pending = 'rolled-back';
  }
  if (yielded?.external || yielded?.type === 'park') pending = 'external';
  return {
    verdict: unmet.length ? 'partial' : missing.length ? 'needs-review' : 'ok',
    pending, unmet, counts, table: JSON.stringify([...items.keys()].sort().map(id => [id, rows.get(id)])),
  };
}

export function outcomeFor(verdict, pending = 'none') {
  if (verdict === 'stopped') return 'stopped';
  if (verdict === 'ok') return pending === 'none' ? 'complete' : pending;
  return verdict === 'partial' ? 'partial' : 'failed';
}
