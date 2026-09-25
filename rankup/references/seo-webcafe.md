# 哥飞工具箱：使用官方 Skill

Rankup 只负责判断**什么时候需要哥飞数据、结果如何进入本项目决策**。工具清单、参数、价格和调用顺序，以[哥飞官方 API 与 Skill 页面](https://seo.web.cafe/api/)及已安装的官方 `SKILL.md` 为准。Rankup 不保存其 Skill、CLI 或接口实现。

## 安装与加载

需要选词、拆竞品、查域名、审页面或查哥飞经验时，先检查当前 Agent 的 Skill 目录是否已有 `gefei/SKILL.md`。未安装就从[官方 Skill 包](https://seo.web.cafe/api/skills/gefei-skills.zip)安装到当前客户端支持的 Skills 目录；不要从 Rankup 仓库复制旧版。安装后读取官方总入口 `gefei/SKILL.md`，再按任务读取对应的专用 `SKILL.md` 并执行。**四个专用 Skill 都设置了 `disable-model-invocation: true`，仅加载 Rankup 不会让它们自动触发；必须由 Rankup 主动读取文件，或由用户手动调用对应的 `/gefei-*` 命令。**

| 任务 | 加载的官方 Skill |
|---|---|
| 找关键词、扩词、核实量和难度 | `gefei-keywords` |
| 拆竞品流量、排名词和页面 | `gefei-competitor` |
| 域名注册、历史、估值尽调 | `gefei-domain` |
| 页面 SEO 体检和优化 | `gefei-page` |
| 查经验规则、遇到不知道如何处理的问题、其他工具需求 | `gefei` 总入口 |

官方包自带 CLI；若当前客户端已接入哥飞 MCP，按官方 Skill 的说明使用 MCP。**不要再调用站内哥飞 AI 来代做调研。** `gefei` 总入口会按问题选 `load_guide`、`knowledge_ask`、原始数据或组装接口；工具的实际名称与参数从官方 Skill 和实时目录读取，不以 Rankup 的旧清单为准。

官方 CLI 可用 `node <已安装的gefei目录>/scripts/webcafe.mjs tools` 查看实时接口与价格，`me` 查看可用积分，`usage --api` 对账。令牌按官方 Skill 的说明保存在本机受控配置或进程环境，绝不进入 Rankup 源码、项目报告、命令参数或对话。开放 API 只扣积分余额，网站每日赠送额度不适用；调用失败、余额不足或限速都不能记为「数据为零」。

## Rankup 如何使用结果

1. 先按 Rankup 的选品/调研/上线闸门明确问题和目标国家，再加载对应官方 Skill；不要为一个模糊问题把工具全跑一遍。
2. 让官方 Skill 按其工作流取数。能批量就批量；已有同口径数据不重复付费。每条结果保留工具名、市场、日期、快照/缓存口径、原始请求号与实际扣费。
3. Rankup 自己核实与判读：预筛难度与哥飞版 KD 分开，整站访问与估算自然流量分开；`null`、未收录、429、上游失败都不等于 0。全球需求必须有全球口径，默认美国值不能冒充全球。
4. 真实 SERP 版式、目标市场本地搜索、社区原话、GSC 和 PageSpeed 继续按 Rankup 的相应流程验证。外部工具建议逐条采纳或记录拒绝理由，不能直接当结论。

若官方 Skill 未安装或令牌无效，只标记该依赖步骤待完成；仍可推进不依赖它的本地与公开来源检查。不要改用旧网页登录端点或站内 AI 来伪装成同一份证据。
