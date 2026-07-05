# yan-skills

[Yan](https://github.com/yan-labs) 的 agent skills 合集 —— 自用打磨、实测可跑的 Claude Code / Codex / Cursor 通用技能包。

A curated collection of agent skills by [Yan](https://github.com/yan-labs), battle-tested in daily use. Compatible with Claude Code, Codex CLI, Cursor, and any SKILL.md-compatible platform.

## 安装 / Install

```bash
# 安装单个 skill（推荐按需安装）
npx skills add yan-labs/yan-skills@gt -g

# 或浏览全部
npx skills find yan-labs
```

## Skills

| Skill | 说明 | 外部依赖 |
|---|---|---|
| [`gt`](gt/) | Google Trends 查询 + SEO 选词工作流：热度对比、地区分布、飙升词，内置小语种市场探测和"模糊词→可做站关键词"完整打法 | python3；`hot` 子命令需 [opencli](https://github.com/jackwener/opencli)（可选） |
| [`aihot`](aihot/) | 中文 AI 资讯日报查询，一句话拿到当天 AI 圈动态（[aihot.virxact.com](https://aihot.virxact.com) 公开 API，零配置） | 无 |
| [`autopilot`](autopilot/) | 一句模糊指令 → 自动调查、拆解、无人值守执行到底，含自动测试和 review | 无 |
| [`agent-mode`](agent-mode/) | 把任务翻译成英文 brief 派发给 sub-agent 全程执行，省 token 且更准 | 无 |
| [`codex`](codex/) | 把 Codex CLI 作为后台 sub-agent 跑，不阻塞主对话 | [Codex CLI](https://github.com/openai/codex) |
| [`oracle`](oracle/) | 把 prompt + 文件打包发给 ChatGPT 要第二意见（浏览器自动化，无需 API key） | oracle CLI + Chrome |
| [`git-stats`](git-stats/) | Git 仓库贡献统计，自动合并同一人的多个 git 身份 | git |
| [`skill-link-check`](skill-link-check/) | 审计 `.agents/skills` ↔ `.claude/skills` 软链约定，排查 skill 不生效问题 | 无 |
| [`game-design-master`](game-design-master/) | 游戏设计从业者认知操作系统：MDA、心流、经济系统、关卡、平衡、F2P 伦理 | 无 |

## 亮点：gt 的选词工作流

`gt` 不只是查询工具，内置三套完整打法：

- **W1 小语种市场探测**：全球扫描 over-index 国家 → 趋势健康度 → 本地语 vs 英语内容决策 → 挖当地真实搜法
- **W2 模糊词 → SEO 词**：多角度扩词（痛点/对比/场景/问句）→ Google Trends 验证收敛 → 输出可执行决策表
- **W3 新兴趋势捕捉**：rising 词雷达 + 新词 vs 类目老词对比

## License

MIT © Yan
