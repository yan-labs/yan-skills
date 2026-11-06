#!/usr/bin/env node
// 把 ~/.agent-fleet/runs/*.json 里最近 N 天(默认 14)已结束的 run 回填进账本 ledger.jsonl。
// 只读旧记录;账本里已有的 runId 跳过,所以可以反复运行,行数不会重复增加。回填的行带 backfilled:true。
// 用法: node bin/fleet-ledger-backfill.mjs [--days 14] [--dry-run]
import { listDetached } from '../src/detach.mjs';
import { backfill, ledgerPath } from '../src/ledger.mjs';

const args = process.argv.slice(2);
const flag = name => args.indexOf(name);
const days = flag('--days') >= 0 ? Number(args[flag('--days') + 1]) : 14;
if (!Number.isFinite(days) || days <= 0) {
  console.error('用法: fleet-ledger-backfill.mjs [--days 14] [--dry-run]');
  process.exit(2);
}
const path = ledgerPath();
if (!path) {
  console.error('AGENT_FLEET_RUNS_DIR 已被改写,请同时设置 AGENT_FLEET_LEDGER 指定账本路径。');
  process.exit(2);
}
const result = backfill(listDetached(), { days, path, dryRun: args.includes('--dry-run') });
console.log(`账本 ${path}\n扫描终态记录 ${result.scanned} 条;账本原有 ${result.existing} 行;${args.includes('--dry-run') ? '将新增' : '新增'} ${result.added} 行。`);
