# fleet-go 派单参考

`fleet-go new` 把任务正文拼成完整 brief（归类行、REPORT 行、授权块、已知坑、验收、报告模板、规则句）并派出。SKILL.md 给了最常用的写法，这里是完整参数和语义。

## 目录
- 执行者与档位
- 授权与动作
- 入口与正文
- 预览与检查
- 重派与改方向（relaunch / amend）
- worktree 与并发写入
- 续做闸门
- 名额池与排队
- 执行位置（Mac Mini 默认）
- 进度、报告与账本
- 标准块
- 排障

## 执行者与档位

- `--to gpt|openai|claude|grok|gemini|jev` 必填。
- GPT：默认 Terra；`--sol` 选 Sol，`--luna` 选 Luna，`--astra` 选 Astra，`--simple` 是 Terra 的兼容别名，四者互斥。`--sol` / `--luna` / `--astra` 只能配 `--to gpt`；原单是 `--to openai` 时换档用 `relaunch <名> --to gpt --sol`。
- 推理档位：Terra/Sol 默认 medium，Luna 与 Gemini 默认 xhigh。`--low`、`--high`、`--xhigh`、`--max` 互斥；GPT 下 `--xhigh` 和 `--max` 只用于 Luna；Gemini 可用 `--low`/`--high`/`--xhigh`。
- `--review`（只读复核）用于 gpt 和 grok，默认 Terra，可加 `--sol`，不能与 `--luna` 同用。
- Codex 默认不开 fast，需要才 `--fast`。
- Claude：`--tier haiku|sonnet|opus`（默认 sonnet）。Grok：`--model`、`--subagents`。Gemini：`--bulk` 走批量通道。
- `--make image` 叠加图片产物样板（输出目录、逐张编号、尺寸、统一风格、逐文件回报），沿用所选执行者：GPT 用 Codex `image_gen`，Grok 用内置 `image_gen` / `image_edit`。`--make video` 仅 Grok（`image_to_video` / `reference_to_video`）。这些内置工具没有 model 参数，只传工具支持的输入。交付必须是实际生成的文件，占位图、纯色块、下载图按缺产物报告。

## 授权与动作

`--auth` 逗号组合，决定 brief 里的「允许范围」块：

| 授权 | 允许 |
|---|---|
| `local`（默认） | 本地文件修改、构建、预览；正文给了访问方式的远程设备上的命令与文件修改。不含 git 写操作 |
| `local-commit` | 同上，另可在本地分支提交；与 `local` 同传时取代它。单独使用不推送 |
| `deploy-prod` | 正文指定的服务与环境上的发布全流程。与 `local-commit` 同传时，推送、合入环境分支、流水线发布都已授权，执行者不得因“不含推送”停下 |
| `readonly-web` | 只读联网，取公开内容或已授权账户数据 |
| `paid` | 当前目标必要的付费验证；不含充值、订阅、改套餐 |
| `review` | 只读复核：项目文件保持原样，可联网、跑测试，只在自己的 `mktemp -d` 里建删文件 |

正文写固定的动作行，`--action '改代码 / 本地提交'` 可自动写入：

```text
动作: 只读 / 改代码 / 本地提交 / 推送 / 部署 / 付费     # 只列实际动作，可多选
```

动作决定所需授权：改代码需 `local` 或 `local-commit`；本地提交需 `local-commit`；推送、部署需 `local-commit` 加 `deploy-prod`；付费需 `paid`。缺动作行目前只警告，动作与授权不符会被拦。

- 只做推送、部署的发布推进单不要求产生实现提交；只有授权含 `local-commit` 或 `deploy-prod` 且正文明确要求提交时，报告缺提交哈希才算缺项。
- `--budget` 只在用户给了预算与重试限制时传；没给就不写，不设默认值。
- review 的只读是 brief 约定，不靠沙箱：Codex 用 `danger-full-access`，SDK 用 `bypassPermissions`，Grok 用 `--always-approve`；JEV 只有结构化 API，没有命令执行器。

## 入口与正文

正文写 `## 入口`：

```text
## 入口
仓库: /绝对路径
可写路径: /绝对路径        # 只读和复核单不写这一行
```

- 只读或复核单只写「仓库:」，也不要把共享报告目录写成可写路径，否则会和同期任务抢写入位。
- 入口含「未知」「自己找」时，Terra 单会被拒并指出命中的片段：写明入口，或改用 `--sol`。
- brief 引用的文件写绝对路径；预检只检查绝对文件路径。引用的 `/tmp/<名>` 等路径要在 Mini 上已存在，先 `mm 'mkdir -p …'`。
- PR 合并方式写「按仓库允许的方式」，仓库可能禁止 merge commit。
- 远程访问方式和凭据文件位置按任务需要写明。
- `--body body.md` 只接受现存文件；`--body -` 读 stdin；省略 `--body` 可用 heredoc。
- `--deliverables "产物：路径（上限 N KB 或行）"` 可多次传，逐项写进验收段。
- `--pitfalls a,b` 覆盖默认带的已知坑块；`--level L1-L4`、`--type`、`--for <被复核任务名>` 记入[账本](ledger.md)。

`--write` 和入口的 `可写路径:` 支持逗号、中文逗号、顿号、分号、换行或空白分隔的绝对路径（含 `~/`、`$HOME/`）。含空格的单个路径用 shell 引号包住。 可写范围填具体仓库 worktree 或子目录，多个子仓聚合根（如 nextspace 根）会被拦截。

## 项目场景

`fleet-go scenes [--project <根>]` 列场景。 `new --scene <名>[,<名>]` 显式选择；省略时在 goal 与正文（除入口块）中查找不区分大小写的完整关键词短语。唯一命中会提示，多项命中须指定场景或 `--scene none`。项目从正文仓库或当前目录向上找最近的 `.rankup`，也可用 `new --project <根>` 指定。

每个 `.rankup/dispatch-scenes/<名>.md` 以两行 `---` 包住 JSON 文件头，键为 `description`、`keywords`（数组）、`auth`（逗号分隔）、`action`、`tier`、`writes`（数组）、`acceptance`（数组）。正文放入口、步骤、坑与小节指针。场景紧随思维准则，取代通用派单手册链接；预览直接显示场景。显式授权、动作与档位优先，多场景默认值冲突需显式指定。路径模板供填入入口和 `--write`，实际权限仍以 brief 授权为准。重派沿用已拼好的场景。

nextspace 的动作含「改代码」时，正文必须有 `## 验收环境`，逐行填写账号、免费空间、付费空间、开关、夹具、性能闸门，性能阈值引用计划原文。纯配置等不适用项逐行写明理由。脱离项目根的 worktree 用 `--project` 指定项目。

## 预览与检查

- `fleet-go new … --dry-run`：只打印 brief，将执行的命令写到 stderr。
- `--no-launch`：只写 brief 文件，不派发。
- `fleet-go lint brief.md`：检查样板（归类行、REPORT 行、规则句、允许范围小节、密钥字面量）。
- `--no-lint` 只豁免样板检查；入口、动作和授权仍须匹配，重派沿用该设置。
- `fleet-go batch manifest.json`：JSON 数组，每项是一组 `new` 的参数；先打印可写路径重叠矩阵。

## 重派与改方向（relaunch / amend）

- `fleet-go relaunch <名> [--to <产品>] [--tier …] [--sol|--simple|--luna|--astra] [--low|--high|--xhigh|--max] [--fast]`：沿用同名 brief、name 和 report 重派（也沿用原档位：从 Luna 换 Terra 要显式加 `--simple`，只写 `--to gpt` 仍是 Luna）；仍有未结束的同名任务时拒绝。跨日期重名时把名字换成报错给出的 brief 路径。`--after <任务>` 排在指定任务结束后运行。
- 同名 brief 已存在时用 `relaunch` 或 `amend --say`，不要重新 `new`。
- 改需求：改 `--body` 文件再 `relaunch`，新正文自动换进 brief，修订块保留。注意 `relaunch` 总是用 brief.json 记录的 `--body` 文件替换正文，那可能是别的会话 scratchpad 里的旧文件，手改的入口会被盖回；若已手改正文或 worktree 路径导致快照对不上，想用新正文就换名重派；要保留当前 brief，就先确认已拼装内容，再用 `fleet-go relaunch <名> --keep-brief` 重派。
- `fleet-go amend <名> "补充要求"`：给 brief 顶部追加「修订 N」；修订正文的路径不会成为 Mini 必需路径，重派前置校验失败时恢复原 brief 和元数据。
  - `--say`：尽量送进运行中的任务（各执行者的生效方式见 SKILL.md「中途插话」）；任务已结束（常见于部分完成交回）时直接按修订后的 brief 重派，整条命令放 `run_in_background`。
  - `--restart`：最后兜底。只停所选 run，核验无残留进程后再 `relaunch`（最多等 60 秒）；确认不了已停就保留修订并报错。
  - `--auth`、`--action` 替换保存的授权与动作；档位参数替换保存的档位，在重启或下次重派时生效，运行中插话不会切换当前模型。切到 Terra 且未指定推理档位时，会清掉 Luna 专用的 xhigh/max。
- 可写路径被别的会话的单占用时，光 `relaunch --worktree` 不够：先把 brief.md 和 brief.json 的 `writes` 都改成自己的 worktree 路径再重派；也可按提示用 `relaunch --after` 排队。

## worktree 与并发写入

- 同一仓库多个写入任务各加 `--worktree`；同一个 worktree 只有一个写入者。
- worktree 建在入口「仓库:」上（没有才按 `--write` 推断，与 cwd 无关）；子模块只初始化可写路径所在的那个。`new` 和 `relaunch --worktree` 按 `FLEET_MINI_HOME` 映射到 Mini 上对应仓库。
- 合回基础分支并推送后收尾：`fleet-go worktree prune <任务名>` 删 worktree 和本地功能分支；没合回的保留，报告写明释放条件。合并到环境分支仍在主克隆做。
- 派单机（MacBook）上任何会话都不建 worktree；代码 worktree 只由 fleet 在 Mini 创建。

- 已收尾删除的 worktree，直接跑重派提示中的 `fleet-go worktree recreate <名>`，再重发修订。工具从已登记仓库和基线以新序号分支重建原目录；手工 worktree 按提示加 `--base <原环境分支>`，已有目录会保留。

## 续做闸门

Codex 单交回时，fleet 会检查报告必需节、brief 明确要求的文件、已授权的提交哈希和读回结果；缺了就把未完成的验收项原文送回让它继续。

- Terra 的闸门也覆盖只读复核和文档任务；Sol 和 Luna 保持原有续做策略；其他产品不适用。
- 有进展就继续，不设次数上限；连续两次无进展（没有新提交或产物变化，只改报告不算）才停，verdict 为 `partial`。
- `--no-continue` 或 `FLEET_NO_CONTINUE=1` 关闭。

## 名额池与排队

- 轻量池（Luna、Gemini、Haiku、JEV）和编码池（其他模型）分别排队，只读任务不占名额。代码默认值是 10 和 4，由两机 agent-fleet `.env` 的 `FLEET_LIGHT_CAPACITY`、`FLEET_CODE_CAPACITY` 覆盖；`FLEET_SLOT_CAPACITY` 则改成全局总名额。当前上限以全局 `~/.claude/CLAUDE.md` §3 为准。
- gpt 单一直 queued 且没写原因：多半是 Codex 用量闸门（`~/.agent-fleet/runs/codex-quota.json` 的 usedPercent 超过 `FLEET_CODEX_QUOTA_LIMIT`，默认 90）。用户确认额度够用时，把 `FLEET_CODEX_QUOTA_LIMIT` 写进两机 `.env`。闸门在排队进程启动时读入：已在排队的单要 stop 后 relaunch 才生效，旧的排队进程还会挡住同池后面的单。

## 执行位置（Mac Mini 默认）

- `new` 和 `relaunch` 默认在 Mini 执行。路径缺失、同步失败、通道不可用或工具缺失时直接报错，在 Mini 补齐（建 worktree、同步目录）后重派，不自动回退本机。
- 只有显式 `--on local --local-reason "理由"` 才在本机执行，理由记入 brief 偏差和账本。
- 首次使用前在派单机设置 `FLEET_MINI_HOME`（Mini 家目录）和 `FLEET_MINI_BIN`（Mini 上 fleet 的绝对路径），可选 `FLEET_LOCAL_HOME`、`FLEET_MINI_MM`；也可写在 `~/.agent-fleet/mini.json`（`remote_home`、`bin`、`local_home`、`mm`），环境变量优先。工作目录在 Mini 不存在时改用入口仓库，仓库也不存在则用 Mini 家目录并说明。
- brief 引用的报告输入和正文会自动同步到 Mini。Mini 上的报告用 `fleet-go read <名> [--report|--result|--log] [--head N]` 查看，`--pull` 拉回本机。
- MacBook 上可用 `fleet wait <完整 runId>` 等 Mini 的单完成。
- Mini 的全局 Skill 可能比 MacBook 旧：派依赖 Skill 脚本的单之前核对版本，必要时在 Mini 用 `npx skills add` 同步。
- Agent 工具的子代理也能在 Mini 干活：子代理在 MacBook 启动，brief 写明命令用 `~/.claude/skills/macmini/scripts/mm '<命令>'`（不在 PATH，写全路径）。

## 进度、报告与账本

- `fleet-go status`：默认列非终态和最近 1 小时的任务，`--all` 看全部本地历史；脱离启动的任务带 ⚠。Mini 的单一次 ssh 批量取，取不到时 stderr 提示「Mini 状态未取到」，此时只列了本机。机器读取用 `fleet status --running --json`。
- 完整结果在 `~/.agent-fleet/runs/*.result.md`，过程在同名 `.log`；stdout 只给简报。
- 每个 run 结束自动记一行[账本](ledger.md)；`fleet-go score [--since 日期]` 按执行者出计数。

## 标准块

授权、已知坑、验收、报告模板、规则句等样板在 `templates/blocks/`，由 `fleet-go new` 拼装；调整样板只改这里。规则句由 `rule-sentence.md` 生成，校验时兼容全局 `~/.claude/CLAUDE.md` §4.1a 的完整旧句。

## 排障

| 现象 | 处理 |
|---|---|
| 启动命令被 hook 拦下 | 命令里带了 `&`、`nohup`、`setsid` 或 `disown`；去掉，改用工具参数 `run_in_background: true` |
| Codex 偶发 `workspace routing discovery failed`，巡检单秒失败 | 主线程自己看 `fleet-go status` 和进度文件修改时间，不反复重派 |
| 杀了 fleet 外壳但 codex 还在跑 | 重派进同一 worktree 前先 `pgrep -fl 'codex exec.*<worktree>'`；底层进程存活就 `fleet wait <runId>` 接着等 |
| run 结束或交班时，它启动的子进程被一起停掉 | 要跨 run 存活的长进程从一开始就脱钩启动，PID 和续传方法写进 checkpoint |
| `fleet wait` 遇到 ask | 只提示并继续等终态；阶段计划和交接不发审批 ask。Codex 子线程完成不等于主任务完成 |
