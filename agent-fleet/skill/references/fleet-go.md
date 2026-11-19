# fleet-go 派单参考

## 执行者与档位

`new` 要求 `--to gpt|openai|claude|grok|gemini|jev`。GPT 默认 Terra，`--sol` 和 `--astra` 互斥，`--simple` 显式选 Terra。GPT 和 Gemini 可用 `--low`、`--high`，Gemini 默认 xhigh。GPT 默认关闭 fast，按需显式 `--fast`。Claude 用 `--tier haiku|sonnet|opus`，Grok 可用 `--model`，仅获授权且显式标记 `--type orchestrate` 的总管可用 `--subagents`，Gemini 批量用 `--bulk`。只读复核用 `--review`，适用于 GPT 和 Grok。

`--make image` 用 GPT 或 Grok，`--make video` 用 Grok。交付实际生成文件。授权和费用按任务范围执行。

## 授权与动作

| 授权块 | 对应动作 |
|---|---|
| `local`（默认） | 本地修改、构建、预览及正文授权的远端修改 |
| `local-commit` | 上述动作加本地提交 |
| `local-commit,deploy-prod` | 正文明确指定的推送、合入和发布 |
| `readonly-web` | 只读联网 |
| `paid` | 已授权的付费验证 |
| `review` | 只读复核，可联网、跑测试，临时目录及本单 REPORT 可写 |

正文写 `动作: 改代码 / 本地提交` 或用 `--action` 生成动作行。只列实际动作。授权不匹配会被拦截。缺动作行可能产生警告。提交哈希仅在任务明确要求提交时作为验收。用户给预算才用 `--budget`。

## 入口与正文

在 `## 入口` 下填 `仓库:` 和 `可写路径:` 的绝对路径，只读单省略后者。写入范围须落在实际仓库或子目录。默认编码档入口不明时补齐路径，或经路由判断改用 `--sol`。并行写入见下方工作树说明。

`--body` 可以读现存文件或用 `--body -` 读标准输入。省略时也可从标准输入传正文。用 `--read` 和 `--write` 传读写范围；`--deliverables` 可重复指定交付物。账本用 `--level`、`--type` 和 `--for` 记难度、类型和复核目标。

## 上下文与项目场景

`fleet-go context` 输出调遣令、全局索引和项目总则（各前 60 行）、场景清单及优先级。`fleet-go doctor` 给出记忆 lint、过期调遣令、项目凭据文件忽略检查、本地及远端安装检查和旧场景候选。按输出核实，再手工改。三条命令 `context`、`doctor`、`scenes` 均支持 `--project`。

从入口仓库或当前目录向上定位最近包含 `.agent-fleet/` 或 `.rankup/` 的项目根。隔离工作树找不到项目层时，传原项目入口给 `--project`。

- `.agent-fleet/README.md` 是项目总则，会随 brief 注入。规则写 `.agent-fleet/lessons.md`，场景写 `.agent-fleet/scenes/<名>.md`。
- 场景按源码样板、全局场景、兼容旧项目路径 `.rankup/dispatch-scenes/`、项目新路径依次覆盖同名场景。
- 场景文件由两行 `---` 围住 JSON 头，后接 Markdown 正文。字段包括 `description`、`keywords`、`auth`、`action`、`tier`、`writes`、`acceptance`。`keywords`、`writes`、`acceptance` 用数组。验收项按 [Brief 规则](dispatch-discipline.md#brief) 写编号和 owner；编号冲突会调整。
- `new --scene` 接受逗号分隔的场景名，`--scene none` 跳过匹配。省略时按 goal 与正文中的关键词子串查找，唯一匹配自动选用，多项须显式选择。显式授权、动作和档位优先；多场景默认值冲突需显式指定，写入模板由派单方填写。
- 可选的 `.agent-fleet/project.json` 用 `briefGates` 声明必填节，例如 `{"briefGates":[{"when":{"action":"改代码"},"section":"验收环境","fields":["入口","版本"],"hint":"填写已核实的值"}]}`。匹配指定动作时，正文需要对应二级标题以及每个非空的字段行。

## 预览与预检

`--dry-run` 把 brief 写到 stdout，把各样板字符数、它们相对于完整 brief 的占比、将执行的命令和适用的默认回滚提示写到 stderr。用 `--no-launch` 仅生成 brief。`fleet-go lint` 检查样板及凭据泄漏，`--no-lint` 仍保留入口和授权检查。`fleet-go batch` 读取每项为 `new` 参数数组的 JSON 清单，输出路径重叠矩阵。

以下代码块供仓库的示例测试读取。入口使用现存的临时目录，命令只预览。直接可运行的写法见[快速派单](../SKILL.md#快速派单)。

```sh
fleet-go new inspect-docs --to gpt --auth review --goal "核对文档入口" --action 只读 --body - --dry-run <<'BRIEF'
## 入口
仓库: /tmp
## 验收
V1 核对 README 的文档入口｜owner：本单
BRIEF
```

## 重叠与工作树

可写路径重叠有三种修法。缩小到真实互斥的子目录，给同仓写入者各建 `--worktree`，或者用 `--after` 明确串行。REPORT 和 checkpoint 按任务分配，勿将共享报告根当作写入范围。报错给出占用者和冲突路径。已有任务重新划分写入范围时需更新 brief 与保存的范围，或另建新任务。

工作树基于入口仓库，缺入口才由写入路径推断。合回并推送后用 `fleet-go worktree prune` 清理本单工作树与本地分支。未合回时保留并记录释放条件。已清理的任务需要续做时，按提示用 `fleet-go worktree recreate`，手工基线可用 `--base`。

## 重派与续做

`fleet-go relaunch` 按任务名沿用 brief、报告和档位；同名在途任务先处理，跨日期重名按提示指定 brief 路径。默认重新读取保存的正文文件，保留当前拼装内容用 `--keep-brief`。再次指定 `--to gpt` 不会自动重置旧档，回到 Terra 用 `--simple`。

`fleet-go amend` 添加修订。加 `--say` 时在途任务收到插话，终态任务按修订重派。`--restart` 只在证实目标 run 已停止后启动新 run。修改授权、动作和模型参数时核对保存的元数据；插话不会切换正在运行的模型。调遣令停用会拦截启动或重派，经授权可用 `--override-order` 并记录理由。

具名验收的 Codex 自动续做只处理本单明确「未过」项，并检查新提交、验收表变化或日志进展；外部或下游依赖与换班由对应 owner 接手。缺报告行先复核。旧 brief 保留兼容闸门。可用 `FLEET_NO_CONTINUE=1` 关闭自动续做。

## 发布适配器

使用 `fleet land` 的项目从运行时适配器读取 `requireMainClone`、`requirePush` 和 `pipelineMode`（`trigger` 或 `watch`）。检查、流水线和回读由适配器提供。派单前在项目场景确认实际目标、适配器及发布授权。

## 执行位置与读回

默认远端执行，参数仍用 `--on mini`。远端不可用时补齐路径、同步或工具。确需本机用 `--on local` 并传 `--local-reason`。配置用 `FLEET_MINI_HOME` 和 `FLEET_MINI_BIN`，或在 `~/.agent-fleet/mini.json` 用 `remote_home`、`bin`、`local_home`、`mm`、`hostname`。环境变量优先。远端执行机设置 `FLEET_MACHINE=mini`，或设置 `FLEET_MINI_HOSTNAME` / 配置 `hostname` 以识别本机。

`fleet-go status` 默认显示非终态和最近一小时任务，`--all` 看全部历史。远端状态取不到时检查 stderr。`fleet-go read` 按任务名读取报告，选 `--report`、`--result` 或 `--log`，可加 `--head` 或 `--pull`。机器汇总看 `fleet status --running --json`，历史汇总看 [账本](ledger.md)。

编码池、轻量池分别按 `FLEET_CODE_CAPACITY`、`FLEET_LIGHT_CAPACITY` 排队，也可用 `FLEET_SLOT_CAPACITY` 设置共用上限。额度限频看 `FLEET_CODEX_QUOTA_LIMIT` 和调遣令。只有在确认旧进程及写入状态后才重派占用同一工作树的任务。
