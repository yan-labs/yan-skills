---
name: agent-fleet
description: 使用本机 fleet 分派 Codex GPT-6.1 Sol、Gemini、Grok 或 JEV 任务，或调用 Kollab 图片/视频/音频/多模态能力时使用；包括用户点名 agent-fleet、Nano Banana、nanobanana、香蕉、便宜模型、多模型并行，用户说“让 Codex 或 GPT-6.1 Sol 做某事”的编码、调研与 review 派单，以及按全局 CLAUDE.md §2 路由任务。只做单一模型的直接任务且无需 fleet 时不触发；用户明确要直接操作 Codex CLI 原生命令（自选 sandbox、codex review、apply、resume）时用 codex Skill；普通生成图片也可用 imagegen。
allowed-tools: Bash(fleet-go order show*) Bash(cat ~/.agents/dispatch-order.md*) Bash(true)
---

# agent-fleet

## 当前调遣令（自动注入，优先于下文所有路由与顺位）

!`fleet-go order show || cat ~/.agents/dispatch-order.md || true`

调遣令是用户临时发的全局指令（谁停用、谁省着用、谁优先、谁的额度已重置），全局唯一，存在 `~/.agents/dispatch-order.md`。与下文路由、顺位、换手表冲突时一律以调遣令为准；`fleet-go new` / `relaunch` 会拦下被「停用」的执行者（`--override-order "理由"` 才放行，理由进 brief 偏差和账本），「省着用」只警告。
- 用户口头新发调遣令，或你/执行者遇到额度类失败、被告知某执行者额度用完或已重置：立即 `fleet-go order set <执行者> <优先|正常|省着用|停用> --until <重置时间> --reason "原话与日期"`（恢复用 `fleet-go order clear <执行者>`），不要只在对话里说，也不写进项目 memory。
- fleet 的 run 因额度类原因失败结束时会自动记成「停用到重置时间」（原因以「自动：」开头，带「估计」的重置时间是估的，拿到准确时间再手动改）；到点自动视为恢复，不用清。Agent 工具里的 `claude-sub`（executor-*）不经 fleet，额度用完要手动记。
- 这里看到的若是命令原文而不是令的内容，说明没注入，先自己跑一次 `fleet-go order show`。

任务名额分为轻量池（Luna、Gemini/copy/bulk、Haiku、JEV，默认 10）和编码池（其他模型，默认 4），分别排队；只读任务不占名额。`FLEET_LIGHT_CAPACITY` / `FLEET_CODE_CAPACITY` 可分别调整，`FLEET_SLOT_CAPACITY` 则覆盖为全局总名额。

| 让谁做 | 适合什么 | 命令示例 | 派用者顺位参考 |
|---|---|---|---|
| `gpt` | 按[路由原则](#路由原则长期)选择 Terra、Sol 或 Luna | `fleet-go new fix --to gpt --auth local --goal "修复问题" --body task.md` | 见[工具链](references/fallback-chains.md) |
| `openai` | 官方 GPT API / ChatGPT 关联组织额度，复用原 Agent SDK | `fleet-go new task --to openai --auth local --goal "目标" --body task.md` | 单独入口，不改 Codex 默认 |
| `claude` | Claude 月度额度任务；默认 sonnet | `fleet-go new check --to claude --tier haiku --goal "复核报告" --body task.md` | 按任务类型选择替代执行者 |
| `grok` | 视频与图片（生成、搜索）、X 平台（热点与实时讨论）、X/社媒实时检索、成人题材；Codex 不可用或并发满时优先承接编码 | `fleet-go new trend --to grok --goal "整理 X 热点" --body task.md` | 见[工具链](references/fallback-chains.md) |
| `gemini` | 文案、翻译、校对 | `fleet-go new copy --to gemini --goal "写页面文案" --body task.md` | 见[工具链](references/fallback-chains.md) |
| `jev` | 分类、选择、打分等结构化判断 | `fleet-go new decide --to jev --goal "按正文判据分类" --body task.md` | — |

## OpenAI 订阅 API 额度

`fleet-go new <name> --to openai --auth local --goal "任务" --body task.md`，或 `fleet openai task.md`。默认官方 `gpt-6.1-terra`，凭据变量 `OPENAI_CREDIT_API_KEY` 仅放本目录 `.env`（0600）；不在 brief、命令、报告中填 Key。现有 `--to gpt` / `fleet code` 仍是 Codex，不自动改路由。

此入口复用 Claude Agent SDK 的本地工具、会话、收件箱、resume 与报告；每个 run 临时启动仅本机可访问的 Anthropic Messages→OpenAI Responses 适配器，官方 Key 只在父进程内发往 `https://api.openai.com/v1`，SDK 只拿临时本地 token，结束关闭适配器。不强制 fast，不经 Kollab 网关，不使用 Codex API Key 通道。

先在 ChatGPT/API Billing 激活并关联正确 API 组织，Key 必须属于该组织；普通 API 成功不等于赠送额度已到账。赠送额度先用，但耗尽后若有已购买余额仍可能继续扣费，不承诺“只用赠送额度”。是否到账/到期/实扣以平台 Credit grants 和 Usage 为准，不自动充值或更改套餐。官方说明：https://help.openai.com/zh-hans-cn/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions 。

轻量适配的实现范围与开源参考见 [OpenAI桥接说明](references/openai-bridge.md)。

## 巡检与换班
派出后台任务后，派单主会话必须用 CronCreate 挂会话内巡检，计划为 `7,37 * * * *`，提示词以「【半小时巡检】」开头。已有这条巡检时不重复挂；7 天到期但仍有后台任务时续挂。巡检使用会话内 Cron，不用独立定时任务。

每次触发先检查是否有后台任务在跑：没有就用 CronList 找到这条巡检并 CronDelete；有则在本会话派一个 Luna 巡检子单（`--luna --high`），brief 放在本机文件 `~/.agent-fleet/patrol-brief.md`。巡检检查日志与产物变化，纠正卡住、空转、循环或偏题的任务；判断无望时终止。单个 run 约 2 小时没有新产物，或累计运行约 5 小时时（日志、报告或进度文件仍在增长的按正常推进，不按时长换班），要求执行者写 checkpoint 并结束本轮，再用 `fleet-go relaunch` 换新 agent，要求读取 checkpoint 接着做。巡检记录追加到当天的 `fleet-patrol.md`。

**巡检结论交回主会话裁定。** 巡检单用 `run_in_background` 派出，完成通知回到派单主会话。巡检只自行处理上面的纠偏、终止和换班。它最终回复的第一段写「需要主会话处理」，列出自己用 fleet 命令解决不了的事，例如缺授权、需要改派执行者或档位、多单争用同一资源、需要用户配合、已终止的单是否重派；每条写明任务名、现象和建议，没有就写「无」。主会话收到通知后必须读取这一段并逐条处理，包括补授权、改派、调整顺序、找用户或重派，不能只看巡检记录。巡检提示里写明本会话负责的任务名，巡检只看这些任务。

CronCreate 示例（可直接复制并按本会话支持的字段调用）：
```text
CronCreate(cron="7,37 * * * *", prompt="【半小时巡检】先检查是否有后台任务在跑；没有则用 CronList 找到这条巡检并 CronDelete；有则在本会话按本机 ~/.agent-fleet/patrol-brief.md 派 Luna 巡检子单（--luna --high --on local，run_in_background），只看本会话负责的任务：<任务名列表>；完成通知回来后，读它的「需要主会话处理」并逐条处理。")
```
全局规则见 `~/.claude/CLAUDE.md` §3.2。

## 主会话接力（逐步交接）
主会话不等用户提醒，自己按时交班，不等手上所有单都结束（用户 2026-11-13）。

**何时交班（满足任一条）：** 本会话已被压缩（compact）过一次；连续派单值守约 4 小时；一个里程碑或一批单验收完；用户提到额度、token 烧得快。

**交班提醒定时：** 主会话开始派后台单时，和半小时巡检一起挂一条 `CronCreate(cron="13 * * * *", prompt="【交班检查】按 agent-fleet「主会话接力」判断是否该交班：满足任一条就立即执行交班步骤；否则不动。")`。交班时连同巡检一起删，新会话照样重挂。

**交班步骤：**
1. 写交接文件 `~/.agent-reports/<日期>/session-handoff.md`：用户方针与授权原话、在跑/排队的 run 和 runId、会话内定时原文、子代理单和报告路径、已决定不做的事、待拍板的事、新坑。
2. 删本会话的会话内定时（巡检、交班检查、一次性定时，原文已在交接文件），停掉纯等待的 `fleet wait` 后台命令；`fleet-go relaunch --after` 排队命令和 caffeinate 这类承载任务的进程不停。
3. 用 start_session 开新主会话，brief 让它读交接文件、重挂 `fleet wait`、重建定时和巡检，挂好后告诉用户。
4. **处理本会话还没回来的 Agent 子代理（executor-*）：** 正在写代码、发布等有实际产出的，让它做完，结论用 SendMessage 转给新会话。只在等的（等定时点、等迁移或复制、等 CI），立刻 SendMessage 让它收尾：停掉自己的后台等待；确认真正干活的进程已脱钩（Mini 上父进程为 1、集群或服务端在跑），否则先改成脱钩；在报告末尾写「交接 checkpoint」（做到哪、怎么查状态、下一步命令与判据、回滚）；worklist 标“由新主会话接续”；然后结束。旧会话把 checkpoint 路径转给新会话，由新会话挂定时到点派执行者。
5. 新会话不重派已转交的单。旧会话转完所有子代理即可归档；不要为了等某个凌晨定时点把旧会话留着。

**交班坑（2026-11-13）：**
- 子代理在等的时候会开很多「Wait until …」后台进程，它们挂在本会话，会话归档就跟着停；这些等待一律改成 checkpoint 加新会话定时，不能一直挂在旧会话。
- 要在凌晨执行的变更，优先写成 Mini 上脱钩的常驻脚本（自带门禁和自动回滚，例：B-20 `~/b20m1/runner.py`），子代理不用在线等，读日志验收即可。
- 同一时段两个生产变更错开至少 15 分钟（例：Redis 降配 03:05，集群减节点推到 03:23），出了问题才分得清原因。
- 子代理再派子代理会被 hook 拦下；它需要复核时交回主会话安排，不要自己绕到别的通道。

**派单与巡检经验（2026-11-12～13）**
- Agent 子代理也能在 Mac Mini 干活：子代理本身在 MacBook 启动，brief 写明命令用 `~/.claude/skills/macmini/scripts/mm '<命令>'` 在 Mini 执行（mm 不在 PATH，写全路径）。不要以"子代理只能本机跑"为由把任务留在本机。
- `fleet-go relaunch` 沿用原 run 的执行位置；原单是 `--on local` 的，重派前先判断能否改到 Mini，不要照抄。
- `relaunch` 读的是保存的 brief.md，不是 body.md；改了 body.md 要同步改 brief.md（或用 `amend`），否则重派仍按旧要求做。
- 巡检子单只给本会话派出的 run 下指令；已结束的 run 不发指令；有进度文件的长任务以进度文件的更新时间判断是否卡住，不按 2 小时规则强令收尾。
- Codex 偶发 `workspace routing discovery failed`，巡检单秒失败时主线程自己看 `fleet-go status` 和进度文件 mtime，不反复重派。
- 会话内定时（CronCreate session-only）随会话消失；交班时把定时原文写进交接文件，由新会话重建。
- run 结束或交班时，它启动的子进程会被一起停掉（11-13 cf-migrate 交班连带杀了后台复制进程）。要跨棒存活的长进程，从一开始就和 run 脱钩启动，并把 PID 和续传方法写进 checkpoint；批准交班前先确认这一点。

## 中途插话（沿用现有任务调整方向）
统一入口：`fleet say <任务> "新指令"` 或 `fleet-go amend <名字> --say "补充要求"`（`--restart` 只作最后兜底）。

| 执行者 | 插话方式 | 说明 |
|---|---|---|
| `gpt`（Codex，含 `--review`） | **同一轮里** `turn/steer`（每个任务自己的 `codex app-server`） | 失败降级为 SIGINT + `codex exec resume`（新一轮，同会话），再降级为 `--restart`；steer 被接受不等于立即停下正在执行的命令，已完成的写入撤不回 |
| `grok` | 停掉当前进程，用 `grok -r <sessionId>` 在**同一会话**续跑（新一轮，保留上下文） | 拿到 sessionId 之前拒绝，当前任务继续运行 |
| `claude`、`gemini`（网关与 SDK 任务） | 经收件箱送入运行中的任务 | `fleet say` 即可 |
| `jev` | 单次请求，无需插话 | |
| `fleet web`（网页版 ChatGPT） | `fleet web say <会话名> "追问"` | |
| `Agent` 工具里的 `executor-*` | `SendMessage` | 不属于 fleet |

`fleet team` / `fleet-go team` 一屏检查五产品能力、顺位参考和可用性，只显示登录/凭据存在状态，凭据值留在受控存储中。

> **派单前必读**
> 每次用 `/agent-fleet` 派单前、每次 Codex 任务完成后，主线程先跑 `node ~/Project/kcsx/macmini/yan-skills/agent-fleet/bin/fleet-archive-sweep.mjs`，定期扫掉漏归档线程。只归档 `originator=agent_fleet` 且已结束、闲置至少 10 分钟的线程；可 `--dry-run`，可用 `thread/unarchive` 回滚。运行中的任务仍出现在 Codex APP，结束后归档。
> ⓪ **默认用 `fleet-go new` 派单**（见下「快速派单」）：只写任务独有的正文，归类行、REPORT 行、授权覆盖、已知坑、验收、逐字规则句由它自动补全。任务正文直接交给模板拼装；需要完全自定义时才手写 brief + `fleet code`。
> ① 唯一正确写法：一条 Bash 调用，命令只含 `fleet-go new ...` 、`fleet-go relaunch <name>` 或 `fleet <子命令> brief.md ...`，工具参数 `run_in_background: true`（可重定向到输出文件）。
> ② 补救：发现已经用错，或新会话接手未结束任务，先 `fleet status --running --json`。
> 对每个 run 各开一条新的 Bash：`fleet wait <runId>`，工具参数 `run_in_background: true`，重新挂上完成通知。
> ③ 启动后自检：工具应返回「Command running in background with ID …」；输出文件持续有内容或任务仍是 running，而不是几秒内就 completed。
> 派出后台任务后，确认会话内半小时巡检已挂；规则和 CronCreate 示例见上文「巡检与换班」。

## 执行位置

默认在 Mac Mini 执行；Mini 任务的报告留在 Mini，用 `fleet-go read <名字或 runId>` 按需读取，`--pull` 显式拉回。brief 引用的 `~/.agent-reports/` 文件、`--body` 正文和可写目录先同步到 Mini：缺的补齐，本机较新的覆盖，并打印同步了哪些；其他路径缺失、同步失败或所选通道不可用时，自动在 MacBook 执行并记录原因。Mini 缺 brief 要用的命令（正文出现 kubectl、aws、gh、psql 等，或 `需要命令: a, b` 行列出的）时直接报错，不回退本机。**Mini 缺工具或凭据时派单补 Mini 环境，不改 `--on local`（紧急窗口单除外）**；查 Mini 有没有某命令用 `mm 'command -v X'` 或 `ssh mac-mini 'zsh -lc "command -v X"'`，裸 `ssh mac-mini` 的 PATH 不含 `/opt/homebrew/bin`，查不到不代表没装。需要 Claude 应用工具（Browser pane、MCP、`executor-*`、读取其他会话或 Claude 定时任务）、只有 MacBook 有登录态的网页后台、操作 Mini 自身，以及一两条命令的只读查询，留在 MacBook。浏览器自动化默认在 Mini 使用 opencli 或 agent-desktop；Mini Chrome 尚未登录目标站时退回 MacBook，并在报告列出需在 Mini 登录的站点。

首次使用前，在派单机设置 `FLEET_MINI_HOME`（Mini 家目录）和 `FLEET_MINI_BIN`（Mini 上 fleet 的绝对路径）；可选 `FLEET_LOCAL_HOME` 与 `FLEET_MINI_MM`。也可在本机 `~/.agent-fleet/mini.json` 配置 `remote_home`、`bin`、`local_home`、`mm`；环境变量优先。未配置或工作目录、引用路径在 Mini 不存在时回退本机，不创建空工作目录。显式 `--on local` 或 `FLEET_DEFAULT_ON=local` 沿用本机启动行为。

brief 引用的文件请写绝对路径；预检只检查绝对文件路径，相对路径和 API 路由不受影响，显式指定 `--on mini` 时不会回退。

## 快速派单（默认写法）
一条 Bash 调用，工具参数 `run_in_background:true`，命令保持单一前台调用；`fleet-go` 自身保持前台，完成即通知。正文只写独有内容（背景、要做的事、验收），其余样板自动带上。
```sh
# 改代码（允许范围：本地）
fleet-go new fix-card --to gpt --auth local --write /path/to/project --goal "修复卡片布局" <<'BRIEF'
卡片在手机窄屏上会溢出，希望内容能完整读到。可以改卡片和必要的相邻样式，保留其他人的现有改动；共享组件默认样式由主线程另行授权，先完成现有范围内的修复并报告剩余缺口。现有构建通过，窄屏上内容完整并适配视口宽度，就算做完。
BRIEF

# 同仓库独立任务使用独立 worktree
fleet-go new fix-other --to gpt --auth local --write /path/to/project --worktree --goal "修复另一处问题"

# 只读复核（checker）
fleet-go new review-card --to gpt --review --auth review --read /path/to/project --goal "复核 fix-card 的改动" <<'BRIEF'
fix-card 已修过手机卡片溢出，需要确认改动和报告是否对得上。只读这次改动和相关代码；缺少验收证据就列为未确认，文件保持原样。给出能否交付的结论，有必修项就说清原因。
BRIEF

# 部署生产（正文写齐目标、环境、回滚条件及回读清单，齐全后执行部署）
fleet-go new deploy-site --to gpt --luna --high --auth deploy-prod,readonly-web --goal "部署 <HEAD> 并回读" --body body.md

# 花钱生成（预算可选）
fleet-go new gen-test --to gpt --auth paid,local --goal "..." --body body.md

# 文案
fleet-go new page-copy --to gemini --goal "写 XX 页英文文案，正面表述" --body body.md
```
- review 的只读是 brief 约定：项目文件保持原样，允许联网、运行测试和脚本，只在自己的 `mktemp -d` 临时目录建删文件；各执行路径不加只读工具名单、沙箱或文件快照失败判定。SDK 使用 `bypassPermissions`，Codex 使用 `danger-full-access`，Grok 使用 `--always-approve`。JEV 只有结构化 API，没有命令执行器。
- `--to gpt|openai|claude|grok|gemini|jev` 必填；GPT 默认 Terra，`--sol` 选 Sol，`--simple` 是 Terra 的兼容别名，`--luna` 选 Luna；`--review` 默认 Terra，可用 `--sol` 显式选择 Sol，且不能与 `--luna` 同用。Luna 与 Gemini 默认 xhigh（Luna 可用 `--max`，Gemini 可用 `--low`/`--high`/`--xhigh`）；Terra/Sol 默认 medium。`--low` 可降档，`--low`、`--high`、`--xhigh` 与 `--max` 互斥。Codex 默认不开 fast，必要时显式 `--fast`。Claude `--tier haiku|sonnet|opus`，Grok `--model`/`--subagents`，Gemini `--bulk`。其余授权、预算与正文选项沿用。
- `--deliverables "产物：路径（上限 N KB 或行）"` 可多次传入，逐项写入验收段；可省略，lint 不强制要求。
- `--budget` 可选：用户给了预算与重试限制才传入并写进 brief；没给则不写、不设默认值。
- 需要本地提交时用 `--auth local-commit` 代替 `local`：允许在本地分支提交；与 `deploy-prod` 同传时推送、合入环境分支、流水线发布都已授权（执行者不得因“本块不含推送”停下），单独使用时不推送；验收报告要列提交哈希。可与 `readonly-web`、`paid` 组合；与 `local` 同传时取代 `local`。只读审查、生产部署仍用各自的授权块。
- `--make image` 叠加图片产物样板，沿用所选执行者：绝对输出目录、逐张编号文件名、尺寸比例、共享风格、纯画面（文字、字母、logo 与水印留空）、受阻时报告已完成部分与缺口、逐文件绝对路径/实际像素/字节数/alpha/方法回报。交付实际生成的图片；占位图、ASCII、纯色块或下载图按缺少生成产物报告。GPT 使用 imagegen 的 Codex `image_gen`；Grok 使用内置 `image_gen` / `image_edit`，这些工具没有 model 参数，仅传工具支持的输入，沿用工具自身模型。
- `--make video` 仅 Grok，用内置 `image_to_video` / `reference_to_video`，这些工具没有 model 参数，仅传工具支持的输入，沿用工具自身模型；ZDR/privacy 错误如实报告原因、处理方法与产物缺口。
- `--body body.md` 只接受现存文件路径；`--body -` 显式读取 stdin，也可以省略 `--body` 使用 heredoc。不存在的路径会明确报错。
- 重新拉起已有任务：`fleet-go relaunch <name> [--to <产品>] [--tier <档位>]`，沿用唯一同名 brief、`--name` 和 `--report`，由派用者显式决定执行者；仍有未结束同名任务时拒绝重复派发。改需求就改 `--body` 文件再 relaunch，新正文自动换进 brief、修订块保留；换不进时报错，不会拿旧 brief 空跑。跨日期重名时把名字换成报错给出的 brief 路径。
- 派单正文写固定字段 `动作: 只读 / 改代码 / 本地提交 / 推送 / 部署 / 付费`（仅列实际动作，可多选）；`fleet-go new --action '改代码 / 本地提交'` 可自动写入。缺动作行过渡期仅警告。动作决定授权：改代码需 local 或 local-commit；本地提交需 local-commit；推送、部署需 local-commit 和 deploy-prod；付费需 paid。
- 正文另写 `## 入口`，下一行 `仓库: /绝对路径`；只读只需仓库，其他动作还需 `可写路径: /绝对路径`。远程访问方式和凭据文件按任务需要自行写明。入口含“未知/自己找”必须显式加 `--sol`；`--no-lint` 只豁免样板检查，入口、动作和授权仍须匹配；重派沿用该设置。
- **先预览再派**：`fleet-go new ... --dry-run`（只打印 brief，命令写 stderr）；`--no-launch` 只写 brief 不派发；`fleet-go lint brief.md` 检查样板（归类行、REPORT 行、逐字规则句、允许范围小节、密钥字面量）。
- Codex app-server 两层续做闸门只针对缺失的硬性产物（文件、报告必需节、要求的提交哈希或读回结果）；覆盖未穷尽、补证和低置信度本身不触发续做。JEV 也只判断这些缺项。review 和文档类任务默认不续做；`--no-continue` 或 `FLEET_NO_CONTINUE=1` 可关闭，exec 路径同样适用，其他产品不适用。有进展就继续续做，不设次数上限；连续两次无进展停止；amend/steer/relaunch 行为不变。

- **改方向**：用 `fleet-go amend <name> "补充要求"`，它给 brief 顶部追加「修订 N」并（`--say`）尽量发给运行中的任务；Codex 优先同轮 steer，失败尝试中断后续会话；任务已结束（常见：部分完成交回）时 `--say` 直接按修订后的 brief relaunch（整条命令放 `run_in_background`），不必再单独 relaunch；运行中且两者都不可用时会提示，此时才考虑 `--restart`（只停止所选 run，按 runId/brief/`--name` 核验残留，最多等 60 秒、每 0.5 秒轮询，再走 `relaunch`，以 run 身份判断。超时已确认 stopped 且无同一 runId 存活时告警并重新拉起，否则保留修订并报错）。`amend --auth` 和 `--action` 可替换保存的授权与动作；路径冲突时可按提示用 `relaunch --after` 排队。调整沿用 `amend` / `relaunch` 保存的 brief 与任务身份。`amend` 和 `relaunch` 显式传 `--sol`、`--simple` 或 `--luna` 会替换并保存旧模型档位；显式传 `--low`、`--high`、`--xhigh` 或 `--max` 会替换保存的推理档位。同一次命令中的互斥选项仍不能同用；切到 Terra 时若未指定推理档位，会清除 Luna 专用的 xhigh/max。`amend` 的档位在重启或下次重派生效，运行中插话不会切换当前模型。
- 看进度：`fleet-go status`（默认非终态及最近 1 小时，`--all` 查看全部本地历史；脱离启动的任务带 ⚠；Mini 的单一次 ssh 批量取，取不到时 stderr 提示「Mini 状态未取到：超时/连接失败…」，此时只列本机）；仍可用 `fleet status --running --json`。
- 账本与打分：每个 run 结束自动往 `~/.agent-fleet/ledger.jsonl` 追加一行元数据；`fleet-go new` 可带 `--level L1-L4`、`--type`、`--for <被复核任务名>`，复核结论末尾写 `LEDGER: blockers=<n> verdict=<pass|fail|partial>`；`fleet-go score [--since 日期]` 按执行者输出计数。字段、配对、回填见[账本与 score](references/ledger.md)。
- 一个任务一次 Bash 调用；多个独立任务同一条消息里并行发多条 Bash。同一仓库多个写入任务各用 `--worktree`；同一个 worktree 只有一个写入者。worktree 建在入口「仓库:」上（没有才按 `--write` 推断，与 cwd 无关），子模块只初始化可写路径所在的那个，默认不拉。合回基础分支并推送后即收尾，清理 worktree 和本地功能分支。合并到环境分支仍在主克隆做。
- 已有 Claude Code 的 PreToolUse hook `~/.claude/hooks/check-fleet-launch.py`：命令里带 `fleet`/`fleet-go` 派单子命令又带 `&`、`nohup`、`setsid`、`disown` 会被直接拦下。
- 标准块在 `skill/templates/blocks/`（规则句由 `rule-sentence.md` 生成新句，校验兼容全局完整旧句；全局 `~/.claude/CLAUDE.md` §4.1a、§4.2 提供规则与报告的上下文），调整样板时在这里统一修改。

本机多模型任务入口：使用 `fleet` 运行 brief，结束后按实际产物验收。先核对目标模型当前配置、真实 Key 是否存在、工作目录信任边界和任务归属；配置读取用 `safe-grep` 或经 `redact`，只看名字、计数与存在状态。

## 命令速查

下表是保留的底层入口；新派单主推顶部的 `fleet-go new --to ...`。

| 命令 | 用途 |
|---|---|
| `fleet copy brief.md [--low\|--high]` | Gemini 文案、翻译（默认 xhigh） |
| `fleet grok brief.md` | Grok 调研 |
| `fleet grok-cli brief.md [--review] [--model id]` | 本机 xAI 完整编码 Agent，默认由当前执行者完成；详见 [Grok CLI](references/grok-cli.md) |
| `fleet web start/say/close/list`；兼容 `fleet web "问题" [--followup "追问" ...] [--close]` | 网页版 ChatGPT，少量串行问答 |
| `fleet bulk brief.md [--low\|--high]` | Gemini 批量文案处理（默认 xhigh） |
| `fleet gpt brief.md` | 托管 GPT 任务 |
| `node ~/Project/kcsx/macmini/yan-skills/agent-fleet/bin/fleet-archive-sweep.mjs [--dry-run]` | 派单前及 Codex 完成后补扫归档 |
| `fleet code brief.md [--simple|--sol|--luna] [--fast] [--low|--high|--xhigh|--max] [--cwd dir]` | 默认 Terra；`--sol` Sol、`--simple` Terra 兼容别名、`--luna` Luna；Luna 默认 xhigh、可用 --max；Terra/Sol 默认 medium；不设 fast |
| `fleet code brief.md --review` | 本机 Codex 只读审查 |
| `fleet haiku\|sonnet\|opus brief.md` | Claude 官方端点直连，走订阅附赠的每月 API 额度（`ANTHROPIC_CREDIT_API_KEY`；用户级 key 另需 `ANTHROPIC_WORKSPACE_ID`，见 .env.example），**使用独立于 Claude App 的用量**；Claude 侧任务优先走这里 |
| `fleet judge state.txt questions.json` | JEV 结构化判断 |
| `fleet run --model name --prompt "任务"` | 旧的完整模型入口 |
| `fleet run-many --config batch.json` | 批量任务 |
| `fleet status` / `fleet tail [--follow]` | 看任务和日志 |
| `fleet say latest "消息"` | 向运行中的任务插话（Codex 优先同轮 steer，降级为中断后续会话；网关 streaming input，Grok sessionId 续跑） |
| `fleet stop latest` / `fleet resume latest` | 收尾或续跑 |
| `fleet list-models` / `fleet help` | 看配置或用法 |
| `fleet media list` | 看 Kollab 当前托管的图片、视频、音频、视觉工具与必填参数 |
| `fleet media run <tool> --model <id> --prompt "..." [--input-json '{}'] [--out dir]` | 调用托管多模态工具并落盘 |
| `fleet media models [--source openrouter] [--search text]` | 查 Kollab 模型目录 |

`brief` 若是现存文件路径就读取内容，否则作为任务文本。短命令和 `run` 默认当前目录、持续运行至结束、安静写日志；`--verbose` 输出进度。`--cwd`、`--max-turns`、`--system-prompt` 等可显式指定。旧的 `agent-fleet run ...` 写法仍可用。完整结果在 `~/.agent-fleet/runs/*.result.md`，过程在同名 `.log`；stdout 默认只给简报。

多模态认证优先用 `KOLLAB_API_KEY` 或 `KOLLAB_STANDALONE_API_KEY`（`kollab api-key create` 获取），其次用进程级 `KOLLAB_API_TOKEN` 或 `kollab login` 会话；TEST 必须显式设置 `KOLLAB_API_URL`，使用独立的 TEST profile。先运行 `fleet media list` 看实时支持清单和模型 id，再用 `fleet media run generate_image --model <id> --prompt "一只猫"`；默认文件写入当前目录 `fleet-media/`。其他工具按清单传 `--input-json` 的必填字段，详见 [多模态用法](references/media.md)。普通配图也可用 imagegen。

`models.config.json` 的可选字段 `maxOutputTokens` 必须是正整数，限制该模型每次请求的最大输出 token 数；fleet 将它传为 `CLAUDE_CODE_MAX_OUTPUT_TOKENS`，未配置则沿用默认值。Kollab 网关条目统一设为 16000。
Kollab 网关 402 会话预算：本小时预算按首次请求时的余额定死，充值后要到下一个整点（UTC）才放开；期间用 `maxOutputTokens` 限制即可通过（仍须有足够预算）。

## Grok CLI 收尾与续跑

使用 streaming-json，cost/turns 为 Grok 自报；保存 stopReason/sessionId/usage。退出码 0 仍可能 cancelled（无头工具批准被取消），非 end_turn 判 fail，无明确最终结论判 suspect。review 使用自动批准避免取消；本机沙箱不生效，只读靠 brief 约定，允许联网、临时脚本和测试，不因文件变化判 suspect。`fleet say` / `fleet-go amend --say` 停当前 Grok 进程并以 sessionId 续会话，`fleet resume` 同理，沿用 name/report。代理 HTTPS_PROXY/HTTP_PROXY/ALL_PROXY 及小写原样透传，Rust 不认 NODE_USE_ENV_PROXY；详见 [Grok CLI](references/grok-cli.md)。

## 路由原则（长期）

Terra 与 Sol 派单前问两句：brief 能否写清具体文件、入口和完成条件？做错能否便宜地重来？两句都是“能”用 Terra，任一句“不能”用 Sol（用户 2026-11-11）。成本、额度、并发或用户点名时可以改派。

| 任务 | 默认执行者 |
|---|---|
| 两问都是“能”（编码、复核、按已知源调研、机械改动） | Codex Terra，`--to gpt`，medium，不开 fast |
| 任一问“不能”（要自己摸入口、跨系统多步编码、总管、删除数据、新写或大改发布脚本、Terra 已交回过的单） | 开派即用 Sol，`--to gpt --sol`（用户 2026-11-11） |
| 发布、部署推进（跑现成流水线、合并分支、等 CI/部署、回读、生产实测、写更新日志），不写代码 | Luna，`--to gpt --luna --high`；不用 Terra/Sol（用户 2026-11-11：“这种没必要用 terra 或者 sol”） |
| 改部署配置、写部署脚本（要写代码） | Codex Terra，`--to gpt`，medium |
| 巡检、监工、定时、核对整理（比 Haiku 复杂、不需要编码） | Luna，`--to gpt --luna --high`（或默认 xhigh），不开 `--max`（用户 2026-11-11） |
| 调研、搜索、技术文档、报告、数据整理、一般任务 | 默认 Codex Terra，`--to gpt`；首派仍按上面的两问判断 |
| 文案、翻译、多语言、校对 | Gemini，`fleet copy`（批量用 `fleet bulk`） |
| UI、样式、视觉交互、建站设计、3D、游戏内容 | `fleet sonnet`；要 Browser pane 用 `executor-sonnet` |
| 方案、架构、方向未明的综合判断 | Claude Code Agent 工具，`subagent_type=executor-fable`；brief 须带“这个代码库是你的，做成什么样你说了算，以后也是你接着维护。” |
| 较难的编程、Sonnet 反复打转 | `fleet opus` |
| 小杂活、摘要、核实、机械替换、取证 | `fleet haiku`（要 Browser pane/MCP 用 `executor-haiku`） |
| 视频、图片备选、X 热点与社媒实时检索、成人题材 | Grok |
| 分类、是否、打分、成败校验 | JEV（`fleet judge`），置信度低于约 0.55 交回 |
| 登录态浏览器采集（GSC、Semrush 等） | 现成脚本或 opencli adapter；缺脚本先让 Claude 写脚本再沉淀 |

- Terra 单 30 分钟无新产物或两轮续做无进展，巡检直接改派 Sol，不再续做。
- Claude 档先走 `fleet haiku|sonnet|opus`（订阅附赠的月度 API 额度），需要本应用工具、MCP、Browser pane、ccd_* 或本机登录态时才用 `executor-*`；用 Agent 工具每次显式传 `model`。
- Codex 一律不开 fast，需要才显式 `--fast`。`--to openai`（OpenAI API 额度）不用 Sol、不开 fast，偏慢，适合不急的正经编程。
- 设计稿由 Claude 出，按稿实施的编码可以交 Terra。
- 严苛架构或硬性指标多轮达不到时，先派 Fable 出方案再派执行者，不让原执行者空转。
- 执行者拒绝或不肯改时，改派下一顺位；Gemini 只承接文案、翻译和校对。
- 工具不可用时按 [工具链](references/fallback-chains.md) 从左往右换手；用户点名优先。临时的停用、省着用、额度重置只记在顶部[调遣令](#当前调遣令自动注入优先于下文所有路由与顺位)，这里的顺位是长期的。


## 失败上报与派用者顺位参考

失败上报给派用者：verdict 为 `fail`，结果文件和简报只记录执行者与档位、脱敏原始错误摘要（stderr 末尾、HTTP 状态、结构化错误）、已完成步骤、产物与 dirty 状态。错误分类、后续建议与执行者选择由派用者负责。

下面的顺位表只供派用者自行判断，代码不消费：
- Claude 额度档：按任务类型与工具链换手。
- **工具不可用或并发满**：按[工具链](references/fallback-chains.md)换手；编码由 Grok 或 Claude 承接，不派 Gemini。
- GPT 档顺位与换班条件统一见[路由原则](#路由原则长期)。

派用者决定后，用 `fleet-go relaunch <name> --to <产品> [--tier haiku|sonnet|opus] [--simple|--sol|--luna] [--low|--high|--xhigh|--max] [--fast]` 沿用 brief、name 与 report 重派。成功任务不产生失败上报。

## 产品与任务边界

按顶部五产品速查表派单。Luna 与 Gemini 默认 xhigh（Luna 可用 `--max`，Gemini 可用 `--low`/`--high` 覆盖）；Terra/Sol 默认 medium；Codex 默认不开 fast，必要时显式开启。严苛架构或成本收缩、清理速度每秒 1000 行等硬性指标多轮仍达不到时，派 executor-fable 子代理调研方案，再派执行者。

文案遵守 [文案语气规范](references/copy-voice.md)，Gemini 自动注入，brief 给事实清单与允许范围；纯机械改写可用 `--no-voice`。编码与只读复核见 [Codex 编程与 review](references/codex-coding.md)。范围以本次 brief 的一个目标、授权与验收为准，相关改动可做，无关线索只列出。最终回复约 15 行，长内容写入 REPORT；退出码与实际验收分开记录。

## /design 画布：设计与上传分工

画布文件（`.dc.html`、css、`canvas.json` 改动）由 `fleet sonnet`（难的 `fleet opus`）写到本地目录；fleet 通道负责本地文件产出，Artifact 上传权限由下述执行者持有。上传由内置 `executor-haiku`（Agent 工具）用 Artifact 工具按目录逐页发布，便宜且有权限。同一画布的上传一次只派一个 haiku，保证 `canvas.json` 合并不冲突。画布 brief 带上[派单纪律](references/dispatch-discipline.md#design-画布)的页面组织和 Design System 规则。

## 行动范围

一单只做 brief 指定的一个目标及必要改动，方法由执行者选择；小障碍记入报告「偏差」，先完成授权内可交付部分，再报告授权或必需输入的缺口。完整规则与自动注入的逐字范围句见 [行动范围](references/operations.md#行动范围)。

## 简报与验收

**简报怎么写**：像交代给刚接手的同事，用大白话讲清背景、想要的结果、允许范围、缺口处理和完成条件；按任务需要伸缩，把做法留给执行者。正文补充任务独有的上下文和已知坑，其余复用自动样板，一单只围绕一个目标。完整规则见[派单纪律](references/dispatch-discipline.md#brief)；授权与模板保持一致，本地提交选上面的 `local-commit`。 配置与环境变量的读取动作统一遵循 [密钥输出已知坑](templates/blocks/pitfall-secrets.md)，默认使用 `safe-grep` / `redact`。

| verdict | 含义与处理 |
|---|---|
| `ok` | 正常结束；按任务核对产物和测试 |
| `partial` | 到轮数上限但已有改动；验收现有产物或 `resume` |
| `suspect` | 疑似假成功或要求改动却零改动；核对结果和 diff |
| `needs-review` | JEV 置信度不足；人工核对 |
| `fail` | 执行失败、空结果或裸控制 token；看错误后修复 |
| `stopped` | 已收尾中断；检查已完成部分 |

`ok` 说明进程结果；交付成功还须通过任务验收。空结果、裸 tool-call 控制 token、`suspect` 或 `fail` 按实际缺口处理。核对 brief、产物和要求的检查；`dirty` 和 `commits` 也可能包含同一工作树里其他人的改动。细节见 [README](../README.md)。

## 详细派单规则

启动与跨会话接续、网页 ChatGPT、brief 路径核实及安全边界见 [操作细则](references/operations.md)；brief、报告、复核与总管见[派单纪律](references/dispatch-discipline.md)。

## JEV judge

`fleet judge state.txt questions.json [--json]` 做结构化判断，问题可用 `noul`、`choice` 或 `score`；后两者必须给 `criteria`。完整格式与示例见 [JEV 用法](references/judge.md)。
