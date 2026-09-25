---
name: gefei-page
description: 哥飞 SEO 工作流「优化一个页面」：页面体检 + 页面军师 + 排名盘面，给出 P0/P1/P2 改进清单。手动调用：/gefei-page <页面 URL> [目标关键词]
argument-hint: <页面 URL> [目标关键词]
disable-model-invocation: true
---

# 优化一个页面

用户给的参数：$ARGUMENTS

参数依次是：页面 URL；目标关键词（可空，空着就自动推断）（可空）。必填的没给就先问用户，别猜。可空的给了就一并用上，没给就跳过要用它的步骤。

## 工作流

帮我优化这个页面：〈页面 URL〉，目标词「〈目标关键词（可空，空着就自动推断）〉」。
步骤：onpage_audit（url + keyword）做 40+ 项体检；page_coach 推断页面关键词、核查排位并给 P0/P1/P2 建议；对主关键词再看 serp_review 了解前十凭什么排在那里。最后合并成一份按优先级排好的改进清单。

## 怎么调用

- 接了 gefei MCP：直接调 `mcp__gefei__<工具名>`（上面写的 keyword_ideas、load_guide 等就是工具名）。
- 没接 MCP：用 /gefei 技能自带的命令行 `node ~/.claude/skills/gefei/scripts/webcafe.mjs <工具名> ...`（令牌在环境变量 WEBCAFE_TOKEN）。
- 数字只来自工具结果，查不到就说查不到；每次调用都扣用户的积分余额，结束时告诉用户这次一共花了多少积分。
