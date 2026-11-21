# 操作细则：启动、清理、短命令、网页 ChatGPT、安全边界

## 目录
- 启动与接续
- 清理
- 底层命令速查
- 网关模型配置
- 网页版 ChatGPT 通道
- 安全边界

## 启动与接续

`fleet` / `fleet-go` 任务从会话中启动时，一条后台工具调用只放一条命令。Bash 工具可用 `run_in_background: true`，命令本身保持前台运行以接收终态。后台启动命令不要接 `| tail`、`| head`、`grep` 等可能缓冲输出的管道，让过程直接输出。

- 任务默认独立运行：监督进程脱离派发者，launcher 等到终态才退出并给简报，关闭 Claude 不影响任务；launcher 或 `fleet wait` 退出时触发完成通知。脚本需要立即返回用 `--no-wait`，旧的前台行为用 `--attach`。
- `--name <短名>`、`--report <路径>` 未传时从 brief 的归类行和 `REPORT:` 行提取。
- 新会话接手：`fleet status --running --json`，对每个未结束任务各发一条 `fleet wait <id>`（`run_in_background: true`）。`wait` / `tail` 可用短名或唯一 runId 前缀；`latest` 是当前 cwd 最近的任务。
- 杀掉 fleet 外壳不等于杀掉 codex：重派进同一个 worktree 前先 `pgrep -fl 'codex exec.*<worktree>'`，底层进程存活就沿用原任务等待；重派以旧任务和底层进程都已结束为前提。

## 清理

运行 `fleet-go clean --older-than 7d`，先预览可运行 `fleet-go clean --older-than 7d --dry-run --json`。

- 用户只说“清理一下”默认 7 天，普通清理直接执行不先问。删除不进回收站、不备份。
- 删什么：按修改时间删本机和已配置的远端执行机上的运行及报告根目录中的旧日志、报告、截图和巡检产物，以及已合并且无改动的 fleet worktree。
- 一并清除删除产物后腾空的子目录，以及符合条件的旧空子目录。各根目录保留，软链接跳过。
- 保留：运行或排队中的任务、账本、调遣令、配置与状态类文件（YAML/TOML，config/settings/state/checkpoint/cursor 等 JSON）、`.env*`、`.keep-data` 白名单、`patrol-brief.md`。
- 证据和备份（路径含 backup/evidence/snapshot/dump，或 SQL、bak、数据库副本等）只列「待确认」，按目录或任务聚合成本地与远端合计约 50 行以内的清单（路径前缀、文件数、总大小、最新时间、是否被引用）；`--json` 保留每项明细。未发现引用不等于无用。
- 主线程逐项核实后问用户，同意的才加 `--include-backups <路径…>` 删除，仍受时限和上述保留规则约束。普通路径只作用于本机；远端执行机路径逐项写成 `mini:/绝对路径`，本地与远端不自动映射。

## 底层命令速查

新派单用 `fleet-go new --to …`；下面是它调用的底层入口，排障和脚本里才直接用。

| 命令 | 用途 |
|---|---|
| `fleet code brief.md [--sol\|--astra] [--review] [--fast] [--low\|--high] [--cwd dir]` | Codex，默认 Terra；见 [Codex 编程与 review](codex-coding.md) |
| `fleet openai brief.md` | OpenAI API 额度；见 [OpenAI API 入口](openai-bridge.md) |
| `fleet haiku\|sonnet\|opus brief.md` | Claude 官方端点（`ANTHROPIC_CREDIT_API_KEY`；用户级 key 另需 `ANTHROPIC_WORKSPACE_ID`，见 `.env.example`） |
| `fleet copy brief.md` / `fleet bulk brief.md` | Gemini 文案、翻译 / 批量处理，默认 xhigh，可 `--low`/`--high` |
| `fleet grok brief.md` | 托管网关 Grok，单轮调研 |
| `fleet grok-cli brief.md [--review] [--model id]` | xAI 官方编码 Agent；见 [Grok CLI](grok-cli.md) |
| `fleet gpt brief.md` | 托管 GPT 任务 |
| `fleet judge state.txt questions.json` | JEV 结构化判断；见 [JEV 用法](judge.md) |
| `fleet web start\|say\|close\|list` | 网页版 ChatGPT |
| `fleet media list\|run\|models` | 托管网关多模态；见[多模态用法](media.md) |
| `fleet run --model name --prompt "任务"` / `fleet run-many --config batch.json` | 指定模型的完整入口 / 批量 |
| `fleet status` / `fleet tail [--follow]` / `fleet wait <id>` | 看任务、日志、等终态 |
| `fleet say <任务> "消息"` / `fleet stop <任务>` / `fleet resume <任务>` | 插话、收尾、续跑 |
| `fleet list-models` / `fleet help` | 看配置或用法 |

`brief` 是现存文件路径就读内容，否则当任务文本。短命令默认当前目录、跑到结束、安静写日志；`--verbose` 输出进度；`--cwd`、`--max-turns`、`--system-prompt` 可显式指定。默认不限轮数。

## 网关模型配置

- `models.config.json` 的可选字段 `maxOutputTokens`（正整数）限制该模型单次请求的最大输出 token，fleet 传为 `CLAUDE_CODE_MAX_OUTPUT_TOKENS`。
- 模型名先用 `fleet list-models` 核实；配置读取用 `safe-grep` 或经 `redact`，只看名字、计数和存在状态。

## 网页版 ChatGPT 通道

适合少量串行的调研、综述与对比，每轮约 30–110 秒。要读本地文件、跑命令、写代码或批量任务，用 CLI 通道。

运行 `fleet web start "概述公开资料的主要观点" --name research-summary` 建会话，用 `fleet web list` 查会话名。按返回的会话名用 `fleet web say` 追问，再用 `fleet web close` 关闭。

- 可持续追问，追问间至少隔 8 秒；用完 `close`。一次性问答加 `--close`，失败或中断也会关闭，页面文字保留在输出里。
- 常驻临时聊天占一个窗口池位（池容量 10），打开时用 `--keep-alive`，保持到显式 `fleet web close`；一次性问答默认 10 分钟空闲回收。页面丢失须重新 start，临时聊天找不回。`AI_PROBE_WEB_WINDOW` 可覆盖窗口选择。
- 走订阅额度，API 费用为零；高频可能触发验证或限流。限流、验证码或登录失效时保存 pageText 和 pageUrl、关闭该会话并报告缺口，继续其余工作。
- 记忆：须用户确认账号已关闭记忆。脚本发送前读取临时页的「不使用记忆」声明和页首模式；是「个性化」会自动切到「不个性化」并回读确认。确认不了就不发送，保存 pageText/pageUrl 并报告缺口。自动切换路径未做过真实切换实测。
- 发给 OpenAI 的内容限定为公开资料；答案当线索，域名与数字要核对来源。
- `start` / `say` 支持 `--json`、`--out file`。窗口机制见 opencli Skill。

## 安全边界

- 执行者没有工具调用沙箱：网关路径用 Claude Agent SDK 的 `bypassPermissions`，`fleet code`（含 `--review`）用 `danger-full-access`，Grok 用 `--always-approve`。执行者可读写任意路径、可联网。只读复核靠 brief 约定。
- 所以只对可信目录派单：先核验 `--cwd` 指向的目录及项目配置的信任边界；共享工作树里保留他人的修改、分支和 worktree，只精确编辑本单文件。
- SDK 忽略受信项目配置里的 permissions、sandbox 和工具名单；Gemini 不按任务关键词拒绝；JEV 无命令工具。详见 agent-fleet 仓库 `README.md` 的「安全边界」。
- 秘密不进对话、日志、报告和提交：读配置用 `safe-grep '模式' 路径` 或 `命令 2>&1 | redact`（适用的任务可注入 `pitfall-secrets`）。
