---
name: rankup
description: 独立开发者项目的指挥台：选词选品与需求验证、建站（默认走站点引擎 MCP，可多站成批）、上线前 SEO/GEO 体检、上线接入、变现与监控，并用项目 `.rankup/` 记录做跨会话接力。用户提到 rankup 或 /rankup（check、review、init、doctor），或说「这个词能不能做」「挖点需求」「选品」「做个站」「批量建站」「能不能上线」「接 GSC、提交 sitemap」「流量掉了」「ChatGPT 会不会推荐我们」「定价、接支付」时使用；在有 `.rankup/` 的项目里说「继续」「上次做到哪」「下一步做什么」「整理项目记录」时也使用，即使没提 SEO。独立的 Google Trends 热度查询或对比（不建站也适用）。macOS、iOS、iPad 原生 App 的立项与项目记录同样适用。不用于：纯写文章或文案（write、blog）、外链执行（backlink）、浏览器驱动（opencli）、配图（imagegen）、派单本身与 fleet 产物清理（agent-fleet）、与项目记录无关的通用开发和部署排错。
metadata:
  version: "5.1.2"
---

# Rankup

管独立开发者项目从选词到变现的全过程：调研 → 立项 → 建站或原生 App → 上线前 SEO/GEO → 上线接入 → 外链 → 变现与监控。
SEO/GEO 是主要手段，不是适用边界：项目计划、交接、功能迭代、上线运维、项目记录整理都归这里。
本文件只做入口：每类任务给一个第一站（开工卡），读完那一张就能开工；全部参考文件的目录在 [references/INDEX.md](references/INDEX.md)。

## 三条口径（下一个会话会把记录当事实）

- 取不到的数据写「未知 / 不可用」，不写 0。
- 区分「官方要求」「工具建议」「项目经验」。
- 阶段性汇报不等于完成。

## 开工

1. 读记忆索引（全局层再项目层，缺文件跳过）：!`node "${CLAUDE_SKILL_DIR}/scripts/maintain/read-memory-index.mjs"`
   未展开时手动运行 `node "<rankup-skill-dir>/scripts/maintain/read-memory-index.mjs" [<项目目录>]`。
2. 项目任务先读项目接力，按[接力协议](references/project-memory.md#接力协议任务随时可能中断新会话必须立即接上)对账后再动手；只读问答只核对所问的事实。
3. 跑 check、review、init 前执行 `scripts/check-version.mjs --project-root . --apply`（自带 24 小时节流，网络失败保留当前版本）；doctor 与禁止联网的任务跳过。

被派单的执行者不走 1–3：读 brief 指定的那张开工卡和 [references/executor.md](references/executor.md)。
需要登录态的验收先按[测试身份与登录通路](references/discipline.md#测试身份与登录通路)复用已有身份。

## 任务入口

| 用户在说 | 第一站 | 做完的标志 |
|---|---|---|
| 继续、上次做到哪、下一步 | [playbooks/resume.md](references/playbooks/resume.md) | 下一步已有执行证据 |
| 这个词能不能做、扩词（有主词） | [playbooks/entry.md](references/playbooks/entry.md) | 入口卡写进 `.rankup/research/` |
| 挖需求、没给词 | [research/p1-discovery.md](references/playbooks/research/p1-discovery.md) | 出现主词，转上一行 |
| 选品、这个方向值不值得做 | [playbooks/selection.md](references/playbooks/selection.md) | 候选移交 `entry.md` 裁决 |
| 热度查询与对比、趋势监控 | [trends.md](references/trends.md)（长期监控见其中指针） | 结论带基线与口径 |
| App 有没有需求 | [research.md App 分支](references/playbooks/research.md#app-市场验证分支) | 网页指标标 N/A |
| 做个站、加功能、成批建站 | [playbooks/build.md](references/playbooks/build.md) | [checklists](references/checklists.md) 段 3 |
| 写页面内容 | 文章类页面走 blog Skill；工具首页、长尾内页、FAQ、title、description 走 write Skill 的站内页面卡 | 回读证据齐 |
| 能不能上线、SEO/GEO 体检 | [playbooks/prelaunch.md](references/playbooks/prelaunch.md) | 段 4 全绿或写明原因 |
| 上线、绑域名、接平台、不收录 | [playbooks/launch.md](references/playbooks/launch.md) | `.rankup/integrations.md` 逐行有证据 |
| 外链、推荐位、变现、定价、流量涨跌 | [playbooks/growth.md](references/playbooks/growth.md) | 台账与验证记录有证据 |
| check、review | [playbooks/site-review.md](references/playbooks/site-review.md)（init 等命令见 [commands.md](references/commands.md)） | 结论写回 `.rankup/` |
| doctor、清理项目过程数据、压缩记忆 | [playbooks/records.md](references/playbooks/records.md) | 整理报告 |
| 改 rankup 自身、经验回流 | [maintenance.md 五](references/maintenance.md#五维护-skill-源码rankup-本身) | 校验与测试通过 |

站建在站点引擎上时（项目 `.rankup/infrastructure.md` 写了站点标识，或全局层配了默认引擎）：建站、改页、体检、发布、看数据默认走引擎 MCP，先读 [references/integrations/site-engine.md](references/integrations/site-engine.md) 的「开工核对」；不起脚手架、不写部署脚本、不手工进后台改页面。

以上没有的：[references/INDEX.md](references/INDEX.md)。已有项目但没说做什么：先 check。连方向都没有：只问一句有没有想好的词。

## 随时生效的五条

- 先查脚本再动手，可复用操作必须落成脚本，脚本坏了修脚本：现写等价实现会让下一轮再重写一遍（[纪律二](references/discipline.md)）。
- 浏览器走 opencli 会话：复用登录态，过程可复现（[纪律五](references/discipline.md#五浏览器与取数规则在-opencli-skill这里只留判据)）。
- AI 爬虫全部放行并逐 UA 实测：公开内容先要能被发现和读取（`checklists.md` 段 5）。
- 先把代码合入对应环境分支并推送，再走现有流水线部署：防止互相冲掉（[纪律二十二](references/discipline.md#二十二部署红线先合入对应环境分支并推送再部署)）。
- 严禁在 Skill、`.rankup/`、Git、测试或回复中保存真实密钥、token、密码、私钥、webhook secret、支付敏感数据或个人敏感信息：这些位置都会被复制和分享。

## 做事的主线

每段先过 [references/checklists.md](references/checklists.md) 的闸门再进下一段；状态记在项目 `.rankup/checks.md`（✅ 加证据位置与日期）。
判据只在 `checklists.md`，关键词与立项裁决只在 `entry.md`；各段硬规则全文在对应的段文件。

## 收尾

规则被证伪或用户纠正：当场原地修订。有状态变化：覆盖接力。沉淀义务与是否调用本 Skill 无关（[细则](references/project-memory.md#沉淀义务)）。
其余按 [maintenance.md 一、二](references/maintenance.md#二收尾维护五步顺序固定)；没有可沉淀的写一句理由即可。
