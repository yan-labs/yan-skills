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
不需要中途确认，不允许跳过必要阶段或把未完成包装为完成。用户说“发版”“发布”“上线”未限定范围时，默认自动发布当前项目所有适用发布面；先检查和验证，结果逐项回读，不扩到无关项目。用户明确限制始终优先。

---

## 安装与更新

来源：[Skills.sh](https://skills.sh/yan-labs/yan-skills)

```bash
# 首次全局安装，或更新失败时重新安装
npx skills add yan-labs/yan-skills --skill autopilot -g -y

# 将已安装的全局 Skill 更新到最新版
npx skills update autopilot -g -y
```

若使用项目级安装，去掉安装命令中的 `-g`；项目级更新使用 `npx skills update autopilot -p -y`。

---

## 编排者角色（CRITICAL · 贯穿全程）

**你的主要任务是分析、编排和验证，具体任务尽可能交给 subagent 去执行。**
自己只做需求澄清、方案拆解、任务分发和结果验收；
实现类工作（读大量代码、写代码、跑测试、批量修改）一律用 Agent 工具派给 subagent 执行。

主循环是指挥，不是工兵——把上下文留给决策，把苦力留给 subagent。
这条规则与下方 `<behavior id="main-context-execution">` 和 `<rule id="context-hygiene">` 是同一件事的三种表述，互相加强，不冲突。

---

## 执行与恢复规则（CRITICAL）

调用 autopilot 授权持续推进任务，不等于授权创建持久 Goal，也不要求先安排唤醒才允许工作。

- 默认采用 **state-only**：先把目标、阶段、验证条件和有界下一步写入 `progress.md`，然后在当前轮直接执行可推进工作。多个阶段可在同一轮完成，按阶段更新状态。
- 只有用户或系统明确要求持久 Goal 时，才采用 **explicit-goal**：创建或恢复该任务唯一的 Goal；不得因调用本技能、无人值守或等待部署而隐式创建。
- 只有确实需要跨轮等待或恢复时，使用当前平台实际可用的调度能力。CI／部署等待按项目规则安排当前任务唯一的定时恢复，登记目标任务及下一次运行时间后结束当前轮；不以前台反复查询代替恢复。
- 缺少调度工具不会阻止当前仍可执行的工作。确实需要等待且无法恢复时，记录准确状态和恢复阻碍，不声称定时已安排或任务已完成。
- 恢复后读取同一状态文件，继续尚未完成的有界动作。不要从头重建任务，不启动第二个 controller。
- 状态文件中的 `loop-goal` 是完成条件文本，不代表已经创建平台 Goal；explicit-goal 才记录实际 Goal 身份。

进入执行前核对：状态文件存在、完成条件可验证、下一步具体。调度登记只在确需恢复时检查；Goal 身份只在 explicit-goal 模式检查。

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
    - 重复失败：同一失败签名连续三次 → 停止原样重试，调查并改换可测试的策略；仍有安全下一步时继续
    - 任务停止：用户明确的上限已到，或调查证明没有安全可执行下一步；不自设任务硬停止预算
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
      方案本身有问题。修复：回退到 plan 阶段，探索替代路径（多角度发散思考）。
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

    失败签名 = phase + 客观 gate + 观察到的失败 + 失败边界。
    只有四项全同才累加重复计数；失败点向下游移动是 progressive discovery，
    重置该签名计数但全局预算继续累计。详见 `references/execution-budget.md`。
  </principle>

  <principle id="evidence-ladder">
    <name>Evidence Ladder — 说清楚你的"验证"到底证明了什么</name>
    每条实质性结论都必须带证据等级：
    L0 假设/读代码 → L1 单测 → L2 集成测试/fixture/构造流程
    → L3 目标环境上的原始事故身份或显式等价身份 → L4 部署后真实复发观测。

    铁律：绝不能把 L0–L2 说成"历史根因已证实"。
    加了兜底之后跑通了，只说明兜底生效，不说明原路径坏在哪。
    fixture-only 的 L2 通过永远不能关闭一个用户报告的缺陷。

    根因用词必须精确：confirmed root cause / supported mechanism /
    defensive hardening / bounded unknown。详见 `references/evidence-and-verification.md`。
  </principle>

  <principle id="single-writer">
    <name>Single Writer — "只有我在改这个仓库"是必须被证明的假设</name>
    同一台机器上经常有多个 agent、多个 worktree 共享同一个 git 仓库。
    任何时刻只允许一个 maker 写同一个工作树、一个 landing owner 做
    commit/push/发布。写入前必须持有 git-common-dir 的原子租约；
    证明不了本机独占就停止。

    staging 只用精确文件清单，绝不 `git add -A` / `git add .`；
    绝不 stash / checkout / reset / 覆盖别人的改动；绝不 force push。
    push 后必须 fetch 并用 `git merge-base --is-ancestor` 回读远端 ancestry——
    本地 commit 不算交付。详见 `references/concurrency-and-landing.md`。
  </principle>

  <principle id="bounded-increment">
    <name>Bounded Increment — 每轮只推进一个有界增量</name>
    一轮迭代 = 读 checkpoint → 校验归属与租约 → 提出一个假设或一个 phase delta
    → 执行一个带客观 gate 的 maker 或 checker 动作 → 记录结果和最强证据
    → 选择一个有界的下一步或停止。

    不允许把"调查全部 + 实现 + 部署 + review"塞进一个增量。
    只读的事实收集可以并行（输出互不依赖时），写入永远单 maker。
  </principle>

</core-principles>

---

## 平台适配

autopilot 默认通过状态文件推进；需要跨轮恢复时使用当前平台能力，持久 Goal 另受明确请求约束：

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
    <loop-command>state-only + 当前任务定时恢复</loop-command>
    <goal-command>仅 explicit-goal 模式：/goal [完成条件描述]</goal-command>
    <description>
      Codex 仅在用户或系统明确要求持久 Goal 时使用 /goal；否则使用运行状态和当前任务定时恢复。
      /goal 持续运行直到声明的条件成立，由独立的 checker model 验证完成。
    </description>
  </platform>
  <fallback>
    平台未知时先检查实际工具，不猜测命令。继续 state-only 的可执行工作；需要恢复时再选择可用调度能力。两种模式都必须执行完整客观验收。
  </fallback>
</platform-detection>

---

## 工作流程总览

<workflow>
  <step id="scope">快速调查，理解任务实际涉及什么（2-5 分钟）</step>
  <step id="plan">分类任务 → 拆解为 XML 阶段 → 选 skill → 定 loop 目标 → 初始化 state file</step>
  <step id="execute">运行状态（explicit-goal 仅在明确请求时）+ agent-mode（内层按阶段派 subagent）→ 全程无人值守</step>
  <step id="report">输出收尾总结 + 所有 phase 完成标记</step>
</workflow>

用户调用 autopilot 本身就是确认——不需要中途展示计划等"go"。
如果用户明确说"先让我看看计划"，才暂停展示。默认直接执行。

### Reference 导航（按 phase 加载，不要在开始时全部加载）

| 时机 | 加载 |
| --- | --- |
| 任务形态模板与调查清单 | `references/phase-library.md` 中对应那一节 |
| goal / loop / checkpoint / 预算 / 失败记账 | `references/execution-budget.md` |
| 工单归属、认领、批次、终态、续跑租约 | `references/ownership-and-tracker.md` |
| maker 编辑 / commit / rebase / push / 发布 | `references/concurrency-and-landing.md` |
| 测试设计 / E2E / 根因表述 / 关闭判定 | `references/evidence-and-verification.md` |
| 交付、复盘、规则晋升、最终审计 | `references/learning-and-audit.md` |

### 必须停止的红旗

- 候选工单是 draft、`in-progress`、有预约/有效外来租约/接管，或已有开工证据；
- 认领回读未成功却已经开始改代码；
- 一批只共享标签/模块/症状，没有共享精确根因和同一条验证链；
- 出现第二个 maker 或第二个 landing owner，或本机租约回读不一致；
- 想用 mock/fixture 关闭用户报告的缺陷，或用兜底成功宣称历史根因已证实；
- 任务目标没有 proof/constraints，未记录用户明确的上限，或 checkpoint 没有有界的下一步动作；
- 同一失败签名重复三次而策略没有真正改变，或 A→B→A 无新证据来回摆；
- staging 含任务外路径、远端回读不含交付 SHA，或出现任何 force-push 倾向；
- 学习规则没有证据/eval/独立 checker 就要改权威规则文件。

命中红旗时：先记录 checkpoint，停止有问题的操作或原样重试，检查可安全继续的替代路径。仍有有界下一步时继续；只有用户上限已到或证据证明没有安全路径时才结束任务并报告未完成部分。不得靠重复等待或无变化的重试绕过保护。

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

用户报告的缺陷还必须在这一步记录**精确事故身份**（规范化来源 URL/ID、产物 ID、
会话/任务 ID、目标环境与修复 watermark、期望 vs 实际）。
拿不到就明确标为 bounded unknown——fixture 可以验接线，但不能关闭该缺陷。

### 1c. 工单归属门（有关联工单时，先认领再动手）

多个 agent 和人共享同一个工单系统，**"没人在做这个"必须被证明**：

- 可选资格：OPEN、非 draft、无 `in-progress`、无预约/有效外来租约/接管信号、
  无分支/PR/协调评论证明已开工。歧义时 fail closed，跳过的候选保持**零 mutation**。
- **已有 assignee 只是弱意图**，不是自动排除条件；但认领前必须重读工单并
  **整体替换** assignee 集合，绝不在过期 assignee 上追加。
- 认领顺序：重读 → 替换 assignee → 加 `in-progress` → 写结构化认领评论 →
  从工单系统读**权威** `createdAt` 回填并回读校验。
  **第二次回读成功之前，禁止任何导向实现的编辑、commit、部署或 E2E。**
- 一批最多 4 项，且必须共享一个精确因果边界 + 一个实现 + 一条验证链。
  "都是 Bug""标签相同""模块相邻""恰好改同一个文件"都不够——发散就只做优先级最高的那一个。

完整契约（含续跑租约、终态不变量、可执行性分类）见 `references/ownership-and-tracker.md`。

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
1. 先用 `find-skills` 或直接读 `.agents/skills/` 扫描当前项目和全局可用的 skill
2. 优先选项目级 skill（如 `dev-*`, `test-*`, `debug-*`, `review-*`）——它们包含项目特定的规则和上下文
3. 项目没有专用 skill 时，退到全局 skill

<skill-matrix>
  <mapping phase="调查 / 根因定位"    primary="项目 dev skill"    fallback="直接调查（读代码 + 日志 + git blame）" />
  <mapping phase="外部研究 / 文档"     primary="deep-research"    also="anysearch, agent-reach" />
  <mapping phase="方案规划"            primary="直接规划"          also="find-skills 按需发现" />
  <mapping phase="后端 / 逻辑实现"     primary="项目 dev skill"    fallback="直接编码（无可用 skill 时）" />
  <mapping phase="前端 / UI 实现"      primary="项目 dev skill"    fallback="直接编码" />
  <mapping phase="本地验证"            primary="项目 test skill"   fallback="直接运行 tsc + test" />
  <mapping phase="部署"                primary="项目 debug/deploy skill" fallback="gh-cli + 手动推送" />
  <mapping phase="E2E 验证"            primary="项目 test skill"   also="agent-browser" />
  <mapping phase="代码审查"            primary="项目 review skill" fallback="simplify, code-review" />
  <mapping phase="深度审查"            primary="code-review (high/max)" also="" />
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

所有 autopilot 任务（包括 research / deploy / quality）还必须把下面阶段作为最后一个
mandatory phase。它必须进入 loop-goal，不能等报告时才临时想起：

<mandatory-phases for="all-autopilot">
  <phase-ref>issue-finalize — 有关联 Issue 时，写入完整实施记录、最终方案、验证证据和用户可见效果，并按真实终态关闭或保留</phase-ref>
  <phase-ref>cleanup — 清理本任务创建的临时文件、诊断产物、独立 worktree 和临时分支，并用 Git 状态证明没有任务残留</phase-ref>
</mandatory-phases>

这些阶段存在的原因：

<phase-justification id="e2e">
  本地测试只验证逻辑正确性。部署后可能因环境差异、配置缺失、迁移遗漏而表现不同。
  E2E 是唯一能从用户视角证明"真的修好了"的环节。
  即使你 100% 确信修复是正确的，也必须跑——确信本身就是风险。
  历史上多次发生"本地全绿、部署后炸"的事故。

  E2E 判定必须以运行时证据链为准（新链路自己的日志 marker / 数据行 / 指标），
  不能只看表面成功——带静默 fallback 的链路坏掉时功能照常响应，只有日志能暴露。
  三条配套规则：
  1. 外部凭证的权限面（网关 key 的模型/接口 allowlist、API key 的 scope、配额）
     是独立于代码的配置面：代码+部署完成不代表凭证就绪；改了调用目标就必须同任务
     核对所有环境的凭证权限，test 验过不代表 prod 凭证同样就绪。
  2. 空 catch / 无日志的 catch 包外部调用是缺陷不是风格问题：它把配置漂移变成
     不可见的降级。发现时必须补 queryable 日志 marker。
  3. 验证一条链路前先给它加打点——打点本身经常当场暴露此前静默存在的故障
     （真实案例：一个网关调用 401 了六周，加耗时日志的当天被发现）。
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

### 2d-1. Lane 选择（决定阶段顺序）

按**运行时消费方**选 lane，不按文件名选。拿不准时 fail closed 到 `deployed-required`。

```text
local-only（所有改动消费方都在本地可完整执行的边界内，后端/契约/env/迁移/运行时 prompt 全未变）：
investigate → design(feature 时) → implement → local-verify → e2e-1(本地完整旅程)
→ deploy-1(仅推送) → review → 按影响分类决定 e2e-2 / deploy-2 → deliver

deployed-required（任何后端/混合消费方、API 契约、迁移、env/secret/部署配置、
运行时加载的 prompt/skill、认证回调、SSR/edge、远端专属行为，或任何不确定）：
investigate → design(feature 时) → implement → local-verify → deploy-1(推送+部署)
→ e2e-1(目标环境) → review → 按影响分类决定 deploy-2 / e2e-2 → deliver
```

### 2d-2. Review 后影响分类（决定 deploy-2 / e2e-2 的形态）

review 后按 diff 实际影响面分类，**不是无脑重跑一整轮**，也**不是随便跳过**：

| diff 分类 | deploy-2 / e2e-2 |
| --- | --- |
| `no-diff`（review 无改动） | 两者 N/A，复用已 review 的 SHA |
| `docs/skill/evals-only` | 跑一个点名的替代 gate（结构校验/eval），最终推送，不等部署 |
| `test-only` | 重跑受影响测试分区，最终推送，不等部署 |
| 前端代码 diff（local-only lane） | 重跑本地 check + 针对性测试 + 独立本地 E2E，然后最终推送 |
| 任何后端/运行时/不确定的 diff | 升级为 deployed-required：最终推送 → 部署 → 跑受影响的 E2E |

分类结论和依据写进 progress.md。落地仍由同一个 landing owner 执行，
代码修改路由回 maker——checker 不 commit、不 push。

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

## Budgets
| iterations | repair cycles | elapsed | tokens | external cost |
|-----------|---------------|---------|--------|---------------|
| 0/null    | 0/null        | 0/null  | 0/null | 0/null        |

每项为 used/limit；limit 仅填写用户或权威自动化合同明确设置的上限，未设置为 null。

## Phase Status
| Order | Phase ID | Skill | Maker/Checker | Objective Gate | Status | Evidence (含 L0-L4 等级) |
|-------|----------|-------|---------------|----------------|--------|--------------------------|
| 1     | ...      | ...   | ...           | ...            | ⏳     |                          |

## Acceptance Ledger
(有多个目标项/工单时，逐项独立验收——不允许整批一起关)

| 项 | 事故身份 | 证据等级 | 精确/等价论证 | 客观证据 | 关闭判定 |
|----|---------|---------|--------------|---------|---------|

## Delivery Ledger
(每个交付 SHA 出现且只出现一次，附其精确 diff 路径；本地 commit 不算交付)

| Delivery SHA | 精确文件清单 | 远端 ancestry 回读 |
|-------------|-------------|-------------------|

## Failure Log
(每次失败记录在这里——不是用来回顾的流水账，而是用来防止重蹈覆辙的行动记忆)
失败签名 = phase + 客观 gate + 观察到的失败 + 失败边界；四项全同才累加计数。
一次性 shell 引号/拼写/harness 瞬态错误是 orchestration diagnostic，不计 repair cycle。

| Iteration | Failure Signature | Failure Type | What Was Tried | Why It Failed | What Changed Next | Repeat |
|-----------|-------------------|-------------|----------------|---------------|-------------------|--------|

## Telemetry
(每轮只记汇总，不粘贴 agent 完整输出)
spawned/reused/closed agent 数 | maker/checker 数 | routine/critical 路由与升级原因 |
wait 与状态检查次数 | context compaction 次数

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

### 2g. 定义 Loop 目标（Goal 合同）

从所有阶段的 `<done-when>` 合成一个可判定的 loop 目标。
只有用户或系统明确要求持久 Goal 时才创建；普通 autopilot 请求使用本次运行的状态文件，不隐式创建 Goal。显式创建时一个任务只保留一个 active goal，phase、重试、subagent 都不另建。
objective 控制在 1-3 句、600 字符以内，写清：

1. **Measurable end state** —— 可判定的任务终态。
2. **Proof** —— 客观验证和所需证据。
3. **Constraints** —— 归属、隐私、分支、环境和用户明确的限制。
4. **User caps** —— 仅记录用户或权威自动化合同明确设置的上限；没有则标为未设置，不编造 token、次数或时长硬上限。

迭代、修复次数和耗时持续记账，用于检查进展和换策略，不自行作为停止条件。当前任务必要的付费验证自动执行，无需额外授权；先复用证据和现有账户，重复失败先调查，禁止无限重复付费请求。此规则不授权充值、订阅购买或套餐变更。用户明确上限始终有效。

phase 表、验收矩阵写进 `progress.md`，不复制进 objective。完整契约见 `references/execution-budget.md`。

---

## Step 3: 执行

### 3a. 启动执行并按需恢复

按 Step 2g 记录 controller 模式：

- **state-only（默认）**：直接按 `progress.md` 执行当前有界动作，不调用 /goal，也不先安排空唤醒。
- **explicit-goal**：仅当用户或系统明确请求持久 Goal 时创建或恢复唯一 Goal，并保存其身份；随后执行同一阶段流程。

每个阶段结束后更新状态和证据，继续无依赖工作。确需跨轮等待时才安排当前任务唯一的调度并结束当前轮。Claude Code 使用实际可用的 ScheduleWakeup／loop；Codex 使用任务 heartbeat 或项目支持的恢复机制。不得因工具名称缺失阻塞当前可执行步骤，也不得把 Goal 与另一个定时 controller 同时作为重复驱动源。

恢复轮读取原状态文件、核对当前阶段与归属，执行有界下一步；阶段全部满足时进入 Step 4 收尾。

### 3b. 状态驱动与 Agent-Mode

- **外层状态**：围绕记录的完成条件持续推进；默认 state-only，explicit-goal 仅在明确请求时使用。
- **内层执行**：按阶段将独立任务委派给 subagent；maker、checker 和验收职责保持分离。

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
    每个 subagent 任务翻成**自包含 brief**——
    subagent 没有主循环上下文，必须把它需要的一切都写进 brief。

    **语言与格式建议（基于实测数据，供参考）**：

    brief 的语言和格式会影响 subagent 的执行效率和质量。
    以下是基于 SWE-bench 实测和 token 计数实验的建议，不是硬性规定：

    1. **指令部分建议用英文**。Claude 内部以英文推理，英文 prompt 在
       agentic/coding 任务上实测高出 5-10 个百分点。Token 成本方面
       中英文在 Claude 4.7+ 分词器下已接近平价，不是决策因素。
    2. **领域内容保留原语言**。中文研究用中文搜索词、日文市场用日文
       关键词、韩文文案用韩文参考——强制翻译会丢失领域精度。
    3. **输出语言显式指定**。不指定时模型会猜，猜错浪费整个 turn。
    4. **格式按任务复杂度选择**。简单任务用自然语言即可；复杂多步骤
       任务可用压缩格式节省 token（DSL 约省 47%，缩写英文约省 27%，
       YAML 约省 25%；XML 反而贵 19%，仅适合组织分隔）。

    主会话用什么语言与用户对话不影响 brief 的语言选择——
    brief 的语言由 autopilot 自行决定，用户无需感知。
  </rule>

  <rule id="parallel-dispatch">
    **并发分派规则**：当多个 phase 之间无数据依赖时，可以并行派多个 subagent。
    但并发 subagent **必须互不干扰**——不告知隔离边界就派发是禁止行为。

    **资源分区（强制）**：
    每个并发 subagent 的 brief 必须包含 `CONFLICT-SCOPE` 字段，
    明确声明它**独占**的文件/目录/资源范围。
    同时告知它**不得触碰**的范围（其他 subagent 的 scope）。

    ```
    CONFLICT-SCOPE:
      owns: src/auth/, src/middleware/jwt.ts
      avoid: src/api/, src/db/  (另一个 subagent 正在修改)
    ```

    **隔离层级（按风险递增选择）**：

    | 场景 | 隔离方式 |
    | --- | --- |
    | 只读任务（调查、研究、审查） | 无需隔离，可自由并发 |
    | 写不同文件 | CONFLICT-SCOPE 声明 + 主循环验证无交叉 |
    | 写同目录下不同文件 | 同上 + brief 中列出精确文件名 |
    | 可能写同一文件 | **必须用 worktree 隔离**（`isolation: "worktree"`） |
    | 操作同一浏览器 | **禁止并发**——串行执行，或分配不同 tab 并在 brief 中声明 tabId |
    | 操作同一外部服务/API | brief 中声明调用端点和操作类型，避免竞态 |

    **主循环职责**：
    - 派发前：规划分区，确认无交叉
    - 派发时：每个 brief 写入 CONFLICT-SCOPE + 并发 subagent 数量
    - 回收时：检查是否有意外的文件交叉修改，有则回退后者
    - 合并时：如果多个 subagent 的产出需要合并到同一分支，由主循环串行 commit

    **并发上限**：同一迭代内最多 3 个并发写类 subagent（含 worktree 隔离的）。
    只读 checker 不计入此限制。超过 3 个写类任务时排队串行。
  </rule>

  <rule id="model">
    根据当前宿主平台选择可用的原生 subagent 模型，不把某个外部 CLI 当作审查前提。

    **Claude 环境：默认使用自定义 agent `opus-medium`（Opus + medium effort）。**
    已配置的基础设施：
    - `~/.claude/agents/opus-medium.md`：frontmatter `model: opus` + `effort: medium`
    - `~/.claude/settings.json` 的 `env.CLAUDE_CODE_SUBAGENT_MODEL = "opus"` 作为兜底

    **分派方式**：每次调 Agent 工具时传 `subagent_type: "opus-medium"`。
    这同时锁定模型（Opus）和推理程度（medium），不需要再单独传 `model` 参数。
    只有以下两种例外：
    - 需要使用内置 agent 类型时（如 `Explore`、`Plan`），直接用内置类型，
      它们会被 `CLAUDE_CODE_SUBAGENT_MODEL` 环境变量兜底到 Opus。
    - 明确判断为轻量只读任务（单次 grep、读一个文件）时可传 `model: "sonnet"`，
      并说明为什么降档。

    **全局默认配置机制**：
    - `CLAUDE_CODE_SUBAGENT_MODEL` 环境变量：设置 subagent 默认模型，
      放在 `settings.json` 的 `env` 块或 shell 环境变量中均可。
    - `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`：强制所有 subagent（含内置 Explore/Plan）
      使用指定模型，覆盖 frontmatter 和 per-call 参数。需 v2.1.257+。
    - 模型解析优先级：per-call `model` 参数 → frontmatter `model:` → 环境变量 → 主会话模型。

    **reasoning effort**：Agent 工具调用时**不能**逐次指定 effort，
    但自定义 agent 定义文件（`~/.claude/agents/*.md`）的 frontmatter 支持
    `effort:` 字段（`low/medium/high/xhigh/max`），会覆盖会话级 effort。
    这就是为什么用 `subagent_type: "opus-medium"` 而不是裸传 `model: "opus"`——
    前者能同时控制 effort，后者不能。

    Claude 侧的已知限制：
    - `model` 只接受 `sonnet` / `opus` / `haiku` / `fable` **四个档位别名，
      没有版本粒度**，所以「Opus 4.8」这种具体版本在工具调用里钉不住；
      要把某个版本定成常驻默认，用 `CLAUDE_CODE_SUBAGENT_MODEL` 传完整模型 ID。

    在 Codex 环境，默认派 Codex subagent；涉及 implement、E2E、review 或 quality audit
    的阶段必须使用 `model="gpt-5.6-terra"` + `reasoning_effort="high"`。

    两侧共同的底线：**成本可以降，独立审查不能省**——
    不得因为模型档位低或某个 CLI 不可用就跳过 maker-checker 分离。
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
    每轮开始时扫描当前项目和全局可用的 skill（`find-skills` 或直接读
    `.agents/skills/` 目录），匹配当前 phase 所需能力。
    专项 skill 每个任务只发现和加载一次，把选择写进 progress.md 供后续 phase 复用。
  </rule>

  <rule id="agent-budget">
    按"不同 agent 数"计预算，修复回合优先复用原 agent（同一 agent 多轮不重复计数）：
    有界文档/research/verify-only = 2；单子系统代码变更 = 3；
    跨系统或多仓库代码变更 = 4（最多两个互不相交的 maker）。
    需要超预算时先 close 已完成 agent，并在 progress.md 记录缺失能力、
    为什么不能复用、新增角色和客观结束条件——"想再确认一次"不是理由。
    maker 返回可修 finding 时把窄修复发回同一个 maker，checker 只复判不接管实现。
  </rule>

  <rule id="wait-budget">
    只有下一步被该结果阻塞时才等待，否则立刻推进不重叠的工作。
    每个委派结果最多一次 90-120 秒阻塞等待，超时后不立即发起第二次。
    完成其它工作后最多再做一次状态检查；仍无进展就缩小 brief 复用/中断原 agent，
    或 close 掉由主线程完成。禁止连续 wait / 列举轮询 / 短周期 polling。
    CI/部署等待走另一套节流（首次延后 5 分钟，核心服务 3-5 分钟一次，
    旁支 5-10 分钟一次，失败才拉日志），不与本预算混用。
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
    - wrong-approach → 回 plan 阶段，多角度发散探索替代方案
    - environment-issue → 项目 debug skill 排查环境配置，或手动检查
    - hallucinated-assumption → 回 investigate 验证假设
    - incomplete-output → 继续当前 phase（不从头开始）
    - external-blocker → 降级（feature flag 关闭 + issue 留说明）
  </step>
  <step order="5">
    中止条件：
    - 用户或权威自动化合同明确设置的上限已到
    - 有界调查证明没有安全可执行的下一步或降级路径
    同一失败签名连续三次时停止原样重试，重新调查和选择策略；次数本身不终止任务。
    → 真实中止时记录已尝试方案、证据和具体未完成部分；不包装为完成
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

## Step 4: 收尾清理 + 报告

### 4a. Issue Finalization Gate（CRITICAL · 有关联 Issue 时未通过不得声明完成）

任务有关联 GitHub/GitLab/Jira Issue 时，必须在清理 worktree 之前完成 Issue 收尾。Issue 是团队
理解“为什么改、怎么改、最后实际怎样”的长期记录，不能只留一句 `Fixed in <hash>`，也不能让
关键实施证据只存在于临时 `progress.md`、聊天记录或本地截图目录。

成功交付时，用项目 Issue 工具（GitHub 优先 `gh-cli`）写一条结构完整的最终评论，至少包含：

1. **问题与根因**：用户遇到的现象、最终确认的根因，以及调查中被证伪的重要假设。
2. **实施方案**：按组件/链路列出实际落地的修复，说明关键设计选择和为什么采用该方案。
3. **改动定位**：最终 commit hash、目标分支、关键文件或迁移；多个 commit 时列出各自职责。
4. **验证证据**：本地测试命令与结果、部署环境、workflow run URL/head SHA、E2E 场景与结果、
   独立 review 结论；不能把取消、失败或未执行的验证写成通过。
5. **最终呈现效果**：用用户视角描述修复后的真实行为。涉及 UI/产物时附最终截图、artifact、
   页面或可访问证据链接；涉及 API/后台链路时附可安全公开的响应、数据或日志 marker 摘要。
6. **范围与后续**：明确已完成内容、未触碰的环境（如 production）、已知限制和仍需外部决策的动作；
   超出本任务范围的具体问题必须链接独立 follow-up Issue，不能藏在评论里。

评论不得包含 secret、token、cookie、完整用户隐私数据或只能在本机访问的临时绝对路径。优先写一条
完整的最终总结，避免用多条零散评论制造噪音。

成功任务完成评论后，按项目规则关闭 Issue、移除 `in-progress`，并重新读取 Issue 验证：

- 状态确实为 closed/done；
- 最终评论包含精确 commit hash；
- 部署/E2E/review 证据和最终效果均已记录；
- 重复或兄弟 Issue 已交叉引用并按真实状态处理。

如果任务 hard-stop、降级或未完成：不得关闭 Issue。必须留下调查结论、当前阻塞、已尝试方案和下一步，
并按项目规则释放或保留 assignee/`in-progress`。没有关联 Issue 时标记 `issue-finalize = N/A` 并说明
“任务开始时未发现或未要求创建 Issue”，不得为了满足格式制造无意义 Issue。

只有复读后的 Issue 状态和评论内容通过检查，才允许输出
`✓ PHASE issue-finalize COMPLETE: <issue URL + commit + evidence summary>`。

### 4b. Cleanup Gate（CRITICAL · 未通过不得声明完成）

任务代码、部署、E2E 和 review 全部完成后，必须执行 cleanup phase。`progress.md` 是恢复用的
临时状态，不是仓库交付物；任务结束却把它和诊断文件留在仓库根目录，说明任务没有真正收口。

按下面顺序执行，顺序不能颠倒：

1. **先证明成果不会丢失**
   - 查看 `git status --short --untracked-files=all`，区分任务文件、用户文件和其他并发任务文件。
   - 有代码改动时，确认本任务 commit 已推到目标远端分支；例如目标为 `test` 时，
     `git log origin/test..HEAD` 必须为空，且 `git merge-base --is-ancestor <task-commit> origin/test`
     必须成功。
   - 发现有效但未推送的 commit 时，先按项目保护分支规则 push/rebase，再清理。
     无法推送时必须 hard-stop 并保留 worktree，报告抢救路径；绝不能为了“清理干净”删除成果。

2. **清理所有任务自有临时文件和产物**
   - 删除 `progress.md`、任务专用 `progress-*.md`、临时 plan/state 文件。
   - 删除一次性诊断脚本、`tmp-*`、`cw-*.json`、日志导出、下载的 workflow artifact、
     临时截图、测试输出、scratchpad 内容和其它只为本轮调查/验证生成的文件。
   - 用户明确要求的交付物、正式测试、正式文档和已纳入提交的可重放证据不是临时产物，必须保留。
   - 只删除能证明由本任务创建的路径；禁止使用宽泛 glob 或删除其他并发任务/用户的未跟踪文件。
   - `progress.md` 最后删除，因为前面的清理失败时仍需要它恢复现场。

3. **清理隔离 worktree 和临时分支**
   - 只清理本任务自己创建的独立 worktree，绝不删除共享主工作目录。
   - 在主仓库执行 `git worktree remove "$WORKTREE_DIR" --force`，然后删除本任务临时分支并
     `git worktree prune`。使用 `--force` 的前提是上一步已经证明没有未推送 commit 或需保留改动。
   - 没有创建独立 worktree 时明确标记 N/A，不得为了满足格式去删除当前工作树。

4. **客观复核清理结果**
   - 再次运行 `git status --short --untracked-files=all`，确认没有本任务遗留路径。
   - `git worktree list` 和 `git branch --list` 不得再出现本任务 worktree/临时分支。
   - 其他人的改动可以继续存在，但必须在报告里明确标为非本任务所有，不能擅自删除。

只有上述四步全部通过，才允许输出 `✓ PHASE cleanup COMPLETE` 并进入最终报告。

### 4c. 复盘与规则晋升（每个任务强制，包括干净跑通的任务）

复盘记录：什么证据改变了计划、哪个 gate 抓到真实缺陷、结论是任务专属还是可泛化、
是否已有规则覆盖、晋升是否成立。**不要为了凑数强行晋升**——
`no-promotion` + 一个理由是合法且必需的结果。

晋升到持久化规则（skill / 项目规则文件）必须同时满足：真实任务的直接隐私安全证据、
可泛化、有客观 gate、加了会在规则前失败规则后通过的 eval、
独立 checker 校验过范围与非重复、且规则+eval+文档落在**同一个交付 commit**。
按职责指定唯一真相源并**替换**它，不要在入口文件追加平行规则。
完整晋升门见 `references/learning-and-audit.md`。

### 4d. 最终审计序列（声称完成之前逐项执行）

1. 每个计划内 phase 已完成或有理由充分的 N/A；
2. 每个目标项/工单有独立的事故身份、证据、评论和终态决定（用一次权威快照读取）；
3. 每个交付 SHA 都是目标远端分支的 ancestor，且被 Delivery Ledger 归因；
4. 每个交付 commit 的 diff 都落在精确文件清单内、清单每个文件都被覆盖、
   没有残留的任务自有未提交 diff 或未推送 commit；
5. 至少一条学习决定走完晋升门、被带理由拒绝，或被标为 run-specific；
6. 改了 skill 就跑结构校验；
7. 所有交付审计通过之后：state-only 将运行状态标记完成并回读；explicit-goal 才将已记录的 Goal 标记完成并回读。收尾绝不为了满足检查而创建 Goal。

**绝不把 subagent 的一句 "done" 当作审计证据。**

### 4e. 收尾报告

执行完成后输出简洁总结：

<report-template>
  <item>执行路线（阶段 → 所选 skill → 结果）</item>
  <item>Loop 目标 + 达成状态</item>
  <item>改动文件列表（含跨仓库）</item>
  <item>部署 / 验证结论（如适用）</item>
  <item>Commit hash</item>
  <item>Issue 最终记录：URL、关闭状态、实施方案/验证证据/最终效果已回填的复核结论（如适用）</item>
  <item>所有 phase 的 ✓ 完成标记清单</item>
  <item>Cleanup 证据：临时文件/产物已清理，worktree/临时分支已删除或 N/A，远端提交已确认</item>
  <item>iterations 次数 + 失败回溯记录</item>
  <item>未完成项 + 原因（如有）</item>
</report-template>
