# Grok Build CLI

产品派单主推 `fleet-go new <name> --to grok`；下列 `fleet grok-cli` 为底层入口。

`fleet grok-cli` 调用 xAI 官方 `@xai-official/grok` 完整编码 Agent（自己的工具）；`fleet grok` 是 Kollab 网关 `grok-4.7` 单轮 Agent，两者独立。

## 启动与模型

```sh
grok login --oauth
grok models
fleet grok-cli brief.md --cwd /path/to/project --name task --report /tmp/task.md
fleet grok-cli brief.md --review --cwd /path/to/project
fleet grok-cli brief.md --model <grok-models列出的ID> --subagents
fleet-go new task --to grok --auth local --goal "编码任务" --body brief.md --dry-run
fleet status
fleet wait task
fleet tail task --follow
fleet stop task
```

brief 是现存文件路径或任务文本；`--name`、`--report` 是任务元数据，未传可从归类与 REPORT 行提取。报告正文由 brief 要求执行者写，fleet 另写 `.result.md` 和 `.log`。`fleet team` 给 Grok 联网检查 20 秒。默认先用 `grok models` 核验登录并获取默认值；`--model` 可覆盖，不在配置里写死。启动环境原样透传父进程 HTTPS_PROXY/HTTP_PROXY/ALL_PROXY 及小写变量，并设置 `GROK_DISABLE_AUTOUPDATER=1`，不修改代理。Rust Grok 不认 NODE_USE_ENV_PROXY；终端必须设置实际代理变量，Clash 常用示例为 `HTTPS_PROXY=http://127.0.0.1:7890`。

支持 `--max-turns N`、`--reasoning-effort <CLI支持的级别>`、`--expect-changes`、`--json`、`--full`、`--brief-lines N`。默认独立监督并等待；`--no-wait` 立即返回，`--attach` 前台，`--detach` 兼容默认。status/wait/tail/stop 共用 fleet 通道；`fleet say <任务> "新指令"`、`fleet-go amend <任务> "新指令" --say` 会停止当前 Grok 进程并以 `-r <sessionId>` 在同一会话继续；`fleet resume <任务>` 同样续会话，沿用 name/report 和 review 参数。sessionId 尚未出现时 say 明确报不支持且不停止任务。`--expect-changes` 在零文件改动时判 suspect；空结果、裸工具控制 token、认证/额度错误判 fail，退出码 0 不代表 verdict ok。

`--model <id>` 的可选值以 `grok models` 为准；当前为 `grok-4.7`（默认）、`grok-4.7-build-fast`、`grok-4.6`、`grok-4.5`。例如 `fleet grok-cli brief.md --model grok-4.7-build-fast`，fleet 向 CLI 传 `--model <id>`。

## 内置图片与视频工具

Grok CLI 内置 `image_gen`、`image_edit`、`image_to_video`（6 或 10 秒，480p/720p）、`reference_to_video`（1–15 秒，参考图/音色/首尾帧）。这些工具走当前 OAuth 账号，没有 model 参数，不能指定生图或视频模型。产品入口可用 `fleet-go new <name> --to grok --make image|video` 叠加产物样板；在 brief 里写明输入素材、时长/分辨率及落盘路径，例如「用 image_to_video 将 /tmp/input.png 生成 6 秒 720p 视频，保存到 /tmp/output.mp4」。`--make` 只叠加样板，不替换执行通道；使用仍须已有费用授权。ZDR/privacy 类错误如实报告原因与处理方法，不能以占位文件交差。

## 输出、权限与续跑

runner 逐行解析 `streaming-json`，text 拼接为原格式 `.result.md`；end 的 stopReason/sessionId/num_turns/total_cost_usd/usage/modelUsage 存进 run 的 `.grok.json`、`.pid.json` 和独立任务状态。简报 cost/turns 来自 Grok 自报，费用不等同于订阅实际账单；插话后显示最近 end 的统计，打断前未发 end 的段无法计入完整费用/轮数。只有 `end_turn` 能正常通过；`cancelled`/`max_turns` 等一律 fail，退出码 0 不能代替结束判定。无明确最终结论判 suspect。

写任务与 review 都传 `--always-approve`，避免无头工具批准被自动取消导致 `stopReason=cancelled`。**本机实测沙箱不生效**，runner 不传 `--sandbox`；review 只读靠提示与事后文件快照检查，发现监控目录文件新增、删除或内容改变判 suspect 并列出路径。它不保证事前阻止写入，也不自动撤销改动。默认禁止子代理，显式 `--subagents` 才放开。

## 登录与常见坑

- OAuth：`grok login --oauth`，使用已有 SuperGrok/X Premium+ 订阅登录。`grok models` 出现 `You are not authenticated` 表示未登录；fleet 在执行任务前明确报错，不等待批准；失败只上报事实，由派用者判断是否重派。
- 备用为环境变量 `XAI_API_KEY`，走按量计费；只在已授权按量费用时使用，绝不把 key 写进 brief、模型配置或日志。`GROK_HOME` 可指定 CLI 状态目录；不读取或打印 auth.json。
- 失败只记录执行者/档位、脱敏原始错误、已完成步骤、产物与 dirty 状态，不分类、不建议、不换执行者。派用者顺位参考见 [失败上报](../SKILL.md#失败上报与派用者顺位参考)，由派用者自行判断并用 `fleet-go relaunch <name> --to <产品>` 重派；Gemini 仅文本。`grok usage` 可查看 CLI 会话 token 与费用。
- npm `latest` dist-tag 可能过期，安装时应指定 `@xai-official/grok@1.0.49` 或更新的明确版本；本接入不执行安装或升级。
- npm 拦截 postinstall 的警告本身不证明 CLI 不可用；先核验 `grok --version`、`grok --help`、`grok models`，再以真实任务为准。如果可启动且任务跑通，警告不影响已验证路径；若报缺少运行组件，再按官方安装指引处理，不能仅凭警告强制执行脚本。
- 无头原生调用为 `grok -p "提示" --cwd <目录> --output-format streaming-json --always-approve`；也支持 `--prompt-file`。`grok -r <sessionId> -p "新指令"` 恢复对话，不传 `--restore-code`，不恢复文件。
- 本地文件变化核验排除 `.git`、`node_modules`、`.grok`；这些目录的内部变化不计为任务文件修改。
