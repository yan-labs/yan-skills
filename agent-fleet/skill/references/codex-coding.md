# Codex 编程与 review

## 执行

```bash
fleet-go new task --to gpt --auth local --goal "完成编码任务" --body brief.md
# 以下为底层短命令
fleet code brief.md --cwd <项目目录>
fleet code brief.md --low --cwd <项目目录>
fleet code brief.md --review --cwd <项目目录>
```

选 Terra、Sol 还是 Luna 见 [路由原则](../SKILL.md#路由原则长期)；参数互斥关系见 [fleet-go 派单参考](fleet-go.md#执行者与档位)。

底层模型：默认 `terra`，`--sol` 用 Sol，`--luna` 用 `luna`，`--astra` 用 Astra；路由见[工具链](fallback-chains.md)。sandbox 一律 `danger-full-access`，review 的只读靠提示词约定。`relaunch`、`amend` 与 `resume` 沿用已保存的档位。本机 Codex CLI 须 ≥ 0.159.0（更旧的版本调用当前默认模型会被服务端拒绝）；升级前确认其他 Codex 任务都已结束。

Codex 不可用或并发满时，编码按[工具链](fallback-chains.md)换手。

## 中途插话与续跑

```bash
fleet say <任务短名或 run-id> "只写到 3 并停止"
fleet-go amend <name> "补充要求" --say
fleet resume <异常中断的任务> "继续完成剩余工作"
```

`FLEET_CODEX_BACKEND` 可取 `app-server`（默认优先模式，失败时仍可降级）或 `exec`（直接使用原执行器）；例如 `FLEET_CODEX_BACKEND=exec fleet code brief.md`。review 同样优先 app-server；resume 沿用 exec。

运行中的 app-server 任务仍会显示在 Codex APP；任务终态及异常退出清理时仅归档该任务的 threadId，保留历史。归档失败只记降级，verdict 保持原判定。Codex 0.162.0 的归档线程须先取消归档再 resume；fleet 会先取消归档、续跑结束后再归档。

每个 `fleet code` 任务优先启动独立 `codex app-server`，仅用 stdio，服务和通信限定在该任务的 stdio。`say` 在同一 thread/当前 turn 上调用 `turn/steer`；初始化期间先排队。简报保存 threadId、执行模式、steer/resume 次数与降级记录。`resume` 根据 threadId/sessionId 开新 run，沿用 cwd、simple/luna/low/high/xhigh/max/review、name/report。

app-server 启动或握手失败时退回原 `codex exec`；已有会话的 steer 被拒时，先 SIGINT 并等待当前执行结束，再 `codex exec resume` 同一会话（新一轮）。没有可续跑会话或续跑不可用时，明确提示改用 `fleet-go amend --restart`。exec 兜底始终保留；`--review` 的 app-server 与 exec（含 resume）均使用 `danger-full-access`；项目只读依靠提示约定，不以沙箱限制联网、临时脚本和测试。

steer 被接受不等于立即执行，插话无法撤销已经完成的文件写入；结束后仍要核验产物。旧记录需有 threadId/sessionId 才能 resume。server 异常退出且无法确认旧工具已结束时，会保守拒绝续跑并提示 `--restart`；执行器仍活着时沿用当前会话。

## 阶段接力与等待

预计超过 2 小时且 brief 没有阶段时，用 `fleet plan --file <计划文件>` 记录每阶段范围和完成条件，提交后直接继续。阶段边界用 `fleet handoff --next <第一动作> --file <五项交接单>`：记录已完成及证据、决定及理由、未决与外部事项、坑与勿重做、下一步；app-server 和 exec 都自动开启新 thread，读取原始 brief、修订和最新交接单接着做。计划、交接和目标核对不等待批准；偏差自行对照原始目标纠正，主线程可随时 `fleet say` / `fleet-go amend --say`。

只有真实授权缺口（付费、生产写入、不可逆操作未获授权）或必需输入缺失才停下求助；构建排队、runner 忙、流水线运行等条件沿用 `fleet park` 等待，不当作缺授权。计划与交接保存在 run 日志和 stages/yield 记录中。

`fleet wait` 持续等待真正终态；ask 会醒目标出 runId、问题及答复命令，保持等待，不返回退出码 3。运行中、排队、park 和心跳异常但进程仍活着都不是终态；`--timeout` 只结束本次等待，任务仍继续。Codex app-server 只按本 run 的 threadId 消费回合、结果和 token 用量，子线程完成不会结束主任务。

## 额外 review

哪些任务必须复核按全局 `~/.claude/CLAUDE.md` §4.3 的风险分档，派法见[派单纪律 · 独立复核](dispatch-discipline.md#独立复核)。审查发现实际问题后修复并重跑受影响的检查。执行者运行 brief 要求和目标必需的已有测试；新增测试或防护代码以正文授权和目标必需为准。

## 可直接使用的 review 提示词

```text
你是独立 reviewer，自己完成本次范围内的只读审查，项目文件保持原样。允许联网、运行测试和脚本，只在自己的 mktemp -d 临时目录建删文件；只读是 brief 约定，不是工具或沙箱限制。
目标：判断本次任务的最终产物是否满足需求，有没有需要修复的实际问题。
允许读取：<精确文件/最终 diff/测试记录>。
上下文与边界：<真实用户、部署方式、数据来源、已存在的权限防护>。

只报告高置信且可达的问题：具体输入或正常操作/合理的滥用路径，如何经过现有代码触发，造成什么实际影响，文件与行号或产物证据，最小修复办法。
优先正确性、数据完整性、真实权限边界和用户流程。安全问题必须说明信任边界与触发条件；从攻击者当前真实权限出发验证完整路径，按现有防护核对可达性；管理员权限或运行环境控制须有已取得的证据，尚未取得的权限不能当作新漏洞的起点。
概率仅采用可核实证据。低频但可达且会导致重大泄露、越权或数据丢失的问题仍要报告。
阻断问题须有实际证据、可达路径和当前影响；猜测、纯防御加固、风格偏好、未来扩展、连锁假设、额外架构或安全系统留在本次审查范围之外。
最多三条关键问题，每条最多三行：严重程度；位置+触发条件+影响；最小修复。超过三条时仍明确剩余真实问题数量和是否需要后续查看，保证所有阻断问题均有记录。
实际问题为零时只回复“通过：未发现需要修复的实际问题。”。
```

## 归档补扫

运行中的 app-server 任务会显示在 Codex APP，结束后自动归档；派单入口还会在后台补扫漏归档的线程（`FLEET_NO_ARCHIVE_SWEEP=1` 关闭）。只归档 `originator=agent_fleet`、已结束且闲置至少 10 分钟的线程，可用 `thread/unarchive` 回滚。需要手动补扫时：

```sh
node <agent-fleet 目录>/bin/fleet-archive-sweep.mjs [--dry-run] [--json] [--min-idle-minutes 10]
```
