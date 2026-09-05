# Ownership and Tracker

定义任务票（GitHub Issue / GitLab / Jira / 任何工单系统）的可选资格、认领与回读、
批次身份、评论节奏、终态归属和续跑租约。
在选择、认领、恢复、评论、重开或关闭任何工单之前加载本文件。

前提：多个 agent 和人共享同一个工单系统。**"没人在做这个"是必须被证明的。**

## 只读可选资格

在选择的**紧邻之前**做一次新鲜读取，然后分类。

普通候选可选，当且仅当全部成立：

- 状态为 OPEN；
- 不是 draft；
- 没有 `in-progress` 类标签；
- 没有有效的预约或其它显式处理中信号；
- 没有有效的外来租约；
- 没有人类/外来接管信号；
- 没有分支、PR、协调评论或其它证据证明工作已经开始。

**已有 assignee 只是弱意图，不是自动排除条件。**
检查时间线和所有开始信号；一个已分配但无更强开始证据的 OPEN 工单仍然可选。
但认领前必须**重读工单并整体替换 assignee 集合**为当前 owner——
**绝不在过期 assignee 上追加**。

歧义时 fail closed。跳过的候选保持**零 mutation**：
不改 assignee、不改标签、不评论、不改状态、不改可执行性分类。

已关闭工单一律排除，只有一条窄复发路径例外：

1. 证明**精确的**根因指纹出现在真实（非探针/非合成）流量中；
2. 证明发生时间在最近一次修复/部署 watermark **之后**；
3. 证明不存在外来/人类 owner、有效外来租约或接管；
4. 在工单**仍为 CLOSED 时**建立并回读规范的 self-owned 认领；
5. 回读成功**之后**才重开。

相邻症状、同标签、同 provider、防御性兜底、合成回放都不构成复发。

## 认领与回读 (Claim & readback)

对每个选中的工单，**串行**执行：

1. 重读状态、draft、标签、assignee、时间线、预约、租约、接管、分支/PR；
2. 确认它仍属于未变的批次身份；
3. 移除所有既有 assignee，只添加当前账号；
4. 添加 `in-progress`；
5. 创建规范的认领评论（结构化 block，见下）；
6. 从工单系统读取**权威的** `createdAt`，回填进认领记录，再回读并严格校验；
7. 把评论 ID/URL、源 baseline commit、controller/run 溯源写进状态文件。

**第二次回读成功之前，禁止任何导向实现的调查、编辑、commit、部署或 E2E。**

认领 block 的最小结构（用 HTML 注释 marker 包裹一段严格 JSON）：

```text
<!-- <automation>-claim:v1 -->
{ schema, runId, controllerTaskId, subagentTaskIds[],
  claimedAt, issue{repository,number},
  sourceWorkspace{repository,worktree,branch,baselineCommit}, relatedWorkspaces[] }
```

严格校验：所有字符串非空；`claimedAt` 是工单系统返回的 UTC RFC 3339 时间
（**本地时钟不能替代**）；worktree 是绝对路径；baseline 是开工前
`git rev-parse HEAD` 的完整 OID；数组元素唯一；不接受未知 key、重复 key、
重复 marker 或第二个 claim block。首次写入允许 `claimedAt: null` 作为
"尚未生效"的初始化态，parser 必须把它当作 invalid。

**commit 归属的时间门**用 `git show -s --format=%cI` 的 committer UTC
与权威 claim `createdAt` 比较：早于 claim 的 commit 一定不属于本轮；
不早于 claim 只是必要条件。接受归属还需要闭合 run/controller ID、
交付 hash、worktree/branch、baseline ancestry、协调评论等完整溯源链。
author date、Git author、assignee 或共享账号都不能单独替代这条证据链。

## 批次身份

**最多 4 个**工单一批。

只有全部成立才合批：

- 一个精确的因果边界；
- 一个共享的根因指纹 / repairKey；
- 一个仓库和目标分支；
- 一条发布 lane 和部署边界；
- 一个实现就能修好每一项，不需要按项定制产品行为；
- 一条验证链就能覆盖每一个事故身份；
- 一个回滚/发布决定适用于整个实现。

**以下都不够**：都是 Bug、标签相同、模块相邻、症状相似、
修复恰好碰同一个文件、部署时机方便。

任一条件发散 → 只选确定性最高优先级的**一个**，其余原样留给下一轮。
实现开始后不得扩大 batch，除非新项独立通过可选资格
且 controller 在任何 mutation 之前重写并回读批次 checkpoint。

## 批次执行拓扑

严格一份：一个 controller、一个 active goal、同时一个 maker、
一个落地 owner、一条 commit/push/deploy/review 序列。

严格每项一份：独立认领/回读、精确事故身份、验收 gate 与证据、
阶段评论、关闭/释放决定。

共享的实现证据可以被所有条目引用，但**绝不替代**每一项自己的
精确事故验收和最终评论。

## 评论节奏

controller 是**唯一**的工单写入者，subagent 只回传证据。
在这五个节点发实质性评论：

1. **调查** —— 精确事故、因果边界、范围、最强证据；
2. **实现** —— 交付 SHA 和改变了什么行为；
3. **验证** —— 每项的事故身份和证据等级；
4. **独立 review** —— 结论和已解决的 blocking finding；
5. **最终** —— 产品层总结、技术层证明、学习晋升/拒绝、终态动作。

不发空 ping。不制造多条零散评论当噪音。

最终评论至少包含：问题与根因（含被证伪的重要假设）、实施方案与关键设计选择、
最终 commit hash / 分支 / 关键文件、验证证据（命令与结果、部署环境、
run URL/head SHA、E2E 场景与结果、独立 review 结论）、
用用户视角描述的最终呈现效果（UI 附截图/链接，后台链路附可安全公开的
响应或日志 marker 摘要）、范围与后续（未触碰环境、已知限制、
需外部决策的动作，超范围问题链接独立 follow-up）。

**不得包含** secret、token、cookie、完整隐私数据或只能本机访问的临时绝对路径。
**不得把取消、失败或未执行的验证写成通过。**

## 可执行性分类

把**技术可执行性**和**发布/关闭 gating** 分开判断。默认 **agent-runnable**。

只有在有界调查证明"不存在任何代码、配置、测试环境、诊断、自动化、
兜底或 feature-flag 动作"，且唯一阻塞是不可访问的外部系统、
被禁止索取的凭据或不可委派的人类决策时，才标 `not-agent-runnable`，
并评论具体证据和解除条件。

以下**不得**作为不可执行的理由：跨仓库范围、生产授权、
等待巡检/自然流量/干净观测窗、已有 assignee、已有 `in-progress`。

## 终态归属

**先关闭已验证的工单，再释放自动化归属**——顺序不能反，
否则会留下一个无主的 OPEN 窗口让别的 agent 重复认领：

1. 发最终证据评论；
2. 关闭工单；
3. 移除本轮的可恢复租约；
4. 移除本轮的 `in-progress`；
5. 移除自动化 assignee；
6. 回读终态不变量。

成功不变量：

```text
CLOSED + 无 assignee + 无 in-progress + 无 active/resume-ready 自动化租约
```

`needs-follow-up` 只用于真实未解决的技术动作，并保留显式归属 + 有界下一步。
`fixed-pending-release` 只用于用户明确把生产定为验收终点且尚未部署的情况。
目标环境部署 + 客观测试 + review 之后，**不要等一个自然的干净窗口**再关。

## 续跑租约 (Resume lease)

无人值守自动化要跨轮次续跑时，在同一协调评论里再放一个租约 block：

```text
<!-- <automation>-resume-lease:v1 -->
{ schema, runId, controllerTaskId, subagentTaskIds[],
  owner{login,controllerTaskId}, automation{automationId,invocationId},
  issue, sourceWorkspace, relatedWorkspaces[],
  heartbeatAt, expiresAt, notBefore,
  cumulativeBudget{iterations,repairCycles,elapsedSeconds,tokens,externalCostUsd},
  status, boundedNextAction{kind,summary,objectiveGate},
  release{releasedAt,reason,releasedBy} }
```

关键约束：

- claim block 必须存在、排在 lease 之前、身份完全一致，且不被 lease 更新覆盖；
- `heartbeatAt < expiresAt`；三个时间门用工单系统的 UTC；
- **budget 的 `used` 跨所有恢复轮次累计，永不清零**；limit 仅填写用户或权威自动化合同明确给出的硬上限，未设置为 null，内部估算不得写成 limit；有效非 null limit 达到或超过才算预算耗尽；
- status 只允许 `active` / `resume-ready` / `blocked` / `complete` / `released`；
  前两种必须有非空 bounded next action 且 release 三字段全为 null；
- `released` 必须有 UTC `releasedAt`、非空 `releasedBy`，reason 限于
  `expired` / `budget-exhausted` / `blocked` / `complete` / `human-takeover` /
  `legacy-incomplete` / `manual`；
- **终态不得伪装成可恢复工作。**

### 决策矩阵

| 观察到的状态 | 动作 |
| --- | --- |
| 唯一、严格有效、self-owned、status 为 active/resume-ready、`notBefore` 已到、未过期、预算可用、bounded action 存在、claim/溯源全匹配 | 恢复同一 run，执行且只执行那个 bounded next action，然后累计预算并回读心跳/过期更新 |
| 其它有效但 `notBefore` 在未来 | 只把下次检查时间写进外部 state / wakeup；不做任何 ownership mutation、实现、commit、部署或释放 |
| 已过期且能证明 self-owned | 先置为 released（写 UTC 时间、`expired`、actor）并回读；再只释放自动化自己添加且未被人改写的 assignee/标签 |
| marker 缺失或重复、JSON/schema/key/type/时间无效、任一身份 mismatch | **Fail closed**：不认领、不恢复、不"修复"记录、不改外来 assignee/标签/评论/分支；只在外部 state 记冲突 |
| 任一累计预算耗尽，或 status 为 blocked/complete | 按 `budget-exhausted`/`blocked`/`complete` 做同样的 self-owned 确定性释放；不开新的 run |
| 人工新增/替换 assignee、移除自动化标签、接管分支/PR 或留言接手 | 以 `human-takeover` 释放自动化自己的租约与归属；保留所有人类 assignee、标签、评论、分支和工作内容，不覆盖、不删除、不重领 |
| 旧评论只有散文式租约 | 仅当每个必填字段都有 durable 证据时原地规范化并回读；证据不全但能证明 self-owned 时以 `legacy-incomplete` 释放；归属也不确定时零 mutation 跳过 |
| 已 released | 只读确认 release 与外来状态未被改写；不再恢复 |

**不要**因为 owner 看起来是同一个账号，就把带 `in-progress` 的工单送进普通可选资格流程。
共享账号和过期散文都不能证明 self ownership。续跑只能走独立的恢复入口。
