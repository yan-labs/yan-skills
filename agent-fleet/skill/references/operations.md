# 派单操作细则

## 启动方式（硬性，派单人自检）

见顶部「派单前必读」。

`fleet` 任务一律这样启动：**一条 Bash 调用，只放 `fleet ...` 这一条命令，用工具参数 `run_in_background: true`、`timeout: 7200000`**，输出用 `> 文件 2>&1` 重定向。命令保持前台单一调用，后台管理交给工具参数；`&`、`nohup`、`setsid`、`disown` 属于允许启动方式之外。

```text
Bash(command="fleet code brief.md --cwd <目录> > /tmp/<名>.out 2>&1", run_in_background=true, timeout=7200000)
```

默认独立运行（code/grok-cli/copy/grok/bulk/gpt/haiku/sonnet/opus/fable/run/run-many）：监督进程脱离派发者，launcher 等到终态才退出并给简报，关闭 Claude 不影响任务。`--detach` 兼容默认；脚本需立即返回用 `--no-wait`，旧前台行为用 `--attach`。可用 `--name <短名>`、`--report <路径>`；未传时从 brief 的“归类…”和 `REPORT:` 行提取。

**新会话先 `fleet status --running`（机器读取用 `--json`），有未结束任务就对每个 `fleet wait <id>` 发一条 Bash，`run_in_background:true`、`timeout:7200000` 接着等，沿用原任务。** `wait` / `tail` 可用短名或唯一 runId 前缀，终态 wait 立即返回；`latest` 是当前 cwd 最近任务。默认 status 跨目录列出非终态与最近24小时终态。

launcher 或 wait 退出时触发真实完成通知。

- 一个任务一次 Bash 调用；多个独立任务同一条消息里并行发多个 Bash 调用，每条命令各自保持前台。
- 核对：`fleet status --running --json` 能看到任务，且默认启动的 Bash 状态仍是 running。
- 杀 fleet 外壳不等于杀掉 codex。接手时先 `fleet status --running --json`，用 `fleet wait <runId>` 接上；重派进同一个 worktree 前先 `pgrep -fl 'codex exec.*<worktree>'` 核验底层进程。存活时沿用原任务等待，重派以旧任务和底层进程均已结束为前提；手工 kill 后也先完成同一核验。

## 网页版 ChatGPT 通道

与 Rankup 探针共用网页驱动，适合少量串行调研、综述与对比；每轮约 30–110 秒。本地文件、命令、代码或批量任务使用 CLI 通道。

```bash
fleet web start "问题" --name research-signatures
fleet web say chatgpt-web-research-signatures "追问"
fleet web list
fleet web close chatgpt-web-research-signatures
fleet web "问题" --followup "追问1" --followup "追问2" --out answer.md --json
```

- 可持续追问；用完执行 `close`。兼容问答命令加 `--close` 在结束后关闭；失败、报错或中断也关闭，页面文字保留在输出中。追问间至少隔 8 秒。
- 常驻临时聊天占一个窗口池位（池容量 10），默认 dedicated，副屏优先、自动铺开；`AI_PROBE_WEB_WINDOW` 可覆盖。常驻对话打开时使用 `--keep-alive`，保持至显式 `fleet web close`；一次性问答（无追问且带 `--close`）仍默认 10 分钟空闲回收；旧 CLI 不认识该参数时提示并退回原 env 保活方案；页面丢失须重新 start，临时聊天无法找回。
- 使用订阅额度，API token 费用为零；高频可能触发验证或限流（探针遇过一次，原因未确认）。限流、验证码或登录失效时保存 pageText 和 pageUrl、关闭该会话并报告缺口，继续其余授权内工作。
- 须用户确认账号已关闭记忆；脚本发送前读取临时页「不使用记忆」声明及页首模式；若是「个性化」会自动切到「不个性化」（该选择对后续新临时聊天持续生效）并回读确认，确认「不使用记忆」与页首模式后才发送；确认不了就不发送，保存 pageText/pageUrl 并报告该步骤缺口，继续其余授权内工作。已开路径已验证；自动切换路径未做真实切换实测。
- 发给 OpenAI 的内容限定为公开资料；答案当线索，域名与数字需核对来源。输出 DOM 引用域名，未做 payload 核验。
- `start/say` 支持 `--json`、`--out file`；会话名、回答和引用一起输出。直接调用脚本与 `fleet web` 等价。窗口机制见 [opencli Skill](../../../opencli/SKILL.md)。

## brief 写法

开头说明一个目标、真实交付物、允许读写范围、并行工作边界、所需检查和完成条件。

**派单前核实路径。** 允许读写清单里的路径用 `ls` 或 `test -e` 确认：已有文件确认存在；新文件确认上级目录存在，明确写成「新建，路径为……」。以派单时的实际 `ls` 为准：agent-fleet 的说明在 `agent-fleet/skill/SKILL.md`、可执行脚本在 `bin/`；rankup 与 opencli 的说明在各自根目录的 `SKILL.md`、脚本在 `scripts/`。路径有缺口时先完成可交付部分，将受阻步骤记入报告。改文件加 `--expect-changes`；浏览器统一使用 `opencli browser <会话名>` 驱动已登录 Chrome，复用本机已有软件和会话。最终回复列改动与验证结果。

取证类 brief（打开外站、查 DNS/RDAP、批量读页面）写明重试与降级：打开失败先同 URL 重开或刷新，间隔约 5 秒，最多 5 次；单项仍取不到记「无法验证」并继续后面的项。站点整体不可达、验证码、限流、登录墙时报告站点取证缺口，继续其余授权内工作。

**涉及数据、备份、数据库、云资源的 brief 写明允许范围**：「备份、恢复、DB 工具及所需软件（brew/pip/npm/docker 镜像等）在 AWS 上（跳板机、ECS 任务、容器）执行，本机只保存行数和摘要，沿用已有软件。」此边界源于 Codex 曾在用户 Mac 上自行 `brew install postgresql@17 redis`；验收时检索执行者日志，核验安装命令的执行位置。

**brief 带上当前任务的已知坑**：模型先用 `fleet list-models` 核实；共享工作树保留他人的修改、分支和 worktree，只精确编辑本单文件。


## 安全边界

先核验 `--cwd` 指向的目录及项目配置的信任边界；网关路径使用 Claude Agent SDK 的 `bypassPermissions`，执行者可读写文件和运行命令，没有工具调用沙箱。只对可信目录派单，保护他人改动；配置读取用 `safe-grep` 或经 `redact`，只看名字、计数与存在状态。默认执行者系统提示将任务交给当前执行者负责，额外 `--system-prompt` 会追加其后。`fleet code` 默认 `danger-full-access`（可读写任意路径、可联网，含本机代理），`--review` 也使用 `danger-full-access`，只读靠 brief 约定，允许联网和在自己的 `mktemp -d` 目录写脚本、跑测试。SDK 不设置只读工具名单，并忽略受信项目配置里的 permissions/sandbox/工具名单；Grok 不用文件快照判失败；Gemini 不按任务关键词拒绝，JEV 无命令工具；详见 [README 的安全边界](../../README.md#安全边界)。


## 行动范围

一单围绕一个目标：写明交付物、主要路径、允许范围（生产、线上数据、费用及凭据的授权）和完成标准。范围内必要的相关改动由执行者判断；做法：沿用 brief 指定方向，新增或切换方向由主线程的新 brief 明确后执行，多个方向拆成多个 brief。验收条件写结果并给备用办法（例如「深色测量受限时测浅色」），方法由执行者选择。

`fleet code` 自动在 brief 前加入下段，网关模型追加进默认执行者系统提示（`src/scope.mjs` 的 `SCOPE_LOCK`）；两处文字保持一致。brief 补充当前任务的具体边界：

> 【行动范围】围绕 brief 指定的一个目标完成必要改动（相邻文件、同类键、配置、让验收通过所需的小修）；测试、安全防护、重构按正文要求或目标必需执行。新增或切换方向由主线程的新 brief 明确后执行。无关线索在最终回复用一行列出，留给后续任务。怎么做、怎么测、怎么验证由你决定；办法、测量或环境遇到小障碍（浏览器崩溃、弹窗遮挡、残留同名分支或工作区、验收条件现实受限等），选最保守可行方案继续，把选择和理由记入报告「偏差」。验收优先用 brief 给的备用办法，否则交付最接近的版本并写明差距。生产环境、线上数据、任务外系统、费用及凭据按 brief 授权执行；授权或必需权限、输入有缺口时，先完成授权内可交付部分，将被挡住的步骤、已完成内容和缺口写进报告末尾，结论按原目标标明完成程度。brief 列出多条路径时，优先切换到其中可用路径。

验收时核对 brief 的目标、授权和交付物；发现越界、方向改变或替代品冒充交付时，按 CLAUDE.md §4.3 向用户如实报告。
