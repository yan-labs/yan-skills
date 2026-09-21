---
name: agent-fleet
description: 通用多模型子任务执行工具。用户想把一个任务派给别的模型(Gemini、DeepSeek、Kimi/Moonshot,或任何 Anthropic 兼容端点)去跑,尤其是想同时并行跑好几个不同模型的任务("同时起一个 Gemini 写文案的任务和一个 DeepSeek 做调研的任务""这个用 Kimi 跑""帮我用 DeepSeek 头脑风暴一下""开几个后台任务分别用不同模型跑")时使用。底层用 Claude Agent SDK 驱动一个 bypassPermissions 的自主 Agent(能读写文件、跑 bash、多轮工具调用直到任务完成),纯本地执行,不经过任何 Kollab 基础设施,模型接的是用户自己配置的第三方 API key。
---

# agent-fleet

把一个任务派给别的模型去跑,而不是自己动手。核心命令:

```bash
cd agent-fleet

# 单个任务
node bin/agent-fleet.mjs run --model <友好名字> --prompt "<任务描述>" [--cwd <目录>] [--json]

# 一次并发跑一批不同模型的任务
node bin/agent-fleet.mjs run-many --config batch.json [--json]

# 看有哪些模型可用、密钥配没配
node bin/agent-fleet.mjs list-models
```

`<友好名字>` 来自 [`models.config.json`](./models.config.json),当前预置:`deepseek-v4-pro`、
`deepseek-v4-flash`、`kimi`、`gemini`(Gemini 没有官方 Anthropic 兼容端点,需要用户自己填一个网关
地址才能用,不填直接报错,不会假装能跑)。

**用户想同时跑多个不同模型的任务时**,优先用 `run-many` 一次性提交(内部真正并发跑完),而不是
自己手写多次串行调用,或者对每个模型分别开一个后台 shell 进程——除非用户明确要求那种交互方式。

**首次使用前**必须确认 `agent-fleet/.env` 里已经配好对应模型的真实 API key(`cp .env.example .env`
之后手动填),没配的话 `run`/`run-many` 会直接报出清晰的"哪个环境变量没设置",不会静默失败。

完整的模型接入细节、安全边界、验证情况见 [`README.md`](./README.md)。这是一个纯本地工具,和
Kollab 产品的任何基础设施、网关、账号体系都无关。
