# 让便宜模型替 agent 点浏览器（JEV 动作选择器）

## 先说结论

- **上游 OpenCLI 没有「内置模型驱动浏览器」这个功能。** 2026-09-25 核对过：`jackwener/opencli`
  v1.8.8 之后的 50 个提交（已合进我们 fork，CLI 1.11.0 / 扩展 1.3.0）全是 adapter、安全升级和清理，
  代码里没有任何 LLM 端点、`ANTHROPIC_API_KEY`/`OPENAI_API_KEY` 或 baseURL 配置。
  上游 README 里的 "Browser Use" 指的是**外部 agent**（Claude Code 之类）调用 `opencli browser` 原语。
- 同一作者 2026-09-17 另开了 **`jackwener/opencli-mcp`**（独立仓库、独立扩展、Native Messaging，
  不依赖 OpenCLI）。它也**不内置模型**，模型是 MCP 客户端本身；省 token 的点在它的 `js` 工具：
  一次调用跑多步 JS（相当于我们的 `batch` + 条件逻辑）。要不要装它是另一个决定，本 Skill 不覆盖。
- 真正能「让便宜模型操作浏览器」的，是我们自己把 **JEV 接成动作选择器**：agent 只给目标，
  循环里每一步由 JEV 从页面可点元素里挑下一步。已实测可用，见下文。

## JEV 是什么，不是什么

TypeSafe 的 System One 决策模型。`POST https://api.typesafe.ai/v1/systemone`，
`Authorization: Bearer $TYPESAFE_API_KEY`，模型 `jev-latest`。
**不生成文本、不调工具、不是 OpenAI/Anthropic 兼容端点**——只对 `state` + 带类型的 questions
返回校准概率：

| 题型 | 返回 | 在浏览器循环里的用途 |
|---|---|---|
| `choice`（≤255 个选项） | 选中项 + 各项概率 + confidence | 下一步点哪个 ref |
| `noul` | 是的概率 0–1 | 目标是否已达成 / 页面是否出错 / 是否登录墙 |
| `score` | 分档加权值 | 候选结果相关度排序 |

所以它**不能**替代需要生成文本或 tool calling 的 agent 模型；它只能在**已枚举好的动作集合里挑一个**。
打字内容、表单值、截图判断、最终核对仍由 agent 或代码负责。

价格：输入 $0.042 / 1M tokens，输出免费。实测一步 0.4–1.4k 输入 token，0.25–1.3 s。

## 实测（2026-09-25，`scripts/jev-step-demo.mjs`）

目标「从 example.com 到 IANA 的 Root Zone Management 页」，会话 `opencli-sync-test`，`OPENCLI_WINDOW=isolated`：

| 步 | 页面 | 候选数 | JEV 选择 | confidence | 目标达成概率 |
|---|---|---|---|---|---|
| 1 | example.com | 2 | Learn more | 0.99 | 0.01 |
| 2 | iana.org/help/example-domains | 15 | 指向 /domains 的链接 | 0.74 | 0.03 |
| 3 | iana.org/domains | 39 | 指向 /domains/root 的链接 | 0.87 | 0.13 |
| 4 | iana.org/domains/root | 38 | DONE | 1.00 | 0.99 |

4 次 JEV 调用共 3,876 输入 token（约 $0.00016），agent 侧只消耗启动脚本和读最终结果那一轮。
同样的事让 agent 自己逐步 `state` → 读 → `click`，每步要把 1–3k token 的页面树读进上下文。

## 怎么用

```bash
# 密钥只从环境变量读，绝不打印、不写进命令行参数或文件
S=my-task-$(date +%s)
node ~/.claude/skills/opencli/scripts/jev-step-demo.mjs "$S" https://example.com "目标用一句英文写清楚" 6
opencli browser "$S" close
```

脚本每步输出一行 JSON（候选数、choice、confidence、top3、done 概率、耗时、token），
`confidence < 0.3` 自动停下交回 agent。会话名照第三节纪律起，用完 `close`；专用窗口池满时
脚本默认 `OPENCLI_WINDOW=isolated`，不会等池。

## 什么时候用它代替 agent 逐步点

| 适合交给 JEV | 仍由 agent 自己做 |
|---|---|
| 多层导航：目标页要点 2–6 层链接/菜单才到 | 要输入文字、填表、选日期 |
| 列表里挑一项（「点最新那篇」「点 Settings」） | 需要看图/截图判断 |
| 每步只是「点哪个」，动作可枚举 | 提交、付款、删除、发送等不可逆动作（一律 agent 确认） |
| 批量重复同类导航（每个站点都要找到某设置页） | confidence 低、页面不稳定、登录墙 |
| 判断「到了没 / 是否报错 / 是否登录墙」这类是非题 | 最终结果核对与汇报 |

原则：**JEV 负责便宜的「选」，agent 负责贵的「想」和「确认」**。已有 adapter 或固定脚本的，
仍优先走 adapter/脚本（第零节），JEV 循环是「没有现成路径、但每步只是挑一个链接」时的中间档。

## 已知限制与后续方案（未实现）

- `state` 只列可交互元素，按钮文字为空时 JEV 只能看 tag/href，选错概率上升；可把 `aria-label`、
  所在区块标题拼进选项描述。
- 选项上限 255；长页面先用 `find`/区块过滤缩小候选。
- 当前只做 `click`。要接滚动/返回，把 `SCROLL_DOWN`/`BACK` 作为固定选项加进 choice。
- 更彻底的接法是在 fork 里加一个 `opencli browser <s> auto --goal ... --selector jev` 子命令，
  复用 daemon 内的 snapshot 与 click，省掉每步起一个 CLI 进程；动作集合与停机阈值与上面脚本一致。
  这一步需要改 `src/cli.ts`（新子命令）和新增 `src/browser/jev-selector.ts`，尚未排期。
