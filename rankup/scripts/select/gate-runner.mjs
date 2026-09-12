#!/usr/bin/env node
/**
 * 用途：七道闸门选品流程的编排器 + 决策记录器。
 *
 *   背景：6 轮工具站选品调研全部失败之后定下的新流程——0 硬约束 / 1 使用频次 /
 *   2 痛点证据 / 3 付费信号 / 4 护城河 / 5 获客可行性 / 6 量化验证，逐道过，
 *   一道杀就立即停，不跑完剩下的闸门（早杀省钱是这套流程的全部意义）。
 *
 *   这个脚本**不代替人做判断**。闸门 0/1/4/5 是纯人工判断闸门：脚本只打印判据
 *   和检查清单、接收人给出的判定（--pass/--kill）和理由（--reason，必填）、
 *   写进决策文件——脚本自己绝不会替这四道闸门猜一个"过"或"杀"。
 *   闸门 2/3/6 是半自动闸门：--auto 负责调用 scripts/demand/*.mjs 取证据，
 *   证据只是原始 stdout/stderr 落盘 + 记进决策文件，**不做任何阈值判断**——
 *   最终仍然要人看过证据后自己跑 --pass/--kill。
 *
 *   一旦某道闸门被 --kill，候选记录立即锁死（status='killed'）：后续 gate
 *   命令（无论是终判还是 --auto 取证）一律拒绝执行，报错说明死于哪一道、
 *   死因是什么。闸门也必须按 0→6 顺序推进，不能跳过——这两条都是脚本强制的
 *   硬约束，不是文档里写写的建议。
 *
 * 依赖：无外部依赖（Node 内置 fs/path/crypto/child_process），复用同仓库
 *       scripts/demand/_lib.mjs 的 parseArgs/die/printTable（只读 import，
 *       不修改 demand/ 下任何文件）。
 *
 * 决策记录落盘位置：默认 <调用方 cwd>/.rankup/selection/，可用 --dir 覆盖。
 *   每个候选一个 <slug>.json（机器读，全量字段）+ 一个 <slug>.md（人读，
 *   表格化的闸门进度）。--auto 的原始子进程输出落在
 *   <dir>/<slug>/evidence/gate<N>-<script>-<时间戳>.std{out,err}.txt。
 *
 * 已知的设计偏离（相对任务给的 CLI 建议，在这里显式说明，不是随手改的）：
 *   - `gate <N>` 没有走"当前候选"隐藏状态，而是要求显式 `--candidate`。
 *     原因：这套流程本来就该多个候选并行跑（甚至可能被多个 subagent 并发调用），
 *     一个隐藏的"当前候选"指针会在并发下互相覆盖，比多打一个 --candidate 更危险。
 *   - `--auto` 必须显式给 `--script`，不做"闸门 3 自动选一个数据源"的隐式行为——
 *     闸门 2/3/6 的建议脚本都不止一个，隐式选择会让人不知道证据到底来自哪条链路。
 *
 * 已验证：--help / --self-test 已跑通；init→gate 0/1/2(--auto --dry-run)→
 *   gate 2 --kill→report 的假候选全流程已用 --dry-run 实跑验证（不联网），
 *   见对话里贴的命令记录。未做任何真实联网调用。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { parseArgs, asList, die, printTable } from '../demand/_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEMAND_DIR = path.resolve(HERE, '../demand');
const DEFAULT_DIR = '.rankup/selection';

// ── 七道闸门定义（判据文本照抄任务给的表格，不重新措辞）──────────────────────

export const GATES = [
  {
    id: 0, name: '硬约束', judgment: 'human',
    criteria: '逐条对照约束清单，撞一条即出局',
    checklist: [
      '零人工成本：上线后运营/审核/答疑是否需要人工介入？',
      '自助 SaaS/Credit 付费：用户能否不联系任何人就完成购买？',
      '一人可建可维护：技术栈、内容量、迭代节奏一个人扛得住吗？',
      'SEO 驱动获客：主要流量入口是不是自然搜索，而不是地推/销售/合作？',
      '无客服：是否需要人工客服座席？',
      '不买量：验证与冷启动阶段是否需要自己砸钱投广告？（只能读别人的买量数据当信号，不能自己买）',
    ],
  },
  {
    id: 1, name: '使用频次', judgment: 'human',
    criteria: '每天/每周→过；一年几次→杀；几年一次→立即杀',
    checklist: [
      '目标用户对这件事的真实使用频率大概是？（每天/每周/每月/一年几次/几年一次）',
      '这个频率判断有没有证据支撑（不是拍脑袋猜的）？',
      '频率是否高到能撑起复访和付费习惯？',
    ],
  },
  {
    id: 2, name: '痛点证据', judgment: 'semi-auto',
    criteria: '抱怨句式搜 Reddit/X/YT；<3 个独立的人说同一件事→杀',
    suggestedScripts: ['reddit-wishes', 'hn-signals', 'chrome-ext-gap', 'reviews-mine'],
  },
  {
    id: 3, name: '付费信号', judgment: 'semi-auto',
    criteria: 'CPC + 意图分类；这批人在不在为笨办法付钱',
    suggestedScripts: ['keyword-value', 'stripe-referring', 'freelance-demand', 'payment-referrers'],
  },
  {
    id: 4, name: '护城河', judgment: 'human',
    criteria: 'AI 工厂两周能不能复制？能→杀',
    checklist: [
      '核心壁垒是什么（数据、网络效应、集成深度、专有内容、切换成本……还是没有）？',
      '一个熟练用 AI 辅助开发的团队，两周内能不能做出功能等价的替代品？',
      '如果能，两周内能不能建立起足够的先发优势（先发用户/内容资产/域名权重）？',
    ],
  },
  {
    id: 5, name: '获客可行性', judgment: 'human',
    criteria: '只能靠人工运营→与约束冲突→杀',
    checklist: [
      '目标用户能否通过 SEO/内容/自然搜索找到你，而不需要地推/电话销售/线下渠道？',
      '冷启动阶段是否需要人工逐个拉新？（与"无客服/零人工成本"约束冲突）',
      '获客成本能否随时间被内容资产摊薄，而不是持续的边际成本？',
    ],
  },
  {
    id: 6, name: '量化验证', judgment: 'semi-auto',
    criteria: '两条独立路径互证 + 亲眼看 SERP + Semrush 打 3 折',
    suggestedScripts: ['ads-transparency', 'appstore-charts', 'gplay-charts', 'stripe-referring', 'site-network', 'sitemap-diff'],
    humanSteps: ['亲眼看一遍目标关键词的 SERP（人工，脚本不代劳）', 'Semrush 给的数字打 3 折再作为参考（人工换算，脚本不代劳）'],
  },
];

export const GATE_IDS = GATES.map((g) => g.id);
const GATE_BY_ID = Object.fromEntries(GATES.map((g) => [g.id, g]));

export const STATUS_LABEL = {
  pending: '待定', pass: '通过', kill: '判杀',
  in_progress: '进行中', killed: '已判杀', passed_all: '全部通过',
};

// ── 纯函数：slug / 记录结构 / 状态机 / 渲染（自测只测这一段，离线可跑）──────

/** 候选名 → 文件名安全的 slug。保留任意文字的字母数字（含中日韩），
 * 结尾永远挂 6 位 sha1 短哈希——slugify 后可能撞车的名字，哈希不会撞。 */
export function slugify(name) {
  const raw = String(name ?? '').trim();
  const base = raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'candidate';
  const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 6);
  return `${base}-${hash}`;
}

/** 新建一份空白候选决策记录（内存对象，落盘由调用方做）。 */
export function newRecord(candidateName) {
  const now = new Date().toISOString();
  const gates = {};
  for (const g of GATES) {
    gates[g.id] = {
      id: g.id, name: g.name, judgment: g.judgment,
      status: 'pending', reason: null, evidenceLinks: [], auto: [], decidedAt: null,
    };
  }
  return {
    candidate: String(candidateName ?? '').trim(),
    slug: slugify(candidateName),
    createdAt: now, updatedAt: now,
    status: 'in_progress', killedAtGate: null, killReason: null,
    gates,
  };
}

/** 下一道该做的闸门 id；7 道全 pass 返回 null。 */
export function nextPendingGate(record) {
  for (const g of GATES) if (record.gates[g.id].status !== 'pass') return g.id;
  return null;
}

/** 能否对 gateId 记录终判（--pass/--kill）：候选未锁死，且轮到这一道。 */
export function assertCanDecide(record, gateId) {
  if (record.status === 'killed') {
    throw new Error(
      `候选已在闸门 ${record.killedAtGate}（${GATE_BY_ID[record.killedAtGate].name}）判杀，流程已终止：` +
      `${record.killReason}\n不能再记录闸门 ${gateId} 的判定——这正是"一杀就停"的设计。`);
  }
  if (record.status === 'passed_all') throw new Error('候选已通过全部 7 道闸门，流程已结束，没有下一道闸门可判。');
  const expect = nextPendingGate(record);
  if (expect !== gateId) {
    throw new Error(`闸门顺序错误：下一道该做的是闸门 ${expect}（${GATE_BY_ID[expect].name}），不是闸门 ${gateId}。闸门必须按 0→6 顺序推进，不能跳过。`);
  }
}

/** 能否对 gateId 跑 --auto 取证（不终判）：候选未锁死、轮到这一道、且这道是半自动闸门。 */
export function assertCanAuto(record, gateId) {
  if (record.status === 'killed') {
    throw new Error(`候选已在闸门 ${record.killedAtGate} 判杀，流程已终止，不再为任何闸门跑 --auto 取证（省配额）。`);
  }
  if (record.status === 'passed_all') throw new Error('候选已通过全部 7 道闸门，流程已结束。');
  const expect = nextPendingGate(record);
  if (gateId !== expect) {
    throw new Error(`闸门顺序错误：当前该做的是闸门 ${expect}，--auto 不能提前跑闸门 ${gateId}（避免在还没轮到的闸门上先烧配额）。`);
  }
  const g = GATE_BY_ID[gateId];
  if (g.judgment !== 'semi-auto') {
    throw new Error(
      `闸门 ${gateId}（${g.name}）是人工判断闸门，没有半自动脚本可跑。` +
      `请看判据和检查清单后直接：gate ${gateId} --candidate "..." --pass/--kill --reason "..."（可用 --evidence 附证据链接）。`);
  }
}

/** 记录一次终判，就地修改 record 并返回它。抛异常时 record 不变（校验在改之前做）。 */
export function applyDecision(record, gateId, { outcome, reason, evidenceLinks = [] }) {
  assertCanDecide(record, gateId);
  if (outcome !== 'pass' && outcome !== 'kill') throw new Error(`outcome 只能是 'pass' 或 'kill'，收到「${outcome}」`);
  if (!reason || !String(reason).trim()) throw new Error('必须提供 --reason（判定理由不能为空——留痕是这个脚本存在的全部意义）。');
  const now = new Date().toISOString();
  const g = record.gates[gateId];
  g.status = outcome;
  g.reason = String(reason).trim();
  g.evidenceLinks = [...g.evidenceLinks, ...evidenceLinks];
  g.decidedAt = now;
  record.updatedAt = now;
  if (outcome === 'kill') {
    record.status = 'killed';
    record.killedAtGate = gateId;
    record.killReason = g.reason;
  } else if (nextPendingGate(record) === null) {
    record.status = 'passed_all';
  }
  return record;
}

/** 追加一条 --auto 取证记录（不改变 status/reason）。 */
export function appendAutoEvidence(record, gateId, entry) {
  assertCanAuto(record, gateId);
  record.gates[gateId].auto.push(entry);
  record.updatedAt = new Date().toISOString();
  return record;
}

/** 渲染成人读 Markdown。纯函数，不做任何文件 I/O。 */
export function renderMarkdown(record) {
  const L = [];
  L.push(`# 选品候选：${record.candidate}`);
  L.push('');
  L.push(`- slug: \`${record.slug}\``);
  const statusLine = record.status === 'killed'
    ? `**${STATUS_LABEL.killed}**（闸门 ${record.killedAtGate}：${GATE_BY_ID[record.killedAtGate].name}）`
    : `**${STATUS_LABEL[record.status] ?? record.status}**`;
  L.push(`- 状态: ${statusLine}`);
  L.push(`- 创建: ${record.createdAt}`);
  L.push(`- 更新: ${record.updatedAt}`);
  L.push('');
  L.push('| 闸门 | 名称 | 判断方式 | 状态 | 理由 | 判定时间 |');
  L.push('|---|---|---|---|---|---|');
  for (const g of GATES) {
    const gg = record.gates[g.id];
    const reason = gg.reason ? gg.reason.replace(/\|/g, '\\|').replace(/\n/g, ' ') : '—';
    L.push(`| ${g.id} | ${g.name} | ${g.judgment === 'human' ? '人工' : '半自动'} | ${STATUS_LABEL[gg.status] ?? gg.status} | ${reason} | ${gg.decidedAt ?? '—'} |`);
  }
  L.push('');
  for (const g of GATES) {
    const gg = record.gates[g.id];
    if (gg.status === 'pending' && !gg.auto.length) continue;
    L.push(`## 闸门 ${g.id}：${g.name}`);
    L.push(`判据：${g.criteria}`);
    if (gg.evidenceLinks.length) {
      L.push('人工附加证据：');
      for (const e of gg.evidenceLinks) L.push(`- ${e}`);
    }
    if (gg.auto.length) {
      L.push('半自动取证记录（只是证据，判定见上表「理由」列）：');
      for (const a of gg.auto) {
        const tag = a.dryRun ? '(dry-run，未真实执行)' : `exit=${a.exitCode}`;
        L.push(`- [${a.at}] \`${a.script}\` ${tag}${a.stdoutFile ? ` → ${a.stdoutFile}` : ''}`);
      }
    }
    L.push('');
  }
  return L.join('\n');
}

/** 把一个参数安全地转成可以复制粘贴进 shell 的形式——带空格/特殊字符的参数
 * 必须加引号，否则 dry-run 打印出来的命令复制粘贴回 shell 会被拆成多个参数
 * （实际 spawnSync 走的是数组，不受这个影响；这个函数只影响人读的展示）。 */
export function shQuote(arg) {
  const s = String(arg);
  if (s !== '' && /^[A-Za-z0-9_\-.\/:=@]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** demand 脚本名（不含 .mjs）→ 绝对路径。纯路径计算，不检查文件是否存在。 */
export function demandScriptPath(name) {
  const clean = String(name).replace(/\.mjs$/, '');
  return path.join(DEMAND_DIR, `${clean}.mjs`);
}

/** 汇总多个候选记录成 report 用的表格行 + 死因分布。纯函数，输入是已经解析好的 record 数组。 */
export function summarizeReport(records) {
  const rows = records.map((r) => ({
    candidate: r.candidate, slug: r.slug, status: r.status,
    currentGate: r.status === 'killed' ? `killed@${r.killedAtGate}`
      : r.status === 'passed_all' ? 'passed_all'
      : `gate ${nextPendingGate(r)}`,
    killedAtGate: r.killedAtGate, killReason: r.killReason, updatedAt: r.updatedAt,
  }));
  const killCounts = {};
  for (const r of records) if (r.status === 'killed') killCounts[r.killedAtGate] = (killCounts[r.killedAtGate] ?? 0) + 1;
  return {
    rows, total: records.length,
    killed: records.filter((r) => r.status === 'killed').length,
    passedAll: records.filter((r) => r.status === 'passed_all').length,
    inProgress: records.filter((r) => r.status === 'in_progress').length,
    killCounts,
  };
}

// ── 有副作用的部分：文件落盘、打印、子进程 ──────────────────────────────────

function recordPaths(dir, slug) {
  return { json: path.join(dir, `${slug}.json`), md: path.join(dir, `${slug}.md`), evidenceDir: path.join(dir, slug, 'evidence') };
}

function loadRecord(dir, candidateOrSlug) {
  const bySlug = path.join(dir, `${candidateOrSlug}.json`);
  const p = fs.existsSync(bySlug) ? bySlug : path.join(dir, `${slugify(candidateOrSlug)}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveRecord(dir, record) {
  fs.mkdirSync(dir, { recursive: true });
  const { json, md } = recordPaths(dir, record.slug);
  fs.writeFileSync(json, JSON.stringify(record, null, 2) + '\n');
  fs.writeFileSync(md, renderMarkdown(record) + '\n');
  return { json, md };
}

// ── 根层留痕：判杀 / 全部通过时自动追写 workspace 根 .rankup/decisions.md、rejected.md ──
//
// selection.md §13「收尾」写死了这条约定：每个候选的七道闸门结果要写进根级
// .rankup/decisions.md；被闸门 0–5 判杀的候选还要另写一行进 .rankup/rejected.md。
// 这段代码之前不存在——跑几轮全靠人工事后补录，根层记录必然和实际判定脱节
// （这正是这次要补的闭环缺口）。只在两个终态触发：判杀（任意闸门）、全部通过
// （七道闸门都 pass）；中途某道闸门单纯 pass 不触发，候选状态还没定型。

const DECISIONS_HEADER_IF_MISSING = '# 决策记录\n\n';
const REJECTED_HEADER_IF_MISSING = '# 已拒绝方向\n\n格式：对象 | 类型 | 日期 | 理由 | 复活条件 | 证据\n\n';

/** --dir 传入的候选记录目录所在的项目根 .rankup 目录。默认 --dir 是
 * <项目根>/.rankup/selection，从这里往上找一层名为 .rankup 的目录；调用方给了
 * 完全自定义的 --dir、往上找不到 .rankup 时，退化为 --dir 的父目录——不写死任何
 * 本机绝对路径，跟着调用方传入的 --dir 走。 */
export function resolveRootRankupDir(dir) {
  let cur = path.resolve(dir);
  for (let i = 0; i < 8; i++) {
    if (path.basename(cur) === '.rankup') return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.dirname(path.resolve(dir));
}

/** decisions.md 模板（selection.md §13）里单道闸门的一行；还没判到的闸门按模板写
 * "未到这步"，不是空着或猜一个结论。 */
function renderGateLine(gateDef, gateState) {
  if (gateState.status !== 'pass' && gateState.status !== 'kill') return `闸门${gateDef.id} ${gateDef.name}：未到这步`;
  const verb = gateState.status === 'pass' ? '通过' : '判杀';
  return `闸门${gateDef.id} ${gateDef.name}：${verb}，${gateState.reason}`;
}

/** decisions.md 的追写块（纯函数，不做 I/O）。candidate 名字里若混进 Markdown 表格
 * 分隔符会破坏后面 rejected.md 的表格，这里统一转义。marker 注释用于幂等去重，
 * 追写时原样保留，不影响渲染（HTML 注释）。 */
export function renderDecisionsEntry(record, relRecordPath) {
  const date = (record.updatedAt || '').slice(0, 10);
  const lines = [`## ${record.candidate} 选品闸门 (${date})`, `<!-- rankup-selection:${record.slug} -->`];
  for (const g of GATES) lines.push(renderGateLine(g, record.gates[g.id]));
  // 判杀理由已经完整写在上面对应闸门那一行——这里不重复整段理由（判杀理由往往是长
  // 段落，重复一遍只会让文件加倍膨胀），只指回是哪一道闸门判杀的。
  const final = record.status === 'passed_all'
    ? 'GO，理由：七道闸门全部通过'
    : `NO-GO，理由：闸门${record.killedAtGate}（${GATE_BY_ID[record.killedAtGate].name}）判杀，完整理由见上方闸门${record.killedAtGate}行`;
  lines.push(`最终结论：${final}`);
  lines.push(`出处：\`${relRecordPath}\``);
  return lines.join('\n') + '\n';
}

/** rejected.md 的追写块（纯函数）。只应在闸门 0–5 判杀时调用——闸门 6 判杀已经走完
 * research.md 的完整量化流程，留痕方式由那条流程自己的约定负责，selection.md §13
 * 点名要求另写 rejected.md 一行的只有闸门 0–5。 */
export function renderRejectedEntry(record, relRecordPath, revival) {
  const date = (record.updatedAt || '').slice(0, 10);
  const gateName = GATE_BY_ID[record.killedAtGate].name;
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const reason = `闸门${record.killedAtGate}（${gateName}）判杀：${record.killReason}`;
  const revivalText = revival && String(revival).trim() ? String(revival).trim() : '未记录，需人工评估后补充';
  const lines = [
    `## ${record.candidate} 选品闸门判杀 (${date})`,
    `<!-- rankup-selection:${record.slug} -->`,
    '| 对象 | 类型 | 日期 | 理由 | 复活条件 | 证据 |',
    '|---|---|---|---|---|---|',
    `| ${esc(record.candidate)} | 选品闸门${record.killedAtGate} 判杀 | ${date} | ${esc(reason)} | ${esc(revivalText)} | \`${relRecordPath}\` |`,
  ];
  return lines.join('\n') + '\n';
}

/** 把一个 marker 唯一的块追写进目标文件：marker 已存在 → 幂等跳过（同一候选重复跑
 * 不产生重复行）；文件不存在 → 先落一个最小合法标题再追写；任何 I/O 失败（权限/
 * 磁盘/路径）直接抛错，不吞——调用方（cmdGate）必须把这个错误用 die() 明确报出来，
 * 这是 brief 点名要防的"静默跳过"。 */
export function appendUnique(filePath, marker, block, headerIfMissing) {
  let existing = '';
  let fileExists = false;
  try {
    fileExists = fs.existsSync(filePath);
    existing = fileExists ? fs.readFileSync(filePath, 'utf8') : '';
  } catch (e) {
    throw new Error(`读取 ${filePath} 失败，无法判断是否已追写过（幂等检查本身失败）：${e.message}`);
  }
  if (existing.includes(marker)) return { written: false, path: filePath };
  const prefix = !fileExists ? headerIfMissing
    : existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, prefix + block);
  } catch (e) {
    throw new Error(`追写 ${filePath} 失败：${e.message}`);
  }
  return { written: true, path: filePath };
}

/** 判杀或全部通过时调用：把这个候选的结果追写进根层 decisions.md（总是）和
 * rejected.md（仅闸门 0–5 判杀）。失败直接向上抛错，不在这里吞掉。 */
export function recordRootTrace(dir, record, revival) {
  const rootDir = resolveRootRankupDir(dir);
  const relMd = path.relative(rootDir, recordPaths(dir, record.slug).md);
  const marker = `<!-- rankup-selection:${record.slug} -->`;
  const results = {};

  const decisionsPath = path.join(rootDir, 'decisions.md');
  results.decisions = appendUnique(decisionsPath, marker, renderDecisionsEntry(record, relMd), DECISIONS_HEADER_IF_MISSING);

  if (record.status === 'killed' && record.killedAtGate <= 5) {
    const rejectedPath = path.join(rootDir, 'rejected.md');
    results.rejected = appendUnique(rejectedPath, marker, renderRejectedEntry(record, relMd, revival), REJECTED_HEADER_IF_MISSING);
  }
  return results;
}

function printGateInfo(g) {
  console.log(`闸门 ${g.id}：${g.name}（${g.judgment === 'human' ? '人工判断' : '半自动'}）`);
  console.log(`判据：${g.criteria}`);
  if (g.checklist) {
    console.log('检查清单：');
    for (const c of g.checklist) console.log(`  - ${c}`);
  }
  if (g.suggestedScripts) console.log(`建议脚本（--auto --script）：${g.suggestedScripts.join(', ')}`);
  if (g.humanSteps) {
    console.log('必须人工做的部分（脚本不代劳）：');
    for (const s of g.humanSteps) console.log(`  - ${s}`);
  }
}

/** --auto 用：确认 --script 指向 demand/ 下真实存在的脚本，否则打印可选清单后退出。 */
function requireDemandScript(name) {
  const p = demandScriptPath(name);
  if (path.basename(p) === '_lib.mjs' || !fs.existsSync(p)) {
    let avail = [];
    try { avail = fs.readdirSync(DEMAND_DIR).filter((f) => f.endsWith('.mjs') && f !== '_lib.mjs').map((f) => f.replace(/\.mjs$/, '')); } catch { /* 目录读不了就给空列表 */ }
    die(`--script "${name}" 不是 scripts/demand/ 下的脚本。可选：\n  ${avail.join(', ')}`);
  }
  return p;
}

/** 跑（或 dry-run）一次 --auto 取证，落盘 stdout/stderr，返回要追加进 record 的 entry。 */
function runAuto(dir, record, gateId, scriptName, scriptPath, passthroughArgs, { dryRun, timeout }) {
  const at = new Date().toISOString();
  const evDir = recordPaths(dir, record.slug).evidenceDir;
  fs.mkdirSync(evDir, { recursive: true });
  const slugTs = at.replace(/[:.]/g, '-');
  const argsForRun = passthroughArgs.includes('--json') ? passthroughArgs : [...passthroughArgs, '--json'];

  if (dryRun) {
    const noteFile = path.join(evDir, `gate${gateId}-${scriptName}-${slugTs}.dryrun.json`);
    const cmd = `node ${shQuote(scriptPath)} ${argsForRun.map(shQuote).join(' ')}`;
    fs.writeFileSync(noteFile, JSON.stringify({ dryRun: true, wouldRun: cmd, at }, null, 2) + '\n');
    console.log(`[dry-run] 不会真的执行子脚本。将要跑的命令：\n  ${cmd}`);
    return { script: scriptName, args: argsForRun, dryRun: true, exitCode: null, stdoutFile: null, stderrFile: null, noteFile, at };
  }

  const r = spawnSync('node', [scriptPath, ...argsForRun], { cwd: process.cwd(), encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 });
  const stdoutFile = path.join(evDir, `gate${gateId}-${scriptName}-${slugTs}.stdout.txt`);
  const stderrFile = path.join(evDir, `gate${gateId}-${scriptName}-${slugTs}.stderr.txt`);
  fs.writeFileSync(stdoutFile, r.stdout ?? '');
  fs.writeFileSync(stderrFile, r.stderr ?? '');
  const preview = (r.stdout || '').split('\n').slice(0, 25).join('\n');
  console.log(`--- ${scriptName} 输出预览（前 25 行，完整见 ${stdoutFile}）---`);
  console.log(preview || '(无 stdout，看 stderr：' + stderrFile + ')');
  if (r.status !== 0) console.log(`注意：退出码 ${r.status}——非 0 不等于「没有证据价值」，很多脚本部分数据源失败时也会非 0 退出，看 stderr/manifest 再判断。`);
  return { script: scriptName, args: argsForRun, dryRun: false, exitCode: r.status, signal: r.signal ?? null, stdoutFile, stderrFile, at };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const HELP = `
gate-runner.mjs — 七道闸门选品流程编排 + 决策记录

它不替人做判断。闸门 0/1/4/5 是人工判断闸门：脚本只打印判据和检查清单、
接收你的判定和理由，写进决策文件。闸门 2/3/6 是半自动闸门：脚本调用
scripts/demand/*.mjs 取证据，判定仍然由人做——不把阈值硬编码成结论。

一旦某道闸门被判杀（--kill），候选记录立即锁死：后续闸门无法再记录判定
或跑 --auto，这是"早杀省钱"这套流程的核心价值，脚本强制、不是建议。

判杀或七道闸门全部通过时，会自动把结果追写进 workspace 根层的
.rankup/decisions.md（总是）和 .rankup/rejected.md（仅闸门 0–5 判杀，闸门 6
判杀已转入 research.md 完整流程，留痕方式不同）——不需要再手工补录。同一候选
重复触发不会写出重复行（按 slug 幂等）；追写失败会直接报错退出，且这次的判定
不会落盘本地记录（改好问题后重跑同一条 gate 命令即可，见 --revival）。

用法:
  node gate-runner.mjs init "<候选名>" [--dir <path>]
  node gate-runner.mjs gate <0-6> --candidate "<候选名>" --pass  --reason "<理由>" [--evidence <url|file>]...
  node gate-runner.mjs gate <0-6> --candidate "<候选名>" --kill  --reason "<理由>" [--evidence <url|file>]...
  node gate-runner.mjs gate <2|3|6> --candidate "<候选名>" --auto --script <demand脚本名> [--dry-run] [--timeout <ms>] -- <透传给该脚本的参数>
  node gate-runner.mjs gate <0-6> --candidate "<候选名>"            # 只读：打印判据+当前状态，不记录
  node gate-runner.mjs status "<候选名>" [--dir <path>] [--json]
  node gate-runner.mjs report [--dir <path>] [--json]
  node gate-runner.mjs --self-test
  node gate-runner.mjs --help

选项:
  --dir <path>            决策记录目录，默认 <cwd>/.rankup/selection/
  --candidate <名>        gate/status 用来定位候选记录（不维护隐藏的"当前候选"，
                          避免并发调用互相踩踏——见文件头「设计偏离」说明）
  --pass / --kill         终判（互斥，且必须搭配 --reason）
  --reason <文本>         判定理由（pass/kill 都必须给；不给就 die，理由留痕
                          是这个脚本存在的全部意义）
  --evidence <url|file>   人工附加的证据链接/文件路径，可重复给
  --revival <文本>        仅闸门 0–5 --kill 时用：写进根层 rejected.md 的"复活条件"
                          一栏；不给就落一句诚实的占位（"未记录，需人工评估后补充"），
                          不替你瞎编一个
  --auto                  跑半自动闸门（仅 2/3/6）：调用 --script 指定的
                          demand 脚本取证据，**不产生判定**——证据记进去之后
                          仍要你自己看过再跑 --pass/--kill
  --script <名>           --auto 用，scripts/demand/ 下的脚本文件名（不含 .mjs）
  --dry-run               --auto 时不真的执行子脚本，只打印/记录将要跑的命令
                          （验证流程、省配额用）
  --timeout <ms>          --auto 子进程超时，默认 120000
  -- <...>                之后的所有参数原样透传给 --script 指定的脚本

七道闸门:
  0 硬约束     人工   逐条对照约束清单，撞一条即出局
  1 使用频次   人工   每天/每周→过；一年几次→杀；几年一次→立即杀
  2 痛点证据   半自动 抱怨句式搜 Reddit/X/YT；<3 个独立的人说同一件事→杀
               建议脚本：reddit-wishes / hn-signals / chrome-ext-gap / reviews-mine
  3 付费信号   半自动 CPC + 意图分类；这批人在不在为笨办法付钱
               建议脚本：keyword-value / stripe-referring / freelance-demand / payment-referrers
  4 护城河     人工   AI 工厂两周能不能复制？能→杀
  5 获客可行性 人工   只能靠人工运营→与约束冲突→杀
  6 量化验证   半自动 两条独立路径互证 + 亲眼看 SERP（人工）+ Semrush 打 3 折（人工）
               建议脚本：ads-transparency / appstore-charts / gplay-charts / stripe-referring / site-network / sitemap-diff

示例:
  node gate-runner.mjs init "AI 简历润色 SaaS"
  node gate-runner.mjs gate 0 --candidate "AI 简历润色 SaaS" --pass --reason "自助订阅，无需人工审核"
  node gate-runner.mjs gate 1 --candidate "AI 简历润色 SaaS" --kill --reason "求职季外几乎不用，一年几次"
  node gate-runner.mjs gate 2 --candidate "X" --auto --script reddit-wishes --dry-run -- --topic "resume" --limit 20
  node gate-runner.mjs report
`.trim();

function cmdInit(dir, args) {
  const candidate = args._.join(' ').trim();
  if (!candidate) die('用法：node gate-runner.mjs init "<候选名>" [--dir <path>]');
  fs.mkdirSync(dir, { recursive: true });
  const slug = slugify(candidate);
  const { json: jsonPath } = recordPaths(dir, slug);
  if (fs.existsSync(jsonPath)) {
    die(`候选「${candidate}」的记录已存在：${jsonPath}\n用 status 查看当前进度，或直接用 gate <N> 继续推进；不提供覆盖初始化，避免误删判定历史。`);
  }
  const record = newRecord(candidate);
  const { json, md } = saveRecord(dir, record);
  console.log(`已建立候选记录：${candidate}`);
  console.log(`  slug: ${slug}`);
  console.log(`  JSON: ${json}`);
  console.log(`  Markdown: ${md}`);
  console.log('\n下一步：闸门 0（硬约束）——');
  printGateInfo(GATES[0]);
}

function cmdGate(dir, args, passthrough) {
  const gateId = Number(args._[0]);
  if (!Number.isInteger(gateId) || !GATE_IDS.includes(gateId)) {
    die('用法：node gate-runner.mjs gate <0-6> --candidate "<候选名>" [...]（闸门编号只能是 0-6）');
  }
  const candidateArg = args.candidate;
  if (!candidateArg) die('必须用 --candidate "<候选名>" 指定候选（gate 命令不维护隐藏的"当前候选"状态）。');
  const record = loadRecord(dir, candidateArg);
  if (!record) die(`找不到候选「${candidateArg}」的记录，先跑：node gate-runner.mjs init "${candidateArg}"`);
  const gateDef = GATE_BY_ID[gateId];

  const wantAuto = !!args.auto;
  const wantPass = !!args.pass;
  const wantKill = !!args.kill;
  if (wantAuto && (wantPass || wantKill)) die('--auto 和 --pass/--kill 不能同时给：先 --auto 攒证据，看完证据再单独跑 --pass/--kill 做终判。');
  if (wantPass && wantKill) die('--pass 和 --kill 不能同时给。');

  if (!wantAuto && !wantPass && !wantKill) {
    printGateInfo(gateDef);
    const gg = record.gates[gateId];
    console.log(`\n候选「${record.candidate}」在这道闸门的当前状态：${STATUS_LABEL[gg.status] ?? gg.status}`);
    if (gg.reason) console.log(`理由：${gg.reason}`);
    if (gg.auto.length) console.log(`已跑过 ${gg.auto.length} 次 --auto 取证，完整记录见 ${recordPaths(dir, record.slug).md}`);
    return;
  }

  if (wantAuto) {
    try { assertCanAuto(record, gateId); } catch (e) { die(e.message); }
    const scriptName = args.script;
    if (!scriptName) die(`--auto 必须指定 --script <demand脚本名>。这道闸门建议脚本：${(gateDef.suggestedScripts || []).join(', ') || '（无建议，任选 scripts/demand/ 下的脚本）'}`);
    const scriptPath = requireDemandScript(scriptName);
    const dryRun = !!args['dry-run'];
    const timeout = Number(args.timeout || 120000);
    const entry = runAuto(dir, record, gateId, scriptName, scriptPath, passthrough, { dryRun, timeout });
    appendAutoEvidence(record, gateId, entry);
    const paths = saveRecord(dir, record);
    console.log(`\n半自动取证完成（闸门 ${gateId} ${gateDef.name}，脚本 ${scriptName}${dryRun ? '，dry-run' : ''}）。`);
    console.log(`证据已记入：${paths.json}`);
    console.log('这只是证据，不是判定——看过之后仍需人跑：');
    console.log(`  node gate-runner.mjs gate ${gateId} --candidate "${record.candidate}" --pass --reason "..."`);
    console.log(`  node gate-runner.mjs gate ${gateId} --candidate "${record.candidate}" --kill --reason "..."`);
    return;
  }

  // 终判
  const reason = args.reason;
  const evidenceLinks = asList(args.evidence);
  try {
    applyDecision(record, gateId, { outcome: wantPass ? 'pass' : 'kill', reason, evidenceLinks });
  } catch (e) { die(e.message); }

  // 根层留痕先于本地落盘：判杀/全部通过时，先把结果追写进根层 decisions.md（和
  // rejected.md），成功了才 saveRecord 本地 JSON/MD。顺序反过来会有一个半成品窗口——
  // 本地已经判杀、根层却因为一次写失败而没留痕，且因为候选已锁死无法重跑终判来补救。
  // 这个顺序保证写失败时本地记录仍是"待终判"，同一条 gate 命令可以直接重跑。
  if (record.status === 'killed' || record.status === 'passed_all') {
    try {
      const trace = recordRootTrace(dir, record, args.revival);
      if (trace.decisions) console.log(trace.decisions.written ? `根层留痕：已追写 ${trace.decisions.path}` : `根层留痕：${trace.decisions.path} 已有这条记录，跳过重复追写`);
      if (trace.rejected) console.log(trace.rejected.written ? `根层留痕：已追写 ${trace.rejected.path}` : `根层留痕：${trace.rejected.path} 已有这条记录，跳过重复追写`);
    } catch (e) {
      die(`根层留痕写入失败，本次判定未落盘本地记录（改好问题后重跑同一条 gate 命令即可）：${e.message}`);
    }
  }

  const paths = saveRecord(dir, record);
  console.log(`闸门 ${gateId}（${gateDef.name}）判定：${wantPass ? '通过' : '判杀'}`);
  console.log(`理由：${record.gates[gateId].reason}`);
  if (wantKill) {
    console.log(`\n候选「${record.candidate}」流程终止于闸门 ${gateId}。后续闸门不再需要跑——这正是早杀省钱的意义。`);
  } else if (record.status === 'passed_all') {
    console.log(`\n候选「${record.candidate}」已通过全部 7 道闸门。`);
  } else {
    const next = nextPendingGate(record);
    console.log(`\n下一步：闸门 ${next}（${GATE_BY_ID[next].name}）——`);
    printGateInfo(GATE_BY_ID[next]);
  }
  console.log(`\n记录已更新：${paths.json}`);
}

function cmdStatus(dir, args) {
  const candidate = args._.join(' ').trim() || args.candidate;
  if (!candidate) die('用法：node gate-runner.mjs status "<候选名>" [--dir <path>]');
  const record = loadRecord(dir, candidate);
  if (!record) die(`找不到候选「${candidate}」的记录，先跑：node gate-runner.mjs init "${candidate}"`);
  if (args.json) { console.log(JSON.stringify(record, null, 2)); return; }
  console.log(renderMarkdown(record));
  const p = recordPaths(dir, record.slug);
  console.log(`\n文件：${p.json}\n      ${p.md}`);
}

function cmdReport(dir, args) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { /* 目录不存在 = 还没有候选 */ }
  const records = files.map((f) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; }
  }).filter(Boolean);
  const summary = summarizeReport(records);
  if (args.json) { console.log(JSON.stringify(summary, null, 2)); return; }
  console.log(`目录：${dir}`);
  console.log(`候选总数：${summary.total}   进行中：${summary.inProgress}   已判杀：${summary.killed}   全部通过：${summary.passedAll}\n`);
  const rows = summary.rows.map((r) => ({
    candidate: r.candidate, status: STATUS_LABEL[r.status] ?? r.status, gate: r.currentGate,
    updated: (r.updatedAt || '').slice(0, 19), reason: r.killReason || '',
  }));
  printTable(rows, [
    { key: 'candidate', label: '候选', max: 26 },
    { key: 'status', label: '状态', max: 8 },
    { key: 'gate', label: '当前/终止于', max: 14 },
    { key: 'updated', label: '更新时间', max: 20 },
    { key: 'reason', label: '死因', max: 44 },
  ]);
  console.log('\n死因分布（按判杀所在的闸门编号）：');
  const ids = Object.keys(summary.killCounts).map(Number).sort((a, b) => a - b);
  if (!ids.length) console.log('  （暂无候选被判杀）');
  for (const id of ids) console.log(`  闸门 ${id}（${GATE_BY_ID[id].name}）：${summary.killCounts[id]} 个`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) { selfTest(); return; }
  if (!argv.length || argv[0] === '--help') { console.log(HELP); process.exit(argv.length ? 0 : 1); }

  const [cmd, ...rest] = argv;
  const sepIdx = rest.indexOf('--');
  const ownArgs = sepIdx === -1 ? rest : rest.slice(0, sepIdx);
  const passthrough = sepIdx === -1 ? [] : rest.slice(sepIdx + 1);
  const args = parseArgs(ownArgs);
  if (args.help) { console.log(HELP); return; }
  const dir = path.resolve(process.cwd(), args.dir || DEFAULT_DIR);

  switch (cmd) {
    case 'init': return cmdInit(dir, args);
    case 'gate': return cmdGate(dir, args, passthrough);
    case 'status': return cmdStatus(dir, args);
    case 'report': return cmdReport(dir, args);
    default: die(`未知命令：${cmd}\n\n${HELP}`);
  }
}

// ---------------------------------------------------------------- self-test
function selfTest() {
  const ok = [];
  const check = (name, cond) => ok.push([name, !!cond]);
  const throws = (fn) => { try { fn(); return null; } catch (e) { return e; } };

  // GATES 表本身的完整性
  check('七道闸门 id 是 0..6 顺序', GATE_IDS.join(',') === '0,1,2,3,4,5,6');
  check('闸门 2/3/6 是半自动，其余是人工',
    [0, 1, 4, 5].every((id) => GATE_BY_ID[id].judgment === 'human') &&
    [2, 3, 6].every((id) => GATE_BY_ID[id].judgment === 'semi-auto'));
  check('人工闸门都带 checklist', [0, 1, 4, 5].every((id) => Array.isArray(GATE_BY_ID[id].checklist) && GATE_BY_ID[id].checklist.length > 0));
  check('半自动闸门都带 suggestedScripts', [2, 3, 6].every((id) => Array.isArray(GATE_BY_ID[id].suggestedScripts) && GATE_BY_ID[id].suggestedScripts.length > 0));
  check('STATUS_LABEL 覆盖全部用到的状态值',
    ['pending', 'pass', 'kill', 'in_progress', 'killed', 'passed_all'].every((s) => s in STATUS_LABEL));

  // slugify
  const s1 = slugify('AI Resume Polish SaaS');
  check('slugify: 小写+短横线+6位hash后缀', /^[a-z0-9-]+-[0-9a-f]{6}$/.test(s1));
  const s2 = slugify('把发票自动生成');
  check('slugify: 中文候选名也能生成非空 slug', s2.length > 0 && /-[0-9a-f]{6}$/.test(s2));
  check('slugify: base 相同但原文不同 → hash 不同（不会撞车）', slugify('Foo!!!') !== slugify('Foo???'));
  check('slugify: 同一个名字两次调用结果一致（确定性）', slugify('same name') === slugify('same name'));

  // newRecord
  const rec0 = newRecord('测试候选');
  check('newRecord: 初始状态 in_progress', rec0.status === 'in_progress');
  check('newRecord: killedAtGate 初始为 null', rec0.killedAtGate === null);
  check('newRecord: 7 道闸门全部 pending', GATE_IDS.every((id) => rec0.gates[id].status === 'pending'));
  check('nextPendingGate: 全新候选下一道是闸门 0', nextPendingGate(rec0) === 0);

  // 顺序推进 + 不能跳过
  const rec1 = newRecord('顺序测试');
  check('assertCanDecide: 跳过闸门 0 直接判闸门 2 要抛错', throws(() => assertCanDecide(rec1, 2)) !== null);
  applyDecision(rec1, 0, { outcome: 'pass', reason: '自助订阅' });
  check('applyDecision pass 后 status 仍是 in_progress', rec1.status === 'in_progress');
  check('applyDecision pass 后 nextPendingGate 前进到 1', nextPendingGate(rec1) === 1);
  check('applyDecision: reason 为空必须抛错', throws(() => applyDecision(newRecord('x'), 0, { outcome: 'pass', reason: '  ' })) !== null);
  check('applyDecision: outcome 非法必须抛错', throws(() => applyDecision(newRecord('x'), 0, { outcome: 'maybe', reason: 'x' })) !== null);

  // --auto 只能跑半自动闸门、且只能跑当前该跑的那一道
  const rec2 = newRecord('半自动测试');
  check('assertCanAuto: 闸门 0（人工）不能 --auto', throws(() => assertCanAuto(rec2, 0)) !== null);
  applyDecision(rec2, 0, { outcome: 'pass', reason: 'ok' });
  applyDecision(rec2, 1, { outcome: 'pass', reason: 'ok' });
  check('assertCanAuto: 轮到闸门 2 时可以 --auto', throws(() => assertCanAuto(rec2, 2)) === null);
  check('assertCanAuto: 还没轮到闸门 3 时不能提前 --auto', throws(() => assertCanAuto(rec2, 3)) !== null);
  appendAutoEvidence(rec2, 2, { script: 'reddit-wishes', dryRun: true, at: new Date().toISOString() });
  appendAutoEvidence(rec2, 2, { script: 'hn-signals', dryRun: true, at: new Date().toISOString() });
  check('appendAutoEvidence: 累加不覆盖', rec2.gates[2].auto.length === 2);
  check('appendAutoEvidence: 不改变 status/reason（仍是 pending）', rec2.gates[2].status === 'pending');

  // 判杀立即锁死
  const rec3 = newRecord('判杀测试');
  applyDecision(rec3, 0, { outcome: 'pass', reason: 'ok' });
  applyDecision(rec3, 1, { outcome: 'kill', reason: '一年几次，太低频' });
  check('kill 后 status 变 killed', rec3.status === 'killed');
  check('kill 后 killedAtGate 记录正确', rec3.killedAtGate === 1);
  check('kill 后 killReason 有值', rec3.killReason === '一年几次，太低频');
  check('kill 后再判任何闸门都要抛错（闸门 2）', throws(() => assertCanDecide(rec3, 2)) !== null);
  check('kill 后 --auto 也要抛错', throws(() => assertCanAuto(rec3, 2)) !== null);
  check('kill 后错误信息里带死因', throws(() => assertCanDecide(rec3, 2)).message.includes('太低频'));

  // 全部通过
  let rec4 = newRecord('全过测试');
  for (const id of GATE_IDS) applyDecision(rec4, id, { outcome: 'pass', reason: `闸门${id}通过` });
  check('7 道全 pass 后 status 变 passed_all', rec4.status === 'passed_all');
  check('passed_all 后 nextPendingGate 返回 null', nextPendingGate(rec4) === null);
  check('passed_all 后再判定要抛错', throws(() => assertCanDecide(rec4, 0)) !== null);

  // renderMarkdown
  const md = renderMarkdown(rec3);
  check('renderMarkdown 包含候选名', md.includes('判杀测试'));
  check('renderMarkdown 包含判杀标注', md.includes('已判杀') && md.includes('闸门 1'));
  check('renderMarkdown 包含死因', md.includes('一年几次，太低频'));
  const md2 = renderMarkdown(rec2);
  check('renderMarkdown 包含 --auto 取证记录', md2.includes('reddit-wishes') && md2.includes('dry-run'));

  // summarizeReport（纯函数，喂合成的 records 数组）
  const synth = [rec1, rec2, rec3, rec4];
  const sum = summarizeReport(synth);
  check('summarizeReport: total 正确', sum.total === 4);
  check('summarizeReport: killed 计数正确', sum.killed === 1);
  check('summarizeReport: passedAll 计数正确', sum.passedAll === 1);
  check('summarizeReport: inProgress 计数正确', sum.inProgress === 2);
  check('summarizeReport: killCounts 按闸门分布', sum.killCounts[1] === 1);
  check('summarizeReport: currentGate 对 in_progress 候选给出下一道闸门', sum.rows.find((r) => r.candidate === '顺序测试').currentGate === 'gate 1');
  check('summarizeReport: currentGate 对 killed 候选标 killed@N', sum.rows.find((r) => r.candidate === '判杀测试').currentGate === 'killed@1');
  check('summarizeReport: currentGate 对 passed_all 候选标 passed_all', sum.rows.find((r) => r.candidate === '全过测试').currentGate === 'passed_all');

  // shQuote：dry-run 展示用的命令要能安全复制粘贴回 shell
  check('shQuote: 纯字母数字不加引号', shQuote('advertisers') === 'advertisers');
  check('shQuote: 带空格的参数会加引号', shQuote('invoice generator') === "'invoice generator'");
  check('shQuote: 带单引号的参数会转义', shQuote("it's a test") === "'it'\\''s a test'");
  check('shQuote: 空字符串加引号', shQuote('') === "''");

  // demandScriptPath：纯路径计算 + 只读存在性检查（不联网、不写、不改 demand/ 下任何文件）
  check('demandScriptPath 指向 demand/ 目录下同名 .mjs', demandScriptPath('reddit-wishes') === path.join(DEMAND_DIR, 'reddit-wishes.mjs'));
  check('demandScriptPath 会自己去掉多余的 .mjs 后缀', demandScriptPath('keyword-value.mjs') === demandScriptPath('keyword-value'));
  for (const s of ['reddit-wishes', 'keyword-value', 'stripe-referring', 'freelance-demand', 'ads-transparency', 'appstore-charts', 'gplay-charts']) {
    check(`建议脚本确实存在于磁盘：${s}.mjs`, fs.existsSync(demandScriptPath(s)));
  }

  // ── 端到端集成自测（仅本地文件 I/O，--auto 全部 dry-run，不 spawn 子进程、不联网）
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-runner-selftest-'));
  try {
    const cand = '临时假候选 for selftest';
    let record = newRecord(cand);
    saveRecord(tmp, record);
    check('集成: init 后 JSON 文件存在', fs.existsSync(recordPaths(tmp, record.slug).json));
    check('集成: init 后 Markdown 文件存在', fs.existsSync(recordPaths(tmp, record.slug).md));

    record = loadRecord(tmp, cand);
    check('集成: loadRecord 按候选名（非 slug）也能读回', record && record.candidate === cand);
    applyDecision(record, 0, { outcome: 'pass', reason: '通过硬约束自测' });
    saveRecord(tmp, record);
    applyDecision(record, 1, { outcome: 'pass', reason: '每周用一次' });
    saveRecord(tmp, record);

    assertCanAuto(record, 2); // 不抛即通过
    const dryEntry = runAuto(tmp, record, 2, 'reddit-wishes', demandScriptPath('reddit-wishes'), ['--topic', 'invoice', '--limit', '5'], { dryRun: true, timeout: 5000 });
    check('集成: dry-run 取证 entry.dryRun===true', dryEntry.dryRun === true);
    check('集成: dry-run 不产生 stdoutFile', dryEntry.stdoutFile === null);
    check('集成: dry-run 会落一份 noteFile', dryEntry.noteFile && fs.existsSync(dryEntry.noteFile));
    appendAutoEvidence(record, 2, dryEntry);
    saveRecord(tmp, record);

    applyDecision(record, 2, { outcome: 'kill', reason: '只有 2 个独立的人提到，<3 个不算证实' });
    saveRecord(tmp, record);
    check('集成: 闸门 2 判杀后 status=killed', record.status === 'killed');
    check('集成: 判杀后闸门 3 --auto 被拒绝', throws(() => assertCanAuto(record, 3)) !== null);
    check('集成: 判杀后闸门 3 --pass/--kill 也被拒绝', throws(() => assertCanDecide(record, 3)) !== null);

    // report 汇总应该能从落盘的 JSON 里正确读出这一个候选
    const files = fs.readdirSync(tmp).filter((f) => f.endsWith('.json'));
    const records = files.map((f) => JSON.parse(fs.readFileSync(path.join(tmp, f), 'utf8')));
    const sum2 = summarizeReport(records);
    check('集成: report 扫描目录只捞到这一个候选', sum2.total === 1);
    check('集成: report 认得这个候选死于闸门 2', sum2.killCounts[2] === 1);

    const savedMd = fs.readFileSync(recordPaths(tmp, record.slug).md, 'utf8');
    check('集成: 落盘的 Markdown 里带死因文本', savedMd.includes('<3 个不算证实'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ── 根层留痕自测：decisions.md / rejected.md 自动追写（正常追写 / 幂等 / 写失败报错）
  const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-runner-roottrace-'));
  try {
    const rootRankup = path.join(tmp3, '.rankup');
    const selDir = path.join(rootRankup, 'selection');

    check('resolveRootRankupDir: 从 .rankup/selection 能找到 .rankup', resolveRootRankupDir(selDir) === rootRankup);
    const plainDir = path.join(tmp3, 'plain', 'nested');
    check('resolveRootRankupDir: 往上找不到 .rankup 时退化为父目录', resolveRootRankupDir(plainDir) === path.dirname(plainDir));

    // 候选 A：闸门 1 判杀（0–5 范围内）→ 应该同时追写 decisions.md 与 rejected.md
    let recA = newRecord('自测判杀候选A');
    saveRecord(selDir, recA);
    applyDecision(recA, 0, { outcome: 'pass', reason: '自助订阅，通过' });
    saveRecord(selDir, recA);
    applyDecision(recA, 1, { outcome: 'kill', reason: '一年几次，太低频，判杀' });
    saveRecord(selDir, recA);

    const decisionsPath = path.join(rootRankup, 'decisions.md');
    const rejectedPath = path.join(rootRankup, 'rejected.md');
    check('根层留痕: 追写前 decisions.md 还不存在', !fs.existsSync(decisionsPath));

    const trace1 = recordRootTrace(selDir, recA, '出现新的独立付费证据');
    check('根层留痕: 正常追写 decisions.md 返回 written=true', trace1.decisions.written === true);
    check('根层留痕: 闸门 0–5 判杀也追写 rejected.md（written=true）', trace1.rejected && trace1.rejected.written === true);
    check('根层留痕: decisions.md 被创建', fs.existsSync(decisionsPath));
    check('根层留痕: rejected.md 被创建', fs.existsSync(rejectedPath));

    const decText1 = fs.readFileSync(decisionsPath, 'utf8');
    check('根层留痕: decisions.md 含候选名', decText1.includes('自测判杀候选A'));
    check('根层留痕: decisions.md 含幂等 marker', decText1.includes(`<!-- rankup-selection:${recA.slug} -->`));
    check('根层留痕: decisions.md 判杀写 NO-GO', decText1.includes('NO-GO'));
    check('根层留痕: decisions.md 闸门0行是通过', decText1.includes('闸门0 硬约束：通过，自助订阅，通过'));
    check('根层留痕: decisions.md 闸门1行是判杀', decText1.includes('闸门1 使用频次：判杀，一年几次，太低频，判杀'));
    check('根层留痕: decisions.md 未到的闸门写"未到这步"', decText1.includes('闸门2 痛点证据：未到这步') && decText1.includes('闸门6 量化验证：未到这步'));
    check('根层留痕: decisions.md 出处指向相对路径（不含本机绝对路径）', decText1.includes('出处：`selection/') && !decText1.includes(tmp3));

    const rejText1 = fs.readFileSync(rejectedPath, 'utf8');
    check('根层留痕: rejected.md 含候选名', rejText1.includes('自测判杀候选A'));
    check('根层留痕: rejected.md 含指定的复活条件', rejText1.includes('出现新的独立付费证据'));
    check('根层留痕: rejected.md 标注死于哪道闸门', rejText1.includes('闸门1（使用频次）判杀'));

    // 幂等：同一候选重复调用 recordRootTrace 不应产生第二条记录
    const trace2 = recordRootTrace(selDir, recA, '出现新的独立付费证据');
    check('根层留痕: 幂等重跑 decisions.md written=false', trace2.decisions.written === false);
    check('根层留痕: 幂等重跑 rejected.md written=false', trace2.rejected.written === false);
    const decText2 = fs.readFileSync(decisionsPath, 'utf8');
    const markerCount = decText2.split(`<!-- rankup-selection:${recA.slug} -->`).length - 1;
    check('根层留痕: 幂等重跑不产生重复 marker（仍然只有 1 处）', markerCount === 1);
    const rejText2 = fs.readFileSync(rejectedPath, 'utf8');
    const rejMarkerCount = rejText2.split(`<!-- rankup-selection:${recA.slug} -->`).length - 1;
    check('根层留痕: 幂等重跑不产生重复 rejected.md 区块（marker 仍然只有 1 处）', rejMarkerCount === 1);

    // 候选 B：闸门 6 判杀（量化验证）→ 只追写 decisions.md，不追写 rejected.md
    let recB = newRecord('自测判杀候选B-闸门6');
    for (const id of [0, 1, 2, 3, 4, 5]) applyDecision(recB, id, { outcome: 'pass', reason: `闸门${id}通过` });
    applyDecision(recB, 6, { outcome: 'kill', reason: '两条路径未互证，量化验证判杀' });
    saveRecord(selDir, recB);
    const traceB = recordRootTrace(selDir, recB);
    check('根层留痕: 闸门6判杀会写 decisions.md', traceB.decisions.written === true);
    check('根层留痕: 闸门6判杀不写 rejected.md（selection.md §13 只点名闸门0–5）', traceB.rejected === undefined);
    const rejText3 = fs.readFileSync(rejectedPath, 'utf8');
    check('根层留痕: rejected.md 里没有混入闸门6判杀的候选', !rejText3.includes('自测判杀候选B'));

    // 候选 C：全部通过 → 只追写 decisions.md（GO），不碰 rejected.md
    let recC = newRecord('自测全过候选C');
    for (const id of GATE_IDS) applyDecision(recC, id, { outcome: 'pass', reason: `闸门${id}通过` });
    saveRecord(selDir, recC);
    const traceC = recordRootTrace(selDir, recC);
    check('根层留痕: 全部通过会写 decisions.md', traceC.decisions.written === true);
    check('根层留痕: 全部通过不写 rejected.md', traceC.rejected === undefined);
    const decText3 = fs.readFileSync(decisionsPath, 'utf8');
    check('根层留痕: 全部通过的候选写 GO', decText3.includes('自测全过候选C') && decText3.includes('GO，理由：七道闸门全部通过'));

    // 写失败必须明确报错，不能静默跳过：让目标文件的父目录路径被一个同名普通文件占用，
    // mkdirSync(recursive) 在这种冲突下必然抛错，appendUnique 应该把它包成 Error 向上抛。
    const blockerRoot = path.join(tmp3, 'blocked-root');
    fs.mkdirSync(blockerRoot, { recursive: true });
    const blockerFile = path.join(blockerRoot, '.rankup'); // 占用 .rankup 这个名字，让它是文件不是目录
    fs.writeFileSync(blockerFile, '占位文件，不是目录');
    const brokenDecisionsPath = path.join(blockerFile, 'decisions.md'); // 父路径 .rankup 是文件，必然写失败
    const err = throws(() => appendUnique(brokenDecisionsPath, '<!-- marker -->', '块内容\n', DECISIONS_HEADER_IF_MISSING));
    check('根层留痕: 写失败时 appendUnique 抛错而不是静默跳过', err !== null);
    check('根层留痕: 写失败的错误信息里带目标文件路径，便于定位', err && err.message.includes('decisions.md'));
  } finally {
    fs.rmSync(tmp3, { recursive: true, force: true });
  }

  const failed = ok.filter(([, c]) => !c);
  for (const [name] of failed) console.error(`FAIL: ${name}`);
  if (failed.length) { console.error(`gate-runner self-test: ${failed.length}/${ok.length} FAILED`); process.exit(1); }
  console.log(`gate-runner self-test: PASS (${ok.length} checks)`);
}

// 只有直接执行时才跑 main；两边都取 realpath 是因为通过 skills 软链调用时
// argv[1] 是链接路径、import.meta.url 是真实路径，直接比较会永远不相等
// （suggest.mjs 2026-09-03 踩过的坑，这里照抄同样的判定）。
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(path.resolve(process.argv[1])); }
  catch { return false; }
})();
if (invokedDirectly) main().catch((e) => die(e?.message || String(e)));
