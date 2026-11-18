---
name: agent-fleet
description: 用本机 fleet / fleet-go 把编码、只读复核、调研、文案翻译、结构化判断、图片视频生成等任务派给后台执行者（Codex GPT 的 Terra/Sol/Luna、Claude 各档、Gemini、Grok、JEV），并覆盖 brief 写法、巡检换班、主会话交班、验收复核、派单复盘和 fleet 产物清理。用户点名 agent-fleet 或 fleet、说“让 Codex/GPT/Gemini/Grok 做某事”、要便宜模型或多模型并行、提到 Nano Banana/nanobanana/香蕉或 Kollab 图片视频音频能力、需要按全局 CLAUDE.md 路由派单、处理在跑的后台任务，或说“清理一下”“清理 N 天/一周之前的日志/报告/截图”时使用。当前模型直接就能完成、无需派单的任务不触发；用户明确要直接操作 Codex CLI 原生命令（自选 sandbox、codex review、apply、resume）时用 codex；普通配图也可用 imagegen。
allowed-tools: Bash(fleet-go order show*) Bash(cat ~/.agents/dispatch-order.md*) Bash(true)
---

# agent-fleet

把任务写成 brief，交给 `fleet-go` / `fleet` 的后台执行者去做；主线程只派单、验收、复盘。角色分工、授权红线、报告七节、复核分档和并发上限在全局 `~/.claude/CLAUDE.md`（§2–§4），这里只写怎么做，不复述。

## 思维准则（每次派单最先；用户 2026-11-17 定，来自卡兹克的十条 Agent 提示词，已按执行场景改写）

每一单、每一份 brief 都以六条「思维准则」开头：根因优先、先质疑问题定义、先对齐再动手、推演二三阶影响、跨领域找解、自我证伪。唯一的原文在 `templates/blocks/thinking-principles.md`，别处只放指针。

- `fleet-go new` 自动把它放在「归类/REPORT」首部之后、其余样板之前，所以走 fleet 的单不用手写；`dry-run` 里它必须出现。
- Agent 工具派的 `executor-*`、手写 brief 的单不经 fleet，主线程把该块原文贴在 brief 最前面（首部之后）。
- 主线程写 brief 之前自己先过一遍：用户说的是症状还是根因、是手段还是目标？有更值得做的就在 brief 里写明，不是照抄用户原话。
- 另有四类场景（代码考古与清理、新人认知成本、PR 变慢、返工复盘）是按任务类型挑选的「场景透镜」，由主线程把对应原文写进 brief 正文，见[派单纪律 · 思维准则与场景透镜](references/dispatch-discipline.md#思维准则与场景透镜)。

## 当前调遣令（自动注入，优先于下文所有路由与顺位）

!`fleet-go order show || cat ~/.agents/dispatch-order.md || true`

调遣令是用户临时发的全局指令（谁停用、谁省着用、谁优先、谁的额度已重置），全局唯一，存在 `~/.agents/dispatch-order.md`。与下文路由、顺位冲突时以调遣令为准；`fleet-go new` / `relaunch` 会拦下被「停用」的执行者（`--override-order "理由"` 才放行，理由进 brief 偏差和账本），「省着用」只警告。

- 用户口头新发调遣令，或得知某执行者额度用完、已重置：立即 `fleet-go order set <执行者> <优先|正常|省着用|停用> --until <重置时间> --reason "原话与日期"`（恢复用 `fleet-go order clear <执行者>`）。只在对话里说或写进项目 memory 都不算，因为别的会话读不到。
- fleet 的 run 因额度类原因失败时会自动记成「停用到重置时间」（原因以「自动：」开头；带「估计」的重置时间拿到准确值后手动改），到点自动恢复。Agent 工具的 `executor-*` 不经 fleet，额度用完要手动记。
- 上面看到的若是命令原文而不是令的内容，说明没注入，先自己跑一次 `fleet-go order show`。

## 派单流程

1. **选执行者**：按下方[路由原则](#路由原则长期)。
2. **写 brief**：先按上面的思维准则自查用户的问题定义，再用 `fleet-go scenes --project <根>` 查场景，按需用 `--scene <名>` 带入；无适用场景时读项目派单手册；正文只写任务独有的背景、要做的事、入口和验收，其余样板由 `fleet-go new` 自动补。写法见[派单纪律 · Brief](references/dispatch-discipline.md#brief)。
3. **预览**：`fleet-go new … --dry-run` 看拼好的 brief；入口、动作与授权不匹配会在这里被拦下。
4. **启动**：一条 Bash 调用只放一条 `fleet-go new …`、`fleet-go relaunch <名>` 或 `fleet <子命令> …`，工具参数 `run_in_background: true`。命令里不加 `&`、`nohup`、`setsid`、`disown`（PreToolUse hook `check-fleet-launch.py` 会拦），否则收不到完成通知。工具应返回「Command running in background with ID …」，任务状态是 running 而不是几秒内 completed。多个独立任务在同一条消息里并行发多条 Bash。
5. **挂定时**：确认本会话已挂半小时巡检和交班检查，见[巡检与换班](#巡检与换班)。
6. **验收**：完成通知回来后读报告「结论」并核对真实产物；fleet 状态 done 只代表进程退出。见[验收](#验收)。
7. **复核**：按全局 §4.3 的风险分档另起只读复核单（`--review --for <被复核任务名>`）。
8. **复盘**：这一单不顺（没做完、要续做、复核有必修项、启动被拦）就按[派单复盘](references/dispatch-discipline.md#派单复盘每单不顺都做)归因并整理规则。

新会话接手未结束任务：先 `fleet status --running --json`，对每个 run 各开一条 `fleet wait <runId>`（同样 `run_in_background: true`）重新挂上完成通知。

## 路由原则（长期）

Terra 与 Sol 的两问判断、Terra 交回 partial 先续做不改派、GPT 最低用 Terra、不派 Luna、Gemini 只写文案，规则原文在全局 `~/.claude/CLAUDE.md` §2「路由」；下表是对应的命令。用户点名优先；成本、额度、并发满时按[工具链](references/fallback-chains.md)换手。

| 任务 | 执行者 | 命令 |
|---|---|---|
| 两问都是“能”：编码、复核、按已知源调研、机械改动、技术文档、数据整理、一般任务 | Codex Terra（medium） | `fleet-go new <名> --to gpt` |
| 任一问“不能”：自己摸入口、跨系统多步编码、总管、删除数据、新写或大改发布脚本 | Codex Sol，开派即用 | `--to gpt --sol` |
| 发布、部署推进（跑现成流水线、合并、等 CI、回读、生产实测、更新日志），不写代码 | Codex Terra（不用 Luna，用户 2026-11-18） | `--to gpt` |
| 改部署配置、写部署脚本 | Codex Terra | `--to gpt` |
| 巡检、监工、定时、核对整理 | Codex Terra | `--to gpt` |
| 文案、翻译、多语言、校对 | Gemini（自动带[文案语气规范](references/copy-voice.md)，纯机械改写加 `--no-voice`） | `--to gemini`，批量加 `--bulk` |
| UI、样式、视觉交互、建站设计、3D、游戏内容 | Claude Sonnet，见[工具链](references/fallback-chains.md) | `--to claude --tier sonnet`；要 Browser pane 用 `executor-sonnet` |
| 方案、架构、方向未明的综合判断；硬性指标多轮达不到时先出方案 | Fable，只走 Agent 工具 | `subagent_type=executor-fable`，brief 带“这个代码库是你的，做成什么样你说了算，以后也是你接着维护。”；Claude 额度不足时 `--to gpt --astra`，见[工具链](references/fallback-chains.md) |
| 较难的编程、Sonnet 反复打转 | Opus | `--to claude --tier opus` |
| 小杂活、摘要、核实、机械替换、取证 | Haiku | `--to claude --tier haiku`；要 Browser pane/MCP 用 `executor-haiku` |
| 视频、图片、X 热点与社媒实时检索、成人题材；Codex 不可用时承接编码 | Grok | `--to grok`，产物样板加 `--make image\|video`，见 [Grok CLI](references/grok-cli.md) |
| 分类、是否、打分、成败校验 | JEV，置信度低于约 0.55 交回 | `--to jev` 或 `fleet judge`，见 [JEV 用法](references/judge.md) |
| 用 OpenAI API 额度做不急的编程 | OpenAI Terra，不用 Sol、不开 fast | `--to openai`，见 [OpenAI API 入口](references/openai-bridge.md) |
| 登录态浏览器采集（GSC、Semrush 等） | 现成脚本或 opencli adapter | 缺脚本先让 Claude 写脚本再沉淀 |

- Claude 档先走 `--to claude`（订阅附赠的月度 API 额度，独立于 Claude App 用量）；需要本应用工具、MCP、Browser pane、`ccd_*` 或本机登录态才用 Agent 工具的 `executor-*`，每次显式传 `model`。
- Codex 一律不开 fast，需要才显式 `--fast`。
- 执行者拒绝、不可用或并发满：按[工具链](references/fallback-chains.md)换下一顺位（含 Codex 额度用满自动改派），用 `fleet-go relaunch <名> --to <产品>` 沿用 brief 重派；编码不派 Gemini。临时的停用和额度重置只记在调遣令里。
- `fleet-go team` 一屏看各产品的能力、顺位和登录状态（只显示凭据是否存在）。

## 快速派单

```sh
# 改代码（同仓库多个写入任务各加 --worktree）
fleet-go new fix-card --to gpt --auth local --write /path/to/project --goal "修复卡片布局" <<'BRIEF'
卡片在手机窄屏上会溢出，希望内容能完整读到。可以改卡片和必要的相邻样式，保留其他人的现有改动。现有构建通过，窄屏上内容完整并适配视口宽度，就算做完。
BRIEF

# 只读复核（checker）
fleet-go new review-card --to gpt --review --auth review --read /path/to/project --for fix-card --goal "复核 fix-card 的改动" --body review.md

# 发布推进（正文写齐目标、环境、回滚条件和回读清单）
fleet-go new deploy-site --to gpt --auth deploy-prod,readonly-web --goal "部署 <HEAD> 并回读" --body body.md

# 文案
fleet-go new page-copy --to gemini --goal "写 XX 页英文文案" --body body.md
```

- 授权按动作选：改代码 `local`；要本地提交 `local-commit`；推送和部署 `local-commit,deploy-prod`；只读联网 `readonly-web`；付费 `paid`；只读复核 `review`。
- 正文写 `动作:` 行和 `## 入口`（`仓库: /绝对路径`，非只读再加 `可写路径:`）；brief 引用的文件一律绝对路径。
- 默认在 Mac Mini 执行，路径或工具缺了就在 Mini 补齐后重派，不回退本机；确需本机用 `--on local --local-reason "理由"`。
- 改方向：`fleet-go amend <名> "补充要求" --say`（运行中插话，已结束则按修订后的 brief 重派）。看进度：`fleet-go status`。读 Mini 上的报告：`fleet-go read <名>`。

全部参数、授权块、入口与动作字段、relaunch/amend 语义、worktree、续做闸门、名额池、执行位置配置和排障见 [fleet-go 派单参考](references/fleet-go.md)。

## 巡检与换班

规则在全局 `~/.claude/CLAUDE.md` §3.2。派出后台任务后主线程不盯单，只做两件事：

1. 挂会话内巡检（已挂不重复；7 天到期仍有任务就续挂）。把 `<任务名列表>` 换成本会话负责的任务：

   ```text
   CronCreate(cron="7,37 * * * *", prompt="【半小时巡检】先检查是否有后台任务在跑；没有则用 CronList 找到这条巡检并 CronDelete；有则在本会话按本机 ~/.agent-fleet/patrol-brief.md 派 Terra 巡检子单（--to gpt --on mini，run_in_background），只看本会话负责的任务：<任务名列表>；完成通知回来后，读它的「需要主会话处理」并逐条处理。")
   ```

2. 巡检子单回来后，读它最终回复第一段「需要主会话处理」并逐条裁定（补授权、改派、调整顺序、找用户、是否重派），不能只看巡检记录。

主会话自己也按时交班，不等用户提醒：本会话已被压缩过一次、连续派单值守约 4 小时、一批单验收完、或用户提到额度烧得快，满足任一条就交班。巡检的纠偏与换班判据、交班六步和已知坑见[巡检与主会话交班](references/patrol-and-handoff.md)。

## 中途插话

统一入口：`fleet say <任务> "新指令"` 或 `fleet-go amend <名> "补充要求" --say`；`--restart` 只作最后兜底。

| 执行者 | 插话怎么生效 |
|---|---|
| `gpt`（含 `--review`） | 同一轮 `turn/steer`；失败降级为中断后 `codex exec resume`（新一轮，同会话）。steer 被接受不等于立刻停下，已完成的写入撤不回 |
| `grok` | 停掉当前进程，用 sessionId 在同一会话续跑；拿到 sessionId 之前拒绝插话，任务继续 |
| `claude`、`gemini`、`openai` | 经收件箱送进运行中的任务 |
| `jev` | 单次请求，无需插话 |
| 网页版 ChatGPT | `fleet web say <会话名> "追问"` |
| Agent 工具的 `executor-*` | `SendMessage`，不属于 fleet |

## 验收

| verdict | 含义与处理 |
|---|---|
| `ok` | 进程正常结束；仍要按 brief 核对产物和检查 |
| `partial` | 有验收项没做完；`fleet-go amend <名> --say` 列出缺口续做 |
| `suspect` | 疑似假成功，或要求改动却零改动；核对结果和 diff |
| `needs-review` | JEV 置信度不足；人工核对 |
| `fail` | 执行失败、空结果或裸 tool-call 控制 token；看脱敏错误摘要后修复或换手 |
| `stopped` | 被中断；检查已完成部分 |

`dirty` 和 `commits` 可能包含同一工作树里其他人的改动。失败的 run 只上报事实（执行者与档位、脱敏错误、已完成步骤、产物），错误归类和改派由主线程决定。报告核对、独立复核、失败重派和总管用法见[派单纪律](references/dispatch-discipline.md)；账本与 `fleet-go score` 见[账本](references/ledger.md)。

## 清理

用户说“清理一下”默认 7 天，直接执行不先问：

```sh
fleet-go clean --older-than 7d      # 直接删除；预览加 --dry-run，明细加 --json
```

证据和备份只列「待确认」，逐项核实并问过用户后才用 `--include-backups <路径…>` 删。保留范围和两机路径写法见[操作细则 · 清理](references/operations.md#清理)。

## 其他通道

- **底层 `fleet` 短命令**（`fleet code/copy/grok/haiku/…`、`status/tail/stop/resume`）：新派单用 `fleet-go new`，短命令速查见[操作细则](references/operations.md#底层命令速查)。
- **Codex 编程与 review**（档位、app-server 与 exec、阶段接力、review 提示词）：[codex-coding.md](references/codex-coding.md)。
- **Kollab 图片、视频、音频、3D**：先 `fleet media list` 看实时清单，再 `fleet media run <tool> --model <id> --prompt "…"`；见[多模态用法](references/media.md)。
- **/design 画布**：`--to claude --tier sonnet` 在本地写画布文件，`executor-haiku` 用 Artifact 工具串行上传；见[派单纪律 · /design 画布](references/dispatch-discipline.md#design-画布)。

### 网页版 ChatGPT 通道

少量串行的调研问答用 `fleet web start/say/close/list`，走订阅额度，用完 `close`；限制与记忆开关检查见[操作细则](references/operations.md#网页版-chatgpt-通道)。

### JEV judge

`fleet judge state.txt questions.json [--json]` 做结构化判断，问题类型 `noul`、`choice`、`score`，后两者必须给 `criteria`；格式与示例见 [JEV 用法](references/judge.md)。
