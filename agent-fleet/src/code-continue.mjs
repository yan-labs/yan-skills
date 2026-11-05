// Codex app-server 的续做判断：读取任务报告和工作树，提供规则判断及可注入的 JEV 裁判。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { redactEvidence } from './brief.mjs';

export const CONTINUE_PROMPT = '报告写的是部分完成。把『未完成』里授权范围内能做的步骤继续做完——包括等 runner 空闲、推送、发布、读回——不要结束回合去等；只有真正缺授权或缺必需输入的那一步才可以停。做完更新报告七节并给出提交哈希与读回结果。';

/** 读取回合结束时的实际状态；文件内容指纹能识别同一脏文件再次修改。 */
export function readContinuationState(cwd, reportPath) {
  let report = '';
  try { if (reportPath) report = readFileSync(resolve(cwd, reportPath), 'utf8'); } catch { /* 无可读报告时不猜测续做 */ }
  const conclusion = report.match(/^## 结论[^\S\r\n]*\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]?.trim().split(/\r?\n/)[0]?.replace(/^\*\*/, '') || '';
  const git = args => {
    try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch { return ''; }
  };
  const paths = [...new Set([...git(['diff', '--relative', '--name-only', 'HEAD', '-z']).split('\0'), ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')].filter(Boolean))].sort();
  // shortcut: 共享工作树里的其他人改动也算进展；需要区分作者时再加入任务归属。
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(path).update('\0');
    try { hash.update(readFileSync(resolve(cwd, path))); } catch { hash.update('missing'); }
    hash.update('\0');
  }
  return { conclusion, report, head: git(['rev-parse', 'HEAD']).trim(), files: hash.digest('hex') };
}

/** 对比相邻回合；只有连续两轮三项都没变才算停滞，报告变更也算进展。 */
export function continuationProgress(before, after) {
  const commits = before.head !== after.head;
  const files = before.files !== after.files;
  const report = before.report !== after.report;
  return { progress: commits || files || report, commits, files, report };
}

const REPORT_SECTIONS = ['规则回执', '结论', '实际执行', '改动与产物', '验证证据', '偏差', '未完成/风险/需要用户决定的事'];

/** 第一层只检查报告结构及 brief 明确要求的交付凭据，不以“完成”二字代替证据。 */
export function continuationRules(state, brief) {
  if (state.conclusion.startsWith('失败')) return [];
  const missing = [];
  if (state.conclusion.startsWith('部分完成')) missing.push('把未完成里授权范围内能做的步骤继续做完');
  for (const section of REPORT_SECTIONS) {
    if (!state.report.match(new RegExp(`^## ${section}[^\\S\\r\\n]*$`, 'm'))) missing.push(`补齐报告「${section}」`);
  }
  // 模板里的产物示例不是任务要求；只认明确交付指令，并按凭据类型排除否定要求。
  const requirements = brief.split('\n').filter(line => !/收工前对照|完成标志|^## 改动与产物|^REPORT 按/.test(line))
    .flatMap(line => line.split(/[。；;]|[，,](?=(?:不|无需|无须|禁止))/))
    .filter(clause => /要求|必须|需要|给出|给|列出|提供|包含|附上|记录|补齐|验收[：:]/.test(clause));
  const needsCommit = requirements.some(clause => /提交哈希|commit hash/i.test(clause) && !/不(?:要|用|需|必)?提交|无需提交|无须提交|禁止提交|不.*commit/i.test(clause))
    && !/不(?:要|用|需|必)?提交|无需提交|无须提交|禁止提交/.test(brief);
  const needsReadback = requirements.some(clause => /读回结果|回读结果/.test(clause) && !/不(?:要|用|需|必)?(?:读回|回读)|无需(?:读回|回读)|无须(?:读回|回读)|禁止(?:读回|回读)/.test(clause));
  if (needsCommit && !/\b[0-9a-f]{7,40}\b/i.test(state.report)) missing.push('补齐 brief 要求的提交哈希');
  if (needsReadback && !/(?:读回|回读)[^\n]*(?:通过|成功|一致|正常|published|HTTP\s*200|结果[：:]\s*\S)/i.test(state.report)) missing.push('补齐 brief 要求的实际读回结果');
  return missing;
}

/** 复用 fleet judge 的 JEV 请求；按具体验收条目/未完成项选择缺项，不要求裁判生成长文。 */
export async function judgeContinuation({ brief, report, finalReply, judge, lowConfidenceUsed = false }) {
  const requirements = brief.split('\n').filter(line => /验收|测试|提交|读回|回读|发布/.test(line)).slice(0, 60);
  const unfinished = report.split(/^## 未完成\/风险\/需要用户决定的事[^\n]*\n/m)[1]?.split(/^## /m)[0]?.split('\n').filter(line => line.trim()) ?? [];
  const checks = {
    evidence: { instructions: '报告证据是否真的满足 brief 的验收条件？选择尚未满足的具体条目；全部满足选 done。', items: requirements.length ? requirements : ['补齐 brief 尚未满足的验收条件与证据'] },
    unfinished: { instructions: '未完成项里是否还有授权范围内可做的步骤？仅缺授权或缺必需输入才可停，外部排队仍应等待。选择可继续的具体步骤；没有选 done。', items: unfinished.length ? unfinished.slice(0, 60) : ['继续完成授权范围内尚未完成的步骤'] },
    final: { instructions: '最终回复是不是中途自查或复核结论而非任务交付？是则选 interim，否则选 done。', items: ['最终回复只是中途自查或复核结论，继续完成 brief 交付'] },
  };
  const questions = Object.fromEntries(Object.entries(checks).map(([key, check]) => [key, {
    type: 'choice', instructions: check.instructions,
    criteria: { done: '该项已经满足，或仅剩缺授权/缺必需输入的步骤', ...Object.fromEntries(check.items.map((item, i) => [key === 'final' ? 'interim' : `item_${i}`, item])) },
  }]));
  try {
    // 整个请求共用证据脱敏函数，正文和抽取的选项都不能携带凭据外发。
    const payload = JSON.parse(redactEvidence({ state: { brief, report, finalReply }, questions }));
    const result = await judge(payload);
    if (!result.ok) return { decision: 'skip', confidence: null, reason: 'JEV 不可用或调用失败，沿用规则判断' };
    const answers = Object.entries(checks).map(([key]) => [key, result.answers?.[key]]);
    if (answers.some(([key, answer]) => !Object.hasOwn(questions[key].criteria, answer?.choice) || !Number.isFinite(answer?.confidence))) {
      return { decision: 'skip', confidence: null, reason: 'JEV 返回不完整，沿用规则判断' };
    }
    const confidence = Math.min(...answers.map(([, answer]) => answer.confidence));
    const missing = answers.filter(([, answer]) => answer.choice !== 'done')
      .map(([key, answer]) => payload.questions[key].criteria[answer.choice]);
    const uncertain = confidence < 0.55;
    return { decision: uncertain ? lowConfidenceUsed ? 'done' : 'continue' : missing.length ? 'continue' : 'done',
      confidence, uncertain, missing: uncertain ? ['裁判置信度不足，请对照 brief 复核交付证据并补齐缺项'] : missing,
      answers: Object.fromEntries(answers) };
  } catch {
    return { decision: 'skip', confidence: null, reason: 'JEV 不可用或调用失败，沿用规则判断' };
  }
}
