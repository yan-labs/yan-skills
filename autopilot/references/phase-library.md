# Phase Library

按任务类型提供阶段模板和调查清单。
Autopilot 根据分类结果加载对应模板，用调查发现填充具体内容。

模板是参考骨架——根据实际范围增加阶段，但 mandatory 阶段不允许删除。

每个 phase 的 `<gate>` 是客观验证信号（机器可判定的 pass/fail），
不是主观判断。没有 gate 的 phase = 自己判自己的卷。

---

## bug-fix

<scope-checklist type="bug-fix">
  - 拉 GitHub issues：`gh issue list --state open --label Bug --json number,title,body,labels,assignees`
  - 逐条读 body，找同根因 issue 归组
  - 检查是否有人已在做（in-progress 标签 / 近期 commit / 分支 / PR）
  - 快速 trace 受影响代码路径
  - 把 issue body 里的独立现象拆成编号清单（区分症状链 vs 独立问题）
</scope-checklist>

<template type="bug-fix">
  <phase id="claim" order="1" mandatory="true">
    <skill>gh-cli</skill>
    <goal>认领 issue 组（assign + in-progress 标签）</goal>
    <gate>gh issue view 显示 assignee = @me 且 labels 含 in-progress</gate>
    <done-when>组内所有 issue 标记 in-progress 并 assign 给当前账号</done-when>
    <on-fail>若已有人在做则整组跳过，评论告知同根因</on-fail>
  </phase>

  <phase id="investigate" order="2" mandatory="true">
    <skill>项目 dev skill + systematic-debugging</skill>
    <goal>全盘调查，逐一定位每个独立问题的根因</goal>
    <gate>每个问题有"文件:行号 + 根因描述 + 证据引用"三要素</gate>
    <done-when>每个问题的根因定位到具体代码位置，有证据</done-when>
    <on-fail>分类失败原因 → missing-context: 项目 debug skill 查远程日志;
             hallucinated-assumption: 验证假设后重查</on-fail>
  </phase>

  <phase id="plan" order="3" mandatory="true">
    <skill>writing-plans</skill>
    <goal>基于根因制定修复方案，逐一对应每个子问题</goal>
    <gate>方案文件存在且覆盖所有子问题编号</gate>
    <done-when>方案覆盖所有子问题，自主选定最优解并记录理由</done-when>
    <on-fail>brainstorming 探索替代路径</on-fail>
  </phase>

  <phase id="implement" order="4" mandatory="true">
    <skill>项目 dev skill</skill>
    <goal>根因层面修复 + 注释 + i18n</goal>
    <gate>tsc 退出码 0 + 相关测试退出码 0</gate>
    <done-when>本地 tsc + 相关测试通过</done-when>
    <on-fail>分类失败原因 → wrong-approach: 回 plan 重新选方案;
             incomplete-output: 继续实现剩余部分</on-fail>
  </phase>

  <phase id="deploy-1" order="5" mandatory="true">
    <skill>项目 deploy skill</skill>
    <goal>第一轮提交并部署到 test</goal>
    <gate>gh run view 状态 = success（核心服务 job）</gate>
    <done-when>核心服务部署绿</done-when>
    <on-fail>分类失败原因 → environment-issue: 查部署日志定位;
             incomplete-output: 补遗漏的配置/迁移后重推</on-fail>
  </phase>

  <phase id="e2e-1" order="6" mandatory="true">
    <skill>项目 test skill + agent-browser</skill>
    <goal>第一轮 E2E 验证——每个 issue 现象真实消失（独立 checker subagent）</goal>
    <gate>agent-browser 截图/操作结果证明现象消失 + 无回归</gate>
    <done-when>所有子问题验证通过，无回归</done-when>
    <on-fail>分类失败原因后 loop 回对应上游 phase</on-fail>
    <skip-forbidden>本地测试只验证逻辑，E2E 验证部署后真实行为</skip-forbidden>
  </phase>

  <phase id="review" order="7" mandatory="true">
    <skill>simplify + 项目 review skill</skill>
    <goal>代码审查 + 注释合规 + 精细优化（独立 checker subagent）</goal>
    <gate>review skill 输出无 blocking issue + simplify 无新 finding</gate>
    <done-when>review 通过，注释完整准确</done-when>
    <on-fail>按 review 意见修改后重审</on-fail>
    <skip-forbidden>审查拦截注释缺失、兼容漏洞、影响面失控</skip-forbidden>
  </phase>

  <phase id="deploy-2" order="8" mandatory="true">
    <skill>项目 deploy skill</skill>
    <goal>review 修改后二次部署</goal>
    <gate>gh run view 状态 = success</gate>
    <done-when>部署绿</done-when>
    <on-fail>同 deploy-1</on-fail>
    <skip-forbidden>review 修改可能引入新问题，必须经过部署验证</skip-forbidden>
  </phase>

  <phase id="e2e-2" order="9" mandatory="true">
    <skill>项目 test skill + agent-browser</skill>
    <goal>二次 E2E 验证（独立 checker subagent）</goal>
    <gate>agent-browser 截图/操作结果确认功能正常</gate>
    <done-when>验证通过</done-when>
    <on-fail>分类失败原因后 loop 回对应上游 phase</on-fail>
    <skip-forbidden>确保 review 修改没有破坏任何东西</skip-forbidden>
  </phase>

  <phase id="close" order="10" mandatory="true">
    <skill>gh-cli</skill>
    <goal>关闭 issue 并附 commit hash</goal>
    <gate>gh issue view 状态 = closed</gate>
    <done-when>组内所有 issue 关闭</done-when>
    <on-fail>N/A</on-fail>
  </phase>
</template>

---

## feature

<scope-checklist type="feature">
  - 读关联的 spec、issue、PR 描述，提取需求清单
  - 用 context7 检查是否有现成库/模式可复用
  - 定位受影响的模块/文件/store
  - 检查现有代码模式（避免重复造轮子）
  - 评估前后端影响面
  - **运行 feature-completeness-checklist**（见下方），逐项核查并记录到方案文件
</scope-checklist>

<feature-completeness-checklist type="feature">
  功能不是"代码能跑"就算完成。以下清单覆盖历史上反复出现的"半成品上线"模式。
  design phase 必须逐条过一遍；不适用的标 N/A 并写明理由；适用但本次不做的
  必须 flag-gate 关闭并写进 progress.md 的"未完成项"。

  ## A. 多表面一致性（Multi-Surface Consistency）
  同一数据/功能在不同页面/面板/模式下渲染必须一致。
  - [ ] 列出所有会展示此功能的 surface（如：右侧面板、弹窗预览、分享页、移动端、Bot 消息卡片）
  - [ ] 每个 surface 使用同一个渲染组件或同一套 CSS/样式 token
  - [ ] 如果某 surface 需要变体（如分享页用 articleSkin），变体必须在同一 PR 里实现并验证
  - [ ] 禁止"先做主面板，分享页/移动端下次再说"——要么全做，要么 flag-gate 不暴露

  ## B. 用户设置持久化（Settings Persistence）
  任何用户可调节的设置必须能保存和恢复。
  - [ ] 如果功能包含用户设置项（主题、布局、偏好、配置），设置必须持久化到后端或 store
  - [ ] 禁止 useState-only 的设置项——刷新丢失 = 未完成
  - [ ] 如果设置需要在其他 surface 生效（如分享页读用户设定的主题），后端 API 必须返回设置值
  - [ ] 新增持久化字段时，必须同步：后端 DTO/entity/migration + 前端 store action + API 客户端生成

  ## C. 公开页面基础设施（Public Page Infrastructure）
  任何通过 URL 可公开访问的页面必须具备基础的 Web 标准能力。
  - [ ] 公开页面必须有合理的 `<title>` 和 `<meta name="description">`
  - [ ] 如果页面可被社交平台分享，必须有 og:title / og:description / og:image meta tags
  - [ ] 如果页面内容对 SEO 有价值，确认服务端不发 noindex 或有 SSR/预渲染方案
  - [ ] 公开页面的加载状态必须合理（不是 skeleton 模拟未来布局、不是空白屏幕）
  - [ ] 如果 SEO/OG 基础设施当前不存在且不在本次 scope 内，在文档和 progress.md 明确标记为已知缺口

  ## D. 数据完整性（Data Completeness）
  新功能引入的数据必须端到端流通。
  - [ ] 前端写入的字段，后端必须持久化并在读取时返回
  - [ ] 后端返回的字段，前端必须消费（或有意忽略并注释原因）
  - [ ] 如果功能依赖现有数据（如 artifact metadata），确认该数据在目标上下文中可用
  - [ ] 批量/列表接口必须返回足够的摘要字段，不留 N+1 给前端

  ## E. 跨功能影响（Cross-Feature Impact）
  - [ ] 新 surface 是否影响现有功能的导航、布局、权限？
  - [ ] 新设置是否影响导出、分享、打印等下游消费？
  - [ ] 新公开页面是否需要认证/权限检查？匿名访问 vs 登录态？

  每条未通过项必须在 design phase 的方案文件里写明处置决策：
  - 本次做 → 纳入实现阶段
  - 本次不做但安全 → flag-gate 并记入 progress.md 未完成项
  - 不适用 → 标 N/A 并简述理由
</feature-completeness-checklist>

<template type="feature">
  <phase id="research" order="1" mandatory="true">
    <skill>项目 dev skill + context7</skill>
    <goal>理解需求 + 检查可复用的库和现有模式</goal>
    <gate>需求清单列出 + 技术路径确认（有库可复用 / 需自建）</gate>
    <done-when>需求明确，技术可行性确认</done-when>
    <on-fail>deep-research 扩大搜索</on-fail>
  </phase>

  <phase id="design" order="2" mandatory="true">
    <skill>writing-plans</skill>
    <goal>设计实现方案（API / Store / 组件 / 迁移）+ 通过 feature-completeness-checklist</goal>
    <gate>方案文件存在且覆盖所有需求点 + feature-completeness-checklist 每条标记通过/N/A/flag-gated</gate>
    <done-when>方案覆盖所有需求点，符合架构规则，checklist 无遗漏</done-when>
    <on-fail>brainstorming 探索替代方案</on-fail>
  </phase>

  <phase id="implement" order="3" mandatory="true">
    <skill>项目 dev skill + frontend-design</skill>
    <goal>实现功能（后端 + 前端 + i18n + 注释）——覆盖 checklist 中标记"本次做"的所有项</goal>
    <gate>tsc 退出码 0 + build 退出码 0 + 测试退出码 0</gate>
    <done-when>本地 tsc + build + 测试通过</done-when>
    <on-fail>分类失败原因后选对应修复路径</on-fail>
  </phase>

  <phase id="deploy-1" order="4" mandatory="true">
    <skill>项目 deploy skill</skill>
    <goal>部署到 test</goal>
    <gate>gh run view 状态 = success</gate>
    <done-when>部署绿</done-when>
    <on-fail>查日志修复</on-fail>
  </phase>

  <phase id="e2e-1" order="5" mandatory="true">
    <skill>项目 test skill + agent-browser</skill>
    <goal>端到端验证功能正常（独立 checker subagent）</goal>
    <gate>agent-browser 操作/截图确认功能可用 + 无回归</gate>
    <done-when>功能正常工作，无回归</done-when>
    <on-fail>分类失败原因后 loop 回对应上游 phase</on-fail>
    <skip-forbidden>本地 build 通过不等于部署后功能正常</skip-forbidden>
  </phase>

  <phase id="review" order="6" mandatory="true">
    <skill>simplify + 项目 review skill</skill>
    <goal>代码审查 + 注释 + 精细优化（独立 checker subagent）</goal>
    <gate>review skill 输出无 blocking issue</gate>
    <done-when>review 通过</done-when>
    <on-fail>修改后重审</on-fail>
    <skip-forbidden>审查拦截架构违规、注释缺失、兼容漏洞</skip-forbidden>
  </phase>

  <phase id="deploy-2" order="7" mandatory="true">
    <skill>项目 deploy skill</skill>
    <goal>review 修改后二次部署</goal>
    <gate>gh run view 状态 = success</gate>
    <done-when>部署绿</done-when>
    <on-fail>查日志修复</on-fail>
  </phase>

  <phase id="e2e-2" order="8" mandatory="true">
    <skill>项目 test skill + agent-browser</skill>
    <goal>二次 E2E 验证（独立 checker subagent）</goal>
    <gate>agent-browser 确认功能正常</gate>
    <done-when>验证通过</done-when>
    <on-fail>分类失败原因后 loop 回对应上游 phase</on-fail>
  </phase>
</template>

---

## refactor

<scope-checklist type="refactor">
  - 扫描目标区域代码气味、重复、复杂度
  - 检查现有测试覆盖（重构前必须有测试兜底）
  - 评估影响面（谁依赖这些代码）
  - 确认重构后的行为应该完全不变
</scope-checklist>

<template type="refactor">
  <phase id="analyze" order="1" mandatory="true">
    <skill>项目 dev skill</skill>
    <goal>分析目标区域，识别重构点和依赖关系</goal>
    <gate>重构范围清单 + 受影响模块列表</gate>
    <done-when>重构范围明确，影响面已评估</done-when>
    <on-fail>缩小范围</on-fail>
  </phase>

  <phase id="test-lock" order="2" mandatory="true">
    <skill>项目 test skill</skill>
    <goal>确认现有测试覆盖，补必要回归测试锁定行为</goal>
    <gate>目标代码路径有测试覆盖 + 测试全绿</gate>
    <done-when>重构范围有足够测试覆盖</done-when>
    <on-fail>先补测试再重构</on-fail>
    <skip-forbidden>没有测试兜底的重构 = 盲改</skip-forbidden>
  </phase>

  <phase id="implement" order="3" mandatory="true">
    <skill>项目 dev skill</skill>
    <goal>执行重构（结构改善，行为不变）</goal>
    <gate>tsc 退出码 0 + 全部既有测试退出码 0</gate>
    <done-when>tsc + 全部既有测试通过</done-when>
    <on-fail>回退到安全状态，缩小重构范围</on-fail>
  </phase>

  <phase id="verify" order="4" mandatory="true">
    <skill>项目 test skill</skill>
    <goal>确认行为没有变化</goal>
    <gate>所有测试绿 + build 退出码 0</gate>
    <done-when>所有测试绿 + build 通过</done-when>
    <on-fail>loop 回 implement</on-fail>
  </phase>

  <phase id="review" order="5" mandatory="true">
    <skill>simplify + 项目 review skill</skill>
    <goal>审查重构质量（独立 checker subagent）</goal>
    <gate>review skill 输出无 blocking issue</gate>
    <done-when>review 通过</done-when>
    <on-fail>修改后重审</on-fail>
  </phase>
</template>

---

## test

<scope-checklist type="test">
  - 定位未覆盖的路径/模块
  - 读项目 test skill 获取测试账号和环境配置
  - 检查现有测试模式和框架（jest / pytest / playwright）
  - 评估需要覆盖的场景数量
</scope-checklist>

<template type="test">
  <phase id="scope" order="1" mandatory="true">
    <skill>项目 dev skill + 项目 test skill</skill>
    <goal>识别未覆盖路径，规划测试场景</goal>
    <gate>测试场景清单存在 + 按优先级排序</gate>
    <done-when>测试清单列出，优先级排序</done-when>
    <on-fail>缩小范围到最关键路径</on-fail>
  </phase>

  <phase id="implement" order="2" mandatory="true">
    <skill>项目 test skill</skill>
    <goal>编写测试用例</goal>
    <gate>所有计划的测试文件已创建</gate>
    <done-when>所有计划的测试用例写完</done-when>
    <on-fail>修复测试代码错误</on-fail>
  </phase>

  <phase id="run" order="3" mandatory="true">
    <skill>项目 test skill</skill>
    <goal>运行测试并确认全绿</goal>
    <gate>测试命令退出码 0 + 0 failures</gate>
    <done-when>所有测试通过</done-when>
    <on-fail>loop 回 implement 修测试或修被测代码</on-fail>
  </phase>

  <phase id="review" order="4" mandatory="true">
    <skill>项目 review skill</skill>
    <goal>审查测试质量（覆盖是否充分、断言是否有意义）（独立 checker subagent）</goal>
    <gate>review skill 输出无 blocking issue</gate>
    <done-when>review 通过</done-when>
    <on-fail>补充/修改测试</on-fail>
  </phase>
</template>

---

## research

<scope-checklist type="research">
  - 收集症状、日志、用户报告
  - 定位相关代码路径
  - 判断是否需要远程日志/环境信息
  - 确定产出形式（口头结论 / findings 文件 / issue 评论）
</scope-checklist>

<template type="research">
  <phase id="gather" order="1" mandatory="true">
    <skill>项目 dev skill + 项目 debug skill</skill>
    <goal>收集所有相关证据（代码、日志、配置、现象）</goal>
    <gate>至少 2 个独立证据源收集到相关数据</gate>
    <done-when>关键证据收集完毕</done-when>
    <on-fail>deep-research 扩大信息源</on-fail>
  </phase>

  <phase id="analyze" order="2" mandatory="true">
    <skill>systematic-debugging</skill>
    <goal>分析证据，形成假设，验证或排除</goal>
    <gate>假设有证据链支撑 + 至少排除 1 个替代假设</gate>
    <done-when>根因/结论有证据支撑</done-when>
    <on-fail>扩大调查范围</on-fail>
  </phase>

  <phase id="report" order="3" mandatory="true">
    <skill>writing-plans</skill>
    <goal>输出结论和建议（含后续行动建议）</goal>
    <gate>结论文件存在 + 包含可执行的下一步</gate>
    <done-when>结论清晰、可执行</done-when>
    <on-fail>N/A</on-fail>
  </phase>
</template>

---

## deploy

<scope-checklist type="deploy">
  - 确认当前分支状态和待部署 diff
  - 检查 CI/CD pipeline 状态
  - 确认目标环境（test / main / 指定服务）
  - 检查是否有待运行的迁移
</scope-checklist>

<template type="deploy">
  <phase id="prepare" order="1" mandatory="true">
    <skill>项目 deploy skill</skill>
    <goal>同步分支、确认 diff 正确、检查迁移</goal>
    <gate>git status 干净 + diff 只含预期文件</gate>
    <done-when>分支干净、diff 符合预期</done-when>
    <on-fail>解决冲突/补遗漏</on-fail>
  </phase>

  <phase id="push" order="2" mandatory="true">
    <skill>项目 deploy skill</skill>
    <goal>推送并监控部署</goal>
    <gate>gh run view 状态 = success（目标服务 job）</gate>
    <done-when>目标服务部署绿</done-when>
    <on-fail>查失败日志，修复后重推</on-fail>
  </phase>

  <phase id="verify" order="3" mandatory="true">
    <skill>项目 test skill + agent-browser</skill>
    <goal>部署后验证功能正常（独立 checker subagent）</goal>
    <gate>agent-browser 操作/截图确认关键功能可用</gate>
    <done-when>关键功能正常，无回归</done-when>
    <on-fail>回退或修复后重部署</on-fail>
  </phase>
</template>

---

## quality

<scope-checklist type="quality">
  - 确定审查范围（全仓库 / 指定模块 / 最近变更）
  - 跑 lint / type-check 看现有状态
  - 识别高优先级区域（最近改动多 / 复杂度高 / 缺注释）
</scope-checklist>

<template type="quality">
  <phase id="scan" order="1" mandatory="true">
    <skill>项目 dev skill</skill>
    <goal>扫描目标范围，识别问题分类和优先级</goal>
    <gate>问题清单存在 + 按优先级排序 + lint/tsc 基线记录</gate>
    <done-when>问题清单按优先级排好</done-when>
    <on-fail>缩小范围</on-fail>
  </phase>

  <phase id="fix" order="2" mandatory="true">
    <skill>项目 dev skill + simplify</skill>
    <goal>逐一修复/优化（行为保持不变）</goal>
    <gate>tsc 退出码 0 + build 退出码 0 + 测试退出码 0</gate>
    <done-when>tsc + build + 测试通过</done-when>
    <on-fail>回退有风险的改动</on-fail>
  </phase>

  <phase id="review" order="3" mandatory="true">
    <skill>项目 review skill</skill>
    <goal>最终审查确认质量提升且无回归（独立 checker subagent）</goal>
    <gate>review skill 输出无 blocking issue</gate>
    <done-when>review 通过</done-when>
    <on-fail>修改后重审</on-fail>
  </phase>
</template>
