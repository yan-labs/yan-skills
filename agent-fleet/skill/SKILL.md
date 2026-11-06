---
name: agent-fleet
description: 使用本机 fleet 分派 Codex GPT-6.1 Sol、Gemini、Grok 或 JEV 任务，或调用 Kollab 图片/视频/音频/多模态能力时使用；包括用户点名 agent-fleet、Nano Banana、nanobanana、香蕉、便宜模型、多模型并行，用户说“让 Codex 或 GPT-6.1 Sol 做某事”的编码、调研与 review 派单，以及按全局 CLAUDE.md §2 路由任务。只做单一模型的直接任务且无需 fleet 时不触发；用户明确要直接操作 Codex CLI 原生命令（自选 sandbox、codex review、apply、resume）时用 codex Skill；普通生成图片也可用 imagegen。
---

# agent-fleet

| 让谁做 | 适合什么 | 命令示例 | 派用者顺位参考 |
|---|---|---|---|
| `gpt` | 正常开发与编程用 Terra（`--simple`）；非常严谨、内容紧密的开发才用 Sol；最简单、边界清楚且可机械验证的改名、小修、格式化、按清单核对和摘要用 Luna（`--luna`）；带逻辑的改动用 Terra/Sol | `fleet-go new fix --to gpt --simple --auth local --goal "修复问题" --body task.md` | 周用量 ≥ 95% 改 Gemini 4 |
| `openai` | 官方 GPT API / ChatGPT 关联组织额度，复用原 Agent SDK | `fleet-go new task --to openai --auth local --goal "目标" --body task.md` | 单独入口，不改 Codex 默认 |
| `claude` | Claude 月度额度任务；默认 sonnet | `fleet-go new check --to claude --tier haiku --goal "复核报告" --body task.md` | 按额度规则选择 Terra 或 Gemini |
| `grok` | 视频与图片（生成、搜索）、X 平台（热点与实时讨论）、X/社媒实时检索、成人题材；默认不派编码与代码复核（优先级安排） | `fleet-go new trend --to grok --goal "整理 X 热点" --body task.md` | 按任务与额度选择 Gemini |
| `gemini` | 文案、翻译、摘要、批量任务与编码；默认 Gemini 4 `gemini-4-argon`，经 Claude Agent SDK | `fleet-go new copy --to gemini --goal "写页面文案" --body task.md` | Codex 周用量 ≥ 95% 时使用 |
| `jev` | 分类、选择、打分等结构化判断 | `fleet-go new decide --to jev --goal "按正文判据分类" --body task.md` | — |

## OpenAI 订阅 API 额度

`fleet-go new <name> --to openai --auth local --goal "任务" --body task.md`，或 `fleet openai task.md`。默认官方 `gpt-6.1-terra`，凭据变量 `OPENAI_CREDIT_API_KEY` 仅放本目录 `.env`（0600）；不在 brief、命令、报告中填 Key。现有 `--to gpt` / `fleet code` 仍是 Codex，不自动改路由。

此入口复用 Claude Agent SDK 的本地工具、会话、收件箱、resume 与报告；每个 run 临时启动仅本机可访问的 Anthropic Messages→OpenAI Responses 适配器，官方 Key 只在父进程内发往 `https://api.openai.com/v1`，SDK 只拿临时本地 token，结束关闭适配器。不强制 fast，不经 Kollab 网关，不使用 Codex API Key 通道。

先在 ChatGPT/API Billing 激活并关联正确 API 组织，Key 必须属于该组织；普通 API 成功不等于赠送额度已到账。赠送额度先用，但耗尽后若有已购买余额仍可能继续扣费，不承诺“只用赠送额度”。是否到账/到期/实扣以平台 Credit grants 和 Usage 为准，不自动充值或更改套餐。官方说明：https://help.openai.com/zh-hans-cn/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions 。

轻量适配的实现范围与开源参考见 [OpenAI桥接说明](references/openai-bridge.md)。

## 时间盒（单任务连续运行 ≤ 6 小时）
`fleet-go new` 自动带 `time-box` 块：执行者约 5 小时写 `~/.agent-reports/<日期>/<名字>.checkpoint.md` 快照并结束回合。派总管/长任务时主线程同时登记 +6h 的一次性定时检查（CronCreate），到点仍在跑就 `fleet stop <run>` → 读快照 → `fleet-go amend <名字> --say "你是接力的新总管，先重建快照……"` 起新 run；不靠执行者自觉，也不轮询。全局规则见 `~/.claude/CLAUDE.md` §3.2。

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

## 快速派单（默认写法）
一条 Bash 调用，工具参数 `run_in_background:true`，命令保持单一前台调用；`fleet-go` 自身保持前台，完成即通知。正文只写独有内容（背景、要做的事、验收），其余样板自动带上。
```sh
# 改代码（允许范围：本地）
fleet-go new fix-card --to gpt --simple --auth local --write /path/to/project --goal "修复卡片布局" <<'BRIEF'
卡片在手机窄屏上会溢出，希望内容能完整读到。可以改卡片和必要的相邻样式，保留其他人的现有改动；共享组件默认样式由主线程另行授权，先完成现有范围内的修复并报告剩余缺口。现有构建通过，窄屏上内容完整并适配视口宽度，就算做完。
BRIEF

# 只读复核（checker）
fleet-go new review-card --to gpt --review --auth review --read /path/to/project --goal "复核 fix-card 的改动" <<'BRIEF'
fix-card 已修过手机卡片溢出，需要确认改动和报告是否对得上。只读这次改动和相关代码；缺少验收证据就列为未确认，文件保持原样。给出能否交付的结论，有必修项就说清原因。
BRIEF

# 部署生产（正文写齐目标、环境、回滚条件及回读清单，齐全后执行部署）
fleet-go new deploy-site --to gpt --simple --auth deploy-prod,readonly-web --goal "部署 <HEAD> 并回读" --body body.md

# 花钱生成（预算可选）
fleet-go new gen-test --to gpt --auth paid,local --goal "..." --body body.md

# 文案 / 调研
fleet-go new page-copy --to gemini --goal "写 XX 页英文文案，正面表述" --body body.md
```
- review 的只读是 brief 约定：项目文件保持原样，允许联网、运行测试和脚本，只在自己的 `mktemp -d` 临时目录建删文件；各执行路径不加只读工具名单、沙箱或文件快照失败判定。SDK 使用 `bypassPermissions`，Codex 使用 `danger-full-access`，Grok 使用 `--always-approve`。JEV 只有结构化 API，没有命令执行器。
- `--to gpt|openai|claude|grok|gemini|jev` 必填；GPT 的 `--simple` 选 Terra，`--luna` 选 Luna，二者均不能与 `--review` 同用。Luna 默认 xhigh、可用 `--max`；Terra/Sol 默认 medium。`--low` 可降档，`--low`、`--high`、`--xhigh` 与 `--max` 互斥。Codex 默认不开 fast，必要时显式 `--fast`。Claude `--tier haiku|sonnet|opus|fable`，Grok `--model`/`--subagents`，Gemini `--bulk`。其余授权、预算与正文选项沿用。
- `--budget` 可选：用户给了预算与重试限制才传入并写进 brief；没给则不写、不设默认值。
- 需要本地提交时用 `--auth local-commit` 代替 `local`：允许在本地分支提交；与 `deploy-prod` 同传时推送、合入环境分支、流水线发布都已授权（执行者不得因“本块不含推送”停下），单独使用时不推送；验收报告要列提交哈希。可与 `readonly-web`、`paid` 组合；与 `local` 同传时取代 `local`。只读审查、生产部署仍用各自的授权块。
- `--make image` 叠加图片产物样板，沿用所选执行者：绝对输出目录、逐张编号文件名、尺寸比例、共享风格、纯画面（文字、字母、logo 与水印留空）、受阻时报告已完成部分与缺口、逐文件绝对路径/实际像素/字节数/alpha/方法回报。交付实际生成的图片；占位图、ASCII、纯色块或下载图按缺少生成产物报告。GPT 使用 imagegen 的 Codex `image_gen`；Grok 使用内置 `image_gen` / `image_edit`，这些工具没有 model 参数，仅传工具支持的输入，沿用工具自身模型。
- `--make video` 仅 Grok，用内置 `image_to_video` / `reference_to_video`，这些工具没有 model 参数，仅传工具支持的输入，沿用工具自身模型；ZDR/privacy 错误如实报告原因、处理方法与产物缺口。
- `--body body.md` 只接受现存文件路径；`--body -` 显式读取 stdin，也可以省略 `--body` 使用 heredoc。不存在的路径会明确报错。
- 重新拉起已有任务：`fleet-go relaunch <name> [--to <产品>] [--tier <档位>]`，沿用唯一同名 brief、`--name` 和 `--report`，由派用者显式决定执行者；仍有未结束同名任务时拒绝重复派发。
- **先预览再派**：`fleet-go new ... --dry-run`（只打印 brief，命令写 stderr）；`--no-launch` 只写 brief 不派发；`fleet-go lint brief.md` 检查样板（归类行、REPORT 行、逐字规则句、允许范围小节、密钥字面量）。
- Codex app-server 默认使用两层续做闸门：部分完成、报告七节缺失或 brief 要求的提交哈希/读回结果缺失，直接同线程继续；写完成且规则放行后，用现有 JEV 判断验收证据、授权内剩余步骤和中途自查，并将具体缺项带回。置信度低于 0.55 只额外继续一次；JEV 不可用按规则结果走。最多续做 3 次，连续两次没有新提交、文件内容或报告变化时停止；结果记录每次进展及裁判结论/置信度，最终仍有缺项则 verdict 为 partial。`--no-continue` 或 `FLEET_NO_CONTINUE=1` 可关闭，review、exec 兜底与其他产品不适用；用户 amend/steer/relaunch 行为不变。脱离启动的运行中任务按监督器对应的执行进程和收件箱插话，嵌套 fleet 不继承外层任务身份；送不进会报告具体缺口。

- **改方向**：用 `fleet-go amend <name> "补充要求"`，它给 brief 顶部追加「修订 N」并（`--say`）尽量发给运行中的任务；Codex 优先同轮 steer，失败尝试中断后续会话；任务已结束（常见：部分完成交回）时 `--say` 直接按修订后的 brief relaunch（整条命令放 `run_in_background`），不必再单独 relaunch；运行中且两者都不可用时会提示，此时才考虑 `--restart`（只停止所选 run，按 runId/brief/`--name` 核验残留，最多等 60 秒、每 0.5 秒轮询，再走 `relaunch`，以 run 身份判断。超时已确认 stopped 且无同一 runId 存活时告警并重新拉起，否则保留修订并报错）。调整沿用 `amend` / `relaunch` 保存的 brief 与任务身份。`amend --luna` 保存 Luna 档位，重启或下次重派生效，运行中插话不会切换当前模型。
- 看进度：`fleet-go status`（默认非终态及最近 1 小时，`--all` 查看全部本地历史；脱离启动的任务带 ⚠）；仍可用 `fleet status --running --json`。
- 一个任务一次 Bash 调用；多个独立任务同一条消息里并行发多条 Bash。同一份共享工作树按单写入者串行执行。
- 已有 Claude Code 的 PreToolUse hook `~/.claude/hooks/check-fleet-launch.py`：命令里带 `fleet`/`fleet-go` 派单子命令又带 `&`、`nohup`、`setsid`、`disown` 会被直接拦下。
- 标准块在 `skill/templates/blocks/`（规则句由 `rule-sentence.md` 生成新句，校验兼容全局完整旧句；全局 `~/.claude/CLAUDE.md` §4.1、§4.2 提供规则与报告的上下文），调整样板时在这里统一修改。

本机多模型任务入口：使用 `fleet` 运行 brief，结束后按实际产物验收。先核对目标模型当前配置、真实 Key 是否存在、工作目录信任边界和任务归属；配置读取用 `safe-grep` 或经 `redact`，只看名字、计数与存在状态。

## 命令速查

下表是保留的底层入口；新派单主推顶部的 `fleet-go new --to ...`。

| 命令 | 用途 |
|---|---|
| `fleet copy brief.md` | Gemini 文案、翻译 |
| `fleet grok brief.md` | Grok 调研 |
| `fleet grok-cli brief.md [--review] [--model id]` | 本机 xAI 完整编码 Agent，默认由当前执行者完成；详见 [Grok CLI](references/grok-cli.md) |
| `fleet web start/say/close/list`；兼容 `fleet web "问题" [--followup "追问" ...] [--close]` | 网页版 ChatGPT，少量串行问答 |
| `fleet bulk brief.md` | Gemini 批量处理 |
| `fleet gpt brief.md` | 托管 GPT 任务 |
| `node ~/Project/kcsx/macmini/yan-skills/agent-fleet/bin/fleet-archive-sweep.mjs [--dry-run]` | 派单前及 Codex 完成后补扫归档 |
| `fleet code brief.md [--simple|--luna] [--fast] [--low|--high|--xhigh|--max] [--cwd dir]` | 默认 Sol；`--simple` Terra、`--luna` Luna；Luna 默认 xhigh、可用 --max；Terra/Sol 默认 medium；不设 fast |
| `fleet code brief.md --review` | 本机 Codex 只读审查 |
| `fleet haiku\|sonnet\|opus\|fable brief.md` | Claude 官方端点直连，走订阅附赠的每月 API 额度（`ANTHROPIC_CREDIT_API_KEY`；用户级 key 另需 `ANTHROPIC_WORKSPACE_ID`，见 .env.example），**使用独立于 Claude App 的用量**；Claude 侧任务优先走这里 |
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

## 失败上报与派用者顺位参考

失败上报给派用者：verdict 为 `fail`，结果文件和简报只记录执行者与档位、脱敏原始错误摘要（stderr 末尾、HTTP 状态、结构化错误）、已完成步骤、产物与 dirty 状态。错误分类、后续建议与执行者选择由派用者负责。

下面的顺位表只供派用者自行判断，代码不消费：
- Claude 额度档：按任务和以下 Codex 额度规则选择 Claude、Terra 或 Gemini。
- **Codex 周额度 ≥ 95% 或用尽**：派单前读取 `~/.codex/sessions/<今天>/` 最新 rollout 的 `rate_limits.primary`（`window_minutes=10080`）的 `used_percent`；达到 95% 或用尽时不再派 Terra/Sol/Luna，改用 `fleet-go new --to gemini`（默认 Gemini 4 `gemini-4-argon`，经 Claude Agent SDK，编码也可做）。Gemini 约 10 万美元免费额度、剩约 4–6 万美元且会过期，可放开使用；余额以实际为准。非非常重要的编程交 Gemini 4，非常重要的编程交 Claude 子代理 Sonnet，难的用 Opus。额度用尽可让 Kollab 派任务执行充值脚本，付款前须先与用户确认金额。
- GPT 档：正常开发 Terra（`--simple`）→ 非常严谨、内容紧密的开发才用 Sol（medium、不开 fast，默认不派）→ 周用量 ≥ 95% 改 Gemini 4；最简单、边界清楚且可机械验证的改名、小修、格式化、按清单核对和摘要用 Luna（`--luna`）；带逻辑的改动用 Terra/Sol。

派用者决定后，用 `fleet-go relaunch <name> --to <产品> [--tier haiku|sonnet|opus|fable] [--simple|--luna] [--low|--high|--xhigh|--max] [--fast]` 沿用 brief、name 与 report 重派。成功任务不产生失败上报。

## 产品与任务边界

按顶部五产品速查表派单。Luna 默认 xhigh、可用 `--max`；Terra/Sol 默认 medium；Codex 默认不开 fast，必要时显式开启。严苛架构或成本收缩、清理速度每秒 1000 行等硬性指标多轮仍达不到时，派 executor-fable 子代理调研方案，再派执行者。

文案遵守 [文案语气规范](references/copy-voice.md)，Gemini 自动注入，brief 给事实清单与允许范围；纯机械改写可用 `--no-voice`。编码与只读复核见 [Codex 编程与 review](references/codex-coding.md)。范围以本次 brief 的一个目标、授权与验收为准，相关改动可做，无关线索只列出。最终回复约 15 行，长内容写入 REPORT；退出码与实际验收分开记录。

## /design 画布：设计与上传分工

画布文件（`.dc.html`、css、`canvas.json` 改动）由 `fleet sonnet`（难的 `fleet opus`）写到本地目录；fleet 通道负责本地文件产出，Artifact 上传权限由下述执行者持有。上传由内置 `executor-haiku`（Agent 工具）用 Artifact 工具按目录逐页发布，便宜且有权限。同一画布的上传一次只派一个 haiku，保证 `canvas.json` 合并不冲突。画布 brief 带上全局 CLAUDE.md §5.8 的页面组织和 Design System 规则。

## 行动范围

一单只做 brief 指定的一个目标及必要改动，方法由执行者选择；小障碍记入报告「偏差」，先完成授权内可交付部分，再报告授权或必需输入的缺口。完整规则与自动注入的逐字范围句见 [行动范围](references/operations.md#行动范围)。

## 简报与验收

**简报怎么写**：像交代给刚接手的同事，用大白话讲清背景、想要的结果、允许范围、缺口处理和完成条件；按任务需要伸缩，把做法留给执行者。正文补充任务独有的上下文和已知坑，其余复用自动样板，一单只围绕一个目标。完整规则以 [~/.claude/CLAUDE.md §4.1a](/Users/kcsx/.claude/CLAUDE.md) 为准；授权与模板保持一致，本地提交选上面的 `local-commit`。 配置与环境变量的读取动作统一遵循 [密钥输出已知坑](templates/blocks/pitfall-secrets.md)，默认使用 `safe-grep` / `redact`。

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

启动与跨会话接续、网页 ChatGPT、brief 路径核实及安全边界见 [操作细则](references/operations.md)。

## JEV judge

`fleet judge state.txt questions.json [--json]` 做结构化判断，问题可用 `noul`、`choice` 或 `score`；后两者必须给 `criteria`。完整格式与示例见 [JEV 用法](references/judge.md)。
