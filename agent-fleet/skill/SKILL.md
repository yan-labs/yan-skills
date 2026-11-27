---
name: agent-fleet
description: 用本机 fleet / fleet-go 把编码、只读复核、调研、文案翻译、结构化判断、图片视频生成等任务派给后台执行者（Codex GPT 的 Terra/Sol/Astra、Claude 各档、Gemini、Grok、JEV），并覆盖 brief 写法、巡检换班、主会话交班、验收复核、派单复盘和 fleet 产物清理。用户点名 agent-fleet 或 fleet、说“让 Codex/GPT/Gemini/Grok 做某事”、要便宜模型或多模型并行、提到 Nano Banana/nanobanana/香蕉或 Kollab 图片视频音频能力、需要按调遣令和项目场景派单、处理在跑的后台任务，或说“清理一下”“清理 N 天/一周之前的日志/报告/截图”时使用。当前模型直接就能完成、无需派单的任务不触发；用户明确要直接操作 Codex CLI 原生命令（自选 sandbox、codex review、apply、resume）时用 codex；普通配图也可用 imagegen。
allowed-tools: Bash(fleet-go context*)
---

# agent-fleet

把明确的任务交给后台执行者，按具名验收项核对交付。

## 上下文

!`fleet-go context`

如果看到的是命令原文，手动运行 `fleet-go context`。它输出调遣令、全局索引、项目总则和场景清单。优先级为用户当场指令 > 调遣令 > 项目层 > 全局层 > 源码默认。执行前检查授权边界。

## 派单流程

1. 按调遣令、项目场景与下方路由选执行者。
2. 对照[六条思维准则](templates/blocks/thinking-principles.md)自查目标。CLI 自动把准则插在 brief 首部之后，手写 brief 时在同一位置贴入。
3. 用 `fleet-go scenes` 查场景，再按[派单纪律](references/dispatch-discipline.md#brief)写本单独有的入口、允许范围、具名验收和 owner。
4. 给 `fleet-go new` 加 `--dry-run`，核对模型、样板、路径、授权和验收。按拦截提示修正后再启动。
5. 一次后台工具调用只放一条启动命令。用工具的后台参数接收完成通知，确认拿到 runId。登记监督，按全局规则挂会话巡检。
6. 终态通知回来后按验收表核对产物和实际回读。接班时用 `fleet status --running --json` 找在途任务，为归属本会话的 run 重新挂后台 `fleet wait`。
7. 按全局风险分档安排独立复核，用 `--review` 和 `--for` 关联 maker。
8. 修复、续做或换手前先确定缺口。发生拦截、返工或反复续做时按派单纪律复盘。

## 验收与收尾

在 brief 的「验收」里用 `V1 目标及取证入口｜owner：本单`，也可写 `派单方` 或 `下游:任务名`。在报告「结论」里逐条写 `V1｜已过｜证据`。

| 状态 | 如何处理 |
|---|---|
| 已过 / 不适用 | 核对证据或不适用理由 |
| 未过 | 本单项未过为 `partial`。有新证据或新路径才续做 |
| 等外部 / 待下游 | 查 `pending=external` / `downstream` 并沿 owner 交接 |
| 已回滚 | 有回滚约定时可记 `pending=rolled-back`，核对回滚和回读 |
| 换班 | 读 `pending=handoff` 和快照，按下一步接续 |

`ok` 和 `pending` 可并存。只有 `ok` 加 `pending=none` 才折算为 `complete`，仍须核对真实产物。本单项缺报告行通常是 `needs-review`。旧 brief 仍走旧判定。失败、中止和疑似假成功先核实已产生的写入。共享工作树中的 `dirty`、`commits` 需要核实归属。

按授权回读发布并清理本单进程和临时产物。合回并推送后再收尾工作树。未合回时写明释放条件。

记忆维护有五个触发点，细则见[记忆规范](references/memory.md)。

- 规则证伪时立即改或删。
- 用户纠正时蒸馏规则，原始依据留在记录。
- 调度偏好改变时用 `fleet-go order set` 更新状态。
- 同坑多耗一轮以上时，收尾前找可复用的预防办法。
- 每单收尾判断哪些规则被改变。没有变化就跳过写入。

## 路由

档位偏好与禁派约束读 `~/.agent-fleet/README.md`，临时可用性读调遣令。下列为任务可用的入口参数。

| 任务 | 命令或工具参数 |
|---|---|
| 编码、文档、取证、监督 | `--to gpt` |
| 开放式、多步编码与总管 | `--to gpt --sol` |
| 架构与复杂判断 | `executor-fable` / `--to gpt --astra` |
| 只读代码复核 | `--to gpt --review` |
| 文案、翻译、批量写作 | `--to gemini`，批量用 `--bulk` |
| 点名 Gemini 的编码、调研、搜索、复核 | `--to gemini`；非文案任务在独立 worktree 中使用 agy 工具，交回 diff，不提交推送 |
| 视觉设计、复杂编码、轻量核对 | `--to claude --tier sonnet` / `opus` / `haiku` |
| 视频、图片、实时社媒调研 | `--to grok`，媒体按需加 `--make` |
| 结构化判断 | `--to jev` 或 `fleet judge` |
| OpenAI API 编码 | `--to openai` |

## 快速派单

在仓库目录预览只读任务，运行 `printf '%s\n' "## 入口" "仓库: $PWD" "## 验收" "V1 核对 README 的文档入口｜owner：本单" | fleet-go new inspect-docs --to gpt --auth review --goal "核对文档入口" --action 只读 --body - --dry-run`。实际派发前把正文改成真实仓库和验收，确认预览后去掉 `--dry-run`。执行位置、授权和改派见 [CLI 参考](references/fleet-go.md)。

## 监督与巡检

运行 `fleet-go patrol` 逐单查看日志、阶段、park、未答信号和产物时间并裁定；未答信号或无进展的 park 超过 30 分钟列为事故。用 `fleet asks --pending` 查看全部未答信号。先区分快照巡检、等终态和窗口值守。本单触发的外部等待交给 `fleet park`，派单方供数的验收项标等外部后交回。巡检根据实际进展、等待状态和操作风险来排下一次检查。

## 插话

用 `fleet say` 给当前任务插话，或用 `fleet-go amend` 加 `--say` 同时留下 brief 修订。Codex 优先同轮 steer，Grok 要已有 sessionId 才能续跑，其余支持多轮的任务走收件箱。重启前确认旧进程和外部写入状态。

## 清理

普通历史清理默认七天，运行 `fleet-go clean --older-than 7d`。日志、截图、报告等合格历史产物和清理后的空子目录一起删除，各清理根保留。证据和备份按[清理细则](references/operations.md#清理)核实并单独授权。

## 其他通道

按需使用底层 `fleet`、网页版 ChatGPT、多模态、结构化判断或应用内子代理。发布与付费动作先对照本单授权。

## 参考目录

- [派单纪律](references/dispatch-discipline.md) · 写 brief、复核、复盘或拆总管任务时读。
- [记忆规范](references/memory.md) · 放置、改写或整理规则时读。
- [fleet-go](references/fleet-go.md) · 查参数、场景、预检、工作树和改派时读。
- [巡检与换班](references/patrol-and-handoff.md) · 登记监督、park、干预或交班时读。
- [换手顺位](references/fallback-chains.md) · 执行者不可用或需要应用内工具时读。
- [操作细则](references/operations.md) · 后台启动、清理、插话和网页通道时读。
- [账本](references/ledger.md) · 读计分、复核配对和历史回填时读。
- [Codex](references/codex-coding.md) · 查编程、只读复核及分阶段执行时读。
- [Grok CLI](references/grok-cli.md) · 查本地 CLI、会话续跑和生成工具时读。
- [OpenAI API](references/openai-bridge.md) · 使用官方 API 入口或排查适配时读。
- [文案规范](references/copy-voice.md) · 写作、翻译与验收用户可见文本时读。
- [多模态](references/media.md) · 查实时模型目录和媒体落盘时读。
- [JEV](references/judge.md) · 配置结构化判断时读。

`copy` 和 `bulk` 默认使用 agy 订阅 CLI；`FLEET_AGY_BIN`、`FLEET_AGY_MODEL` 可选，并发上限由 `FLEET_AGY_MAX_PARALLEL` 控制。未登录、额度不足或失败时直接报错，派单方决定改派；只有显式指定 `kollab-gateway-*` 才使用网关。Google 媒体、文件分析和调研入口见[多模态](references/media.md)。
