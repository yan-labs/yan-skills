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
 * @returns {{ verdict: 'ok'|'partial'|'suspect'|'fail'|'needs-review', note?: string }}
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
} = {}) {
  const hasChanges = Boolean(hasNewCommits || hasUncommittedChanges);
  const hitMaxTurns = subtype === 'error_max_turns';
  const text = result ?? '';
  const empty = isEmptyResult(text);
  const control = hasControlTokens(text);

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
