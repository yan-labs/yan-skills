# yan-skills

[Yan](https://github.com/yan-labs) 的 agent skills —— 自用打磨、实测可跑，适用于 Claude Code / Codex / Cursor 及任何兼容 SKILL.md 的平台。

Agent skills by [Yan](https://github.com/yan-labs), battle-tested in daily use. Works with Claude Code, Codex CLI, Cursor, and any SKILL.md-compatible platform.

## 安装 / Install

```bash
npx skills add yan-labs/yan-skills@gt -g
npx skills add yan-labs/yan-skills@autopilot -g
```

## Skills

### [`gt`](gt/) — Google Trends 查询 + SEO 选词工作流

四个基础查询：关键词热度对比曲线、地区热度分布、相关飙升查询、每日热搜榜。脚本自带 venv 自举，处理好了 pytrends 的 urllib3 兼容坑和限流提示。

真正的价值在三套内置工作流：

- **W1 小语种市场探测**：全球扫描 over-index 国家 → 趋势健康度筛选 → 本地语 vs 英语内容决策 → 挖当地真实搜法
- **W2 模糊词 → 可做站的 SEO 词**：多角度扩词（痛点/对比/场景/问句）→ Google Trends 验证收敛 → 输出可执行决策表
- **W3 新兴趋势捕捉**：rising 词雷达 + 新词 vs 类目老词对比，区分起飞和昙花一现

依赖：python3（`hot` 子命令额外需要 [opencli](https://github.com/jackwener/opencli)，可选）。

### [`autopilot`](autopilot/) — 一句话到无人值守执行完毕

接收一句模糊指令，自动调查、分类、拆解为阶段计划、选 skill、定完成判定，然后无人值守执行到底 —— 包括自动部署、自动 E2E 测试、自动代码 review，不跳过任何阶段。

依赖：无。

## License

MIT © Yan
