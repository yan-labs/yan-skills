# AI HOT — Agent Skill

让 AI Agent 用最自然的中文一句话拿到 [aihot.virxact.com](https://aihot.virxact.com) 每天的 AI HOT 日报和全部 AI 动态，零配置。

> 跨 Claude Code · Codex CLI · Cursor · Gemini CLI · GitHub Copilot · OpenCode · Cline · Windsurf 等任意支持 SKILL.md 格式的 Agent 平台。

## 这是什么

[AI HOT](https://aihot.virxact.com) 是一个面向中文 AI 创业者的资讯站，每天早上 08:00 整理成版块化日报，全天持续抓取并 LLM 评分筛选成精选条目。

这个 Skill 让 Agent 直接调 AI HOT 的公开 REST API，不需要打开浏览器。

## 安装

### 方式 A:让 Agent 自动装(Claude Code / Codex 通用)

在你的 Agent 里直接发这句话:

```
帮我安装这个 skill：https://aihot.virxact.com/aihot-skill/
```

Agent 会 fetch SKILL.md 然后写到对应平台的 skills 目录。

### 方式 B:一行命令手动装(Codex / Gemini CLI / OpenCode 等不会自动装的工具)

```bash
curl -fsSL https://aihot.virxact.com/aihot-skill/install.sh | bash
```

默认装到 `~/.claude/skills/aihot/`。要装到 Codex / Gemini / OpenCode 等其它路径,设环境变量再跑:

```bash
SKILL_DIR=~/.codex/skills/aihot \
  bash <(curl -fsSL https://aihot.virxact.com/aihot-skill/install.sh)
```

(install.sh 不 chmod 不 sudo,只 mkdir + curl 三个文件。看安装脚本本身可 `curl https://aihot.virxact.com/aihot-skill/install.sh` 审查。)

### 方式 C:从仓库拉

本 Skill 同时同步到了卡兹克的 Skills 合集 [KKKKhazix/khazix-skills](https://github.com/KKKKhazix/khazix-skills/tree/main/aihot)(和 hv-analysis / khazix-writer / neat-freak 等其他 Skill 一起)。git clone 拉走对应子目录即可。

## 触发示例

随便问，不需要记关键字：

- 今天 AI 圈有什么新东西？
- 看一下今天的 AI 日报
- 最近 OpenAI 有什么发布？
- 最近一周的 AI 论文
- 看下精选条目
- AI 模型发布列表
- 最近 3 天 AI 行业动态

Skill 会自动调用 [aihot.virxact.com](https://aihot.virxact.com) 的公开 API（无须配置 API Key），整理成中文 markdown 简报回给你。

## 不需要登录、不需要 API Key

AI HOT 的数据 100% 公开免费，匿名可访。Skill 调以下接口：

| 路径 | 用途 |
|---|---|
| `/api/public/daily` | 最新 AI HOT 日报 |
| `/api/public/daily/{YYYY-MM-DD}` | 指定日期日报 |
| `/api/public/dailies` | 日报归档索引 |
| `/api/public/items` | 全部 AI 动态（按精选 / 分类 / 时间筛选） |

进阶用法（RSS 订阅 / REST API 详细参数）见 [aihot.virxact.com/agent](https://aihot.virxact.com/agent)。

## 反馈

Skill 漏触发、漏筛选、想加新查询场景？

- 在 [aihot.virxact.com/feedback](https://aihot.virxact.com/feedback) 留言
- 或者直接在 [Skills 合集仓库](https://github.com/KKKKhazix/khazix-skills/tree/main/aihot) 提 issue

## License

MIT
