# 账本与 score（给以后测试和调整派单顺序留痕）

每个 fleet run 到终态时，自动往 `~/.agent-fleet/ledger.jsonl` 追加一行 JSON（单文件、只追加，不改 `runs/*.json` 旧记录）。账本只放元数据：任务名、执行者、结果、时长、失败分类、配对关系，不放任务正文、结果正文、凭据、用户标识。写账本失败一律吞掉，不影响任务结果。`mock` 与 `run-many` 批量父记录不进账本。

## 字段（v1）

| 字段 | 含义 |
|---|---|
| `runId` `name` | run 标识与任务名（同名多次运行 = relaunch / 续派）。 |
| `date` `startedAt` `finishedAt` `durationSec` | 本机日期、起止时间、秒数。僵尸记录的时长不可信，score 不用时长。 |
| `executor` | 执行者族：`sol` `terra` `luna` `grok` `gemini` `sonnet` `opus` `haiku` `fable` `jev`。官方 API、网关、Codex 通道统一归并（如 `openai-gpt-terra` 记为 `terra`）。 |
| `model` `route` `effort` | 实际模型、fleet 路由名、推理档位（Codex 的 medium/xhigh 等，读不到为空）。 |
| `level` | 难度档 `L1`–`L4`，由 `fleet-go new --level` 传入，缺省为空。L1 单文件/小脚本，L2 单模块，L3 跨模块或根因定位，L4 生产高风险或架构级（总管按 L4）。 |
| `orderOverride` | 派单时用 `--override-order` 放行了被调遣令「停用」的执行者，这里记放行理由；平时为空。 |
| `type` | `work`（默认）`review` `orchestrate` `media` 等。`--type` 显式传；`--review` / `--for` 自动记 `review`，`--make` 记 `media`，名字含 orchestrat 记 `orchestrate`。 |
| `status` `verdict` `outcome` | fleet 终态、verdict、折算结果：`complete`（真完成）/ `partial` / `failed` / `stopped`。verdict 为 ok 但报告「结论」自述部分完成、未完成的折成 `partial`。 |
| `failure` | 失败原因，自动判：`quota`（402、月度额度）、`capacity`（模型容量、429 并发）、`zombie`（死进程）、`stopped`（被主线程停 / 信号终止）、`auth-gateway`（鉴权、网关、网络超时）、`capability`（suspect、空结果、裸 tool-call 等）、`unknown`（判不了）。ok 与 partial 为空。前五项都是非能力因素。 |
| `continues` | Codex 续做闸门续做次数。 |
| `prevRunId` `prevExecutor` `prevFailure` | 同名上一个 run（或 `resumedFrom`）及其执行者、失败原因：看得出谁换手、为什么换。 |
| `reviewOf` `pairSource` | 复核单对应的被复核任务名，`explicit`（`--for`）或 `inferred`（同名前缀推测），缺省为空。 |
| `blockers` `reviewVerdict` | 复核尾注里的必修项数与结论，没有尾注为空。 |
| `report` `tokens` `costUsd` | 报告路径（`~` 缩写）、token 总量、费用（有就记）。 |
| `backfilled` | 回填行为 `true`，实时写入为 `false`。 |

## 复核尾注

复核方在最终回复最后一行（有 REPORT 的也在「结论」节）写固定一行，单独占一行、不加引号或反引号：

```
LEDGER: blockers=<必修项数> verdict=<pass|fail|partial>
```

`blockers` 是必须修复才能放行的项数（P0/P1，以及复核方判定必须修的 P2），没有写 0；`pass` 可放行，`fail` 不可放行，`partial` 只能部分判断。多条取最后一条；没有就留空。`fleet-go new` 遇到 `--review`、`--for` 或 `--type review` 会自动把这条说明写进 brief 的「验收」节。

## 配对

复核单用 `fleet-go new <名字> --for <被复核任务名> ...` 显式关联；没写 `--for` 时按名字推测（去掉 `review` / `recheck` 词与末尾 `r2` 之类轮次，精确同名，或唯一的「候选名-」前缀，且被复核任务更早开始、不是复核单）。推测不到就留空，宁可空不乱配。做活 run 与复核的对应在 `score` 里按 `reviewOf` + 开始时间取「复核前最近一次同名做活 run」。

## 命令

```sh
fleet-go score [--since YYYY-MM-DD]       # 只读账本，按执行者输出计数
node ~/Project/kcsx/macmini/yan-skills/agent-fleet/bin/fleet-ledger-backfill.mjs [--days 14] [--dry-run]
fleet-go new <名字> --to ... [--level L1-L4] [--type 类型] [--for 被复核任务名] ...
```

`score` 分「做活」与「复核者」两张表：运行数（任务数）、剔除非能力因素后的样本、真完成 / 部分 / 失败、各类剔除计数、被复核次数与必修项均值（带 n），样本少于 8 标「样本不足」。不设总分权重，只给计数；总分口径由人按 `~/.agent-reports/` 里的评分卡方法另行决定。

回填只读 `~/.agent-fleet/runs/*.json`，把窗口内、账本里还没有的 run 追加为 `backfilled:true`；按 `runId` 去重，重复运行行数不变。回填的 `level` 为空、`blockers` 为空（旧复核没有尾注）、`outcome` 对只在报告里自述部分完成的旧 run 可能偏乐观。测试挪走 `AGENT_FLEET_RUNS_DIR` 时不写真实账本，需要时另设 `AGENT_FLEET_LEDGER`。
