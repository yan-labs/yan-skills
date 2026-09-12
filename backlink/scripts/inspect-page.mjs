#!/usr/bin/env node
/**
 * inspect-page.mjs — 一个目标页的**全表单普查** + 现场截图。
 *
 * 2026-08-30 双证人化：输出以普查为主体——每个 form 每个 field 的语义七元组
 * （tag/type/id/name/label/autocomplete/placeholder）+ 稳定 marker，含隐藏控件
 * （visible: false）；随后 captureScene 落一对现场（穿透 census + 截图）进
 * --evidence-dir。`fillable` / `blocker` / `reason` / `selectedForm` 是**启发式
 * 建议（见 suggested 字段），不是判决**：判断由 AI 基于 forms 普查 + 截图做，
 * 可推翻。safe-fill.mjs 只把 fillable 当机械前置条件用。截图链路已实盘验证。
 *
 * 用法：
 *   node inspect-page.mjs --url https://x/submit [--mode auto|directory|comment]
 *     [--out scan.json] [--evidence-dir dir] [--session s] [--wait n]
 */
import { writeFile } from 'node:fs/promises';
import { defaultSession, firstJson, openAndEval, parseFlags, printJson, required, validateSession, showHelpIfRequested} from './opencli-core.mjs';
import { captureScene, defaultSceneDir } from './lib-evidence-scene.mjs';
import { buildScanExpression } from './lib-form-scan.mjs';

const flags = parseFlags(process.argv.slice(2));
showHelpIfRequested(flags, import.meta.url);
const url = new URL(required(flags, 'url'));
if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) URLs are supported.');
const session = flags.session ? validateSession(flags.session) : defaultSession('backlink-work');
const waitSeconds = Math.max(0, Math.min(15, Number(flags.wait || 3)));
const windowMode = flags.window === 'foreground' ? 'foreground' : 'background';
const mode = ['auto', 'directory', 'comment'].includes(flags.mode) ? flags.mode : 'auto';
const scanFunction = buildScanExpression(mode);

const evalResult = await openAndEval(session, url.toString(), scanFunction, {
  wait: waitSeconds,
  windowMode,
  timeoutMs: 120_000,
});
const scan = typeof evalResult === 'string' ? JSON.parse(evalResult) : evalResult;
// 普查之外的第二证人：穿透 census + 截图。判断（这页能不能填、卡在什么闸门）
// 由 AI 拿 forms 普查和这对现场做；captureScene 永不 throw。
const evidenceDir = typeof flags['evidence-dir'] === 'string'
  ? flags['evidence-dir']
  : defaultSceneDir({ out: typeof flags.out === 'string' ? flags.out : null, script: 'inspect-page' });
const scene = await captureScene({
  session, outDir: evidenceDir, windowMode, tag: 'scan',
  note: `inspect-page ${url.toString()}`,
});
const output = {
  session,
  // fillable/blocker/reason/selectedForm 是下面 suggested.note 说明的启发式建议。
  suggested: {
    fields: ['fillable', 'blocker', 'reason', 'selectedForm', 'qualifies'],
    note: '这些字段是脚本内正则/计数的启发式建议，不是判决——判断由 AI 基于 forms 普查（每表单 fieldCensus）+ evidence 现场做，可推翻。safe-fill 只把 fillable 当机械前置条件。',
  },
  evidence: scene,
  ...scan,
};
if (typeof flags.out === 'string') await writeFile(flags.out, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
printJson(output);
