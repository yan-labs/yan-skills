# 账本与 score（给以后测试和调整派单顺序留痕）

每个 fleet run 到终态时，自动往 `~/.agent-fleet/ledger.jsonl` 追加一行 JSON（单文件、只追加，不改 `runs/*.json` 旧记录）。账本只放元数据：任务名、执行者、结果、时长、失败分类、配对关系，不放任务正文、结果正文、凭据、用户标识。写账本失败一律吞掉，不影响任务结果。`mock` 与 `run-many` 批量父记录不进账本。

## 字段（v1）

| 字段 | 含义 |
|---|---|
| `runId` `name` | run 标识与任务名（同名多次运行 = relaunch / 续派）。 |
| `date` `startedAt` `finishedAt` `durationSec` | 本机日期、起止时间、秒数。僵尸记录的时长不可信，score 不用时长。 |
| `executor` | 执行者族含 `astra` `sol` `terra`，另保留历史档位标签；主要通道还有  `grok` `gemini` `sonnet` `opus` `haiku` `fable` `jev`。官方 API、网关、Codex 通道统一归并（如 `openai-gpt-terra` 记为 `terra`）。 |
| `model` `route` `effort` | 实际模型、真实执行路由（如 `agy`、`kollab-gateway-copy`、`gpt-6.1-terra`、`grok-cli:...`）、推理档位（Codex 的 medium/xhigh 等，读不到为空）。 |
| `level` | 难度档 `L1`–`L4`，由 `fleet-go new --level` 传入，缺省为空。L1 单文件/小脚本，L2 单模块，L3 跨模块或根因定位，L4 生产高风险或架构级（总管按 L4）。 |
| `orderOverride` | 派单时用 `--override-order` 放行了被调遣令「停用」的执行者，这里记放行理由；平时为空。 |
| `type` | `work`（默认）`review` `orchestrate` `media` 等。`--type` 显式传；`--review` / `--for` 自动记 `review`，`--make` 记 `media`，名字含 orchestrat 记 `orchestrate`。 |
| `status` `verdict` `outcome` | fleet 终态、verdict、折算结果：`complete`（真完成）/ `partial` / `failed` / `stopped`。当前依据 verdict 和 pending 折算，旧记录回填可参考报告结论。 |
| `pending` | `none`、`external`、`downstream`、`rolled-back`、`handoff`。verdict 为 ok 时，非 none 值也作为 outcome。 |
| `failure` | 旧兼容失败原因分类：`quota`、`capacity`、`zombie`、`stopped`、`auth-gateway`、`capability`、`unknown`。ok 与 partial 为空。前五项都是非能力因素，供 `score` 兼容使用。 |
| `failureReason` | 结构化失败/未达标原因枚举：`zero-tool`、`auth`、`quota`、`capacity`、`network`、`refusal`、`timeout`、`acceptance-gap`、`external-wait`、`zombie`、`stopped`、`unknown`；`verdict=ok` 时为空。按错误文本与状态归类，不落原文。 |
| `toolCalls` | 本单工具调用总数（整数；旧记录或无结构化日志时为空）。 |
| `externalWait` | 外部等待对象 `{waiting: boolean, reason: string|null}`，记录是否命中 `park`、流水线等待或验收等外部状态及脱敏分类原因（不落命令/URL 参数或密钥）。 |
| `acceptance` | 具名验收各状态计数对象 `{passed, failed, external, downstream, rolledBack, na, missing, total}`，非具名验收单为空，不落验收正文。 |
| `promptTemplate` | 样板版本与角色标记（如 `v1/role-single/model-terra`、`v1/role-orchestrator/model-orchestrator`、`copy/voice`），缺省为空。 |
| `reroute` | 改派或自动回退原因分类（如 `agy-unavailable-fallback`、`quota-fallback:codex->openai`、`relaunch:gpt->grok`、`relaunch-after-capacity`），无改派为空。 |
| `continues` | Codex 续做闸门续做次数。 |
| `prevRunId` `prevExecutor` `prevFailure` | 同名上一个 run（或 `resumedFrom`）及其执行者、失败原因：看得出谁换手、为什么换。 |
| `reviewOf` `pairSource` | 复核单对应的被复核任务名，`explicit`（`--for`）或 `inferred`（同名前缀推测），缺省为空。 |
| `blockers` `reviewVerdict` | 复核尾注里的必修项数与结论，没有尾注为空。 |
| `report` `tokens` `costUsd` | 报告路径（`~` 缩写）、token 总量、费用（有就记）。 |
| `backfilled` | 回填行为 `true`，实时写入为 `false`。旧记录缺少新增字段时读取与 `score` 均兼容不报错。 |

## 复核尾注

复核方在最终回复最后一行（有 REPORT 的也在「结论」节）写固定一行，单独占一行、不加引号或反引号：

```
LEDGER: blockers=<必修项数> verdict=<pass|fail|partial>
```

`blockers` 是必须修复才能放行的项数（P0/P1，以及复核方判定必须修的 P2），没有写 0；`pass` 可放行，`fail` 不可放行，`partial` 只能部分判断。多条取最后一条；没有就留空。`fleet-go new` 遇到 `--review`、`--for` 或 `--type review` 会自动把这条说明写进 brief 的「验收」节。

## 配对

复核单用 `fleet-go new <名字> --for <被复核任务名> ...` 显式关联；没写 `--for` 时按名字推测（去掉 `review` / `recheck` 词与末尾 `r2` 之类轮次，精确同名，或唯一的「候选名-」前缀，且被复核任务更早开始、不是复核单）。推测不到就留空，宁可空不乱配。做活 run 与复核的对应在 `score` 里按 `reviewOf` + 开始时间取「复核前最近一次同名做活 run」。

## Claude 子代理

Agent 工具拉起的子代理（executor-*、general-purpose 等）由 SubagentStop 钩子 `~/.claude/hooks/ledger-subagent.py` 记账，零模型调用：`route=claude-sub`、`runId=sub-<agent_id>`、`backfilled=false`。耗时拆分按 transcript 的 tool_use/tool_result 时间戳算：`cmdMs` 为工具并集时长，`waitMs`/`pollCount` 为命中等待模式（sleep、`fleet wait`、`fleet-go new`、write_stdin）的 Bash 命令，`modelMs`=总时长-cmdMs，`queuedMs`=0，`activeMs`=总时长-waitMs，`timeSource` 注明 wait 为命令模式估计。`tokens` 只计 input+output+cache_creation，不含 cache_read。读不到报告时 `outcome` 为 null（不是 complete）。历史回填：`python3 ~/.claude/hooks/ledger-subagent.py --backfill --days 14`（按 runId 去重，可重复跑）；已记账行重算：`--recompute --days 14`（先备份，只改 claude-sub 行）。

## 命令

运行 `fleet-go score` 汇总账本，可用 `--since` 缩小日期范围。在 agent-fleet 目录运行 `node bin/fleet-ledger-backfill.mjs --days 14 --dry-run` 预览历史回填。

`score` 分「做活」与「复核者」两张表：运行数（任务数）、剔除非能力因素后的样本、真完成 / 部分 / 失败、各类剔除计数、被复核次数与必修项均值（带 n），样本少于 8 标「样本不足」。不设总分权重，只给计数；总分口径由人按 `~/.agent-reports/` 里的评分卡方法另行决定。

回填只读 `~/.agent-fleet/runs/*.json`，把窗口内、账本里还没有的 run 追加为 `backfilled:true`；按 `runId` 去重，重复运行行数不变。回填的 `level` 为空、`blockers` 为空（旧复核没有尾注）、`outcome` 对只在报告里自述部分完成的旧 run 可能偏乐观。测试挪走 `AGENT_FLEET_RUNS_DIR` 时不写真实账本，需要时另设 `AGENT_FLEET_LEDGER`。
