---
name: gefei-domain
description: 哥飞 SEO 工作流「买域名 / 买站前尽调」：注册状态、历史快照、DR 与流量、估值，判断值不值。手动调用：/gefei-domain <域名> [报价美元]
argument-hint: <域名> [报价美元]
disable-model-invocation: true
---

# 买域名 / 买站前尽调

用户给的参数：$ARGUMENTS

参数依次是：域名；对方报价（美元），可空（可空）。必填的没给就先问用户，别猜。可空的给了就一并用上，没给就跳过要用它的步骤。

## 工作流

帮我尽调 〈域名〉（报价 $〈对方报价（美元），可空〉）。
步骤：load_guide 取 domains；domain_availability 看注册状态；domain_timeline 看历史用过几段、有没有空窗；domain_overview 看 DR 与流量；有流量的再 website_worth 估值。最后给结论：历史干不干净、值多少、报价合不合理、风险点。

## 怎么调用

- 接了 gefei MCP：直接调 `mcp__gefei__<工具名>`（上面写的 keyword_ideas、load_guide 等就是工具名）。
- 没接 MCP：用 /gefei 技能自带的命令行 `node ~/.claude/skills/gefei/scripts/webcafe.mjs <工具名> ...`（令牌在环境变量 WEBCAFE_TOKEN）。
- 数字只来自工具结果，查不到就说查不到；每次调用都扣用户的积分余额，结束时告诉用户这次一共花了多少积分。
