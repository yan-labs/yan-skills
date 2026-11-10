// Codex app-server 的续做判断：读取任务报告和工作树，提供规则判断及可注入的 JEV 裁判。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { redactEvidence } from './brief.mjs';

export const CONTINUE_PROMPT = '报告写的是部分完成。把『未完成』里授权范围内能做的步骤继续做完——包括等 runner 空闲、推送、发布、读回——不要结束回合去等；只有真正缺授权或缺必需输入的那一步才可以停。做完更新报告七节并给出提交哈希与读回结果。';

/** 读取回合结束时的实际状态；文件内容指纹能识别同一脏文件再次修改。 */
export function readContinuationState(cwd, reportPath, brief = '') {
  let report = '';
  try { if (reportPath) report = readFileSync(resolve(cwd, reportPath), 'utf8'); } catch { /* 无可读报告时不猜测续做 */ }
  const conclusion = report.match(/^## 结论[^\S\r\n]*\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]?.trim().split(/\r?\n/)[0]?.replace(/^\*\*/, '') || '';
  const git = args => {
    try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch { return ''; }
  };
  const paths = [...new Set([...git(['diff', '--relative', '--name-only', 'HEAD', '-z']).split('\0'), ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')].filter(Boolean))].sort();
  const declared = brief.match(/^产物清单：\n(?:- .*\n)*/m)?.[0] || '';
  for (const line of declared.split('\n')) {
    const path = line.match(/^- .*?[：:]\s*([^\s（(]+)/)?.[1];
    if (path && !paths.includes(path)) paths.push(path);
  }
  paths.sort();
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

function hasCarriedCommit(brief, report, cwd) {
  const lines = brief.split('\n').filter(line => /续接|上一轮|上轮/.test(line) && /提交/.test(line));
  const reported = report.match(/\b[0-9a-f]{7,40}\b/gi) || [];
  for (const hash of lines.flatMap(line => line.match(/\b[0-9a-f]{7,40}\b/gi) || [])) {
    try {
      const full = execFileSync('git', ['rev-parse', '--verify', `${hash}^{commit}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (!reported.some(value => full.startsWith(value.toLowerCase()))) continue;
      execFileSync('git', ['merge-base', '--is-ancestor', full, 'HEAD'], { cwd, stdio: 'ignore' });
      return true;
    } catch { /* 不存在或不在当前历史中的提交不算 */ }
  }
  return false;
}

/** 第一层只检查报告结构及 brief 明确要求的交付凭据，不以“完成”二字代替证据。 */
export function continuationRules(state, brief, cwd = process.cwd(), initial = null) {
  if (state.conclusion.startsWith('失败')) return [];
  const missing = [];
  if (state.conclusion.startsWith('未完成')) missing.push('完成报告中未完成的任务');
  for (const line of brief.match(/^产物清单：\n(?:- .*\n)*/m)?.[0].split('\n').slice(1) ?? []) {
    const path = line.match(/^- .*?[：:]\s*([^\s（(]+)/)?.[1];
    if (path && !existsSync(resolve(cwd, path))) missing.push(`缺少文件：${path}`);
  }
  for (const section of REPORT_SECTIONS) {
    if (!state.report.match(new RegExp(`^## ${section}[^\\S\\r\\n]*$`, 'm'))) missing.push(`补齐报告「${section}」`);
  }
  // 模板里的产物示例不是任务要求；只认明确交付指令，并按凭据类型排除否定要求。
  const requirements = brief.split('\n').filter(line => !/收工前对照|完成标志|^## 改动与产物|^REPORT 按/.test(line))
    .flatMap(line => line.split(/[。；;]|[，,](?=(?:不|无需|无须|禁止))/))
    .filter(clause => /要求|必须|需要|给出|给|列出|提供|包含|附上|记录|补齐|验收[：:]/.test(clause));
  const deliverables = brief.match(/^产物清单：\n(?:- .*\n)*/m)?.[0];
  const auth = brief.match(/## 授权覆盖\n([\s\S]*?)(?=\n## |$)/)?.[1] || '';
  const commitAuth = /允许在本地分支提交|发布全流程/.test(auth);
  const needsCommit = (deliverables ? /提交|commit/i.test(deliverables) : commitAuth || requirements.some(clause => /提交哈希|commit hash|(?:本地)?提交(?:一次|代码|改动|并)/i.test(clause) && !/不(?:要|用|需|必)?提交|无需提交|无须提交|禁止提交|不.*commit/i.test(clause))
    && !/不(?:要|用|需|必)?提交|无需提交|无须提交|禁止提交/.test(brief));
  const needsReadback = requirements.some(clause => /读回结果|回读结果/.test(clause) && !/不(?:要|用|需|必)?(?:读回|回读)|无需(?:读回|回读)|无须(?:读回|回读)|禁止(?:读回|回读)/.test(clause));
  if (commitAuth && initial && /^(?:部分完成|未完成)/.test(state.conclusion) && state.head === initial.head && !hasCarriedCommit(brief, state.report, cwd)) missing.push('缺少实现改动和提交');
  if (needsCommit && !/\b[0-9a-f]{7,40}\b/i.test(state.report)) missing.push('补齐 brief 要求的提交哈希');
  if (needsReadback && !/(?:读回|回读)[^\n]*(?:通过|成功|一致|正常|published|HTTP\s*200|结果[：:]\s*\S)/i.test(state.report)) missing.push('补齐 brief 要求的实际读回结果');
  return missing;
}

/** JEV 只判断明确缺失的硬性产物；不因证据可补充或置信度低续做。 */
export async function judgeContinuation({ brief, report, finalReply, judge }) {
  const questions = { deliverable: {
    type: 'choice',
    instructions: '仅当明确缺少 brief 要求的文件、报告必需节、提交哈希或读回结果时选对应项；覆盖未穷尽、可补证、未确认或只是部分完成都选 done。无法确定也选 done。',
    criteria: { done: '没有明确缺失的硬性产物', file: '缺少 brief 要求的文件', section: '缺少报告必需节', commit: '缺少要求的提交哈希', readback: '缺少要求的读回结果' },
  } };
  try {
    const payload = JSON.parse(redactEvidence({ state: { brief, report, finalReply }, questions }));
    const result = await judge(payload);
    const answer = result.answers?.deliverable;
    if (!result.ok || !Object.hasOwn(questions.deliverable.criteria, answer?.choice) || !Number.isFinite(answer?.confidence))
      return { decision: 'skip', confidence: null, reason: 'JEV 不可用或返回不完整' };
    if (answer.confidence < 0.55 || answer.choice === 'done') return { decision: 'done', confidence: answer.confidence };
    return { decision: 'continue', confidence: answer.confidence, missing: [questions.deliverable.criteria[answer.choice]] };
  } catch {
    return { decision: 'skip', confidence: null, reason: 'JEV 不可用或调用失败' };
  }
}
