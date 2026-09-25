---
name: gefei-competitor
description: 哥飞 SEO 工作流「拆竞品：这个站靠什么吃流量」：流量盘子、渠道与地区、靠哪些词、哪些页面，以及能学什么。手动调用：/gefei-competitor <竞品域名，如 photoroom.com>
argument-hint: <竞品域名，如 photoroom.com>
disable-model-invocation: true
---

# 拆竞品：这个站靠什么吃流量

用户给的参数：$ARGUMENTS

参数依次是：竞品域名，如 photoroom.com。必填的没给就先问用户，别猜。

## 工作流

帮我拆解竞品 〈竞品域名，如 photoroom.com〉。
步骤：load_guide 取 traffic；domain_overview 看流量盘子、渠道、地区、DR、主力词；site_keywords 看靠哪些词和落地页（用来源地区第一大国作为 gl）；需要回答「什么时候、靠什么起来的」时再 load_guide attribution 并调 site_history。最后总结：它的流量结构、打法、我能学的 3 点、我能切入的空档。

## 怎么调用

- 接了 gefei MCP：直接调 `mcp__gefei__<工具名>`（上面写的 keyword_ideas、load_guide 等就是工具名）。
- 没接 MCP：用 /gefei 技能自带的命令行 `node ~/.claude/skills/gefei/scripts/webcafe.mjs <工具名> ...`（令牌在环境变量 WEBCAFE_TOKEN）。
- 数字只来自工具结果，查不到就说查不到；每次调用都扣用户的积分余额，结束时告诉用户这次一共花了多少积分。
