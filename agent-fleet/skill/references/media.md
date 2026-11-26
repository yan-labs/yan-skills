# 托管模型与多模态

运行 `fleet media list` 读当前可用 tool、模型 id 和必填字段。能力和账户限制以实时清单为准。文字模型目录用 `fleet media models --source openrouter --search vision`。

生成与编辑用 `fleet media run` 指定 tool，从清单取 `--model`，用 `--prompt` 写要求，其他字段用 `--input-json`。命令行模型和提示词覆盖 JSON 中同名字段。编辑时从生成回执取 `artifact_id` 填入有此字段的编辑工具。视频、音频和 3D 的工具及字段也以实时清单为准。

`--out` 指定下载目录，默认 `./fleet-media/`。终端报告状态、费用摘要和路径。无媒体文件时检查落盘的结构化回执。付费前核授权，重复操作前先核原请求状态。

认证变量保留实际名称 `KOLLAB_API_KEY`、`KOLLAB_STANDALONE_API_KEY`、`KOLLAB_API_TOKEN`。测试环境显式设 `KOLLAB_API_URL` 并用独立 profile。凭据通过进程环境或已有登录会话传入。

Google 官方通道：`fleet media run image|video --provider gemini-api --prompt "..." [--input 文件] [--out 文件] [--model 模型]`；未设置 `GEMINI_API_KEY` 时回退 Kollab 对应媒体工具。文件分析用 `fleet analyze --to gemini-api --prompt "问题" --input 文件`，深度调研用 `fleet research --to gemini-api --prompt "问题"`，返回后台任务 ID，可用 `gemini-api agent status <ID>` 查看结果；这两项缺 key 时回退 Kollab 调研通道，由执行者读取本地文件。四种命令加 `--dry-run` 离线预览请求，不消耗额度；真实请求使用 API 计费，须先确认付费授权。
