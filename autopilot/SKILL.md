---
name: autopilot
description: |
  接收一句模糊指令，自动调查、分类、拆解为 XML 阶段计划、选 skill、定完成判定，
  然后以无人值守模式通过 loop/goal + agent-mode 完整执行到底——
  包括自动部署、自动 E2E 测试、自动代码 review，不跳过任何阶段。
  当用户扔过来一句宽泛任务时主动使用——"把 bug 修了"、"补测试"、
  "优化性能"、"把这个功能做完"、"代码扫一遍"、"调查一下为什么 XX"。
  也在用户说"autopilot"、"auto"、"帮我规划"、"自己搞定"、"直接跑"、
  "你来拆"、"别问我怎么做"时触发。即使用户没有说这些关键词，
  只要输入明显是未拆解的宽泛意图，也应该主动激活。
  调用 autopilot = 授权全自动无人值守执行，不需要中途确认。
---

# Autopilot

接收一句话，自动拆解成结构化执行计划，然后以无人值守模式完整执行到底。

用户调用 autopilot 意味着：**授权 AI 完全自主地完成整套流程**——
调查、实现、部署、E2E 验证、代码 review、二次部署、二次验证、收尾。
不需要中途确认，不允许跳过任何阶段，不允许半途而废。

---

## Loop 强制执行规则 (CRITICAL · 最高优先级)

**调用 autopilot = 必须启动 loop。没有例外。**

这条规则的优先级高于一切其他考量。不管任务看起来多简单、多紧急、多"显然可以一口气做完"，
autopilot 的执行模型就是 loop + agent-mode，不是"在单次 turn 里连续做完所有事情"。

### 硬性阻断门

Step 2（计划）完成后、第一行实现代码之前，**必须调用 ScheduleWakeup 启动 loop**。
这是一个不可跳过的检查点：

```
Step 1: 快速调查 ─── 可以在当前 turn 内完成
Step 2: 拆解计划 ─── 可以在当前 turn 内完成
                ╔══════════════════════════════════════════════╗
                ║  ⛔ GATE: 必须在这里调用 ScheduleWakeup     ║
                ║  传入 loop-goal 作为 prompt                  ║
                ║  不调用 = 不允许进入 Step 3                   ║
                ╚══════════════════════════════════════════════╝
Step 3: 执行 ─── 在 loop 回调中执行，不是在当前 turn 中继续
Step 4: 收尾 ─── 在最后一次 loop 迭代中完成
```

### ScheduleWakeup 调用规范

在 Claude Code 中，启动 loop 的方式是调用 ScheduleWakeup：

```
ScheduleWakeup({
  delaySeconds: 60,
  reason: "autopilot: starting loop for <简短任务描述>",
  prompt: "<loop-goal 的完整内容，包含所有 phase 的完成判定>"
})
```

- `delaySeconds`: 首次启动用 60（最短），后续按实际需要调整（等部署用 270，等 CI 用更长）
- `prompt`: 必须包含完整的 loop-goal，这样每次 loop 唤醒时都能重新评估完成状态
- 每轮 loop 结束时，如果 loop-goal 未达成，再次调用 ScheduleWakeup 继续下一轮

### 禁止行为（绝对不允许）

<prohibited-behaviors>
  <behavior id="single-turn-execution">
    在单次 turn 里连续执行多个 phase 而不启动 loop。
    这是最常见的违规模式：agent 觉得"反正都能做完"，
    就在一个 turn 里从头干到尾，跳过了 loop 的分阶段迭代。
    后果：context 满了就停，不会自动续；中间结果堆主 context 加速 compaction；
    失去跨迭代恢复能力；maker-checker 分离无法实施。
  </behavior>
  <behavior id="loop-defer">
    "先做完这几步，等需要的时候再启动 loop"。
    loop 不是可选的加速手段，它是 autopilot 的执行骨架。
    Plan 一完成就必须进入 loop，不存在"先做一点再 loop"。
  </behavior>
  <behavior id="main-context-execution">
    在主 context 里直接读写大量代码文件而不派 subagent。
    主循环只编排 + 串结论；实际 coding/验证/review 全部派 subagent。
  </behavior>
</prohibited-behaviors>

### 自检清单

在声称进入 Step 3 执行阶段之前，必须能回答"是"：

- [ ] progress.md 已创建且包含所有 phase 的初始状态 ⏳？
- [ ] loop-goal 已定义且可客观判定？
- [ ] **ScheduleWakeup 已调用**（不是"打算调用"，是"已经调用了"）？
- [ ] 当前 turn 没有开始执行任何 phase 的实际工作？

如果第三项是"否"，停下来，现在就调用 ScheduleWakeup。

---

## 核心原则

这些原则来自 loop engineering 的实战经验，是防止 loop 变成烧钱空转的关键。

<core-principles>

  <principle id="state-file">
    <name>State File — agent 会遗忘，文件不会</name>
    每轮开始时创建 `progress.md` 记录已完成和待完成的阶段。
    每个 phase 完成后立即更新。下次迭代从 state file 恢复而非从零开始。
    这是 loop 能跨迭代续跑的脊柱。
  </principle>

  <principle id="maker-checker-split">
    <name>Maker-Checker Split — 写代码的不能自己判卷</name>
    实现代码的 subagent 和验证代码的 subagent 必须是不同的 subagent。
    同一个 agent 写完代码再"review"自己的代码，只是第二个乐观主义者在点头。
    E2E 验证、代码 review 必须由独立的 subagent 执行，
    不接触实现 subagent 的推理过程。
  </principle>

  <principle id="objective-gate">
    <name>Objective Gate — 每个验证必须有机器可判定的信号</name>
    "看起来没问题"不是验证。验证必须有客观的 pass/fail 信号：
    - 本地验证：tsc 退出码 0 + test 全绿
    - 部署验证：gh run 状态 = success
    - E2E 验证：agent-browser 在 test 环境复现→现象消失
    - Review 验证：review skill 输出无 blocking issue
    没有客观信号的"验证"不算完成。
  </principle>

  <principle id="hard-stop">
    <name>Hard Stop — loop 必须有刹车</name>
    每个 loop 必须有明确的停止条件：
    - 成功停止：loop-goal 的所有条件满足
    - 失败停止：连续 3 次同一阶段失败 → 报告原因并停止
    - 安全停止：iteration 上限（默认 10 轮）或 token 预算耗尽
    没有刹车的 loop 会空转到被外部杀掉——这不是停止，是崩溃。
  </principle>

  <principle id="no-ralph-wiggum">
    <name>No Ralph Wiggum — 不允许半完成就声称 done</name>
    agent 可能在只完成了一半的时候提前退出 loop（"看起来差不多了"）。
    防护措施：
    - 每个 phase 完成后输出 ✓ PHASE [id] COMPLETE: [客观证据]
    - loop 结束前逐一核对所有 mandatory phase 的完成标记
    - 缺标记 = 未完成 = 不允许退出
  </principle>

  <principle id="failure-classification">
    <name>Failure Classification — 先分类再重试</name>
    phase 失败时不能盲目 loop 回去重试同样的事情。
    必须先分类失败原因，然后根据分类选择不同的修复路径：

    <failure-type id="missing-context">
      缺少上下文/信息。修复：扩大调查范围，读更多代码/日志/文档。
    </failure-type>
    <failure-type id="wrong-approach">
      方案本身有问题。修复：回退到 plan 阶段，用 brainstorming 探索替代路径。
    </failure-type>
    <failure-type id="environment-issue">
      环境/配置/依赖问题（非代码 bug）。修复：用项目 debug skill 排查环境。
    </failure-type>
    <failure-type id="hallucinated-assumption">
      基于错误假设实现。修复：回退到 investigate，验证假设再重新实现。
    </failure-type>
    <failure-type id="incomplete-output">
      做了一部分但不完整。修复：继续当前 phase，不要从头开始。
    </failure-type>
    <failure-type id="external-blocker">
      被外部因素阻塞（API 不可用、权限不足等）。修复：降级或中止并报告。
    </failure-type>

    记录每次失败的分类到 progress.md，防止重蹈覆辙。
  </principle>

  <principle id="adaptive-retry">
    <name>Adaptive Retry — 重试必须改变策略</name>
    "更多次重试 ≠ 更好的结果。如果系统重复相同的行为，它不是在改进，它只是在空转。"

    每次 loop 回去重试时，必须满足以下条件之一：
    - 使用了不同的修复方案
    - 获取了新的上下文/信息
    - 缩小了问题范围
    - 换了工具或 skill
    - 修正了之前的错误假设

    如果想不出任何不同的做法 → 不要重试，直接中止并报告：
    "连续 N 次以相同方式失败，无法找到新的修复路径。"
    这比空转烧 token 有价值得多。
  </principle>

</core-principles>

---

## 平台适配

autopilot 运行在不同产品上时，使用不同的 loop 命令：

<platform-detection>
  <platform id="claude-code">
    <loop-command>/loop</loop-command>
    <goal-command>/loop + 自定步调目标驱动</goal-command>
    <description>
      Claude Code 中使用 /loop 驱动目标迭代。
      /loop 支持按间隔运行，也支持自定步调（不指定间隔时 model 自行决定何时继续）。
    </description>
  </platform>
  <platform id="codex">
    <loop-command>/goal</loop-command>
    <goal-command>/goal [完成条件描述]</goal-command>
    <description>
      Codex 中使用 /goal 驱动目标迭代。
      /goal 持续运行直到声明的条件成立，由独立的 checker model 验证完成。
    </description>
  </platform>
  <fallback>
    如果无法确定平台，优先尝试 /loop。
    关键区别：/goal 有独立 checker 验证完成（Codex 内建），
    /loop 需要自己在 loop body 里检查完成条件。
  </fallback>
</platform-detection>

---

## 工作流程总览

<workflow>
  <step id="scope">快速调查，理解任务实际涉及什么（2-5 分钟）</step>
  <step id="plan">分类任务 → 拆解为 XML 阶段 → 选 skill → 定 loop 目标 → 初始化 state file</step>
  <step id="execute">loop/goal（外层驱动目标）+ agent-mode（内层按阶段派 subagent）→ 全程无人值守</step>
  <step id="report">输出收尾总结 + 所有 phase 完成标记</step>
</workflow>

用户调用 autopilot 本身就是确认——不需要中途展示计划等"go"。
如果用户明确说"先让我看看计划"，才暂停展示。默认直接执行。

---

## Step 1: 快速定范围

在规划之前，先花 2-5 分钟弄清任务实际涉及什么。
没有调查的计划是空中楼阁——先看再拆。

### 1a. 自动分类任务类型

根据用户输入 + 调查发现判断类型：

<task-types>
  <type id="bug-fix"
        signals="fix, broken, 不工作, issue, error, 报错, 修, crash, 挂了">
    修复已知缺陷。从现象追到根因，根治而非打补丁。
  </type>
  <type id="feature"
        signals="add, implement, 新增, 做一个, 加上, 支持, spec, 功能">
    新增功能或能力。从需求到交付。
  </type>
  <type id="refactor"
        signals="clean up, 重构, simplify, extract, 拆, 整理, 瘦身">
    改善代码结构但不改变外部行为。
  </type>
  <type id="test"
        signals="test, coverage, 补测试, E2E, 验证, 测试, 覆盖">
    补充测试覆盖或验证已有功能。
  </type>
  <type id="research"
        signals="investigate, why, 调查, 为什么, 怎么回事, 排查, 分析">
    理解问题或技术方案。产出是结论/报告而非代码。
  </type>
  <type id="deploy"
        signals="deploy, 发布, 上线, 部署, 推, ship, 发版">
    部署代码到环境并验证。
  </type>
  <type id="quality"
        signals="review, 扫一遍, 优化, 质量, 检查, audit, 清理">
    对已有代码做质量审查和改进。
  </type>
</task-types>

一个输入可能同时命中多个类型（如"修完 bug 然后部署"= bug-fix + deploy）。
此时组合对应的阶段模板，按自然因果排序。

### 1b. 执行快速调查

根据分类出的类型，从 `references/phase-library.md` 的 `<scope-checklist>` 拿到
该类型的调查清单，快速执行。产出是对范围、受影响区域和关键发现的简短摘要。

---

## Step 2: 拆解为 XML 阶段计划

### 2a. XML Phase Schema

每个计划用这个结构：

```xml
<execution-plan>
  <task>用户的原始输入（原文保留）</task>
  <type>分类出的任务类型（可多个，逗号分隔）</type>
  <scope>调查发现的实际范围摘要（2-3 句话）</scope>

  <loop-goal>
    具体的、可判定的完成标准。
    必须涵盖所有子问题——不能只做最明显的就算完。
    必须包含所有强制验证阶段的预期产出。
    示例："#442 根因修复 + 本地验证通过 + test 部署绿 +
           E2E 通过 + review 通过 + 二次部署绿 + 二次 E2E 通过 +
           issue 关闭附 commit"
  </loop-goal>

  <hard-stop>
    <max-iterations>10</max-iterations>
    <consecutive-fail-limit>3</consecutive-fail-limit>
  </hard-stop>

  <phases>
    <phase id="唯一标识" order="N" mandatory="true">
      <skill>执行该阶段使用的 skill</skill>
      <goal>该阶段要达成什么</goal>
      <input>需要什么输入</input>
      <output>产出什么</output>
      <gate>客观的 pass/fail 信号（非主观判断）</gate>
      <done-when>可验证的完成判定</done-when>
      <on-fail>失败时怎么处理</on-fail>
    </phase>
  </phases>
</execution-plan>
```

### 2b. Skill 选择

按阶段职能选 skill。**每个阶段必须通过 skill 完成，不允许裸手做。**

Skill 发现顺序：
1. 先用 `using-superpowers` / `find-skills` 扫描当前项目和全局可用的 skill
2. 优先选项目级 skill（如 `dev-*`, `test-*`, `debug-*`, `review-*`）——它们包含项目特定的规则和上下文
3. 项目没有专用 skill 时，退到全局 skill

<skill-matrix>
  <mapping phase="调查 / 根因定位"    primary="项目 dev skill"    fallback="systematic-debugging" />
  <mapping phase="外部研究 / 文档"     primary="context7"         also="deep-research, anysearch, agent-reach" />
  <mapping phase="方案规划"            primary="writing-plans"    also="planning-with-files, brainstorming" />
  <mapping phase="后端 / 逻辑实现"     primary="项目 dev skill"    fallback="直接编码（无可用 skill 时）" />
  <mapping phase="前端 / UI 实现"      primary="frontend-design"  also="shadcn-ui" />
  <mapping phase="本地验证"            primary="项目 test skill"   fallback="直接运行 tsc + test" />
  <mapping phase="部署"                primary="项目 debug/deploy skill" fallback="gh-cli + 手动推送" />
  <mapping phase="E2E 验证"            primary="项目 test skill"   also="agent-browser" />
  <mapping phase="代码审查"            primary="项目 review skill" fallback="simplify, code-review" />
  <mapping phase="深度审查"            primary="thermo-nuclear-code-quality-review" also="" />
  <mapping phase="Issue 管理"          primary="gh-cli"           also="" />
</skill-matrix>

说明："项目 dev/test/debug/review skill"指当前项目 `.agents/skills/` 下与该职能匹配的 skill。
例如 Kollab 项目有 `dev-kollab`、`test-kollab`、`debug-kollab`、`review-kollab`；
其他项目可能有 `dev-myapp`、`test-myapp` 或者没有——此时用 fallback。

### 2c. Feature Completeness Checklist（feature 类型强制）

feature 类型的任务在 design phase 必须通过 `references/phase-library.md` 中的
`<feature-completeness-checklist>` 逐项核查。历史教训：share 按钮上线后
分享页渲染不一致、用户主题设置 useState-only 刷新丢失、公开页无 SEO——
全部因为"先做能跑的，剩下的下次说"。checklist 覆盖五个维度：

- **多表面一致性**：同一功能的所有 surface 必须同 PR 完成或 flag-gate 关闭
- **设置持久化**：用户可调节项必须持久化，禁止 useState-only
- **公开页面基础设施**：公开 URL 必须有 title/OG tags/合理加载态
- **数据完整性**：前后端字段必须端到端流通
- **跨功能影响**：评估新 surface 对导航/权限/下游消费的影响

每条标记通过/N/A/本次不做（flag-gated），不允许留空。
不适用的条目标 N/A 并简述理由；适用但本次不做的必须 feature-flag 关闭
且记入 progress.md 的"未完成项"。

### 2d. 强制阶段规则

任何涉及代码变更的任务类型（bug-fix / feature / refactor / quality），
必须包含以下阶段，不允许省略：

<mandatory-phases for="code-change">
  <phase-ref>implement — 实现（通过项目 dev skill 或直接编码）</phase-ref>
  <phase-ref>local-verify — 本地验证（tsc / lint / test，客观 gate）</phase-ref>
  <phase-ref>deploy-1 — 第一轮部署到测试环境（通过项目 deploy skill 或 gh-cli）</phase-ref>
  <phase-ref>e2e-1 — 第一轮 E2E 验证（通过项目 test skill + agent-browser，独立 subagent）</phase-ref>
  <phase-ref>review — 代码审查（通过项目 review skill 或 simplify + code-review，独立 subagent）</phase-ref>
  <phase-ref>deploy-2 — 第二轮部署（review 修改后）</phase-ref>
  <phase-ref>e2e-2 — 第二轮 E2E 验证（独立 subagent）</phase-ref>
</mandatory-phases>

这些阶段存在的原因：

<phase-justification id="e2e">
  本地测试只验证逻辑正确性。部署后可能因环境差异、配置缺失、迁移遗漏而表现不同。
  E2E 是唯一能从用户视角证明"真的修好了"的环节。
  即使你 100% 确信修复是正确的，也必须跑——确信本身就是风险。
  历史上多次发生"本地全绿、部署后炸"的事故。
</phase-justification>

<phase-justification id="review">
  实现者有盲点：注释缺失让后人排查时看不懂链路、
  兼容性漏洞让别人的代码合并时挂掉、过度修改让影响面失控。
  审查是提前拦截线上事故的最后一道防线。
  历史上最严重的事故往往来自"太小了不需要 review"的改动。
</phase-justification>

<phase-justification id="deploy-2-and-e2e-2">
  review 阶段的修改（simplify 重构、注释补充、代码问题修复）可能引入新问题。
  第二轮部署+验证确保 review 修改没有破坏任何东西。
  跳过 = 把未经验证的 review 修改直接当作最终产出。
</phase-justification>

### 2e. 组装阶段

1. 根据任务类型从 `references/phase-library.md` 加载对应的阶段模板
2. 用调查发现（Step 1）填充每个 `<phase>` 的具体内容
3. 补上所有 mandatory-phases（如果模板里没有）
4. 模板是骨架不是枷锁——可以根据实际情况增加阶段，但不允许删除 mandatory 阶段
5. **feature 类型**：确认 design phase 产出的方案文件包含 feature-completeness-checklist 的逐条判定

### 2f. 初始化 State File

创建 `progress.md`：

```markdown
# Autopilot Progress

## Task
[用户原始输入]

## Type
[任务类型]

## Loop Goal
[loop-goal 内容]

## Phase Status
| Order | Phase ID | Skill | Status | Evidence |
|-------|----------|-------|--------|----------|
| 1     | ...      | ...   | ⏳     |          |
| 2     | ...      | ...   | ⏳     |          |
| ...   | ...      | ...   | ⏳     |          |

## Failure Log
(每次失败记录在这里——不是用来回顾的流水账，而是用来防止重蹈覆辙的行动记忆)

| Iteration | Phase | Failure Type | What Was Tried | Why It Failed | What Changed Next |
|-----------|-------|-------------|----------------|---------------|-------------------|

## Lessons Learned
(跨迭代积累的可复用经验，每条一句话)
- [例] phase implement: 这个模块的 tsc 需要用 tsconfig.build.json 而非默认 tsconfig
- [例] phase e2e: test 环境的测试账号密码在项目 test skill 里，不要猜

## Iterations
(每次迭代的简要摘要)
```

每个 phase 完成后立即更新 Status 列（⏳ → ✅）和 Evidence 列。
每次失败立即更新 Failure Log。
跨迭代发现的可复用经验记入 Lessons Learned。

### 2g. 定义 Loop 目标

从所有阶段的 `<done-when>` 合成一句可判定的 loop 目标：
- 涵盖所有子问题
- 可客观判定（引用具体的 gate 信号）
- 包含所有 mandatory 阶段的预期产出
- 包含最终交付状态（提交/部署/关闭 issue 等）

---

## Step 3: 执行

### 3a. 启动 Loop（强制阻断门 — 见"Loop 强制执行规则"）

**这一步是执行的硬前提，不是可选项。Step 2 完成后、任何 phase 实际工作之前，必须先完成这一步。**

根据平台使用对应命令：

<loop-start>
  <claude-code>
    调用 ScheduleWakeup 启动 loop：
    ```
    ScheduleWakeup({
      delaySeconds: 60,
      reason: "autopilot: starting loop for <任务摘要>",
      prompt: "<完整 loop-goal，逐字粘贴 Step 2g 定义的内容>"
    })
    ```
    调用后当前 turn 立即结束。不要在调用 ScheduleWakeup 之后继续执行 phase 工作。
    后续所有 phase 工作在 loop 回调中进行。
  </claude-code>
  <codex>
    调用 /goal，条件 = Step 2g 定义的 loop-goal。
    Codex 的独立 checker model 验证完成条件。
  </codex>
</loop-start>

**调用后的行为**：ScheduleWakeup 调用后，当前 turn 的唯一允许动作是向用户输出一句确认：
"Autopilot loop 已启动，目标：<loop-goal 摘要>。"然后结束 turn，等待 loop 唤醒。

**每轮 loop 回调中的行为**：
1. 读 progress.md 恢复状态
2. 确认当前未完成的 phase
3. 用 Agent tool 派 subagent 执行当前 phase
4. 根据 subagent 结果更新 progress.md
5. 如果 loop-goal 未达成，调用 ScheduleWakeup 继续下一轮
6. 如果 loop-goal 达成，进入 Step 4 收尾

### 3b. Loop + Agent-Mode 铁律

这两个 **必须成对使用，全程贯穿**，缺一不可：

- **loop/goal（外层）**：围绕 `<loop-goal>` 迭代，未达成不停
- **agent-mode（内层）**：每个阶段翻成自包含 brief 派 subagent 执行

执行拓扑：

```
loop-goal = <loop-goal> 定义的完成判定
  ├── iteration 1
  │   ├── agent-mode → phase 1 (investigate)      [maker subagent]
  │   ├── agent-mode → phase 2 (implement)         [maker subagent]
  │   ├── agent-mode → phase 3 (deploy)            [maker subagent]
  │   ├── agent-mode → phase 4 (e2e verify) → FAIL [checker subagent ≠ maker]
  │   └── loop 回 phase 2
  │   (更新 progress.md)
  ├── iteration 2
  │   ├── agent-mode → phase 2 (re-implement)
  │   ├── agent-mode → phase 3 (deploy)
  │   ├── agent-mode → phase 4 (e2e verify) → PASS [checker subagent]
  │   ├── agent-mode → phase 5 (review)            [checker subagent ≠ maker]
  │   └── ...继续后续阶段
  │   (更新 progress.md)
  └── 所有 mandatory phase ✅ + loop-goal 达成 → 结束
```

### 3c. Subagent 分派规则

<subagent-rules>

  <rule id="self-contained-brief">
    每个 subagent 任务翻成自包含英文 brief——
    subagent 没有主循环上下文，必须把它需要的一切都写进 brief。
  </rule>

  <rule id="model">
    subagent 默认用 Sonnet（model="sonnet"）控制成本。
    只有需要深度推理的关键决策阶段才考虑用更强模型。
  </rule>

  <rule id="maker-checker-separation">
    实现类阶段（investigate / implement / plan）= maker subagent。
    验证类阶段（e2e / review / quality audit）= checker subagent。
    checker subagent 不能接触 maker 的推理过程——
    只给它代码 diff、部署 URL 和验证标准，让它独立判断。
    这是防止"自己给自己判卷"的核心机制。
  </rule>

  <rule id="context-hygiene">
    主循环只编排、串结论、做关键决策。
    大段文件/日志/diff 交给 subagent 读取，只回传结论——
    不要把 subagent 该消化的内容堆进主上下文。
  </rule>

  <rule id="skill-first">
    每阶段开始前先确认要用的 skill，通过 skill 完成，不裸手做。
    using-superpowers 在每轮开始时必须调用一次。
  </rule>

</subagent-rules>

### 3d. Phase 完成跟踪

每个 phase 完成后必须：

1. 输出完成标记：`✓ PHASE [id] COMPLETE: [一句话客观证据]`
2. 更新 `progress.md` 的对应行
3. 检查是否可以进入下一个 phase

如果无法写出真实的客观证据，说明该 phase 未完成，必须继续。

Loop 结束前执行最终检查：
- 逐一核对 progress.md 中所有 mandatory phase 的状态
- 所有 mandatory phase 必须是 ✅
- 缺任何一个 = 未完成 = 不允许退出 loop

### 3e. 失败处理

phase 失败时，必须按这个顺序处理——不能跳过分类直接重试：

<failure-protocol>
  <step order="1">
    分类：按 core-principles 的 failure-classification 判断失败类型
    （missing-context / wrong-approach / environment-issue /
     hallucinated-assumption / incomplete-output / external-blocker）
  </step>
  <step order="2">
    记录：在 progress.md 的 Failure Log 写入本次失败的分类、尝试了什么、为什么失败
  </step>
  <step order="3">
    检查 Adaptive Retry 条件：能否提出和上次不同的做法？
    能 → 进入 step 4。不能 → 进入 step 5。
  </step>
  <step order="4">
    按分类选路径重试：
    - missing-context → 扩大调查（项目 debug skill 查远程日志 / deep-research）
    - wrong-approach → 回 plan 阶段，brainstorming 探索替代方案
    - environment-issue → 项目 debug skill 排查环境配置，或手动检查
    - hallucinated-assumption → 回 investigate 验证假设
    - incomplete-output → 继续当前 phase（不从头开始）
    - external-blocker → 降级（feature flag 关闭 + issue 留说明）
  </step>
  <step order="5">
    中止条件（任一触发即停）：
    - 同一 phase 连续失败 3 次且每次都换了策略
    - 达到 iteration 上限（默认 10 轮）
    - 遇到 external-blocker 且无降级路径
    → 停止 loop，输出：已尝试的所有方案 + 每次失败原因 + 建议下一步
  </step>
</failure-protocol>

### 3f. 项目规则

执行期间自动遵守当前项目的 CLAUDE.md / AGENTS.md 中的所有规则。
autopilot 不硬编码项目规则——它在 Step 1 调查阶段读取项目的规则文件，
然后在执行期间遵守。

通用提醒（适用于大多数项目）：
- 如果项目有注释规范，遵守
- 如果项目有 i18n 要求，所有语言同步
- 保护分支提交前先 fetch + rebase
- pathspec 只提交自己的文件
- 部署等待不要长时间前台 watch
- 任务必须自包含交付

---

## Step 4: 收尾报告

执行完成后输出简洁总结：

<report-template>
  <item>执行路线（阶段 → 所选 skill → 结果）</item>
  <item>Loop 目标 + 达成状态</item>
  <item>改动文件列表（含跨仓库）</item>
  <item>部署 / 验证结论（如适用）</item>
  <item>Commit hash</item>
  <item>Issue 关闭状态（如适用）</item>
  <item>所有 phase 的 ✓ 完成标记清单</item>
  <item>iterations 次数 + 失败回溯记录</item>
  <item>未完成项 + 原因（如有）</item>
</report-template>
