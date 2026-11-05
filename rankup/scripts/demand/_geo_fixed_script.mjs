/** 固定四问：Markdown 话术 + 原聊天常驻；发布回读后继续。依赖登录态 OpenCLI。
 * 验证：2026-10-25，离线 mock；真实页面状态仍须现场核对。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { lockChatgpt, unlockChatgpt, randomMs } from './_chatgpt_guard.mjs';
import { oc, sendTurn, closeSession, sleep } from './_chatgpt_web.mjs';

export function readScript(text, url) {
  return Object.fromEntries(['WHY', 'GAPS', 'FRESH-LOOK', 'REVIEW'].map(key => {
    const headings = [...text.matchAll(new RegExp('^### ' + key + '[ \t]*\r?$', 'gm'))];
    const section = headings.length === 1 ? text.slice(headings[0].index + headings[0][0].length).split(/^### /m)[0] : '';
    const blocks = [...section.matchAll(/^```text\r?\n([\s\S]*?)\r?\n```/gm)];
    if (blocks.length !== 1 || !blocks[0][1].trim()) throw new Error(`话术文件需唯一非空 ### ${key} text 代码块`);
    return [key, blocks[0][1].replaceAll('〔网址〕', url)];
  }));
}
export function reviewLinks(value, domain) {
  if (value?.published !== true || !value.version?.trim() || !value.readback?.trim() || !Array.isArray(value.links) || !value.links.length) throw new Error('review.json 需 published:true、version、readback 和非空 links；仅在整改发布并回读后填写');
  for (const link of value.links) {
    const u = new URL(link);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || (u.hostname !== domain && !u.hostname.endsWith('.' + domain))) throw new Error('复看链接必须是本站无凭据 HTTP(S) URL');
  }
  return value.links;
}
export async function waitForLock({ lock = lockChatgpt, wait = sleep, now = Date.now, timeoutMs = 3600000 } = {}) {
  const deadline = now() + timeoutMs;
  for (;;) {
    try { lock(); return; } catch (e) {
      if (!/锁冲突|锁已换主|过期锁清理冲突/.test(e.message) || now() >= deadline) throw e;
      console.error('共享锁由其他任务持有，30 秒后重查；不删除活锁。');
      await wait(Math.min(30000, Math.max(0, deadline - now())));
    }
  }
}
export async function runFixedScript({ args, numbers, domain, url, prompts }) {
  if (args.pitch || args['pitch-file'] || args['no-pitch'] || args.recheck || args.smoke) throw new Error('--script-file 不与旧 pitch/recheck/smoke 模式混用');
  const text = readFileSync(args['script-file'], 'utf8');
  const script = readScript(text, url);
  const out = resolve(args.out), summary = join(out, 'summary.json');
  const planKey = { domain, url, prompts, reps: numbers.reps, round: numbers.round, script: text };
  let data;
  if (existsSync(summary)) {
    if (!args.resume) throw new Error('输出已存在；请用 --resume 或新目录。');
    data = JSON.parse(readFileSync(summary, 'utf8'));
    if (JSON.stringify(data.planKey) !== JSON.stringify(planKey)) throw new Error('续跑参数与原计划不一致');
  } else if (args.resume) throw new Error('续跑目录缺 summary.json');
  const count = prompts.length * numbers.reps;
  if (count > numbers['max-conversations']) throw new Error('固定模式需完整保留本轮聊天；请显式调大 --max-conversations 或减少本轮问法/重复数');
  if (args.plan) {
    console.log(JSON.stringify({ mode: 'fixed-script-plan', conversations: count, turns: ['OPEN', 'WHY', 'GAPS'], afterPublished: ['FRESH-LOOK', 'REVIEW'], script, retains: '页面、会话、共享锁，直到用户明确关闭', network: false }));
    return;
  }
  const { defaultSession } = await import(pathToFileURL(join(homedir(), '.agents/skills/opencli/scripts/opencli-core.mjs')));
  mkdirSync(out, { recursive: true });
  await waitForLock({ lock: () => lockChatgpt({ retainKey: out }) });
  process.env.AI_PROBE_WEB_WINDOW = 'dedicated';
  data ||= { planKey, mode: 'fixed-script', status: 'running', samples: [], startedAt: new Date().toISOString() };
  const save = () => {
    writeFileSync(summary + '.tmp', JSON.stringify(data, null, 2) + '\n');
    renameSync(summary + '.tmp', summary);
    writeFileSync(join(out, 'summary.md'), ['# 固定四问记录', `状态：${data.status}`, `停止原因：${data.stopReason || '无'}`, '自然推荐仅核对 OPEN 原回答；推荐清单和读页自陈待人工核实，不自动推断。', ...data.samples.flatMap(s => [`## ${s.id} · ${s.web.session}`, ...s.turns.map(t => `### ${t.stage}\n${t.prompt}\n\n${t.answer || ''}`)])].join('\n\n') + '\n');
  };
  const closing = () => existsSync(join(out, 'close.json')) && JSON.parse(readFileSync(join(out, 'close.json'), 'utf8')).userRequested === true;
  // shortcut: 临时页丢失不自动重建，核实丢失后由调用方按文档记录偏差并恢复。
  const ask = async (sample, stage, prompt) => {
    if (sample.turns.some(t => t.stage === stage && t.ok)) return;
    if (sample.turns.some(t => !t.ok)) throw new Error('存在未确认发送结果；先人工核对原聊天，避免重复发送。');
    if (sample.turns.length) await sleep(randomMs(numbers['followup-min'], numbers['followup-max']));
    const turn = { stage, prompt, ok: false, failure: 'pending' };
    sample.turns.push(turn); save();
    Object.assign(turn, await sendTurn({ prompt, timeoutS: 150, web: sample.web, continuation: sample.web.opened, natural: true }));
    save();
    if (!turn.ok) throw new Error(`${sample.id} ${stage}: ${turn.failure}；${turn.error || ''}`);
  };
  try {
    const doctor = oc(['doctor'], { timeoutS: 30 });
    if (doctor.status !== 0 || !['Daemon', 'Extension', 'Connectivity'].every(x => new RegExp(`\\[OK\\] ${x}:`).test(doctor.stdout))) throw new Error('opencli doctor 未通过');
    data.status = 'running'; delete data.stopReason; save();
    for (const [p, prompt] of prompts.entries()) for (let rep = 1; rep <= numbers.reps; rep++) {
      const id = `${p + 1}-${rep}`;
      let sample = data.samples.find(s => s.id === id);
      if (!sample) {
        if (data.samples.length) await sleep(randomMs(numbers['sample-min'], numbers['sample-max']));
        sample = { id, prompt, turns: [], web: { session: defaultSession('geo-fixed-' + id), opened: false, keepAlive: true, strictKeepAlive: true, fixedScript: true, hourlyLimit: numbers['hourly-limit'] } };
        if (data.samples.some(s => s.web.session === sample.web.session)) throw new Error('OpenCLI 会话名冲突；停止，避免覆盖原聊天');
        data.samples.push(sample); save();
      }
      for (const [stage, question] of [['OPEN', prompt], ['WHY', script.WHY], ['GAPS', script.GAPS]]) await ask(sample, stage, question);
    }
    data.status = 'awaiting-publish'; save();
    console.error(`前三问完成；保持所有页面和共享锁。发布回读后写 ${join(out, 'review.json')}；只有用户要求关闭时写 close.json {"userRequested":true}。`);
    while (!existsSync(join(out, 'review.json'))) {
      if (closing()) break;
      await sleep(1000);
    }
    if (!closing() && existsSync(join(out, 'review.json'))) {
      const review = JSON.parse(readFileSync(join(out, 'review.json'), 'utf8'));
      const links = reviewLinks(review, domain); data.publish = review; data.status = 'reviewing'; save();
      const fresh = script['FRESH-LOOK'].replaceAll('{changed_page_urls}', links.join('\n'));
      for (const sample of data.samples) {
        await ask(sample, 'FRESH-LOOK', fresh);
        await ask(sample, 'REVIEW', script.REVIEW);
      }
      data.status = 'completed-retained'; save();
    }
  } catch (e) {
    data.status = 'stopped-retained'; data.stopReason = e.message; process.exitCode = 1; save();
    console.error(e.message + '；保留页面与锁，等待用户关闭指令。');
  }
  for (;;) {
    if (existsSync(join(out, 'close.json'))) {
      const command = JSON.parse(readFileSync(join(out, 'close.json'), 'utf8'));
      if (command.userRequested === true) break;
    }
    await sleep(1000);
  }
  for (const sample of data.samples) if (sample.web.opened) {
    if (closeSession(sample.web).status !== 0) { data.stopReason = '用户要求关闭但关闭失败；保留锁'; save(); throw new Error(data.stopReason); }
  }
  data.closedByUser = true; save(); unlockChatgpt();
}
