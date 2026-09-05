# Execution Budget

约束 goal、subagent、等待和状态记账的成本。目标是减少空跑和上下文膨胀，
**不降低** maker-checker 分离、验证强度或自包含交付门。
在制定 goal、派 subagent、决定要不要等待、或判断"还能不能再来一轮"时加载本文件。

## 1. Goal 合同

普通任务使用运行状态文件；仅当用户或系统明确要求持久 Goal 时才创建，一个任务最多一个 active goal。phase、重试和 subagent 不另建 goal。

objective 用 1–3 句、最多 600 字符写清可判定终态、客观验证、归属/隐私/环境限制，以及用户或权威自动化合同明确设置的上限。未设置的上限记为 null，不自行设定任务级硬停止次数、时长或 token 预算，也不添加固定 stop phrase。

迭代数、修复回合、耗时和花费持续累计，用于检查进展和调整策略；内部估算只作 checkpoint 阈值。相同失败签名重复三次时，停止原样重试，调查并选择新的可测试路径；仍有安全下一步时继续，不能按估算耗尽宣布 blocked。

任务必要的付费验证可自动执行，不额外索要授权；优先复用现有结果和账户，重复失败必须先调查并调整策略，不能无限重复付费请求。此规则不包含充值、购买订阅或变更套餐。用户明确设置的费用和执行上限始终有效，不得自行抬高。

phase 表和验收矩阵保存在状态文件，goal 只描述终点。只有所有交付和验证条件都成立，才将显式创建的 goal 标记完成。

## 2. Subagent 预算

下表统计的是"**不同 agent 数**"。修复回合优先复用原 agent，
同一 agent 多轮对话不重复计数。

| 任务形态 | 默认上限 | 预期角色 |
| --- | ---: | --- |
| 无候选的周期性 dispatcher | 0 | 只做确定性主线程 preflight |
| 有界的文档 / skill / verify-only / research | 2 | 一个 maker 或调查者 + 一个独立 checker |
| 单子系统代码变更 | 3 | maker + E2E checker + review checker |
| 跨系统或多仓库代码变更 | 4 | 最多两个互不相交的 maker + E2E checker + review checker |

规则：

- 同时只能有**一个写类 maker** 操作同一工作树。
  只读 checker 只有真正独立且能并行推进时才并发。
- 需要超预算时：先 close 已完成的 agent，并在状态文件记录
  缺失的能力、为什么不能复用、新增角色、以及客观的结束条件。
  **"想再确认一次"不是超预算的理由。**
- maker 返回可修 finding 时，把窄修复发回**同一个 maker**；
  checker 只复判，不接管实现。
- 模型档位按宿主平台的能力映射为 routine / critical 两档：
  日常有界 maker、checker 和机械核对走 routine；
  只有跨系统歧义、架构决策、对抗性 review、困难 debug 或准确性关键判断才升级到 critical。
  升级原因记入 telemetry。**不要用"更强总是更好"替代路由判断。**
  不要把某个平台专有的 model ID 或 reasoning 参数强塞给不支持该字段的工具。

## 3. 等待预算

- **只有下一步被该结果阻塞时才等待**；否则立刻推进不重叠的工作。
- 每个委派结果最多做**一次** 90–120 秒的阻塞等待。超时后不立即发起第二次等待。
- 完成其它可推进工作后，最多做一次状态检查；仍无进展时，缩小 brief 并复用/中断原 agent，
  或 close 掉由主线程完成。
- **禁止连续 wait / list 轮询或短周期 polling。**（各平台的等待与列举原语名字不同，
  这条约束与具体工具名无关。）
- CI / 部署等待走另一套节流：核心服务每 3–5 分钟最多查一次，
  旁支服务每 5–10 分钟最多查一次，第一次检查默认延后 5 分钟，
  失败才拉日志且只拉失败 job 的关键片段。不与 subagent 等待预算混用。

## 4. 失败签名与记账

**失败签名 = phase + 客观 gate + 观察到的失败 + 失败边界。**
只有四项**全部相同**时才累加重复计数。

如果前一个 gate 已被证明修好、失败点向下游移动了，
那是 **progressive discovery**：重置该签名的计数，但全局预算继续累计。

一次性的 shell 引号错误、命令拼写错误、harness 瞬态失败属于
**orchestration diagnostic**，改正后记一行即可，**不计入 repair cycle**。
只有产品 gate、实现边界或同一稳定失败签名的失败才计入 repair cycle。

重试必须改变一个**可测试的**假设、边界、实现策略或证据来源。
换个说法、重跑同一个检查、再等一次、"再看一眼"都不是自适应推进。

## 5. Telemetry

每轮只在状态文件记汇总，**不要粘贴完整 agent 输出**：

```text
goal 字符数 | spawned/reused/closed agent 数 | maker/checker 数
| routine/critical 路由数量与升级原因 | wait 与状态检查次数 | context compaction 次数
```

## 6. 按 phase 加载引用（上下文效率）

**不要在任务开始时加载所有引用文件。** 按需加载：

| 时机 | 加载 |
| --- | --- |
| goal / loop / checkpoint | `execution-budget.md` |
| 归属、认领、批次选择 | `ownership-and-tracker.md` |
| maker 编辑 / commit / push | `concurrency-and-landing.md` |
| 测试设计 / E2E / 关闭判定 | `evidence-and-verification.md` |
| 交付、复盘、规则晋升、最终审计 | `learning-and-audit.md` |
| 任务形态模板 | `phase-library.md` 中对应那一节 |

同理：专项 skill 每个任务只发现和加载一次，把选择写进 checkpoint，
后续 phase 直接复用；只有出现此前无法预见的全新专项领域才增量发现一次。
