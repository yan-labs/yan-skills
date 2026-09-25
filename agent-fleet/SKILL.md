---
name: agent-fleet
description: 通用多模型子任务执行工具。用户想把一个任务派给别的模型(Gemini、DeepSeek、Kimi/Moonshot,或任何 Anthropic 兼容端点)去跑,尤其是想同时并行跑好几个不同模型的任务("同时起一个 Gemini 写文案的任务和一个 DeepSeek 做调研的任务""这个用 Kimi 跑""帮我用 DeepSeek 头脑风暴一下""开几个后台任务分别用不同模型跑")时使用。底层用 Claude Agent SDK 驱动一个 bypassPermissions 的自主 Agent(能读写文件、跑 bash、多轮工具调用直到任务完成),纯本地执行,不经过任何 Kollab 基础设施,模型接的是用户自己配置的第三方 API key。
---

# agent-fleet

把一个任务派给别的模型去跑,而不是自己动手。核心命令:

```bash
cd agent-fleet

# 单个任务(委派一整个自主任务:读写文件、跑 bash、多轮工具调用直到完成)
node bin/agent-fleet.mjs run --model <友好名字> --prompt "<任务描述>" [--cwd <目录>] [--json]

# 一次并发跑一批不同模型的任务
node bin/agent-fleet.mjs run-many --config batch.json [--json]

# 结构化决策(JEV/System One 专用,不生成文本、不支持多轮工具调用,不能用 run)
node bin/agent-fleet.mjs judge --model jev --state-file <path> --questions-file <path> [--json]

# 看有哪些模型可用、密钥配没配
node bin/agent-fleet.mjs list-models
```

`<友好名字>` 来自 [`models.config.json`](./models.config.json),当前预置:`deepseek-v4-pro`、
`deepseek-v4-flash`、`kimi`、`gemini`(Gemini 没有官方 Anthropic 兼容端点,需要用户自己填一个网关
地址才能用,不填直接报错,不会假装能跑),以及 `kollab-gateway` 系列(走 Kollab 自己的公开 LLM
网关,用账号自助生成的 `kollab_live_*` key,不用等第三方审批,即用即验证过):
`kollab-gateway`(默认 `gemini-3.8-flash`)、`kollab-gateway-copy`(文案/创意,同样是
`gemini-3.8-flash`)、`kollab-gateway-research`(调研摘要,`grok-4.6`)、`kollab-gateway-bulk`
(批量机械任务,`gemini-3.5-flash-lite`)。

**`jev`(Typesafe JEV / System One)是完全不同的一类,不能用 `run`**:它是结构化决策 API,不生成
文本、不支持多轮工具调用(协议自证:`POST /v1/messages` 返回 404,没有实现 Anthropic Messages
协议),只吃一段 `state` + 类型化 `questions`(`noul`/`choice`/`score`),返回校准过的结构化答案
(选项、概率、打分)。适合自动化流程里的判断/路由节点——分类、打分、二元判断、"多步骤 Agent 循环
里下一步该选哪个候选"(2026-09-25 真实验证,复刻了 wy-coliney/jev-browser-use 的用法,喂
accessibility-tree 文本 + 候选动作做 `choice`);不适合代码生成、开放式写作、总结、图片理解、
浏览器操作本身。用专门的 `judge` 子命令调用,不要尝试 `run --model jev`(会被协议闸门直接拒绝)。
极便宜(≈$0.042/百万 input token,output 免费)、结果高度稳定,协议上结构性不存在"裸 tool-call
控制 token"这类失败模式。完整实测结论表见 README「JEV / `judge` 子命令」一节。

**用户想同时跑多个不同模型的任务时**,优先用 `run-many` 一次性提交(内部真正并发跑完),而不是
自己手写多次串行调用,或者对每个模型分别开一个后台 shell 进程——除非用户明确要求那种交互方式。

**按任务类型选模型**:批量文案/创意 → `kollab-gateway-copy`(或有 DeepSeek key 时用
`deepseek-v4-flash`);批量翻译/格式转换 → `kollab-gateway-bulk`(或 `deepseek-v4-flash`);
简单调研摘要 → `kollab-gateway-research`(或有 Moonshot key 时用自带联网搜索的 `kimi`);
高质量单次产出(长文案定稿、复杂推理)→ `deepseek-v4-pro`;**多轮工具调用容错要求高的任务不要
派给第三方模型**,留给 Claude 自己处理(Kimi/DeepSeek/Qwen 家族已知有 tool-calling 可靠性问题,
可能吐出裸的 tool-call 控制 token 而不是结构化 `tool_use`,造成假成功,harness 修不了)。这份
对应关系是 agent-fleet 自己调研 + 真实验证后得出的建议,会随实际使用持续校准,不是写死的规则,
完整版和已知模型目录见 [`README.md`](./README.md) 的「任务类型 → 推荐模型」一节。

**首次使用前**必须确认 `agent-fleet/.env` 里已经配好对应模型的真实 API key(`cp .env.example .env`
之后手动填),没配的话 `run`/`run-many` 会直接报出清晰的"哪个环境变量没设置",不会静默失败。

**关于 `--cwd` 的安全约束**:目标工作目录被当作**不可信输入**。如果那个目录自带的
`.claude/settings.json` 试图改模型请求的目标地址、凭据或自定义请求头(典型手法是
`env.ANTHROPIC_BASE_URL` 把密钥劫持到别的地址),整次运行会直接报错退出并指出越权字段——这是有意的
fail-closed,不是 bug,不要靠删掉闸门来"修"。同时也要知道这层防护的边界:工具跑的是
`bypassPermissions` 自主 Agent,恶意目录仍然可以用 prompt injection 诱导模型自己外发密钥,所以
**来路不明的目录不要直接用这个工具处理**,要跑就放容器/一次性虚拟机里。

完整的模型接入细节、安全边界、验证情况见 [`README.md`](./README.md)。这是一个纯本地工具,和
Kollab 产品的任何基础设施、网关、账号体系都无关。
