#!/usr/bin/env node
// 验证 JEV 作为 OpenCLI 动作选择器：state -> JEV choice 选下一步 ref -> opencli click -> 循环
// 用法: node jev-step-demo.mjs <session> <startUrl> "<goal>" [maxSteps]
// 密钥只从 TYPESAFE_API_KEY 读取，不打印。
import { execFileSync } from 'node:child_process';

const [session, startUrl, goal, maxStepsArg] = process.argv.slice(2);
const maxSteps = Number(maxStepsArg ?? 4);
const key = process.env.TYPESAFE_API_KEY;
if (!key) { console.error('TYPESAFE_API_KEY missing'); process.exit(78); }
const env = { ...process.env, OPENCLI_WINDOW: process.env.OPENCLI_WINDOW ?? 'isolated', NODE_NO_WARNINGS: '1' };

function oc(...args) {
  return execFileSync('opencli', ['browser', session, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function parseState(text) {
  const url = (text.match(/^url:\s*(\S+)/m) || [])[1];
  const title = (text.match(/^title:\s*(.+)$/m) || [])[1];
  const refs = [];
  for (const m of text.matchAll(/\[(\d+)\]<(\w+)([^>]*)>([^<\n]*)/g)) {
    const href = (m[3].match(/href=(\S+)/) || [])[1];
    refs.push({ ref: m[1], tag: m[2], text: m[4].trim(), href });
  }
  return { url, title, refs };
}

async function jev(state, questions) {
  const t0 = Date.now();
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'jev-latest', state, questions }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`JEV HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return { ...body, ms: Date.now() - t0 };
}

const log = [];
oc('open', startUrl);
let totalIn = 0;
for (let step = 1; step <= maxSteps; step++) {
  const page = parseState(oc('state'));
  const options = {};
  for (const r of page.refs.slice(0, 250)) {
    options[`ref_${r.ref}`] = `${r.tag} "${r.text || '(no text)'}"${r.href ? ` -> ${r.href}` : ''}`;
  }
  options.DONE = 'The goal is already satisfied by the current page; stop.';
  const state = { goal, current_page: { url: page.url, title: page.title } };
  const ans = await jev(state, {
    next: {
      type: 'choice',
      instructions: 'You are operating a web browser. Pick the single next element to click that makes the most progress toward `goal`, or DONE if the current page already satisfies the goal.',
      criteria: options,
    },
    done: { type: 'noul', instructions: 'Does `current_page` already satisfy `goal`?' },
  });
  totalIn += ans.usage?.input_tokens ?? 0;
  const a = ans.answers.next;
  const top = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]).slice(0, 3)
    .map(([k, p]) => `${k}=${p.toFixed(2)}`).join(' ');
  const entry = { step, url: page.url, title: page.title, options: Object.keys(options).length, choice: a.choice, confidence: +a.confidence.toFixed(2), done_p: +ans.answers.done.noul.toFixed(2), top3: top, jev_ms: ans.ms, in_tokens: ans.usage?.input_tokens };
  log.push(entry);
  console.log(JSON.stringify(entry));
  if (a.choice === 'DONE' || ans.answers.done.noul > 0.8) break;
  if (a.confidence < 0.3) { console.log(JSON.stringify({ step, stop: 'low confidence, hand back to agent' })); break; }
  oc('click', a.choice.replace('ref_', ''));
  oc('wait', 'time', '2');
}
const final = parseState(oc('state'));
console.log(JSON.stringify({ final_url: final.url, final_title: final.title, steps: log.length, total_input_tokens: totalIn }));
