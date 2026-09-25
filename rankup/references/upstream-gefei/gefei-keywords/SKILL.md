---
name: gefei-keywords
description: 哥飞 SEO 工作流「选词：这个方向有没有能做的词」：从种子词出发：拓词 → 海选 → 哥飞版 KD 精评 → 核实搜索量，给出推荐词表。手动调用：/gefei-keywords <英文种子词，如 ai headshot>
argument-hint: <英文种子词，如 ai headshot>
disable-model-invocation: true
---

# 选词：这个方向有没有能做的词

用户给的参数：$ARGUMENTS

参数依次是：英文种子词或方向，如 ai headshot；国家，默认 us（可空）。必填的没给就先问用户，别猜。可空的给了就一并用上，没给就跳过要用它的步骤。

## 工作流

按哥飞的选词方法，帮我看「〈英文种子词或方向，如 ai headshot〉」这个方向（〈国家，默认 us〉）有没有新站能做的词。
步骤：load_guide 取 keyword；keyword_ideas 拓 50 个词；bulk_keyword_difficulty 海选；挑 3~6 个有搜索量、预筛难度低的用 keyword_difficulty 精评；要推荐的词用 keyword_volume 一次核实搜索量与 12 个月趋势。最后给表：词、月搜索量、哥飞版 KD、判断原因、推荐与否。

## 怎么调用

- 接了 gefei MCP：直接调 `mcp__gefei__<工具名>`（上面写的 keyword_ideas、load_guide 等就是工具名）。
- 没接 MCP：用 /gefei 技能自带的命令行 `node ~/.claude/skills/gefei/scripts/webcafe.mjs <工具名> ...`（令牌在环境变量 WEBCAFE_TOKEN）。
- 数字只来自工具结果，查不到就说查不到；每次调用都扣用户的积分余额，结束时告诉用户这次一共花了多少积分。
